import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
}

async function selectSignalInnerLayout(page: Page, name: string, value: string) {
  const root = page.locator("html");
  const debugToggle = page.getByRole("button", { name: "Open debug menu" });
  const panel = page.locator("[data-debug-panel]");
  if (await panel.evaluate((node: HTMLElement) => node.hidden)) {
    await debugToggle.click();
  }
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name }).click();
  await expect(root).toHaveAttribute("data-signal-inner-layout", value);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.waitForTimeout(460);
  await page.getByRole("button", { name: "Close debug menu" }).click();
  await expect(panel).toBeHidden();
}

async function selectSignalSizing(page: Page, name: string, value: string) {
  const root = page.locator("html");
  const debugToggle = page.getByRole("button", { name: "Open debug menu" });
  const panel = page.locator("[data-debug-panel]");
  if (await panel.evaluate((node: HTMLElement) => node.hidden)) {
    await debugToggle.click();
  }
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name }).click();
  await expect(root).toHaveAttribute("data-signal-sizing", value);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.waitForTimeout(460);
  await page.getByRole("button", { name: "Close debug menu" }).click();
  await expect(panel).toBeHidden();
}

type ParsedColor = { r: number; g: number; b: number; a: number };

function parseColor(value: string): ParsedColor {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (match) {
    const alpha = /rgba\([^,]+,[^,]+,[^,]+,\s*([.\d]+)/.exec(value);
    return {
      r: Number(match[1]) / 255,
      g: Number(match[2]) / 255,
      b: Number(match[3]) / 255,
      a: alpha ? Number(alpha[1]) : 1
    };
  }

  const srgb = /color\(srgb\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*([-\d.]+))?/.exec(value);
  if (srgb) {
    return {
      r: Number(srgb[1]),
      g: Number(srgb[2]),
      b: Number(srgb[3]),
      a: srgb[4] ? Number(srgb[4]) : 1
    };
  }

  const oklab = /oklab\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(value);
  if (!oklab) throw new Error(`Cannot parse color: ${value}`);
  const alpha = /oklab\([^)]+\/\s*([-\d.]+)/.exec(value);
  const l = Number(oklab[1]);
  const a = Number(oklab[2]);
  const b = Number(oklab[3]);
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const lCube = lPrime ** 3;
  const mCube = mPrime ** 3;
  const sCube = sPrime ** 3;
  const linear = {
    r: 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    g: -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    b: -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube
  };
  const gamma = (channel: number) =>
    Math.max(0, Math.min(1, channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055));
  return {
    r: gamma(linear.r),
    g: gamma(linear.g),
    b: gamma(linear.b),
    a: alpha ? Number(alpha[1]) : 1
  };
}

function composite(foreground: ParsedColor, background: ParsedColor) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1
  };
}

