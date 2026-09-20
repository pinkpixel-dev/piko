import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TempoMap } from "../../midi/timing";
import type { Note, Track } from "../../midi/types";
import { Scheduler, type NoteSink } from "../scheduler";

const PPQ = 480;

/**
 * Stands in for the audio hardware, which cannot run in a test process. It
 * records what was scheduled and at which audio-clock time, and its clock is
 * advanced by hand so the scheduling maths can be checked exactly.
 */
class RecordingSink implements NoteSink {
  currentTime = 0;
  readonly onEvents: Array<{ channel: number; pitch: number; velocity: number; time: number }> = [];
  readonly offEvents: Array<{ channel: number; pitch: number; time: number }> = [];
  panics = 0;

  noteOn(channel: number, pitch: number, velocity: number, time: number): void {
    this.onEvents.push({ channel, pitch, velocity, time });
  }

  noteOff(channel: number, pitch: number, time: number): void {
    this.offEvents.push({ channel, pitch, time });
  }

  panic(): void {
    this.panics += 1;
  }

  /**
   * Moves the audio clock forward in small steps, interleaved with the
   * scheduler's timer. A real audio clock advances continuously, so jumping it
   * in one leap would make every note look overdue and misrepresent what the
   * scheduler does.
   */
  advance(seconds: number): void {
    const stepMs = 5;
    let remainingMs = seconds * 1000;
    while (remainingMs > 0) {
      const step = Math.min(stepMs, remainingMs);
      this.currentTime += step / 1000;
      vi.advanceTimersByTime(step);
      remainingMs -= step;
    }
  }
}

function makeNote(pitch: number, ticks: number, durationTicks: number): Note {
  return { id: `n${pitch}-${ticks}`, pitch, ticks, durationTicks, velocity: 100 };
}

function makeTrack(notes: Note[]): Track {
  return {
    id: "t1",
    name: "Test",
    channel: 0,
    program: 0,
    isDrum: false,
    colorIndex: 0,
    notes,
    muted: false,
    soloed: false,
    volume: 1,
    visible: true,
  };
}

