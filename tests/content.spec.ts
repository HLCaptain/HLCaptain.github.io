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
    await page.goto("/work/proto-shape/");

    await expect(page.getByRole("heading", { name: "ProtoShape" })).toBeVisible();
    await expect(page.getByLabel("Project facts")).toContainText("Creator and maintainer");
    await expect(page.getByRole("heading", { name: "Editor tooling as a reusable system" })).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub repository" })).toHaveAttribute(
      "href",
      "https://github.com/HLCaptain/proto-shape"
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
