import type { Clip, MediaSource, Project, Track } from "../types.js";
import { fmtClockMs } from "../ui/format.js";
import type { ThumbnailRibbon } from "../ui/thumbnails.js";
import {
  CLIP_INSET,
  HEADER_WIDTH,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  formatRulerLabel,
  niceTickSeconds,
  totalHeight,
  trackY,
  uncoveredIntervals,
} from "./layout.js";

export interface DrawStyle {
  bg: string;
  border: string;
  text: string;
  textMuted: string;
  trackBg: string;
  brand: string;
  brandTo: string;
  info: string;
  clipText: string;
  selectedRing: string;
  playhead: string;
}

export interface DrawState {
  project: Project;
  pxPerSec: number;
  scrollLeft: number;
  timeMs: number;
  selectedClipId: string | null;
  hoveredClipId: string | null;
  hoveredTrackIndex: number | null;
  dropTargetTrackIndex: number | null;
  /** While any drag is in flight, draw a "+ 新轨道" phantom row at the
   *  bottom that the user can drop into to explicitly create a track. */
  isDragging: boolean;
  snapX: number | null;
  showHeader: boolean;
  viewportWidth: number;
  viewportHeight: number;
  /**
   * In-flight drag preview. While set, the clip with `clipId` is
   * drawn faded at its real position AND a fully-opaque "ghost" of it
   * is drawn at (ghostStart, ghostTrackIndex). `wouldOverlap` flips
   * the ghost to a warning color so users see auto-split coming.
   */
  dragGhost: {
    clipId: string;
    ghostStart: number;
    ghostTrackIndex: number;
    wouldOverlap: boolean;
  } | null;
}

/**
 * Paint the entire timeline. Stateless — given the same DrawState
 * twice you get the same pixels. Order matters: background → ruler →
 * tracks → clips (with thumbnails) → headers → snap guide → playhead.
 */
export function drawAll(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
  thumbs: ThumbnailRibbon,
): void {
  const { viewportWidth: W, viewportHeight: H } = state;
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);

  drawRuler(ctx, state, style);
  drawTracks(ctx, state, style, thumbs);
  drawCoverageGaps(ctx, state, style);
  // Phantom "+ new track" row is always present during a drag so the
  // user can choose to create a track at will (not only when forced
  // by overlap). Painted before the ghost so the ghost sits on top.
  if (state.isDragging) {
    drawPhantomRow(
      ctx,
      state.project.tracks.length,
      state.showHeader ? HEADER_WIDTH : 0,
      state,
      style,
    );
  }
  if (state.dragGhost) drawDragGhost(ctx, state, style, thumbs);
  if (state.showHeader) drawHeaders(ctx, state, style);
  drawSnapGuide(ctx, state, style);
  drawPlayhead(ctx, state, style);
}

/**
 * Highlight time spans where no video clip is present anywhere on any
 * track — a warning to the user that the export will have a hard cut
 * to black at this point. Painted as a translucent amber vertical
 * strip spanning the full track stack, plus a slightly more saturated
 * strip in the ruler band so it's catchable even when the user is
 * scanning the timecode row.
 */
function drawCoverageGaps(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
): void {
  const gaps = uncoveredIntervals(state.project);
  if (gaps.length === 0) return;
  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const trackStackH = totalHeight(state.project.tracks) - RULER_HEIGHT;
  for (const [s, e] of gaps) {
    const x1 = Math.max(
      baseX,
      baseX + (s / 1000) * state.pxPerSec - state.scrollLeft,
    );
    const x2 = Math.min(
      state.viewportWidth,
      baseX + (e / 1000) * state.pxPerSec - state.scrollLeft,
    );
    if (x2 <= x1) continue;
    // Ruler band — stronger so it's the first thing the eye catches.
    ctx.fillStyle = "rgba(250, 167, 0, 0.35)";
    ctx.fillRect(x1, 0, x2 - x1, RULER_HEIGHT);
    // Track band — faint so it doesn't fight the clip thumbnails on
    // adjacent rows.
    ctx.fillStyle = "rgba(250, 167, 0, 0.12)";
    ctx.fillRect(x1, RULER_HEIGHT, x2 - x1, trackStackH);
    // Hatched marker on the ruler so it reads as a problem, not a
    // selection. Diagonal lines at 6px spacing.
    ctx.save();
    ctx.strokeStyle = "rgba(250, 167, 0, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let hx = Math.floor(x1); hx < x2; hx += 6) {
      ctx.moveTo(hx, RULER_HEIGHT - 1);
      ctx.lineTo(hx + 6, RULER_HEIGHT - 7);
    }
    ctx.stroke();
    ctx.restore();
    void style;
  }
}

