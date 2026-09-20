/**
 * The internal document model.
 *
 * Time is stored in MIDI ticks, not seconds. Ticks are integers and are
 * independent of tempo, so edits, quantising, and tempo changes never
 * accumulate rounding error. Seconds are derived on demand through the
 * TempoMap in `timing.ts`.
 */

/** Stable identity for a note, so selection survives edits and re-sorts. */
export type NoteId = string;
export type TrackId = string;

export interface Note {
  id: NoteId;
  /** MIDI note number, 0-127. 60 is middle C. */
  pitch: number;
  /** Start position in ticks from the beginning of the song. */
  ticks: number;
  /** Length in ticks. Always at least 1. */
  durationTicks: number;
  /** MIDI velocity, 1-127. */
  velocity: number;
}

export interface Track {
  id: TrackId;
  name: string;
  /** MIDI channel, 0-15. Channel 9 is the percussion channel. */
  channel: number;
  /** General MIDI program number, 0-127. */
  program: number;
  /** True when this track plays a drum kit rather than a pitched instrument. */
  isDrum: boolean;
  /** Index into the eight-colour track palette. */
  colorIndex: number;
  notes: Note[];
  muted: boolean;
  soloed: boolean;
  /** Track gain, 0-1, applied on top of note velocity. */
  volume: number;
  /** Hidden tracks are excluded from the piano roll but still play. */
  visible: boolean;
}

export interface TempoEvent {
  ticks: number;
  bpm: number;
}

export interface TimeSignatureEvent {
  ticks: number;
  numerator: number;
  denominator: number;
}

export interface ProjectDoc {
  /** Song name taken from the file, used for the window title. */
  name: string;
  /** Ticks per quarter note. The resolution of every tick value in the doc. */
  ppq: number;
  tempos: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  tracks: Track[];
}

export const DEFAULT_PPQ = 480;
export const DEFAULT_BPM = 120;
export const DRUM_CHANNEL = 9;
export const TRACK_COLOR_COUNT = 8;
export const MIN_PITCH = 0;
export const MAX_PITCH = 127;
export const MIN_VELOCITY = 1;
export const MAX_VELOCITY = 127;

/** An empty document, used on first launch and for File > New. */
export function createEmptyProject(): ProjectDoc {
  return {
    name: "Untitled",
    ppq: DEFAULT_PPQ,
    tempos: [{ ticks: 0, bpm: DEFAULT_BPM }],
    timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
    tracks: [],
  };
}

/** Longest end position across every track, in ticks. */
export function projectDurationTicks(doc: ProjectDoc): number {
  let end = 0;
  for (const track of doc.tracks) {
    for (const note of track.notes) {
      const noteEnd = note.ticks + note.durationTicks;
      if (noteEnd > end) end = noteEnd;
    }
  }
  return end;
}

/**
 * Tracks that should actually sound. Any soloed track silences the rest, which
 * is the behaviour every DAW uses and what people expect from a solo button.
 */
export function audibleTrackIds(doc: ProjectDoc): Set<TrackId> {
  const soloed = doc.tracks.filter((track) => track.soloed);
  const candidates = soloed.length > 0 ? soloed : doc.tracks;
  return new Set(candidates.filter((track) => !track.muted).map((track) => track.id));
}

/** Lowest and highest pitch used anywhere in the document, or null if empty. */
export function pitchRange(doc: ProjectDoc): { low: number; high: number } | null {
  let low = MAX_PITCH;
  let high = MIN_PITCH;
  let found = false;

  for (const track of doc.tracks) {
    for (const note of track.notes) {
      if (note.pitch < low) low = note.pitch;
      if (note.pitch > high) high = note.pitch;
      found = true;
    }
  }

  return found ? { low, high } : null;
}
