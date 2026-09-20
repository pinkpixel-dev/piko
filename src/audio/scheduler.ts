/**
 * Lookahead note scheduler.
 *
 * Web Audio can only be driven accurately by scheduling events slightly ahead
 * of the clock. A timer wakes up every SCHEDULE_INTERVAL and hands the
 * synthesiser every note that begins in the next LOOKAHEAD seconds, stamped
 * with an exact audio-clock time. The timer itself can be late by tens of
 * milliseconds without anyone hearing it, because the notes were already queued.
 *
 * Position maths runs through a single offset: audioTime = songSeconds +
 * audioOffset. Seeking and loop wrapping are then just adjustments to that one
 * number, rather than a separate clock per case.
 */

import type { TempoMap } from "../midi/timing";
import type { Track } from "../midi/types";

/**
 * The slice of the synthesiser the scheduler actually needs. Narrowing it this
 * way keeps the scheduling maths testable against a controlled clock, since
 * real audio hardware cannot run in a test process. SynthEngine satisfies this
 * shape as-is.
 */
export interface NoteSink {
  readonly currentTime: number;
  noteOn(channel: number, pitch: number, velocity: number, time: number): void;
  noteOff(channel: number, pitch: number, time: number): void;
  panic(): void;
}

/** How far ahead notes are queued. Long enough to absorb timer jitter. */
const LOOKAHEAD_SECONDS = 0.1;
/** How often the scheduler wakes. Must be well under LOOKAHEAD_SECONDS. */
const SCHEDULE_INTERVAL_MS = 25;

export interface LoopRegion {
  enabled: boolean;
  startTicks: number;
  endTicks: number;
}

/** One playable track paired with the synth channel it was assigned. */
export interface ScheduledTrack {
  track: Track;
  channel: number;
}

export interface SchedulerCallbacks {
  /** Fires when playback runs past the end of the song. */
  onReachedEnd: () => void;
}

function firstNoteIndexAtOrAfter(track: Track, ticks: number): number {
  let low = 0;
  let high = track.notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (track.notes[mid].ticks < ticks) low = mid + 1;
    else high = mid;
  }
  return low;
}

export class Scheduler {
  private sources: ScheduledTrack[] = [];
  private cursors: number[] = [];
  private tempo: TempoMap | null = null;
  private loop: LoopRegion = { enabled: false, startTicks: 0, endTicks: 0 };

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** audioTime = songSeconds + audioOffset. */
  private audioOffset = 0;
  /** Song position already queued, in seconds. */
  private scheduledSeconds = 0;
  /** Position used while stopped, in seconds. */
  private pausedSeconds = 0;
  private endSeconds = 0;
  /** Guards onReachedEnd, which would otherwise fire on every wake-up. */
  private announcedEnd = false;

  constructor(
    private readonly synth: NoteSink,
    private readonly callbacks: SchedulerCallbacks,
  ) {}

  /**
   * Replaces the notes being played. Called on load and after every edit, so
   * changes made during playback are heard from the next scheduled window on.
   */
  setSource(sources: ScheduledTrack[], tempo: TempoMap, endTicks: number): void {
    this.sources = sources;
    this.tempo = tempo;
    this.endSeconds = tempo.ticksToSeconds(endTicks);
    this.resyncCursors();
  }

