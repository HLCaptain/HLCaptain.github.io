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

const gridParallaxProperties = ["--grid-parallax-x", "--grid-parallax-y"];
let lastSettledPath = null;

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

function initBackgroundParallax() {
  if (window.__hlGridParallaxBound) return;
  window.__hlGridParallaxBound = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const root = document.documentElement;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let frame = 0;

  const reset = () => {
    root.style.setProperty("--grid-parallax-x", "0px");
    root.style.setProperty("--grid-parallax-y", "0px");
  };

  const gridSize = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--grid-size")) || 28;
  const wrap = (value, size) => {
    const shifted = value % size;
    return shifted < 0 ? shifted + size : shifted;
  };
  const round = (value) => Math.round(value * 100) / 100;

  const update = () => {
    frame = 0;
    if (reduceMotion.matches) {
      reset();
      return;
    }

    const size = gridSize();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const pointerShiftX = finePointer.matches ? (pointerX - 0.5) * Math.min(8, viewportWidth * 0.006) : 0;
    const pointerShiftY = finePointer.matches ? (pointerY - 0.5) * Math.min(6, viewportHeight * 0.006) : 0;
    const scrollShiftY = window.scrollY * -0.045;

    root.style.setProperty("--grid-parallax-x", `${round(wrap(pointerShiftX, size))}px`);
    root.style.setProperty("--grid-parallax-y", `${round(wrap(scrollShiftY + pointerShiftY, size))}px`);
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!finePointer.matches) return;
      pointerX = event.clientX / Math.max(window.innerWidth, 1);
      pointerY = event.clientY / Math.max(window.innerHeight, 1);
      requestUpdate();
    },
    { passive: true }
  );
  reduceMotion.addEventListener?.("change", requestUpdate);
  finePointer.addEventListener?.("change", requestUpdate);
  requestUpdate();
}

