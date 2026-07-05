import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
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
    const brandBox = await page.getByRole("link", { name: "HLCaptain home" }).boundingBox();
    expect(toggleBox?.x ?? 9999).toBeLessThan(brandBox?.x ?? 0);

    const expandedGroupToggle = await page.locator(".nav-group").nth(1).locator(".group-toggle-icon").boundingBox();
    const expandedGroupGlyph = await page.locator(".nav-group").nth(1).locator(".pixel-glyph").first().boundingBox();
    const expandedItemGlyph = await nav.getByRole("link", { name: "Articles", exact: true }).locator(".pixel-glyph").boundingBox();
    expect(expandedGroupToggle?.width ?? 99).toBeLessThan(expandedItemGlyph?.width ?? 0);
    expect(expandedGroupGlyph?.width ?? 99).toBeLessThan(expandedItemGlyph?.width ?? 0);
    const expandedGroupColors = await page.locator(".nav-group").nth(1).evaluate((group) => {
      const groupGlyph = group.querySelector(".pixel-glyph");
      const itemGlyph = document.querySelector(".nav-item .pixel-glyph");
      return {
        group: groupGlyph ? getComputedStyle(groupGlyph).color : "",
        item: itemGlyph ? getComputedStyle(itemGlyph).color : "",
        selectedArrowInsideGroup: Boolean(group.querySelector(".arrow-icon__svg"))
      };
    });
    expect(expandedGroupColors.group).not.toBe(expandedGroupColors.item);
    expect(expandedGroupColors.selectedArrowInsideGroup).toBe(false);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(root).toHaveClass(/sidebar-collapsed/);
    const expandButton = page.getByRole("button", { name: "Expand sidebar" });
    await expect(expandButton).toBeVisible();
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

    await page.mouse.move(1000, 520);
    await expect
      .poll(async () =>
        nav
          .getByRole("link", { name: "Articles", exact: true })
          .locator("span")
          .last()
          .evaluate((node) => getComputedStyle(node).display)
      )
      .toBe("none");

    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);
    await expect
      .poll(async () =>
        page.locator(".site-frame").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ")[0])
      )
      .toBe("84px");
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
      return { border: style.borderColor, background: style.backgroundColor, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight };
    });
    expect(collapsedActive.border).not.toBe("rgba(0, 0, 0, 0)");
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
      const itemDeltas = Array.from(document.querySelectorAll(".nav-item > .pixel-glyph"))
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

    const networkGroup = page.locator(".nav-group").last();
    await expect.poll(async () => networkGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
    const githubLink = nav.getByRole("link", { name: "GitHub" });
    await expect(githubLink.locator(".external-link-icon")).toBeVisible();
    await expect(githubLink).toHaveAttribute("target", "_blank");

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(root).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
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

    await page.getByRole("button", { name: "Black" }).click();
    await expect(root).toHaveAttribute("data-theme", "black");
    const blackGridSoft = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--grid-line-soft").trim());
    expect(blackGridSoft).toContain("/ 0.12");
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

    await page.getByRole("button", { name: "Cyan accent" }).click();
    const afterAccent = await page.locator(".entry-card__link").first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(afterAccent.background).not.toBe(afterTheme.background);
    expect(afterAccent.border).not.toBe(afterTheme.border);
    const cyanTint = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--accent-tint").trim());
    expect(cyanTint).not.toBe("#4b4432");

    await page.locator("[data-accent-input]").evaluate((node: HTMLInputElement) => {
      node.value = "#050505";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect
      .poll(async () =>
        page.locator(".entry-card__link").first().evaluate((node) => getComputedStyle(node).backgroundColor)
      )
      .not.toBe(afterAccent.background);
    const contrastResult = await page.locator(".entry-card__link").first().evaluate((node) => {
      const cardStyle = getComputedStyle(node);
      const icon = node.querySelector(".entry-card__glyph");
      if (!icon) return null;
      const iconStyle = getComputedStyle(icon);
      return { icon: iconStyle.color, card: cardStyle.backgroundColor, body: getComputedStyle(document.body).backgroundColor };
    });
    const body = parseColor(contrastResult!.body);
    expect(contrast(composite(parseColor(contrastResult!.icon), body), composite(parseColor(contrastResult!.card), body))).toBeGreaterThan(3);
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
    await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
    const beforeNav = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--accent"));
    expect(beforeNav.trim()).not.toBe("#050505");

    await page.getByRole("link", { name: "Read articles" }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
    const afterNav = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--accent"));
    expect(afterNav.trim()).toBe(beforeNav.trim());
  });

  test("debug menu changes arrow style and keeps it through navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const debugToggle = page.getByRole("button", { name: "Open debug menu" });
    await debugToggle.click();
    await expect(page.locator("[data-debug-panel]")).toBeVisible();
    await expect(page.locator("button[data-arrow-style]")).toHaveCount(11);
    await expect(page.locator(".sidebar-toggle .arrow-icon__svg[data-icon-style]")).toHaveCount(11);

    await page.getByRole("button", { name: "Phosphor" }).click();
    await expect(root).toHaveAttribute("data-arrow-style", "phosphor");
    await expect(page.getByRole("button", { name: "Phosphor" })).toHaveAttribute("aria-pressed", "true");
    const iconWidth = await page
      .locator(".sidebar-toggle .arrow-icon")
      .evaluate((node) => getComputedStyle(node).width);
    expect(Number.parseFloat(iconWidth)).toBeGreaterThanOrEqual(24);
    await expect(page.locator('.sidebar-toggle .arrow-icon__svg[data-icon-style="phosphor"]')).toBeVisible();

    await page.getByRole("link", { name: "Read articles" }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect(root).toHaveAttribute("data-arrow-style", "phosphor");

    const panel = page.locator("[data-debug-panel]");
    if (await panel.evaluate((node: HTMLElement) => node.hidden)) {
      await debugToggle.click();
    }
    await expect(page.getByRole("button", { name: "Phosphor" })).toHaveAttribute("aria-pressed", "true");
  });

  test("preview feed expands selected items and moves its rail", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const feed = page.locator("[data-preview-feed]");
    await expect(feed.locator("[data-preview-item]")).toHaveCount(4);
    await expect(feed.locator("[data-preview-item].is-active img")).toBeVisible();
    const firstRail = await feed.locator("[data-preview-rail]").boundingBox();
    const beforeHeight = await feed.evaluate((node) => node.getBoundingClientRect().height);

    await feed.locator("[data-preview-trigger]").nth(1).click();
    await expect(feed.locator("[data-preview-item]").nth(1)).toHaveClass(/is-active/);
    await expect(feed.locator("[data-preview-item]").nth(1).locator("img")).toBeVisible();
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

    await secondItem.click();
    await expect(page).toHaveURL(/\/articles\/interface-motion\/$/);
  });

  test("preview feed thumbnail hover arrow uses elevated card affordance", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop pointer-hover affordance check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

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
        arrowBackground: arrowStyle.backgroundColor,
        arrowColor: arrowStyle.color
      };
    });
    expect(hoverState.boxShadow).not.toBe("none");
    expect(hoverState.transform).not.toBe("none");
    expect(hoverState.arrowOpacity).toBeGreaterThan(0.7);
    expect(hoverState.arrowTransform).not.toBe("none");
    expect(contrast(parseColor(hoverState.arrowBackground), parseColor(hoverState.arrowColor))).toBeGreaterThan(3);
    await expect(arrow).toBeVisible();
  });

  test("preview feed uses a vertical compact layout without text overflow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const feed = page.locator("[data-preview-feed]");
    const trigger = feed.locator("[data-preview-trigger]").first();
    const title = trigger.locator("strong");
    const kind = trigger.locator(".preview-feed__kind");
    const meta = trigger.locator("span").last();
    const detail = feed.locator("[data-preview-item].is-active .preview-feed__detail");
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

    const detailColumns = await detail.evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect(detailColumns.trim().split(/\s+/)).toHaveLength(1);

    const descriptionBox = await description.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      lineClamp: getComputedStyle(node).getPropertyValue("-webkit-line-clamp"),
      backdropFilter:
        getComputedStyle(node).backdropFilter || getComputedStyle(node).getPropertyValue("-webkit-backdrop-filter")
    }));
    expect(descriptionBox.scrollWidth).toBeLessThanOrEqual(descriptionBox.clientWidth + 1);
    expect(descriptionBox.lineClamp).toBe("4");
    expect(descriptionBox.backdropFilter).toContain("blur");
  });
});
