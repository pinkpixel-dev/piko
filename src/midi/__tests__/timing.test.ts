import { describe, expect, it } from "vitest";
import { MeterMap, TempoMap } from "../timing";

const PPQ = 480;

describe("TempoMap", () => {
  it("converts ticks to seconds at a constant tempo", () => {
    const map = new TempoMap([{ ticks: 0, bpm: 120 }], PPQ);
    // At 120 bpm a quarter note is 0.5s, so one PPQ of ticks is 0.5s.
    expect(map.ticksToSeconds(0)).toBe(0);
    expect(map.ticksToSeconds(PPQ)).toBeCloseTo(0.5, 10);
    expect(map.ticksToSeconds(PPQ * 4)).toBeCloseTo(2, 10);
  });

  it("accumulates time across a tempo change", () => {
    const map = new TempoMap(
      [
        { ticks: 0, bpm: 120 },
        { ticks: PPQ * 4, bpm: 60 },
      ],
      PPQ,
    );
    // Four quarters at 120bpm is 2s. Then four quarters at 60bpm is 4s.
    expect(map.ticksToSeconds(PPQ * 4)).toBeCloseTo(2, 10);
    expect(map.ticksToSeconds(PPQ * 8)).toBeCloseTo(6, 10);
  });

  it("round-trips ticks through seconds across a tempo change", () => {
    const map = new TempoMap(
      [
        { ticks: 0, bpm: 90 },
        { ticks: PPQ * 3, bpm: 144 },
        { ticks: PPQ * 11, bpm: 72 },
      ],
      PPQ,
    );
    for (const ticks of [0, 1, 239, PPQ, PPQ * 3, PPQ * 7, PPQ * 11, PPQ * 40]) {
      expect(map.secondsToTicks(map.ticksToSeconds(ticks))).toBeCloseTo(ticks, 6);
    }
  });

  it("supplies a tempo from tick zero when the file's first event is late", () => {
    const map = new TempoMap([{ ticks: PPQ * 8, bpm: 100 }], PPQ);
    // The leading region must still have a duration rather than collapsing to 0.
    expect(map.ticksToSeconds(PPQ)).toBeGreaterThan(0);
    expect(map.bpmAt(0)).toBe(100);
  });

  it("falls back to a default tempo when the file has none", () => {
    const map = new TempoMap([], PPQ);
    expect(map.bpmAt(0)).toBe(120);
    expect(map.ticksToSeconds(PPQ)).toBeCloseTo(0.5, 10);
  });

  it("reports the tempo in effect at a tick", () => {
    const map = new TempoMap(
      [
        { ticks: 0, bpm: 120 },
        { ticks: PPQ * 4, bpm: 60 },
      ],
      PPQ,
    );
    expect(map.bpmAt(0)).toBe(120);
    expect(map.bpmAt(PPQ * 4 - 1)).toBe(120);
    expect(map.bpmAt(PPQ * 4)).toBe(60);
    expect(map.bpmAt(PPQ * 99)).toBe(60);
  });
});

describe("MeterMap", () => {
  it("numbers bars and beats from one in common time", () => {
    const map = new MeterMap([{ ticks: 0, numerator: 4, denominator: 4 }], PPQ);
    expect(map.positionAt(0)).toMatchObject({ bar: 1, beat: 1 });
    expect(map.positionAt(PPQ)).toMatchObject({ bar: 1, beat: 2 });
    expect(map.positionAt(PPQ * 4)).toMatchObject({ bar: 2, beat: 1 });
    expect(map.positionAt(PPQ * 9)).toMatchObject({ bar: 3, beat: 2 });
  });

  it("reports the fractional position inside a beat", () => {
    const map = new MeterMap([{ ticks: 0, numerator: 4, denominator: 4 }], PPQ);
    expect(map.positionAt(PPQ / 2).fraction).toBeCloseTo(0.5, 10);
  });

  it("scales the beat length with the denominator", () => {
    const map = new MeterMap([{ ticks: 0, numerator: 6, denominator: 8 }], PPQ);
    // In 6/8 the beat is an eighth note, so half a quarter note.
    expect(map.ticksPerBeatAt(0)).toBe(PPQ / 2);
    expect(map.ticksPerBarAt(0)).toBe(PPQ * 3);
    expect(map.positionAt(PPQ * 3)).toMatchObject({ bar: 2, beat: 1 });
  });

  it("keeps bar numbering correct across a metre change", () => {
    const map = new MeterMap(
      [
        { ticks: 0, numerator: 4, denominator: 4 },
        { ticks: PPQ * 8, numerator: 3, denominator: 4 },
      ],
      PPQ,
    );
    // Two bars of 4/4 fill ticks 0 to 8*PPQ, so the change starts bar 3.
    expect(map.positionAt(PPQ * 8)).toMatchObject({ bar: 3, beat: 1 });
    // Bars are three quarters long from there on.
    expect(map.positionAt(PPQ * 11)).toMatchObject({ bar: 4, beat: 1 });
    expect(map.positionAt(PPQ * 14)).toMatchObject({ bar: 5, beat: 1 });
  });

  it("maps bar numbers back to ticks across a metre change", () => {
    const map = new MeterMap(
      [
        { ticks: 0, numerator: 4, denominator: 4 },
        { ticks: PPQ * 8, numerator: 3, denominator: 4 },
      ],
      PPQ,
    );
    expect(map.ticksAtBar(1)).toBe(0);
    expect(map.ticksAtBar(3)).toBe(PPQ * 8);
    expect(map.ticksAtBar(5)).toBe(PPQ * 14);
    for (const bar of [1, 2, 3, 4, 5, 9]) {
      expect(map.positionAt(map.ticksAtBar(bar)).bar).toBe(bar);
    }
  });
});
