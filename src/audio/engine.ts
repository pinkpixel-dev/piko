/**
 * Connects the document to the sound engine.
 *
 * This is the only place that knows both what the song contains and how it is
 * played. The stores talk to it; nothing else touches the synthesiser or the
 * scheduler directly.
 */

import { createTiming, type Timing } from "../midi/timing";
import {
  audibleTrackIds,
  projectDurationTicks,
  type ProjectDoc,
} from "../midi/types";
import { Scheduler, type LoopRegion, type ScheduledTrack } from "./scheduler";
import { SynthEngine } from "./synth";

export class PlaybackEngine {
  readonly synth = new SynthEngine();
  private readonly scheduler: Scheduler;
  private doc: ProjectDoc | null = null;
  private timing: Timing | null = null;
  /** Synth channel assigned to each track id. */
  private channelOf = new Map<string, number>();

  constructor(onReachedEnd: () => void) {
    this.scheduler = new Scheduler(this.synth, { onReachedEnd });
  }

  init(): Promise<void> {
    return this.synth.init();
  }

  get isReady(): boolean {
    return this.synth.isReady;
  }

  get isPlaying(): boolean {
    return this.scheduler.isRunning;
  }

  get positionSeconds(): number {
    return this.scheduler.positionSeconds;
  }

  get positionTicks(): number {
    if (!this.timing) return 0;
    return this.timing.tempo.secondsToTicks(this.scheduler.positionSeconds);
  }

  /**
   * Called on load and after every edit. Track-to-channel assignment is stable
   * across calls so a note held over an edit is released on the right channel.
   */
  setDocument(doc: ProjectDoc): void {
    this.doc = doc;
    this.timing = createTiming(doc);

    // Tracks that survived the edit keep their channel, so a note held across
    // the change is released on the channel it started on. New tracks then fill
    // the lowest channels nobody is using, which stops a new track from being
    // handed a channel a retained track still owns.
    const previous = this.channelOf;
    this.channelOf = new Map();
    const taken = new Set<number>();

    for (const track of doc.tracks) {
      const retained = previous.get(track.id);
      if (retained !== undefined) {
        this.channelOf.set(track.id, retained);
        taken.add(retained);
      }
    }

    let candidate = 0;
    for (const track of doc.tracks) {
      if (this.channelOf.has(track.id)) continue;
      while (taken.has(candidate)) candidate += 1;
      this.channelOf.set(track.id, candidate);
      taken.add(candidate);
    }

    const channelCount = taken.size === 0 ? 0 : Math.max(...taken) + 1;

    if (this.synth.isReady) {
      this.synth.ensureChannels(channelCount);
      for (const track of doc.tracks) {
        const channel = this.channelOf.get(track.id);
        if (channel === undefined) continue;
        this.synth.configureChannel(channel, {
          program: track.program,
          isDrum: track.isDrum,
          volume: track.volume,
        });
      }
    }

    this.refreshSources();
  }

  /** Rebuilds the scheduler's view of which tracks currently sound. */
  refreshSources(): void {
    if (!this.doc || !this.timing) return;

    const audible = audibleTrackIds(this.doc);
    const sources: ScheduledTrack[] = [];

    for (const track of this.doc.tracks) {
      if (!audible.has(track.id)) continue;
      const channel = this.channelOf.get(track.id);
      if (channel === undefined) continue;
      sources.push({ track, channel });
    }

    this.scheduler.setSource(sources, this.timing.tempo, projectDurationTicks(this.doc));
  }

  /** Applies a track's mixer settings without rebuilding the schedule. */
  syncTrackSettings(trackId: string, program: number, isDrum: boolean, volume: number): void {
    const channel = this.channelOf.get(trackId);
    if (channel === undefined || !this.synth.isReady) return;
    this.synth.configureChannel(channel, { program, isDrum, volume });
  }

  async play(): Promise<void> {
    await this.synth.resume();
    this.scheduler.start();
  }

  pause(): void {
    this.scheduler.stop();
  }

  stop(): void {
    this.scheduler.stop();
    this.scheduler.seekSeconds(0);
  }

  seekTicks(ticks: number): void {
    if (!this.timing) return;
    this.scheduler.seekSeconds(this.timing.tempo.ticksToSeconds(Math.max(0, ticks)));
  }

  setLoop(loop: LoopRegion): void {
    this.scheduler.setLoop(loop);
  }

  setMasterVolume(volume: number): void {
    this.synth.setMasterVolume(volume);
  }

  /**
   * Plays a single note immediately, for auditioning while editing. Uses the
   * track's own channel so it sounds like the instrument it belongs to.
   */
  audition(trackId: string, pitch: number, velocity: number, durationSeconds = 0.35): void {
    const channel = this.channelOf.get(trackId);
    if (channel === undefined || !this.synth.isReady) return;
    const now = this.synth.currentTime;
    this.synth.noteOn(channel, pitch, velocity, now);
    this.synth.noteOff(channel, pitch, now + durationSeconds);
  }

  async dispose(): Promise<void> {
    this.scheduler.dispose();
    await this.synth.dispose();
  }
}
