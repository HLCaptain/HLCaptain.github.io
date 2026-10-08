import { createTimeline, type Timeline } from "animejs/timeline";
import { stagger } from "animejs/utils";

declare global {
  interface Window { __hlStartupPending?: boolean; }
}

type Palette = Record<"canvas" | "surface" | "soft" | "strong" | "line" | "ink" | "accent" | "accentInk", string>;
const duration = 1000;
const tau = Math.PI * 2;

function quilt(tl: Timeline, ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) {
  const cols = w < 600 ? 5 : 9;
  const rows = Math.ceil(h / (w / cols));
  const cw = w / cols, ch = h / rows;
  const tiles = Array.from({ length: cols * rows }, (_, i) => ({
    col: i % cols, row: Math.floor(i / cols), lift: 0, leave: 0
  }));
  const signal = { progress: 0, opacity: 0 };
  tl.add(tiles, { lift: [0, 1], delay: stagger([0, 180], { grid: [cols, rows], from: "first" }), duration: 250, ease: "outExpo" }, 0)
    .add(signal, { opacity: [0, 1], duration: 70 }, 60)
    .add(signal, { progress: [0, 1], duration: 520, ease: "inOutCubic" }, 80)
    .add(signal, { opacity: 0, duration: 100 }, 670)
    .add(tiles, { leave: [0, 1], delay: stagger([0, 110], { grid: [cols, rows], from: "center" }), duration: 310, ease: "inOutCubic" }, 560);
  return () => {
    for (const tile of tiles) {
      const cx = (tile.col + 0.5) * cw, cy = (tile.row + 0.5) * ch;
      const dx = cx - w / 2, dy = cy - h / 2;
      const diagonal = (tile.col / (cols - 1) + tile.row / Math.max(1, rows - 1)) / 2;
      const phase = (signal.progress - diagonal) / 0.12;
      const ripple = Math.sin(phase * Math.PI) * Math.exp(-phase * phase) * (1 - tile.leave);
      const scale = (0.55 + tile.lift * 0.45) * (1 - tile.leave);
      const tw = (cw - 3) * scale * (1 + ripple * 0.12), th = (ch - 3) * scale * (1 - ripple * 0.08);
      ctx.save();
      ctx.translate(cx + dx * tile.leave * 0.65, cy + dy * tile.leave * 0.65 + (1 - tile.lift) * 18);
      ctx.rotate((tile.col % 2 ? 1 : -1) * (tile.leave * 0.16 + ripple * 0.05));
      ctx.fillStyle = [p.surface, p.soft, p.strong][(tile.col + tile.row * 2) % 3];
      ctx.fillRect(-tw / 2, -th / 2, tw, th);
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(-tw / 2 + 0.5, -th / 2 + 0.5, Math.max(0, tw - 1), Math.max(0, th - 1));
      // Fine ruled texture gives each panel a reflective edge without a blur layer.
      ctx.globalAlpha = 0.24 * (1 - tile.leave);
      ctx.fillStyle = p.ink;
      ctx.fillRect(-tw / 2 + 8, -th / 2 + 8, Math.max(0, tw - 16), 1);
      ctx.fillRect(-tw / 2 + 8, -th / 2 + 12, Math.max(0, tw / 3), 1);
      ctx.globalAlpha = Math.abs(ripple) * 0.8;
      ctx.fillStyle = p.soft;
      ctx.fillRect(-tw / 2 + 2, -th / 2 + 2, Math.max(0, tw - 4), 3);
      ctx.restore();
    }
    ctx.globalAlpha = signal.opacity;
    const sx = w * signal.progress, sy = h * signal.progress;
    for (let i = 0; i < 3; i++) {
      const x = sx - i * 22, y = sy - i * 16;
      ctx.fillStyle = p.accentInk;
      ctx.fillRect(x - 19, y - 3, 38, 6);
      ctx.fillRect(x - 3, y - 19, 6, 38);
      ctx.fillStyle = p.accent;
      ctx.fillRect(x - 18, y - 2, 36, 4);
      ctx.fillRect(x - 2, y - 18, 4, 36);
    }
    ctx.globalAlpha = 1;
  };
}

