const storageKey = "hlcaptain-accent";
const themeKey = "hlcaptain-theme";
const sidebarKey = "hlcaptain-sidebar";
const arrowKey = "hlcaptain-arrow-style";
const arrowStyles = new Set([
  "tabler",
  "lucide",
  "heroicons",
  "phosphor",
  "solar",
  "remix",
  "material",
  "carbon",
  "fluent",
  "radix",
  "pixelart"
]);

function toHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function toRgbChannels(rgb, alpha = 1) {
  return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)} / ${alpha})`;
}

function parseHexColor(value) {
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(value || "");
  if (!match) return null;
  const full =
    match[1].length === 3 ? match[1].split("").map((char) => char + char).join("") : match[1];
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

function mixRgb(a, b, weight) {
  return {
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight
  };
}

function relativeLuminance(rgb) {
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a, b) {
  const high = Math.max(relativeLuminance(a), relativeLuminance(b));
  const low = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (high + 0.05) / (low + 0.05);
}

function normalizeAccent(value, theme) {
  const source = parseHexColor(value);
  if (!source) return null;

  let accent = source;
  const minLuminance = theme === "black" ? 0.34 : 0.22;
  const maxLuminance = theme === "black" ? 0.74 : 0.68;

  for (let i = 0; i < 12 && relativeLuminance(accent) < minLuminance; i += 1) {
    accent = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.1);
  }

  for (let i = 0; i < 12 && relativeLuminance(accent) > maxLuminance; i += 1) {
    accent = mixRgb(accent, { r: 0, g: 0, b: 0 }, 0.1);
  }

  const surface = theme === "black" ? { r: 26, g: 25, b: 18 } : { r: 228, g: 223, b: 205 };
  const target =
    relativeLuminance(surface) > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let readable = accent;

  for (let i = 0; i < 12 && contrastRatio(readable, surface) < 3.8; i += 1) {
    readable = mixRgb(readable, target, 0.12);
  }

  const tint = mixRgb(
    theme === "black" ? { r: 75, g: 68, b: 50 } : { r: 184, g: 170, b: 138 },
    accent,
    theme === "black" ? 0.34 : 0.5
  );

  return {
    accent: toHex(accent),
    readable: toHex(readable),
    tint: toHex(tint),
    tokens: buildThemeTokens(theme, tint)
  };
}

const customThemeProperties = [
  "--canvas",
  "--surface",
  "--surface-soft",
  "--surface-strong",
  "--line",
  "--line-strong",
  "--panel-hover",
  "--active-fill",
  "--grid-line",
  "--grid-line-soft"
];

function buildThemeTokens(theme, tint) {
  const base =
    theme === "black"
      ? {
          canvas: { r: 6, g: 6, b: 4 },
          surface: { r: 22, g: 21, b: 15 },
          surfaceSoft: { r: 33, g: 31, b: 22 },
          surfaceStrong: { r: 44, g: 41, b: 29 },
          line: { r: 75, g: 68, b: 50 },
          lineStrong: { r: 151, g: 139, b: 105 }
        }
      : {
          canvas: { r: 241, g: 238, b: 226 },
          surface: { r: 228, g: 223, b: 205 },
          surfaceSoft: { r: 247, g: 244, b: 232 },
          surfaceStrong: { r: 215, g: 207, b: 185 },
          line: { r: 198, g: 190, b: 168 },
          lineStrong: { r: 138, g: 128, b: 109 }
        };

  const mixAmount = theme === "black" ? 0.16 : 0.14;
  return {
    "--canvas": toHex(mixRgb(base.canvas, tint, mixAmount * 0.45)),
    "--surface": toHex(mixRgb(base.surface, tint, mixAmount)),
    "--surface-soft": toHex(mixRgb(base.surfaceSoft, tint, mixAmount)),
    "--surface-strong": toHex(mixRgb(base.surfaceStrong, tint, mixAmount * 1.2)),
    "--line": toHex(mixRgb(base.line, tint, mixAmount * 1.1)),
    "--line-strong": toHex(mixRgb(base.lineStrong, tint, mixAmount * 1.4)),
    "--panel-hover": toHex(mixRgb(base.surfaceSoft, tint, mixAmount * 1.35)),
    "--active-fill": toHex(mixRgb(base.surfaceStrong, tint, mixAmount * 1.6)),
    "--grid-line": toRgbChannels(tint, theme === "black" ? 0.24 : 0.145),
    "--grid-line-soft": toRgbChannels(tint, theme === "black" ? 0.12 : 0.068)
  };
}

function setCustomThemeTokens(root, tokens) {
  Object.entries(tokens).forEach(([property, value]) => root.style.setProperty(property, value));
}

function clearCustomThemeTokens(root) {
  customThemeProperties.forEach((property) => root.style.removeProperty(property));
}

function currentTheme() {
  return document.documentElement.dataset.theme === "black" ? "black" : "light";
}

function applyAccent(value, theme = currentTheme()) {
  const root = document.documentElement;
  if (value) {
    const normalized = normalizeAccent(value, theme);
    if (!normalized) return;
    root.dataset.accent = "custom";
    root.style.setProperty("--accent", normalized.accent);
    root.style.setProperty("--accent-readable", normalized.readable);
    root.style.setProperty("--accent-tint", normalized.tint);
    setCustomThemeTokens(root, normalized.tokens);
    root.style.setProperty("accent-color", normalized.accent);
  } else {
    delete root.dataset.accent;
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-readable");
    root.style.removeProperty("--accent-tint");
    clearCustomThemeTokens(root);
    root.style.removeProperty("accent-color");
  }
}

function applyTheme(value) {
  const root = document.documentElement;
  const theme = value === "black" ? "black" : "light";
  root.dataset.theme = theme;
  applyAccent(window.localStorage.getItem(storageKey), theme);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", theme === "black" ? "#050504" : "#f1eee2");
  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === theme));
  });
}

function applyArrowStyle(value) {
  const root = document.documentElement;
  const style = arrowStyles.has(value) ? value : "tabler";
  root.dataset.arrowStyle = style;
  document.querySelectorAll("button[data-arrow-style]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.arrowStyle === style));
  });
}

function initAccentControls() {
  const saved = window.localStorage.getItem(storageKey);
  const savedTheme = window.localStorage.getItem(themeKey);
  applyTheme(savedTheme);

  document.querySelectorAll("[data-accent-input]").forEach((input) => {
    if (saved) input.value = saved;
    if (input.dataset.bound) return;
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      window.localStorage.setItem(storageKey, input.value);
      applyAccent(input.value);
    });
  });

  document.querySelectorAll("[data-accent-value]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const value = button.dataset.accentValue;
      window.localStorage.setItem(storageKey, value);
      applyAccent(value);
      document.querySelectorAll("[data-accent-input]").forEach((input) => {
        input.value = value;
      });
    });
  });

  document.querySelectorAll("[data-accent-reset]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      window.localStorage.removeItem(storageKey);
      applyAccent(null);
    });
  });

  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const theme = button.dataset.themeValue;
      window.localStorage.setItem(themeKey, theme);
      applyTheme(theme);
    });
  });
}

function initSidebar() {
  const root = document.documentElement;
  const openButton = document.querySelector("[data-sidebar-open]");
  const closeTargets = document.querySelectorAll("[data-sidebar-close]");
  const collapseButton = document.querySelector("[data-sidebar-collapse]");

  const setOpen = (open) => {
    root.classList.toggle("sidebar-open", open);
    openButton?.setAttribute("aria-expanded", String(open));
  };

  setOpen(root.classList.contains("sidebar-open"));

  openButton?.addEventListener("click", () => setOpen(true), { signal: getSignal(openButton, "sidebar") });
  closeTargets.forEach((target) => {
    target.addEventListener("click", () => setOpen(false), { signal: getSignal(target, "sidebar") });
  });

  if (collapseButton && !collapseButton.dataset.bound) {
    collapseButton.dataset.bound = "true";
    const collapsed = window.localStorage.getItem(sidebarKey) === "collapsed";
    root.classList.toggle("sidebar-collapsed", collapsed);
    collapseButton.setAttribute("aria-pressed", String(collapsed));
    collapseButton.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");

    collapseButton.addEventListener("click", (event) => {
      const next = !root.classList.contains("sidebar-collapsed");
      root.classList.toggle("sidebar-collapsed", next);
      collapseButton.setAttribute("aria-pressed", String(next));
      collapseButton.setAttribute("aria-label", next ? "Expand sidebar" : "Collapse sidebar");
      window.localStorage.setItem(sidebarKey, next ? "collapsed" : "expanded");
      if (next && event.detail > 0) collapseButton.blur();
    });
  }
}

function initDebugMenu() {
  applyArrowStyle(window.localStorage.getItem(arrowKey));

  const panel = document.querySelector("[data-debug-panel]");
  const toggle = document.querySelector("[data-debug-toggle]");
  const close = document.querySelector("[data-debug-close]");

  const setOpen = (open) => {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };

  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", () => setOpen(panel?.hidden ?? true));
  }

  if (close && !close.dataset.bound) {
    close.dataset.bound = "true";
    close.addEventListener("click", () => setOpen(false));
  }

  document.querySelectorAll("button[data-arrow-style]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const style = button.dataset.arrowStyle;
      window.localStorage.setItem(arrowKey, style);
      applyArrowStyle(style);
    });
  });
}

function preserveShellState(event) {
  const root = document.documentElement;
  const nextRoot = event.newDocument?.documentElement;
  if (!nextRoot) return;

  nextRoot.dataset.theme = currentTheme();
  nextRoot.dataset.arrowStyle = document.documentElement.dataset.arrowStyle || "tabler";
  nextRoot.dataset.pageDirection = document.documentElement.dataset.pageDirection || "down";
  nextRoot.classList.toggle("sidebar-collapsed", root.classList.contains("sidebar-collapsed"));
  nextRoot.classList.toggle("sidebar-open", root.classList.contains("sidebar-open"));
  event.newDocument
    ?.querySelector("[data-sidebar-open]")
    ?.setAttribute("aria-expanded", String(root.classList.contains("sidebar-open")));

  if (root.dataset.accent === "custom") {
    nextRoot.dataset.accent = "custom";
  } else {
    delete nextRoot.dataset.accent;
  }

  ["--accent", "--accent-readable", "--accent-tint", "accent-color", ...customThemeProperties].forEach((property) => {
    const value = root.style.getPropertyValue(property);
    if (value) {
      nextRoot.style.setProperty(property, value);
    } else {
      nextRoot.style.removeProperty(property);
    }
  });
}

function normalizePath(value) {
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname === "/rss.xml") return "/rss.xml";
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}

function navIndexForPath(path) {
  const navLinks = Array.from(document.querySelectorAll("[data-nav-index]"));
  const matches = navLinks
    .map((link) => ({
      index: Number(link.dataset.navIndex),
      path: normalizePath(link.getAttribute("href") || "")
    }))
    .filter((entry) => Number.isFinite(entry.index) && entry.path)
    .sort((a, b) => b.path.length - a.path.length);

  const exact = matches.find((entry) => entry.path === path);
  if (exact) return exact.index;
  return matches.find((entry) => entry.path !== "/" && path.startsWith(`${entry.path}/`))?.index;
}

function currentNavIndex() {
  const active = document.querySelector("[data-nav-index][aria-current='page']");
  if (active) return Number(active.dataset.navIndex);
  return navIndexForPath(normalizePath(window.location.href));
}

function setPageDirection(targetIndex) {
  const currentIndex = currentNavIndex();
  if (!Number.isFinite(targetIndex) || !Number.isFinite(currentIndex)) {
    document.documentElement.dataset.pageDirection = "down";
    return;
  }

  document.documentElement.dataset.pageDirection =
    targetIndex < currentIndex ? "up" : targetIndex > currentIndex ? "down" : "same";
}

function handleNavigationIntent(event) {
  const link = event.target.closest?.("a[href]");
  if (!link) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== "_self") return;

  const path = normalizePath(link.href);
  if (!path) return;
  const targetIndex = link.dataset.navIndex ? Number(link.dataset.navIndex) : navIndexForPath(path);
  setPageDirection(targetIndex);
}

function initPreviewFeeds() {
  document.querySelectorAll("[data-preview-feed]").forEach((feed) => {
    if (feed.dataset.bound) return;
    feed.dataset.bound = "true";

    const items = Array.from(feed.querySelectorAll("[data-preview-item]"));
    if (items.length === 0) return;

    let activeIndex = Math.max(
      0,
      items.findIndex((item) => item.classList.contains("is-active"))
    );
    let timer = null;

    const select = (index) => {
      activeIndex = (index + items.length) % items.length;
      feed.style.setProperty("--active-index", String(activeIndex));
      items.forEach((item, itemIndex) => {
        const active = itemIndex === activeIndex;
        item.classList.toggle("is-active", active);
        item.querySelector("[data-preview-trigger]")?.setAttribute("aria-expanded", String(active));
      });
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => select(activeIndex + 1), 4600);
    };

    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };

    items.forEach((item, index) => {
      item.addEventListener(
        "click",
        (event) => {
          const wasActive = index === activeIndex;
          if (!wasActive) {
            event.preventDefault();
            select(index);
            start();
            return;
          }

          const href = item.dataset.previewHref;
          if (!href) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            window.open(href, "_blank", "noopener");
            return;
          }
          window.location.assign(href);
        },
        { signal: getSignal(item, "preview") }
      );
    });

    feed.addEventListener("mouseenter", stop, { signal: getSignal(feed, "preview") });
    feed.addEventListener("mouseleave", start, { signal: getSignal(feed, "preview") });
    feed.addEventListener("focusin", stop, { signal: getSignal(feed, "preview") });
    feed.addEventListener("focusout", start, { signal: getSignal(feed, "preview") });

    select(activeIndex);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) start();
  });
}

function getSignal(element, key) {
  if (!element[`_${key}Controller`]) {
    element[`_${key}Controller`] = new AbortController();
  }
  return element[`_${key}Controller`].signal;
}

function init() {
  initAccentControls();
  initSidebar();
  initDebugMenu();
  initPreviewFeeds();
}

if (!window.__hlShellEventsBound) {
  window.__hlShellEventsBound = true;
  document.addEventListener("click", handleNavigationIntent, { capture: true });
  document.addEventListener("astro:before-swap", preserveShellState);
  document.addEventListener("astro:page-load", init);
}

init();
