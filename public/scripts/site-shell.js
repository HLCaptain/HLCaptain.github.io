(() => {
const storageKey = "hlcaptain-accent";
const themeKey = "hlcaptain-theme";
const sidebarKey = "hlcaptain-sidebar";
const navGroupsKey = "hlcaptain-nav-groups";
const arrowKey = "hlcaptain-arrow-style";
const gridPatternKey = "hlcaptain-grid-pattern";
const signalLayoutKey = "hlcaptain-signal-layout";
const signalRatioKey = "hlcaptain-signal-ratio";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeModes = new Map([
  ["light", "Light"],
  ["black", "Dark"],
  ["system", "System"]
]);
const arrowStyles = new Set([
  "tabler",
  "lucide",
  "phosphor",
  "remix",
  "fluent",
  "pixelart"
]);
const gridPatterns = new Map([
  ["grid", "Grid"],
  ["dots", "Dots"],
  ["plus", "Plus signs"],
  ["crosshatch", "Crosshatch"],
  ["diagonal", "Diagonal"],
  ["circuit", "Circuit"],
  ["scanlines", "Scanlines"]
]);
const signalLayouts = new Map([
  ["split", "Balanced split"],
  ["stack", "Editorial stack"],
  ["compact", "Compact dock"]
]);
const signalRatios = new Map([
  ["square", "Square 1:1"],
  ["landscape", "Landscape 4:3"],
  ["wide", "Wide 16:9"],
  ["portrait", "Portrait 3:4"]
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

const gridParallaxProperties = ["--grid-parallax-y"];
const pageTransitionProperties = ["--page-old-scroll-offset-y"];
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
    "--grid-line": toRgbChannels(tint, theme === "black" ? 0.27 : 0.18),
    "--grid-line-soft": toRgbChannels(tint, theme === "black" ? 0.14 : 0.09)
  };
}

function setCustomThemeTokens(root, tokens) {
  Object.entries(tokens).forEach(([property, value]) => root.style.setProperty(property, value));
}

function clearCustomThemeTokens(root) {
  customThemeProperties.forEach((property) => root.style.removeProperty(property));
}

function normalizeThemeMode(value) {
  return themeModes.has(value) ? value : "light";
}

function resolveThemeMode(value) {
  const mode = normalizeThemeMode(value);
  if (mode === "system") return systemThemeQuery.matches ? "black" : "light";
  return mode;
}

function currentTheme() {
  return document.documentElement.dataset.theme === "black" ? "black" : "light";
}

function currentThemeMode() {
  return normalizeThemeMode(document.documentElement.dataset.themeMode || window.localStorage.getItem(themeKey));
}

function nextThemeMode(value = currentThemeMode()) {
  const mode = normalizeThemeMode(value);
  if (mode === "light") return "black";
  if (mode === "black") return "system";
  return "light";
}

function syncThemeControls(mode = currentThemeMode(), theme = currentTheme()) {
  const normalizedMode = normalizeThemeMode(mode);
  const nextMode = nextThemeMode(normalizedMode);
  const isDark = theme === "black";
  const nextLabel = themeModes.get(nextMode)?.toLowerCase() || "light";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", normalizedMode === "system" ? "mixed" : String(isDark));
    button.setAttribute("aria-label", `Switch to ${nextLabel} theme`);
    button.setAttribute("title", `Switch to ${nextLabel} theme`);
    button.dataset.themeMode = normalizedMode;
    button.dataset.resolvedTheme = theme;
    button.querySelector("[data-theme-label]")?.replaceChildren(themeModes.get(normalizedMode) || "Light");
  });

  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeValue === normalizedMode));
  });
}

function syncAccentControls(value = window.localStorage.getItem(storageKey)) {
  const root = document.documentElement;

  document.querySelectorAll("[data-accent-input]").forEach((input) => {
    if (value) {
      input.value = value;
    } else {
      input.value = "#b9843b";
    }
  });

  document.querySelectorAll("[data-accent-reset]").forEach((button) => {
    button.setAttribute("aria-pressed", String(!value));
  });

  if (value) {
    const normalized = normalizeAccent(value, currentTheme());
    if (normalized) root.style.setProperty("--accent-preview", normalized.accent);
  } else {
    root.style.removeProperty("--accent-preview");
  }
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
  syncAccentControls(value);
}

