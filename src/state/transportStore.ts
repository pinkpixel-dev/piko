/**
 * Playback state and the bridge to the audio engine.
 *
 * The playhead position is deliberately not kept in the store on every frame.
 * The audio clock updates hundreds of times a second and pushing that through
 * React would re-render the whole tree. Instead the position is read straight
 * from the engine by the components that draw it, and the store only holds
 * state that actually changes how the interface looks.
 */

import { create } from "zustand";
import { PlaybackEngine } from "../audio/engine";
import { onDocumentChange, useProjectStore } from "./projectStore";

export type EngineStatus = "idle" | "loading" | "ready" | "error";

interface TransportState {
  isPlaying: boolean;
  status: EngineStatus;
  errorMessage: string | null;
  masterVolume: number;
  isMuted: boolean;

  loopEnabled: boolean;
  loopStartTicks: number;
  loopEndTicks: number;

  prepare: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlay: () => Promise<void>;
  seekTicks: (ticks: number) => void;
  positionTicks: () => number;

  setMasterVolume: (volume: number) => void;
  toggleMute: () => void;

  setLoopRegion: (startTicks: number, endTicks: number) => void;
  toggleLoop: () => void;
  clearLoop: () => void;
}

/**
 * One engine for the life of the app. It holds an AudioContext and a worklet,
 * which are expensive to create and limited in number per page.
 */
const engine = new PlaybackEngine(() => {
  // Reaching the end stops the transport but leaves the playhead where it is,
  // so pressing play again resumes rather than silently doing nothing.
  engine.pause();
  useTransportStore.setState({ isPlaying: false });
});

export const useTransportStore = create<TransportState>((set, get) => ({
  isPlaying: false,
  status: "idle",
  errorMessage: null,
  masterVolume: 0.8,
  isMuted: false,

  loopEnabled: false,
  loopStartTicks: 0,
  loopEndTicks: 0,

  prepare: async () => {
    if (get().status === "ready" || get().status === "loading") return;
    set({ status: "loading", errorMessage: null });
    try {
      await engine.init();
      engine.setDocument(useProjectStore.getState().history.present);
      engine.setMasterVolume(get().isMuted ? 0 : get().masterVolume);
      set({ status: "ready" });
    } catch (error) {
      set({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "The audio engine failed to start.",
      });
    }
  },

  play: async () => {
    await get().prepare();
    if (get().status !== "ready") return;
    await engine.play();
    set({ isPlaying: true });
  },

  pause: () => {
    engine.pause();
    set({ isPlaying: false });
  },

  stop: () => {
    engine.stop();
    set({ isPlaying: false });
  },

  togglePlay: async () => {
    if (get().isPlaying) get().pause();
    else await get().play();
  },

  seekTicks: (ticks) => engine.seekTicks(ticks),

  positionTicks: () => engine.positionTicks,

  setMasterVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    // Moving the slider away from zero is itself an unmute, which is what
    // people expect rather than having to also click the mute button.
    set({ masterVolume: clamped, isMuted: clamped === 0 ? get().isMuted : false });
    engine.setMasterVolume(clamped === 0 || get().isMuted ? 0 : clamped);
  },

  toggleMute: () => {
    const isMuted = !get().isMuted;
    set({ isMuted });
    engine.setMasterVolume(isMuted ? 0 : get().masterVolume);
  },

  setLoopRegion: (startTicks, endTicks) => {
    const start = Math.max(0, Math.min(startTicks, endTicks));
    const end = Math.max(startTicks, endTicks);
    set({ loopStartTicks: start, loopEndTicks: end, loopEnabled: end > start });
    engine.setLoop({ enabled: end > start, startTicks: start, endTicks: end });
  },

  toggleLoop: () => {
    const state = get();
    const enabled = !state.loopEnabled && state.loopEndTicks > state.loopStartTicks;
    set({ loopEnabled: enabled });
    engine.setLoop({
      enabled,
      startTicks: state.loopStartTicks,
      endTicks: state.loopEndTicks,
    });
  },

  clearLoop: () => {
    set({ loopEnabled: false, loopStartTicks: 0, loopEndTicks: 0 });
    engine.setLoop({ enabled: false, startTicks: 0, endTicks: 0 });
  },
}));

// Keep the engine's copy of the song in step with every edit.
onDocumentChange((doc) => engine.setDocument(doc));

/** Exposed for note auditioning while editing. */
export function auditionNote(trackId: string, pitch: number, velocity: number): void {
  engine.audition(trackId, pitch, velocity);
}

export function disposeEngine(): Promise<void> {
  return engine.dispose();
}
