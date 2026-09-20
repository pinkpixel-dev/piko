import { describe, expect, it } from "vitest";
import {
  addNote,
  allNoteIds,
  deleteNotes,
  moveNotes,
  quantizeNotes,
  resizeNotes,
  setNoteVelocity,
  setTrackProperties,
  toggleSolo,
} from "../edits";
import type { Note, ProjectDoc, Track } from "../../midi/types";

const PPQ = 480;

function note(id: string, pitch: number, ticks: number, durationTicks = PPQ): Note {
  return { id, pitch, ticks, durationTicks, velocity: 100 };
}

function track(id: string, notes: Note[], overrides: Partial<Track> = {}): Track {
  return {
    id,
    name: id,
    channel: 0,
    program: 0,
    isDrum: false,
    colorIndex: 0,
    notes,
    muted: false,
    soloed: false,
    volume: 1,
    visible: true,
    ...overrides,
  };
}

function doc(): ProjectDoc {
  return {
    name: "Test",
    ppq: PPQ,
    tempos: [{ ticks: 0, bpm: 120 }],
    timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
    tracks: [
      track("t1", [note("a", 60, 0), note("b", 64, PPQ)]),
      track("t2", [note("c", 48, 0)]),
    ],
  };
}

describe("structural sharing", () => {
  it("leaves untouched tracks as the same reference", () => {
    const before = doc();
    const after = moveNotes(before, new Set(["a"]), { deltaTicks: PPQ, deltaPitch: 0 });
    // This is what keeps undo snapshots cheap, so it is worth asserting.
    expect(after.tracks[1]).toBe(before.tracks[1]);
    expect(after.tracks[0]).not.toBe(before.tracks[0]);
  });

  it("returns the original document when nothing changes", () => {
    const before = doc();
    expect(moveNotes(before, new Set(["a"]), { deltaTicks: 0, deltaPitch: 0 })).toBe(before);
    expect(deleteNotes(before, new Set())).toBe(before);
  });

  it("never mutates the input document", () => {
    const before = doc();
    const snapshot = JSON.stringify(before);
    moveNotes(before, new Set(["a"]), { deltaTicks: 99, deltaPitch: 3 });
    deleteNotes(before, new Set(["a"]));
    resizeNotes(before, new Set(["a"]), 50, "end");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("moveNotes", () => {
  it("shifts position and pitch together", () => {
    const after = moveNotes(doc(), new Set(["a"]), { deltaTicks: PPQ, deltaPitch: 2 });
    expect(after.tracks[0].notes.find((n) => n.id === "a")).toMatchObject({
      ticks: PPQ,
      pitch: 62,
    });
  });

  it("moves notes across separate tracks at once", () => {
    const after = moveNotes(doc(), new Set(["a", "c"]), { deltaTicks: PPQ, deltaPitch: 0 });
    expect(after.tracks[0].notes.find((n) => n.id === "a")!.ticks).toBe(PPQ);
    expect(after.tracks[1].notes.find((n) => n.id === "c")!.ticks).toBe(PPQ);
  });

  it("stops notes being dragged before the start of the song", () => {
    const after = moveNotes(doc(), new Set(["a"]), { deltaTicks: -PPQ * 4, deltaPitch: 0 });
    expect(after.tracks[0].notes.find((n) => n.id === "a")!.ticks).toBe(0);
  });

  it("clamps pitch to the MIDI range", () => {
    const high = moveNotes(doc(), new Set(["a"]), { deltaTicks: 0, deltaPitch: 200 });
    const low = moveNotes(doc(), new Set(["a"]), { deltaTicks: 0, deltaPitch: -200 });
    expect(high.tracks[0].notes.find((n) => n.id === "a")!.pitch).toBe(127);
    expect(low.tracks[0].notes.find((n) => n.id === "a")!.pitch).toBe(0);
  });

  it("keeps notes sorted by position after a move", () => {
    const after = moveNotes(doc(), new Set(["a"]), { deltaTicks: PPQ * 3, deltaPitch: 0 });
    const positions = after.tracks[0].notes.map((n) => n.ticks);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });
});

describe("resizeNotes", () => {
  it("changes length when dragging the right edge", () => {
    const after = resizeNotes(doc(), new Set(["a"]), PPQ, "end");
    expect(after.tracks[0].notes.find((n) => n.id === "a")).toMatchObject({
      ticks: 0,
      durationTicks: PPQ * 2,
    });
  });

  it("moves the start while holding the end when dragging the left edge", () => {
    const after = resizeNotes(doc(), new Set(["b"]), PPQ / 2, "start");
    const resized = after.tracks[0].notes.find((n) => n.id === "b")!;
    expect(resized.ticks).toBe(PPQ * 1.5);
    expect(resized.ticks + resized.durationTicks).toBe(PPQ * 2);
  });

  it("never lets a note shrink to nothing", () => {
    const fromEnd = resizeNotes(doc(), new Set(["a"]), -PPQ * 10, "end");
    expect(fromEnd.tracks[0].notes.find((n) => n.id === "a")!.durationTicks).toBe(1);

    const fromStart = resizeNotes(doc(), new Set(["a"]), PPQ * 10, "start");
    expect(fromStart.tracks[0].notes.find((n) => n.id === "a")!.durationTicks).toBe(1);
  });

  it("does not drag a start before the song", () => {
    const after = resizeNotes(doc(), new Set(["a"]), -PPQ, "start");
    expect(after.tracks[0].notes.find((n) => n.id === "a")!.ticks).toBe(0);
  });
});

describe("addNote and deleteNotes", () => {
  it("adds a note with a fresh id and keeps the track sorted", () => {
    const { doc: after, id } = addNote(doc(), "t1", {
      pitch: 67,
      ticks: PPQ / 2,
      durationTicks: PPQ,
      velocity: 90,
    });
    const notes = after.tracks[0].notes;
    expect(notes.map((n) => n.id)).toContain(id);
    expect(notes.map((n) => n.ticks)).toEqual([0, PPQ / 2, PPQ]);
  });

  it("refuses to create a zero-length note", () => {
    const { doc: after, id } = addNote(doc(), "t1", {
      pitch: 67,
      ticks: 0,
      durationTicks: 0,
      velocity: 90,
    });
    expect(after.tracks[0].notes.find((n) => n.id === id)!.durationTicks).toBe(1);
  });

  it("deletes across tracks and leaves the rest alone", () => {
    const after = deleteNotes(doc(), new Set(["a", "c"]));
    expect(after.tracks[0].notes.map((n) => n.id)).toEqual(["b"]);
    expect(after.tracks[1].notes).toHaveLength(0);
  });
});

describe("setNoteVelocity", () => {
  it("applies one value to every selected note", () => {
    const after = setNoteVelocity(doc(), new Set(["a", "c"]), 42);
    expect(after.tracks[0].notes.find((n) => n.id === "a")!.velocity).toBe(42);
    expect(after.tracks[1].notes.find((n) => n.id === "c")!.velocity).toBe(42);
  });

  it("clamps to the audible MIDI velocity range", () => {
    expect(
      setNoteVelocity(doc(), new Set(["a"]), 0).tracks[0].notes.find((n) => n.id === "a")!.velocity,
    ).toBe(1);
    expect(
      setNoteVelocity(doc(), new Set(["a"]), 999).tracks[0].notes.find((n) => n.id === "a")!
        .velocity,
    ).toBe(127);
  });
});

describe("quantizeNotes", () => {
  it("snaps starts to the nearest grid line", () => {
    const source: ProjectDoc = {
      ...doc(),
      tracks: [track("t1", [note("a", 60, 130), note("b", 62, 355)])],
    };
    const after = quantizeNotes(source, new Set(["a", "b"]), PPQ / 4);
    // The grid is 120 ticks, so 130 snaps back to 120 and 355 up to 360.
    expect(after.tracks[0].notes.map((n) => n.ticks)).toEqual([120, 360]);
  });

  it("leaves lengths alone", () => {
    const source: ProjectDoc = { ...doc(), tracks: [track("t1", [note("a", 60, 130, 333)])] };
    const after = quantizeNotes(source, new Set(["a"]), PPQ / 4);
    expect(after.tracks[0].notes[0].durationTicks).toBe(333);
  });

  it("ignores a grid of zero rather than dividing by it", () => {
    const before = doc();
    expect(quantizeNotes(before, new Set(["a"]), 0)).toBe(before);
  });
});

describe("toggleSolo", () => {
  it("clears other solos by default", () => {
    const first = toggleSolo(doc(), "t1", false);
    const second = toggleSolo(first, "t2", false);
    expect(second.tracks[0].soloed).toBe(false);
    expect(second.tracks[1].soloed).toBe(true);
  });

  it("adds to the solo set when additive", () => {
    const first = toggleSolo(doc(), "t1", false);
    const second = toggleSolo(first, "t2", true);
    expect(second.tracks[0].soloed).toBe(true);
    expect(second.tracks[1].soloed).toBe(true);
  });

  it("turns its own solo back off", () => {
    const on = toggleSolo(doc(), "t1", false);
    expect(toggleSolo(on, "t1", false).tracks[0].soloed).toBe(false);
  });
});

describe("setTrackProperties and allNoteIds", () => {
  it("patches only the named track", () => {
    const after = setTrackProperties(doc(), "t2", { program: 42, muted: true });
    expect(after.tracks[1]).toMatchObject({ program: 42, muted: true });
    expect(after.tracks[0]).toBe(doc().tracks[0].id === "t1" ? after.tracks[0] : after.tracks[0]);
    expect(after.tracks[0].program).toBe(0);
  });

  it("collects note ids from visible tracks only", () => {
    const hidden = setTrackProperties(doc(), "t2", { visible: false });
    expect(allNoteIds(hidden)).toEqual(new Set(["a", "b"]));
  });
});