function applyTheme(value) {
  const root = document.documentElement;
  const mode = normalizeThemeMode(value);
  const theme = resolveThemeMode(mode);
  root.dataset.themeMode = mode;
  root.dataset.theme = theme;
  applyAccent(window.localStorage.getItem(storageKey), theme);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", theme === "black" ? "#050504" : "#f1eee2");
  syncThemeControls(mode, theme);
}

function applyArrowStyle(value) {
  const root = document.documentElement;
  const style = arrowStyles.has(value) ? value : "tabler";
  root.dataset.arrowStyle = style;
  document.querySelectorAll("button[data-arrow-style]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.arrowStyle === style));
  });
}

function applyGridPattern(value) {
  const root = document.documentElement;
  const pattern = gridPatterns.has(value) ? value : "plus";
  root.dataset.gridPattern = pattern;
  document.querySelectorAll("button[data-grid-pattern]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.gridPattern === pattern));
  });
  document.querySelectorAll("[data-grid-pattern-current]").forEach((target) => {
    target.replaceChildren(gridPatterns.get(pattern));
  });
}

function applySignalLayout(value) {
  const root = document.documentElement;
  const layout = signalLayouts.has(value) ? value : "compact";
  root.dataset.signalLayout = layout;
  document.querySelectorAll("button[data-signal-layout]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.signalLayout === layout));
  });
  document.querySelectorAll("[data-signal-layout-current]").forEach((target) => {
    target.replaceChildren(signalLayouts.get(layout));
  });
}

function applySignalRatio(value) {
  const root = document.documentElement;
  const ratio = signalRatios.has(value) ? value : "square";
  root.dataset.signalRatio = ratio;

  document.querySelectorAll("button[data-signal-ratio]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.signalRatio === ratio));
  });

  document.querySelectorAll("[data-signal-ratio-current]").forEach((target) => {
    target.replaceChildren(signalRatios.get(ratio));
  });

  document.querySelectorAll("img[data-signal-image]").forEach((image) => {
    const source = image.getAttribute(`data-signal-src-${ratio}`) || image.getAttribute("data-signal-src-square");
    const label = image.getAttribute(`data-signal-label-${ratio}`) || "";
    if (source && image.getAttribute("src") !== source) image.setAttribute("src", source);

    const media = image.closest(".signal__media");
    if (media) {
      if (label) {
        media.setAttribute("data-signal-aspect", label);
      } else {
        media.removeAttribute("data-signal-aspect");
      }
    }
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

  document.querySelectorAll("[data-accent-reset]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      window.localStorage.removeItem(storageKey);
      applyAccent(null);
    });
  });

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const mode = nextThemeMode();
      window.localStorage.setItem(themeKey, mode);
      applyTheme(mode);
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

  if (!window.__hlSystemThemeBound) {
    window.__hlSystemThemeBound = true;
    systemThemeQuery.addEventListener?.("change", () => {
      if (currentThemeMode() === "system") applyTheme("system");
    });
  }

  syncAccentControls(saved);
  syncThemeControls(currentThemeMode(), currentTheme());
}

