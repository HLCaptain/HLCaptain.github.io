import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("the built page preserves CSP parity and saved theme", async ({ page }) => {
  const headers = readFileSync("dist/_headers", "utf8");
  const policy = headers.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1];
  if (!policy) throw new Error("Missing built Content-Security-Policy");
  const metaPolicy = policy.split(";").map(value => value.trim())
    .filter(value => value && !value.startsWith("frame-ancestors ")).join("; ");
  await page.route("https://static.cloudflareinsights.com/**", route => route.abort());
  await page.addInitScript(() => localStorage.setItem("hlcaptain-theme", "black"));
  await page.goto("/");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'))
    .toHaveAttribute("content", metaPolicy);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
  await expect(page.locator('script[src="/scripts/site-preferences.js"]')).toHaveCount(1);
});
