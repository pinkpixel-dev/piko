import { describe, expect, it } from "vitest";
import {
  noteRect,
  normaliseRect,
  pitchToY,
  rectsOverlap,
  tickToX,
  visibleLowestPitch,
  xToTick,
  yToPitch,
  type RollGeometry,
} from "../geometry";

const geometry: RollGeometry = {
  scrollTicks: 0,
  topPitch: 84,
  pixelsPerTick: 0.1,
  rowHeight: 12,
  width: 800,
  height: 600,
};

describe("horizontal mapping", () => {
  it("places tick zero at the left edge when unscrolled", () => {
    expect(tickToX(geometry, 0)).toBe(0);
    expect(tickToX(geometry, 1000)).toBe(100);
  });

  it("shifts positions by the scroll offset", () => {
    const scrolled = { ...geometry, scrollTicks: 500 };
    expect(tickToX(scrolled, 500)).toBe(0);
    expect(tickToX(scrolled, 1500)).toBe(100);
  });

  it("round-trips ticks through x at any scroll", () => {
    for (const scrollTicks of [0, 123, 98765]) {
      const view = { ...geometry, scrollTicks };
      for (const ticks of [0, 7, 480, 123456]) {
        expect(xToTick(view, tickToX(view, ticks))).toBeCloseTo(ticks, 6);
      }
    }
  });
});

describe("vertical mapping", () => {
  it("draws the top pitch at the top edge", () => {
    expect(pitchToY(geometry, 84)).toBe(0);
  });

  it("puts lower pitches further down", () => {
    expect(pitchToY(geometry, 83)).toBe(12);
    expect(pitchToY(geometry, 72)).toBe(144);
  });

  it("maps a y back to the pitch row containing it", () => {
    expect(yToPitch(geometry, 0)).toBe(84);
    expect(yToPitch(geometry, 11)).toBe(84);
    expect(yToPitch(geometry, 12)).toBe(83);
    expect(yToPitch(geometry, 23)).toBe(83);
  });

  it("never reports a pitch below the MIDI range", () => {
    const low = { ...geometry, topPitch: 20, height: 600 };
    expect(visibleLowestPitch(low)).toBe(0);
  });
});

describe("noteRect", () => {
  it("sizes a note from its position and length", () => {
    expect(noteRect(geometry, 480, 480, 84)).toEqual({ x: 48, y: 0, width: 48, height: 12 });
  });

  it("keeps a very short note wide enough to see and grab", () => {
    expect(noteRect(geometry, 0, 1, 84).width).toBe(2);
  });
});

describe("rectangles", () => {
  it("detects overlap and non-overlap", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsOverlap(a, { x: 0, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it("normalises a rectangle dragged up and to the left", () => {
    expect(normaliseRect(100, 100, 40, 30)).toEqual({ x: 40, y: 30, width: 60, height: 70 });
  });
});