function initBackgroundParallax() {
  if (window.__hlGridParallaxBound) return;
  window.__hlGridParallaxBound = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  let frame = 0;

  const reset = () => {
    root.style.setProperty("--grid-parallax-y", "0px");
  };

  const gridSize = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--grid-size")) || 28;
  const wrap = (value, size) => {
    const shifted = value % size;
    return shifted < 0 ? shifted + size : shifted;
  };
  const snapToDevicePixel = (value) => {
    const scale = Math.max(window.devicePixelRatio || 1, 1);
    return Math.round(value * scale) / scale;
  };

  const update = () => {
    frame = 0;
    if (reduceMotion.matches) {
      reset();
      return;
    }

    const size = gridSize();
    const scrollShiftY = wrap(snapToDevicePixel(window.scrollY * -0.065), size);

    root.style.setProperty("--grid-parallax-y", `${scrollShiftY}px`);
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  reduceMotion.addEventListener?.("change", requestUpdate);
  requestUpdate();
}

function initSidebar() {
  window.__hlSidebarController?.abort();
  window.__hlSidebarController = new AbortController();
  const sidebarSignal = window.__hlSidebarController.signal;
  const root = document.documentElement;
  const sidebar = document.querySelector("[data-sidebar]");
  const openButton = document.querySelector("[data-sidebar-open]");
  const openButtonLabel = openButton?.querySelector("[data-sidebar-toggle-label]");
  const closeTargets = document.querySelectorAll("[data-sidebar-close]");
  const collapseButton = document.querySelector("[data-sidebar-collapse]");
  const desktopOverlayQuery = window.matchMedia("(min-width: 721px)");
  let collapsedPreference = window.localStorage.getItem(sidebarKey) === "collapsed";
  const overlayCloseDelay = 80;
  const overlayClosePadding = 2;
  let overlayCloseTimer = 0;
  let lastOverlayPointer = null;

  const clearOverlayCloseTimer = () => {
    if (overlayCloseTimer) {
      window.clearTimeout(overlayCloseTimer);
      overlayCloseTimer = 0;
    }
  };

  const setOpen = (open) => {
    const label = open ? "Close navigation" : "Open navigation";
    root.classList.toggle("sidebar-open", open);
    openButton?.setAttribute("aria-expanded", String(open));
    openButton?.setAttribute("aria-label", label);
    if (openButtonLabel) openButtonLabel.textContent = label;
  };

  const syncCollapsedPresentation = () => {
    const collapsed = collapsedPreference && desktopOverlayQuery.matches;
    root.classList.toggle("sidebar-collapsed", collapsed);
    collapseButton?.setAttribute("aria-pressed", String(collapsed));
    collapseButton?.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  };

  const canUseOverlay = () => root.classList.contains("sidebar-collapsed") && desktopOverlayQuery.matches;

  const setOverlayOpen = (open, { clearPending = open } = {}) => {
    if (open) {
      clearOverlayCloseTimer();
      if (clearPending) delete root.dataset.sidebarOverlayClosePending;
    }
    root.classList.toggle("sidebar-overlay-open", Boolean(open && canUseOverlay()));
  };

  const shouldDeferOverlayClose = () =>
    root.dataset.sidebarOverlayTransition === "true" && root.hasAttribute("data-astro-transition");

  const requestOverlayClose = () => {
    if (shouldDeferOverlayClose()) {
      root.dataset.sidebarOverlayClosePending = "true";
      return;
    }

    setOverlayOpen(false);
  };

  const openOverlayFromSidebar = (event) => {
    const pointer = capturePointer(event);
    if (canUseOverlay() && pointerIsInsideCollapsedRail(pointer)) setOverlayOpen(true);
  };

  const numberToken = (name, fallback) => {
    const value = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const capturePointer = (event) => {
    lastOverlayPointer = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    return lastOverlayPointer;
  };

  const pointerIsInsideOverlaySurface = (pointer) => {
    const panel = sidebar?.querySelector(".sidebar-panel");
    const panelRect = panel?.getBoundingClientRect();
    if (pointerIsInsideCollapsedRail(pointer)) return true;
    if (!panelRect) return false;

    const outerPadding = numberToken("--sidebar-outer-padding", 14);
    const panelWidth = Math.max(0, numberToken("--sidebar-width", 292) - outerPadding * 2);
    return (
      pointer.clientX >= panelRect.left - overlayClosePadding &&
      pointer.clientX <= panelRect.left + panelWidth + overlayClosePadding &&
      pointer.clientY >= panelRect.top - overlayClosePadding &&
      pointer.clientY <= panelRect.bottom + overlayClosePadding
    );
  };

  const pointerIsInsideCollapsedRail = (pointer) => {
    const sidebarRect = sidebar?.getBoundingClientRect();
    if (!sidebarRect) return false;
    const collapsedWidth = numberToken("--sidebar-collapsed-width", 84);
    const railLeft = sidebarRect.left;
    return (
      pointer.clientX >= railLeft - overlayClosePadding &&
      pointer.clientX <= railLeft + collapsedWidth + overlayClosePadding &&
      pointer.clientY >= sidebarRect.top - overlayClosePadding &&
      pointer.clientY <= sidebarRect.bottom + overlayClosePadding
    );
  };

  const closeOverlayAfterLeave = (event) => {
    if (!root.classList.contains("sidebar-overlay-open")) return;
    const pointer = capturePointer(event);
    if (pointerIsInsideOverlaySurface(pointer) || sidebar?.contains(document.activeElement)) {
      clearOverlayCloseTimer();
      delete root.dataset.sidebarOverlayClosePending;
      return;
    }

    if (overlayCloseTimer) return;
    overlayCloseTimer = window.setTimeout(() => {
      overlayCloseTimer = 0;
      if (
        root.classList.contains("sidebar-overlay-open") &&
        lastOverlayPointer &&
        !pointerIsInsideOverlaySurface(lastOverlayPointer) &&
        !sidebar?.contains(document.activeElement)
      ) {
        requestOverlayClose();
      }
    }, overlayCloseDelay);
  };

  const closeOverlayFromOutsidePointer = (event) => {
    if (!root.classList.contains("sidebar-overlay-open")) return;
    if (sidebar?.contains(event.target)) {
      clearOverlayCloseTimer();
      capturePointer(event);
      delete root.dataset.sidebarOverlayClosePending;
      return;
    }
    const pointer = capturePointer(event);
    if (pointerIsInsideOverlaySurface(pointer)) return;
    clearOverlayCloseTimer();
    requestOverlayClose();
  };

  const closeOverlayIfUnavailable = () => {
    if (!canUseOverlay()) setOverlayOpen(false);
  };

  const syncOverlayAfterCollapsedChange = (open) => {
    if (!open) {
      setOverlayOpen(false);
      return;
    }

    if (sidebar?.matches(":hover") || sidebar?.contains(document.activeElement)) {
      setOverlayOpen(true);
    }
  };

  const syncSidebarViewport = () => {
    clearOverlayCloseTimer();
    closeOverlayIfUnavailable();
    syncCollapsedPresentation();
    if (desktopOverlayQuery.matches) setOpen(false);
  };

  syncCollapsedPresentation();
  setOpen(!desktopOverlayQuery.matches && root.classList.contains("sidebar-open"));
  setOverlayOpen(root.classList.contains("sidebar-overlay-open"), { clearPending: false });

  openButton?.addEventListener("click", () => setOpen(!root.classList.contains("sidebar-open")), {
    signal: sidebarSignal
  });
  closeTargets.forEach((target) => {
    target.addEventListener("click", () => setOpen(false), { signal: sidebarSignal });
  });
  sidebar?.addEventListener("pointerenter", openOverlayFromSidebar, { signal: sidebarSignal });
  sidebar?.addEventListener("pointerleave", closeOverlayAfterLeave, { signal: sidebarSignal });
  sidebar?.addEventListener("focusin", () => {
    if (canUseOverlay()) setOverlayOpen(true);
  }, { signal: sidebarSignal });
  sidebar?.addEventListener("focusout", (event) => {
    if (!sidebar.contains(event.relatedTarget) && !sidebar.matches(":hover")) requestOverlayClose();
  }, { signal: sidebarSignal });
  document.addEventListener("pointermove", closeOverlayAfterLeave, { signal: sidebarSignal });
  document.addEventListener("pointerdown", closeOverlayFromOutsidePointer, { signal: sidebarSignal });
  document.addEventListener("pointercancel", () => {
    clearOverlayCloseTimer();
    setOverlayOpen(false);
  }, { signal: sidebarSignal });
  desktopOverlayQuery.addEventListener?.("change", syncSidebarViewport, { signal: sidebarSignal });

  if (collapseButton) {
    collapseButton.addEventListener("click", (event) => {
      collapsedPreference = !collapsedPreference;
      window.localStorage.setItem(sidebarKey, collapsedPreference ? "collapsed" : "expanded");
      syncCollapsedPresentation();
      syncOverlayAfterCollapsedChange(root.classList.contains("sidebar-collapsed"));
      if (collapsedPreference && event.detail > 0) collapseButton.blur();
    }, { signal: sidebarSignal });
  }
}

function navGroupElements(scope = document) {
  return Array.from(scope.querySelectorAll("[data-nav-group]"));
}

function navGroupKey(group, index) {
  return (
    group.getAttribute("data-nav-group") ||
    group.querySelector(".nav-group__label")?.textContent?.trim() ||
    String(index)
  );
}

function navGroupIsVisuallyOpen(group) {
  return group.classList.contains("is-expanding") || (group.open && !group.classList.contains("is-collapsing"));
}

function readNavGroupState(scope = document, override = null) {
  return navGroupElements(scope).reduce((state, group, index) => {
    state[navGroupKey(group, index)] = override?.group === group ? Boolean(override.open) : navGroupIsVisuallyOpen(group);
    return state;
  }, {});
}

function storedNavGroupState() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(navGroupsKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeNavGroupState(state) {
  try {
    window.sessionStorage.setItem(navGroupsKey, JSON.stringify(state));
  } catch {}
}

function clearNavGroupAnimationState(group) {
  const items = group.querySelector(".nav-items");
  group.classList.remove("is-expanding", "is-collapsing");
  if (!items) return;
  items.style.display = "";
  items.style.height = "";
  items.style.overflow = "";
  items.style.transition = "";
}

function openNavGroupForLink(link) {
  const group = link?.closest("[data-nav-group]");
  if (!group || group.open) return false;
  group.open = true;
  clearNavGroupAnimationState(group);
  return true;
}

function applyNavGroupState(scope, state) {
  if (!state) return;
  navGroupElements(scope).forEach((group, index) => {
    const key = navGroupKey(group, index);
    if (!(key in state)) return;
    group.open = Boolean(state[key]);
    clearNavGroupAnimationState(group);
  });
}

function applyStoredNavGroupState(scope) {
  applyNavGroupState(scope, storedNavGroupState());
  const activeLink = scope.querySelector("[data-nav-index][aria-current='page']");
  if (openNavGroupForLink(activeLink) && scope === document) saveNavGroupState();
}

function saveNavGroupState(override = null) {
  const state = readNavGroupState(document, override);
  writeNavGroupState(state);
  return state;
}

function initNavGroups() {
  applyStoredNavGroupState(document);

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

        const wasOpen = navGroupIsVisuallyOpen(group);
        group._navGroupCancel?.();

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          saveNavGroupState({ group, open: !wasOpen });
          group.open = !wasOpen;
          return;
        }

        saveNavGroupState({ group, open: !wasOpen });
        let complete = false;
        let timeout = null;
        let frame = 0;
        const initialTransition = items.style.transition;
        let expectedTransitionProperties = new Set(["height"]);
        const completedTransitionProperties = new Set();

        const px = (value) => `${value}px`;
        const number = (value) => Number.parseFloat(value) || 0;
        const itemBlockPadding = () => {
          const style = getComputedStyle(items);
          return {
            top: number(style.paddingTop),
            bottom: number(style.paddingBottom)
          };
        };

        const setItemBlockPadding = (top, bottom) => {
          items.style.paddingTop = px(top);
          items.style.paddingBottom = px(bottom);
        };

        const transitionPropertiesFor = ({ top, bottom }) => {
          const properties = new Set(["height"]);
          if (top > 0.25) properties.add("padding-top");
          if (bottom > 0.25) properties.add("padding-bottom");
          return properties;
        };

        const clearFrame = () => {
          if (!frame) return;
          window.cancelAnimationFrame(frame);
          frame = 0;
        };

        const clearItemStyles = (quietHeightReset = false) => {
          if (quietHeightReset) items.style.transition = "none";
          items.style.display = "";
          items.style.height = "";
          items.style.paddingTop = "";
          items.style.paddingBottom = "";
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
          saveNavGroupState();
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
          if (transitionEvent.target !== items || !expectedTransitionProperties.has(transitionEvent.propertyName)) return;
          completedTransitionProperties.add(transitionEvent.propertyName);
          if (
            Array.from(expectedTransitionProperties).every((property) =>
              completedTransitionProperties.has(property)
            )
          ) {
            finish();
          }
        };

        group._navGroupCancel = cancel;
        group.classList.remove("is-expanding", "is-collapsing");
        items.style.display = "grid";
        items.style.overflow = "hidden";

        if (wasOpen) {
          const startPadding = itemBlockPadding();
          expectedTransitionProperties = transitionPropertiesFor(startPadding);
          items.style.height = px(items.getBoundingClientRect().height);
          setItemBlockPadding(startPadding.top, startPadding.bottom);
          items.getBoundingClientRect();
          group.classList.add("is-collapsing");
          frame = requestAnimationFrame(() => {
            items.style.height = "0px";
            setItemBlockPadding(0, 0);
          });
        } else {
          items.style.transition = "none";
          group.open = true;
          group.classList.add("is-expanding");
          items.style.height = "";
          items.style.paddingTop = "";
          items.style.paddingBottom = "";
          items.getBoundingClientRect();
          const targetPadding = itemBlockPadding();
          const targetHeight = items.getBoundingClientRect().height;
          items.style.height = "0px";
          setItemBlockPadding(0, 0);
          items.getBoundingClientRect();
          items.style.transition = initialTransition;
          expectedTransitionProperties = transitionPropertiesFor(targetPadding);
          frame = requestAnimationFrame(() => {
            items.style.height = px(targetHeight);
            setItemBlockPadding(targetPadding.top, targetPadding.bottom);
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
  applyGridPattern(window.localStorage.getItem(gridPatternKey));
  applySignalLayout(window.localStorage.getItem(signalLayoutKey));
  applySignalRatio(window.localStorage.getItem(signalRatioKey));

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

  document.querySelectorAll("button[data-grid-pattern]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const pattern = button.dataset.gridPattern;
      window.localStorage.setItem(gridPatternKey, pattern);
      applyGridPattern(pattern);
    });
  });

  document.querySelectorAll("button[data-signal-layout]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const layout = button.dataset.signalLayout;
      window.localStorage.setItem(signalLayoutKey, layout);
      applySignalLayout(layout);
    });
  });

  document.querySelectorAll("button[data-signal-ratio]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const ratio = button.dataset.signalRatio;
      window.localStorage.setItem(signalRatioKey, ratio);
      applySignalRatio(ratio);
    });
  });
}