function iris(tl: Timeline, ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) {
  const radius = Math.hypot(w, h) / 2;
  const state = { open: 0, turn: -0.22, ring: 0, signal: 1 };
  const blades = Array.from({ length: 12 }, (_, i) => ({ angle: i * tau / 12, shift: 0 }));
  tl.add(state, { ring: [0, 1], turn: [-0.22, 0], duration: 300, ease: "outExpo" }, 0)
    .add(state, { open: [0, 1.08], duration: 770, ease: "inOutCubic" }, 190)
    .add(blades, { shift: [0, 0.2], delay: stagger(7), duration: 330, ease: "inCubic" }, 560)
    .add(state, { turn: 0.32, duration: 660, ease: "inOutCubic" }, 290)
    .add(state, { signal: 0, duration: 110 }, 850);
  return () => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(state.turn);
    const inner = Math.max(0, radius * state.open);
    for (let i = 0; i < blades.length; i++) {
      const angle = blades[i].angle + blades[i].shift;
      const end = angle + tau / 12 + 0.006;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.65, angle, end);
      ctx.arc(0, 0, inner, end - 0.08, angle - 0.08, true);
      ctx.closePath();
      ctx.fillStyle = [p.surface, p.soft, p.strong][i % 3];
      ctx.fill();
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Concentric machining marks stay in the surface palette.
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.45;
      for (let band = 1; band <= 4; band++) {
        ctx.beginPath();
        ctx.arc(0, 0, radius * band / 4, angle + 0.04, end - 0.04);
        ctx.stroke();
      }
      ctx.restore();
    }
    const rim = Math.max(24 * state.ring, inner + 10);
    ctx.globalAlpha = state.signal;
    ctx.strokeStyle = p.accentInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, rim, -0.45, 0.3);
    ctx.moveTo(Math.cos(Math.PI - 0.45) * rim, Math.sin(Math.PI - 0.45) * rim);
    ctx.arc(0, 0, rim, Math.PI - 0.45, Math.PI + 0.3);
    ctx.stroke();
    ctx.fillStyle = p.accent;
    for (const angle of [0, Math.PI]) {
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(rim - 8, -7);
      ctx.lineTo(rim + 9, 0);
      ctx.lineTo(rim - 8, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };
}

