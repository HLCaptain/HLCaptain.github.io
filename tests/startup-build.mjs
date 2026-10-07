import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const dist = new URL("../dist/", import.meta.url);
const routes = readdirSync(dist, { recursive: true }).filter((file) => file.endsWith(".html")).sort();
const preview = process.env.PUBLIC_SITE_PREVIEW === "true";
assert.ok(routes.length, "Build the site before checking its startup shell");

for (const route of routes) {
  test(`${preview ? "preview" : "production"} startup shell: ${route}`, () => {
    const html = readFileSync(new URL(route, dist), "utf8");
    const tags = html.match(/<(?:div|button|section)\b[^>]*>/g) ?? [];
    const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
    const startup = tags.filter((tag) => has(tag, "data-startup"));
    assert.equal(startup.length, 1, "exactly one startup root");
    assert.ok(has(startup[0], "hidden"), "startup is hidden before JavaScript runs");
    assert.match(startup[0], /\saria-hidden="true"/, "startup is decorative");
    assert.match(startup[0], /\sdata-astro-transition-persist="startup"/, "startup persists across Astro navigation");

    const buttons = tags.filter((tag) => tag.startsWith("<button"));
    const choices = buttons.filter((tag) => has(tag, "data-startup-variant"));
    if (preview) {
      assert.match(startup[0], /\sdata-preview="true"/);
      assert.equal(buttons.filter((tag) => has(tag, "data-debug-toggle")).length, 1);
      assert.equal(choices.length, 3);
      for (const variant of ["lattice", "aperture", "flux"]) {
        assert.equal(choices.filter((tag) => tag.includes(`data-startup-variant="${variant}"`)).length, 1);
      }
      assert.equal(buttons.filter((tag) => has(tag, "data-startup-replay")).length, 1);
    } else {
      assert.doesNotMatch(startup[0], /\sdata-preview="true"/);
      assert.equal(buttons.filter((tag) => /\sdata-(?:debug|startup)-/.test(tag)).length, 0, "production excludes debug buttons and startup controls");
      assert.equal(tags.filter((tag) => tag.startsWith("<section") && has(tag, "data-debug-panel")).length, 0);
    }
  });
}