function drawDragGhost(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
  thumbs: ThumbnailRibbon,
): void {
  const ghost = state.dragGhost!;
  // Locate the real clip so the ghost reuses its source / duration.
  let real: Clip | null = null;
  for (const t of state.project.tracks) {
    const c = t.clips.find((c) => c.id === ghost.clipId);
    if (c) {
      real = c;
      break;
    }
  }
  if (!real) return;

  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const widthPx = Math.max(2, ((real.out - real.in) / 1000) * state.pxPerSec);
  const startX =
    baseX + (ghost.ghostStart / 1000) * state.pxPerSec - state.scrollLeft;

  // ---- Drop-slot outline ------------------------------------------------
  // Always paint a dashed rectangle where the clip will land — the
  // outline is the "slot" and the solid ghost above it is the clip.
  // When the drop would overlap (→ Editor will auto-split onto a
  // brand-new track below), draw an ADDITIONAL phantom row at the
  // bottom + outline there, so the user sees the new track coming.
  const overlap = ghost.wouldOverlap;
  // Phantom row is now drawn unconditionally during drag (see drawAll);
  // we only need the dashed drop outline here, on whichever row the
  // ghost is currently above.
  drawDropOutline(
    ctx,
    startX,
    overlap ? state.project.tracks.length : ghost.ghostTrackIndex,
    widthPx,
    style.info,
    overlap,
  );

  // ---- Ghost clip body --------------------------------------------------
  // Slight transparency so the user reads it as "preview" rather than
  // the committed clip. The drop outline + phantom row carry the rest
  // of the wayfinding.
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawClipAt(
    ctx,
    real,
    overlap ? state.project.tracks.length : ghost.ghostTrackIndex,
    ghost.ghostStart,
    state.project.sources,
    state,
    style,
    thumbs,
    /* dim = */ false,
    /* warn = */ overlap,
  );
  ctx.restore();
}

function drawDropOutline(
  ctx: CanvasRenderingContext2D,
  startX: number,
  trackIndex: number,
  widthPx: number,
  color: string,
  emphasized: boolean,
): void {
  // 1px solid info-tinted outline — present, but doesn't shout.
  // `emphasized` (used when the drop would land on the phantom new
  // track) bumps to a slightly thicker stroke + a faint glow halo.
  const y = trackY(trackIndex) + CLIP_INSET - 1;
  const h = TRACK_HEIGHT - CLIP_INSET * 2 + 2;
  ctx.save();
  if (emphasized) {
    ctx.shadowColor = withAlpha(color, 0.45);
    ctx.shadowBlur = 6;
  }
  ctx.strokeStyle = withAlpha(color, emphasized ? 0.9 : 0.7);
  ctx.lineWidth = 1;
  roundRect(ctx, startX - 0.5, y, widthPx + 1, h, 6);
  ctx.stroke();
  ctx.restore();
}

/**
 * Hairline placeholder row beneath the existing tracks, visible only
 * while a drag is active. Deliberately understated — top + bottom
 * dashed borders + a tiny label, no fill — so it reads as "available
 * slot" rather than "selection target".
 */
