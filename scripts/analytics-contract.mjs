import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

// Browser policy tests, not an ingestion test. Every network request is mocked.
// No fixtures, credentials, or artificial pageviews reach Cloudflare.
const origin = 'https://analytics-contract.test';
const collector = 'https://cloudflareinsights.com/cdn-cgi/rum';
const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
let globalRule = false;
const policies = [];
for (const line of headers.split(/\r?\n/)) {
  if (line && !/^(\s|#)/.test(line)) globalRule = line.trim() === '/*';
  if (globalRule && /^\s+Content-Security-Policy:/i.test(line)) {
    policies.push(line.replace(/^\s+Content-Security-Policy:\s*/i, '').trim());
  }
}
assert.equal(policies.length, 1, 'Expected one global enforcing CSP in built _headers');
const policy = policies[0];
const metaPolicy = policy.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('frame-ancestors ')).join('; ');
let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
});
after(async () => { await browser?.close(); });

async function inspectPolicy(scriptPath, asMeta = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const posts = [];
    await page.addInitScript(`window.__violations = [];
      addEventListener('securitypolicyviolation', e => window.__violations.push(e.blockedURI));`);
    await context.route('**/*', async route => {
      const request = route.request();
      const url = request.url();
      if (url === `${origin}/`) {
        const escaped = metaPolicy.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
        await route.fulfill({ contentType: 'text/html',
          headers: asMeta ? {} : { 'Content-Security-Policy': policy },
          body: `<!doctype html><meta charset="utf-8">
            ${asMeta ? `<meta http-equiv="Content-Security-Policy" content="${escaped}">` : ''}
            <script src="/first-party.js" defer></script>
            <script src="https://static.cloudflareinsights.com${scriptPath}" defer></script>
            <script src="https://untrusted.invalid/script.js" defer></script>
            <script>window.__inlineExecuted = true;</script><p>Policy fixture</p>` });
      } else if (url === `${origin}/first-party.js`) {
        await route.fulfill({ contentType: 'text/javascript', body: 'window.__firstPartyLoaded = true;' });
      } else if (new URL(url).origin === 'https://static.cloudflareinsights.com') {
        await route.fulfill({ contentType: 'text/javascript', body: `
          window.__beaconLoads = (window.__beaconLoads || 0) + 1;
          Promise.all([fetch('/cdn-cgi/rum', { method: 'POST', body: 'fixture' }),
            fetch('${collector}', { method: 'POST', body: 'fixture' })])
            .then(rs => { window.__delivered = rs.every(r => r.status === 204); })
            .catch(() => { window.__delivered = false; });` });
      } else if (url === collector || url === `${origin}/cdn-cgi/rum`) {
        assert.equal(request.method(), 'POST');
        posts.push(url);
        await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin } });
      } else if (url === 'https://untrusted.invalid/script.js') {
        await route.fulfill({ contentType: 'text/javascript', body: 'window.__untrustedExecuted = true;' });
      } else {
        await route.abort();
      }
    });
    await page.goto(`${origin}/`);
    await page.waitForFunction('window.__delivered !== undefined', undefined, { timeout: 5000 });
    const state = await page.evaluate(`({ firstParty: window.__firstPartyLoaded,
      loads: window.__beaconLoads, delivered: window.__delivered,
      inline: !!window.__inlineExecuted, untrusted: !!window.__untrustedExecuted,
      violations: window.__violations })`);
    assert.equal(state.firstParty, true);
    assert.equal(state.loads, 1);
    assert.equal(state.delivered, true, 'CSP blocked a supported collector');
    assert.deepEqual(posts.sort(), [`${origin}/cdn-cgi/rum`, collector].sort());
    assert.equal(state.inline, false, 'Unexpected inline JavaScript execution');
    assert.equal(state.untrusted, false, 'Unexpected third-party JavaScript execution');
    assert(state.violations.includes('inline'));
    assert(state.violations.some(v => v.startsWith('https://untrusted.invalid')));
    if (asMeta) {
      const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
      const actual = await page.evaluate(source => {
        const doc = new DOMParser().parseFromString(source, 'text/html');
        const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const script = doc.querySelector('script');
        return { policy: meta?.content, beforeScripts: !!meta && (!script || !!(meta.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING)) };
      }, html);
      assert.equal(actual.policy?.split(';').map(s => s.trim()).filter(Boolean).join('; '), metaPolicy);
      assert(actual.beforeScripts, 'CSP meta must precede scripts on GitHub Pages');
    }
  } finally {
    await context.close();
  }
}

test('unversioned beacon: both collectors allowed; inline and unrelated scripts blocked', async () => {
  await inspectPolicy('/beacon.min.js');
});
test('versioned beacon: both collectors allowed; inline and unrelated scripts blocked', async () => {
  await inspectPolicy('/beacon.min.js/vcontract');
});
if (process.env.ANALYTICS_REQUIRE_META_CSP === 'true') {
  test('GitHub Pages meta policy matches headers and is enforced before scripts', async () => {
    await inspectPolicy('/beacon.min.js', true);
  });
}