function markSidebarOverlayTransition() {
  const root = document.documentElement;
  if (!root.classList.contains("sidebar-overlay-open")) return;
  root.dataset.keepSidebarOverlay = "true";
  root.dataset.sidebarOverlayTransition = "true";
}

function releaseSidebarOverlayTransitionState() {
  const root = document.documentElement;
  if (root.dataset.sidebarOverlayTransition !== "true" && root.dataset.sidebarOverlayClosePending !== "true") {
    delete root.dataset.keepSidebarOverlay;
    return;
  }

  const release = () => {
    const currentRoot = document.documentElement;
    if (currentRoot.hasAttribute("data-astro-transition")) {
      window.requestAnimationFrame(release);
      return;
    }

    const shouldClose = currentRoot.dataset.sidebarOverlayClosePending === "true";
    delete currentRoot.dataset.keepSidebarOverlay;
    delete currentRoot.dataset.sidebarOverlayTransition;
    delete currentRoot.dataset.sidebarOverlayClosePending;

    if (shouldClose && !document.querySelector("[data-sidebar]")?.matches(":hover")) {
      currentRoot.classList.remove("sidebar-overlay-open");
    }
  };

  window.requestAnimationFrame(release);
}

function preserveShellState(event) {
  const root = document.documentElement;
  const nextRoot = event.newDocument?.documentElement;
  if (!nextRoot) return;

  nextRoot.dataset.theme = currentTheme();
  nextRoot.dataset.themeMode = currentThemeMode();
  nextRoot.dataset.arrowStyle = document.documentElement.dataset.arrowStyle || "tabler";
  nextRoot.dataset.signalLayout = document.documentElement.dataset.signalLayout || "split";
  nextRoot.dataset.signalRatio = document.documentElement.dataset.signalRatio || "square";
  nextRoot.dataset.pageDirection = document.documentElement.dataset.pageDirection || "down";
  const keepOverlay =
    root.classList.contains("sidebar-overlay-open") ||
    root.dataset.keepSidebarOverlay === "true" ||
    root.dataset.sidebarOverlayTransition === "true";
  nextRoot.classList.toggle("sidebar-collapsed", root.classList.contains("sidebar-collapsed"));
  nextRoot.classList.toggle("sidebar-open", root.classList.contains("sidebar-open"));
  nextRoot.classList.toggle("sidebar-overlay-open", keepOverlay);
  ["keepSidebarOverlay", "sidebarOverlayTransition", "sidebarOverlayClosePending"].forEach((key) => {
    if (root.dataset[key] === "true") {
      nextRoot.dataset[key] = "true";
    } else {
      delete nextRoot.dataset[key];
    }
  });
  const navGroupState = saveNavGroupState();
  applyNavGroupState(event.newDocument, navGroupState);
  const nextOpenButton = event.newDocument?.querySelector("[data-sidebar-open]");
  const sidebarOpen = root.classList.contains("sidebar-open");
  const sidebarToggleLabel = sidebarOpen ? "Close navigation" : "Open navigation";
  nextOpenButton?.setAttribute("aria-expanded", String(sidebarOpen));
  nextOpenButton?.setAttribute("aria-label", sidebarToggleLabel);
  const nextOpenButtonLabel = nextOpenButton?.querySelector("[data-sidebar-toggle-label]");
  if (nextOpenButtonLabel) nextOpenButtonLabel.textContent = sidebarToggleLabel;

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

  pageTransitionProperties.forEach((property) => {
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
  if (openNavGroupForLink(target)) saveNavGroupState();

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

function shouldConsumeInterceptedClick(event) {
  const interceptedSidebarNavigationClick = window.__hlInterceptedSidebarNavigationClick;
  if (!interceptedSidebarNavigationClick) return false;
  const elapsed = performance.now() - interceptedSidebarNavigationClick.time;
  const closeToPointer =
    Math.abs(event.clientX - interceptedSidebarNavigationClick.x) <= 3 &&
    Math.abs(event.clientY - interceptedSidebarNavigationClick.y) <= 3;
  if (elapsed > 700 || !closeToPointer) {
    window.__hlInterceptedSidebarNavigationClick = null;
    return false;
  }
  window.__hlInterceptedSidebarNavigationClick = null;
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
  window.__hlInterceptedSidebarNavigationClick = {
    x: event.clientX,
    y: event.clientY,
    time: performance.now()
  };

  const targetIndex = Number(link.dataset.navIndex);
  setPageDirection(targetIndex, path);
  setSidebarActivePath(path, { animate: true });
  markSidebarOverlayTransition();
  navigateWithTransition(link.href, link, { updateActive: false, updateDirection: false });
}

function handleTransitionPreparation(event) {
  const path = normalizePath(event.to?.href);
  const fromPath =
    lastSettledPath && lastSettledPath !== path
      ? lastSettledPath
      : activeNavPath() || normalizePath(event.from?.href);
  const targetScrollY =
    event.navigationType === "traverse" && Number.isFinite(history.state?.scrollY)
      ? history.state.scrollY
      : 0;
  document.documentElement.style.setProperty("--page-old-scroll-offset-y", `${Math.round(targetScrollY - window.scrollY)}px`);
  if (fromPath && path) setPageDirectionBetweenPaths(fromPath, path);
  if (path) setSidebarActivePath(path, { animate: true });
}

function handleNavigationIntent(event) {
  const backButton = event.target.closest?.("[data-history-back]");
  if (backButton) {
    event.preventDefault();
    const currentPath = normalizePath(window.location.href);
    const navigation = window.navigation;
    const previousPageEntry = navigation?.currentEntry
      ? navigation
          .entries()
          .slice(0, navigation.currentEntry.index)
          .reverse()
          .find((entry) => entry.url && normalizePath(entry.url) !== currentPath)
      : null;

    if (previousPageEntry) {
      navigation.traverseTo(previousPageEntry.key);
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateWithTransition("/", backButton, { history: "replace" });
    }
    return;
  }

  if (shouldConsumeInterceptedClick(event)) return;

  const link = event.target.closest?.("a[href]");
  if (!link) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== "_self") return;

  if (link.hasAttribute("data-toc-link")) {
    document.documentElement.classList.add("toc-scrolling");
    window.clearTimeout(window.__hlTocScrollTimer);
    window.__hlTocScrollTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("toc-scrolling");
    }, 1000);
    return;
  }

  const path = normalizePath(link.href);
  if (!path) return;
  const targetIndex = link.dataset.navIndex ? Number(link.dataset.navIndex) : navIndexForPath(path);
  setPageDirection(targetIndex, path);
  if (Number.isFinite(targetIndex)) setSidebarActivePath(path, { animate: true });
  markSidebarOverlayTransition();

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
    window.__hlNavigate(href, { history: options.history, sourceElement });
    return;
  }

  if (options.history === "replace") {
    window.location.replace(href);
  } else {
    window.location.assign(href);
  }
}