function drawPhantomRow(
  ctx: CanvasRenderingContext2D,
  trackIndex: number,
  baseX: number,
  state: DrawState,
  style: DrawStyle,
): void {
  const y = trackY(trackIndex);
  const w = state.viewportWidth - baseX;
  ctx.save();
  // Very faint background tint — keeps the row visually grouped with
  // the rest of the timeline without competing with clip thumbnails.
  ctx.fillStyle = withAlpha(style.info, 0.04);
  ctx.fillRect(baseX, y, w, TRACK_HEIGHT);
  // Dashed top + bottom hairlines so the eye reads it as a slot.
  ctx.strokeStyle = withAlpha(style.info, 0.35);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(baseX, y + 0.5);
  ctx.lineTo(baseX + w, y + 0.5);
  ctx.moveTo(baseX, y + TRACK_HEIGHT - 0.5);
  ctx.lineTo(baseX + w, y + TRACK_HEIGHT - 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  if (state.showHeader) {
    ctx.fillStyle = withAlpha(style.info, 0.7);
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("+ 新轨道", 12, y + TRACK_HEIGHT / 2);
  }
  ctx.restore();
}

// ---- ruler ----------------------------------------------------------------

function drawRuler(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
): void {
  const { pxPerSec, scrollLeft, viewportWidth: W } = state;
  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const rulerW = W - baseX;

  ctx.fillStyle = style.bg;
  ctx.fillRect(baseX, 0, rulerW, RULER_HEIGHT);

  // Bottom border under the ruler.
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(baseX, RULER_HEIGHT - 0.5);
  ctx.lineTo(W, RULER_HEIGHT - 0.5);
  ctx.stroke();

  const minPx = 80;
  const tickSec = niceTickSeconds(minPx / pxPerSec);
  const subSec = tickSec / 5;

  const firstVisibleSec = Math.max(0, scrollLeft / pxPerSec - subSec);
  const lastVisibleSec = (scrollLeft + rulerW) / pxPerSec + subSec;

  ctx.textBaseline = "bottom";
  ctx.font = "10px system-ui, -apple-system, sans-serif";

  // Sub + major ticks in one pass.
  const startStep = Math.floor(firstVisibleSec / subSec);
  const endStep = Math.ceil(lastVisibleSec / subSec);

  for (let i = startStep; i <= endStep; i++) {
    const s = i * subSec;
    if (s < 0) continue;
    const x = baseX + s * pxPerSec - scrollLeft;
    if (x < baseX || x > W) continue;
    const isMajor = Math.abs(((s / tickSec) % 1)) < 1e-3;
    ctx.strokeStyle = isMajor
      ? withAlpha(style.text, 0.5)
      : withAlpha(style.text, 0.25);
    ctx.lineWidth = 1;
    const h = isMajor ? 10 : 6;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_HEIGHT - h);
    ctx.lineTo(x + 0.5, RULER_HEIGHT - 1);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = withAlpha(style.textMuted, 0.85);
      ctx.fillText(formatRulerLabel(s), x + 3, RULER_HEIGHT - 12);
    }
  }
}

// ---- tracks + clips -------------------------------------------------------

function drawTracks(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
  thumbs: ThumbnailRibbon,
): void {
  const { project } = state;
  for (let ti = 0; ti < project.tracks.length; ti++) {
    drawTrackRow(ctx, ti, project.tracks[ti]!, project.sources, state, style, thumbs);
  }
}