function luminance(color: ParsedColor) {
  const channels = [color.r, color.g, color.b].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: ParsedColor, b: ParsedColor) {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

test.describe("site shell", () => {
  test("home renders without viewport overflow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "HLCaptain" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("background grid parallax uses a composited transform layer", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const grid = page.locator(".background-grid");
    await expect(grid).toHaveCount(1);

    const layerState = await grid.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        position: style.position,
        pointerEvents: style.pointerEvents,
        willChange: style.willChange,
        backgroundImage: style.backgroundImage
      };
    });
    expect(layerState.position).toBe("fixed");
    expect(layerState.pointerEvents).toBe("none");
    expect(layerState.willChange).toContain("transform");
    expect(layerState.backgroundImage).toContain("linear-gradient");

    const readParallax = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          x: style.getPropertyValue("--grid-parallax-x").trim(),
          y: style.getPropertyValue("--grid-parallax-y").trim()
        };
      });

    const before = await readParallax();
    expect(before.x).toBe("0px");
    await page.evaluate(() => window.scrollTo(0, 420));
    await expect
      .poll(async () => {
        const after = await readParallax();
        return after.y;
      })
      .not.toBe(before.y);

    const afterScroll = await readParallax();
    expect(afterScroll.x).toBe("0px");
    await page.mouse.move(32, 32);
    await page.mouse.move(1200, 760);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(await readParallax()).toEqual(afterScroll);
  });

  test("mouse-reactive background patterns keep grid parallax independent", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop fine-pointer background pattern check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    await page.getByRole("button", { name: "Open debug menu" }).click();
    await page.getByRole("button", { name: "Plus signs" }).click();
    await expect(root).toHaveAttribute("data-grid-pattern", "plus");

    const readMotion = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          parallaxX: style.getPropertyValue("--grid-parallax-x").trim(),
          parallaxY: style.getPropertyValue("--grid-parallax-y").trim(),
          pointerX: style.getPropertyValue("--grid-pointer-x").trim(),
          pointerY: style.getPropertyValue("--grid-pointer-y").trim()
        };
      });

    const before = await readMotion();
    await page.mouse.move(32, 32);
    await page.mouse.move(1320, 820);
    await expect
      .poll(async () => {
        const after = await readMotion();
        return `${after.pointerX}:${after.pointerY}`;
      })
      .not.toBe(`${before.pointerX}:${before.pointerY}`);

    const after = await readMotion();
    expect(after.parallaxX).toBe(before.parallaxX);
    expect(after.parallaxY).toBe(before.parallaxY);
    expect(after.pointerX).not.toBe(before.pointerX);
    expect(after.pointerY).not.toBe(before.pointerY);

    const backgroundImage = await page
      .locator(".background-grid")
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(backgroundImage).toContain("radial-gradient");
  });

  test("debug menu renders each background pattern option", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    await page.getByRole("button", { name: "Open debug menu" }).click();

    const patterns = [
      { name: "Grid", value: "grid" },
      { name: "Dots", value: "dots" },
      { name: "Plus signs", value: "plus" },
      { name: "Crosshatch", value: "crosshatch" },
      { name: "Diagonal", value: "diagonal" },
      { name: "Circuit", value: "circuit" },
      { name: "Scanlines", value: "scanlines" }
    ];
    const renderedBackgrounds = new Set<string>();

    for (const pattern of patterns) {
      await page.getByRole("button", { name: pattern.name }).click();
      await expect(root).toHaveAttribute("data-grid-pattern", pattern.value);
      await expect(page.locator("[data-grid-pattern-current]")).toHaveText(pattern.name);
      await expect(page.getByRole("button", { name: pattern.name })).toHaveAttribute("aria-pressed", "true");
      const backgroundImage = await page
        .locator(".background-grid")
        .evaluate((node) => getComputedStyle(node).backgroundImage);
      expect(backgroundImage).toContain("gradient");
      renderedBackgrounds.add(backgroundImage);
    }

    expect(renderedBackgrounds.size).toBe(patterns.length);
  });

  test("navigation reaches articles and marks the active route", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    await nav.getByRole("link", { name: "Articles", exact: true }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(page.getByRole("heading", { name: "Articles" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-page-direction", "down");
    const transitionRules = await page.evaluate(() =>
      Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules).map((rule) => rule.cssText);
          } catch {
            return [];
          }
        })
        .filter((rule) => rule.includes("view-transition"))
    );
    expect(transitionRules.some((rule) => rule.includes("::view-transition-new(page-content)") && rule.includes("page-in"))).toBe(true);
    expect(
      transitionRules.some(
        (rule) =>
          rule.includes("::view-transition-new(root)") &&
          (rule.includes("animation: none") || rule.includes("none running none"))
      )
    ).toBe(true);
    await expect(page.locator("#main-content")).not.toHaveClass(/is-page-/);
    await expect(nav.getByRole("link", { name: "Articles", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectNoHorizontalOverflow(page);
  });

  test("article card navigation enters with a vertical page direction", async ({ page }) => {
    await page.goto("/articles/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    await page.getByRole("link", { name: /^Read / }).first().click();

    await expect(page).toHaveURL(/\/articles\/[^/]+\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");
    const pageEnterY = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--page-enter-y").trim());
    expect(pageEnterY).not.toBe("0px");
  });

  test("all articles navigation keeps transition geometry stable from scrolled overview", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const allArticles = page.getByRole("link", { name: "All articles" });
    await allArticles.scrollIntoViewIfNeeded();
    const overviewTargetScrollY = await allArticles.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const documentY = rect.top + window.scrollY;
      const preferredViewportY = Math.min(window.innerHeight * 0.45, 360);
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(maxScrollY, Math.max(0, documentY - preferredViewportY));
    });
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), overviewTargetScrollY);
    const overviewScrollY = await page.evaluate(() => window.scrollY);
    expect(overviewScrollY).toBeGreaterThan(100);
    await expect(allArticles).toBeVisible();

    await allArticles.click({ noWaitAfter: true });
    await expect(page.locator("html")).toHaveAttribute("data-astro-transition", /forward|back/);
    await expect
      .poll(async () =>
        page.locator("html").evaluate((node) => node.style.getPropertyValue("--page-old-scroll-offset-y").trim())
      )
      .toBe(`${-Math.round(overviewScrollY)}px`);
    await expect
      .poll(async () =>
        page.locator("html").evaluate((node, expectedScrollY) => {
          const transform = getComputedStyle(node, "::view-transition-old(page-content)").transform;
          if (transform === "none") return false;
          const matrix = new DOMMatrixReadOnly(transform);
          return Math.abs(matrix.m42 + expectedScrollY) <= 80;
        }, Math.round(overviewScrollY))
      )
      .toBe(true);
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);

    const pageContentGroupStyle = await page.evaluate(() =>
      Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return [];
          }
        })
        .filter((rule): rule is CSSStyleRule => "selectorText" in rule && "style" in rule)
        .find((rule) => rule.selectorText === "::view-transition-group(page-content)")
        ?.style.animationName
    );
    expect(pageContentGroupStyle).toBe("none");

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(overviewScrollY - 120);
  });

  test("mobile sidebar overlay stays open during navigation", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only overlay navigation check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(root).toHaveClass(/sidebar-open/);

    await nav.getByRole("link", { name: "Articles", exact: true }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveClass(/sidebar-open/);
    await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "true");
  });

  test("sidebar navigation direction follows item order and accepts rapid clicks", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only rapid sidebar navigation check");

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await nav.getByRole("link", { name: "Articles", exact: true }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");

    await nav.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "up");

    await nav.getByRole("link", { name: "Articles", exact: true }).click({ noWaitAfter: true });
    await nav.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");
    expect(pageErrors.filter((message) => message.includes("interceptedSidebarNavigationClick"))).toEqual([]);
  });

  test("browser history navigation follows sidebar route order", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only browser history direction check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await nav.getByRole("link", { name: "Articles", exact: true }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");

    await nav.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "up");

    await page.goBack();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");

    await page.goForward();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "up");
  });

  test("sidebar navigation can interrupt an active page transition", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only transition interruption check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await nav.getByRole("link", { name: "Articles", exact: true }).click({ noWaitAfter: true });
    await nav.getByRole("link", { name: "Projects", exact: true }).click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.getByRole("heading", { name: "Selected work", level: 1 })).toBeVisible();
  });

  test("sidebar selection responds during the visible page transition", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only transition hit-test check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const articles = nav.getByRole("link", { name: "Articles", exact: true });
    const projects = nav.getByRole("link", { name: "Projects", exact: true });

    await articles.click({ noWaitAfter: true });
    await expect(articles).toHaveClass(/is-selection-entering/);
    const selectionEffect = await articles.evaluate((node) => {
      const layer = getComputedStyle(node, "::after");
      return {
        animationName: layer.animationName,
        pointerEvents: layer.pointerEvents,
        willChange: layer.willChange
      };
    });
    expect(selectionEffect.animationName).toContain("nav-selection-sweep");
    expect(selectionEffect.pointerEvents).toBe("none");
    expect(selectionEffect.willChange).toContain("transform");
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-astro-transition", /forward|back/);

    const box = await projects.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);

    await expect(projects).toHaveAttribute("aria-current", "page");
    await expect(projects).toHaveClass(/is-active/);
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.getByRole("heading", { name: "Selected work", level: 1 })).toBeVisible();
  });

  test("rss endpoint returns XML", async ({ request }) => {
    const response = await request.get("/rss.xml");
    expect(response.ok()).toBe(true);
    const body = await response.text();
    expect(body).toContain("<rss");
    expect(body).toContain("HLCaptain");
  });

  test("desktop sidebar collapses to icons and expands again", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only sidebar state check");

    await page.goto("/articles/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const sidebar = page.locator("[data-sidebar]");
    const panel = page.locator(".sidebar-panel");
    const main = page.locator("#main-content");
    const toggleBox = await page.getByRole("button", { name: "Collapse sidebar" }).boundingBox();
    await expect(page.locator(".brand-mark")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "HLCaptain home" })).toHaveCount(0);
    await expect(page.locator(".sidebar-toggle .menu-icon svg")).toHaveCount(1);
    await expect(page.locator(".sidebar-toggle .arrow-icon")).toHaveCount(0);

    const aboutLink = nav.getByRole("link", { name: "About", exact: true });
    const expandedAboutBox = await aboutLink.boundingBox();
    await aboutLink.hover();
    await expect
      .poll(async () => {
        const shadow = await aboutLink.evaluate((node) => getComputedStyle(node).boxShadow);
        return shadow !== "none" && !/rgba\(0, 0, 0, 0\)|\/ 0/.test(shadow);
      })
      .toBe(true);
    await page.mouse.move(1000, 520);

    const expandedMetrics = await page.locator(".nav-group").nth(1).evaluate((group) => {
      const groupRow = group.querySelector(".sidebar-row--group")!;
      const groupIcon = group.querySelector(".sidebar-row__icon")!;
      const groupGlyph = group.querySelector(".pixel-glyph")!;
      const groupToggle = group.querySelector(".group-toggle-icon")!;
      const itemRow = document.querySelector(".nav-item")!;
      const itemIcon = itemRow.querySelector(".sidebar-row__icon")!;
      const itemGlyph = itemRow.querySelector(".pixel-glyph")!;
      const groupStyle = getComputedStyle(groupRow);
      const itemStyle = getComputedStyle(itemRow);
      const panelStyle = getComputedStyle(document.querySelector(".sidebar-panel")!);
      return {
        groupIconWidth: Math.round(groupIcon.getBoundingClientRect().width),
        itemIconWidth: Math.round(itemIcon.getBoundingClientRect().width),
        groupGlyphWidth: Math.round(groupGlyph.getBoundingClientRect().width),
        itemGlyphWidth: Math.round(itemGlyph.getBoundingClientRect().width),
        groupToggleWidth: Math.round(groupToggle.getBoundingClientRect().width),
        groupColor: groupStyle.color,
        itemColor: itemStyle.color,
        panelBackground: panelStyle.backgroundColor,
        groupPaddingLeft: groupStyle.paddingLeft,
        itemPaddingLeft: itemStyle.paddingLeft,
        selectedArrowInsideGroup: Boolean(group.querySelector(".arrow-icon__svg"))
      };
    });
    expect(expandedMetrics.groupIconWidth).toBe(expandedMetrics.itemIconWidth);
    expect(expandedMetrics.groupGlyphWidth).toBe(expandedMetrics.itemGlyphWidth);
    expect(expandedMetrics.groupToggleWidth).toBe(expandedMetrics.itemGlyphWidth);
    expect(contrast(parseColor(expandedMetrics.groupColor), parseColor(expandedMetrics.panelBackground))).toBeLessThan(
      contrast(parseColor(expandedMetrics.itemColor), parseColor(expandedMetrics.panelBackground))
    );
    expect(expandedMetrics.groupPaddingLeft).toBe(expandedMetrics.itemPaddingLeft);
    expect(expandedMetrics.selectedArrowInsideGroup).toBe(false);
    const expandedActive = await nav.getByRole("link", { name: "Articles", exact: true }).evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        border: style.borderColor,
        boxShadow: style.boxShadow,
        background: style.backgroundColor
      };
    });
    expect(expandedActive.boxShadow).not.toBe("none");
    const expandedSurfaceControls = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".accent-panel .surface-control__label")).map((node) => getComputedStyle(node).display);
      const rectOf = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      };
      return {
        labels,
        controls: rectOf(".surface-controls"),
        theme: rectOf(".surface-control--theme"),
        accent: rectOf(".surface-control--accent"),
        reset: rectOf(".surface-control--reset"),
        swatchesCount: document.querySelectorAll(".accent-swatches").length,
        themeGrid: getComputedStyle(document.querySelector(".surface-control--theme")!).gridTemplateColumns,
        resetWidth: Math.round(document.querySelector(".surface-control--reset")!.getBoundingClientRect().width)
      };
    });
    expect(expandedSurfaceControls.labels.every((display) => display !== "none")).toBe(true);
    expect(expandedSurfaceControls.swatchesCount).toBe(0);
    expect(expandedSurfaceControls.themeGrid).toContain("18px");
    expect(expandedSurfaceControls.theme.width).toBe(expandedSurfaceControls.controls.width);
    expect(expandedSurfaceControls.theme.y).toBeLessThan(expandedSurfaceControls.accent.y);
    expect(Math.abs(expandedSurfaceControls.accent.y - expandedSurfaceControls.reset.y)).toBeLessThanOrEqual(1);
    expect(expandedSurfaceControls.reset.x).toBeGreaterThan(expandedSurfaceControls.accent.x);
    expect(expandedSurfaceControls.resetWidth).toBe(38);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(root).toHaveClass(/sidebar-collapsed/);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    const expandButton = page.getByRole("button", { name: "Expand sidebar" });
    await expect(expandButton).toBeVisible();

    await page.mouse.move(1000, 520);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    const collapsedToggleMetrics = await page.evaluate(() => {
      const centerOf = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return Number.NaN;
        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2;
      };
      return {
        buttonCenter: centerOf(".sidebar-toggle"),
        sidebarCenter: centerOf(".site-sidebar")
      };
    });
    expect(Math.abs(collapsedToggleMetrics.buttonCenter - collapsedToggleMetrics.sidebarCenter)).toBeLessThanOrEqual(1);
    await expect
      .poll(async () =>
        page.locator(".site-frame").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ")[0])
      )
      .toBe("84px");
    const compactSurfaceControls = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".accent-panel .surface-control__label")).map((node) => getComputedStyle(node).display);
      const controls = Array.from(document.querySelectorAll(".accent-panel .surface-control")).map((node) => {
        const style = getComputedStyle(node);
        return {
          display: style.display,
          width: Math.round(node.getBoundingClientRect().width)
        };
      });
      return {
        labels,
        controls,
        swatchesCount: document.querySelectorAll(".accent-swatches").length
      };
    });
    expect(compactSurfaceControls.labels.every((display) => display === "none")).toBe(true);
    expect(compactSurfaceControls.swatchesCount).toBe(0);
    expect(compactSurfaceControls.controls).toEqual([
      { display: "grid", width: 34 },
      { display: "grid", width: 34 },
      { display: "none", width: 0 }
    ]);

    const collapsedSidebarBox = await sidebar.boundingBox();
    await page.mouse.move((collapsedSidebarBox?.x ?? 0) + 6, (collapsedSidebarBox?.y ?? 0) + 120);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(240);
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          panelWidth: Math.round(document.querySelector(".sidebar-panel")!.getBoundingClientRect().width),
          shellWidth: Math.round(document.querySelector(".site-sidebar")!.getBoundingClientRect().width)
        }))
      )
      .toEqual({ panelWidth: 264, shellWidth: 84 });
    await expect
      .poll(async () =>
        nav
          .getByRole("link", { name: "Articles", exact: true })
          .locator("span")
          .last()
          .evaluate((node) => getComputedStyle(node).display)
      )
      .toBe("block");
    const overlaySurfaceControls = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll(".accent-panel .surface-control__label")).map((node) => getComputedStyle(node).display);
      const rectOf = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width)
        };
      };
      return {
        labels,
        controls: rectOf(".surface-controls"),
        theme: rectOf(".surface-control--theme"),
        accent: rectOf(".surface-control--accent"),
        reset: rectOf(".surface-control--reset"),
        swatchesCount: document.querySelectorAll(".accent-swatches").length,
        resetWidth: Math.round(document.querySelector(".surface-control--reset")!.getBoundingClientRect().width)
      };
    });
    expect(overlaySurfaceControls.labels.every((display) => display !== "none")).toBe(true);
    expect(overlaySurfaceControls.swatchesCount).toBe(0);
    expect(overlaySurfaceControls.theme.width).toBe(overlaySurfaceControls.controls.width);
    expect(overlaySurfaceControls.theme.y).toBeLessThan(overlaySurfaceControls.accent.y);
    expect(Math.abs(overlaySurfaceControls.accent.y - overlaySurfaceControls.reset.y)).toBeLessThanOrEqual(1);
    expect(overlaySurfaceControls.reset.x).toBeGreaterThan(overlaySurfaceControls.accent.x);
    expect(overlaySurfaceControls.resetWidth).toBe(38);

    await page.mouse.move(1000, 520);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    const collapsedArticlesBox = await nav.getByRole("link", { name: "Articles", exact: true }).boundingBox();
    expect(collapsedArticlesBox).not.toBeNull();
    await page.mouse.move(
      (collapsedArticlesBox?.x ?? 0) + (collapsedArticlesBox?.width ?? 0) / 2,
      (collapsedArticlesBox?.y ?? 0) + (collapsedArticlesBox?.height ?? 0) / 2
    );
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await page.waitForTimeout(160);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(240);

    const scribbleResultPromise = page.evaluate(
      async () =>
        new Promise<{ removals: number; minWidth: number; maxWidth: number }>((resolve) => {
          const rootNode = document.documentElement;
          const panelNode = document.querySelector(".sidebar-panel")!;
          let removals = 0;
          let sawOpen = rootNode.classList.contains("sidebar-overlay-open");
          let minWidth = panelNode.getBoundingClientRect().width;
          let maxWidth = minWidth;

          const observer = new MutationObserver(() => {
            const isOpen = rootNode.classList.contains("sidebar-overlay-open");
            if (sawOpen && !isOpen) removals += 1;
            sawOpen = isOpen;
          });
          observer.observe(rootNode, { attributes: true, attributeFilter: ["class"] });

          const sample = () => {
            const width = panelNode.getBoundingClientRect().width;
            minWidth = Math.min(minWidth, width);
            maxWidth = Math.max(maxWidth, width);
          };
          const sampler = window.setInterval(sample, 16);

          window.setTimeout(() => {
            sample();
            window.clearInterval(sampler);
            observer.disconnect();
            resolve({ removals, minWidth, maxWidth });
          }, 520);
        })
    );
    const openPanelBoxForScribble = await panel.boundingBox();
    expect(openPanelBoxForScribble).not.toBeNull();
    const scribbleLeft = (openPanelBoxForScribble?.x ?? 0) + 24;
    const scribbleRight = (openPanelBoxForScribble?.x ?? 0) + (openPanelBoxForScribble?.width ?? 0) - 24;
    const scribbleTop = (openPanelBoxForScribble?.y ?? 0) + 32;
    const scribbleBottom = (openPanelBoxForScribble?.y ?? 0) + (openPanelBoxForScribble?.height ?? 0) - 92;
    for (let index = 0; index < 28; index += 1) {
      const progress = index / 27;
      const x = index % 2 === 0 ? scribbleLeft + (scribbleRight - scribbleLeft) * progress : scribbleRight - (scribbleRight - scribbleLeft) * progress;
      const y = scribbleTop + ((index * 53) % Math.max(1, scribbleBottom - scribbleTop));
      await page.mouse.move(x, y, { steps: 2 });
    }
    const scribbleResult = await scribbleResultPromise;
    expect(scribbleResult).toEqual(
      expect.objectContaining({
        removals: 0
      })
    );
    expect(scribbleResult.minWidth).toBeGreaterThan(240);

    await page.mouse.move(1000, 520);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    await page.mouse.move((collapsedSidebarBox?.x ?? 0) + 6, (collapsedSidebarBox?.y ?? 0) + 120);
    await expect.poll(async () => panel.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(260);
    const openPanelBox = await panel.boundingBox();
    expect(openPanelBox).not.toBeNull();
    const edgeY = (openPanelBox?.y ?? 0) + 120;
    const justOutsideEdgeX = (openPanelBox?.x ?? 0) + (openPanelBox?.width ?? 0) + 8;
    const justInsideEdgeX = (openPanelBox?.x ?? 0) + (openPanelBox?.width ?? 0) - 14;
    const closingTrailX = (openPanelBox?.x ?? 0) + 150;
    await page.mouse.move(justOutsideEdgeX, edgeY);
    await page.waitForTimeout(30);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await page.mouse.move(justInsideEdgeX, edgeY);
    await page.waitForTimeout(120);
    await expect(root).toHaveClass(/sidebar-overlay-open/);

    await page.mouse.move(justOutsideEdgeX, edgeY);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await page.mouse.move(closingTrailX, edgeY);
    await page.waitForTimeout(140);
    await expect(root).not.toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);
    await page.mouse.move((collapsedSidebarBox?.x ?? 0) + 140, (collapsedSidebarBox?.y ?? 0) + 120);
    await page.waitForTimeout(120);
    await expect(root).not.toHaveClass(/sidebar-overlay-open/);

    const collapsedMainBox = await main.boundingBox();

    await sidebar.hover();
    await expect.poll(async () => panel.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(240);
    const overlayToggleBox = await expandButton.boundingBox();
    expect(Math.abs((overlayToggleBox?.x ?? 0) - (toggleBox?.x ?? 0))).toBeLessThanOrEqual(2);
    await expect
      .poll(async () =>
        panel.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            padding: Math.round(Number.parseFloat(style.paddingTop)),
            gap: Math.round(Number.parseFloat(style.rowGap))
          };
        })
      )
      .toEqual({ padding: 10, gap: 16 });
    await expect
      .poll(async () =>
        nav
          .getByRole("link", { name: "Articles", exact: true })
          .locator("span")
          .last()
          .evaluate((node) => getComputedStyle(node).display)
      )
      .toBe("block");
    const hoverMainBox = await main.boundingBox();
    expect(Math.abs((hoverMainBox?.x ?? 0) - (collapsedMainBox?.x ?? 0))).toBeLessThanOrEqual(2);
    await expect(root).toHaveClass(/sidebar-overlay-open/);

    await expect
      .poll(async () => {
        const overlayAboutBox = await aboutLink.boundingBox();
        return Math.abs((overlayAboutBox?.x ?? 0) - (expandedAboutBox?.x ?? 0));
      })
      .toBeLessThanOrEqual(1);
    await expect
      .poll(async () => {
        const overlayAboutBox = await aboutLink.boundingBox();
        return Math.abs((overlayAboutBox?.width ?? 0) - (expandedAboutBox?.width ?? 0));
      })
      .toBeLessThanOrEqual(1);
    await aboutLink.hover();
    await expect
      .poll(async () => {
        const shadow = await aboutLink.evaluate((node) => getComputedStyle(node).boxShadow);
        return shadow !== "none" && !/rgba\(0, 0, 0, 0\)|\/ 0/.test(shadow);
      })
      .toBe(true);

    await aboutLink.focus();
    await page.mouse.move(1000, 520);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    await page.mouse.move(1000, 520);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    const labelDisplay = await nav
      .getByRole("link", { name: "Articles", exact: true })
      .locator("span")
      .last()
      .evaluate((node) => getComputedStyle(node).display);
    expect(labelDisplay).toBe("none");
    const collapsedActive = await nav.getByRole("link", { name: "Articles", exact: true }).evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        border: style.borderColor,
        boxShadow: style.boxShadow,
        background: style.backgroundColor,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight
      };
    });
    expect(collapsedActive.border).toBe(expandedActive.border);
    expect(collapsedActive.boxShadow).toBe(expandedActive.boxShadow);
    expect(collapsedActive.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(collapsedActive.paddingLeft).toBe(collapsedActive.paddingRight);
    const collapsedSpacing = await page.evaluate(() => {
      const number = (value: string) => Math.round(Number.parseFloat(value));
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        return element ? Math.round(element.getBoundingClientRect().width) : 0;
      };
      const panel = getComputedStyle(document.querySelector(".sidebar-panel")!);
      const nav = getComputedStyle(document.querySelector(".sidebar-nav")!);
      const group = getComputedStyle(document.querySelector(".nav-group")!);
      return {
        panelPadding: number(panel.paddingLeft),
        panelGap: number(panel.rowGap),
        navGap: number(nav.rowGap),
        navOverflowX: nav.overflowX,
        navOverflowY: nav.overflowY,
        navPaddingLeft: number(nav.paddingLeft),
        navPaddingRight: number(nav.paddingRight),
        groupPaddingTop: number(group.paddingTop),
        groupPaddingRight: number(group.paddingRight),
        groupPaddingBottom: number(group.paddingBottom),
        groupPaddingLeft: number(group.paddingLeft),
        groupWidth: box(".nav-group"),
        summaryWidth: box(".nav-group summary"),
        itemWidth: box(".nav-item")
      };
    });
    expect(collapsedSpacing).toEqual({
      panelPadding: 10,
      panelGap: 10,
      navGap: 6,
      navOverflowX: "visible",
      navOverflowY: "visible",
      navPaddingLeft: 0,
      navPaddingRight: 0,
      groupPaddingTop: 0,
      groupPaddingRight: 0,
      groupPaddingBottom: 0,
      groupPaddingLeft: 0,
      groupWidth: 34,
      summaryWidth: 32,
      itemWidth: 32
    });
    const glyphBox = await nav
      .getByRole("link", { name: "Articles", exact: true })
      .locator(".pixel-glyph")
      .boundingBox();
    expect(glyphBox?.width ?? 0).toBeGreaterThan(8);

    const collapsedAlignment = await page.evaluate(() => {
      const rectOf = (element: Element | null) => {
        if (!element) return null;
        return element.getBoundingClientRect();
      };
      const centerOf = (element: Element | null) => {
        const rect = rectOf(element);
        if (!rect) return Number.NaN;
        return rect.left + rect.width / 2;
      };
      const isVisible = (element: Element) => {
        const rect = rectOf(element);
        if (!rect) return false;
        return rect.width > 0 && rect.height > 0;
      };
      const panelCenter = centerOf(document.querySelector(".sidebar-panel"));
      const groupDeltas = Array.from(document.querySelectorAll(".nav-group__icon"))
        .filter(isVisible)
        .map((icon) => Math.abs(centerOf(icon) - panelCenter));
      const itemDeltas = Array.from(document.querySelectorAll(".nav-item .sidebar-row__icon"))
        .filter(isVisible)
        .map((icon) => Math.abs(centerOf(icon) - panelCenter));
      const group = document.querySelector(".nav-group");
      const arrow = group?.querySelector(".group-toggle-icon");
      const glyph = group?.querySelector(".nav-group__icon .pixel-glyph");
      const arrowStyle = arrow ? getComputedStyle(arrow) : null;
      const glyphStyle = glyph ? getComputedStyle(glyph) : null;
      return {
        maxGroupDelta: Math.max(...groupDeltas),
        maxItemDelta: Math.max(...itemDeltas),
        arrowVisibility: arrowStyle?.visibility,
        arrowOpacity: Number.parseFloat(arrowStyle?.opacity ?? "1"),
        glyphVisibility: glyphStyle?.visibility,
        glyphOpacity: Number.parseFloat(glyphStyle?.opacity ?? "0")
      };
    });
    expect(collapsedAlignment.maxGroupDelta).toBeLessThanOrEqual(1);
    expect(collapsedAlignment.maxItemDelta).toBeLessThanOrEqual(1);
    expect(collapsedAlignment.arrowVisibility).toBe("hidden");
    expect(collapsedAlignment.arrowOpacity).toBeLessThan(0.2);
    expect(collapsedAlignment.glyphVisibility).toBe("visible");
    expect(collapsedAlignment.glyphOpacity).toBeGreaterThan(0.8);

    const activeGroup = await page.locator(".nav-group:has(.nav-item.is-active)").evaluate((node) => {
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, "::before");
      return {
        background: style.backgroundColor,
        border: style.borderTopColor,
        connector: before.content
      };
    });
    expect(activeGroup.border).not.toBe("rgba(0, 0, 0, 0)");
    expect(activeGroup.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(activeGroup.connector).toBe("none");

    const activeConnector = await page.evaluate(() => {
      const group = document.querySelector(".nav-group:has(.nav-item.is-active)");
      if (!group) return null;
      const style = getComputedStyle(group, "::before");
      return { content: style.content, height: Number.parseFloat(style.height) };
    });
    expect(activeConnector?.content).toBe("none");

    const activeSummary = page.locator(".nav-group:has(.nav-item.is-active) summary");
    const arrowBeforeHover = await activeSummary
      .locator(".group-toggle-icon")
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
    expect(arrowBeforeHover).toBeLessThan(0.2);
    await activeSummary.hover();
    await expect
      .poll(async () =>
        activeSummary.locator(".group-toggle-icon").evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.7);
    const hoverIconState = await activeSummary.evaluate((summary) => {
      const arrow = summary.querySelector(".group-toggle-icon");
      const glyph = summary.querySelector(".nav-group__icon .pixel-glyph");
      return {
        arrowVisibility: arrow ? getComputedStyle(arrow).visibility : "",
        glyphVisibility: glyph ? getComputedStyle(glyph).visibility : ""
      };
    });
    expect(hoverIconState.arrowVisibility).toBe("visible");
    expect(hoverIconState.glyphVisibility).toBe("hidden");
    const hoverIconAlignment = await activeSummary.evaluate((summary) => {
      const icon = summary.querySelector(".nav-group__icon")!;
      const arrow = summary.querySelector(".group-toggle-icon")!;
      const iconRect = icon.getBoundingClientRect();
      const arrowRect = arrow.getBoundingClientRect();
      const style = getComputedStyle(arrow);
      const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      const iconCenter = center(iconRect);
      const arrowCenter = center(arrowRect);
      return {
        centerDeltaX: Math.abs(arrowCenter.x - iconCenter.x),
        centerDeltaY: Math.abs(arrowCenter.y - iconCenter.y),
        transformBox: style.getPropertyValue("transform-box"),
        transformOrigin: style.transformOrigin
      };
    });
    expect(hoverIconAlignment.centerDeltaX).toBeLessThanOrEqual(1);
    expect(hoverIconAlignment.centerDeltaY).toBeLessThanOrEqual(1);
    expect(hoverIconAlignment.transformBox).toBe("border-box");
    expect(hoverIconAlignment.transformOrigin).toBe("8px 8px");

    const networkGroup = page.locator(".nav-group").last();
    await expect.poll(async () => networkGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
    const githubLink = nav.getByRole("link", { name: "GitHub" });
    await expect(githubLink.locator(".external-link-icon")).toBeVisible();
    await expect(githubLink).toHaveAttribute("target", "_blank");

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(root).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("desktop collapsed overlay stays layered during navigation transition", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only collapsed overlay navigation check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const sidebar = page.locator("[data-sidebar]");
    const panel = page.locator(".sidebar-panel");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await sidebar.hover();
    await expect(root).toHaveClass(/sidebar-overlay-open/);

    const projectsLink = nav.getByRole("link", { name: "Projects", exact: true });
    const projectsBox = await projectsLink.boundingBox();
    expect(projectsBox).not.toBeNull();
    await page.mouse.move(
      (projectsBox?.x ?? 0) + (projectsBox?.width ?? 0) - 8,
      (projectsBox?.y ?? 0) + (projectsBox?.height ?? 0) / 2
    );
    await page.mouse.down();
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-astro-transition", /forward|back/);
    const sidebarTransitionSnapshot = await root.evaluate((node) => {
      const oldStyle = getComputedStyle(node, "::view-transition-old(sidebar-shell)");
      const newStyle = getComputedStyle(node, "::view-transition-new(sidebar-shell)");
      return {
        oldOpacity: Number(oldStyle.opacity),
        newOpacity: Number(newStyle.opacity)
      };
    });
    expect(sidebarTransitionSnapshot).toEqual({
      oldOpacity: 0,
      newOpacity: 1
    });
    await page.mouse.move(1000, 520);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(projectsLink).toHaveAttribute("aria-current", "page");
    await expect(root).toHaveClass(/sidebar-collapsed/);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBeGreaterThan(240);
    const transitionLayers = await page.evaluate(() =>
      Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules).map((rule) => rule.cssText);
          } catch {
            return [];
          }
        })
        .filter((rule) => rule.includes("sidebar-shell") || rule.includes("view-transition-group(page-content)"))
    );
    expect(transitionLayers.some((rule) => rule.includes("view-transition-group(sidebar-shell)") && rule.includes("z-index: 8"))).toBe(true);
    expect(transitionLayers.some((rule) => rule.includes("view-transition-group(page-content)") && rule.includes("z-index: 1"))).toBe(true);

    await expect.poll(async () => root.evaluate((node) => node.hasAttribute("data-astro-transition"))).toBe(false);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);
  });

  test("desktop collapsed overlay hover stays open after client navigation", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only collapsed overlay hover check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const sidebar = page.locator("[data-sidebar]");
    const panel = page.locator(".sidebar-panel");

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(root).toHaveClass(/sidebar-collapsed/);
    await page.mouse.move(1000, 520);
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);

    const allArticles = page.getByRole("link", { name: "All articles" });
    await allArticles.scrollIntoViewIfNeeded();
    await allArticles.click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveClass(/sidebar-collapsed/);

    const collapsedSidebarBox = await sidebar.boundingBox();
    expect(collapsedSidebarBox).not.toBeNull();
    const hoverX = (collapsedSidebarBox?.x ?? 0) + 6;
    const hoverY = (collapsedSidebarBox?.y ?? 0) + 120;
    await page.mouse.move(hoverX, hoverY);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await page.mouse.move(hoverX + 1, hoverY + 1);
    await page.waitForTimeout(160);
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(240);
  });

  test("sidebar group collapsed state survives navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const archiveGroup = page.locator("[data-nav-group='Archive']");
    await expect.poll(async () => archiveGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);

    await archiveGroup.locator("summary").click();
    await expect.poll(async () => archiveGroup.evaluate((node) => node.classList.contains("is-collapsing"))).toBe(true);
    await nav.getByRole("link", { name: "About", exact: true }).click();

    await expect(page).toHaveURL(/\/about\/$/);
    await expect
      .poll(async () =>
        page.locator("[data-nav-group='Archive']").evaluate((node) => ({
          open: (node as HTMLDetailsElement).open,
          collapsing: node.classList.contains("is-collapsing"),
          expanding: node.classList.contains("is-expanding"),
          visibility: getComputedStyle(node.querySelector(".nav-items")!).visibility,
          height: Math.round(node.querySelector(".nav-items")!.getBoundingClientRect().height)
        }))
      )
      .toEqual({
        open: false,
        collapsing: false,
        expanding: false,
        visibility: "hidden",
        height: 0
      });
  });

  test("sidebar group item lists animate open and closed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const archiveGroup = page.locator(".nav-group").nth(1);
    const archiveItems = archiveGroup.locator(".nav-items");
    const initialHeight = await archiveItems.evaluate((node) => node.getBoundingClientRect().height);
    expect(initialHeight).toBeGreaterThan(40);

    const collapseCleanupPromise = archiveGroup.evaluate(
      (node) =>
        new Promise<{
          before: { height: number; paddingTop: number; paddingBottom: number; collapsing: boolean };
          after: { height: number; paddingTop: number; paddingBottom: number; collapsing: boolean };
        }>(
          (resolve) => {
            const items = node.querySelector(".nav-items")!;
            const snapshot = () => {
              const style = getComputedStyle(items);
              return {
                height: items.getBoundingClientRect().height,
                paddingTop: Number.parseFloat(style.paddingTop) || 0,
                paddingBottom: Number.parseFloat(style.paddingBottom) || 0,
                collapsing: node.classList.contains("is-collapsing")
              };
            };
            let frame = 0;
            let lastCollapsingSample: ReturnType<typeof snapshot> | null = null;
            let observer: MutationObserver;
            let timeout = 0;

            const cleanup = () => {
              cancelAnimationFrame(frame);
              observer.disconnect();
              clearTimeout(timeout);
            };

            const sample = () => {
              const current = snapshot();
              if (current.collapsing) lastCollapsingSample = current;
              frame = requestAnimationFrame(sample);
            };

            observer = new MutationObserver(() => {
              const current = snapshot();
              if (current.collapsing) {
                lastCollapsingSample = current;
                return;
              }

              if (!lastCollapsingSample) return;
              cleanup();
              resolve({ before: lastCollapsingSample, after: current });
            });
            timeout = window.setTimeout(() => {
              const current = snapshot();
              cleanup();
              resolve({ before: lastCollapsingSample ?? current, after: current });
            }, 700);

            observer.observe(node, { attributes: true, attributeFilter: ["class"] });
            frame = requestAnimationFrame(sample);
          }
        )
    );

    await archiveGroup.locator("summary").click();
    await expect.poll(async () => archiveGroup.evaluate((node) => node.classList.contains("is-collapsing"))).toBe(true);
    await expect
      .poll(async () =>
        archiveGroup.evaluate((node) => {
          const arrow = node.querySelector(".group-toggle-icon")!;
          const transform = getComputedStyle(arrow).transform;
          const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
          const angle = Math.abs((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI);
          return (node as HTMLDetailsElement).open && node.classList.contains("is-collapsing") && angle < 70;
        })
      )
      .toBe(true);
    await expect
      .poll(async () => archiveItems.evaluate((node) => node.getBoundingClientRect().height))
      .toBeLessThan(initialHeight);
    await expect.poll(async () => archiveGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    const closedState = await archiveItems.evaluate((node) => ({
      display: getComputedStyle(node).display,
      visibility: getComputedStyle(node).visibility,
      height: node.getBoundingClientRect().height
    }));
    expect(closedState.display).toBe("grid");
    expect(closedState.visibility).toBe("hidden");
    expect(closedState.height).toBe(0);
    const collapseCleanup = await collapseCleanupPromise;
    expect(collapseCleanup.before.collapsing).toBe(true);
    expect(collapseCleanup.after.collapsing).toBe(false);
    expect(Math.abs(collapseCleanup.after.height - collapseCleanup.before.height)).toBeLessThanOrEqual(4);
    expect(Math.abs(collapseCleanup.after.paddingTop - collapseCleanup.before.paddingTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(collapseCleanup.after.paddingBottom - collapseCleanup.before.paddingBottom)).toBeLessThanOrEqual(1);

    const expandSamples = archiveGroup.evaluate(
      (node) =>
        new Promise<Array<{ height: number; expanding: boolean }>>((resolve) => {
          const items = node.querySelector(".nav-items")!;
          const samples: Array<{ height: number; expanding: boolean }> = [];
          const start = performance.now();

          const sample = () => {
            samples.push({
              height: items.getBoundingClientRect().height,
              expanding: node.classList.contains("is-expanding")
            });

            if (performance.now() - start < 520) {
              requestAnimationFrame(sample);
            } else {
              resolve(samples);
            }
          };

          requestAnimationFrame(sample);
        })
    );

    await archiveGroup.locator("summary").click();
    await expect.poll(async () => archiveGroup.evaluate((node) => node.classList.contains("is-expanding"))).toBe(true);
    await expect.poll(async () => archiveGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
    await expect
      .poll(async () => archiveItems.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(40);
    const samples = await expandSamples;
    const cleanupIndex = samples.findIndex((sample, index) => index > 0 && samples[index - 1].expanding && !sample.expanding);
    expect(cleanupIndex).toBeGreaterThan(0);
    expect(Math.abs(samples[cleanupIndex].height - samples[cleanupIndex - 1].height)).toBeLessThanOrEqual(4);
    await expect
      .poll(async () =>
        archiveGroup.evaluate((node) => ({
          open: (node as HTMLDetailsElement).open,
          animating: node.classList.contains("is-expanding") || node.classList.contains("is-collapsing"),
          display: getComputedStyle(node.querySelector(".nav-items")!).display,
          height: Math.round(node.querySelector(".nav-items")!.getBoundingClientRect().height)
        }))
      )
      .toEqual({
        open: true,
        animating: false,
        display: "grid",
        height: Math.round(initialHeight)
      });
  });

  test("theme and accent controls recolor surfaces", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) < 721) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const root = page.locator("html");
    const before = await page.locator(".entry-card__link").first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderColor };
    });

    const themeToggle = page.getByRole("button", { name: "Switch to dark theme" });
    await expect(themeToggle.locator("[data-theme-label]")).toHaveText("Light");
    await themeToggle.click();
    await expect(root).toHaveAttribute("data-theme-mode", "black");
    await expect(root).toHaveAttribute("data-theme", "black");
    await expect(page.getByRole("button", { name: "Switch to system theme" }).locator("[data-theme-label]")).toHaveText("Dark");
    const blackGridSoft = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--grid-line-soft").trim());
    expect(blackGridSoft.includes("/ 0.12") || blackGridSoft === "#b9843b1f").toBe(true);
    await expect
      .poll(async () =>
        page.locator(".entry-card__link").first().evaluate((node) => getComputedStyle(node).backgroundColor)
      )
      .not.toBe(before.background);

    const afterTheme = await page.locator(".entry-card__link").first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(afterTheme.background).not.toBe(before.background);

    await expect(page.getByRole("button", { name: "Cyan accent" })).toHaveCount(0);
    await page.locator("[data-accent-input]").evaluate((node: HTMLInputElement) => {
      node.value = "#2aa8c8";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(root).toHaveAttribute("data-accent", "custom");
    const cyanTint = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--accent-tint").trim());
    expect(cyanTint).not.toBe("#4b4432");
    const cyanPreview = await root.evaluate((node) => node.style.getPropertyValue("--accent-preview").trim());
    expect(cyanPreview).toBeTruthy();
    const afterAccent = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--accent").trim());
    expect(afterAccent).toBe(cyanPreview);

    await page.locator("[data-accent-input]").evaluate((node: HTMLInputElement) => {
      node.value = "#050505";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect
      .poll(async () =>
        root.evaluate((node) => getComputedStyle(node).getPropertyValue("--accent").trim())
      )
      .not.toBe(afterAccent);
    const contrastResult = await page.locator(".entry-card__link").first().evaluate((node) => {
      const cardStyle = getComputedStyle(node);
      const icon = node.querySelector(".entry-card__glyph");
      if (!icon) return null;
      const iconStyle = getComputedStyle(icon);
      return { icon: iconStyle.color, card: cardStyle.backgroundColor, body: getComputedStyle(document.body).backgroundColor };
    });
    const body = parseColor(contrastResult!.body);
    expect(contrast(composite(parseColor(contrastResult!.icon), body), composite(parseColor(contrastResult!.card), body))).toBeGreaterThan(3);

    await page.locator("[data-accent-reset]").evaluate((node: HTMLButtonElement) => node.click());
    await expect(page.getByRole("button", { name: "Reset accent to auto" })).toHaveAttribute("aria-pressed", "true");
    await expect(root).not.toHaveAttribute("data-accent", "custom");
    await expect.poll(async () => root.evaluate((node) => node.style.getPropertyValue("--accent-preview").trim())).toBe("");
  });

  test("theme toggle supports system mode and follows color scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) < 721) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const root = page.locator("html");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(root).toHaveAttribute("data-theme-mode", "black");
    await expect(root).toHaveAttribute("data-theme", "black");

    await page.getByRole("button", { name: "Switch to system theme" }).click();
    await expect(root).toHaveAttribute("data-theme-mode", "system");
    await expect(root).toHaveAttribute("data-theme", "black");
    await expect(page.getByRole("button", { name: "Switch to light theme" }).locator("[data-theme-label]")).toHaveText(
      "System"
    );

    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).toHaveAttribute("data-theme-mode", "system");
    await expect(root).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(root).toHaveAttribute("data-theme-mode", "light");
    await expect(root).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Switch to dark theme" }).locator("[data-theme-label]")).toHaveText(
      "Light"
    );
  });

  test("cards use a hover arrow affordance", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const card = page.locator(".entry-card__link").first();
    const arrow = card.locator(".entry-card__arrow");
    await expect(arrow.locator(".arrow-icon__svg[data-icon-style]")).toHaveCount(11);
    await expect
      .poll(async () => arrow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity)))
      .toBeLessThan(0.2);

    await card.hover();
    await expect
      .poll(async () =>
        arrow.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.7);
  });

  test("stored theme and accent survive navigation without default-scheme reset", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hlcaptain-theme", "black");
      localStorage.setItem("hlcaptain-accent", "#050505");
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "black");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
    const beforeNav = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--accent"));
    expect(beforeNav.trim()).not.toBe("#050505");

    await page.getByRole("link", { name: "Read articles" }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "black");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
    const afterNav = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--accent"));
    expect(afterNav.trim()).toBe(beforeNav.trim());
  });

  test("debug menu changes background, arrow, and Signal styles and keeps them through navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });
    const firstArrow = page.locator(".entry-card__arrow").first();
    const firstSignalImage = page.locator("img[data-signal-image]").first();
    const firstSignalMedia = page.locator(".preview-feed__media").first();
    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();
    await expect(page.locator("button[data-arrow-style]")).toHaveCount(11);
    await expect(page.locator("button[data-grid-pattern]")).toHaveCount(7);
    await expect(page.locator("button[data-signal-structure]")).toHaveCount(0);
    await expect(page.locator("[data-signal-structure-current]")).toHaveCount(0);
    await expect(page.locator("button[data-signal-inner-layout]")).toHaveCount(3);
    await expect(page.locator("button[data-signal-sizing]")).toHaveCount(2);
    await expect(page.locator("button[data-signal-layout]")).toHaveCount(14);
    await expect(page.locator("button[data-signal-ratio]")).toHaveCount(6);
    await expect(page.locator("[data-grid-pattern-current]")).toHaveText("Grid");
    await expect(page.locator("[data-signal-inner-current]")).toHaveText("Article stack");
    await expect(page.locator("[data-signal-sizing-current]")).toHaveText("Auto");
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Wide crop");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Original 16:9");
    await expect(root).toHaveAttribute("data-grid-pattern", "grid");
    await expect(root).toHaveAttribute("data-signal-inner-layout", "article-stack");
    await expect(root).toHaveAttribute("data-signal-sizing", "auto");
    await expect(root).not.toHaveAttribute("data-signal-structure", /.*/);
    await expect(root).toHaveAttribute("data-signal-layout", "wide-crop");
    await expect(root).toHaveAttribute("data-signal-ratio", "original");
    await expect(firstSignalImage).toHaveAttribute("src", "/visuals/article-preview.svg");
    await expect(page.locator("button[data-brand-style]")).toHaveCount(0);
    await expect(page.locator("[data-brand-current]")).toHaveCount(0);
    await expect(page.locator(".brand-mark")).toHaveCount(0);
    await expect(root).not.toHaveAttribute("data-brand-style", /.*/);
    await expect(firstArrow.locator(".arrow-icon__svg[data-icon-style]")).toHaveCount(11);

    await page.getByRole("button", { name: "Phosphor" }).click();
    await expect(root).toHaveAttribute("data-arrow-style", "phosphor");
    await expect(page.getByRole("button", { name: "Phosphor" })).toHaveAttribute("aria-pressed", "true");
    const iconWidth = await firstArrow.evaluate((node) => getComputedStyle(node).width);
    expect(Number.parseFloat(iconWidth)).toBeGreaterThanOrEqual(24);
    await expect(firstArrow.locator('.arrow-icon__svg[data-icon-style="phosphor"]')).toBeVisible();

    await page.getByRole("button", { name: "Circuit" }).click();
    await expect(root).toHaveAttribute("data-grid-pattern", "circuit");
    await expect(page.getByRole("button", { name: "Circuit" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-grid-pattern-current]")).toHaveText("Circuit");

    await page.getByRole("button", { name: "Tablet dynamic" }).click();
    await expect(root).toHaveAttribute("data-signal-sizing", "tablet-dynamic");
    await expect(page.getByRole("button", { name: "Tablet dynamic" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-sizing-current]")).toHaveText("Tablet dynamic");

    await page.locator('button[data-signal-sizing="auto"]').click();
    await expect(root).toHaveAttribute("data-signal-sizing", "auto");
    await expect(page.locator('button[data-signal-sizing="auto"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-sizing-current]")).toHaveText("Auto");

    await page.getByRole("button", { name: "Tablet dynamic" }).click();
    await expect(root).toHaveAttribute("data-signal-sizing", "tablet-dynamic");
    await expect(page.getByRole("button", { name: "Tablet dynamic" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-sizing-current]")).toHaveText("Tablet dynamic");

    await page.getByRole("button", { name: "Thumbnail start" }).click();
    await expect(root).toHaveAttribute("data-signal-inner-layout", "article-stack-start");
    await expect(page.getByRole("button", { name: "Thumbnail start" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-inner-current]")).toHaveText("Thumbnail start");
    const startMediaState = await page.locator("[data-preview-item].is-active .preview-feed__media").evaluate((node) => {
      const style = getComputedStyle(node);
      const imageStyle = getComputedStyle(node.querySelector("img")!);
      return {
        alignSelf: style.alignSelf,
        justifySelf: style.justifySelf,
        objectPosition: imageStyle.objectPosition
      };
    });
    expect(startMediaState.alignSelf).toBe("start");
    expect(startMediaState.justifySelf).toBe("start");
    expect(startMediaState.objectPosition).toContain("0%");

    await page.getByRole("button", { name: "Letterbox" }).click();
    await expect(root).toHaveAttribute("data-signal-layout", "letterbox");
    await expect(page.getByRole("button", { name: "Letterbox" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Letterbox");

    await page.getByRole("button", { name: "Mixed deck" }).click();
    await expect(root).toHaveAttribute("data-signal-ratio", "mixed");
    await expect(page.getByRole("button", { name: "Mixed deck" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Mixed deck");
    await expect(firstSignalImage).toHaveAttribute("src", "/visuals/signal-article-21-9.svg");
    await expect(firstSignalMedia).toHaveAttribute("data-signal-aspect", "21:9");

    await page.getByRole("button", { name: "Close debug menu" }).click();
    await expect(page.locator("[data-debug-panel]")).toBeHidden();
    await page.getByRole("link", { name: "Read articles" }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-arrow-style", "phosphor");
    await expect(root).toHaveAttribute("data-grid-pattern", "circuit");
    await expect(root).toHaveAttribute("data-signal-inner-layout", "article-stack-start");
    await expect(root).toHaveAttribute("data-signal-sizing", "tablet-dynamic");
    await expect(root).toHaveAttribute("data-signal-layout", "letterbox");
    await expect(root).toHaveAttribute("data-signal-ratio", "mixed");
    await expect(root).not.toHaveAttribute("data-brand-style", /.*/);

    const panel = page.locator("[data-debug-panel]");
    if (await panel.evaluate((node: HTMLElement) => node.hidden)) {
      await debugToggle.click();
    }
    await expect(page.getByRole("button", { name: "Phosphor" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Circuit" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-grid-pattern-current]")).toHaveText("Circuit");
    await expect(page.getByRole("button", { name: "Thumbnail start" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-inner-current]")).toHaveText("Thumbnail start");
    await expect(page.getByRole("button", { name: "Tablet dynamic" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-sizing-current]")).toHaveText("Tablet dynamic");
    await expect(page.getByRole("button", { name: "Letterbox" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-layout-current]")).toHaveText("Letterbox");
    await expect(page.getByRole("button", { name: "Mixed deck" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-signal-ratio-current]")).toHaveText("Mixed deck");
    await expect(page.locator("button[data-brand-style]")).toHaveCount(0);
  });

  test("preview feed expands selected items and moves its rail", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const feed = page.locator("[data-preview-feed]");
    const activeItem = feed.locator("[data-preview-item].is-active");
    await expect(feed.locator("[data-preview-item]")).toHaveCount(4);
    await expect(activeItem.locator(".preview-feed__kind")).toHaveText("Article");
    await expect(activeItem.locator(".preview-feed__trigger > span").last()).toHaveText(/,/);
    await expect(activeItem.locator(".preview-feed__media")).toBeVisible();
    await expect(activeItem.locator(".preview-feed__trigger strong")).toBeVisible();
    await expect(activeItem.locator(".preview-feed__detail-title")).toBeHidden();
    await expect(activeItem.locator(".preview-feed__description")).toBeVisible();
    const articleStackOrder = await activeItem.evaluate((node) => {
      const kind = node.querySelector(".preview-feed__kind")!.getBoundingClientRect();
      const media = node.querySelector(".preview-feed__media")!.getBoundingClientRect();
      const title = node.querySelector(".preview-feed__trigger strong")!.getBoundingClientRect();
      const titleSpacer = node.querySelector(".preview-feed__detail-title")!.getBoundingClientRect();
      const description = node.querySelector(".preview-feed__description")!.getBoundingClientRect();
      const titleStyle = getComputedStyle(node.querySelector(".preview-feed__trigger strong")!);
      return {
        positions: [kind.top, media.top, title.top, description.top],
        titlePosition: titleStyle.position,
        titleTransition: titleStyle.transitionProperty,
        titleSpacerDelta: Math.abs(title.top - titleSpacer.top)
      };
    });
    expect(articleStackOrder.positions[0]).toBeLessThan(articleStackOrder.positions[1]);
    expect(articleStackOrder.positions[1]).toBeLessThan(articleStackOrder.positions[2]);
    expect(articleStackOrder.positions[2]).toBeLessThan(articleStackOrder.positions[3]);
    expect(articleStackOrder.titlePosition).toBe("absolute");
    expect(articleStackOrder.titleTransition).toContain("top");
    expect(articleStackOrder.titleSpacerDelta).toBeLessThanOrEqual(2);
    const firstRail = await feed.locator("[data-preview-rail]").boundingBox();
    const beforeHeight = await feed.evaluate((node) => node.getBoundingClientRect().height);

    await feed.locator("[data-preview-trigger]").nth(1).click();
    await expect(feed.locator("[data-preview-item]").nth(1)).toHaveClass(/is-active/);
    await expect(feed.locator("[data-preview-item]").nth(1).locator(".preview-feed__media")).toBeVisible();
    await expect(feed.locator("[data-preview-item]").first()).not.toHaveClass(/is-active/);
    await expect(feed.getByRole("link", { name: /open/i })).toHaveCount(0);
    const sampledHeights = await feed.evaluate(
      (node) =>
        new Promise<number[]>((resolve) => {
          const values: number[] = [];
          const started = performance.now();
          const sample = () => {
            values.push(node.getBoundingClientRect().height);
            if (performance.now() - started > 520) {
              resolve(values);
            } else {
              requestAnimationFrame(sample);
            }
          };
          sample();
        })
    );
    expect(Math.max(...sampledHeights) - Math.min(...sampledHeights)).toBeLessThanOrEqual(1);
    const afterHeight = await feed.evaluate((node) => node.getBoundingClientRect().height);
    expect(Math.abs(afterHeight - beforeHeight)).toBeLessThanOrEqual(1);
    await expect
      .poll(async () => {
        const box = await feed.locator("[data-preview-rail]").boundingBox();
        return Math.abs((box?.y ?? 0) - (firstRail?.y ?? 0));
      })
      .toBeGreaterThan(8);
  });

  test("preview feed keeps its height during interrupted item selection", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const feed = page.locator("[data-preview-feed]");
    const beforeHeight = await feed.evaluate((node) => node.getBoundingClientRect().height);

    const sampledHeightsPromise = feed.evaluate(
      (node) =>
        new Promise<number[]>((resolve) => {
          const values: number[] = [];
          const started = performance.now();
          const sample = () => {
            values.push(node.getBoundingClientRect().height);
            if (performance.now() - started > 760) {
              resolve(values);
            } else {
              requestAnimationFrame(sample);
            }
          };
          sample();
        })
    );

    await feed.locator("[data-preview-trigger]").nth(1).click();
    await expect(feed.locator("[data-preview-item]").nth(1)).toHaveClass(/is-active/);
    await page.waitForTimeout(110);
    await feed.locator("[data-preview-trigger]").nth(2).click();
    await expect(feed.locator("[data-preview-item]").nth(2)).toHaveClass(/is-active/);

    const sampledHeights = await sampledHeightsPromise;
    expect(Math.max(...sampledHeights) - Math.min(...sampledHeights)).toBeLessThanOrEqual(1);

    const afterHeight = await feed.evaluate((node) => node.getBoundingClientRect().height);
    expect(Math.abs(afterHeight - beforeHeight)).toBeLessThanOrEqual(1);
  });

  test("preview feed uses full-card two-step navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const feed = page.locator("[data-preview-feed]");
    const secondItem = feed.locator("[data-preview-item]").nth(1);

    const feedBackgroundImage = await feed.evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(feedBackgroundImage).toBe("none");
    await expect(feed.getByRole("link", { name: /open/i })).toHaveCount(0);

    await secondItem.click();
    await expect(secondItem).toHaveClass(/is-active/);
    await expect(page).toHaveURL(/\/$/);
    await page.mouse.move(20, 20);
    await expect
      .poll(async () => secondItem.evaluate((node) => getComputedStyle(node).boxShadow))
      .toBe("none");
    await expect
      .poll(async () =>
        secondItem.locator(".preview-feed__arrow").evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))
      )
      .toBeLessThan(0.2);

    await page.evaluate(() => {
      const state = window as typeof window & { __hlSignalTransitionEvents?: number };
      state.__hlSignalTransitionEvents = 0;
      document.addEventListener(
        "astro:before-swap",
        () => {
          state.__hlSignalTransitionEvents = (state.__hlSignalTransitionEvents ?? 0) + 1;
        },
        { once: true }
      );
    });
    await secondItem.click();
    await expect(page).toHaveURL(/\/articles\/interface-motion\/$/);
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as typeof window & { __hlSignalTransitionEvents?: number }).__hlSignalTransitionEvents ?? 0
        )
      )
      .toBeGreaterThan(0);
  });

  test("preview feed thumbnail hover arrow uses elevated card affordance", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop pointer-hover affordance check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const feed = page.locator("[data-preview-feed]");
    const firstItem = feed.locator("[data-preview-item]").first();
    const arrow = firstItem.locator(".preview-feed__arrow");

    await firstItem.hover();
    await expect
      .poll(async () =>
        firstItem
          .locator(".preview-feed__arrow")
          .evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))
      )
      .toBeGreaterThan(0.7);
    const hoverState = await firstItem.evaluate((node) => {
      const style = getComputedStyle(node);
      const arrowStyle = getComputedStyle(node.querySelector(".preview-feed__arrow")!);
      return {
        boxShadow: style.boxShadow,
        transform: style.transform,
        arrowOpacity: Number.parseFloat(arrowStyle.opacity),
        arrowTransform: arrowStyle.transform,
        arrowWidth: Number.parseFloat(arrowStyle.width),
        arrowHeight: Number.parseFloat(arrowStyle.height),
        arrowIconWidth: Number.parseFloat(getComputedStyle(node.querySelector(".preview-feed__arrow .arrow-icon")!).width),
        arrowBackground: arrowStyle.backgroundColor,
        arrowColor: arrowStyle.color
      };
    });
    expect(hoverState.boxShadow).not.toBe("none");
    expect(hoverState.transform).not.toBe("none");
    expect(hoverState.arrowOpacity).toBeGreaterThan(0.7);
    expect(hoverState.arrowTransform).not.toBe("none");
    expect(hoverState.arrowWidth).toBeGreaterThanOrEqual(42);
    expect(hoverState.arrowHeight).toBeGreaterThanOrEqual(42);
    expect(hoverState.arrowIconWidth).toBeGreaterThanOrEqual(20);
    expect(contrast(parseColor(hoverState.arrowBackground), parseColor(hoverState.arrowColor))).toBeGreaterThan(3);
    await expect(arrow).toBeVisible();

    await page.mouse.move(20, 20);
    await expect.poll(async () => firstItem.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
    await expect
      .poll(async () =>
        firstItem.locator(".preview-feed__arrow").evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity))
      )
      .toBeLessThan(0.2);
  });

  test("preview feed tablet thumbnail variants change shape and fit", async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    test.skip(viewportWidth <= 720 || viewportWidth > 1040, "Tablet-only Signal variant geometry");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const root = page.locator("html");
    const feed = page.locator("[data-preview-feed]");
    const detail = feed.locator("[data-preview-item].is-active .preview-feed__detail");
    const media = detail.locator(".preview-feed__media");
    const description = detail.locator(".preview-feed__description");
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });

    await expect(root).toHaveAttribute("data-signal-layout", "wide-crop");
    await expect(media).toBeVisible();

    const measure = async () => {
      const [feedBox, detailBox, mediaBox, descriptionBox] = await Promise.all([
        feed.boundingBox(),
        detail.boundingBox(),
        media.boundingBox(),
        description.boundingBox()
      ]);
      const detailStyle = await detail.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          rows: style.gridTemplateRows.trim().split(/\s+/).filter(Boolean).length
        };
      });
      const mediaStyle = await media.evaluate((node) => {
        const image = node.querySelector("img")!;
        const style = getComputedStyle(image);
        return {
          fit: style.objectFit,
          position: style.objectPosition
        };
      });

      return {
        detailHeight: detailBox?.height ?? 0,
        detailWidth: detailBox?.width ?? 0,
        detailX: detailBox?.x ?? 0,
        detailY: detailBox?.y ?? 0,
        mediaX: mediaBox?.x ?? 0,
        mediaY: mediaBox?.y ?? 0,
        mediaHeight: mediaBox?.height ?? 0,
        mediaWidth: mediaBox?.width ?? 0,
        mediaTopGap: (mediaBox?.y ?? 0) - (detailBox?.y ?? 0),
        mediaBottomGap: (detailBox?.y ?? 0) + (detailBox?.height ?? 0) - ((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0)),
        descriptionX: descriptionBox?.x ?? 0,
        descriptionY: descriptionBox?.y ?? 0,
        feedHeight: feedBox?.height ?? 0,
        columns: detailStyle.columns,
        rows: detailStyle.rows,
        fit: mediaStyle.fit,
        position: mediaStyle.position
      };
    };

    const selectVariant = async (name: string, value: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-layout", value);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      return measure();
    };
    const expectStableFeedHeight = (value: { feedHeight: number }, reference: { feedHeight: number }) => {
      expect(Math.abs(value.feedHeight - reference.feedHeight)).toBeLessThanOrEqual(1);
    };
    const expectBalancedMediaGaps = (value: { mediaTopGap: number; mediaBottomGap: number }) => {
      expect(value.mediaTopGap).toBeGreaterThanOrEqual(0);
      expect(value.mediaBottomGap).toBeGreaterThanOrEqual(0);
      expect(Math.abs(value.mediaTopGap - value.mediaBottomGap)).toBeLessThanOrEqual(1);
    };
    const expectTopAlignedMedia = (value: { mediaTopGap: number }) => {
      expect(value.mediaTopGap).toBeLessThanOrEqual(1);
    };
    const selectRatio = async (name: string, value: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-ratio", value);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    };

    const wideCrop = await measure();
    expect(wideCrop.feedHeight).toBeGreaterThanOrEqual(390);
    expect(wideCrop.feedHeight).toBeLessThanOrEqual(420);
    expect(wideCrop.columns).toBe(2);
    expect(wideCrop.fit).toBe("cover");
    expect(wideCrop.mediaHeight).toBeLessThan(wideCrop.detailHeight * 0.82);
    expect(wideCrop.mediaWidth).toBeGreaterThan(wideCrop.mediaHeight);
    expect(wideCrop.descriptionX).toBeGreaterThan(wideCrop.mediaX + wideCrop.mediaWidth);
    expectBalancedMediaGaps(wideCrop);

    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();

    const split = await selectVariant("Split", "split");
    expectStableFeedHeight(split, wideCrop);
    expect(split.columns).toBe(2);
    expect(split.mediaHeight).toBeGreaterThan(wideCrop.mediaHeight + 24);
    expect(Math.abs(split.mediaHeight - split.detailHeight)).toBeLessThanOrEqual(1);

    const wideFluid = await selectVariant("Wide fluid", "wide-fluid");
    expectStableFeedHeight(wideFluid, wideCrop);
    expect(wideFluid.columns).toBe(2);
    expect(wideFluid.fit).toBe("cover");
    expect(wideFluid.mediaHeight).toBeLessThanOrEqual(wideCrop.mediaHeight + 6);
    expect(Math.abs(wideFluid.mediaWidth / wideFluid.mediaHeight - 16 / 9)).toBeLessThan(0.04);
    expectBalancedMediaGaps(wideFluid);

    const stageTop16 = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTop16, wideCrop);
    expect(stageTop16.columns).toBe(2);
    expect(stageTop16.fit).toBe("contain");
    expectTopAlignedMedia(stageTop16);
    expect(Math.abs(stageTop16.mediaWidth / stageTop16.mediaHeight - 16 / 9)).toBeLessThan(0.04);

    const hybridStage16 = await selectVariant("Hybrid stage", "hybrid-stage");
    expectStableFeedHeight(hybridStage16, wideCrop);
    expect(hybridStage16.columns).toBe(2);
    expect(hybridStage16.fit).toBe("contain");
    expectTopAlignedMedia(hybridStage16);
    expect(Math.abs(hybridStage16.mediaWidth / hybridStage16.mediaHeight - 16 / 9)).toBeLessThan(0.04);

    await selectRatio("Wide 21:9", "wide");
    const stageTopWide = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopWide, wideCrop);
    expect(stageTopWide.fit).toBe("contain");
    expectTopAlignedMedia(stageTopWide);
    expect(Math.abs(stageTopWide.mediaWidth / stageTopWide.mediaHeight - 16 / 9)).toBeLessThan(0.04);

    await selectRatio("Standard 4:3", "standard");
    const stageTopStandard = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopStandard, wideCrop);
    expect(stageTopStandard.fit).toBe("contain");
    expectTopAlignedMedia(stageTopStandard);
    expect(Math.abs(stageTopStandard.mediaWidth / stageTopStandard.mediaHeight - 4 / 3)).toBeLessThan(0.04);

    await selectRatio("Portrait 3:4", "portrait");
    const stageTopPortrait = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopPortrait, wideCrop);
    expect(stageTopPortrait.fit).toBe("contain");
    expectTopAlignedMedia(stageTopPortrait);
    expect(Math.abs(stageTopPortrait.mediaWidth / stageTopPortrait.mediaHeight - 3 / 4)).toBeLessThan(0.04);

    const hybridStagePortrait = await selectVariant("Hybrid stage", "hybrid-stage");
    expectStableFeedHeight(hybridStagePortrait, wideCrop);
    expect(hybridStagePortrait.columns).toBe(2);
    expect(hybridStagePortrait.fit).toBe("contain");
    expectTopAlignedMedia(hybridStagePortrait);
    expect(Math.abs(hybridStagePortrait.mediaWidth / hybridStagePortrait.mediaHeight - 3 / 4)).toBeLessThan(0.04);

    await selectRatio("Original 16:9", "original");
    const letterbox = await selectVariant("Letterbox", "letterbox");
    expectStableFeedHeight(letterbox, wideCrop);
    expect(letterbox.columns).toBe(2);
    expect(letterbox.fit).toBe("contain");
    expect(letterbox.mediaHeight).toBeLessThan(split.mediaHeight * 0.85);
    expect(letterbox.mediaWidth).toBeLessThan(split.mediaWidth);
    expectBalancedMediaGaps(letterbox);

    const panorama = await selectVariant("Panorama", "panorama");
    expectStableFeedHeight(panorama, wideCrop);
    expect(panorama.columns).toBe(1);
    expect(panorama.rows).toBe(2);
    expect(Math.abs(panorama.mediaWidth - panorama.detailWidth)).toBeLessThanOrEqual(1);
    expect(panorama.mediaHeight).toBeLessThan(split.mediaHeight * 0.7);
    expect(panorama.descriptionY).toBeGreaterThan(panorama.mediaY + panorama.mediaHeight);

    const consoleStrip = await selectVariant("Console strip", "console-strip");
    expectStableFeedHeight(consoleStrip, wideCrop);
    expect(consoleStrip.columns).toBe(1);
    expect(consoleStrip.rows).toBe(2);
    expect(Math.abs(consoleStrip.mediaWidth - consoleStrip.detailWidth)).toBeLessThanOrEqual(1);
    expect(consoleStrip.mediaHeight).toBeLessThan(panorama.mediaHeight);

    const focusBand = await selectVariant("Focus band", "focus-band");
    expectStableFeedHeight(focusBand, wideCrop);
    expect(focusBand.columns).toBe(2);
    expect(focusBand.fit).toBe("cover");
    expect(focusBand.mediaHeight).toBeLessThan(wideCrop.mediaHeight);
    expect(focusBand.mediaWidth).toBeGreaterThanOrEqual(wideCrop.mediaWidth);
    expect(focusBand.position).toMatch(/0%$/);
    expectBalancedMediaGaps(focusBand);

    await selectRatio("Square 1:1", "square");

    const squareDock = await selectVariant("Square dock", "square-dock");
    expectStableFeedHeight(squareDock, wideCrop);
    expect(squareDock.columns).toBe(2);
    expect(squareDock.fit).toBe("cover");
    expect(Math.abs(squareDock.mediaWidth - squareDock.mediaHeight)).toBeLessThanOrEqual(1);
    expect(squareDock.mediaWidth).toBeLessThan(wideCrop.mediaWidth);
    expect(squareDock.descriptionX).toBeGreaterThan(squareDock.mediaX + squareDock.mediaWidth);
    expectBalancedMediaGaps(squareDock);

    const squareStage = await selectVariant("Square stage", "square-stage");
    expectStableFeedHeight(squareStage, wideCrop);
    expect(squareStage.columns).toBe(2);
    expect(squareStage.fit).toBe("contain");
    expect(Math.abs(squareStage.mediaWidth - squareStage.mediaHeight)).toBeLessThanOrEqual(1);
    expect(squareStage.mediaWidth).toBeGreaterThanOrEqual(squareDock.mediaWidth);
    expect(squareStage.mediaWidth).toBeLessThan(squareStage.detailHeight);
    expectBalancedMediaGaps(squareStage);

    const squareStageTop = await selectVariant("Square top", "square-stage-top");
    expectStableFeedHeight(squareStageTop, wideCrop);
    expect(squareStageTop.columns).toBe(2);
    expect(squareStageTop.fit).toBe("contain");
    expect(Math.abs(squareStageTop.mediaWidth - squareStageTop.mediaHeight)).toBeLessThanOrEqual(1);
    expectTopAlignedMedia(squareStageTop);

    const stageTopSquare = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopSquare, wideCrop);
    expect(stageTopSquare.columns).toBe(2);
    expect(stageTopSquare.fit).toBe("contain");
    expect(Math.abs(stageTopSquare.mediaWidth - stageTopSquare.mediaHeight)).toBeLessThanOrEqual(1);
    expectTopAlignedMedia(stageTopSquare);

    const squareStack = await selectVariant("Square stack", "square-stack");
    expectStableFeedHeight(squareStack, wideCrop);
    expect(squareStack.columns).toBe(1);
    expect(squareStack.rows).toBe(2);
    expect(squareStack.fit).toBe("cover");
    expect(Math.abs(squareStack.mediaWidth - squareStack.mediaHeight)).toBeLessThanOrEqual(1);
    expect(squareStack.mediaWidth).toBeLessThan(squareStack.detailWidth * 0.65);
    expect(squareStack.mediaX).toBeGreaterThan(squareStack.detailX);
    expect(squareStack.descriptionY).toBeGreaterThan(squareStack.mediaY + squareStack.mediaHeight);
  });

  test("preview feed thumbnail variants stay vertical on mobile and desktop", async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    test.skip(viewportWidth > 720 && viewportWidth <= 1040, "Mobile and desktop Signal variant geometry");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const root = page.locator("html");
    const feed = page.locator("[data-preview-feed]");
    const detail = feed.locator("[data-preview-item].is-active .preview-feed__detail");
    const media = detail.locator(".preview-feed__media");
    const description = detail.locator(".preview-feed__description");
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });

    const measure = async () => {
      const [feedBox, detailBox, mediaBox, descriptionBox] = await Promise.all([
        feed.boundingBox(),
        detail.boundingBox(),
        media.boundingBox(),
        description.boundingBox()
      ]);
      const detailStyle = await detail.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length,
          rows: style.gridTemplateRows.trim().split(/\s+/).filter(Boolean).length
        };
      });
      const mediaStyle = await media.evaluate((node) => {
        const image = node.querySelector("img")!;
        const style = getComputedStyle(image);
        return {
          fit: style.objectFit,
          position: style.objectPosition
        };
      });

      return {
        feedHeight: feedBox?.height ?? 0,
        detailX: detailBox?.x ?? 0,
        detailWidth: detailBox?.width ?? 0,
        mediaX: mediaBox?.x ?? 0,
        mediaY: mediaBox?.y ?? 0,
        mediaWidth: mediaBox?.width ?? 0,
        mediaHeight: mediaBox?.height ?? 0,
        descriptionY: descriptionBox?.y ?? 0,
        columns: detailStyle.columns,
        rows: detailStyle.rows,
        fit: mediaStyle.fit,
        position: mediaStyle.position
      };
    };
    const aspect = (value: { mediaWidth: number; mediaHeight: number }) => value.mediaWidth / Math.max(value.mediaHeight, 1);
    const mediaBottom = (value: { mediaY: number; mediaHeight: number }) => value.mediaY + value.mediaHeight;
    const expectStableFeedHeight = (value: { feedHeight: number }, reference: { feedHeight: number }) => {
      expect(Math.abs(value.feedHeight - reference.feedHeight)).toBeLessThanOrEqual(1);
    };
    const expectVertical = (value: { columns: number; descriptionY: number; mediaY: number; mediaHeight: number }) => {
      expect(value.columns).toBe(1);
      expect(value.descriptionY).toBeGreaterThanOrEqual(mediaBottom(value));
    };
    const expectCentered = (value: { detailX: number; detailWidth: number; mediaX: number; mediaWidth: number }) => {
      const mediaCenter = value.mediaX + value.mediaWidth / 2;
      const detailCenter = value.detailX + value.detailWidth / 2;
      expect(Math.abs(mediaCenter - detailCenter)).toBeLessThanOrEqual(2);
    };
    const selectRatio = async (name: string, value: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-ratio", value);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    };
    const selectVariant = async (name: string, value: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-layout", value);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      return measure();
    };

    const baseline = await measure();
    expectVertical(baseline);
    expect(Math.abs(aspect(baseline) - 16 / 9)).toBeLessThan(0.04);

    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();

    const wideFluid = await selectVariant("Wide fluid", "wide-fluid");
    expectStableFeedHeight(wideFluid, baseline);
    expectVertical(wideFluid);
    expect(wideFluid.fit).toBe("cover");
    expect(Math.abs(aspect(wideFluid) - 16 / 9)).toBeLessThan(0.04);

    const stageTop16 = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTop16, baseline);
    expectVertical(stageTop16);
    expect(stageTop16.fit).toBe("contain");
    expect(stageTop16.position).toMatch(/0%$/);
    expect(Math.abs(aspect(stageTop16) - 16 / 9)).toBeLessThan(0.04);

    const hybridStage16 = await selectVariant("Hybrid stage", "hybrid-stage");
    expectStableFeedHeight(hybridStage16, baseline);
    expectVertical(hybridStage16);
    expect(hybridStage16.fit).toBe("contain");
    expect(hybridStage16.position).toMatch(/0%$/);
    expect(Math.abs(aspect(hybridStage16) - 16 / 9)).toBeLessThan(0.04);

    await selectRatio("Wide 21:9", "wide");
    const stageTopWide = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopWide, baseline);
    expectVertical(stageTopWide);
    expect(stageTopWide.fit).toBe("contain");
    expect(stageTopWide.position).toMatch(/0%$/);
    expect(Math.abs(aspect(stageTopWide) - 16 / 9)).toBeLessThan(0.04);

    await selectRatio("Portrait 3:4", "portrait");
    const stageTopPortrait = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopPortrait, baseline);
    expectVertical(stageTopPortrait);
    expect(stageTopPortrait.fit).toBe("contain");
    expect(stageTopPortrait.position).toMatch(/0%$/);
    expect(Math.abs(aspect(stageTopPortrait) - 3 / 4)).toBeLessThan(0.04);

    const hybridStagePortrait = await selectVariant("Hybrid stage", "hybrid-stage");
    expectStableFeedHeight(hybridStagePortrait, baseline);
    expectVertical(hybridStagePortrait);
    expect(hybridStagePortrait.fit).toBe("contain");
    expect(hybridStagePortrait.position).toMatch(/0%$/);
    expect(Math.abs(aspect(hybridStagePortrait) - 3 / 4)).toBeLessThan(0.04);

    await selectRatio("Original 16:9", "original");
    const letterbox = await selectVariant("Letterbox", "letterbox");
    expectStableFeedHeight(letterbox, baseline);
    expectVertical(letterbox);
    expect(letterbox.fit).toBe("contain");
    expect(Math.abs(aspect(letterbox) - 4 / 3)).toBeLessThan(0.04);

    const panorama = await selectVariant("Panorama", "panorama");
    expectStableFeedHeight(panorama, baseline);
    expectVertical(panorama);
    expect(aspect(panorama)).toBeGreaterThan(2.2);

    const consoleStrip = await selectVariant("Console strip", "console-strip");
    expectStableFeedHeight(consoleStrip, baseline);
    expectVertical(consoleStrip);
    expect(aspect(consoleStrip)).toBeGreaterThan(aspect(panorama));

    const focusBand = await selectVariant("Focus band", "focus-band");
    expectStableFeedHeight(focusBand, baseline);
    expectVertical(focusBand);
    expect(focusBand.fit).toBe("cover");
    expect(focusBand.position).toMatch(/0%$/);
    expect(Math.abs(aspect(focusBand) - 2)).toBeLessThan(0.04);

    await selectRatio("Square 1:1", "square");

    const squareDock = await selectVariant("Square dock", "square-dock");
    expectStableFeedHeight(squareDock, baseline);
    expectVertical(squareDock);
    expect(squareDock.fit).toBe("cover");
    expect(Math.abs(squareDock.mediaWidth - squareDock.mediaHeight)).toBeLessThanOrEqual(1);
    expectCentered(squareDock);

    const squareStage = await selectVariant("Square stage", "square-stage");
    expectStableFeedHeight(squareStage, baseline);
    expectVertical(squareStage);
    expect(squareStage.fit).toBe("contain");
    expect(squareStage.mediaWidth).toBeGreaterThanOrEqual(squareDock.mediaWidth);
    expect(Math.abs(squareStage.mediaWidth - squareStage.mediaHeight)).toBeLessThanOrEqual(1);
    expectCentered(squareStage);

    const squareStageTop = await selectVariant("Square top", "square-stage-top");
    expectStableFeedHeight(squareStageTop, baseline);
    expectVertical(squareStageTop);
    expect(squareStageTop.fit).toBe("contain");
    expect(squareStageTop.position).toMatch(/0%$/);
    expect(Math.abs(squareStageTop.mediaWidth - squareStageTop.mediaHeight)).toBeLessThanOrEqual(1);
    expectCentered(squareStageTop);

    const stageTopSquare = await selectVariant("Stage top", "stage-top");
    expectStableFeedHeight(stageTopSquare, baseline);
    expectVertical(stageTopSquare);
    expect(stageTopSquare.fit).toBe("contain");
    expect(stageTopSquare.position).toMatch(/0%$/);
    expect(Math.abs(stageTopSquare.mediaWidth - stageTopSquare.mediaHeight)).toBeLessThanOrEqual(1);
    expectCentered(stageTopSquare);

    const squareStack = await selectVariant("Square stack", "square-stack");
    expectStableFeedHeight(squareStack, baseline);
    expectVertical(squareStack);
    expect(squareStack.fit).toBe("cover");
    expect(squareStack.mediaWidth).toBeLessThan(squareStage.mediaWidth);
    expect(Math.abs(squareStack.mediaWidth - squareStack.mediaHeight)).toBeLessThanOrEqual(1);
    expectCentered(squareStack);
  });

  test("preview feed can reuse tablet dynamic sizing outside the tablet breakpoint", async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    test.skip(viewportWidth > 720 && viewportWidth <= 1040, "Mobile and desktop Signal sizing toggle geometry");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const root = page.locator("html");
    const feed = page.locator("[data-preview-feed]");
    const activeItem = feed.locator("[data-preview-item].is-active");
    const trigger = activeItem.locator("[data-preview-trigger]");
    const detail = activeItem.locator(".preview-feed__detail");
    const media = detail.locator(".preview-feed__media");
    const description = detail.locator(".preview-feed__description");

    const measure = async () => {
      const [triggerBox, mediaBox, descriptionBox] = await Promise.all([
        trigger.boundingBox(),
        media.boundingBox(),
        description.boundingBox()
      ]);
      const columns = await detail.evaluate((node) => {
        const columns = getComputedStyle(node).gridTemplateColumns.trim();
        return columns.split(/\s+/).filter(Boolean).length;
      });

      return {
        columns,
        triggerHeight: triggerBox?.height ?? 0,
        mediaX: mediaBox?.x ?? 0,
        mediaWidth: mediaBox?.width ?? 0,
        mediaHeight: mediaBox?.height ?? 0,
        descriptionX: descriptionBox?.x ?? 0
      };
    };

    const auto = await measure();
    expect(auto.columns).toBe(1);

    await selectSignalSizing(page, "Tablet dynamic", "tablet-dynamic");
    await expect(root).toHaveAttribute("data-signal-sizing", "tablet-dynamic");

    const dynamic = await measure();
    expect(dynamic.columns).toBe(2);
    expect(dynamic.triggerHeight).toBeLessThan(auto.triggerHeight);
    expect(dynamic.mediaWidth).toBeGreaterThan(dynamic.mediaHeight);
    expect(dynamic.mediaHeight).toBeLessThanOrEqual(124);
    expect(dynamic.descriptionX).toBeGreaterThan(dynamic.mediaX + dynamic.mediaWidth);
    await expectNoHorizontalOverflow(page);
  });

  test("preview feed smart stage chooses layout from ratio and constraints", async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const isMobile = viewportWidth <= 720;

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const root = page.locator("html");
    const feed = page.locator("[data-preview-feed]");
    const detail = feed.locator("[data-preview-item].is-active .preview-feed__detail");
    const media = detail.locator(".preview-feed__media");
    const description = detail.locator(".preview-feed__description");
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });

    const measure = async () => {
      const [feedBox, detailBox, mediaBox, descriptionBox] = await Promise.all([
        feed.boundingBox(),
        detail.boundingBox(),
        media.boundingBox(),
        description.boundingBox()
      ]);
      const detailStyle = await detail.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          columns: style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
        };
      });
      const mediaStyle = await media.evaluate((node) => {
        const image = node.querySelector("img")!;
        const style = getComputedStyle(image);
        return {
          fit: style.objectFit,
          position: style.objectPosition
        };
      });

      return {
        feedHeight: feedBox?.height ?? 0,
        detailY: detailBox?.y ?? 0,
        mediaX: mediaBox?.x ?? 0,
        mediaY: mediaBox?.y ?? 0,
        mediaWidth: mediaBox?.width ?? 0,
        mediaHeight: mediaBox?.height ?? 0,
        descriptionX: descriptionBox?.x ?? 0,
        descriptionY: descriptionBox?.y ?? 0,
        columns: detailStyle.columns,
        fit: mediaStyle.fit,
        position: mediaStyle.position
      };
    };
    const aspect = (value: { mediaWidth: number; mediaHeight: number }) => value.mediaWidth / Math.max(value.mediaHeight, 1);
    const mediaBottom = (value: { mediaY: number; mediaHeight: number }) => value.mediaY + value.mediaHeight;
    const mediaRight = (value: { mediaX: number; mediaWidth: number }) => value.mediaX + value.mediaWidth;
    const expectStableFeedHeight = (value: { feedHeight: number }, reference: { feedHeight: number }) => {
      expect(Math.abs(value.feedHeight - reference.feedHeight)).toBeLessThanOrEqual(1);
    };
    const expectRow = (value: {
      columns: number;
      descriptionX: number;
      detailY: number;
      mediaX: number;
      mediaY: number;
      mediaWidth: number;
    }) => {
      expect(value.columns).toBe(2);
      expect(value.descriptionX).toBeGreaterThan(mediaRight(value));
      expect(Math.abs(value.mediaY - value.detailY)).toBeLessThanOrEqual(1);
    };
    const expectColumn = (value: { columns: number; descriptionY: number; mediaY: number; mediaHeight: number }) => {
      expect(value.columns).toBe(1);
      expect(value.descriptionY).toBeGreaterThanOrEqual(mediaBottom(value));
    };
    const expectWideDecision = (value: Parameters<typeof expectRow>[0] & Parameters<typeof expectColumn>[0]) => {
      if (isMobile) {
        expectColumn(value);
      } else {
        expectRow(value);
      }
    };
    const selectRatio = async (name: string, value: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-ratio", value);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      return measure();
    };

    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();
    await page.getByRole("button", { name: "Smart stage" }).click();
    await expect(root).toHaveAttribute("data-signal-layout", "smart-stage");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    const original = await measure();
    expectWideDecision(original);
    expect(original.fit).toBe("contain");
    expect(original.position).toMatch(/0%$/);
    expect(Math.abs(aspect(original) - 16 / 9)).toBeLessThan(0.04);

    const wide = await selectRatio("Wide 21:9", "wide");
    expectStableFeedHeight(wide, original);
    expectWideDecision(wide);
    expect(wide.fit).toBe("contain");
    expect(wide.position).toMatch(/0%$/);
    expect(Math.abs(aspect(wide) - 16 / 9)).toBeLessThan(0.04);

    const standard = await selectRatio("Standard 4:3", "standard");
    expectStableFeedHeight(standard, original);
    expectWideDecision(standard);
    expect(standard.fit).toBe("contain");
    expect(standard.position).toMatch(/0%$/);
    expect(Math.abs(aspect(standard) - 4 / 3)).toBeLessThan(0.04);

    const square = await selectRatio("Square 1:1", "square");
    expectStableFeedHeight(square, original);
    expectRow(square);
    expect(square.fit).toBe("contain");
    expect(square.position).toMatch(/0%$/);
    expect(Math.abs(aspect(square) - 1)).toBeLessThan(0.04);

    const portrait = await selectRatio("Portrait 3:4", "portrait");
    expectStableFeedHeight(portrait, original);
    expectRow(portrait);
    expect(portrait.fit).toBe("contain");
    expect(portrait.position).toMatch(/0%$/);
    expect(Math.abs(aspect(portrait) - 3 / 4)).toBeLessThan(0.04);
  });

  test("preview feed debug ratio thumbnails swap intrinsic aspect ratios", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const firstImage = page.locator("[data-preview-item] img[data-signal-image]").first();
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });

    const waitForSource = async (source: string) => {
      await expect(firstImage).toHaveAttribute("src", source);
      await page.waitForFunction(
        (expectedSource) => {
          const image = document.querySelector<HTMLImageElement>("[data-preview-item] img[data-signal-image]");
          return Boolean(image?.getAttribute("src") === expectedSource && image.complete && image.naturalWidth > 0);
        },
        source
      );
    };
    const ratios = async () =>
      page.locator("[data-preview-item] img[data-signal-image]").evaluateAll((images) =>
        images.map((image) => {
          const thumbnail = image as HTMLImageElement;
          return Math.round((thumbnail.naturalWidth / thumbnail.naturalHeight) * 100) / 100;
        })
      );
    const selectRatio = async (name: string, value: string, source: string) => {
      await page.getByRole("button", { name }).click();
      await expect(root).toHaveAttribute("data-signal-ratio", value);
      await waitForSource(source);
      return ratios();
    };

    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();

    await waitForSource("/visuals/article-preview.svg");
    expect((await ratios())[0]).toBeCloseTo(1.78, 1);

    expect((await selectRatio("Wide 21:9", "wide", "/visuals/signal-article-21-9.svg"))[0]).toBeCloseTo(2.33, 1);
    expect((await selectRatio("Standard 4:3", "standard", "/visuals/signal-article-4-3.svg"))[0]).toBeCloseTo(1.33, 1);
    expect((await selectRatio("Square 1:1", "square", "/visuals/signal-article-1-1.svg"))[0]).toBeCloseTo(1, 1);
    expect((await selectRatio("Portrait 3:4", "portrait", "/visuals/signal-article-3-4.svg"))[0]).toBeCloseTo(0.75, 1);

    const mixed = await selectRatio("Mixed deck", "mixed", "/visuals/signal-article-21-9.svg");
    expect(mixed[0]).toBeCloseTo(2.33, 1);
    expect(mixed[1]).toBeCloseTo(1, 1);
    expect(mixed[2]).toBeCloseTo(1.33, 1);
    expect(mixed[3]).toBeCloseTo(0.75, 1);
    expect(
      await page
        .locator("[data-preview-item] .preview-feed__media")
        .first()
        .evaluate((node) => getComputedStyle(node, "::before").display)
    ).toBe("block");
    const labels = await page.locator("[data-preview-item] .preview-feed__media").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-signal-aspect"))
    );
    expect(labels).toEqual(["21:9", "1:1", "4:3", "3:4"]);
  });

  test("preview feed uses a vertical compact layout without text overflow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectSignalInnerLayout(page, "Compact", "compact");

    const feed = page.locator("[data-preview-feed]");
    const activeItem = feed.locator("[data-preview-item].is-active");
    const trigger = feed.locator("[data-preview-trigger]").first();
    const title = trigger.locator("strong");
    const kind = trigger.locator(".preview-feed__kind");
    const meta = trigger.locator("span").last();
    const detail = feed.locator("[data-preview-item].is-active .preview-feed__detail");
    const media = detail.locator(".preview-feed__media");
    const description = detail.locator("p").first();

    await expect(title).toBeVisible();
    await expect(description).toBeVisible();

    const titleStyle = await title.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        whiteSpace: style.whiteSpace,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth
      };
    });
    expect(titleStyle.whiteSpace).toBe("normal");
    expect(titleStyle.scrollWidth).toBeLessThanOrEqual(titleStyle.clientWidth + 1);

    const topRow = await Promise.all([kind.boundingBox(), meta.boundingBox()]);
    expect(Math.abs((topRow[0]?.y ?? 0) - (topRow[1]?.y ?? 0))).toBeLessThanOrEqual(2);
    expect(topRow[1]?.x ?? 0).toBeGreaterThan(topRow[0]?.x ?? 0);

    const viewportWidth = page.viewportSize()?.width ?? 0;
    const isTabletSignalLayout = viewportWidth > 720 && viewportWidth <= 1040;
    const detailColumns = await detail.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect(detailColumns.trim().split(/\s+/)).toHaveLength(isTabletSignalLayout ? 2 : 1);
    const detailSpacing = await detail.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        columnGap: style.columnGap,
        rowGap: style.rowGap,
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom
      };
    });
    if (isTabletSignalLayout) {
      expect(detailSpacing.columnGap).toBe("10px");
      expect(detailSpacing.rowGap).toBe("10px");
    } else {
      expect(detailSpacing.columnGap).toBe("0px");
      expect(detailSpacing.rowGap).toBe("0px");
    }
    expect(detailSpacing.paddingTop).toBe("0px");
    expect(detailSpacing.paddingLeft).toBe("0px");
    expect(detailSpacing.paddingRight).toBe("0px");
    expect(detailSpacing.paddingBottom).toBe("0px");

    const [activeItemBox, detailBox, mediaBox, descriptionOuterBox] = await Promise.all([
      activeItem.boundingBox(),
      detail.boundingBox(),
      media.boundingBox(),
      description.boundingBox()
    ]);
    const itemBottom = (activeItemBox?.y ?? 0) + (activeItemBox?.height ?? 0);
    const detailBottom = (detailBox?.y ?? 0) + (detailBox?.height ?? 0);
    const mediaBottom = (mediaBox?.y ?? 0) + (mediaBox?.height ?? 0);
    expect(Math.abs(detailBottom - itemBottom)).toBeLessThanOrEqual(isTabletSignalLayout ? 2 : 22);
    expect((mediaBox?.x ?? 0)).toBeGreaterThanOrEqual((detailBox?.x ?? 0) - 1);
    expect((mediaBox?.x ?? 0) + (mediaBox?.width ?? 0)).toBeLessThanOrEqual(
      (detailBox?.x ?? 0) + (detailBox?.width ?? 0) + 1
    );
    if (isTabletSignalLayout) {
      const mediaTopGap = (mediaBox?.y ?? 0) - (detailBox?.y ?? 0);
      const mediaBottomGap = detailBottom - mediaBottom;
      expect(mediaTopGap).toBeGreaterThanOrEqual(0);
      expect(mediaBottomGap).toBeGreaterThanOrEqual(0);
      expect(Math.abs(mediaTopGap - mediaBottomGap)).toBeLessThanOrEqual(1);
      expect(Math.abs((descriptionOuterBox?.y ?? 0) - (detailBox?.y ?? 0))).toBeLessThanOrEqual(1);
      expect((descriptionOuterBox?.x ?? 0)).toBeGreaterThan((mediaBox?.x ?? 0) + (mediaBox?.width ?? 0));
      expect((mediaBox?.height ?? 0)).toBeLessThan((detailBox?.height ?? 0) * 0.85);
      expect((mediaBox?.height ?? 0)).toBeGreaterThan(70);
      expect(Math.abs((descriptionOuterBox?.height ?? 0) - (detailBox?.height ?? 0))).toBeLessThanOrEqual(1);
      expect((mediaBox?.width ?? 0)).toBeGreaterThanOrEqual(140);
      expect((mediaBox?.width ?? 0)).toBeLessThan((detailBox?.width ?? 0) * 0.68);
      expect((descriptionOuterBox?.width ?? 0)).toBeGreaterThan(110);
      expect((descriptionOuterBox?.height ?? 0)).toBeGreaterThan(120);
    } else {
      expect(Math.abs((mediaBox?.width ?? 0) / (mediaBox?.height ?? 1) - 16 / 9)).toBeLessThan(0.03);
      expect(Math.abs((descriptionOuterBox?.y ?? 0) - ((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0)))).toBeLessThanOrEqual(1);
    }

    const descriptionBox = await description.evaluate((node) => {
      const text = node.querySelector("span")!;
      const style = getComputedStyle(node);
      return {
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        lineClamp: getComputedStyle(text).getPropertyValue("-webkit-line-clamp"),
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        backdropFilter:
          style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter"),
        borderStyle: style.borderStyle
      };
    });
    const itemBlur = await activeItem.evaluate(async (node) => {
      const style = getComputedStyle(node, "::after");
      const stylesheetText = await Promise.all(
        Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(async (link) => {
          try {
            const response = await fetch(link.href);
            return response.ok ? response.text() : "";
          } catch {
            return "";
          }
        })
      );
      const declaredBackdropFilter = stylesheetText.some(
        (text) => text.includes(".preview-feed__item") && text.includes("backdrop-filter:blur(")
      );
      return {
        content: style.content,
        position: style.position,
        insetBlockEnd: style.insetBlockEnd || style.bottom,
        height: Number.parseFloat(style.height),
        opacity: Number.parseFloat(style.opacity),
        pointerEvents: style.pointerEvents,
        backdropFilter: style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter"),
        declaredBackdropFilter,
        maskImage: style.maskImage || style.getPropertyValue("-webkit-mask-image")
      };
    });
    expect(descriptionBox.scrollWidth).toBeLessThanOrEqual(descriptionBox.clientWidth + 1);
    expect(descriptionBox.lineClamp).toBe(isTabletSignalLayout ? "4" : "3");
    expect(descriptionBox.paddingTop).toBe(isTabletSignalLayout ? "8px" : "5px");
    expect(descriptionBox.paddingBottom).toBe("0px");
    expect(descriptionBox.backdropFilter === "none" || descriptionBox.backdropFilter === "").toBe(true);
    expect(descriptionBox.borderStyle).toBe("none");
    expect(itemBlur.content).not.toBe("none");
    expect(itemBlur.position).toBe("absolute");
    expect(itemBlur.insetBlockEnd).toBe("0px");
    expect(itemBlur.height).toBeGreaterThanOrEqual(38);
    expect(itemBlur.height).toBeLessThanOrEqual(54);
    expect(itemBlur.opacity).toBeGreaterThan(0.9);
    expect(itemBlur.pointerEvents).toBe("none");
    expect(itemBlur.backdropFilter.includes("blur") || itemBlur.declaredBackdropFilter).toBe(true);
    expect(itemBlur.maskImage).toContain("linear-gradient");
  });
});