describe("Scheduler", () => {
  let sink: RecordingSink;
  let scheduler: Scheduler;
  let reachedEnd: number;

  // 120bpm, so one quarter note is 0.5 seconds.
  const tempo = new TempoMap([{ ticks: 0, bpm: 120 }], PPQ);

  beforeEach(() => {
    vi.useFakeTimers();
    sink = new RecordingSink();
    reachedEnd = 0;
    scheduler = new Scheduler(sink, { onReachedEnd: () => { reachedEnd += 1; } });
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  /** Four quarter notes on beats 1 to 4. */
  function loadFourBeats(): void {
    const track = makeTrack([
      makeNote(60, 0, PPQ),
      makeNote(62, PPQ, PPQ),
      makeNote(64, PPQ * 2, PPQ),
      makeNote(65, PPQ * 3, PPQ),
    ]);
    scheduler.setSource([{ track, channel: 0 }], tempo, PPQ * 4);
  }

  it("queues only the notes inside the lookahead window", () => {
    loadFourBeats();
    scheduler.start();
    // The lookahead is 100ms, so only the note at time zero is due.
    expect(sink.onEvents.map((event) => event.pitch)).toEqual([60]);
  });

  it("queues later notes as the clock advances", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(0.5);
    expect(sink.onEvents.map((event) => event.pitch)).toEqual([60, 62]);
    sink.advance(1.0);
    expect(sink.onEvents.map((event) => event.pitch)).toEqual([60, 62, 64, 65]);
  });

  it("schedules each note at the audio time matching its tick position", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(1.6);

    const [first, second, third] = sink.onEvents;
    // Beats are 0.5s apart at 120bpm, regardless of the start anchor offset.
    expect(second.time - first.time).toBeCloseTo(0.5, 6);
    expect(third.time - second.time).toBeCloseTo(0.5, 6);
  });

  it("schedules a note-off at the note's end", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(0.1);

    const on = sink.onEvents.find((event) => event.pitch === 60);
    const off = sink.offEvents.find((event) => event.pitch === 60);
    expect(off!.time - on!.time).toBeCloseTo(0.5, 6);
  });

  it("carries velocity and channel through to the synth", () => {
    const track = makeTrack([makeNote(60, 0, PPQ)]);
    track.notes[0].velocity = 42;
    scheduler.setSource([{ track, channel: 5 }], tempo, PPQ);
    scheduler.start();

    expect(sink.onEvents[0]).toMatchObject({ channel: 5, pitch: 60, velocity: 42 });
  });

  it("reports a position that tracks the audio clock", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(1.0);
    expect(scheduler.positionSeconds).toBeCloseTo(1.0, 2);
  });

  it("holds its position when stopped and silences the synth", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(0.8);
    scheduler.stop();

    const held = scheduler.positionSeconds;
    expect(held).toBeCloseTo(0.8, 2);
    expect(sink.panics).toBeGreaterThan(0);

    // A stopped scheduler must not drift as the audio clock keeps running.
    sink.advance(1.0);
    expect(scheduler.positionSeconds).toBe(held);
  });

  it("queues nothing more once stopped", () => {
    loadFourBeats();
    scheduler.start();
    scheduler.stop();
    const queued = sink.onEvents.length;
    sink.advance(2.0);
    expect(sink.onEvents.length).toBe(queued);
  });

  it("resumes from where it stopped", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(1.1);
    scheduler.stop();
    sink.advance(5.0);

    scheduler.start();
    expect(scheduler.positionSeconds).toBeCloseTo(1.1, 1);
    // Only the notes from beat 3 on are still ahead of the playhead.
    const afterResume = sink.onEvents.slice(3).map((event) => event.pitch);
    expect(afterResume).not.toContain(60);
  });

  it("seeks while stopped without queuing anything", () => {
    loadFourBeats();
    scheduler.seekSeconds(1.0);
    expect(scheduler.positionSeconds).toBe(1.0);
    expect(sink.onEvents).toHaveLength(0);
  });

  it("seeks while playing and resumes from the new point", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(0.2);
    sink.onEvents.length = 0;

    scheduler.seekSeconds(1.5);
    expect(scheduler.positionSeconds).toBeCloseTo(1.5, 2);
    // The note on beat 4 sits at 1.5s, so it is the next one due.
    expect(sink.onEvents.map((event) => event.pitch)).toEqual([65]);
  });

  it("clamps a seek before the start of the song", () => {
    loadFourBeats();
    scheduler.seekSeconds(-10);
    expect(scheduler.positionSeconds).toBe(0);
  });

  it("announces the end of the song exactly once", () => {
    loadFourBeats();
    scheduler.start();
    sink.advance(3.0);
    expect(reachedEnd).toBe(1);
    sink.advance(3.0);
    expect(reachedEnd).toBe(1);
  });

  it("wraps at the loop end instead of ending", () => {
    loadFourBeats();
    // Loop the first two beats, which is 0 to 1.0 seconds.
    scheduler.setLoop({ enabled: true, startTicks: 0, endTicks: PPQ * 2 });
    scheduler.start();
    sink.advance(2.4);

    expect(reachedEnd).toBe(0);
    const pitches = sink.onEvents.map((event) => event.pitch);
    // Two full passes of the loop, and nothing from outside it.
    expect(pitches).not.toContain(64);
    expect(pitches).not.toContain(65);
    expect(pitches.filter((pitch) => pitch === 60).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps loop repeats evenly spaced", () => {
    loadFourBeats();
    scheduler.setLoop({ enabled: true, startTicks: 0, endTicks: PPQ * 2 });
    scheduler.start();
    sink.advance(3.2);

    const firstNoteTimes = sink.onEvents
      .filter((event) => event.pitch === 60)
      .map((event) => event.time);
    expect(firstNoteTimes.length).toBeGreaterThanOrEqual(3);
    // Each pass of a two-beat loop lasts exactly 1.0 seconds.
    for (let index = 1; index < firstNoteTimes.length; index += 1) {
      expect(firstNoteTimes[index] - firstNoteTimes[index - 1]).toBeCloseTo(1.0, 6);
    }
  });

  it("plays a loop that starts part-way into the song", () => {
    loadFourBeats();
    scheduler.setLoop({ enabled: true, startTicks: PPQ * 2, endTicks: PPQ * 4 });
    scheduler.seekSeconds(1.0);
    scheduler.start();
    sink.advance(2.2);

    const pitches = new Set(sink.onEvents.map((event) => event.pitch));
    expect(pitches.has(64)).toBe(true);
    expect(pitches.has(65)).toBe(true);
    expect(pitches.has(60)).toBe(false);
  });

  it("picks up notes added during playback", () => {
    const track = makeTrack([makeNote(60, 0, PPQ)]);
    scheduler.setSource([{ track, channel: 0 }], tempo, PPQ * 4);
    scheduler.start();
    sink.advance(0.2);

    const edited = makeTrack([...track.notes, makeNote(72, PPQ * 3, PPQ)]);
    scheduler.setSource([{ track: edited, channel: 0 }], tempo, PPQ * 4);
    sink.advance(1.5);

    expect(sink.onEvents.map((event) => event.pitch)).toContain(72);
  });

  it("handles a track with no notes", () => {
    scheduler.setSource([{ track: makeTrack([]), channel: 0 }], tempo, 0);
    scheduler.start();
    sink.advance(1.0);
    expect(sink.onEvents).toHaveLength(0);
  });

  it("follows a tempo change when placing notes", () => {
    const changing = new TempoMap(
      [
        { ticks: 0, bpm: 120 },
        { ticks: PPQ * 2, bpm: 60 },
      ],
      PPQ,
    );
    const track = makeTrack([
      makeNote(60, PPQ * 2, PPQ),
      makeNote(62, PPQ * 3, PPQ),
    ]);
    scheduler.setSource([{ track, channel: 0 }], changing, PPQ * 4);
    scheduler.start();
    sink.advance(3.0);

    const [first, second] = sink.onEvents;
    // At 60bpm a quarter note lasts a full second, not half.
    expect(second.time - first.time).toBeCloseTo(1.0, 6);
  });
});
