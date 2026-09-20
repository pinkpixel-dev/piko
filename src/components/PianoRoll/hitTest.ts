/**
 * Works out what is under the pointer.
 *
 * Kept apart from rendering and from React so it can be checked directly, and
 * so mouse, pen, and touch all resolve a position the same way.
 */

import type { Note, NoteId, Track } from "../../midi/types";
import {
  noteRect,
  rectsOverlap,
  xToTick,
  yToPitch,
  type Rect,
  type RollGeometry,
} from "./geometry";

/** Grab zone at each end of a note, in pixels. */
const EDGE_GRAB_PIXELS = 6;
/** Coarse pointers need a larger grab zone than a mouse. */
const COARSE_EDGE_GRAB_PIXELS = 12;

export type NoteZone = "start" | "body" | "end";

export interface NoteHit {
  note: Note;
  track: Track;
  zone: NoteZone;
}

export interface HitTestOptions {
  geometry: RollGeometry;
  tracks: readonly Track[];
  /** Notes in this track are tested first, matching what is drawn on top. */
  activeTrackId: string | null;
  isCoarsePointer: boolean;
}

function zoneFor(x: number, rect: Rect, isCoarsePointer: boolean): NoteZone {
  const grab = isCoarsePointer ? COARSE_EDGE_GRAB_PIXELS : EDGE_GRAB_PIXELS;
  // A short note has no room for three zones, so the whole thing stays a body
  // and can only be moved, never accidentally resized to nothing.
  if (rect.width < grab * 2.5) return "body";
  if (x <= rect.x + grab) return "start";
  if (x >= rect.x + rect.width - grab) return "end";
  return "body";
}

/**
 * Finds the note under a point, or null. The active track wins ties, then later
 * tracks beat earlier ones, which matches the order they are painted in.
 */
export function hitTestNote(options: HitTestOptions, x: number, y: number): NoteHit | null {
  const { geometry, tracks, activeTrackId, isCoarsePointer } = options;
  const pitch = yToPitch(geometry, y);
  const ticks = xToTick(geometry, x);

  const order = [...tracks].filter((track) => track.visible).reverse();
  if (activeTrackId) {
    const activeIndex = order.findIndex((track) => track.id === activeTrackId);
    if (activeIndex > 0) {
      const [active] = order.splice(activeIndex, 1);
      order.unshift(active);
    }
  }

  for (const track of order) {
    for (let index = track.notes.length - 1; index >= 0; index -= 1) {
      const note = track.notes[index];
      if (note.pitch !== pitch) continue;
      // Notes are sorted by start, so once we are left of this note's start
      // every earlier note starts even further left and cannot contain x.
      if (note.ticks > ticks) continue;

      const rect = noteRect(geometry, note.ticks, note.durationTicks, note.pitch);
      if (x >= rect.x && x <= rect.x + rect.width) {
        return { note, track, zone: zoneFor(x, rect, isCoarsePointer) };
      }
    }
  }

  return null;
}

/** Every visible note whose rectangle meets the rubber-band selection. */
export function notesInRect(
  geometry: RollGeometry,
  tracks: readonly Track[],
  rect: Rect,
  restrictToTrackId: string | null,
): Set<NoteId> {
  const found = new Set<NoteId>();

  for (const track of tracks) {
    if (!track.visible) continue;
    if (restrictToTrackId && track.id !== restrictToTrackId) continue;

    for (const note of track.notes) {
      const noteBounds = noteRect(geometry, note.ticks, note.durationTicks, note.pitch);
      if (rectsOverlap(noteBounds, rect)) found.add(note.id);
    }
  }

  return found;
}
