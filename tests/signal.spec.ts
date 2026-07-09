import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
}

async function setSignalOption(page: Page, name: string, attribute: "layout" | "ratio", value: string) {
  const panel = page.locator("[data-debug-panel]");
  if (await panel.evaluate((node: HTMLElement) => node.hidden)) {
    await page.getByRole("button", { name: "Open debug menu" }).click();
  }
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(`data-signal-${attribute}`, value);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

async function closeDebugPanel(page: Page) {
  const panel = page.locator("[data-debug-panel]");
  if (!(await panel.evaluate((node: HTMLElement) => node.hidden))) {
    await page.getByRole("button", { name: "Close debug menu" }).click();
  }
  await expect(panel).toBeHidden();
}

type SignalGeometry = {
  signal: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  panel: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  content: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  media: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  copy: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  columns: number;
  columnGap: number;
  rowGap: number;
  panelPadding: { top: number; right: number; bottom: number; left: number };
  copyPadding: { top: number; right: number; bottom: number; left: number };
};

async function measureSignal(page: Page): Promise<SignalGeometry> {
  const signal = page.locator("[data-signal]");
  const active = signal.locator("[data-signal-item].is-active");
  const panel = active.locator("[data-signal-panel]");
  const content = active.locator(".signal__content");
  const media = active.locator(".signal__media");
  const copy = active.locator(".signal__copy");
  const [signalBox, panelBox, contentBox, mediaBox, copyBox, styles] = await Promise.all([
    signal.boundingBox(),
    panel.boundingBox(),
    content.boundingBox(),
    media.boundingBox(),
    copy.boundingBox(),
    content.evaluate((node) => {
      const contentStyle = getComputedStyle(node);
      const panelStyle = getComputedStyle(node.parentElement!);
      const copyStyle = getComputedStyle(node.querySelector(".signal__copy")!);
      const number = (value: string) => Number.parseFloat(value) || 0;
      const padding = (style: CSSStyleDeclaration) => ({
        top: number(style.paddingTop),
        right: number(style.paddingRight),
        bottom: number(style.paddingBottom),
        left: number(style.paddingLeft)
      });
      return {
        columns: contentStyle.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
        columnGap: number(contentStyle.columnGap),
        rowGap: number(contentStyle.rowGap),
        panelPadding: padding(panelStyle),
        copyPadding: padding(copyStyle)
      };
    })
  ]);

  if (!signalBox || !panelBox || !contentBox || !mediaBox || !copyBox) {
    throw new Error("Signal geometry is unavailable");
  }

  return {
    signal: signalBox,
    panel: panelBox,
    content: contentBox,
    media: mediaBox,
    copy: copyBox,
    ...styles
  };
}

function expectInside(inner: SignalGeometry["media"], outer: SignalGeometry["content"]) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

async function sampleHeight(locator: Locator, duration: number) {
  return locator.evaluate(
    (node, sampleDuration) =>
      new Promise<number[]>((resolve) => {
        const values: number[] = [];
        const started = performance.now();
        const sample = () => {
          values.push(node.getBoundingClientRect().height);
          if (performance.now() - started >= sampleDuration) resolve(values);
          else requestAnimationFrame(sample);
        };
        sample();
      }),
    duration
  );
}

test.describe("Signal", () => {
  test("renders a semantic square-first accordion without overflow", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const signal = page.locator("[data-signal]");
    const items = signal.locator("[data-signal-item]");

    await expect(root).toHaveAttribute("data-signal-layout", "split");
    await expect(root).toHaveAttribute("data-signal-ratio", "square");
    await expect(signal).toHaveCount(1);
    await expect(items).toHaveCount(4);
    await expect(items.locator("[data-signal-trigger][aria-expanded='true']")).toHaveCount(1);
    await expect(items.locator("[data-signal-panel][aria-hidden='false']")).toHaveCount(1);
    await expect(items.locator("[data-signal-panel][aria-hidden='true'][inert]")).toHaveCount(3);
    await expect(signal.locator("[data-signal-panel][aria-hidden='false'] [data-signal-link]")).toHaveCount(1);
    await expect(signal.locator("img[data-signal-image]").first()).toHaveAttribute(
      "src",
      "/visuals/signal-article-1-1.svg"
    );

    const mediaBox = await signal.locator("[data-signal-item].is-active .signal__media").boundingBox();
    expect(mediaBox).not.toBeNull();
    expect(Math.abs((mediaBox?.width ?? 0) - (mediaBox?.height ?? 0))).toBeLessThanOrEqual(1);
    await expect(page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
    await expectNoHorizontalOverflow(page);
  });

  test("selects first and exposes an explicit navigation action", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const items = page.locator("[data-signal-item]");
    const second = items.nth(1);
    await second.locator("[data-signal-trigger]").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(second).toHaveClass(/is-active/);
    await expect(second.locator("[data-signal-trigger]")).toHaveAttribute("aria-expanded", "true");
    await expect(second.locator("[data-signal-panel]")).toHaveAttribute("aria-hidden", "false");

    await second.locator("[data-signal-link]").click();
    await expect(page).toHaveURL(/\/articles\/interface-motion\/$/);
  });

  test("balanced split adapts from mobile stack to tablet and desktop columns", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const geometry = await measureSignal(page);
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const mobile = viewportWidth <= 720;

    expect(geometry.columns).toBe(mobile ? 1 : 2);
    expect(geometry.panelPadding.left).toBe(12);
    expect(geometry.panelPadding.right).toBe(12);
    expect(geometry.panelPadding.bottom).toBe(12);
    expect(geometry.copyPadding.left).toBe(12);
    expect(geometry.copyPadding.right).toBe(12);
    expectInside(geometry.media, geometry.content);
    expectInside(geometry.copy, geometry.content);

    if (mobile) {
      expect(geometry.copy.y).toBeGreaterThanOrEqual(geometry.media.y + geometry.media.height);
      expect(geometry.rowGap).toBeGreaterThanOrEqual(10);
    } else {
      expect(geometry.copy.x).toBeGreaterThan(geometry.media.x + geometry.media.width);
      expect(Math.abs(geometry.copy.y - geometry.content.y)).toBeLessThanOrEqual(2);
      expect(geometry.columnGap).toBeGreaterThanOrEqual(12);
    }

    await expectNoHorizontalOverflow(page);
  });

  test("offers three distinct, spacing-safe layout options", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Open debug menu" }).click();
    await expect(page.locator("button[data-signal-layout]")).toHaveCount(3);
    await expect(page.locator("button[data-signal-ratio]")).toHaveCount(4);
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Balanced split");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Square 1:1");

    const split = await measureSignal(page);
    await setSignalOption(page, "Editorial stack", "layout", "stack");
    const stack = await measureSignal(page);
    expect(stack.columns).toBe(1);
    expect(stack.copy.y).toBeGreaterThanOrEqual(stack.media.y + stack.media.height);
    expect(stack.signal.height).toBeGreaterThan(split.signal.height);
    expectInside(stack.media, stack.content);
    expectInside(stack.copy, stack.content);

    await setSignalOption(page, "Compact dock", "layout", "compact");
    const compact = await measureSignal(page);
    expect(compact.columns).toBe(2);
    expect(compact.copy.x).toBeGreaterThan(compact.media.x + compact.media.width);
    expect(compact.signal.height).toBeLessThan(split.signal.height);
    expect(compact.copyPadding.left).toBe(10);
    expect(compact.copyPadding.right).toBe(10);
    expectInside(compact.media, compact.content);
    expectInside(compact.copy, compact.content);
    await expectNoHorizontalOverflow(page);
  });

  test("supports optional thumbnail ratios without changing Signal height", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signal = page.locator("[data-signal]");
    const image = signal.locator("img[data-signal-image]").first();
    const media = signal.locator("[data-signal-item].is-active .signal__media");
    const initialHeight = (await signal.boundingBox())?.height ?? 0;
    const choices = [
      { name: "Landscape 4:3", value: "landscape", source: "/visuals/signal-article-4-3.svg", aspect: 4 / 3 },
      { name: "Wide 16:9", value: "wide", source: "/visuals/article-preview.svg", aspect: 16 / 9 },
      { name: "Portrait 3:4", value: "portrait", source: "/visuals/signal-article-3-4.svg", aspect: 3 / 4 },
      { name: "Square 1:1", value: "square", source: "/visuals/signal-article-1-1.svg", aspect: 1 }
    ];

    for (const choice of choices) {
      await setSignalOption(page, choice.name, "ratio", choice.value);
      await expect(image).toHaveAttribute("src", choice.source);
      await expect(media).toHaveAttribute("data-signal-aspect", choice.name.split(" ").at(-1)!);
      const [signalBox, mediaBox] = await Promise.all([signal.boundingBox(), media.boundingBox()]);
      expect(Math.abs((signalBox?.height ?? 0) - initialHeight)).toBeLessThanOrEqual(1);
      expect((mediaBox?.width ?? 0) / Math.max(mediaBox?.height ?? 0, 1)).toBeCloseTo(choice.aspect, 1);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("keeps its outer height invariant through normal and interrupted selection animations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signal = page.locator("[data-signal]");
    const items = signal.locator("[data-signal-item]");
    const marker = signal.locator("[data-signal-marker]");
    const layouts = [
      { name: "Balanced split", value: "split" },
      { name: "Editorial stack", value: "stack" },
      { name: "Compact dock", value: "compact" }
    ];

    for (const layout of layouts) {
      await setSignalOption(page, layout.name, "layout", layout.value);
      await closeDebugPanel(page);
      await signal.hover();
      await page.waitForTimeout(420);

      const activeIndex = await items.evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains("is-active")));
      const nextIndex = (activeIndex + 1) % 4;
      const interruptedIndex = (activeIndex + 2) % 4;
      const beforeHeight = (await signal.boundingBox())?.height ?? 0;
      const markerBefore = await marker.boundingBox();
      const samplesPromise = sampleHeight(signal, 760);

      await items.nth(nextIndex).locator("[data-signal-trigger]").click();
      await page.waitForTimeout(110);
      const movingItem = await items.nth(nextIndex).boundingBox();
      const collapsedItem = await items.nth((interruptedIndex + 1) % 4).boundingBox();
      expect(movingItem?.height ?? 0).toBeGreaterThan((collapsedItem?.height ?? 0) + 1);

      await items.nth(interruptedIndex).locator("[data-signal-trigger]").click();
      await expect(items.nth(interruptedIndex)).toHaveClass(/is-active/);
      const samples = await samplesPromise;
      expect(Math.max(...samples) - Math.min(...samples)).toBeLessThanOrEqual(1);
      expect(Math.abs(((await signal.boundingBox())?.height ?? 0) - beforeHeight)).toBeLessThanOrEqual(1);

      const markerAfter = await marker.boundingBox();
      expect(Math.abs((markerAfter?.y ?? 0) - (markerBefore?.y ?? 0))).toBeGreaterThan(8);
      await expect(items.nth(interruptedIndex).locator("[data-signal-trigger]")).toHaveAttribute("aria-expanded", "true");
      await expect(items.nth(interruptedIndex).locator("[data-signal-panel]")).toHaveAttribute("aria-hidden", "false");
    }
  });

  test("persists layout and ratio choices through Astro navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await setSignalOption(page, "Editorial stack", "layout", "stack");
    await setSignalOption(page, "Portrait 3:4", "ratio", "portrait");
    await page.getByRole("button", { name: "Phosphor", exact: true }).click();
    await page.getByRole("button", { name: "Circuit", exact: true }).click();
    await closeDebugPanel(page);

    await page.getByRole("link", { name: "Read articles" }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-signal-layout", "stack");
    await expect(root).toHaveAttribute("data-signal-ratio", "portrait");
    await expect(root).toHaveAttribute("data-arrow-style", "phosphor");
    await expect(root).toHaveAttribute("data-grid-pattern", "circuit");

    await page.getByRole("button", { name: "Open debug menu" }).click();
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Editorial stack");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Portrait 3:4");
  });
});
