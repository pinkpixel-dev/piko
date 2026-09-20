/**
 * Reads a MIDI file into the internal document model.
 *
 * One deliberate difference from the file format: a MIDI file can spread one
 * instrument across several tracks, or put several instruments on one track via
 * program changes. We keep the file's track layout as-is, because that is what
 * the person who made the file intended and what they will expect to see in the
 * track list. Tracks with no notes are dropped, since they only carry metadata
 * we have already read from the header.
 */

import { Midi } from "@tonejs/midi";
import { nextId } from "../lib/ids";
import {
  DEFAULT_BPM,
  DEFAULT_PPQ,
  DRUM_CHANNEL,
  MAX_VELOCITY,
  MIN_VELOCITY,
  TRACK_COLOR_COUNT,
  type Note,
  type ProjectDoc,
  type Track,
} from "./types";

export class MidiImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MidiImportError";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Velocity arrives as 0-1 from the parser but is stored as MIDI 1-127. */
function toMidiVelocity(normalised: number): number {
  return clamp(Math.round(normalised * MAX_VELOCITY), MIN_VELOCITY, MAX_VELOCITY);
}

function fallbackTrackName(index: number, isDrum: boolean): string {
  if (isDrum) return "Drums";
  return `Track ${index + 1}`;
}

export function parseMidi(data: ArrayBuffer | Uint8Array, fileName?: string): ProjectDoc {
  let midi: Midi;
  try {
    midi = new Midi(data instanceof Uint8Array ? data : new Uint8Array(data));
  } catch (cause) {
    throw new MidiImportError(
      "That file could not be read as MIDI. It may be corrupt or in a different format.",
      { cause },
    );
  }

  const ppq = midi.header.ppq > 0 ? midi.header.ppq : DEFAULT_PPQ;

  const tempos = midi.header.tempos
    .filter((tempo) => Number.isFinite(tempo.bpm) && tempo.bpm > 0)
    .map((tempo) => ({ ticks: Math.max(0, Math.round(tempo.ticks)), bpm: tempo.bpm }))
    .sort((a, b) => a.ticks - b.ticks);

  if (tempos.length === 0 || tempos[0].ticks > 0) {
    tempos.unshift({ ticks: 0, bpm: tempos[0]?.bpm ?? DEFAULT_BPM });
  }

  const timeSignatures = midi.header.timeSignatures
    .filter((signature) => signature.timeSignature?.length === 2)
    .map((signature) => ({
      ticks: Math.max(0, Math.round(signature.ticks)),
      numerator: signature.timeSignature[0],
      denominator: signature.timeSignature[1],
    }))
    .filter((signature) => signature.numerator > 0 && signature.denominator > 0)
    .sort((a, b) => a.ticks - b.ticks);

  if (timeSignatures.length === 0 || timeSignatures[0].ticks > 0) {
    timeSignatures.unshift({ ticks: 0, numerator: 4, denominator: 4 });
  }

  const tracks: Track[] = [];

  for (const source of midi.tracks) {
    if (source.notes.length === 0) continue;

    const channel = clamp(source.channel ?? 0, 0, 15);
    const isDrum = channel === DRUM_CHANNEL || source.instrument?.percussion === true;

    const notes: Note[] = source.notes.map((note) => ({
      id: nextId("n"),
      pitch: clamp(Math.round(note.midi), 0, 127),
      ticks: Math.max(0, Math.round(note.ticks)),
      // A zero-length note would be invisible and inaudible, so give it the
      // shortest length the resolution allows rather than dropping it.
      durationTicks: Math.max(1, Math.round(note.durationTicks)),
      velocity: toMidiVelocity(note.velocity),
    }));

    notes.sort((a, b) => a.ticks - b.ticks || a.pitch - b.pitch);

    const name = source.name?.trim() || fallbackTrackName(tracks.length, isDrum);

    tracks.push({
      id: nextId("t"),
      name,
      channel,
      program: clamp(source.instrument?.number ?? 0, 0, 127),
      isDrum,
      colorIndex: tracks.length % TRACK_COLOR_COUNT,
      notes,
      muted: false,
      soloed: false,
      volume: 1,
      visible: true,
    });
  }

  if (tracks.length === 0) {
    throw new MidiImportError("That MIDI file has no notes in it.");
  }

  const headerName = midi.name?.trim();
  const name = headerName || stripExtension(fileName) || "Untitled";

  return { name, ppq, tempos, timeSignatures, tracks };
}

function stripExtension(fileName?: string): string {
  if (!fileName) return "";
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.(mid|midi|rmi)$/i, "");
}
