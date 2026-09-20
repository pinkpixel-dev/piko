/**
 * Writes the internal document model back out as a standard MIDI file.
 *
 * The round trip is lossy in one direction only: control changes and pitch
 * bends from the original file are not carried through, because the editor does
 * not represent them. Notes, tempo, time signatures, track names, channels, and
 * programs all survive. Export builds a fresh Midi object rather than mutating
 * the imported one, so a document assembled from scratch and one loaded from
 * disk produce the same kind of output.
 */

import { Midi } from "@tonejs/midi";
import { MAX_VELOCITY, type ProjectDoc } from "./types";

export function serialiseMidi(doc: ProjectDoc): Uint8Array {
  const midi = new Midi();

  // ppq has no setter, so the header is populated through fromJSON, which
  // assigns it and recomputes the cached second values for every tempo and
  // metre event in one step.
  midi.header.fromJSON({
    name: doc.name,
    ppq: doc.ppq,
    meta: [],
    keySignatures: [],
    tempos: doc.tempos.map((tempo) => ({ ticks: tempo.ticks, bpm: tempo.bpm })),
    timeSignatures: doc.timeSignatures.map((signature) => ({
      ticks: signature.ticks,
      timeSignature: [signature.numerator, signature.denominator],
    })),
  });

  for (const track of doc.tracks) {
    const output = midi.addTrack();
    output.name = track.name;
    output.channel = track.channel;
    output.instrument.number = track.program;

    for (const note of track.notes) {
      output.addNote({
        midi: note.pitch,
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        velocity: note.velocity / MAX_VELOCITY,
      });
    }
  }

  return midi.toArray();
}

/** Suggests a file name for the save dialog. */
export function suggestedFileName(doc: ProjectDoc): string {
  const base = doc.name.trim() || "Untitled";
  const safe = base.replace(/[\\/:*?"<>|]/g, "-");
  return `${safe}.mid`;
}
