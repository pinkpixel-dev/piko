/**
 * Owns the AudioContext, the SpessaSynth worklet, and the bundled soundfont.
 *
 * Channel allocation: each track gets its own synthesiser channel, indexed by
 * its position in the track list, rather than reusing the channel number stored
 * in the file. Files often put several tracks on channel 0, and sharing a
 * channel means they would fight over one program and one volume. Drum tracks
 * are flagged per channel with setDrums instead of relying on channel 9.
 */

import { WorkletSynthesizer } from "spessasynth_lib";
import { MIDIControllers } from "spessasynth_core";

const WORKLET_URL = "/worklets/spessasynth_processor.min.js";
const SOUNDFONT_URL = "/soundfonts/GeneralUserGS.sf3";
const MAX_MIDI_VALUE = 127;

export class AudioEngineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AudioEngineError";
  }
}

export interface ChannelSetup {
  program: number;
  isDrum: boolean;
  /** Track gain, 0-1. */
  volume: number;
}

export class SynthEngine {
  private context: AudioContext | null = null;
  private synth: WorkletSynthesizer | null = null;
  private master: GainNode | null = null;
  private channelCount = 0;
  private ready: Promise<void> | null = null;

  /**
   * Boots the worklet and loads the soundfont. Safe to call repeatedly; the
   * work happens once and later callers await the same promise.
   */
  init(): Promise<void> {
    this.ready ??= this.boot();
    return this.ready;
  }

  private async boot(): Promise<void> {
    let context: AudioContext;
    try {
      // A fixed 48kHz rate keeps the soundfont's sample playback consistent
      // across machines whose default device rate differs.
      context = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    } catch (cause) {
      throw new AudioEngineError("This system has no audio output available.", { cause });
    }

    try {
      await context.audioWorklet.addModule(WORKLET_URL);
    } catch (cause) {
      throw new AudioEngineError("The audio engine failed to start.", { cause });
    }

    const synth = new WorkletSynthesizer(context);
    const master = context.createGain();
    master.gain.value = 1;
    synth.connect(master);
    master.connect(context.destination);

    let soundfont: ArrayBuffer;
    try {
      const response = await fetch(SOUNDFONT_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      soundfont = await response.arrayBuffer();
    } catch (cause) {
      throw new AudioEngineError("The instrument soundfont could not be loaded.", { cause });
    }

    try {
      await synth.soundBankManager.addSoundBank(soundfont, "main");
      await synth.isReady;
    } catch (cause) {
      throw new AudioEngineError("The instrument soundfont could not be read.", { cause });
    }

    this.context = context;
    this.synth = synth;
    this.master = master;
    this.channelCount = synth.channelCount;
  }

  private require(): { synth: WorkletSynthesizer; context: AudioContext } {
    if (!this.synth || !this.context) {
      throw new AudioEngineError("The audio engine is not ready yet.");
    }
    return { synth: this.synth, context: this.context };
  }

  get isReady(): boolean {
    return this.synth !== null;
  }

  /** AudioContext clock, the time base every scheduled event is expressed in. */
  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * Browsers start an AudioContext suspended until a user gesture, so this has
   * to run from a click or key press before anything will be heard.
   */
  async resume(): Promise<void> {
    const { context } = this.require();
    if (context.state !== "running") await context.resume();
  }

  /** Grows the channel pool so every track can have one of its own. */
  ensureChannels(count: number): void {
    const { synth } = this.require();
    while (this.channelCount < count) {
      synth.addNewChannel();
      this.channelCount += 1;
    }
  }

  configureChannel(channel: number, setup: ChannelSetup): void {
    const { synth } = this.require();
    const target = synth.midiChannels[channel];
    if (!target) return;

    target.setDrums(setup.isDrum);
    synth.programChange(channel, setup.program);
    this.setChannelVolume(channel, setup.volume);
  }

  setChannelVolume(channel: number, volume: number): void {
    const { synth } = this.require();
    const clamped = Math.round(Math.min(1, Math.max(0, volume)) * MAX_MIDI_VALUE);
    synth.controllerChange(channel, MIDIControllers.mainVolume, clamped);
  }

  setMasterVolume(volume: number): void {
    if (!this.master || !this.context) return;
    const clamped = Math.min(1, Math.max(0, volume));
    // A short ramp instead of a step, so volume changes do not click.
    this.master.gain.setTargetAtTime(clamped, this.context.currentTime, 0.01);
  }

  noteOn(channel: number, pitch: number, velocity: number, time: number): void {
    this.synth?.noteOn(channel, pitch, velocity, { time });
  }

  noteOff(channel: number, pitch: number, time: number): void {
    this.synth?.noteOff(channel, pitch, { time });
  }

  /** Cuts every sounding voice immediately. Used on stop, seek, and errors. */
  panic(): void {
    this.synth?.stopAll(true);
  }

  async dispose(): Promise<void> {
    this.synth?.destroy();
    await this.context?.close();
    this.synth = null;
    this.context = null;
    this.master = null;
    this.ready = null;
  }
}
