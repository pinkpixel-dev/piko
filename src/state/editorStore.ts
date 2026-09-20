/**
 * View state for the piano roll: zoom, scroll, the active tool, the snap grid,
 * and the current selection. None of this belongs in the document, because none
 * of it is saved to the file or undone.
 */

import { create } from "zustand";
import type { NoteId, TrackId } from "../midi/types";

export type Tool = "select" | "draw" | "erase";

/** Snap divisions, expressed as a fraction of a whole note. */
export const SNAP_DIVISIONS = [
  { label: "Off", value: 0 },
  { label: "1/1", value: 1 },
  { label: "1/2", value: 2 },
  { label: "1/4", value: 4 },
  { label: "1/8", value: 8 },
  { label: "1/16", value: 16 },
  { label: "1/32", value: 32 },
] as const;

export const MIN_PIXELS_PER_TICK = 0.01;
export const MAX_PIXELS_PER_TICK = 2;
export const MIN_ROW_HEIGHT = 6;
export const MAX_ROW_HEIGHT = 40;

interface EditorState {
  tool: Tool;
  /** Horizontal zoom. */
  pixelsPerTick: number;
  /** Vertical zoom, the height of one semitone row in pixels. */
  rowHeight: number;
  /** Leftmost visible tick. */
  scrollTicks: number;
  /** Pitch shown at the top of the view. */
  topPitch: number;
  /** Denominator of the snap grid; 0 means no snapping. */
  snapDivision: number;

  selection: ReadonlySet<NoteId>;
  /** Track that new notes are drawn into. */
  activeTrackId: TrackId | null;
  /** Follow the playhead while playing. */
  autoScroll: boolean;
  /**
   * Whether the track rail is showing. Only consulted on narrow screens, where
   * the rail is an overlay; on a wide window it is always a fixed column.
   */
  railOpen: boolean;

  setTool: (tool: Tool) => void;
  setSnapDivision: (division: number) => void;
  setPixelsPerTick: (value: number) => void;
  setRowHeight: (value: number) => void;
  zoomHorizontally: (factor: number) => void;
  zoomVertically: (factor: number) => void;
  setScrollTicks: (ticks: number) => void;
  setTopPitch: (pitch: number) => void;
  scrollBy: (deltaTicks: number, deltaPitch: number) => void;

  setSelection: (ids: ReadonlySet<NoteId>) => void;
  addToSelection: (ids: ReadonlySet<NoteId>) => void;
  toggleInSelection: (id: NoteId) => void;
  clearSelection: () => void;

  setActiveTrackId: (trackId: TrackId | null) => void;
  setAutoScroll: (enabled: boolean) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "select",
  pixelsPerTick: 0.12,
  rowHeight: 14,
  scrollTicks: 0,
  // Opens around middle C, where most music sits, rather than at the top of
  // the 128-note range where there is usually nothing.
  topPitch: 84,
  snapDivision: 16,

  selection: new Set<NoteId>(),
  activeTrackId: null,
  autoScroll: true,
  railOpen: false,

  setTool: (tool) => set({ tool }),
  setSnapDivision: (snapDivision) => set({ snapDivision }),

  setPixelsPerTick: (value) =>
    set({ pixelsPerTick: clamp(value, MIN_PIXELS_PER_TICK, MAX_PIXELS_PER_TICK) }),

  setRowHeight: (value) => set({ rowHeight: clamp(value, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT) }),

  zoomHorizontally: (factor) => get().setPixelsPerTick(get().pixelsPerTick * factor),
  zoomVertically: (factor) => get().setRowHeight(get().rowHeight * factor),

  setScrollTicks: (ticks) => set({ scrollTicks: Math.max(0, ticks) }),
  setTopPitch: (pitch) => set({ topPitch: clamp(pitch, 12, 127) }),

  scrollBy: (deltaTicks, deltaPitch) => {
    const state = get();
    set({
      scrollTicks: Math.max(0, state.scrollTicks + deltaTicks),
      topPitch: clamp(state.topPitch + deltaPitch, 12, 127),
    });
  },

  setSelection: (ids) => set({ selection: ids }),

  addToSelection: (ids) => {
    const next = new Set(get().selection);
    for (const id of ids) next.add(id);
    set({ selection: next });
  },

  toggleInSelection: (id) => {
    const next = new Set(get().selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selection: next });
  },

  clearSelection: () => {
    // Avoids a pointless re-render when nothing was selected to begin with.
    if (get().selection.size === 0) return;
    set({ selection: new Set<NoteId>() });
  },

  setActiveTrackId: (activeTrackId) => set({ activeTrackId }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),
  setRailOpen: (railOpen) => set({ railOpen }),
  toggleRail: () => set({ railOpen: !get().railOpen }),
}));

/** Ticks per snap step, or 0 when snapping is off. */
export function snapTicks(ppq: number, division: number): number {
  if (division <= 0) return 0;
  return (ppq * 4) / division;
}

/** Rounds a tick position to the snap grid. */
export function snapToGrid(ticks: number, ppq: number, division: number): number {
  const step = snapTicks(ppq, division);
  if (step <= 0) return Math.round(ticks);
  return Math.round(ticks / step) * step;
}

/** Rounds down to the snap grid, used when placing a new note under the cursor. */
export function snapDownToGrid(ticks: number, ppq: number, division: number): number {
  const step = snapTicks(ppq, division);
  if (step <= 0) return Math.round(ticks);
  return Math.floor(ticks / step) * step;
}
