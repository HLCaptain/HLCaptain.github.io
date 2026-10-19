(() => {
  const root = document.documentElement;
  const accentKey = "hlcaptain-accent";
  const themeKey = "hlcaptain-theme";
  const sidebarKey = "hlcaptain-sidebar";
  const arrowKey = "hlcaptain-arrow-style";
  const gridPatternKey = "hlcaptain-grid-pattern";
  const signalLayoutKey = "hlcaptain-signal-layout";
  const signalRatioKey = "hlcaptain-signal-ratio";
  const surfaceAccentKey = "hlcaptain-surface-accent";
  const defaultSurfaceAccent = 20;
  const hex = (rgb) =>
    `#${[rgb.r, rgb.g, rgb.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const parse = (value) => {
    const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(value || "");
    if (!match) return null;
    const full = match[1].length === 3 ? match[1].split("").map((c) => c + c).join("") : match[1];
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16)
    };
  };
  const mix = (a, b, weight) => ({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight
  });
  const lum = (rgb) => {
    const channels = [rgb.r, rgb.g, rgb.b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const high = Math.max(lum(a), lum(b));
    const low = Math.min(lum(a), lum(b));
    return (high + 0.05) / (low + 0.05);
  };
  const normalize = (value, theme) => {
    const source = parse(value);
    if (!source) return null;
    let accent = source;
    const min = theme === "black" ? 0.34 : 0.22;
    const max = theme === "black" ? 0.74 : 0.68;
    for (let i = 0; i < 12 && lum(accent) < min; i += 1) accent = mix(accent, { r: 255, g: 255, b: 255 }, 0.1);
    for (let i = 0; i < 12 && lum(accent) > max; i += 1) accent = mix(accent, { r: 0, g: 0, b: 0 }, 0.1);
    const bg = theme === "black" ? { r: 26, g: 25, b: 18 } : { r: 228, g: 223, b: 205 };
    const target = lum(bg) > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    let readable = accent;
    for (let i = 0; i < 12 && contrast(readable, bg) < 3.8; i += 1) readable = mix(readable, target, 0.12);
    const tint = mix(theme === "black" ? { r: 75, g: 68, b: 50 } : { r: 184, g: 170, b: 138 }, accent, theme === "black" ? 0.34 : 0.5);
    return {
      accent: hex(accent),
      readable: hex(readable),
      tint: hex(tint)
    };
  };
  try {
    const savedTheme = localStorage.getItem(themeKey);
    const themeMode = ["light", "black", "system"].includes(savedTheme) ? savedTheme : "light";
    const systemTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "black" : "light";
    const theme = themeMode === "system" ? systemTheme : themeMode;
    const accent = localStorage.getItem(accentKey);
    const arrow = localStorage.getItem(arrowKey);
    const gridPattern = localStorage.getItem(gridPatternKey);
    const signalLayout = localStorage.getItem(signalLayoutKey);
    const signalRatio = localStorage.getItem(signalRatioKey);
    const savedSurfaceAccent = localStorage.getItem(surfaceAccentKey);
    const parsedSurfaceAccent = Number(savedSurfaceAccent);
    const surfaceAccent = savedSurfaceAccent !== null && savedSurfaceAccent !== "" && Number.isFinite(parsedSurfaceAccent)
      ? Math.min(30, Math.max(0, parsedSurfaceAccent))
      : defaultSurfaceAccent;
    root.dataset.theme = theme;
    root.dataset.themeMode = themeMode;
    root.dataset.arrowStyle = ["tabler", "lucide", "phosphor", "remix", "fluent", "pixelart"].includes(arrow) ? arrow : "tabler";
    root.dataset.gridPattern = ["grid", "dots", "plus", "crosshatch", "diagonal", "circuit", "scanlines"].includes(gridPattern) ? gridPattern : "plus";
    root.dataset.signalLayout = ["split", "stack", "compact"].includes(signalLayout) ? signalLayout : "compact";
    root.dataset.signalRatio = ["square", "landscape", "wide", "portrait"].includes(signalRatio) ? signalRatio : "square";
    root.style.setProperty("--surface-accent-strength", `${surfaceAccent}%`);
    root.classList.toggle(
      "sidebar-collapsed",
      localStorage.getItem(sidebarKey) === "collapsed" && matchMedia("(min-width: 721px)").matches
    );
    if (accent) {
      const normalized = normalize(accent, theme);
      if (normalized) {
        root.dataset.accent = "custom";
        root.style.setProperty("--accent", normalized.accent);
        root.style.setProperty("--accent-readable", normalized.readable);
        root.style.setProperty("--accent-tint", normalized.tint);
        root.style.setProperty("accent-color", normalized.accent);
      }
    }
  } catch {}
})();
