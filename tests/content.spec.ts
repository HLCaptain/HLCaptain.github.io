import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
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
    await page.goto("/work/proto-shape/");

    const pageHeader = page.locator(".page-header");
    await expect(pageHeader.getByRole("heading", { name: "ProtoShape" })).toBeVisible();
    await expect(pageHeader.locator(".page-header__back")).toHaveText("Projects");
    await expect(pageHeader.locator(".page-header__back")).toHaveAttribute("href", "/work/");
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
    await expect(markdownHeadings).toHaveCount(4);
    await expect(headingCopyButtons).toHaveCount(4);
    await expect(headingCopyButtons.first()).toHaveAttribute("data-heading-copy", "overview");
    await expect(headingCopyButtons.first()).toHaveAttribute("data-copy-path", "/work/proto-shape/#overview");
    await expect(headingCopyButtons.first()).toHaveCSS("position", "absolute");
    await headingCopyButtons.first().click();
    await expect(headingCopyButtons.first()).toHaveClass(/is-copied/);
    await expect(page.getByLabel("Project facts")).toContainText("Creator and maintainer");
    await expect(page.getByRole("heading", { name: "Editor tooling as a reusable system" })).toBeVisible();
    const projectLinks = page.getByRole("navigation", { name: "Project links" });
    await expect(projectLinks).toBeVisible();
    await expect(projectLinks.getByRole("link", { name: "GitHub repository" })).toHaveAttribute(
      "href",
      "https://github.com/HLCaptain/proto-shape"
    );
    await expect(projectLinks.getByRole("link")).toHaveCount(3);
    await expect(projectLinks.locator(".external-link-icon")).toHaveCount(3);
    await expect(page.locator("video")).toHaveAttribute(
      "src",
      "https://github.com/HLCaptain/proto-shape/assets/22623259/730a527c-d6ba-4eaa-93b6-dbcbbd8aba52"
    );
    await expectNoHorizontalOverflow(page);
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
