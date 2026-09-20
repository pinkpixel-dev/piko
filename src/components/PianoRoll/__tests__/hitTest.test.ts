import { describe, expect, it } from "vitest";
import type { Note, Track } from "../../../midi/types";
import type { RollGeometry } from "../geometry";
import { hitTestNote, notesInRect } from "../hitTest";

const PPQ = 480;

const geometry: RollGeometry = {
  scrollTicks: 0,
  topPitch: 84,
  // 0.1px per tick means a quarter note is 48px wide, comfortably wider than
  // the 6px edge grab zones.
  pixelsPerTick: 0.1,
  rowHeight: 12,
  width: 800,
  height: 600,
};

function note(id: string, pitch: number, ticks: number, durationTicks = PPQ): Note {
  return { id, pitch, ticks, durationTicks, velocity: 100 };
}

function track(id: string, notes: Note[], visible = true): Track {
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
    visible,
  };
}

const options = {
  geometry,
  tracks: [track("t1", [note("a", 84, 0), note("b", 83, PPQ)])],
  activeTrackId: null,
  isCoarsePointer: false,
};

describe("hitTestNote", () => {
  it("finds a note under the pointer", () => {
    const hit = hitTestNote(options, 24, 6);
    expect(hit?.note.id).toBe("a");
    expect(hit?.zone).toBe("body");
  });

  it("returns null on empty space", () => {
    expect(hitTestNote(options, 300, 6)).toBeNull();
    expect(hitTestNote(options, 24, 200)).toBeNull();
  });

  it("reports the start and end grab zones", () => {
    expect(hitTestNote(options, 1, 6)?.zone).toBe("start");
    expect(hitTestNote(options, 47, 6)?.zone).toBe("end");
  });

  it("gives a coarse pointer a wider grab zone", () => {
    const fine = hitTestNote(options, 9, 6);
    const coarse = hitTestNote({ ...options, isCoarsePointer: true }, 9, 6);
    expect(fine?.zone).toBe("body");
    expect(coarse?.zone).toBe("start");
  });

  it("treats a short note as all body so it cannot be resized away", () => {
    const short = {
      ...options,
      tracks: [track("t1", [note("s", 84, 0, 60)])],
    };
    expect(hitTestNote(short, 1, 6)?.zone).toBe("body");
    expect(hitTestNote(short, 5, 6)?.zone).toBe("body");
  });

  it("ignores hidden tracks", () => {
    const hidden = { ...options, tracks: [track("t1", [note("a", 84, 0)], false)] };
    expect(hitTestNote(hidden, 24, 6)).toBeNull();
  });

  it("prefers the active track when notes overlap", () => {
    const overlapping = {
      ...options,
      tracks: [track("t1", [note("a", 84, 0)]), track("t2", [note("b", 84, 0)])],
      activeTrackId: "t1",
    };
    expect(hitTestNote(overlapping, 24, 6)?.note.id).toBe("a");
    expect(hitTestNote({ ...overlapping, activeTrackId: "t2" }, 24, 6)?.note.id).toBe("b");
  });

  it("finds notes after the view is scrolled", () => {
    const scrolled = { ...options, geometry: { ...geometry, scrollTicks: PPQ } };
    // Note b starts at one quarter in, which is now the left edge.
    expect(hitTestNote(scrolled, 4, 18)?.note.id).toBe("b");
  });
});

describe("notesInRect", () => {
  const tracks = [track("t1", [note("a", 84, 0), note("b", 83, PPQ)])];

  it("collects notes the rectangle touches", () => {
    const found = notesInRect(geometry, tracks, { x: 0, y: 0, width: 100, height: 30 }, null);
    expect(found).toEqual(new Set(["a", "b"]));
  });

  it("leaves out notes the rectangle misses", () => {
    const found = notesInRect(geometry, tracks, { x: 0, y: 0, width: 40, height: 10 }, null);
    expect(found).toEqual(new Set(["a"]));
  });

  it("can be restricted to one track", () => {
    const two = [track("t1", [note("a", 84, 0)]), track("t2", [note("c", 84, 0)])];
    const found = notesInRect(geometry, two, { x: 0, y: 0, width: 100, height: 30 }, "t2");
    expect(found).toEqual(new Set(["c"]));
  });

  it("skips hidden tracks", () => {
    const hidden = [track("t1", [note("a", 84, 0)], false)];
    expect(notesInRect(geometry, hidden, { x: 0, y: 0, width: 800, height: 600 }, null).size).toBe(0);
  });
});