  setLoop(loop: LoopRegion): void {
    this.loop = loop;
    if (this.running) this.resyncCursors();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Current song position in seconds, whether playing or paused. */
  get positionSeconds(): number {
    if (!this.running) return this.pausedSeconds;
    return Math.max(0, this.synth.currentTime - this.audioOffset);
  }

  start(): void {
    if (this.running || !this.tempo) return;

    this.running = true;
    this.announcedEnd = false;
    // Anchor so the reported position is exactly the playhead, with no jump.
    // Notes that fall due immediately are handled by the clamp in
    // scheduleWindow rather than by delaying the whole clock.
    this.audioOffset = this.synth.currentTime - this.pausedSeconds;
    this.scheduledSeconds = this.pausedSeconds;
    this.resyncCursors();

    this.pump();
    this.timer = setInterval(() => this.pump(), SCHEDULE_INTERVAL_MS);
  }

  /** Stops the clock and silences everything, keeping the playhead in place. */
  stop(): void {
    if (!this.running) return;
    this.pausedSeconds = this.positionSeconds;
    this.halt();
  }

  seekSeconds(seconds: number): void {
    const target = Math.max(0, seconds);
    if (this.running) {
      this.synth.panic();
      this.clearLookaheadTail();
      this.announcedEnd = false;
      this.audioOffset = this.synth.currentTime - target;
      this.scheduledSeconds = target;
      this.resyncCursors();
      this.pump();
    } else {
      this.pausedSeconds = target;
      this.announcedEnd = false;
      this.resyncCursors();
    }
  }

  private halt(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.synth.panic();
    this.clearLookaheadTail();
  }

  /**
   * Notes already queued inside the lookahead window cannot be recalled, so a
   * second silence runs once that window has passed. Without it a note queued
   * microseconds before a stop would start playing and never be released.
   */
  private clearLookaheadTail(): void {
    setTimeout(() => {
      if (!this.running) this.synth.panic();
    }, LOOKAHEAD_SECONDS * 1000 + SCHEDULE_INTERVAL_MS);
  }

  /** Points each track's cursor at the first note on or after the playhead. */
  private resyncCursors(): void {
    if (!this.tempo) return;
    const ticks = this.tempo.secondsToTicks(
      this.running ? this.scheduledSeconds : this.pausedSeconds,
    );
    this.cursors = this.sources.map(({ track }) => firstNoteIndexAtOrAfter(track, ticks));
  }

  private pump(): void {
    if (!this.running || !this.tempo) return;

    // A loop needs positive length. A zero or inverted region would wrap
    // without ever advancing, so it is treated as no loop at all.
    const looping = this.loop.enabled && this.loop.endTicks > this.loop.startTicks;

    for (;;) {
      // The horizon is recomputed every pass because a wrap shifts audioOffset,
      // which moves the song-time position and therefore the horizon with it.
      // Hoisting this out of the loop makes the wrap condition permanently true.
      const horizonSeconds = this.synth.currentTime - this.audioOffset + LOOKAHEAD_SECONDS;
      if (this.scheduledSeconds >= horizonSeconds) break;

      const boundarySeconds = looping
        ? this.tempo.ticksToSeconds(this.loop.endTicks)
        : Number.POSITIVE_INFINITY;

      const sliceEnd = Math.min(horizonSeconds, boundarySeconds);
      this.scheduleWindow(this.scheduledSeconds, sliceEnd);

      if (looping && sliceEnd >= boundarySeconds) {
        // Wrap: the loop start now sounds at the moment the loop end would
        // have, which is a single shift of the song-to-audio offset. Each wrap
        // moves the horizon back by one loop length, so this terminates.
        const loopStartSeconds = this.tempo.ticksToSeconds(this.loop.startTicks);
        this.audioOffset += boundarySeconds - loopStartSeconds;
        this.scheduledSeconds = loopStartSeconds;
        this.resyncCursors();
        continue;
      }

      this.scheduledSeconds = sliceEnd;
      break;
    }

    if (!looping && !this.announcedEnd && this.positionSeconds >= this.endSeconds) {
      this.announcedEnd = true;
      this.callbacks.onReachedEnd();
    }
  }

  /** Queues every note starting in [fromSeconds, toSeconds). */
  private scheduleWindow(fromSeconds: number, toSeconds: number): void {
    if (!this.tempo) return;
    const toTicks = this.tempo.secondsToTicks(toSeconds);
    const now = this.synth.currentTime;

    for (const [index, { track, channel }] of this.sources.entries()) {
      let cursor = this.cursors[index];
      const notes = track.notes;

      while (cursor < notes.length && notes[cursor].ticks < toTicks) {
        const note = notes[cursor];
        const startSeconds = this.tempo.ticksToSeconds(note.ticks);

        // A note that began before this window was handled already, except at
        // the very start of playback where the window opens mid-note.
        if (startSeconds >= fromSeconds) {
          const endSeconds = this.tempo.ticksToSeconds(note.ticks + note.durationTicks);
          // A note landing exactly on the playhead after a seek would otherwise
          // be scheduled in the past, where it is silently dropped. Clamping to
          // the current time starts it right away instead, and keeps note-off
          // after note-on for very short notes.
          const onTime = Math.max(now, startSeconds + this.audioOffset);
          const offTime = Math.max(onTime, endSeconds + this.audioOffset);
          this.synth.noteOn(channel, note.pitch, note.velocity, onTime);
          this.synth.noteOff(channel, note.pitch, offTime);
        }
        cursor += 1;
      }

      this.cursors[index] = cursor;
    }
  }

  dispose(): void {
    this.halt();
  }
}