function initSidebar() {
  const root = document.documentElement;
  const sidebar = document.querySelector("[data-sidebar]");
  const openButton = document.querySelector("[data-sidebar-open]");
  const closeTargets = document.querySelectorAll("[data-sidebar-close]");
  const collapseButton = document.querySelector("[data-sidebar-collapse]");
  const desktopOverlayQuery = window.matchMedia("(min-width: 721px)");
  const overlayOpenPadding = 2;
  const overlayExitPadding = 6;
  const overlayCloseDelay = 90;
  let overlayCloseTimer = 0;
  let lastOverlayPointer = null;

  const clearOverlayCloseTimer = () => {
    if (overlayCloseTimer) {
      window.clearTimeout(overlayCloseTimer);
      overlayCloseTimer = 0;
    }
  };

  const setOpen = (open) => {
    root.classList.toggle("sidebar-open", open);
    openButton?.setAttribute("aria-expanded", String(open));
  };

  const canUseOverlay = () => root.classList.contains("sidebar-collapsed") && desktopOverlayQuery.matches;

  const setOverlayOpen = (open) => {
    if (open) clearOverlayCloseTimer();
    root.classList.toggle("sidebar-overlay-open", Boolean(open && canUseOverlay()));
  };

  const capturePointer = (event) => {
    lastOverlayPointer = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    return lastOverlayPointer;
  };

  const numberToken = (name, fallback) => {
    const value = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const overlayRects = () => {
    const panel = sidebar?.querySelector(".sidebar-panel");
    const sidebarRect = sidebar?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    if (!sidebarRect && !panelRect) return null;

    const outerPadding = numberToken("--sidebar-outer-padding", 14);
    const collapsedWidth = numberToken("--sidebar-collapsed-width", sidebarRect?.width ?? 84);
    const expandedWidth = numberToken("--sidebar-width", 292);
    const railLeft = sidebarRect?.left ?? (panelRect ? panelRect.left - outerPadding : 0);
    const railTop = sidebarRect?.top ?? (panelRect ? panelRect.top - outerPadding : 0);
    const railBottom = sidebarRect?.bottom ?? (panelRect ? panelRect.bottom + outerPadding : window.innerHeight);
    const panelLeft = panelRect?.left ?? railLeft + outerPadding;
    const panelTop = panelRect?.top ?? railTop + outerPadding;
    const panelBottom = panelRect?.bottom ?? railBottom - outerPadding;

    return {
      rail: {
        left: railLeft,
        right: railLeft + collapsedWidth,
        top: railTop,
        bottom: railBottom
      },
      overlay: {
        left: panelLeft,
        right: panelLeft + Math.max(0, expandedWidth - outerPadding * 2),
        top: panelTop,
        bottom: panelBottom
      }
    };
  };

  const rectContainsPointer = (rect, pointer, padding = 0) =>
    pointer.clientX >= rect.left - padding &&
    pointer.clientX <= rect.right + padding &&
    pointer.clientY >= rect.top - padding &&
    pointer.clientY <= rect.bottom + padding;

  const pointerIsInsideOpenRail = (pointer) => {
    const rects = overlayRects();
    return Boolean(rects && rectContainsPointer(rects.rail, pointer, overlayOpenPadding));
  };

  const pointerIsInsideOpenOverlay = (pointer) => {
    const rects = overlayRects();
    return Boolean(
      rects &&
        (rectContainsPointer(rects.rail, pointer, overlayExitPadding) ||
          rectContainsPointer(rects.overlay, pointer, overlayExitPadding))
    );
  };

  const closeOverlayIfPointerOutside = (event, immediate = false) => {
    const pointer = capturePointer(event);
    if (!root.classList.contains("sidebar-overlay-open")) return;
    if (pointerIsInsideOpenOverlay(pointer)) {
      clearOverlayCloseTimer();
      return;
    }

    if (immediate) {
      clearOverlayCloseTimer();
      setOverlayOpen(false);
      return;
    }

    if (overlayCloseTimer) return;
    overlayCloseTimer = window.setTimeout(() => {
      overlayCloseTimer = 0;
      if (
        root.classList.contains("sidebar-overlay-open") &&
        lastOverlayPointer &&
        !pointerIsInsideOpenOverlay(lastOverlayPointer)
      ) {
        setOverlayOpen(false);
      }
    }, overlayCloseDelay);
  };

  const syncOverlayFromPointer = (event) => {
    const pointer = capturePointer(event);
    if (!canUseOverlay()) {
      setOverlayOpen(false);
      return;
    }

    if (!root.classList.contains("sidebar-overlay-open") && pointerIsInsideOpenRail(pointer)) {
      setOverlayOpen(true);
      return;
    }
    closeOverlayIfPointerOutside(event);
  };

  setOpen(root.classList.contains("sidebar-open"));
  setOverlayOpen(root.classList.contains("sidebar-overlay-open"));

  openButton?.addEventListener("click", () => setOpen(true), { signal: getSignal(openButton, "sidebar") });
  closeTargets.forEach((target) => {
    target.addEventListener("click", () => setOpen(false), { signal: getSignal(target, "sidebar") });
  });
  document.addEventListener("pointermove", syncOverlayFromPointer, { signal: getSignal(sidebar ?? root, "sidebar") });
  document.addEventListener("pointerdown", (event) => closeOverlayIfPointerOutside(event, true), { signal: getSignal(sidebar ?? root, "sidebar") });
  document.addEventListener("pointercancel", () => {
    clearOverlayCloseTimer();
    setOverlayOpen(false);
  }, { signal: getSignal(sidebar ?? root, "sidebar") });
  desktopOverlayQuery.addEventListener?.("change", () => {
    if (!canUseOverlay()) setOverlayOpen(false);
  });

  if (collapseButton && !collapseButton.dataset.bound) {
    collapseButton.dataset.bound = "true";
    const collapsed = window.localStorage.getItem(sidebarKey) === "collapsed";
    root.classList.toggle("sidebar-collapsed", collapsed);
    collapseButton.setAttribute("aria-pressed", String(collapsed));
    collapseButton.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");

    collapseButton.addEventListener("click", (event) => {
      if (event.detail > 0) capturePointer(event);
      const next = !root.classList.contains("sidebar-collapsed");
      root.classList.toggle("sidebar-collapsed", next);
      collapseButton.setAttribute("aria-pressed", String(next));
      collapseButton.setAttribute("aria-label", next ? "Expand sidebar" : "Collapse sidebar");
      window.localStorage.setItem(sidebarKey, next ? "collapsed" : "expanded");
      setOverlayOpen(next && Boolean(lastOverlayPointer && pointerIsInsideOpenOverlay(lastOverlayPointer)));
      if (next && event.detail > 0) collapseButton.blur();
    });
  }
}

function initNavGroups() {
  document.querySelectorAll("[data-nav-group]").forEach((group) => {
    if (group.dataset.bound) return;
    group.dataset.bound = "true";

    const summary = group.querySelector("summary");
    const items = group.querySelector(".nav-items");
    if (!summary || !items) return;

    summary.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        group._navGroupCancel?.();

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          group.open = !group.open;
          return;
        }

        const wasOpen = group.open;
        let complete = false;
        let timeout = null;
        let frame = 0;
        const initialTransition = items.style.transition;

        const clearFrame = () => {
          if (!frame) return;
          window.cancelAnimationFrame(frame);
          frame = 0;
        };

        const clearItemStyles = (quietHeightReset = false) => {
          if (quietHeightReset) items.style.transition = "none";
          items.style.display = "";
          items.style.height = "";
          items.style.overflow = "";
          if (quietHeightReset) {
            items.getBoundingClientRect();
            items.style.transition = initialTransition;
          }
        };

        const finish = () => {
          if (complete) return;
          complete = true;
          clearFrame();
          window.clearTimeout(timeout);
          items.removeEventListener("transitionend", onTransitionEnd);
          if (wasOpen) group.open = false;
          group.classList.remove("is-expanding", "is-collapsing");
          clearItemStyles(!wasOpen);
          if (group._navGroupCancel === cancel) group._navGroupCancel = null;
        };

        const cancel = () => {
          if (complete) return;
          complete = true;
          clearFrame();
          window.clearTimeout(timeout);
          items.removeEventListener("transitionend", onTransitionEnd);
          group.classList.remove("is-expanding", "is-collapsing");
          clearItemStyles();
          items.style.transition = initialTransition;
          if (group._navGroupCancel === cancel) group._navGroupCancel = null;
        };

        const onTransitionEnd = (transitionEvent) => {
          if (transitionEvent.propertyName === "height") finish();
        };

        group._navGroupCancel = cancel;
        group.classList.remove("is-expanding", "is-collapsing");
        items.style.display = "grid";
        items.style.overflow = "hidden";

        if (wasOpen) {
          items.style.height = `${items.getBoundingClientRect().height}px`;
          items.getBoundingClientRect();
          group.classList.add("is-collapsing");
          frame = requestAnimationFrame(() => {
            items.style.height = "0px";
          });
        } else {
          items.style.transition = "none";
          group.open = true;
          group.classList.add("is-expanding");
          items.style.height = "";
          const targetHeight = items.getBoundingClientRect().height;
          items.style.height = "0px";
          items.getBoundingClientRect();
          items.style.transition = initialTransition;
          frame = requestAnimationFrame(() => {
            items.style.height = `${targetHeight}px`;
          });
        }

        items.addEventListener("transitionend", onTransitionEnd);
        timeout = window.setTimeout(finish, 420);
      },
      { signal: getSignal(group, "navGroup") }
    );
  });
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
  const keepOverlay =
    root.classList.contains("sidebar-overlay-open") || root.dataset.keepSidebarOverlay === "true";
  nextRoot.classList.toggle("sidebar-collapsed", root.classList.contains("sidebar-collapsed"));
  nextRoot.classList.toggle("sidebar-open", root.classList.contains("sidebar-open"));
  nextRoot.classList.toggle("sidebar-overlay-open", keepOverlay);
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

  gridParallaxProperties.forEach((property) => {
    const value = root.style.getPropertyValue(property);
    if (value) nextRoot.style.setProperty(property, value);
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

function updateSettledPath() {
  const path = normalizePath(window.location.href);
  if (path) lastSettledPath = path;
}

function navEntries(scope = document) {
  return Array.from(scope.querySelectorAll("[data-nav-index]"))
    .map((link) => ({
      link,
      index: Number(link.dataset.navIndex),
      path: normalizePath(link.getAttribute("href") || "")
    }))
    .filter((entry) => Number.isFinite(entry.index) && entry.path)
    .sort((a, b) => b.path.length - a.path.length);
}

function navMatchesForPath(path, scope = document) {
  const matches = navEntries(scope);
  const exact = matches.filter((entry) => entry.path === path);
  if (exact.length > 0) return exact;
  return matches.filter((entry) => entry.path !== "/" && path.startsWith(`${entry.path}/`));
}

function navIndexForPath(path) {
  return navMatchesForPath(path)[0]?.index;
}

function navLinkForPath(path) {
  return navMatchesForPath(path)[0]?.link;
}

function activeNavPath() {
  const active = document.querySelector("[data-nav-index][aria-current='page']");
  return active ? normalizePath(active.getAttribute("href") || "") : null;
}

function currentNavIndex() {
  const active = document.querySelector("[data-nav-index][aria-current='page']");
  if (active) return Number(active.dataset.navIndex);
  return navIndexForPath(normalizePath(window.location.href));
}

function pathDepth(path) {
  return path.split("/").filter(Boolean).length;
}

function pageDirectionBetweenPaths(fromPath, toPath) {
  const fromIndex = navIndexForPath(fromPath);
  const toIndex = navIndexForPath(toPath);
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return "down";
  if (toIndex < fromIndex) return "up";
  if (toIndex > fromIndex) return "down";

  const fromDepth = pathDepth(fromPath);
  const toDepth = pathDepth(toPath);
  return toPath === fromPath ? "same" : toDepth < fromDepth ? "up" : "down";
}

function setPageDirectionBetweenPaths(fromPath, toPath) {
  document.documentElement.dataset.pageDirection = pageDirectionBetweenPaths(fromPath, toPath);
}

function setPageDirection(targetIndex, targetPath = normalizePath(window.location.href)) {
  const currentIndex = currentNavIndex();
  const currentPath = normalizePath(window.location.href);
  if (!Number.isFinite(targetIndex) || !Number.isFinite(currentIndex)) {
    document.documentElement.dataset.pageDirection = "down";
    return;
  }

  if (targetIndex < currentIndex) {
    document.documentElement.dataset.pageDirection = "up";
    return;
  }

  if (targetIndex > currentIndex) {
    document.documentElement.dataset.pageDirection = "down";
    return;
  }

  const targetDepth = pathDepth(targetPath);
  const currentDepth = pathDepth(currentPath);
  document.documentElement.dataset.pageDirection =
    targetPath === currentPath ? "same" : targetDepth < currentDepth ? "up" : "down";
}

const navSelectionTimers = new WeakMap();

function restartNavSelectionAnimation(link, className, duration = 320) {
  const timers = navSelectionTimers.get(link) || {};
  window.clearTimeout(timers[className]);
  link.classList.remove(className);
  link.getBoundingClientRect();
  link.classList.add(className);
  timers[className] = window.setTimeout(() => {
    link.classList.remove(className);
    delete timers[className];
  }, duration);
  navSelectionTimers.set(link, timers);
}

function setSidebarActivePath(path, { animate = true } = {}) {
  const target = navLinkForPath(path);
  if (!target) return false;

  const activeLinks = Array.from(document.querySelectorAll("[data-nav-index].is-active, [data-nav-index][aria-current='page']"));
  const alreadyActive =
    activeLinks.length === 1 && activeLinks[0] === target && target.classList.contains("is-active");

  activeLinks.forEach((link) => {
    if (link === target) return;
    link.removeAttribute("aria-current");
    link.classList.remove("is-active", "is-selection-entering");
    if (animate) {
      restartNavSelectionAnimation(link, "is-selection-leaving", 260);
    } else {
      link.classList.remove("is-selection-leaving");
    }
  });

  target.setAttribute("aria-current", "page");
  target.classList.remove("is-selection-leaving");
  target.classList.add("is-active");
  if (animate && !alreadyActive) {
    restartNavSelectionAnimation(target, "is-selection-entering", 500);
  }
  return true;
}

function sidebarNavLinkAtPoint(x, y) {
  return Array.from(document.querySelectorAll("[data-nav-index]")).find((link) => {
    const rect = link.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(link);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
}

let interceptedSidebarNavigationClick = null;

function shouldConsumeInterceptedClick(event) {
  if (!interceptedSidebarNavigationClick) return false;
  const elapsed = performance.now() - interceptedSidebarNavigationClick.time;
  const closeToPointer =
    Math.abs(event.clientX - interceptedSidebarNavigationClick.x) <= 3 &&
    Math.abs(event.clientY - interceptedSidebarNavigationClick.y) <= 3;
  if (elapsed > 700 || !closeToPointer) {
    interceptedSidebarNavigationClick = null;
    return false;
  }
  interceptedSidebarNavigationClick = null;
  event.preventDefault();
  event.stopImmediatePropagation?.();
  return true;
}

function handleTransitionSidebarPointer(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !document.documentElement.hasAttribute("data-astro-transition")
  ) {
    return;
  }

  const link = sidebarNavLinkAtPoint(event.clientX, event.clientY);
  if (!link) return;

  const path = normalizePath(link.href);
  if (!path) return;

  event.preventDefault();
  event.stopPropagation();
  interceptedSidebarNavigationClick = {
    x: event.clientX,
    y: event.clientY,
    time: performance.now()
  };

  const targetIndex = Number(link.dataset.navIndex);
  setPageDirection(targetIndex, path);
  setSidebarActivePath(path, { animate: true });
  if (document.documentElement.classList.contains("sidebar-overlay-open")) {
    document.documentElement.dataset.keepSidebarOverlay = "true";
  }
  navigateWithTransition(link.href, link, { updateActive: false, updateDirection: false });
}

function handleTransitionPreparation(event) {
  const path = normalizePath(event.to?.href);
  const fromPath =
    lastSettledPath && lastSettledPath !== path
      ? lastSettledPath
      : activeNavPath() || normalizePath(event.from?.href);
  if (fromPath && path) setPageDirectionBetweenPaths(fromPath, path);
  if (path) setSidebarActivePath(path, { animate: true });
}

function handleNavigationIntent(event) {
  if (shouldConsumeInterceptedClick(event)) return;

  const link = event.target.closest?.("a[href]");
  if (!link) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== "_self") return;

  const path = normalizePath(link.href);
  if (!path) return;
  const targetIndex = link.dataset.navIndex ? Number(link.dataset.navIndex) : navIndexForPath(path);
  setPageDirection(targetIndex, path);
  if (Number.isFinite(targetIndex)) setSidebarActivePath(path, { animate: true });
  if (document.documentElement.classList.contains("sidebar-overlay-open")) {
    document.documentElement.dataset.keepSidebarOverlay = "true";
  }

  if (link.hasAttribute("data-nav-index")) {
    event.preventDefault();
    navigateWithTransition(link.href, link, { updateActive: false, updateDirection: false });
  }
}

function navigateWithTransition(href, sourceElement, options = {}) {
  const path = normalizePath(href);
  const updateActive = options.updateActive !== false;
  const updateDirection = options.updateDirection !== false;

  if (path) {
    const targetIndex = navIndexForPath(path);
    if (updateDirection) setPageDirection(targetIndex, path);
    if (updateActive && Number.isFinite(targetIndex)) setSidebarActivePath(path, { animate: true });
  }

  if (typeof window.__hlNavigate === "function") {
    window.__hlNavigate(href, { sourceElement });
    return;
  }

  window.location.assign(href);
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
            if (event.detail > 0 && document.activeElement instanceof HTMLElement) document.activeElement.blur();
            return;
          }

          const href = item.dataset.previewHref;
          if (!href) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            window.open(href, "_blank", "noopener");
            return;
          }
          navigateWithTransition(href, item);
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
  initBackgroundParallax();
  initSidebar();
  initNavGroups();
  initDebugMenu();
  initPreviewFeeds();
  delete document.documentElement.dataset.keepSidebarOverlay;
}

if (!window.__hlShellEventsBound) {
  window.__hlShellEventsBound = true;
  updateSettledPath();
  document.addEventListener("pointerdown", handleTransitionSidebarPointer, { capture: true });
  document.addEventListener("click", handleNavigationIntent, { capture: true });
  document.addEventListener("astro:before-preparation", handleTransitionPreparation);
  document.addEventListener("astro:before-swap", preserveShellState);
  document.addEventListener("astro:after-swap", updateSettledPath);
  document.addEventListener("astro:page-load", init);
}

init();
