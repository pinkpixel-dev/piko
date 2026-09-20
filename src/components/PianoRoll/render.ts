/**
 * Draws the piano roll onto a canvas.
 *
 * A canvas rather than DOM elements, because a busy song holds tens of
 * thousands of notes and that many nodes would make scrolling unusable. Only
 * the notes inside the viewport are drawn: each track's notes are sorted by
 * position, so a binary search finds where to start and the loop stops as soon
 * as it passes the right edge.
 */

import { isBlackKey } from "../../midi/gm";
import type { MeterMap } from "../../midi/timing";
import { TRACK_COLOR_COUNT, type NoteId, type Track } from "../../midi/types";
import {
  noteRect,
  pitchToY,
  tickToX,
  visibleEndTick,
  visibleLowestPitch,
  visibleHighestPitch,
  type Rect,
  type RollGeometry,
} from "./geometry";
import { getRollPalette } from "./palette";

/** A track paired with the longest note in it, used to bound the draw scan. */
export interface RenderTrack {
  track: Track;
  maxDurationTicks: number;
}

export interface NotePreview {
  deltaTicks: number;
  deltaPitch: number;
  resizeDeltaTicks: number;
  resizeEdge: "start" | "end" | null;
}

export interface RenderOptions {
  geometry: RollGeometry;
  tracks: RenderTrack[];
  meter: MeterMap;
  selection: ReadonlySet<NoteId>;
  /** Track whose notes are drawn at full strength; others are dimmed. */
  activeTrackId: string | null;
  loop: { enabled: boolean; startTicks: number; endTicks: number };
  /** Live transform applied to selected notes during a drag. */
  preview: NotePreview | null;
  /** Rubber-band rectangle in canvas pixels. */
  marquee: Rect | null;
}

/** Index of the first note at or after a tick position. */
function lowerBound(track: Track, ticks: number): number {
  let low = 0;
  let high = track.notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (track.notes[mid].ticks < ticks) low = mid + 1;
    else high = mid;
  }
  return low;
}

function drawRows(ctx: CanvasRenderingContext2D, geometry: RollGeometry): void {
  const palette = getRollPalette();
  const lowest = visibleLowestPitch(geometry);
  const highest = visibleHighestPitch(geometry);

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, geometry.width, geometry.height);

  // Shade the rows that correspond to black keys, so the octave pattern is
  // readable without needing to look across at the keyboard.
  ctx.fillStyle = palette.rowBlack;
  for (let pitch = lowest; pitch <= highest; pitch += 1) {
    if (!isBlackKey(pitch)) continue;
    ctx.fillRect(0, pitchToY(geometry, pitch), geometry.width, geometry.rowHeight);
  }

  // A brighter line at every C marks the octaves.
  ctx.fillStyle = palette.lineOctave;
  for (let pitch = lowest; pitch <= highest; pitch += 1) {
    if (pitch % 12 !== 0) continue;
    ctx.fillRect(0, pitchToY(geometry, pitch) + geometry.rowHeight - 1, geometry.width, 1);
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, geometry: RollGeometry, meter: MeterMap): void {
  const palette = getRollPalette();
  const endTick = visibleEndTick(geometry);
  const ticksPerBeat = meter.ticksPerBeatAt(geometry.scrollTicks);
  const ticksPerBar = meter.ticksPerBarAt(geometry.scrollTicks);

  // Beat lines disappear once they are closer together than a few pixels,
  // where they would read as noise rather than as a grid.
  const beatSpacing = ticksPerBeat * geometry.pixelsPerTick;
  if (beatSpacing >= 6) {
    ctx.fillStyle = palette.lineBeat;
    const firstBeat = Math.floor(geometry.scrollTicks / ticksPerBeat) * ticksPerBeat;
    for (let ticks = firstBeat; ticks <= endTick; ticks += ticksPerBeat) {
      ctx.fillRect(Math.round(tickToX(geometry, ticks)), 0, 1, geometry.height);
    }
  }

  ctx.fillStyle = palette.lineBar;
  const firstBar = Math.floor(geometry.scrollTicks / ticksPerBar) * ticksPerBar;
  for (let ticks = firstBar; ticks <= endTick; ticks += ticksPerBar) {
    ctx.fillRect(Math.round(tickToX(geometry, ticks)), 0, 1, geometry.height);
  }
}

