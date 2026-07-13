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
  copyLines: number;
  summaryHeight: number;
  activeItemHeight: number;
  panelHeight: number;
  itemGap: number;
  shellPadding: number;
  shellBorder: number;
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
      const copyTextStyle = getComputedStyle(node.querySelector(".signal__copy p")!);
      const signalNode = node.closest("[data-signal]")!;
      const signalStyle = getComputedStyle(signalNode);
      const summary = signalNode.querySelector(".signal__summary")!;
      const itemsStyle = getComputedStyle(signalNode.querySelector(".signal__items")!);
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
        copyLines: number(copyTextStyle.getPropertyValue("-webkit-line-clamp")),
        summaryHeight: summary.getBoundingClientRect().height,
        activeItemHeight: node.closest("[data-signal-item]")!.getBoundingClientRect().height,
        panelHeight: node.parentElement!.getBoundingClientRect().height,
        itemGap: number(itemsStyle.rowGap),
        shellPadding: number(signalStyle.paddingTop),
        shellBorder:
          number(signalStyle.borderTopWidth) + number(signalStyle.borderBottomWidth),
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
    await page.evaluate(() => document.fonts.ready);

    const root = page.locator("html");
    const signal = page.locator("[data-signal]");
    const items = signal.locator("[data-signal-item]");

    await expect(root).toHaveAttribute("data-signal-layout", "compact");
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

  test("centers one- and two-line headers on uniform content edges", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);

    const metrics = await page.locator("[data-signal]").evaluate((signal) => {
      const activeItem = signal.querySelector(".signal__item.is-active")!;
      const contentBox = activeItem.querySelector(".signal__content")!.getBoundingClientRect();

      return Array.from(signal.querySelectorAll<HTMLElement>(".signal__summary")).map((summary) => {
        const summaryBox = summary.getBoundingClientRect();
        const toplineBox = summary.querySelector(".signal__topline")!.getBoundingClientRect();
        const title = summary.querySelector<HTMLElement>(".signal__title")!;
        const titleBox = title.getBoundingClientRect();
        const titleStyle = getComputedStyle(title);
        const summaryStyle = getComputedStyle(summary);
        const range = document.createRange();
        range.selectNodeContents(title);
        const titleTextBox = range.getBoundingClientRect();
        const lineCount = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).length;
        const number = (value: string) => Number.parseFloat(value) || 0;
        const isActive = summary.closest(".signal__item") === activeItem;

        return {
          summaryHeight: summaryBox.height,
          topInset: toplineBox.top - summaryBox.top,
          bottomInset: summaryBox.bottom - titleBox.bottom,
          leftInset: toplineBox.left - summaryBox.left,
          rightInset: summaryBox.right - toplineBox.right,
          actualGap: titleBox.top - toplineBox.bottom,
          rowGap: number(summaryStyle.rowGap),
          alignContent: summaryStyle.alignContent,
          visualCenterDelta:
            (Math.min(toplineBox.top, titleTextBox.top) + Math.max(toplineBox.bottom, titleTextBox.bottom)) / 2 -
            (summaryBox.top + summaryBox.bottom) / 2,
          titleHeight: titleBox.height,
          naturalTitleHeight:
            lineCount * number(titleStyle.lineHeight) +
            number(titleStyle.paddingTop) +
            number(titleStyle.paddingBottom),
          padding: [
            number(summaryStyle.paddingTop),
            number(summaryStyle.paddingRight),
            number(summaryStyle.paddingBottom),
            number(summaryStyle.paddingLeft)
          ],
          contentLeftInset: isActive ? contentBox.left - summaryBox.left : null,
          contentRightInset: isActive ? summaryBox.right - contentBox.right : null
        };
      });
    });

    metrics.forEach((metric) => {
      expect(Math.abs(metric.summaryHeight - 60)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(metric.topInset - metric.bottomInset)).toBeLessThanOrEqual(1);
      expect(Math.abs(metric.actualGap - metric.rowGap)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(metric.visualCenterDelta)).toBeLessThanOrEqual(1.25);
      expect(Math.abs(metric.titleHeight - metric.naturalTitleHeight)).toBeLessThanOrEqual(1);
      expect(metric.alignContent).toBe("center");
      expect(metric.padding).toEqual([6, 8, 6, 8]);
      expect(metric.leftInset).toBe(8);
      expect(metric.rightInset).toBe(8);
      if (metric.contentLeftInset !== null) {
        expect(Math.abs(metric.leftInset - metric.contentLeftInset)).toBeLessThanOrEqual(1);
        expect(Math.abs(metric.rightInset - metric.contentRightInset!)).toBeLessThanOrEqual(1);
      }
    });
  });

  test("selects first and reveals the thumbnail navigation button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const items = page.locator("[data-signal-item]");
    const second = items.nth(1);
    await second.locator("[data-signal-trigger]").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(second).toHaveClass(/is-active/);
    await expect(second.locator("[data-signal-trigger]")).toHaveAttribute("aria-expanded", "true");
    await expect(second.locator("[data-signal-panel]")).toHaveAttribute("aria-hidden", "false");

    const media = second.locator(".signal__media");
    const action = media.locator(".signal__media-action");
    const summary = second.locator("[data-signal-trigger]");
    const copy = second.locator(".signal__copy");
    await expect(action).toHaveAttribute("aria-label", /Open article: Interface motion/);
    const [arrowColor, readArticlesColor] = await Promise.all([
      action.locator(".arrow-icon").evaluate((node) => getComputedStyle(node).color),
      page.getByRole("link", { name: "Read articles" }).evaluate((node) => getComputedStyle(node).color)
    ]);
    expect(arrowColor).toBe(readArticlesColor);
    const canHover = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    if (canHover) {
      await page.mouse.move(0, 0);
      await expect.poll(async () => action.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeLessThan(0.2);
      const before = await second.evaluate((node) => {
        const itemStyle = getComputedStyle(node);
        const copyStyle = getComputedStyle(node.querySelector(".signal__copy")!);
        return {
          itemBackground: itemStyle.backgroundColor,
          copyBackground: copyStyle.backgroundColor,
          copyBorder: copyStyle.borderColor,
          shadow: itemStyle.boxShadow,
          transform: itemStyle.transform
        };
      });
      await summary.hover();
      await expect.poll(async () => second.evaluate((node) => getComputedStyle(node).transform)).not.toBe(before.transform);
      await expect.poll(async () => second.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe(before.shadow);
      await expect.poll(async () => second.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
        before.itemBackground
      );
      await expect.poll(async () => copy.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
        before.copyBackground
      );
      await expect.poll(async () => copy.evaluate((node) => getComputedStyle(node).borderColor)).not.toBe(
        before.copyBorder
      );
      await page.mouse.move(0, 0);
      await expect.poll(async () => action.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeLessThan(0.2);
      await copy.hover();
    }
    await expect.poll(async () => action.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))).toBeGreaterThan(0.8);
    await action.click();
    await expect(page).toHaveURL(/\/articles\/interface-motion\/$/);
  });

  test("uses a pointer cursor only across clickable Signal item surfaces", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const item = page.locator("[data-signal-item]").nth(1);
    await item.locator("[data-signal-trigger]").click();
    await expect(item).toHaveClass(/is-active/);

    const cursors = await item.evaluate((node) => {
      const cursor = (selector?: string) =>
        getComputedStyle(selector ? node.querySelector(selector)! : node).cursor;
      return {
        item: cursor(),
        summary: cursor(".signal__summary"),
        panel: cursor(".signal__panel"),
        media: cursor(".signal__media"),
        image: cursor(".signal__media img"),
        copy: cursor(".signal__copy"),
        paragraph: cursor(".signal__copy p"),
        mediaAction: cursor(".signal__media-action")
      };
    });
    expect(Object.values(cursors).every((cursor) => cursor === "pointer")).toBe(true);

    const nonInteractiveCursors = await page.locator("[data-signal]").evaluate((node) => ({
      shell: getComputedStyle(node).cursor,
      track: getComputedStyle(node.querySelector(".signal__track")!).cursor,
      items: getComputedStyle(node.querySelector(".signal__items")!).cursor
    }));
    expect(Object.values(nonInteractiveCursors).every((cursor) => cursor !== "pointer")).toBe(true);

    await item.locator(".signal__copy p").click();
    await expect(page).toHaveURL(/\/articles\/interface-motion\/$/);
  });

  test("pauses automatic selection while hovered and resumes after leaving", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        nativeSetInterval(handler, timeout === 4600 ? 400 : timeout, ...args)) as typeof window.setInterval;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const canHover = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    test.skip(!canHover, "Signal hover pause applies to hover-capable pointers");

    const signal = page.locator("[data-signal]");
    const items = signal.locator("[data-signal-item]");
    const activeIndex = () =>
      items.evaluateAll((nodes) => nodes.findIndex((node) => node.classList.contains("is-active")));

    await signal.hover();
    const selectedIndex = ((await activeIndex()) + 1) % (await items.count());
    await items.nth(selectedIndex).locator("[data-signal-trigger]").click();
    await expect(items.nth(selectedIndex)).toHaveClass(/is-active/);

    await page.waitForTimeout(550);
    expect(await activeIndex()).toBe(selectedIndex);

    await page.mouse.move(1, 1);
    await expect.poll(activeIndex).toBe((selectedIndex + 1) % (await items.count()));
  });

  test("balanced split keeps a stacked detail inside the desktop hero row", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("hlcaptain-signal-layout", "split"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const geometry = await measureSignal(page);
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const mobile = viewportWidth <= 720;
    const desktop = viewportWidth > 1040;

    expect(geometry.columns).toBe(mobile || desktop ? 1 : 2);
    const expectedHeight =
      geometry.activeItemHeight +
      3 * geometry.summaryHeight +
      3 * geometry.itemGap +
      2 * geometry.shellPadding +
      geometry.shellBorder;
    expect(Math.abs(geometry.signal.height - expectedHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.signal.height - 534)).toBeLessThanOrEqual(1);
    expect(geometry.signal.height / geometry.signal.width).toBeLessThanOrEqual(mobile ? 1.5 : desktop ? 1.25 : 1.35);
    expect(geometry.panelPadding.left).toBe(8);
    expect(geometry.panelPadding.right).toBe(8);
    expect(geometry.panelPadding.bottom).toBe(8);
    expect(geometry.copyPadding.left).toBe(8);
    expect(geometry.copyPadding.right).toBe(8);
    expectInside(geometry.media, geometry.content);
    expectInside(geometry.copy, geometry.content);

    if (mobile || desktop) {
      expect(geometry.copy.y).toBeGreaterThanOrEqual(geometry.media.y + geometry.media.height);
      expect(geometry.rowGap).toBeGreaterThanOrEqual(6);
      if (desktop) expect(geometry.media.height).toBeGreaterThanOrEqual(100);
    } else {
      expect(geometry.copy.x).toBeGreaterThan(geometry.media.x + geometry.media.width);
      expect(Math.abs(geometry.copy.y - geometry.content.y)).toBeLessThanOrEqual(2);
      expect(geometry.columnGap).toBeGreaterThanOrEqual(6);
    }

    const hero = await page.locator(".home-hero").evaluate((node) => {
      const heroBox = node.getBoundingClientRect();
      const copyBox = node.querySelector(".home-hero__copy")!.getBoundingClientRect();
      const signalBox = node.querySelector("[data-signal]")!.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
        gap: Number.parseFloat(style.columnGap),
        hero: { left: heroBox.left, right: heroBox.right },
        copy: { left: copyBox.left, right: copyBox.right },
        signal: { left: signalBox.left, right: signalBox.right }
      };
    });

    expect(hero.columns).toBe(desktop ? 2 : 1);
    if (desktop) {
      expect(hero.signal.left).toBeGreaterThanOrEqual(hero.copy.right + hero.gap - 1);
      expect(hero.copy.left).toBeGreaterThanOrEqual(hero.hero.left - 1);
      expect(hero.signal.right).toBeLessThanOrEqual(hero.hero.right + 1);
    }

    await expectNoHorizontalOverflow(page);
  });

  test("offers three distinct, spacing-safe layout options", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Open debug menu" }).click();
    await expect(page.locator("button[data-signal-layout]")).toHaveCount(3);
    await expect(page.locator("button[data-signal-ratio]")).toHaveCount(4);
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Compact dock");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Square 1:1");

    await setSignalOption(page, "Balanced split", "layout", "split");
    const split = await measureSignal(page);
    expect(split.copyLines).toBe(6);
    expect(Math.abs(split.signal.height - 534)).toBeLessThanOrEqual(1);
    await setSignalOption(page, "Editorial stack", "layout", "stack");
    const stack = await measureSignal(page);
    expect(stack.copyLines).toBe(6);
    expect(Math.abs(stack.signal.height - 558)).toBeLessThanOrEqual(1);
    expect(stack.columns).toBe(1);
    expect(stack.copy.y).toBeGreaterThanOrEqual(stack.media.y + stack.media.height);
    expect(stack.signal.height).toBeGreaterThan(split.signal.height);
    expectInside(stack.media, stack.content);
    expectInside(stack.copy, stack.content);

    await setSignalOption(page, "Compact dock", "layout", "compact");
    const compact = await measureSignal(page);
    expect(compact.copyLines).toBe(6);
    expect(Math.abs(compact.signal.height - 442)).toBeLessThanOrEqual(1);
    expect(compact.columns).toBe(2);
    expect(compact.copy.x).toBeGreaterThan(compact.media.x + compact.media.width);
    expect(compact.signal.height).toBeLessThan(split.signal.height);
    expect(compact.copyPadding.left).toBe(10);
    expect(compact.copyPadding.right).toBe(10);
    expectInside(compact.media, compact.content);
    expectInside(compact.copy, compact.content);
    await expectNoHorizontalOverflow(page);
  });

  test("fits six complete description lines in every layout", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeSetInterval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        nativeSetInterval(handler, timeout === 4600 ? 60_000 : timeout, ...args)) as typeof window.setInterval;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signal = page.locator("[data-signal]");
    await signal.locator(".signal__copy p").evaluateAll((nodes) => {
      nodes.forEach((node) => {
        node.textContent =
          "Six complete lines should remain readable without clipping descenders or escaping the description panel. ".repeat(
            12
          );
      });
    });

    const layouts = [
      { name: "Balanced split", value: "split", activeHeight: 324 },
      { name: "Editorial stack", value: "stack", activeHeight: 348 },
      { name: "Compact dock", value: "compact", activeHeight: 232 }
    ];

    for (const layout of layouts) {
      await setSignalOption(page, layout.name, "layout", layout.value);
      await expect
        .poll(async () => (await signal.locator("[data-signal-item].is-active").boundingBox())?.height ?? 0)
        .toBe(layout.activeHeight);
      const paragraph = signal.locator("[data-signal-item].is-active .signal__copy p");
      const capacity = await paragraph.evaluate((node) => {
        const style = getComputedStyle(node);
        const lineHeight = Number.parseFloat(style.lineHeight);
        const paragraphBox = node.getBoundingClientRect();
        const copyBox = node.parentElement!.getBoundingClientRect();
        return {
          clamp: Number.parseFloat(style.getPropertyValue("-webkit-line-clamp")),
          visibleLines: node.clientHeight / lineHeight,
          contained: paragraphBox.top >= copyBox.top - 0.5 && paragraphBox.bottom <= copyBox.bottom + 0.5
        };
      });

      expect(capacity.clamp).toBe(6);
      expect(capacity.visibleLines).toBeGreaterThanOrEqual(5.9);
      expect(capacity.visibleLines).toBeLessThanOrEqual(6.1);
      expect(capacity.contained).toBe(true);
    }
  });

  test("supports optional thumbnail ratios without changing Signal height", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await setSignalOption(page, "Balanced split", "layout", "split");

    const signal = page.locator("[data-signal]");
    const image = signal.locator("img[data-signal-image]").first();
    const active = signal.locator("[data-signal-item].is-active");
    const content = active.locator(".signal__content");
    const media = active.locator(".signal__media");
    const copy = active.locator(".signal__copy");
    const action = active.locator(".signal__media-action");
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
      await closeDebugPanel(page);
      if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
        await active.hover();
        await expect.poll(async () => Number.parseFloat(await action.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.8);
      }
      const [signalBox, contentBox, mediaBox, copyBox, actionBox] = await Promise.all([
        signal.boundingBox(),
        content.boundingBox(),
        media.boundingBox(),
        copy.boundingBox(),
        action.boundingBox()
      ]);
      expect(Math.abs((signalBox?.height ?? 0) - initialHeight)).toBeLessThanOrEqual(1);
      expect((mediaBox?.width ?? 0) / Math.max(mediaBox?.height ?? 0, 1)).toBeCloseTo(choice.aspect, 1);
      expectInside(mediaBox!, contentBox!);
      expectInside(copyBox!, contentBox!);
      expectInside(actionBox!, mediaBox!);
      const viewportWidth = page.viewportSize()?.width ?? 0;
      if (viewportWidth <= 720 || viewportWidth > 1040) {
        expect(copyBox?.y ?? 0).toBeGreaterThanOrEqual((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0));
      }
      if (viewportWidth > 1040) expect(mediaBox?.height ?? 0).toBeGreaterThanOrEqual(100);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("keeps Compact Dock thumbnails uncropped at wide tablet widths", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "Wide-tablet Compact Dock constraint check");

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.addInitScript(() => window.localStorage.setItem("hlcaptain-signal-layout", "compact"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signal = page.locator("[data-signal]");
    const active = signal.locator("[data-signal-item].is-active");
    const content = active.locator(".signal__content");
    const media = active.locator(".signal__media");
    const image = media.locator("img[data-signal-image]");
    const action = media.locator(".signal__media-action");
    const copy = active.locator(".signal__copy");
    const choices = [
      { name: "Square 1:1", value: "square", source: "/visuals/signal-article-1-1.svg", aspect: 1 },
      { name: "Landscape 4:3", value: "landscape", source: "/visuals/signal-article-4-3.svg", aspect: 4 / 3 },
      { name: "Wide 16:9", value: "wide", source: "/visuals/article-preview.svg", aspect: 16 / 9 },
      { name: "Portrait 3:4", value: "portrait", source: "/visuals/signal-article-3-4.svg", aspect: 3 / 4 }
    ];

    await expect(page.locator("html")).toHaveAttribute("data-signal-layout", "compact");
    await expect.poll(async () => (await signal.boundingBox())?.height ?? 0).toBe(442);

    for (const choice of choices) {
      await setSignalOption(page, choice.name, "ratio", choice.value);
      await expect(image).toHaveAttribute("src", choice.source);
      await expect
        .poll(async () =>
          image.evaluate((node) => {
            const imageNode = node as HTMLImageElement;
            return imageNode.complete && imageNode.naturalWidth > 0;
          })
        )
        .toBe(true);
      await closeDebugPanel(page);
      await active.hover();
      await expect
        .poll(async () => Number.parseFloat(await action.evaluate((node) => getComputedStyle(node).opacity)))
        .toBeGreaterThan(0.8);

      const [signalBox, contentBox, mediaBox, imageBox, actionBox, copyBox, imageMetrics] = await Promise.all([
        signal.boundingBox(),
        content.boundingBox(),
        media.boundingBox(),
        image.boundingBox(),
        action.boundingBox(),
        copy.boundingBox(),
        image.evaluate((node) => {
          const imageNode = node as HTMLImageElement;
          return {
            fit: getComputedStyle(imageNode).objectFit,
            naturalAspect: imageNode.naturalWidth / imageNode.naturalHeight
          };
        })
      ]);

      expect(Math.abs((signalBox?.height ?? 0) - 442)).toBeLessThanOrEqual(1);
      expect((mediaBox?.width ?? 0) / Math.max(mediaBox?.height ?? 0, 1)).toBeCloseTo(choice.aspect, 1);
      expect(Math.max(mediaBox?.width ?? 0, mediaBox?.height ?? 0)).toBeLessThanOrEqual(160.5);
      if (choice.value === "portrait") expect(mediaBox?.width ?? 0).toBeLessThanOrEqual(120.5);
      expect(imageMetrics.fit).toBe("contain");
      expect(imageMetrics.naturalAspect).toBeCloseTo(choice.aspect, 2);
      expectInside(mediaBox!, contentBox!);
      expectInside(imageBox!, mediaBox!);
      expectInside(actionBox!, mediaBox!);
      expectInside(copyBox!, contentBox!);
      expect(copyBox?.x ?? 0).toBeGreaterThanOrEqual((mediaBox?.x ?? 0) + (mediaBox?.width ?? 0));
      expect(copyBox?.width ?? 0).toBeGreaterThan(mediaBox?.width ?? 0);
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
      { name: "Balanced split", value: "split", height: 534 },
      { name: "Editorial stack", value: "stack", height: 558 },
      { name: "Compact dock", value: "compact", height: 442 }
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
      expect(Math.abs(beforeHeight - layout.height)).toBeLessThanOrEqual(1);
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

  test("scales the rail marker across the full track", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const signal = page.locator("[data-signal]");
    const track = signal.locator(".signal__track");
    const marker = signal.locator("[data-signal-marker]");
    const items = signal.locator("[data-signal-item]");
    await signal.hover();

    const [firstTrackBox, firstMarkerBox] = await Promise.all([track.boundingBox(), marker.boundingBox()]);
    expect(Math.abs((firstMarkerBox?.y ?? 0) - (firstTrackBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((firstMarkerBox?.height ?? 0) - (firstTrackBox?.height ?? 0) / 4)).toBeLessThanOrEqual(1);

    await items.last().locator("[data-signal-trigger]").click();
    await expect(items.last()).toHaveClass(/is-active/);
    await page.waitForTimeout(420);
    const [lastTrackBox, lastMarkerBox] = await Promise.all([track.boundingBox(), marker.boundingBox()]);
    const trackBottom = (lastTrackBox?.y ?? 0) + (lastTrackBox?.height ?? 0);
    const markerBottom = (lastMarkerBox?.y ?? 0) + (lastMarkerBox?.height ?? 0);
    expect(Math.abs(markerBottom - trackBottom)).toBeLessThanOrEqual(1);
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

  test("reruns the shell across Astro navigation without console errors", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    const navigateAndSettle = async (link: Locator) => {
      const pageLoaded = page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            document.addEventListener("astro:page-load", () => resolve(), { once: true })
          )
      );
      await link.evaluate((node: HTMLAnchorElement) => node.click());
      await pageLoaded;
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .map((animation) => animation.finished.catch(() => undefined))
        );
      });
    };

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await navigateAndSettle(page.getByRole("link", { name: "Read articles" }));
    await expect(page).toHaveURL(/\/articles\/$/);
    await navigateAndSettle(page.getByRole("link", { name: "Overview" }));
    await expect(page).toHaveURL(/\/$/);
    await navigateAndSettle(page.getByRole("link", { name: "About" }));
    await expect(page).toHaveURL(/\/about\/$/);

    expect(browserErrors).toEqual([]);
  });
});
