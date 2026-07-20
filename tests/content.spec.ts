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
    await expect(pageHeader.locator(".page-header__back-icon .semantic-icon__svg")).toHaveCount(6);
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
    await expect(markdownHeadings).toHaveCount(5);
    await expect(headingCopyButtons).toHaveCount(5);
    await expect(headingCopyButtons.first()).toHaveAttribute("data-heading-copy", "overview");
    await expect(headingCopyButtons.first()).toHaveAttribute("data-copy-path", "/work/proto-shape/#overview");
    await expect(headingCopyButtons.first()).toHaveCSS("position", "absolute");
    await expect(headingCopyButtons.first()).toHaveCSS("width", "36px");
    await expect(headingCopyButtons.first().locator(".heading-reference__icon .semantic-icon__svg")).toHaveCount(6);
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
    const iconStyle = await headingCopyButtons.first().locator(".heading-reference__icon .semantic-icon__svg").evaluateAll((icons) =>
      icons.filter((icon) => getComputedStyle(icon).display !== "none").map((icon) => icon.getAttribute("data-icon-style"))
    );
    expect(iconStyle).toEqual(["tabler"]);
    await page.getByRole("button", { name: "Open debug menu" }).click();
    await page.getByRole("button", { name: "Phosphor", exact: true }).click();
    await expect(headingCopyButtons.first().locator('.heading-reference__icon [data-icon-style="phosphor"]')).toBeVisible();
    await expect(pageHeader.locator('.page-header__back-icon [data-icon-style="phosphor"]')).toBeVisible();
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
      const title = lines[window.innerWidth <= 900 ? lines.length - 1 : 0];
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
    if (page.viewportSize()!.width <= 900) {
      expect(Math.abs(headingReferenceGeometry.iconLeft - headingReferenceGeometry.expectedMobileLeft)).toBeLessThanOrEqual(1);
    } else {
      expect(headingReferenceGeometry.iconRight).toBeLessThanOrEqual(headingReferenceGeometry.headingLeft);
    }
    await headingCopyButtons.first().click();
    await expect(headingCopyButtons.first()).toHaveClass(/is-copied/);
    await expect(headingCopyButtons.first()).toHaveAttribute("aria-label", "Copied link to Overview");
    await expect
      .poll(() =>
        headingCopyButtons.first().evaluate((button) => ({
          checkOpacity: getComputedStyle(button.querySelector(".heading-reference__check")!).opacity,
          iconOpacity: getComputedStyle(button.querySelector(".heading-reference__icon")!).opacity
        }))
      )
      .toEqual({ checkOpacity: "1", iconOpacity: "0" });
    await expect(headingCopyButtons.first().locator('.heading-reference__check [data-icon-style="phosphor"]')).toBeVisible();
    expect(
      await headingCopyButtons.first().evaluate((button) =>
        getComputedStyle(button.querySelector(".heading-reference__check")!).transitionDuration
      )
    ).not.toBe("0s");
    await page.mouse.move(viewport.width - 2, viewport.height - 2);
    await expect
      .poll(() =>
        headingCopyButtons.first().evaluate((button) => ({
          copied: button.classList.contains("is-copied"),
          opacity: getComputedStyle(button).opacity
        }))
      )
      .toEqual({ copied: true, opacity: "0" });
    const projectFacts = page.getByLabel("Project facts");
    await expect(projectFacts).toContainText("Creator and maintainer");
    await expect(projectFacts).toContainText(/Open source · v\d+\.\d+\.\d+/);
    await expect(projectFacts).toContainText(/Godot \d+\.\d+ · GDScript · CSG/);
    await expect(page.getByText(/The current version targets Godot \d+\.\d+/)).toBeVisible();
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
    const railEdges = await Promise.all(
      [pageHeader, projectLinks, projectFacts, page.locator(".project-overview-video"), markdownHeadings.first()].map(
        (element) => element.evaluate((node) => {
          const { left, right } = node.getBoundingClientRect();
          return { left, right };
        })
      )
    );
    expect(Math.max(...railEdges.map(({ left }) => left)) - Math.min(...railEdges.map(({ left }) => left))).toBeLessThanOrEqual(1);
    expect(Math.max(...railEdges.map(({ right }) => right)) - Math.min(...railEdges.map(({ right }) => right))).toBeLessThanOrEqual(1);

    const mobileToc = page.locator("[data-toc-mobile]");
    const desktopToc = page.locator("[data-toc-desktop]");
    const toc = page.viewportSize()!.width <= 720 ? mobileToc : desktopToc;
    await expect(mobileToc.locator(".table-of-contents__chevron .semantic-icon__svg")).toHaveCount(6);
    await expect(toc).toBeVisible();
    await expect(page.viewportSize()!.width <= 720 ? desktopToc : mobileToc).toBeHidden();
    const tocLinks = toc.locator("a");
    await expect(tocLinks).toHaveCount(5);
    expect(await tocLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(
      await markdownHeadings.evaluateAll((headings) => headings.map((heading) => `#${heading.id}`))
    );
    expect(
      await toc.locator('a[href="#shared-gizmo-utilities"]').evaluate((link) =>
        link.closest("ol")?.parentElement?.querySelector(":scope > .table-of-contents__link-group > a")?.getAttribute("href")
      )
    ).toBe("#editor-tooling-as-a-reusable-system");

    if (page.viewportSize()!.width <= 720) {
      const mobileOrder = await page.evaluate(() => {
        const facts = document.querySelector(".project-facts")!.getBoundingClientRect();
        const video = document.querySelector(".project-overview-video")!.getBoundingClientRect();
        const toc = document.querySelector("[data-toc-mobile]")!.getBoundingClientRect();
        const overview = document.querySelector("#overview")!.getBoundingClientRect();
        return { leadBottom: Math.max(facts.bottom, video.bottom), tocTop: toc.top, tocBottom: toc.bottom, overviewTop: overview.top };
      });
      expect(mobileOrder.tocTop).toBeGreaterThanOrEqual(mobileOrder.leadBottom - 1);
      expect(mobileOrder.overviewTop).toBeGreaterThanOrEqual(mobileOrder.tocBottom - 1);
      const toggleToc = async () => {
        const samples = await mobileToc.evaluate(
          (node) =>
            new Promise<number[]>((resolve) => {
              const height = () => Number.parseFloat(getComputedStyle(node, "::details-content").height);
              const samples = [height()];
              const startedAt = performance.now();
              (node.querySelector("summary") as HTMLElement).click();
              const sample = () => {
                samples.push(height());
                if (performance.now() - startedAt < 320) requestAnimationFrame(sample);
                else resolve(samples);
              };
              requestAnimationFrame(sample);
            })
        );
        const low = Math.min(samples[0], samples.at(-1)!);
        const high = Math.max(samples[0], samples.at(-1)!);
        expect(samples.slice(1, -1).some((height) => height > low + 1 && height < high - 1)).toBe(true);
      };

      await toggleToc();
      await expect(mobileToc).toHaveAttribute("open", "");
      await toggleToc();
      await expect(mobileToc).not.toHaveAttribute("open", "");
      await toggleToc();
      await expect(mobileToc).toHaveAttribute("open", "");
    } else {
      expect(
        await desktopToc.evaluate((node) => {
          const style = getComputedStyle(node);
          return { position: style.position, overflowY: style.overflowY, rightOfContent: node.getBoundingClientRect().left > document.querySelector(".document-content")!.getBoundingClientRect().right };
        })
      ).toEqual({ position: "sticky", overflowY: "auto", rightOfContent: true });
    }

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("scroll-behavior");
      const state = window as Window & { __tocScrollSamples?: number[] };
      state.__tocScrollSamples = [];
      window.addEventListener("scroll", () => state.__tocScrollSamples?.push(window.scrollY), { passive: true });
    });
    await toc.locator('a[href="#overview"]').click();
    await expect(page.locator("html")).toHaveClass(/toc-scrolling/);
    await expect(page).toHaveURL(/#overview$/);
    await expect.poll(() => page.locator("#overview").evaluate((heading) => Math.abs(heading.getBoundingClientRect().top - 24))).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => new Set((window as Window & { __tocScrollSamples?: number[] }).__tocScrollSamples).size)
    ).toBeGreaterThan(2);
    await expect(page.locator("html")).not.toHaveClass(/toc-scrolling/);
    if (page.viewportSize()!.width > 720 && page.viewportSize()!.width <= 900) {
      await page.evaluate(() => window.localStorage.removeItem("hlcaptain-sidebar"));
      await page.goto("/work/proto-shape/");
      await markdownHeadings.first().hover({ position: { x: 2, y: 2 } });
      await headingCopyButtons.first().hover();
      await expect(headingCopyButtons.first()).toHaveCSS("color", accentColor);
      await expect(desktopToc).toBeVisible();
    }
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

  test("project back control skips same-page fragment history", async ({ page }) => {
    await page.goto("/work/");
    await page.locator("#main-content").getByRole("link", { name: "Open ProtoShape" }).click();
    await expect(page).toHaveURL(/\/work\/proto-shape\/$/);

    const toc = page.locator(page.viewportSize()!.width <= 720 ? "[data-toc-mobile]" : "[data-toc-desktop]");
    if (page.viewportSize()!.width <= 720) await toc.locator("summary").click();

    await toc.locator('a[href="#overview"]').click();
    await expect(page).toHaveURL(/#overview$/);
    await toc.locator('a[href="#what-it-solves"]').click();
    await expect(page).toHaveURL(/#what-it-solves$/);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/work\/$/);
  });

  test("project back control falls back to overview without browser history", async ({ page, baseURL }) => {
    const origin = baseURL!;
    const detailUrl = new URL("/work/proto-shape/", origin).href;
    await Promise.all([
      page.waitForURL(detailUrl),
      page.evaluate((url) => window.location.replace(url), detailUrl)
    ]);
    expect(await page.evaluate(() => window.history.length)).toBe(1);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(new URL("/", origin).href);
    await expect(page.getByRole("heading", { name: "HLCaptain" })).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBe(1);
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
