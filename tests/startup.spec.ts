import { expect, test, type Page } from "@playwright/test";

type StartupRun = {
  shown: number;
  hidden?: number;
  ended?: number;
  duration: number;
  variant: string;
  fits: boolean;
  decorative: boolean;
  textFree: boolean;
  flat: boolean;
  hashes: number[];
  colorCounts: number[];
  accentPixels: number;
  accentVisible: boolean;
  surfacePixels: number;
  palette: { colors: Record<string, number[]>; expected: Record<string, number[]>; theme: string };
};
type StartupTimeline = { documentId: number; runs: StartupRun[]; textDraws: number };

async function observeStartup(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as Window & { __startupTimeline: StartupTimeline };
    const timeline: StartupTimeline = { documentId: Math.random(), runs: [], textDraws: 0 };
    state.__startupTimeline = timeline;
    for (const method of ["fillText", "strokeText"] as const) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args: Parameters<typeof original>) {
        if (this.canvas instanceof HTMLCanvasElement && this.canvas.matches(".startup__canvas")) timeline.textDraws++;
        original.apply(this, args);
      };
    }
    new MutationObserver(() => {
      const run = timeline.runs.at(-1);
      if (run && run.hidden === undefined && document.querySelector<HTMLElement>("[data-startup]")?.hidden) {
        run.hidden = performance.now();
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("startup:end", () => {
      const run = timeline.runs.at(-1);
      if (run) run.ended = performance.now();
    }, true);
    document.addEventListener("startup:begin", (event) => {
      const root = event.target as HTMLElement;
      const canvas = root.querySelector<HTMLCanvasElement>(".startup__canvas")!;
      const bounds = root.getBoundingClientRect();
      const pixel = document.createElement("canvas").getContext("2d")!;
      const rgba = (color: string) => {
        pixel.clearRect(0, 0, 1, 1);
        pixel.fillStyle = color;
        pixel.fillRect(0, 0, 1, 1);
        return Array.from(pixel.getImageData(0, 0, 1, 1).data);
      };
      const colors: Record<string, number[]> = {};
      const expected: Record<string, number[]> = {};
      const probe = document.createElement("i");
      probe.hidden = true;
      root.append(probe);
      for (const [name, variable] of Object.entries({ canvas: "canvas", surface: "surface", soft: "surface-soft", strong: "surface-strong", line: "line", accent: "accent" })) {
        const entry = root.querySelector<HTMLElement>(`[data-startup-color="${name}"]`)!;
        colors[name] = rgba(getComputedStyle(entry).color);
        probe.style.color = `var(--${variable})`;
        expected[name] = rgba(getComputedStyle(probe).color);
      }
      probe.remove();
      const run: StartupRun = {
        shown: performance.now(),
        duration: (event as CustomEvent).detail.duration,
        variant: (event as CustomEvent).detail.variant,
        fits: bounds.left >= -1 && bounds.top >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
        decorative: root.getAttribute("aria-hidden") === "true" && getComputedStyle(root).pointerEvents === "none",
        textFree: !root.textContent?.trim() && !root.querySelector("text, image, .startup__mark"),
        flat: root.querySelectorAll("canvas").length === 1 && Boolean(canvas.getContext("2d")),
        hashes: [],
        colorCounts: [],
        accentPixels: 0,
        accentVisible: false,
        surfacePixels: 0,
        palette: { colors, expected, theme: document.documentElement.dataset.theme! }
      };
      timeline.runs.push(run);
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 120;
      sampleCanvas.height = 80;
      const context = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
      context.imageSmoothingEnabled = false;
      const phases = [100, 450, 750];
      const sample = () => {
        if (root.hidden || timeline.runs.at(-1) !== run) return;
        if (performance.now() - run.shown >= phases[run.hashes.length]) {
          context.clearRect(0, 0, 120, 80);
          context.drawImage(canvas, 0, 0, 120, 80);
          const pixels = context.getImageData(0, 0, 120, 80).data;
          let hash = 0;
          let accentPixels = 0;
          let surfacePixels = 0;
          const distinct = new Set<number>();
          for (let i = 0; i < pixels.length; i += 4) {
            hash = Math.imul(hash, 31) + pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536 + pixels[i + 3] | 0;
            if (pixels[i + 3] > 128) {
              distinct.add((pixels[i] >> 3) * 1024 + (pixels[i + 1] >> 3) * 32 + (pixels[i + 2] >> 3));
              if (colors.accent.slice(0, 3).every((channel, index) => Math.abs(channel - pixels[i + index]) < 24)) accentPixels++;
              if ([colors.canvas, colors.surface, colors.soft, colors.strong].some((color) => color.slice(0, 3).every((channel, index) => Math.abs(channel - pixels[i + index]) < 24))) surfacePixels++;
            }
          }
          run.accentVisible ||= accentPixels > 0;
          if (!run.accentVisible) {
            // Thin accent strokes can fall between the coarse sample's pixels.
            const full = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 0; i < full.length; i += 4) {
              if (full[i + 3] > 128 && Math.abs(colors.accent[0] - full[i]) < 24
                && Math.abs(colors.accent[1] - full[i + 1]) < 24 && Math.abs(colors.accent[2] - full[i + 2]) < 24) {
                run.accentVisible = true;
                break;
              }
            }
          }
          run.hashes.push(hash);
          run.colorCounts.push(distinct.size);
          run.accentPixels = Math.max(run.accentPixels, accentPixels);
          run.surfacePixels = Math.max(run.surfacePixels, surfacePixels);
          run.fits &&= document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
          const canvasBounds = canvas.getBoundingClientRect();
          run.fits &&= Math.abs(canvasBounds.width - innerWidth) <= 1 && Math.abs(canvasBounds.height - innerHeight) <= 1;
          for (const element of [root, ...root.querySelectorAll("*")]) {
            const style = getComputedStyle(element);
            run.flat &&= style.perspective === "none" && style.transformStyle !== "preserve-3d"
              && (style.transform === "none" || new DOMMatrixReadOnly(style.transform).is2D);
          }
        }
        if (run.hashes.length < phases.length) requestAnimationFrame(sample);
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
  const timeline = await readTimeline(page);
  const run = timeline.runs.at(-1)!;
  expect(run.duration).toBe(1000);
  expect(run.ended).toBeDefined();
  expect(run.hidden! - run.shown).toBeGreaterThanOrEqual(850);
  expect(run.hidden! - run.shown).toBeLessThan(1250);
  expect(run.fits).toBe(true);
  expect(run.decorative).toBe(true);
  expect(run.textFree).toBe(true);
  expect(timeline.textDraws).toBe(0);
  expect(run.flat).toBe(true);
  expect(run.hashes).toHaveLength(3);
  expect(new Set(run.hashes).size).toBe(3);
  expect(Math.max(...run.colorCounts)).toBeGreaterThan(4);
  expect(run.surfacePixels).toBeGreaterThan(120 * 80 * 0.65);
  expect(run.accentVisible).toBe(true);
  expect(run.accentPixels).toBeLessThan(120 * 80 * 0.2);
  expect(run.palette.colors).toEqual(run.palette.expected);
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

test("a delayed animation download never starts during navigation", async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requested = false;
  await page.route("**/StartupAnimation.*.js", async (route) => {
    requested = true;
    await delayed;
    await route.continue();
  });
  await observeStartup(page);
  await page.goto("/", { waitUntil: "commit" });
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-startup]")).toBeHidden();
  const first = await readTimeline(page);
  const navigating = page.evaluate(() => new Promise<void>((resolve) => {
    document.addEventListener("astro:before-preparation", () => resolve(), { once: true });
  }));
  const settled = page.evaluate(() => new Promise<void>((resolve) => {
    document.addEventListener("astro:page-load", () => resolve(), { once: true });
  }));
  await page.getByRole("link", { name: "View projects", exact: true }).click({ noWaitAfter: true });
  await navigating;
  release();
  await settled;
  await expect(page).toHaveURL(/\/work\/$/);
  await expect(page.getByRole("heading", { name: "Selected work", level: 1 })).toBeVisible();
  expect(await readTimeline(page)).toEqual(first);
  await expect(page.locator("[data-startup]")).toBeHidden();
  // A working replay proves the delayed module initialized after navigation.
  await page.getByRole("button", { name: "Open debug menu" }).click();
  await page.locator("[data-startup-replay]").click();
  await finishStartup(page, 1);
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
      expect(palettes[0].colors.surface).not.toEqual(palettes[1].colors.surface);
      expect(palettes[0].colors.accent).not.toEqual(palettes[1].colors.accent);
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
