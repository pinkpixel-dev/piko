import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { serialiseMidi } from "../export";
import { MidiImportError, parseMidi } from "../import";
import { projectDurationTicks, type ProjectDoc } from "../types";

const PPQ = 480;

/** Builds real encoded MIDI bytes to import, rather than a hand-made fixture. */
function buildSourceBytes(): Uint8Array {
  const midi = new Midi();
  midi.header.fromJSON({
    name: "Round Trip",
    ppq: PPQ,
    meta: [],
    keySignatures: [],
    tempos: [
      { ticks: 0, bpm: 120 },
      { ticks: PPQ * 8, bpm: 90 },
    ],
    timeSignatures: [
      { ticks: 0, timeSignature: [4, 4] },
      { ticks: PPQ * 8, timeSignature: [3, 4] },
    ],
  });

  const lead = midi.addTrack();
  lead.name = "Lead";
  lead.channel = 0;
  lead.instrument.number = 30;
  lead.addNote({ midi: 60, ticks: 0, durationTicks: PPQ, velocity: 100 / 127 });
  lead.addNote({ midi: 64, ticks: PPQ, durationTicks: PPQ / 2, velocity: 80 / 127 });
  lead.addNote({ midi: 67, ticks: PPQ * 2, durationTicks: PPQ * 2, velocity: 127 / 127 });

  const drums = midi.addTrack();
  drums.name = "Drums";
  drums.channel = 9;
  drums.addNote({ midi: 36, ticks: 0, durationTicks: 10, velocity: 110 / 127 });
  drums.addNote({ midi: 38, ticks: PPQ, durationTicks: 10, velocity: 90 / 127 });

  return midi.toArray();
}

describe("parseMidi", () => {
  const doc = parseMidi(buildSourceBytes(), "Round Trip.mid");

  it("reads the header resolution and name", () => {
    expect(doc.ppq).toBe(PPQ);
    expect(doc.name).toBe("Round Trip");
  });

  it("reads every tempo and metre change", () => {
    expect(doc.tempos).toHaveLength(2);
    expect(doc.tempos[0].bpm).toBeCloseTo(120, 3);
    expect(doc.tempos[1].ticks).toBe(PPQ * 8);
    // A MIDI file stores tempo as whole microseconds per quarter note, so 90bpm
    // encodes as 666666us and reads back as 90.00009. Keeping the value exactly
    // as written is what makes open-then-save byte-stable; rounding happens at
    // display time instead.
    expect(doc.tempos[1].bpm).toBeCloseTo(90, 3);
    expect(doc.timeSignatures).toHaveLength(2);
    expect(doc.timeSignatures[1]).toMatchObject({ ticks: PPQ * 8, numerator: 3, denominator: 4 });
  });

  it("keeps the file's track layout and names", () => {
    expect(doc.tracks.map((track) => track.name)).toEqual(["Lead", "Drums"]);
    expect(doc.tracks[0].program).toBe(30);
  });

  it("marks channel 9 as a drum track", () => {
    expect(doc.tracks[0].isDrum).toBe(false);
    expect(doc.tracks[1].isDrum).toBe(true);
    expect(doc.tracks[1].channel).toBe(9);
  });

  it("stores velocity as MIDI 1-127 rather than normalised", () => {
    expect(doc.tracks[0].notes.map((note) => note.velocity)).toEqual([100, 80, 127]);
  });

  it("gives every note a unique id", () => {
    const ids = doc.tracks.flatMap((track) => track.notes.map((note) => note.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns each track a distinct palette slot", () => {
    expect(doc.tracks.map((track) => track.colorIndex)).toEqual([0, 1]);
  });

  it("computes the document duration from the last note end", () => {
    // The lead's final note starts at 2 quarters and lasts 2 more.
    expect(projectDurationTicks(doc)).toBe(PPQ * 4);
  });

  it("rejects a file that is not MIDI", () => {
    const notMidi = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(() => parseMidi(notMidi)).toThrow(MidiImportError);
  });

  it("rejects a MIDI file that contains no notes", () => {
    const empty = new Midi();
    empty.addTrack().name = "Empty";
    expect(() => parseMidi(empty.toArray())).toThrow(/no notes/i);
  });

  it("falls back to the file name when the header has no song name", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 100, velocity: 0.5 });
    expect(parseMidi(midi.toArray(), "/tmp/Some Song.mid").name).toBe("Some Song");
  });
});

describe("serialiseMidi", () => {
  /** Compares only what the editor claims to preserve. */
  function fingerprint(doc: ProjectDoc) {
    return {
      ppq: doc.ppq,
      tempos: doc.tempos,
      timeSignatures: doc.timeSignatures,
      tracks: doc.tracks.map((track) => ({
        name: track.name,
        channel: track.channel,
        program: track.program,
        isDrum: track.isDrum,
        notes: track.notes.map((note) => ({
          pitch: note.pitch,
          ticks: note.ticks,
          durationTicks: note.durationTicks,
          velocity: note.velocity,
        })),
      })),
    };
  }

  it("survives a full export then import with no drift", () => {
    const original = parseMidi(buildSourceBytes(), "Round Trip.mid");
    const reimported = parseMidi(serialiseMidi(original));
    expect(fingerprint(reimported)).toEqual(fingerprint(original));
  });

  it("stays stable over repeated round trips", () => {
    let doc = parseMidi(buildSourceBytes(), "Round Trip.mid");
    const first = fingerprint(doc);
    for (let pass = 0; pass < 3; pass += 1) {
      doc = parseMidi(serialiseMidi(doc));
    }
    expect(fingerprint(doc)).toEqual(first);
  });

  it("preserves edits made to the document", () => {
    const doc = parseMidi(buildSourceBytes(), "Round Trip.mid");
    doc.tracks[0].notes[0].pitch = 72;
    doc.tracks[0].notes[0].velocity = 42;
    doc.tracks[0].program = 81;

    const reimported = parseMidi(serialiseMidi(doc));
    expect(reimported.tracks[0].notes[0].pitch).toBe(72);
    expect(reimported.tracks[0].notes[0].velocity).toBe(42);
    expect(reimported.tracks[0].program).toBe(81);
  });

  it("writes bytes that a third-party parser accepts", () => {
    const doc = parseMidi(buildSourceBytes(), "Round Trip.mid");
    const foreign = new Midi(serialiseMidi(doc));
    expect(foreign.tracks.filter((track) => track.notes.length > 0)).toHaveLength(2);
    expect(foreign.header.ppq).toBe(PPQ);
  });
});
