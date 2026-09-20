/**
 * Global keyboard handling.
 *
 * Shortcuts are ignored while a text field has focus, so typing a track name or
 * searching instruments never triggers playback or deletes notes.
 */

import { useEffect } from "react";
import { allNoteIds } from "../state/edits";
import { snapTicks, useEditorStore } from "../state/editorStore";
import { useProjectStore } from "../state/projectStore";
import { useTransportStore } from "../state/transportStore";

export interface ShortcutHandlers {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onToggleShortcuts: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const project = useProjectStore.getState();
      const editor = useEditorStore.getState();
      const transport = useTransportStore.getState();
      const doc = project.history.present;
      const accel = event.ctrlKey || event.metaKey;

      // Nudging is expressed in grid steps, so it lines up with the grid that
      // is actually on screen rather than a fixed number of ticks.
      const step = snapTicks(doc.ppq, editor.snapDivision) || doc.ppq / 4;

      if (accel) {
        switch (event.key.toLowerCase()) {
          case "o":
            event.preventDefault();
            handlers.onOpen();
            return;
          case "s":
            event.preventDefault();
            if (event.shiftKey) handlers.onSaveAs();
            else handlers.onSave();
            return;
          case "z":
            event.preventDefault();
            if (event.shiftKey) project.redo();
            else project.undo();
            return;
          case "y":
            event.preventDefault();
            project.redo();
            return;
          case "a":
            event.preventDefault();
            editor.setSelection(allNoteIds(doc));
            return;
          default:
            return;
        }
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          void transport.togglePlay();
          return;

        case "Enter":
          event.preventDefault();
          transport.stop();
          return;

        case "Escape":
          editor.clearSelection();
          return;

        case "Delete":
        case "Backspace":
          if (editor.selection.size === 0) return;
          event.preventDefault();
          project.deleteNotes(editor.selection);
          editor.clearSelection();
          return;

        case "ArrowLeft":
        case "ArrowRight": {
          if (editor.selection.size === 0) return;
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          project.moveNotes(editor.selection, { deltaTicks: direction * step, deltaPitch: 0 });
          return;
        }

        case "ArrowUp":
        case "ArrowDown": {
          if (editor.selection.size === 0) return;
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
          const amount = event.shiftKey ? 12 : 1;
          project.moveNotes(editor.selection, { deltaTicks: 0, deltaPitch: direction * amount });
          return;
        }

        case "1":
          editor.setTool("select");
          return;
        case "2":
          editor.setTool("draw");
          return;
        case "3":
          editor.setTool("erase");
          return;

        case "=":
        case "+":
          editor.zoomHorizontally(1.3);
          return;
        case "-":
        case "_":
          editor.zoomHorizontally(1 / 1.3);
          return;

        case "?":
          handlers.onToggleShortcuts();
          return;

        default:
          break;
      }

      switch (event.key.toLowerCase()) {
        case "l":
          if (event.shiftKey) transport.clearLoop();
          else transport.toggleLoop();
          return;
        case "f":
          editor.setAutoScroll(!editor.autoScroll);
          return;
        case "q":
          if (editor.selection.size === 0) return;
          project.quantizeNotes(editor.selection, step);
          return;
        default:
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
