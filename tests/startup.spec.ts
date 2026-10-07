import { expect, test, type Page } from "@playwright/test";

type StartupRun = {
  shown: number;
  hidden?: number;
  duration?: string;
  maxEnd?: number;
  fits: boolean;
  decorative: boolean;
};
type StartupTimeline = { documentId: number; runs: StartupRun[] };

async function observeStartup(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as Window & { __startupTimeline: StartupTimeline };
    const timeline: StartupTimeline = { documentId: Math.random(), runs: [] };
    state.__startupTimeline = timeline;
    let active = false;
    const observe = () => {
      const root = document.querySelector<HTMLElement>("[data-startup]");
      const shown = Boolean(root && !root.hidden);
      if (shown === active) return;
      active = shown;
      if (!shown) {
        timeline.runs.at(-1)!.hidden = performance.now();
        return;
      }
      const bounds = root!.getBoundingClientRect();
      timeline.runs.push({
        shown: performance.now(),
        fits: bounds.left >= -1 && bounds.top >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
        decorative: root!.getAttribute("aria-hidden") === "true" && getComputedStyle(root!).pointerEvents === "none"
      });
    };
    new MutationObserver(observe).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("animationstart", (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-startup]") || event.animationName !== "startup-exit") return;
      const run = timeline.runs.at(-1);
      if (!run) return;
      run.duration = getComputedStyle(event.target).animationDuration;
      run.maxEnd = Math.max(...event.target.getAnimations({ subtree: true }).map((animation) => Number(animation.effect!.getComputedTiming().endTime)));
      run.fits &&= document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    }, true);
  });
}

async function readTimeline(page: Page) {
  return page.evaluate(() => (window as unknown as Window & { __startupTimeline: StartupTimeline }).__startupTimeline);
}

async function finishStartup(page: Page, count: number) {
  await expect.poll(async () => (await readTimeline(page)).runs.filter((run) => run.hidden !== undefined).length).toBe(count);
  await expect(page.locator("[data-startup]")).toBeHidden();
  const run = (await readTimeline(page)).runs.at(-1)!;
  expect(run.duration).toBe("1s");
  expect(run.maxEnd).toBeLessThanOrEqual(1000);
  expect(run.hidden! - run.shown).toBeGreaterThanOrEqual(850);
  expect(run.hidden! - run.shown).toBeLessThan(1250);
  expect(run.fits).toBe(true);
  expect(run.decorative).toBe(true);
}

async function navigateAndSettle(page: Page, action: () => Promise<unknown>) {
  const loaded = page.evaluate(() => new Promise<void>((resolve) => {
    document.addEventListener("astro:page-load", () => resolve(), { once: true });
  }));
  await action();
  await loaded;
}

test("plays a one-second startup only on full document loads", async ({ page }) => {
  await observeStartup(page);
  await page.goto("/");
  await finishStartup(page, 1);
  await expect(page.locator("[data-startup]")).toHaveAttribute("data-variant", "lattice");
  const first = await readTimeline(page);

  await navigateAndSettle(page, () => page.getByRole("link", { name: "View projects", exact: true }).click());
  await expect(page).toHaveURL(/\/work\/$/);
  await navigateAndSettle(page, () => page.goBack());
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => { location.hash = "main-content"; });
  await expect(page).toHaveURL(/\/#main-content$/);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await readTimeline(page)).toEqual(first);
  await expect(page.locator("[data-startup]")).toBeHidden();

  await page.reload();
  await finishStartup(page, 1);
  expect((await readTimeline(page)).documentId).not.toBe(first.documentId);
});

test("preview controls replay all three alternatives and preserve the selection", async ({ page }) => {
  await observeStartup(page);
  await page.goto("/");
  await finishStartup(page, 1);
  await page.getByRole("button", { name: "Open debug menu" }).click();
  await expect(page.locator("[data-startup-variant]")).toHaveCount(3);
  let count = 1;
  for (const variant of ["lattice", "aperture", "flux"]) {
    const choice = page.locator(`[data-startup-variant='${variant}']`);
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-startup]")).toHaveAttribute("data-variant", variant);
    expect(await page.evaluate(() => localStorage.getItem("hlcaptain-startup-variant"))).toBe(variant);
    await finishStartup(page, ++count);
  }
  await page.locator("[data-startup-replay]").click();
  await finishStartup(page, ++count);
  await page.reload();
  await finishStartup(page, 1);
  await expect(page.locator("[data-startup]")).toHaveAttribute("data-variant", "flux");
  await page.getByRole("button", { name: "Open debug menu" }).click();
  await expect(page.locator("[data-startup-variant='flux']")).toHaveAttribute("aria-pressed", "true");
});

test("reduced motion skips startup and preview replays", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await observeStartup(page);
  await page.goto("/");
  await expect(page.locator("[data-startup]")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Open debug menu" }).click();
  await page.locator("[data-startup-variant='aperture']").click();
  await page.locator("[data-startup-replay]").click();
  await expect(page.locator("[data-startup]")).toBeHidden();
  expect((await readTimeline(page)).runs).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("keeps site content visible without a startup overlay", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-startup]")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "View projects", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.getByRole("heading", { name: "Selected work", level: 1 })).toBeVisible();
    await expect(page.locator("[data-startup]")).toBeHidden();
  });
});
