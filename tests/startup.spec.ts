import { expect, test, type Page } from "@playwright/test";

type StartupRun = {
  shown: number;
  hidden?: number;
  duration?: string;
  maxEnd?: number;
  fits: boolean;
  decorative: boolean;
  visualSamples: number;
  textFree: boolean;
  flat: boolean;
  patterned: boolean;
  transforms: string[];
  echoVisible: boolean;
  palette?: { background: number[]; canvas: number[]; signal: number[]; accent: number[]; texture: string; reflection: string; theme: string };
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
        decorative: root!.getAttribute("aria-hidden") === "true" && getComputedStyle(root!).pointerEvents === "none",
        visualSamples: 0,
        textFree: true,
        flat: true,
        patterned: false,
        transforms: [],
        echoVisible: false
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
      const root = event.target;
      const probe = document.createElement("i");
      probe.style.cssText = "display:none;background:var(--canvas);color:var(--accent)";
      root.append(probe);
      const native = getComputedStyle(probe);
      const context = document.createElement("canvas").getContext("2d")!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      };
      const reflection = root.querySelector(".startup__reflection")!;
      run.palette = {
        background: rgba(getComputedStyle(root).backgroundColor),
        canvas: rgba(native.backgroundColor),
        signal: rgba(getComputedStyle(reflection).color),
        accent: rgba(native.color),
        texture: getComputedStyle(root.querySelector(".startup__texture")!).backgroundImage,
        reflection: getComputedStyle(reflection, "::before").backgroundImage,
        theme: document.documentElement.dataset.theme!
      };
      probe.remove();
      const phases = [100, 450, 750];
      const sample = () => {
        if (root.hidden || timeline.runs.at(-1) !== run) return;
        if (performance.now() - run.shown >= phases[run.visualSamples]) {
          run.visualSamples++;
          run.transforms.push(getComputedStyle(reflection, "::before").transform);
          const echo = root.querySelector(".startup__echo");
          if (echo) run.echoVisible ||= getComputedStyle(echo).maskImage === getComputedStyle(reflection).maskImage
            && getComputedStyle(echo).maskImage !== "none" && Number(getComputedStyle(echo, "::before").opacity) > 0;
          run.textFree &&= !root.textContent?.trim() && !root.querySelector("text, image, .startup__mark");
          for (const element of [root, ...root.querySelectorAll("*")]) {
            for (const pseudo of [null, "::before", "::after"]) {
              const style = getComputedStyle(element, pseudo);
              run.textFree &&= ["none", "normal", '""'].includes(style.content);
              run.flat &&= style.perspective === "none" && style.transformStyle !== "preserve-3d"
                && (style.transform === "none" || new DOMMatrixReadOnly(style.transform).is2D)
                && style.translate.split(" ").length <= 2 && style.scale.split(" ").length <= 2
                && !/^(x|y|[-\d.]+\s)/.test(style.rotate);
            }
          }
          const texture = root.querySelector(".startup__texture");
          if (texture) {
            const style = getComputedStyle(texture);
            const bounds = texture.getBoundingClientRect();
            const patternedBackground = style.backgroundImage !== "none"
              && (style.maskImage !== "none" || style.backgroundImage.includes("repeating-"));
            const patternedSvg = Boolean(texture.querySelector("pattern") && texture.querySelector('[fill^="url("], [mask^="url("]'));
            run.patterned ||= bounds.width > 0 && bounds.height > 0 && Number(style.opacity) > 0
              && style.visibility === "visible" && (patternedBackground || patternedSvg);
          }
        }
        if (run.visualSamples < phases.length) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, true);
  });
}

async function readTimeline(page: Page) {
  return page.evaluate(() => (window as unknown as Window & { __startupTimeline: StartupTimeline }).__startupTimeline);
}

async function finishStartup(page: Page, count: number) {
  await expect(page.locator("[data-startup]")).toBeHidden();
  await expect.poll(async () => (await readTimeline(page)).runs.filter((run) => run.hidden !== undefined).length).toBe(count);
  const run = (await readTimeline(page)).runs.at(-1)!;
  expect(run.duration).toBe("1s");
  expect(run.maxEnd).toBeLessThanOrEqual(1000);
  expect(run.hidden! - run.shown).toBeGreaterThanOrEqual(850);
  expect(run.hidden! - run.shown).toBeLessThan(1250);
  expect(run.fits).toBe(true);
  expect(run.decorative).toBe(true);
  expect(run.visualSamples).toBe(3);
  expect(run.textFree).toBe(true);
  expect(run.flat).toBe(true);
  expect(run.patterned).toBe(true);
  expect(new Set(run.transforms).size).toBeGreaterThan(1);
  expect(run.echoVisible).toBe(true);
  expect(run.palette!.background).toEqual(run.palette!.canvas);
  expect(run.palette!.signal).toEqual(run.palette!.accent);
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

test("startup follows saved themes and live accent controls for every pattern", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await observeStartup(page);
  await page.goto("/");
  await finishStartup(page, 1);
  let count = 1;
  for (const theme of ["light", "black"]) {
    while (await page.locator("html").getAttribute("data-theme-mode") !== theme) {
      await page.locator("[data-theme-toggle]").evaluate((node: HTMLButtonElement) => node.click());
    }
    await page.getByRole("button", { name: "Open debug menu" }).click();
    for (const variant of ["lattice", "aperture", "flux"]) {
      const palettes = [];
      for (const accent of ["#db752b", "#7557d6"]) {
        await page.locator("[data-accent-input]").evaluate((node: HTMLInputElement, value) => {
          node.value = value;
          node.dispatchEvent(new Event("input", { bubbles: true }));
        }, accent);
        await page.locator(`[data-startup-variant='${variant}']`).click();
        await finishStartup(page, ++count);
        palettes.push((await readTimeline(page)).runs.at(-1)!.palette!);
      }
      expect(palettes[0].texture).not.toBe(palettes[1].texture);
      expect(palettes[0].reflection).not.toBe(palettes[1].reflection);
      expect(palettes[1].theme).toBe(theme);
    }
    const saved = (await readTimeline(page)).runs.at(-1)!.palette;
    await page.reload();
    await finishStartup(page, 1);
    count = 1;
    expect((await readTimeline(page)).runs.at(-1)!.palette).toEqual(saved);
  }
  await page.locator("[data-theme-toggle]").evaluate((node: HTMLButtonElement) => node.click());
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "system");
  await page.reload();
  await finishStartup(page, 1);
  expect((await readTimeline(page)).runs.at(-1)!.palette!.theme).toBe("black");
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
