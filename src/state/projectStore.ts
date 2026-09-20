/**
 * The document store: what song is open, its edit history, and whether it has
 * unsaved changes. Edits are applied through the pure functions in edits.ts so
 * this file only handles history and change notification.
 */

import { create } from "zustand";
import { createTiming, type Timing } from "../midi/timing";
import {
  createEmptyProject,
  projectDurationTicks,
  type NoteId,
  type Note,
  type ProjectDoc,
  type Track,
  type TrackId,
} from "../midi/types";
import * as edits from "./edits";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  resetHistory,
  undo,
  type History,
} from "./history";

/** Called after any document change so playback can pick up the new notes. */
type DocumentListener = (doc: ProjectDoc) => void;

const listeners = new Set<DocumentListener>();

export function onDocumentChange(listener: DocumentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(doc: ProjectDoc): void {
  for (const listener of listeners) listener(doc);
}

interface ProjectState {
  history: History<ProjectDoc>;
  filePath: string | null;
  isDirty: boolean;
  /** Derived tempo and metre maps, rebuilt whenever the document changes. */
  timing: Timing;
  durationTicks: number;

  doc: () => ProjectDoc;
  canUndo: () => boolean;
  canRedo: () => boolean;

  loadProject: (doc: ProjectDoc, filePath: string | null) => void;
  newProject: () => void;
  markSaved: (filePath: string) => void;

  undo: () => void;
  redo: () => void;

  setTrackProperties: (trackId: TrackId, patch: Partial<Omit<Track, "id" | "notes">>) => void;
  toggleSolo: (trackId: TrackId, additive: boolean) => void;
  addNote: (trackId: TrackId, note: Omit<Note, "id">) => NoteId;
  deleteNotes: (ids: ReadonlySet<NoteId>) => void;
  moveNotes: (ids: ReadonlySet<NoteId>, move: edits.NoteMove) => void;
  resizeNotes: (ids: ReadonlySet<NoteId>, deltaTicks: number, edge: edits.ResizeEdge) => void;
  setNoteVelocity: (ids: ReadonlySet<NoteId>, velocity: number) => void;
  quantizeNotes: (ids: ReadonlySet<NoteId>, gridTicks: number) => void;
  renameProject: (name: string) => void;
}

const emptyDoc = createEmptyProject();

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Commits a new document as an undoable step. */
  function commit(next: ProjectDoc): void {
    const current = get();
    if (next === current.history.present) return;

    set({
      history: pushHistory(current.history, next),
      isDirty: true,
      timing: createTiming(next),
      durationTicks: projectDurationTicks(next),
    });
    announce(next);
  }

  /** Moves to a document produced by undo or redo. */
  function restore(history: History<ProjectDoc>): void {
    set({
      history,
      isDirty: true,
      timing: createTiming(history.present),
      durationTicks: projectDurationTicks(history.present),
    });
    announce(history.present);
  }

  return {
    history: createHistory(emptyDoc),
    filePath: null,
    isDirty: false,
    timing: createTiming(emptyDoc),
    durationTicks: 0,

    doc: () => get().history.present,
    canUndo: () => canUndo(get().history),
    canRedo: () => canRedo(get().history),

    loadProject: (doc, filePath) => {
      set({
        history: resetHistory(doc),
        filePath,
        isDirty: false,
        timing: createTiming(doc),
        durationTicks: projectDurationTicks(doc),
      });
      announce(doc);
    },

    newProject: () => {
      const doc = createEmptyProject();
      set({
        history: resetHistory(doc),
        filePath: null,
        isDirty: false,
        timing: createTiming(doc),
        durationTicks: 0,
      });
      announce(doc);
    },

    markSaved: (filePath) => set({ filePath, isDirty: false }),

    undo: () => {
      const history = undo(get().history);
      if (history !== get().history) restore(history);
    },

    redo: () => {
      const history = redo(get().history);
      if (history !== get().history) restore(history);
    },

    setTrackProperties: (trackId, patch) =>
      commit(edits.setTrackProperties(get().history.present, trackId, patch)),

    toggleSolo: (trackId, additive) =>
      commit(edits.toggleSolo(get().history.present, trackId, additive)),

    addNote: (trackId, note) => {
      const result = edits.addNote(get().history.present, trackId, note);
      commit(result.doc);
      return result.id;
    },

    deleteNotes: (ids) => commit(edits.deleteNotes(get().history.present, ids)),

    moveNotes: (ids, move) => commit(edits.moveNotes(get().history.present, ids, move)),

    resizeNotes: (ids, deltaTicks, edge) =>
      commit(edits.resizeNotes(get().history.present, ids, deltaTicks, edge)),

    setNoteVelocity: (ids, velocity) =>
      commit(edits.setNoteVelocity(get().history.present, ids, velocity)),

    quantizeNotes: (ids, gridTicks) =>
      commit(edits.quantizeNotes(get().history.present, ids, gridTicks)),

    renameProject: (name) => commit({ ...get().history.present, name }),
  };
});

/** Convenience selector, since the document is read almost everywhere. */
export const selectDoc = (state: ProjectState): ProjectDoc => state.history.present;
