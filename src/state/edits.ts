/**
 * Pure document edit functions.
 *
 * Kept separate from the store so each one can be reasoned about and tested on
 * its own. Every function returns a new document and leaves untouched tracks as
 * the same reference, which is what keeps undo snapshots small.
 */

import { nextId } from "../lib/ids";
import {
  MAX_PITCH,
  MAX_VELOCITY,
  MIN_PITCH,
  MIN_VELOCITY,
  type Note,
  type NoteId,
  type ProjectDoc,
  type Track,
  type TrackId,
} from "../midi/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.ticks - b.ticks || a.pitch - b.pitch);
}

/** Applies a change to one track, leaving every other track untouched. */
function mapTrack(
  doc: ProjectDoc,
  trackId: TrackId,
  change: (track: Track) => Track,
): ProjectDoc {
  let changed = false;
  const tracks = doc.tracks.map((track) => {
    if (track.id !== trackId) return track;
    changed = true;
    return change(track);
  });
  return changed ? { ...doc, tracks } : doc;
}

/** Applies a change to every track holding at least one of the given notes. */
function mapTracksWithNotes(
  doc: ProjectDoc,
  ids: ReadonlySet<NoteId>,
  change: (track: Track) => Track,
): ProjectDoc {
  if (ids.size === 0) return doc;
  let changed = false;
  const tracks = doc.tracks.map((track) => {
    if (!track.notes.some((note) => ids.has(note.id))) return track;
    changed = true;
    return change(track);
  });
  return changed ? { ...doc, tracks } : doc;
}

export function setTrackProperties(
  doc: ProjectDoc,
  trackId: TrackId,
  patch: Partial<Omit<Track, "id" | "notes">>,
): ProjectDoc {
  return mapTrack(doc, trackId, (track) => ({ ...track, ...patch }));
}

/**
 * Solo is exclusive by default: clicking solo on a track clears it elsewhere.
 * Holding the modifier adds to the existing solo set, which is how multi-track
 * soloing works in a DAW.
 */
export function toggleSolo(doc: ProjectDoc, trackId: TrackId, additive: boolean): ProjectDoc {
  const target = doc.tracks.find((track) => track.id === trackId);
  if (!target) return doc;
  const nextValue = !target.soloed;

  return {
    ...doc,
    tracks: doc.tracks.map((track) => {
      if (track.id === trackId) return { ...track, soloed: nextValue };
      if (additive || !nextValue) return track;
      return track.soloed ? { ...track, soloed: false } : track;
    }),
  };
}

export function addNote(
  doc: ProjectDoc,
  trackId: TrackId,
  note: Omit<Note, "id">,
): { doc: ProjectDoc; id: NoteId } {
  const id = nextId("n");
  const created: Note = {
    id,
    pitch: clamp(Math.round(note.pitch), MIN_PITCH, MAX_PITCH),
    ticks: Math.max(0, Math.round(note.ticks)),
    durationTicks: Math.max(1, Math.round(note.durationTicks)),
    velocity: clamp(Math.round(note.velocity), MIN_VELOCITY, MAX_VELOCITY),
  };

  return {
    doc: mapTrack(doc, trackId, (track) => ({
      ...track,
      notes: sortNotes([...track.notes, created]),
    })),
    id,
  };
}

export function deleteNotes(doc: ProjectDoc, ids: ReadonlySet<NoteId>): ProjectDoc {
  return mapTracksWithNotes(doc, ids, (track) => ({
    ...track,
    notes: track.notes.filter((note) => !ids.has(note.id)),
  }));
}

export interface NoteMove {
  deltaTicks: number;
  deltaPitch: number;
}

export function moveNotes(doc: ProjectDoc, ids: ReadonlySet<NoteId>, move: NoteMove): ProjectDoc {
  if (move.deltaTicks === 0 && move.deltaPitch === 0) return doc;

  return mapTracksWithNotes(doc, ids, (track) => ({
    ...track,
    notes: sortNotes(
      track.notes.map((note) =>
        ids.has(note.id)
          ? {
              ...note,
              ticks: Math.max(0, note.ticks + move.deltaTicks),
              pitch: clamp(note.pitch + move.deltaPitch, MIN_PITCH, MAX_PITCH),
            }
          : note,
      ),
    ),
  }));
}

export type ResizeEdge = "start" | "end";

/**
 * Dragging the left edge moves the start while holding the end still; dragging
 * the right edge changes the length. Either way a note keeps at least one tick
 * of length so it cannot be resized into nothing.
 */
export function resizeNotes(
  doc: ProjectDoc,
  ids: ReadonlySet<NoteId>,
  deltaTicks: number,
  edge: ResizeEdge,
): ProjectDoc {
  if (deltaTicks === 0) return doc;

  return mapTracksWithNotes(doc, ids, (track) => ({
    ...track,
    notes: sortNotes(
      track.notes.map((note) => {
        if (!ids.has(note.id)) return note;

        if (edge === "end") {
          return { ...note, durationTicks: Math.max(1, note.durationTicks + deltaTicks) };
        }

        const end = note.ticks + note.durationTicks;
        const start = clamp(note.ticks + deltaTicks, 0, end - 1);
        return { ...note, ticks: start, durationTicks: end - start };
      }),
    ),
  }));
}

export function setNoteVelocity(
  doc: ProjectDoc,
  ids: ReadonlySet<NoteId>,
  velocity: number,
): ProjectDoc {
  const value = clamp(Math.round(velocity), MIN_VELOCITY, MAX_VELOCITY);
  return mapTracksWithNotes(doc, ids, (track) => ({
    ...track,
    notes: track.notes.map((note) => (ids.has(note.id) ? { ...note, velocity: value } : note)),
  }));
}

/** Snaps note starts to the nearest multiple of `gridTicks`. */
export function quantizeNotes(
  doc: ProjectDoc,
  ids: ReadonlySet<NoteId>,
  gridTicks: number,
): ProjectDoc {
  if (gridTicks <= 0) return doc;

  return mapTracksWithNotes(doc, ids, (track) => ({
    ...track,
    notes: sortNotes(
      track.notes.map((note) =>
        ids.has(note.id)
          ? { ...note, ticks: Math.max(0, Math.round(note.ticks / gridTicks) * gridTicks) }
          : note,
      ),
    ),
  }));
}

/** Every note id in the document, used by Select All. */
export function allNoteIds(doc: ProjectDoc): Set<NoteId> {
  const ids = new Set<NoteId>();
  for (const track of doc.tracks) {
    if (!track.visible) continue;
    for (const note of track.notes) ids.add(note.id);
  }
  return ids;
}

/** Looks up which track owns each of the given notes. */
export function trackIdForNote(doc: ProjectDoc, noteId: NoteId): TrackId | null {
  for (const track of doc.tracks) {
    if (track.notes.some((note) => note.id === noteId)) return track.id;
  }
  return null;
}