function initSignals() {
  document.querySelectorAll("[data-signal]").forEach((feed) => {
    if (feed.dataset.bound) return;
    feed.dataset.bound = "true";

    const items = Array.from(feed.querySelectorAll("[data-signal-item]"));
    if (items.length === 0) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeIndex = Math.max(
      0,
      items.findIndex((item) => item.classList.contains("is-active"))
    );
    let timer = null;

    const select = (index) => {
      activeIndex = (index + items.length) % items.length;
      feed.style.setProperty("--active-index", String(activeIndex));
      feed.style.setProperty("--active-progress", `${(activeIndex / items.length) * 100}%`);
      items.forEach((item, itemIndex) => {
        const active = itemIndex === activeIndex;
        const trigger = item.querySelector("[data-signal-trigger]");
        const panel = item.querySelector("[data-signal-panel]");
        item.classList.toggle("is-active", active);
        trigger?.setAttribute("aria-expanded", String(active));
        panel?.setAttribute("aria-hidden", String(!active));
        if (panel instanceof HTMLElement) panel.inert = !active;
      });
    };

    const start = () => {
      stop();
      if (motionQuery.matches || document.hidden || feed.matches(":hover, :focus-within")) return;
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
          if (event.target.closest?.("[data-signal-link]")) return;

          const wasActive = index === activeIndex;
          if (!wasActive) {
            event.preventDefault();
            select(index);
            start();
            if (event.detail > 0 && document.activeElement instanceof HTMLElement) document.activeElement.blur();
            return;
          }

          const href = item.dataset.signalHref;
          if (!href) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            window.open(href, "_blank", "noopener");
            return;
          }
          navigateWithTransition(href, item);
        },
        { signal: getSignal(item, "signal") }
      );
    });

    feed.addEventListener("mouseenter", stop, { signal: getSignal(feed, "signal") });
    feed.addEventListener("mouseleave", start, { signal: getSignal(feed, "signal") });
    feed.addEventListener("focusin", stop, { signal: getSignal(feed, "signal") });
    feed.addEventListener(
      "focusout",
      (event) => {
        if (!feed.contains(event.relatedTarget)) start();
      },
      { signal: getSignal(feed, "signal") }
    );
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()), {
      signal: getSignal(feed, "signal")
    });
    motionQuery.addEventListener?.("change", () => (motionQuery.matches ? stop() : start()), {
      signal: getSignal(feed, "signal")
    });

    select(activeIndex);
    start();
  });
}

