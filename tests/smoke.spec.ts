import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
}

type ParsedColor = { r: number; g: number; b: number; a: number };

type MobileSidebarTransitionSample = {
  owner: string;
  width: number;
  height: number;
  visibility: string;
  oldOpacity: number;
  newOpacity: number;
  zIndex: number;
  sidebarZIndex: number;
  sidebarOldOpacity: number;
  sidebarNewOpacity: number;
  backdropOwner: string;
  backdropWidth: number;
  backdropHeight: number;
  backdropVisibility: string;
  backdropOldOpacity: number;
  backdropNewOpacity: number;
  backdropZIndex: number;
  pageZIndex: number;
  viewportWidth: number;
  viewportHeight: number;
};

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
    await expect(page.locator("html")).toHaveAttribute("data-grid-pattern", "plus");
    await expectNoHorizontalOverflow(page);
  });

  test("background grid parallax uses a composited transform layer", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("hlcaptain-grid-pattern", "grid"));
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
        const rootStyle = getComputedStyle(document.documentElement);
        const gridStyle = getComputedStyle(document.querySelector(".background-grid")!);
        return {
          y: rootStyle.getPropertyValue("--grid-parallax-y").trim(),
          transform: gridStyle.transform,
          removedProperties: ["--grid-parallax-x", "--grid-pointer-x", "--grid-pointer-y"].map((property) =>
            rootStyle.getPropertyValue(property).trim()
          )
        };
      });

    const before = await readParallax();
    expect(before.removedProperties).toEqual(["", "", ""]);
    await page.evaluate(() => window.scrollTo(0, 420));
    await expect
      .poll(async () => {
        const after = await readParallax();
        return after.y;
      })
      .not.toBe(before.y);

    const afterScroll = await readParallax();
    const viewport = page.viewportSize()!;
    await page.mouse.move(8, 8);
    await page.mouse.move(viewport.width - 8, viewport.height - 8);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    expect(await readParallax()).toEqual(afterScroll);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(async () => (await readParallax()).y).toBe("0px");
  });

  test("plus signs stay pixel-aligned and ignore pointer movement", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    await page.getByRole("button", { name: "Open debug menu" }).click();
    await page.getByRole("button", { name: "Plus signs" }).click();
    await expect(root).toHaveAttribute("data-grid-pattern", "plus");

    const readPattern = () =>
      page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const gridStyle = getComputedStyle(document.querySelector(".background-grid")!);
        const maskImage = gridStyle.maskImage || gridStyle.getPropertyValue("-webkit-mask-image");
        const maskUrl = /url\(["']?(.*?)["']?\)/.exec(maskImage)?.[1] ?? "";
        const matrix = new DOMMatrix(gridStyle.transform);
        return {
          y: rootStyle.getPropertyValue("--grid-parallax-y").trim(),
          gridSize: rootStyle.getPropertyValue("--grid-size").trim(),
          removedProperties: ["--grid-parallax-x", "--grid-pointer-x", "--grid-pointer-y"].map((property) =>
            rootStyle.getPropertyValue(property).trim()
          ),
          transform: gridStyle.transform,
          translateX: matrix.m41,
          translateY: matrix.m42,
          backgroundImage: gridStyle.backgroundImage,
          backgroundPosition: gridStyle.backgroundPosition,
          maskImage,
          maskPosition: gridStyle.maskPosition,
          maskRepeat: gridStyle.maskRepeat,
          maskSize: gridStyle.maskSize,
          maskSvg: maskUrl ? decodeURIComponent(maskUrl) : ""
        };
      });

    const before = await readPattern();
    expect(before.removedProperties).toEqual(["", "", ""]);
    expect(before.backgroundImage).toBe("none");
    expect(before.maskImage).toContain("data:image/svg+xml");
    expect(before.maskSize).toBe(`${before.gridSize} ${before.gridSize}`);
    expect(before.maskRepeat).toContain("repeat");
    expect(before.maskSvg).toMatch(/shape-rendering=['"]crispEdges['"]/);
    expect(before.maskSvg).not.toMatch(/<(circle|ellipse|filter)\b/);
    const pathData = /<path[^>]*d=['"]([^'"]+)/.exec(before.maskSvg)?.[1] ?? "";
    expect(pathData).toMatch(/^[\d\sMmHhVvZz.-]+$/);
    expect(pathData.match(/-?\d+(?:\.\d+)?/g)?.every((value) => Number.isInteger(Number(value)))).toBe(true);

    const viewport = page.viewportSize()!;
    await page.mouse.move(8, 8);
    await page.mouse.move(viewport.width - 8, viewport.height - 8);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    expect(await readPattern()).toEqual(before);

    await page.evaluate(() => window.scrollTo(0, 420));
    await expect.poll(async () => (await readPattern()).y).not.toBe(before.y);
    const afterScroll = await readPattern();
    expect(afterScroll.translateX).toBe(0);
    expect(afterScroll.translateY).not.toBe(0);
    expect(afterScroll.backgroundPosition).toBe(before.backgroundPosition);
    expect(afterScroll.maskPosition).toBe(before.maskPosition);
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
      const renderedPattern = await page.locator(".background-grid").evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.backgroundImage}|${style.maskImage}`;
      });
      expect(renderedPattern).toMatch(/gradient|data:image\/svg\+xml/);
      renderedBackgrounds.add(renderedPattern);
    }

    expect(renderedBackgrounds.size).toBe(patterns.length);
  });

  test("hides empty article navigation and overview content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(page.locator("[data-nav-group='Articles']")).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "All articles", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Read articles", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Latest articles" })).toHaveCount(0);
    await expect(page.locator("[data-signal]").getByText("Article", { exact: true })).toHaveCount(0);
  });

  test("navigation reaches projects and marks the active route", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    await nav.getByRole("link", { name: "All projects", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.getByRole("heading", { name: "Selected work" })).toBeVisible();
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
    await expect(nav.getByRole("link", { name: "All projects", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectNoHorizontalOverflow(page);
  });

  test("sidebar selects individual projects in every layout", async ({ page, isMobile }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(page.locator("[data-nav-group='Projects'] a[href^='/work/']")).toHaveCount(3);

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    } else if ((page.viewportSize()?.width ?? 0) >= 1200) {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await page.mouse.move(1000, 520);
      await expect(root).not.toHaveClass(/sidebar-overlay-open/);
    }

    const projectsGroup = page.locator("[data-nav-group='Projects']");
    if ((page.viewportSize()?.width ?? 0) >= 1200) {
      await projectsGroup.locator("summary").focus();
      await expect(root).toHaveClass(/sidebar-overlay-open/);
    }

    await projectsGroup.locator("summary").click();
    await expect.poll(async () => projectsGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    await projectsGroup.locator("summary").click();
    await expect
      .poll(async () =>
        projectsGroup.evaluate((node) => ({
          open: (node as HTMLDetailsElement).open,
          animating: node.classList.contains("is-expanding") || node.classList.contains("is-collapsing")
        }))
      )
      .toEqual({ open: true, animating: false });

    const projectLink = nav.getByRole("link", { name: "ProtoShape", exact: true });
    await projectLink.click();
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);
    await expect(projectLink).toHaveAttribute("aria-current", "page");
    await expect(nav.locator("[aria-current='page']")).toHaveCount(1);

    if ((page.viewportSize()?.width ?? 0) >= 1200) {
      await page.locator("[data-nav-group='Network'] summary").focus();
      await expect(root).toHaveClass(/sidebar-overlay-open/);
    }
    const emailLink = nav.getByRole("link", { name: "Email", exact: true });
    await emailLink.scrollIntoViewIfNeeded();
    await expect(emailLink).toBeVisible();
    expect(
      await emailLink.evaluate((node) => {
        const link = node.getBoundingClientRect();
        const navigation = node.closest(".sidebar-nav")!.getBoundingClientRect();
        return link.top >= navigation.top - 1 && link.bottom <= navigation.bottom + 1;
      })
    ).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test("publishes LinkedIn and X profile links", async ({ page }) => {
    await page.goto("/about/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const profileLinks = [
      { label: "LinkedIn", href: "https://www.linkedin.com/in/balazs-puspok-kiss/", icon: "linkedin" },
      { label: "X", href: "https://x.com/hlcaptain", icon: "x" }
    ];

    for (const { label, href, icon } of profileLinks) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
      await expect(link.locator(`.semantic-icon[data-icon-name="${icon}"] .semantic-icon__svg`)).toHaveCount(6);
    }

    const facts = page.locator(".fact-panel");
    await expect(facts.getByRole("link", { name: "balazs-puspok-kiss" })).toHaveAttribute("href", profileLinks[0].href);
    await expect(facts.getByRole("link", { name: "@hlcaptain" })).toHaveAttribute("href", profileLinks[1].href);
  });

  test("active project leaf reopens a remembered closed group", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      window.sessionStorage.setItem(
        "hlcaptain-nav-groups",
        JSON.stringify({ Index: true, Projects: false, Network: true })
      )
    );

    await page.goto("/work/proto-shape/");
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const projectsGroup = page.locator("[data-nav-group='Projects']");
    await expect.poll(async () => projectsGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
    await expect(nav.getByRole("link", { name: "ProtoShape" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
  });

  test("project card navigation enters with a vertical page direction", async ({ page }) => {
    await page.goto("/work/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    await page.getByRole("link", { name: "Open ProtoShape" }).click();

    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");
    const pageEnterY = await root.evaluate((node) => getComputedStyle(node).getPropertyValue("--page-enter-y").trim());
    expect(pageEnterY).not.toBe("0px");
  });

  test("all projects navigation keeps transition geometry stable from scrolled overview", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const allProjects = page.locator("#main-content").getByRole("link", { name: "All projects" });
    await allProjects.scrollIntoViewIfNeeded();
    const overviewTargetScrollY = await allProjects.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const documentY = rect.top + window.scrollY;
      const preferredViewportY = Math.min(window.innerHeight * 0.45, 360);
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(maxScrollY, Math.max(0, documentY - preferredViewportY));
    });
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), overviewTargetScrollY);
    const overviewScrollY = await page.evaluate(() => window.scrollY);
    expect(overviewScrollY).toBeGreaterThan(100);
    await expect(allProjects).toBeVisible();

    await allProjects.click({ noWaitAfter: true });
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
    await expect(page).toHaveURL(/\/work\/$/);
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

  test("mobile sidebar ignores desktop collapse state and toggles from one action", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only sidebar presentation check");

    await page.addInitScript(() => window.localStorage.setItem("hlcaptain-sidebar", "collapsed"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const sidebar = page.locator("[data-sidebar]");
    const toggle = page.locator("[data-sidebar-open]");
    const backdrop = page.locator(".sidebar-backdrop");

    await expect(toggle).toHaveAccessibleName("Open navigation");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(root).toHaveClass(/sidebar-open/);
    await expect(toggle).toHaveAccessibleName("Close navigation");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => window.localStorage.getItem("hlcaptain-sidebar"))).toBe("collapsed");

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const shell = document.querySelector("[data-sidebar]")!;
          const panelNode = document.querySelector(".sidebar-panel")!;
          const row = document.querySelector(".nav-item")!;
          const controls = document.querySelector(".surface-controls")!;
          const theme = document.querySelector(".surface-control--theme")!;
          const accent = document.querySelector(".surface-control--accent")!;
          const reset = document.querySelector(".surface-control--reset")!;
          const label = theme.querySelector(".surface-control__label")!;
          const shellRect = shell.getBoundingClientRect();
          const panelRect = panelNode.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          const controlsRect = controls.getBoundingClientRect();
          const themeRect = theme.getBoundingClientRect();
          const accentRect = accent.getBoundingClientRect();
          const resetRect = reset.getBoundingClientRect();
          const panelStyle = getComputedStyle(panelNode);
          const rowStyle = getComputedStyle(row);
          return {
            shell: { x: Math.round(shellRect.x), width: Math.round(shellRect.width) },
            panel: { x: Math.round(panelRect.x), width: Math.round(panelRect.width) },
            panelPadding: Math.round(Number.parseFloat(panelStyle.paddingTop)),
            panelGap: Math.round(Number.parseFloat(panelStyle.rowGap)),
            row: {
              width: Math.round(rowRect.width),
              paddingLeft: rowStyle.paddingLeft,
              paddingRight: rowStyle.paddingRight
            },
            controls: { width: Math.round(controlsRect.width) },
            theme: { width: Math.round(themeRect.width), textAlign: getComputedStyle(label).textAlign },
            accent: { y: Math.round(accentRect.y) },
            reset: { y: Math.round(resetRect.y), width: Math.round(resetRect.width) }
          };
        })
      )
      .toEqual({
        shell: { x: 0, width: 292 },
        panel: { x: 14, width: 264 },
        panelPadding: 10,
        panelGap: 16,
        row: { width: 242, paddingLeft: "6px", paddingRight: "6px" },
        controls: { width: 242 },
        theme: { width: 242, textAlign: "start" },
        accent: expect.any(Object),
        reset: expect.any(Object)
      });

    const appearanceMetrics = await page.evaluate(() => {
      const accentRect = document.querySelector(".surface-control--accent")!.getBoundingClientRect();
      const resetRect = document.querySelector(".surface-control--reset")!.getBoundingClientRect();
      return {
        rowOffset: Math.abs(Math.round(accentRect.y) - Math.round(resetRect.y)),
        resetWidth: Math.round(resetRect.width)
      };
    });
    expect(appearanceMetrics).toEqual({ rowOffset: 0, resetWidth: 38 });
    await expect(page.locator(".sidebar-row__label").first()).toBeVisible();
    await expect(page.locator(".surface-control__label").first()).toBeVisible();
    await expect(page.locator("[data-sidebar-collapse]")).toBeHidden();

    const aboutLink = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "About",
      exact: true
    });
    await aboutLink.hover();
    await expect
      .poll(async () =>
        aboutLink.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const edgeTarget = document.elementFromPoint(rect.right - 1, rect.top + rect.height / 2);
          return {
            translated: new DOMMatrixReadOnly(getComputedStyle(node).transform).m41,
            edgeVisible: edgeTarget?.closest(".sidebar-row") === node
          };
        })
      )
      .toEqual({ translated: 3, edgeVisible: true });

    await page.mouse.move(220, 220);
    const actionMetrics = await page.evaluate(() => {
      const mobile = document.querySelector("[data-sidebar-open]");
      const regular = document.querySelector("[data-sidebar-collapse]");
      const mobileIcon = mobile?.querySelector(".mobile-menu-button__icon--close");
      const regularIcon = regular?.querySelector(".menu-icon");
      if (!(mobile instanceof HTMLElement) || !(regular instanceof HTMLElement)) return null;
      const mobileBox = mobile.getBoundingClientRect();
      const regularBox = regular.getBoundingClientRect();
      const mobileStyle = getComputedStyle(mobile);
      const regularStyle = getComputedStyle(regular);
      return {
        mobile: {
          width: mobileBox.width,
          height: mobileBox.height,
          shadow: mobileStyle.boxShadow,
          background: mobileStyle.backgroundColor,
          borderColor: mobileStyle.borderColor
        },
        regular: {
          width: regularBox.width,
          height: regularBox.height,
          shadow: regularStyle.boxShadow,
          background: regularStyle.backgroundColor,
          borderColor: regularStyle.borderColor
        },
        sharedActionClass:
          mobile.classList.contains("sidebar-action-button") && regular.classList.contains("sidebar-action-button"),
        offset: {
          x: Math.abs(mobileBox.x - regularBox.x),
          y: Math.abs(mobileBox.y - regularBox.y)
        },
        iconColor: mobileIcon && regularIcon
          ? [getComputedStyle(mobileIcon).color, getComputedStyle(regularIcon).color]
          : [],
        iconWidth: mobileIcon && regularIcon
          ? [mobileIcon.getBoundingClientRect().width, regularIcon.getBoundingClientRect().width]
          : [],
        topControl:
          document.elementFromPoint(mobileBox.x + mobileBox.width / 2, mobileBox.y + mobileBox.height / 2)
            ?.closest("[data-sidebar-open]") === mobile
      };
    });
    expect(actionMetrics).not.toBeNull();
    expect(actionMetrics?.mobile).toEqual(actionMetrics?.regular);
    expect(actionMetrics?.sharedActionClass).toBe(true);
    expect(actionMetrics?.offset.x).toBeLessThanOrEqual(1);
    expect(actionMetrics?.offset.y).toBeLessThanOrEqual(1);
    expect(actionMetrics?.iconColor[0]).toBe(actionMetrics?.iconColor[1]);
    expect(actionMetrics?.iconWidth).toEqual([22, 22]);
    expect(actionMetrics?.topControl).toBe(true);

    await toggle.click();
    await expect(root).not.toHaveClass(/sidebar-open/);
    await expect(toggle).toHaveAccessibleName("Open navigation");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(async () =>
        toggle.evaluate((button) => getComputedStyle(button).backgroundColor !== "rgba(0, 0, 0, 0)")
      )
      .toBe(true);
    await expect(backdrop).toHaveCSS("pointer-events", "none");
    await expect.poll(async () => (await sidebar.boundingBox())?.x ?? 0).toBeLessThan(0);

    await toggle.click();
    await expect(root).toHaveClass(/sidebar-open/);
    await expect(toggle).toHaveAccessibleName("Close navigation");

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(root).not.toHaveClass(/sidebar-open/);
    await expect(root).toHaveClass(/sidebar-collapsed/);
    await expect(toggle).toBeHidden();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("mobile sidebar overlay stays open during navigation", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only overlay navigation check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const toggle = page.locator("[data-sidebar-open]");
    await toggle.click();
    await expect(root).toHaveClass(/sidebar-open/);

    const toggleTransitionSamples = page.evaluate(
      () =>
        new Promise<MobileSidebarTransitionSample[]>((resolve) => {
          const samples: MobileSidebarTransitionSample[] = [];
          const startedAt = performance.now();
          let sawTransition = false;

          const sample = () => {
            const rootNode = document.documentElement;
            const transitionActive = rootNode.hasAttribute("data-astro-transition");
            if (transitionActive) {
              sawTransition = true;
              const button = document.querySelector("[data-sidebar-open]");
              const backdrop = document.querySelector(".sidebar-backdrop");
              const owner = button ? getComputedStyle(button).getPropertyValue("view-transition-name").trim() : "";
              const backdropOwner = backdrop
                ? getComputedStyle(backdrop).getPropertyValue("view-transition-name").trim()
                : "";
              if (owner && owner !== "none" && backdropOwner && backdropOwner !== "none") {
                const group = getComputedStyle(rootNode, `::view-transition-group(${owner})`);
                const oldLayer = getComputedStyle(rootNode, `::view-transition-old(${owner})`);
                const newLayer = getComputedStyle(rootNode, `::view-transition-new(${owner})`);
                const sidebarGroup = getComputedStyle(rootNode, "::view-transition-group(sidebar-shell)");
                const sidebarOldLayer = getComputedStyle(rootNode, "::view-transition-old(sidebar-shell)");
                const sidebarNewLayer = getComputedStyle(rootNode, "::view-transition-new(sidebar-shell)");
                const backdropGroup = getComputedStyle(rootNode, `::view-transition-group(${backdropOwner})`);
                const backdropOldLayer = getComputedStyle(rootNode, `::view-transition-old(${backdropOwner})`);
                const backdropNewLayer = getComputedStyle(rootNode, `::view-transition-new(${backdropOwner})`);
                const pageGroup = getComputedStyle(rootNode, "::view-transition-group(page-content)");
                const width = Number.parseFloat(group.width);
                const height = Number.parseFloat(group.height);
                const backdropWidth = Number.parseFloat(backdropGroup.width);
                const backdropHeight = Number.parseFloat(backdropGroup.height);
                if (width > 0 && height > 0 && backdropWidth > 0 && backdropHeight > 0) {
                  samples.push({
                    owner,
                    width,
                    height,
                    visibility: group.visibility,
                    oldOpacity: Number(oldLayer.opacity),
                    newOpacity: Number(newLayer.opacity),
                    zIndex: Number(group.zIndex),
                    sidebarZIndex: Number(sidebarGroup.zIndex),
                    sidebarOldOpacity: Number(sidebarOldLayer.opacity),
                    sidebarNewOpacity: Number(sidebarNewLayer.opacity),
                    backdropOwner,
                    backdropWidth,
                    backdropHeight,
                    backdropVisibility: backdropGroup.visibility,
                    backdropOldOpacity: Number(backdropOldLayer.opacity),
                    backdropNewOpacity: Number(backdropNewLayer.opacity),
                    backdropZIndex: Number(backdropGroup.zIndex),
                    pageZIndex: Number(pageGroup.zIndex),
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight
                  });
                }
              }
            }

            if ((sawTransition && !transitionActive) || performance.now() - startedAt > 1500) {
              resolve(samples);
              return;
            }
            requestAnimationFrame(sample);
          };

          requestAnimationFrame(sample);
        })
    );

    await nav.getByRole("link", { name: "All projects", exact: true }).click({ noWaitAfter: true });
    const transitionSamples = await toggleTransitionSamples;
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(root).toHaveClass(/sidebar-open/);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAccessibleName("Close navigation");
    expect(transitionSamples.length).toBeGreaterThanOrEqual(2);
    transitionSamples.forEach((sample) => {
      expect(sample.owner).toBe("mobile-sidebar-toggle");
      expect(sample.width).toBeGreaterThanOrEqual(34);
      expect(sample.height).toBeGreaterThanOrEqual(34);
      expect(sample.visibility).toBe("visible");
      expect(sample.oldOpacity).toBe(1);
      expect(sample.newOpacity).toBe(0);
      expect(sample.zIndex).toBeGreaterThan(sample.sidebarZIndex);
      expect(sample.sidebarOldOpacity).toBe(0);
      expect(sample.sidebarNewOpacity).toBe(1);
      expect(sample.backdropOwner).toBe("mobile-sidebar-backdrop");
      expect(Math.abs(sample.backdropWidth - sample.viewportWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(sample.backdropHeight - sample.viewportHeight)).toBeLessThanOrEqual(1);
      expect(sample.backdropVisibility).toBe("visible");
      expect(sample.backdropOldOpacity).toBe(1);
      expect(sample.backdropNewOpacity).toBe(0);
      expect(sample.backdropZIndex).toBeGreaterThan(sample.pageZIndex);
      expect(sample.backdropZIndex).toBeLessThan(sample.sidebarZIndex);
    });
    await toggle.click();
    await expect(root).not.toHaveClass(/sidebar-open/);
  });

  test("sidebar navigation direction follows item order and accepts rapid clicks", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only rapid sidebar navigation check");

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await nav.getByRole("link", { name: "All projects", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");

    await nav.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "up");

    await nav.getByRole("link", { name: "All projects", exact: true }).click({ noWaitAfter: true });
    await nav.getByRole("link", { name: "ProtoShape", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");
    expect(pageErrors.filter((message) => message.includes("interceptedSidebarNavigationClick"))).toEqual([]);
  });

  test("browser history navigation follows sidebar route order", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only browser history direction check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });

    await nav.getByRole("link", { name: "All projects", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "down");

    await nav.getByRole("link", { name: "About", exact: true }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(root).toHaveAttribute("data-page-direction", "up");

    await page.goBack();
    await expect(page).toHaveURL(/\/work\/$/);
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

    await nav.getByRole("link", { name: "All projects", exact: true }).click({ noWaitAfter: true });
    await nav.getByRole("link", { name: "ProtoShape", exact: true }).click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);
    await expect(page.getByRole("heading", { name: "ProtoShape", level: 1 })).toBeVisible();
  });

  test("sidebar selection responds during the visible page transition", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only transition hit-test check");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const allProjects = nav.getByRole("link", { name: "All projects", exact: true });
    const projects = nav.getByRole("link", { name: "ProtoShape", exact: true });

    const selectionState = await allProjects.evaluate((node) => {
      (node as HTMLElement).click();
      const layer = getComputedStyle(node, "::after");
      return {
        entering: node.classList.contains("is-selection-entering"),
        sweeping: layer.animationName.includes("nav-selection-sweep"),
        pointerEvents: layer.pointerEvents,
        transforms: layer.willChange.includes("transform")
      };
    });
    expect(selectionState).toEqual({ entering: true, sweeping: true, pointerEvents: "none", transforms: true });
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(root).toHaveAttribute("data-astro-transition", /forward|back/);

    const box = await projects.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);

    await expect(projects).toHaveAttribute("aria-current", "page");
    await expect(projects).toHaveClass(/is-active/);
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);
    await expect(page.getByRole("heading", { name: "ProtoShape", level: 1 })).toBeVisible();
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

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const sidebar = page.locator("[data-sidebar]");
    const panel = page.locator(".sidebar-panel");
    const main = page.locator("#main-content");
    const toggleBox = await page.getByRole("button", { name: "Collapse sidebar" }).boundingBox();
    await expect(page.locator(".brand-mark")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "HLCaptain home" })).toHaveCount(0);
    await expect(page.locator(".sidebar-toggle .menu-icon .semantic-icon__svg")).toHaveCount(6);
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
      const groupGlyph = group.querySelector(".semantic-icon")!;
      const groupToggle = group.querySelector(".group-toggle-icon")!;
      const itemRow = document.querySelector(".nav-item")!;
      const itemIcon = itemRow.querySelector(".sidebar-row__icon")!;
      const itemGlyph = itemRow.querySelector(".semantic-icon")!;
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
        selectedArrowInsideGroup: Boolean(group.querySelector(".arrow-icon"))
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
    const dormantGroupBorderColors = await page.locator(".nav-group").evaluateAll((groups) =>
      groups.flatMap((group) => {
        const style = getComputedStyle(group);
        return [style.borderRightColor, style.borderBottomColor];
      })
    );
    expect(dormantGroupBorderColors.every((color) => parseColor(color).a === 0)).toBe(true);
    const expandedActive = await nav.getByRole("link", { name: "All projects", exact: true }).evaluate((node) => {
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
      const labels = Array.from(document.querySelectorAll(".accent-panel .surface-control__label")).map((node) => {
        const style = getComputedStyle(node);
        return {
          display: style.display,
          opacity: Number.parseFloat(style.opacity),
          pointerEvents: style.pointerEvents
        };
      });
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
    expect(
      compactSurfaceControls.labels.every(
        ({ display, opacity, pointerEvents }) => display !== "none" && opacity === 0 && pointerEvents === "none"
      )
    ).toBe(true);
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
          .getByRole("link", { name: "All projects", exact: true })
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

    const collapsedProjectsBox = await page.locator("[data-nav-group='Projects'] summary").boundingBox();
    expect(collapsedProjectsBox).not.toBeNull();
    await page.mouse.move(
      (collapsedProjectsBox?.x ?? 0) + (collapsedProjectsBox?.width ?? 0) / 2,
      (collapsedProjectsBox?.y ?? 0) + (collapsedProjectsBox?.height ?? 0) / 2
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
          .getByRole("link", { name: "All projects", exact: true })
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
    await expect(root).toHaveClass(/sidebar-overlay-open/);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBeGreaterThan(240);

    await page.getByRole("button", { name: "Open debug menu" }).focus();
    await expect.poll(async () => root.evaluate((node) => node.classList.contains("sidebar-overlay-open"))).toBe(false);
    await expect.poll(async () => panel.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(56);

    const labelState = await nav
      .locator('a[href="/work/"]')
      .locator("span")
      .last()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          display: style.display,
          opacity: Number.parseFloat(style.opacity),
          pointerEvents: style.pointerEvents
        };
      });
    expect(labelState).toEqual({ display: "block", opacity: 0, pointerEvents: "none" });
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
    const { itemWidth, ...collapsedContainerSpacing } = collapsedSpacing;
    expect(collapsedContainerSpacing).toEqual({
      panelPadding: 10,
      panelGap: 10,
      navGap: 6,
      navOverflowX: "hidden",
      navOverflowY: "auto",
      navPaddingLeft: 0,
      navPaddingRight: 0,
      groupPaddingTop: 0,
      groupPaddingRight: 0,
      groupPaddingBottom: 0,
      groupPaddingLeft: 0,
      groupWidth: 34,
      summaryWidth: 32
    });
    expect(itemWidth).toBeGreaterThanOrEqual(31);
    expect(itemWidth).toBeLessThanOrEqual(34);
    const glyphBox = await page.locator("[data-nav-group='Projects'] summary .semantic-icon:not(.group-toggle-icon)").boundingBox();
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
      const glyph = group?.querySelector(".nav-group__icon .semantic-icon");
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
      const glyph = summary.querySelector(".nav-group__icon .semantic-icon");
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

    const projectsLink = nav.getByRole("link", { name: "All projects", exact: true });
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

    const allProjects = page.locator("#main-content").getByRole("link", { name: "All projects" });
    await allProjects.scrollIntoViewIfNeeded();
    await allProjects.click();
    await expect(page).toHaveURL(/\/work\/$/);
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
    const projectsGroup = page.locator("[data-nav-group='Projects']");
    await expect.poll(async () => projectsGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);

    await projectsGroup.locator("summary").click();
    await expect.poll(async () => projectsGroup.evaluate((node) => node.classList.contains("is-collapsing"))).toBe(true);
    await nav.getByRole("link", { name: "About", exact: true }).click();

    await expect(page).toHaveURL(/\/about\/$/);
    await expect
      .poll(async () =>
        page.locator("[data-nav-group='Projects']").evaluate((node) => ({
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

  test("reverses an interrupted sidebar group collapse", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const projectsGroup = page.locator("[data-nav-group='Projects']");
    const projectItems = projectsGroup.locator(".nav-items");
    const summary = projectsGroup.locator("summary");
    const initialHeight = await projectItems.evaluate((node) => node.getBoundingClientRect().height);

    await summary.click();
    await expect
      .poll(async () =>
        projectsGroup.evaluate(
          (node, expandedHeight) => {
            const height = node.querySelector(".nav-items")!.getBoundingClientRect().height;
            return node.classList.contains("is-collapsing") && height > 8 && height < expandedHeight - 8;
          },
          initialHeight
        )
      )
      .toBe(true);

    await summary.click();
    await expect.poll(async () => projectsGroup.evaluate((node) => node.classList.contains("is-expanding"))).toBe(true);
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(window.sessionStorage.getItem("hlcaptain-nav-groups") || "{}").Projects)
      )
      .toBe(true);
    await expect
      .poll(async () =>
        projectsGroup.evaluate((node) => ({
          open: (node as HTMLDetailsElement).open,
          animating: node.classList.contains("is-expanding") || node.classList.contains("is-collapsing"),
          height: Math.round(node.querySelector(".nav-items")!.getBoundingClientRect().height)
        }))
      )
      .toEqual({ open: true, animating: false, height: Math.round(initialHeight) });
  });

  test("sidebar group item lists animate open and closed", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const projectsGroup = page.locator("[data-nav-group='Projects']");
    const projectItems = projectsGroup.locator(".nav-items");
    const initialHeight = await projectItems.evaluate((node) => node.getBoundingClientRect().height);
    expect(initialHeight).toBeGreaterThan(40);

    const collapseCleanupPromise = projectsGroup.evaluate(
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

    await projectsGroup.locator("summary").click();
    await expect.poll(async () => projectsGroup.evaluate((node) => node.classList.contains("is-collapsing"))).toBe(true);
    await expect
      .poll(async () =>
        projectsGroup.evaluate((node) => {
          const arrow = node.querySelector(".group-toggle-icon")!;
          const transform = getComputedStyle(arrow).transform;
          const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
          const angle = Math.abs((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI);
          return (node as HTMLDetailsElement).open && node.classList.contains("is-collapsing") && angle < 70;
        })
      )
      .toBe(true);
    await expect
      .poll(async () => projectItems.evaluate((node) => node.getBoundingClientRect().height))
      .toBeLessThan(initialHeight);
    await expect.poll(async () => projectsGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
    const closedState = await projectItems.evaluate((node) => ({
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

    const expandSamples = projectsGroup.evaluate(
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

    await projectsGroup.locator("summary").click();
    await expect.poll(async () => projectsGroup.evaluate((node) => node.classList.contains("is-expanding"))).toBe(true);
    await expect.poll(async () => projectsGroup.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(true);
    await expect
      .poll(async () => projectItems.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(40);
    const samples = await expandSamples;
    const cleanupIndex = samples.findIndex((sample, index) => index > 0 && samples[index - 1].expanding && !sample.expanding);
    expect(cleanupIndex).toBeGreaterThan(0);
    expect(Math.abs(samples[cleanupIndex].height - samples[cleanupIndex - 1].height)).toBeLessThanOrEqual(4);
    await expect
      .poll(async () =>
        projectsGroup.evaluate((node) => ({
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
    expect(blackGridSoft.includes("/ 0.14") || blackGridSoft === "#b9843b24").toBe(true);
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
      const icon = node.querySelector(".entry-card__glyph .semantic-icon");
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
    await expect(arrow.locator(".semantic-icon__svg[data-icon-style]")).toHaveCount(6);
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

  test("network profile icons stay drawn across overview and detail pages", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hlcaptain-sidebar", "collapsed"));

    for (const path of ["/", "/work/proto-shape/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if ((page.viewportSize()?.width ?? 0) < 721) {
        await page.getByRole("button", { name: "Open navigation" }).click();
      }

      const nav = page.getByRole("navigation", { name: "Primary navigation" });
      for (const [label, icon] of [["GitHub", "github"], ["LinkedIn", "linkedin"], ["X", "x"]] as const) {
        const networkIcon = nav
          .getByRole("link", { name: label, exact: true })
          .locator(`.sidebar-row__icon .semantic-icon[data-icon-name="${icon}"]`);
        await expect(networkIcon).toBeVisible();
        const box = await networkIcon.locator('.semantic-icon__svg[data-icon-style="tabler"]').evaluate((node) => {
          const bounds = (node as SVGGraphicsElement).getBBox();
          return { width: bounds.width, height: bounds.height };
        });
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  test("debug icon choices drive semantic icons site-wide", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1200, "Desktop-only site-wide semantic icon check");

    await page.addInitScript(() => localStorage.setItem("hlcaptain-arrow-style", "heroicons"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const root = page.locator("html");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const protoCard = page.getByRole("link", { name: "Open ProtoShape", exact: true });
    const protoCardIcon = protoCard.locator(".entry-card__glyph .semantic-icon");
    const splitCardIcon = page
      .getByRole("link", { name: "Open SplitEasy AI", exact: true })
      .locator(".entry-card__glyph .semantic-icon");
    const protoSidebarIcon = nav
      .getByRole("link", { name: "ProtoShape", exact: true })
      .locator(".sidebar-row__icon .semantic-icon");
    const splitSidebarIcon = nav
      .getByRole("link", { name: "SplitEasy AI", exact: true })
      .locator(".sidebar-row__icon .semantic-icon");
    const indexIcon = page.locator('[data-nav-group="Index"] > summary .semantic-icon:not(.group-toggle-icon)');
    const networkIcon = page.locator('[data-nav-group="Network"] > summary .semantic-icon:not(.group-toggle-icon)');
    const githubIcon = nav
      .getByRole("link", { name: "GitHub", exact: true })
      .locator(".sidebar-row__icon .semantic-icon");
    const linkedinIcon = nav
      .getByRole("link", { name: "LinkedIn", exact: true })
      .locator(".sidebar-row__icon .semantic-icon");
    const xIcon = nav
      .getByRole("link", { name: "X", exact: true })
      .locator(".sidebar-row__icon .semantic-icon");
    const projectsLink = page.getByRole("link", { name: "View projects", exact: true });
    const projectsLinkIcon = projectsLink.locator(".semantic-icon");
    const githubExternalIcon = nav
      .getByRole("link", { name: "GitHub", exact: true })
      .locator(".external-link-icon");
    const semanticIcons = [
      page.getByRole("link", { name: "About", exact: true }).locator(".semantic-icon"),
      page.getByRole("button", { name: "Open debug menu" }).locator(".semantic-icon"),
      indexIcon,
      networkIcon,
      githubIcon,
      linkedinIcon,
      xIcon,
      protoSidebarIcon,
      splitSidebarIcon,
      projectsLinkIcon,
      protoCardIcon,
      splitCardIcon,
      page.locator(".sidebar-toggle .menu-icon"),
      page.locator(".surface-control__icon--light"),
      page.locator(".surface-control--reset .semantic-icon"),
      githubExternalIcon
    ];

    await expect(root).toHaveAttribute("data-arrow-style", "tabler");
    await expect(page.locator('[data-icon-style="heroicons"], [data-icon-style="solar"], [data-icon-style="material"], [data-icon-style="carbon"], [data-icon-style="radix"]')).toHaveCount(0);
    for (const icon of semanticIcons) {
      await expect(icon.locator(".semantic-icon__svg[data-icon-style]")).toHaveCount(6);
    }
    await expect(indexIcon).toHaveAttribute("data-icon-name", "index");
    await expect(networkIcon).toHaveAttribute("data-icon-name", "network");
    await expect(githubIcon).toHaveAttribute("data-icon-name", "github");
    await expect(linkedinIcon).toHaveAttribute("data-icon-name", "linkedin");
    await expect(xIcon).toHaveAttribute("data-icon-name", "x");
    await expect(projectsLinkIcon).toHaveAttribute("data-icon-name", "work");
    await expect(protoSidebarIcon).toHaveAttribute("data-icon-name", "cube");
    await expect(splitSidebarIcon).toHaveAttribute("data-icon-name", "receipt");
    await expect(protoCardIcon).toHaveAttribute("data-icon-name", "cube");
    await expect(splitCardIcon).toHaveAttribute("data-icon-name", "receipt");
    const fallbackThumbnail = await protoCard.locator(".entry-card__glyph").evaluate((node) => ({
      width: node.clientWidth,
      height: node.clientHeight,
      iconWidth: node.querySelector(".semantic-icon")?.clientWidth ?? 0
    }));
    expect(fallbackThumbnail.width / fallbackThumbnail.height).toBeCloseTo(16 / 9, 1);
    expect(fallbackThumbnail.iconWidth).toBeGreaterThanOrEqual(56);

    await page.getByRole("button", { name: "Open debug menu" }).click();
    await expect(page.locator("button[data-arrow-style]")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Tabler", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const [label, style] of [
      ["Tabler", "tabler"],
      ["Lucide", "lucide"],
      ["Phosphor", "phosphor"],
      ["Remix", "remix"],
      ["Fluent", "fluent"],
      ["Pixelart", "pixelart"]
    ] as const) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(root).toHaveAttribute("data-arrow-style", style);
      await expect(button).toHaveAttribute("aria-pressed", "true");
      for (const icon of semanticIcons) {
        await expect(icon.locator(`.semantic-icon__svg[data-icon-style="${style}"]`)).toBeVisible();
      }
      const githubBox = await githubIcon.locator(`.semantic-icon__svg[data-icon-style="${style}"]`).evaluate((node) => {
        const bounds = (node as SVGGraphicsElement).getBBox();
        return { width: bounds.width, height: bounds.height };
      });
      expect(githubBox.width).toBeGreaterThan(0);
      expect(githubBox.height).toBeGreaterThan(0);
    }
    await page.getByRole("button", { name: "Close debug menu" }).click();

    await protoCard.hover();
    await expect(protoCardIcon).toBeVisible();
    await expect(protoCardIcon.locator('.semantic-icon__svg[data-icon-style="pixelart"]')).toBeVisible();
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

    await page.getByRole("link", { name: "View projects" }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "black");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "black");
    const afterNav = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--accent"));
    expect(afterNav.trim()).toBe(beforeNav.trim());
  });

});