function current(tl: Timeline, ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) {
  const count = w < 600 ? 5 : 7;
  const step = Math.max(25, Math.min(42, w / 24));
  const lanes = Array.from({ length: count }, (_, i) => ({ index: i, enter: 0, travel: 0, leave: 0 }));
  const comet = { progress: 0, opacity: 0 };
  tl.add(lanes, { enter: [0, 1], delay: stagger(24), duration: 310, ease: "outQuart" }, 0)
    .add(lanes, { travel: [0, 1], duration: 850, ease: "inOutSine" }, 50)
    .add(comet, { opacity: [0, 1], duration: 90 }, 90)
    .add(comet, { progress: [0, 1], duration: 620, ease: "inOutCubic" }, 130)
    .add(comet, { opacity: 0, duration: 90 }, 790)
    .add(lanes, { leave: [0, 1], delay: stagger(24), duration: 330, ease: "inCubic" }, 500);
  const point = (lane: number, x: number, travel: number) => {
    const phase = x / w * tau * 0.7 + lane * 0.48 + travel * 0.8;
    const amplitude = Math.min(w * 0.1, h * 0.13);
    return { y: h * (lane + 1) / (count + 1) + Math.sin(phase) * amplitude,
      angle: Math.atan(Math.cos(phase) * amplitude * tau * 0.7 / w) };
  };
  return () => {
    for (const lane of lanes) {
      const shift = (1 - lane.enter) * -w * 0.45 + lane.leave * w * 1.3;
      ctx.globalAlpha = lane.enter * (1 - lane.leave * 0.5);
      for (let x = -step; x < w + step; x += step) {
        const px = x + shift + lane.travel * step * 3;
        const pt = point(lane.index, x, lane.travel);
        for (const strip of [-1, 0, 1]) {
          const offset = strip * step * 0.72;
          ctx.save();
          ctx.translate(px - Math.sin(pt.angle) * offset, pt.y + Math.cos(pt.angle) * offset);
          ctx.rotate(pt.angle + strip * 0.04);
          const tile = step * (0.72 - Math.abs(strip) * 0.12) * lane.enter;
          ctx.fillStyle = [p.strong, p.surface, p.soft][(Math.floor(x / step) + lane.index + strip + 30) % 3];
          ctx.fillRect(-tile / 2, -tile / 2, tile, tile);
          ctx.strokeStyle = p.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(-tile / 2, -tile / 2, tile, tile);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = comet.opacity;
    for (const lane of [1, count - 2]) {
      const x = (comet.progress * 1.3 - 0.15) * w;
      const pt = point(lane, x, lanes[lane].travel);
      ctx.save();
      ctx.translate(x, pt.y);
      ctx.rotate(pt.angle);
      ctx.fillStyle = p.accentInk;
      ctx.fillRect(-52, -1, 42, 2);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(0, 9); ctx.lineTo(-10, 0); ctx.lineTo(0, -9); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
}

function initStartup(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const preview = root.dataset.preview === "true";
  const key = "hlcaptain-startup-variant";
  const variants = ["lattice", "aperture", "flux"];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let selected = "lattice";
  let timeline: Timeline | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (preview) {
    try { const saved = localStorage.getItem(key); if (saved && variants.includes(saved)) selected = saved; } catch {}
  }
  const finish = () => {
    clearTimeout(timer);
    timeline?.cancel();
    timeline = undefined;
    if (!root.hidden) {
      root.hidden = true;
      root.dispatchEvent(new CustomEvent("startup:end", { bubbles: true, detail: { variant: root.dataset.variant, duration } }));
    }
  };
  const play = () => {
    finish();
    root.dataset.variant = selected;
    if (motion.matches) return;
    const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const palette = Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>("[data-startup-color]"), node => [node.dataset.startupColor, getComputedStyle(node).color])) as Palette;
    const cover = { background: 1, opacity: 1 };
    let draw = () => {};
    const render = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = cover.background;
      ctx.fillStyle = palette.canvas;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      draw();
      canvas.style.opacity = String(cover.opacity);
    };
    timeline = createTimeline({ autoplay: false, onRender: render, onComplete: finish });
    draw = (selected === "aperture" ? iris : selected === "flux" ? current : quilt)(timeline, ctx, w, h, palette);
    timeline.add(cover, { background: [1, 0], duration: 180, ease: "outQuad" }, selected === "aperture" ? 160 : selected === "flux" ? 580 : 540)
      .add(cover, { opacity: [1, 0], duration: 90, ease: "inQuad" }, 910);
    root.hidden = false;
    render();
    root.dispatchEvent(new CustomEvent("startup:begin", { bubbles: true, detail: { variant: selected, duration } }));
    timeline.play();
    // Keep a wall-clock exit even when the rendering thread loses frames.
    timer = setTimeout(finish, duration);
  };
  const sync = () => {
    document.querySelectorAll<HTMLElement>("[data-startup-variant]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.startupVariant === selected)));
    document.querySelectorAll<HTMLElement>("[data-startup-motion-note]").forEach(note => { note.hidden = !motion.matches; });
  };
  document.addEventListener("astro:before-preparation", finish);
  window.addEventListener("pagehide", finish);
  window.addEventListener("resize", finish);
  motion.addEventListener("change", () => { if (motion.matches) finish(); sync(); });
  if (preview) {
    document.addEventListener("astro:page-load", sync);
    document.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-startup-variant], [data-startup-replay]") : null;
      if (!button?.closest("[data-debug-panel]")) return;
      const variant = button.dataset.startupVariant;
      if (variant) {
        if (!variants.includes(variant)) return;
        selected = variant;
        try { localStorage.setItem(key, selected); } catch {}
      }
      sync(); play();
    });
  }
  sync();
  if (window.__hlStartupPending) { window.__hlStartupPending = false; play(); }
}

const root = document.querySelector<HTMLElement>("[data-startup]");
if (root) initStartup(root);
