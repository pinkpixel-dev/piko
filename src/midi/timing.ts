/**
 * Conversion between ticks, seconds, and musical positions.
 *
 * A song can change tempo part-way through, so converting ticks to seconds
 * means walking the tempo map and accumulating the duration of each segment.
 * TempoMap precomputes those segment boundaries once, which turns every later
 * lookup into a binary search instead of a full walk. The piano roll does this
 * conversion thousands of times per frame, so the precomputation pays off.
 */

import type { ProjectDoc, TempoEvent, TimeSignatureEvent } from "./types";
import { DEFAULT_BPM } from "./types";

interface TempoSegment {
  ticks: number;
  seconds: number;
  /** Seconds elapsed per tick inside this segment. */
  secondsPerTick: number;
  bpm: number;
}

export class TempoMap {
  private readonly segments: TempoSegment[];

  constructor(
    tempos: readonly TempoEvent[],
    private readonly ppq: number,
  ) {
    const sorted = [...tempos].sort((a, b) => a.ticks - b.ticks);

    // A song with no tempo event, or one that starts late, still needs a tempo
    // from tick zero. Without this the first bars would have no duration.
    if (sorted.length === 0 || sorted[0].ticks > 0) {
      sorted.unshift({ ticks: 0, bpm: sorted[0]?.bpm ?? DEFAULT_BPM });
    }

    this.segments = [];
    let seconds = 0;
    let previous: TempoSegment | undefined;

    for (const tempo of sorted) {
      if (previous) {
        seconds += (tempo.ticks - previous.ticks) * previous.secondsPerTick;
      }
      const segment: TempoSegment = {
        ticks: tempo.ticks,
        seconds,
        secondsPerTick: 60 / (tempo.bpm * ppq),
        bpm: tempo.bpm,
      };
      this.segments.push(segment);
      previous = segment;
    }
  }

  /** Index of the last segment starting at or before `ticks`. */
  private segmentIndexForTicks(ticks: number): number {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.segments[mid].ticks <= ticks) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /** Index of the last segment starting at or before `seconds`. */
  private segmentIndexForSeconds(seconds: number): number {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.segments[mid].seconds <= seconds) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  ticksToSeconds(ticks: number): number {
    const segment = this.segments[this.segmentIndexForTicks(ticks)];
    return segment.seconds + (ticks - segment.ticks) * segment.secondsPerTick;
  }

  secondsToTicks(seconds: number): number {
    const segment = this.segments[this.segmentIndexForSeconds(seconds)];
    return segment.ticks + (seconds - segment.seconds) / segment.secondsPerTick;
  }

  /** Tempo in effect at a given tick. */
  bpmAt(ticks: number): number {
    return this.segments[this.segmentIndexForTicks(ticks)].bpm;
  }

  get ticksPerQuarter(): number {
    return this.ppq;
  }
}

export interface BarBeat {
  /** One-based bar number, matching what the ruler shows. */
  bar: number;
  /** One-based beat within the bar. */
  beat: number;
  /** Fractional remainder of the current beat, 0 to just under 1. */
  fraction: number;
}

/**
 * Musical position lookup across time signature changes.
 *
 * Like TempoMap, this precomputes the tick position where each time signature
 * begins so bar numbers stay correct after a metre change.
 */
export class MeterMap {
  private readonly entries: Array<{
    ticks: number;
    bar: number;
    numerator: number;
    denominator: number;
    ticksPerBeat: number;
    ticksPerBar: number;
  }> = [];

  constructor(signatures: readonly TimeSignatureEvent[], ppq: number) {
    const sorted = [...signatures].sort((a, b) => a.ticks - b.ticks);
    if (sorted.length === 0 || sorted[0].ticks > 0) {
      sorted.unshift({ ticks: 0, numerator: 4, denominator: 4 });
    }

    let bar = 0;
    let previousIndex = -1;

    for (const signature of sorted) {
      if (previousIndex >= 0) {
        const previous = this.entries[previousIndex];
        bar += Math.floor((signature.ticks - previous.ticks) / previous.ticksPerBar);
      }
      // A denominator of 4 means the beat is a quarter note, 8 an eighth, and
      // so on, so the beat length scales inversely with the denominator.
      const ticksPerBeat = (ppq * 4) / signature.denominator;
      this.entries.push({
        ticks: signature.ticks,
        bar,
        numerator: signature.numerator,
        denominator: signature.denominator,
        ticksPerBeat,
        ticksPerBar: ticksPerBeat * signature.numerator,
      });
      previousIndex = this.entries.length - 1;
    }
  }

  private entryForTicks(ticks: number) {
    let low = 0;
    let high = this.entries.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.entries[mid].ticks <= ticks) low = mid;
      else high = mid - 1;
    }
    return this.entries[low];
  }

  positionAt(ticks: number): BarBeat {
    const entry = this.entryForTicks(ticks);
    const offset = Math.max(0, ticks - entry.ticks);
    const barsIn = Math.floor(offset / entry.ticksPerBar);
    const withinBar = offset - barsIn * entry.ticksPerBar;
    const beatsIn = Math.floor(withinBar / entry.ticksPerBeat);
    const remainder = withinBar - beatsIn * entry.ticksPerBeat;

    return {
      bar: entry.bar + barsIn + 1,
      beat: beatsIn + 1,
      fraction: remainder / entry.ticksPerBeat,
    };
  }

  /** Tick position where a one-based bar number begins. */
  ticksAtBar(bar: number): number {
    const target = bar - 1;
    let entry = this.entries[0];
    for (const candidate of this.entries) {
      if (candidate.bar <= target) entry = candidate;
      else break;
    }
    return entry.ticks + (target - entry.bar) * entry.ticksPerBar;
  }

  ticksPerBarAt(ticks: number): number {
    return this.entryForTicks(ticks).ticksPerBar;
  }

  ticksPerBeatAt(ticks: number): number {
    return this.entryForTicks(ticks).ticksPerBeat;
  }

  numeratorAt(ticks: number): number {
    return this.entryForTicks(ticks).numerator;
  }
}

/** Both maps for a document, rebuilt whenever tempo or metre changes. */
export interface Timing {
  tempo: TempoMap;
  meter: MeterMap;
}

export function createTiming(doc: ProjectDoc): Timing {
  return {
    tempo: new TempoMap(doc.tempos, doc.ppq),
    meter: new MeterMap(doc.timeSignatures, doc.ppq),
  };
}
