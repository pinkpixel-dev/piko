/**
 * Maps between song coordinates (ticks, pitch) and screen coordinates.
 *
 * Every drawing and pointer routine goes through this, so the canvas, the
 * ruler, the keyboard, and hit testing can never disagree about where a note
 * sits. Pitch runs downward on screen: higher notes are nearer the top, which
 * is how a piano roll reads.
 */

import { MAX_PITCH, MIN_PITCH } from "../../midi/types";

export interface RollGeometry {
  /** Leftmost visible tick. */
  scrollTicks: number;
  /** Pitch drawn at the top edge. */
  topPitch: number;
  pixelsPerTick: number;
  rowHeight: number;
  width: number;
  height: number;
}

export function tickToX(geometry: RollGeometry, ticks: number): number {
  return (ticks - geometry.scrollTicks) * geometry.pixelsPerTick;
}

export function xToTick(geometry: RollGeometry, x: number): number {
  return geometry.scrollTicks + x / geometry.pixelsPerTick;
}

export function pitchToY(geometry: RollGeometry, pitch: number): number {
  return (geometry.topPitch - pitch) * geometry.rowHeight;
}

export function yToPitch(geometry: RollGeometry, y: number): number {
  return geometry.topPitch - Math.floor(y / geometry.rowHeight);
}

/** Last tick that can be seen, used to stop drawing past the right edge. */
export function visibleEndTick(geometry: RollGeometry): number {
  return xToTick(geometry, geometry.width);
}

/** Lowest pitch that can be seen, used to bound the row loop. */
export function visibleLowestPitch(geometry: RollGeometry): number {
  const rows = Math.ceil(geometry.height / geometry.rowHeight);
  return Math.max(MIN_PITCH, geometry.topPitch - rows);
}

export function visibleHighestPitch(geometry: RollGeometry): number {
  return Math.min(MAX_PITCH, geometry.topPitch);
}

/** Total scrollable width in pixels for a song of a given length. */
export function contentWidth(geometry: RollGeometry, durationTicks: number): number {
  return durationTicks * geometry.pixelsPerTick;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function noteRect(
  geometry: RollGeometry,
  ticks: number,
  durationTicks: number,
  pitch: number,
): Rect {
  const x = tickToX(geometry, ticks);
  // A very short note still needs to be wide enough to see and to grab.
  const width = Math.max(2, durationTicks * geometry.pixelsPerTick);
  return {
    x,
    y: pitchToY(geometry, pitch),
    width,
    height: geometry.rowHeight,
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

/** Normalises a drag rectangle so width and height are never negative. */
export function normaliseRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