function drawLoop(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { geometry, loop } = options;
  if (!loop.enabled || loop.endTicks <= loop.startTicks) return;

  const palette = getRollPalette();
  const start = tickToX(geometry, loop.startTicks);
  const end = tickToX(geometry, loop.endTicks);

  ctx.fillStyle = palette.loopRegion;
  ctx.fillRect(start, 0, end - start, geometry.height);
  ctx.fillStyle = palette.loopEdge;
  ctx.fillRect(Math.round(start), 0, 1, geometry.height);
  ctx.fillRect(Math.round(end) - 1, 0, 1, geometry.height);
}

function drawNotes(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { geometry, tracks, selection, preview, activeTrackId } = options;
  const palette = getRollPalette();
  const endTick = visibleEndTick(geometry);
  const lowest = visibleLowestPitch(geometry);
  const highest = visibleHighestPitch(geometry);
  const radius = geometry.rowHeight >= 10 ? 2 : 0;

  for (const { track, maxDurationTicks } of tracks) {
    if (!track.visible) continue;

    const colour = palette.trackColors[track.colorIndex % TRACK_COLOR_COUNT];
    // A note can start to the left of the viewport and still reach into it, so
    // the scan begins a full note-length before the left edge.
    const scanFrom = geometry.scrollTicks - maxDurationTicks;
    const dimmed = activeTrackId !== null && track.id !== activeTrackId;

    ctx.globalAlpha = dimmed ? 0.45 : 1;

    for (let index = lowerBound(track, scanFrom); index < track.notes.length; index += 1) {
      const note = track.notes[index];
      if (note.ticks > endTick) break;

      const isSelected = selection.has(note.id);
      let ticks = note.ticks;
      let duration = note.durationTicks;
      let pitch = note.pitch;

      if (isSelected && preview) {
        ticks += preview.deltaTicks;
        pitch += preview.deltaPitch;
        if (preview.resizeEdge === "end") {
          duration = Math.max(1, duration + preview.resizeDeltaTicks);
        } else if (preview.resizeEdge === "start") {
          const end = ticks + duration;
          ticks = Math.min(end - 1, ticks + preview.resizeDeltaTicks);
          duration = end - ticks;
        }
      }

      if (pitch < lowest || pitch > highest) continue;
      if (ticks + duration < geometry.scrollTicks) continue;

      const rect = noteRect(geometry, ticks, duration, pitch);
      // Velocity drives opacity, so a quiet passage reads as quieter on sight.
      // The floor is kept high so the track colours stay vivid: dropping much
      // below this turns every mid-velocity note into a muddy grey-brown.
      ctx.globalAlpha = (dimmed ? 0.45 : 1) * (0.62 + (note.velocity / 127) * 0.38);
      ctx.fillStyle = colour;

      const height = Math.max(1, rect.height - 1);
      if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.width, height, radius);
        ctx.fill();
      } else {
        ctx.fillRect(rect.x, rect.y, rect.width, height);
      }

      if (isSelected) {
        // Selection is an outline, not a colour change, so it stays legible
        // whichever track colour the note already has.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette.noteOutline;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rect.x + 0.75, rect.y + 0.75, rect.width - 1.5, height - 1.5);
      }
    }
  }

  ctx.globalAlpha = 1;
}

function drawMarquee(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  if (!options.marquee) return;
  const palette = getRollPalette();
  const { x, y, width, height } = options.marquee;

  ctx.fillStyle = palette.selectionFill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = palette.selection;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

/** Paints one frame. Called from a requestAnimationFrame loop. */
export function renderRoll(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  drawRows(ctx, options.geometry);
  drawGrid(ctx, options.geometry, options.meter);
  drawLoop(ctx, options);
  drawNotes(ctx, options);
  drawMarquee(ctx, options);
}