function positionHeadingReferences() {
  const compact = window.matchMedia("(max-width: 900px)").matches;

  document.querySelectorAll(".prose :is(h1, h2, h3, h4, h5, h6)[id]").forEach((heading) => {
    const button = heading.querySelector(":scope > [data-heading-copy]");
    if (!(button instanceof HTMLElement)) return;

    const range = document.createRange();
    range.selectNodeContents(heading);
    range.setEndBefore(button);
    const lines = Array.from(range.getClientRects()).filter(({ width, height }) => width && height);
    const line = lines[compact ? lines.length - 1 : 0];
    if (!line) return;

    const headingRect = heading.getBoundingClientRect();
    const x = compact
      ? Math.max(0, Math.min(line.right - headingRect.left + 6, headingRect.width - button.offsetWidth))
      : -button.offsetWidth - 8;
    const y = line.top - headingRect.top + line.height / 2;
    heading.style.setProperty("--heading-reference-x", `${x}px`);
    heading.style.setProperty("--heading-reference-y", `${y}px`);
  });
}

function initHeadingReferences() {
  const headings = document.querySelectorAll(".prose :is(h1, h2, h3, h4, h5, h6)[id]");
  const iconTemplate = document.querySelector("template[data-heading-reference-icon]");
  if (!(iconTemplate instanceof HTMLTemplateElement)) return;

  headings.forEach((heading) => {
    if (heading.querySelector(":scope > [data-heading-copy]")) return;

    const label = heading.textContent.trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heading-reference";
    button.dataset.headingCopy = heading.id;
    button.dataset.copyPath = `${window.location.pathname}${window.location.search}#${heading.id}`;
    button.setAttribute("aria-label", `Copy link to ${label}`);
    button.title = "Copy link";
    button.append(iconTemplate.content.cloneNode(true));
    button.addEventListener("click", async () => {
      const url = new URL(window.location.href);
      url.hash = heading.id;

      try {
        await navigator.clipboard.writeText(url.href);
        button.classList.add("is-copied");
        button.setAttribute("aria-label", `Copied link to ${label}`);
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          button.setAttribute("aria-label", `Copy link to ${label}`);
        }, 1400);
      } catch {}
    });
    heading.append(button);
  });

  window.requestAnimationFrame(positionHeadingReferences);
  if (!window.__hlHeadingReferenceResizeBound) {
    window.__hlHeadingReferenceResizeBound = true;
    window.addEventListener("resize", positionHeadingReferences, { passive: true });
  }
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
  initHeadingReferences();
  initSignals();
  releaseSidebarOverlayTransitionState();
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
})();