function drawTrackRow(
  ctx: CanvasRenderingContext2D,
  trackIndex: number,
  track: Track,
  sources: MediaSource[],
  state: DrawState,
  style: DrawStyle,
  thumbs: ThumbnailRibbon,
): void {
  const { viewportWidth: W } = state;
  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const y = trackY(trackIndex);

  // Track surface: just the default tint. Drop-target highlight is now
  // limited to a 1px top + bottom info-tinted hairline (instead of a
  // brand-color flood) so the dragged ghost reads as primary content
  // and the row hint stays quiet.
  ctx.fillStyle = style.trackBg;
  ctx.fillRect(baseX, y, W - baseX, TRACK_HEIGHT);

  // Row separator (bottom border).
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(baseX, y + TRACK_HEIGHT - 0.5);
  ctx.lineTo(W, y + TRACK_HEIGHT - 0.5);
  ctx.stroke();

  if (state.dropTargetTrackIndex === trackIndex) {
    ctx.strokeStyle = withAlpha(style.info, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(baseX, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.moveTo(baseX, y + TRACK_HEIGHT - 0.5);
    ctx.lineTo(W, y + TRACK_HEIGHT - 0.5);
    ctx.stroke();
  }

  for (const clip of track.clips) {
    const dim = state.dragGhost?.clipId === clip.id;
    drawClipAt(
      ctx,
      clip,
      trackIndex,
      clip.start,
      sources,
      state,
      style,
      thumbs,
      dim,
      false,
    );
  }
}

/**
 * Paint a clip at a virtual `(trackIndex, startMs)` that may differ
 * from its data position. Used for both normal clip rendering (passing
 * the clip's real `start` + `trackIndex`) and for the in-flight drag
 * ghost (where the values come from pointer position).
 *
 *   `dim`  — render at low opacity (the "leave-behind" at the drag's
 *            origin so the user sees where the clip will return if
 *            they release without moving).
 *   `warn` — paint the body in warning color (orange-ish) to telegraph
 *            "if you drop here, this will create a new track because
 *            of the overlap rule."
 */
function drawClipAt(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  trackIndex: number,
  startMs: number,
  sources: MediaSource[],
  state: DrawState,
  style: DrawStyle,
  thumbs: ThumbnailRibbon,
  dim: boolean,
  warn: boolean,
): void {
  const { pxPerSec, scrollLeft } = state;
  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const startX = baseX + (startMs / 1000) * pxPerSec - scrollLeft;
  const widthPx = Math.max(2, ((clip.out - clip.in) / 1000) * pxPerSec);
  const y = trackY(trackIndex) + CLIP_INSET;
  const h = TRACK_HEIGHT - CLIP_INSET * 2;
  if (startX + widthPx < baseX || startX > state.viewportWidth) return;

  ctx.save();
  if (dim) ctx.globalAlpha = 0.3;

  // Body fill — brand gradient by default. `warn` (drop would
  // auto-create a new track) tints toward a soft amber rather than
  // the previous loud red/orange.
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  if (warn) {
    grad.addColorStop(0, "rgba(250, 175, 70, 0.7)");
    grad.addColorStop(1, "rgba(240, 145, 50, 0.62)");
  } else {
    grad.addColorStop(0, withAlpha(style.brand, 0.8));
    grad.addColorStop(1, withAlpha(style.brandTo, 0.7));
  }
  ctx.fillStyle = grad;
  roundRect(ctx, startX, y, widthPx, h, 6);
  ctx.fill();

  // Thumbnail strip.
  ctx.save();
  roundRect(ctx, startX, y, widthPx, h, 6);
  ctx.clip();
  ctx.translate(startX, y);
  thumbs.paintStrip(ctx, clip.sourceId, clip.in, clip.out, widthPx);
  ctx.restore();

  // Inner highlight (1px white inset).
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  roundRect(ctx, startX + 0.5, y + 0.5, widthPx - 1, h - 1, 6);
  ctx.stroke();

  // Label.
  const src = sources.find((s) => s.id === clip.sourceId);
  const label = src?.name ?? src?.url.split("/").pop() ?? clip.id;
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(label, startX + 9, y + 5);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, startX + 8, y + 4);

  // Selection ring (skip when dimmed — selection has no meaning on a
  // ghost source clip; the ghost itself draws its own ring if you add
  // one later).
  if (!dim && state.selectedClipId === clip.id) {
    ctx.strokeStyle = style.selectedRing;
    ctx.lineWidth = 2;
    roundRect(ctx, startX - 1, y - 1, widthPx + 2, h + 2, 7);
    ctx.stroke();
  }

  // Edge handles on hover or selection.
  const showHandles =
    !dim && (state.selectedClipId === clip.id || state.hoveredClipId === clip.id);
  if (showHandles) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(startX + 2, y + 12, 2, h - 24);
    ctx.fillRect(startX + widthPx - 4, y + 12, 2, h - 24);
  }
  ctx.restore();
}

// ---- headers --------------------------------------------------------------

