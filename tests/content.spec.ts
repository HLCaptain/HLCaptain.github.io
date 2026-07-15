import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
}

async function resolvedColor(page: Page, token: string) {
  return page.evaluate((tokenName) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${tokenName})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

test.describe("project case studies", () => {
  test("work index lists the real projects and removes placeholders", async ({ page }) => {
    await page.goto("/work/");

    await expect(page.getByRole("heading", { name: "Selected work" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ProtoShape" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SplitEasy AI" })).toBeVisible();
    await expect(page.getByText("LexiDash Arena")).toHaveCount(0);
    await expect(page.getByText("Personal publishing system")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("ProtoShape renders MDX facts, decisions, and public links", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => window.localStorage.setItem("hlcaptain-sidebar", "collapsed"));
    await page.goto("/work/proto-shape/");

    const pageHeader = page.locator(".page-header");
    await expect(pageHeader.getByRole("heading", { name: "ProtoShape" })).toBeVisible();
    await expect(pageHeader.getByRole("button", { name: "Back" })).toHaveAttribute("data-history-back", "");
    await expect(pageHeader.locator("a.page-header__back")).toHaveCount(0);
    await expect(pageHeader.locator(".page-header__back-icon svg")).toHaveCount(1);
    await expect(pageHeader.locator(".page-header__title-row .eyebrow")).toHaveText("shipped");
    const titleLayout = await pageHeader.locator(".page-header__title-row").evaluate((node) => {
      const title = node.querySelector("h1")!.getBoundingClientRect();
      const status = node.querySelector(".eyebrow")!.getBoundingClientRect();
      return { titleRight: title.right, statusLeft: status.left, statusTop: status.top, titleBottom: title.bottom };
    });
    expect(titleLayout.statusLeft).toBeGreaterThan(titleLayout.titleRight);
    expect(titleLayout.statusTop).toBeLessThan(titleLayout.titleBottom);
    const markdownHeadings = page.locator(".prose :is(h1, h2, h3, h4, h5, h6)[id]");
    const headingCopyButtons = page.locator(".heading-reference");
    const [mutedColor, accentColor] = await Promise.all([resolvedColor(page, "--muted"), resolvedColor(page, "--accent-readable")]);
    await expect(markdownHeadings).toHaveCount(4);
    await expect(headingCopyButtons).toHaveCount(4);
    await expect(headingCopyButtons.first()).toHaveAttribute("data-heading-copy", "overview");
    await expect(headingCopyButtons.first()).toHaveAttribute("data-copy-path", "/work/proto-shape/#overview");
    await expect(headingCopyButtons.first()).toHaveCSS("position", "absolute");
    await expect(headingCopyButtons.first()).toHaveCSS("width", "36px");
    await expect(headingCopyButtons.first().locator(".heading-reference__svg")).toHaveCount(11);
    await expect(headingCopyButtons.first()).toHaveCSS("opacity", "0");
    await markdownHeadings.first().hover({ position: { x: 2, y: 2 } });
    await expect(headingCopyButtons.first()).toHaveCSS("opacity", "1");
    await expect(headingCopyButtons.first()).toHaveCSS("color", mutedColor);
    await headingCopyButtons.first().hover();
    await expect(headingCopyButtons.first()).toHaveCSS("color", accentColor);
    const viewport = page.viewportSize()!;
    await page.mouse.down();
    await page.mouse.move(viewport.width - 2, viewport.height - 2);
    await page.mouse.up();
    await expect(headingCopyButtons.first()).toHaveCSS("opacity", "0");
    const iconStyle = await headingCopyButtons.first().locator(".heading-reference__svg").evaluateAll((icons) =>
      icons.filter((icon) => getComputedStyle(icon).display !== "none").map((icon) => icon.getAttribute("data-icon-style"))
    );
    expect(iconStyle).toEqual(["tabler"]);
    await page.getByRole("button", { name: "Open debug menu" }).click();
    await page.getByRole("button", { name: "Phosphor", exact: true }).click();
    await expect(headingCopyButtons.first().locator('[data-icon-style="phosphor"]')).toBeVisible();
    await page.getByRole("button", { name: "Close debug menu" }).click();
    await markdownHeadings.nth(2).evaluate((heading) => {
      (heading as HTMLElement).style.maxWidth = "260px";
      window.dispatchEvent(new Event("resize"));
    });
    const headingReferenceGeometry = await markdownHeadings.nth(2).evaluate((heading) => {
      const button = heading.querySelector<HTMLElement>(":scope > .heading-reference")!;
      const range = document.createRange();
      range.selectNodeContents(heading);
      range.setEndBefore(button);
      const lines = Array.from(range.getClientRects()).filter(({ width, height }) => width && height);
      const title = lines[window.innerWidth <= 720 ? lines.length - 1 : 0];
      const icon = button.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      return {
        lineCount: lines.length,
        titleCenterY: title.top + title.height / 2,
        iconCenterY: icon.top + icon.height / 2,
        headingLeft: headingRect.left,
        headingRight: headingRect.right,
        iconLeft: icon.left,
        iconRight: icon.right,
        expectedMobileLeft: Math.min(title.right + 6, headingRect.right - icon.width),
        viewportWidth: window.innerWidth
      };
    });
    expect(headingReferenceGeometry.lineCount).toBeGreaterThan(1);
    expect(Math.abs(headingReferenceGeometry.iconCenterY - headingReferenceGeometry.titleCenterY)).toBeLessThanOrEqual(1);
    expect(headingReferenceGeometry.iconLeft).toBeGreaterThanOrEqual(0);
    expect(headingReferenceGeometry.iconRight).toBeLessThanOrEqual(headingReferenceGeometry.viewportWidth);
    if (page.viewportSize()!.width <= 720) {
      expect(Math.abs(headingReferenceGeometry.iconLeft - headingReferenceGeometry.expectedMobileLeft)).toBeLessThanOrEqual(1);
    } else {
      expect(headingReferenceGeometry.iconRight).toBeLessThanOrEqual(headingReferenceGeometry.headingLeft);
    }
    await headingCopyButtons.first().click();
    await expect(headingCopyButtons.first()).toHaveClass(/is-copied/);
    const projectFacts = page.getByLabel("Project facts");
    await expect(projectFacts).toContainText("Creator and maintainer");
    if (page.viewportSize()!.width > 720 && page.viewportSize()!.width <= 1040) {
      const factColumns = await projectFacts.evaluate((facts) => getComputedStyle(facts).gridTemplateColumns.split(" ").length);
      expect(factColumns).toBe(2);
    }
    await expect(page.getByRole("heading", { name: "Editor tooling as a reusable system" })).toBeVisible();
    const projectLinks = page.getByRole("navigation", { name: "Project links" });
    await expect(projectLinks).toBeVisible();
    await expect(projectLinks.getByRole("link", { name: "GitHub repository" })).toHaveAttribute(
      "href",
      "https://github.com/HLCaptain/proto-shape"
    );
    await expect(projectLinks.getByRole("link")).toHaveCount(3);
    const projectLinkIcons = projectLinks.locator(".external-link-icon");
    await expect(projectLinkIcons).toHaveCount(3);
    await expect(projectLinkIcons.first()).toHaveCSS("width", "15px");
    await expect(projectLinkIcons.first()).toHaveCSS("opacity", "1");
    const firstProjectLink = projectLinks.getByRole("link").first();
    await firstProjectLink.hover();
    await expect
      .poll(async () =>
        firstProjectLink.evaluate((link) => ({
          color: getComputedStyle(link).color,
          transform: new DOMMatrixReadOnly(getComputedStyle(link).transform).m42
        }))
      )
      .toEqual({ color: accentColor, transform: -2 });
    await expect(page.locator("video")).toHaveAttribute(
      "src",
      "https://github.com/HLCaptain/proto-shape/assets/22623259/730a527c-d6ba-4eaa-93b6-dbcbbd8aba52"
    );
    await expect(page.locator(".prose > .project-overview-video + h2#overview")).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test("project back control traverses browser history", async ({ page }) => {
    await page.goto("/work/");
    await page.locator("#main-content").getByRole("link", { name: "Open ProtoShape" }).click();
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    await expect(page.getByRole("heading", { name: "Selected work" })).toBeVisible();
  });

  test("SplitEasy clearly renders as a private active prototype", async ({ page }) => {
    await page.goto("/work/spliteasy/");

    await expect(page.getByRole("heading", { name: "SplitEasy AI" })).toBeVisible();
    await expect(page.getByLabel("Project facts")).toContainText("Active private prototype");
    await expect(page.getByRole("heading", { name: "Reliability before automation" })).toBeVisible();
    await expect(page.getByText("not a public production service")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