function drawHeaders(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
): void {
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, HEADER_WIDTH, state.viewportHeight);

  // Right border separating headers from scrollable area.
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(HEADER_WIDTH - 0.5, 0);
  ctx.lineTo(HEADER_WIDTH - 0.5, state.viewportHeight);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  for (let i = 0; i < state.project.tracks.length; i++) {
    const t = state.project.tracks[i]!;
    const y = trackY(i);
    // Track row separator.
    ctx.strokeStyle = style.border;
    ctx.beginPath();
    ctx.moveTo(0, y + TRACK_HEIGHT - 0.5);
    ctx.lineTo(HEADER_WIDTH, y + TRACK_HEIGHT - 0.5);
    ctx.stroke();

    ctx.fillStyle = withAlpha(style.text, 0.7);
    const label = t.kind === "video" ? `视频 ${i + 1}` : `音频 ${i + 1}`;
    ctx.fillText(label, 12, y + TRACK_HEIGHT / 2);

    // Delete-track button — × icon at the right edge. Only painted
    // for empty tracks (hit-test agrees) so a busy row's UI doesn't
    // dangle a destructive button next to actual content.
    if (t.clips.length === 0) {
      const hovered = state.hoveredTrackIndex === i;
      const btnSize = 18;
      const btnLeft = HEADER_WIDTH - btnSize - 6;
      const btnTop = y + (TRACK_HEIGHT - btnSize) / 2;
      ctx.save();
      if (hovered) {
        ctx.fillStyle = withAlpha(style.text, 0.1);
        roundRect(ctx, btnLeft, btnTop, btnSize, btnSize, 5);
        ctx.fill();
      }
      ctx.strokeStyle = withAlpha(style.text, hovered ? 0.85 : 0.4);
      ctx.lineWidth = 1.4;
      const pad = 5;
      ctx.beginPath();
      ctx.moveTo(btnLeft + pad, btnTop + pad);
      ctx.lineTo(btnLeft + btnSize - pad, btnTop + btnSize - pad);
      ctx.moveTo(btnLeft + btnSize - pad, btnTop + pad);
      ctx.lineTo(btnLeft + pad, btnTop + btnSize - pad);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---- playhead -------------------------------------------------------------

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
): void {
  const baseX = state.showHeader ? HEADER_WIDTH : 0;
  const x = baseX + (state.timeMs / 1000) * state.pxPerSec - state.scrollLeft;
  if (x < baseX - 2 || x > state.viewportWidth + 2) return;

  // Vertical line through ruler + tracks.
  ctx.strokeStyle = style.playhead;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, state.viewportHeight);
  ctx.stroke();

  // Time bubble centered on the playhead at the top of the ruler.
  const label = fmtClockMs(state.timeMs);
  ctx.font = "10px system-ui, -apple-system, sans-serif";
  const padX = 6;
  const w = ctx.measureText(label).width + padX * 2;
  const h = 14;
  const bx = x - w / 2;
  const by = 2;
  ctx.fillStyle = style.playhead;
  roundRect(ctx, bx, by, w, h, 4);
  ctx.fill();
  // Triangle hanging below the bubble.
  ctx.beginPath();
  ctx.moveTo(x - 4, by + h);
  ctx.lineTo(x + 4, by + h);
  ctx.lineTo(x, by + h + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + padX, by + h / 2);
}

// ---- snap guide -----------------------------------------------------------

function drawSnapGuide(
  ctx: CanvasRenderingContext2D,
  state: DrawState,
  style: DrawStyle,
): void {
  if (state.snapX == null) return;
  ctx.strokeStyle = style.info;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(state.snapX + 0.5, 0);
  ctx.lineTo(state.snapX + 0.5, state.viewportHeight);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---- utilities ------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** color-mix substitute that works directly on hex/rgba strings via
 * canvas — quick & dirty: parse-or-pass-through. For named css colors
 * we fall back to the original. Good enough for our palette. */
function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * (1 - t));
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * (1 - t));
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * (1 - t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function parseColor(s: string): [number, number, number] | null {
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0]! + hex[0]!, 16),
        parseInt(hex[1]! + hex[1]!, 16),
        parseInt(hex[2]! + hex[2]!, 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
