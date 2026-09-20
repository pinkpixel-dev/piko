/**
 * Pointer interactions for the piano roll: selecting, moving, resizing,
 * drawing, erasing, and panning.
 *
 * Drags are previewed rather than applied. Moving a note updates a small
 * preview object every frame and commits one edit on release, so a drag across
 * a thousand notes produces one undo step instead of a thousand, and the
 * document is never rebuilt mid-gesture.
 */

import { useCallback, useRef, useState } from "react";
import { auditionNote } from "../../state/transportStore";
import { snapDownToGrid, snapToGrid, snapTicks } from "../../state/editorStore";
import type { NoteId, ProjectDoc, TrackId } from "../../midi/types";
import { normaliseRect, xToTick, yToPitch, type Rect, type RollGeometry } from "./geometry";
import { hitTestNote, notesInRect } from "./hitTest";
import type { NotePreview } from "./render";

/** Movement below this is a click, not a drag. Keeps taps from nudging notes. */
const DRAG_THRESHOLD_PIXELS = 3;

export type EditTool = "select" | "draw" | "erase";

interface DragBase {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type DragState =
  | ({ kind: "marquee"; additive: boolean; currentX: number; currentY: number } & DragBase)
  | ({ kind: "move"; startTicks: number; startPitch: number } & DragBase)
  | ({ kind: "resize"; edge: "start" | "end"; startTicks: number } & DragBase)
  | ({ kind: "draw"; noteId: NoteId; trackId: TrackId; originTicks: number } & DragBase)
  | ({ kind: "erase" } & DragBase)
  | ({ kind: "pan"; startScrollTicks: number; startTopPitch: number } & DragBase)
  | null;

export interface RollDragCallbacks {
  setSelection: (ids: ReadonlySet<NoteId>) => void;
  toggleInSelection: (id: NoteId) => void;
  clearSelection: () => void;
  setActiveTrackId: (trackId: TrackId) => void;
  moveNotes: (ids: ReadonlySet<NoteId>, move: { deltaTicks: number; deltaPitch: number }) => void;
  resizeNotes: (ids: ReadonlySet<NoteId>, deltaTicks: number, edge: "start" | "end") => void;
  deleteNotes: (ids: ReadonlySet<NoteId>) => void;
  addNote: (trackId: TrackId, note: { pitch: number; ticks: number; durationTicks: number; velocity: number }) => NoteId;
  scrollTo: (scrollTicks: number, topPitch: number) => void;
}

export interface RollDragInput {
  geometry: RollGeometry;
  doc: ProjectDoc;
  tool: EditTool;
  snapDivision: number;
  selection: ReadonlySet<NoteId>;
  activeTrackId: TrackId | null;
  callbacks: RollDragCallbacks;
}

export interface RollDragResult {
  preview: NotePreview | null;
  marquee: Rect | null;
  cursor: string;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

const NO_PREVIEW: NotePreview = {
  deltaTicks: 0,
  deltaPitch: 0,
  resizeDeltaTicks: 0,
  resizeEdge: null,
};

export function useRollDrag(input: RollDragInput): RollDragResult {
  // The live input is held in a ref so the pointer handlers never go stale
  // between renders without having to be rebuilt on every state change.
  const latest = useRef(input);
  latest.current = input;

  const dragRef = useRef<DragState>(null);
  const [preview, setPreview] = useState<NotePreview | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState("default");

  const localPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { geometry, doc, tool, snapDivision, selection, activeTrackId, callbacks } =
        latest.current;
      const { x, y } = localPoint(event);
      const isCoarse = event.pointerType !== "mouse";

      event.currentTarget.setPointerCapture(event.pointerId);
      const base: DragBase = { pointerId: event.pointerId, startX: x, startY: y, moved: false };

      // Middle button always pans, whichever tool is selected.
      if (event.button === 1) {
        dragRef.current = {
          ...base,
          kind: "pan",
          startScrollTicks: geometry.scrollTicks,
          startTopPitch: geometry.topPitch,
        };
        setCursor("grabbing");
        return;
      }

      const hit = hitTestNote(
        { geometry, tracks: doc.tracks, activeTrackId, isCoarsePointer: isCoarse },
        x,
        y,
      );

      if (tool === "erase") {
        if (hit) callbacks.deleteNotes(new Set([hit.note.id]));
        dragRef.current = { ...base, kind: "erase" };
        return;
      }

      if (hit) {
        callbacks.setActiveTrackId(hit.track.id);

        if (event.shiftKey) {
          callbacks.toggleInSelection(hit.note.id);
          dragRef.current = { ...base, kind: "marquee", additive: true, currentX: x, currentY: y };
          return;
        }

        // Clicking an unselected note selects just it. Clicking one that is
        // already part of a selection keeps the whole selection, so a group can
        // be dragged without having to reselect it first.
        const workingSet = selection.has(hit.note.id)
          ? selection
          : new Set<NoteId>([hit.note.id]);
        if (!selection.has(hit.note.id)) callbacks.setSelection(workingSet);

        if (hit.zone === "body") {
          dragRef.current = {
            ...base,
            kind: "move",
            startTicks: xToTick(geometry, x),
            startPitch: yToPitch(geometry, y),
          };
          setPreview(NO_PREVIEW);
          setCursor("grabbing");
        } else {
          dragRef.current = {
            ...base,
            kind: "resize",
            edge: hit.zone,
            startTicks: xToTick(geometry, x),
          };
          setPreview(NO_PREVIEW);
          setCursor("ew-resize");
        }
        return;
      }

      if (tool === "draw") {
        const trackId = activeTrackId ?? doc.tracks[0]?.id;
        if (!trackId) return;

        const pitch = yToPitch(geometry, y);
        const ticks = Math.max(0, snapDownToGrid(xToTick(geometry, x), doc.ppq, snapDivision));
        // A new note is one grid step long, or a quarter note when snapping is
        // off, so drawing produces something audible without a drag.
        const step = snapTicks(doc.ppq, snapDivision);
        const durationTicks = step > 0 ? step : doc.ppq;

        const noteId = callbacks.addNote(trackId, { pitch, ticks, durationTicks, velocity: 100 });
        callbacks.setSelection(new Set([noteId]));
        auditionNote(trackId, pitch, 100);

        dragRef.current = { ...base, kind: "draw", noteId, trackId, originTicks: ticks };
        setPreview(NO_PREVIEW);
        setCursor("ew-resize");
        return;
      }

      // Empty space. A finger pans, since that is what a touchscreen expects,
      // while a mouse drags out a selection rectangle.
      if (isCoarse) {
        dragRef.current = {
          ...base,
          kind: "pan",
          startScrollTicks: geometry.scrollTicks,
          startTopPitch: geometry.topPitch,
        };
        setCursor("grabbing");
        return;
      }

      if (!event.shiftKey) callbacks.clearSelection();
      dragRef.current = {
        ...base,
        kind: "marquee",
        additive: event.shiftKey,
        currentX: x,
        currentY: y,
      };
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { geometry, doc, snapDivision, selection, activeTrackId, callbacks } = latest.current;
      const drag = dragRef.current;
      const { x, y } = localPoint(event);

      if (!drag) {
        // With no drag in progress the cursor still has to say what a press
        // would do, so the edges of a note read as resize handles.
        const hit = hitTestNote(
          {
            geometry,
            tracks: doc.tracks,
            activeTrackId,
            isCoarsePointer: event.pointerType !== "mouse",
          },
          x,
          y,
        );
        setCursor(hit ? (hit.zone === "body" ? "grab" : "ew-resize") : "default");
        return;
      }

      if (drag.pointerId !== event.pointerId) return;

      if (
        !drag.moved &&
        Math.hypot(x - drag.startX, y - drag.startY) < DRAG_THRESHOLD_PIXELS
      ) {
        return;
      }
      drag.moved = true;

      switch (drag.kind) {
        case "pan": {
          const deltaTicks = (drag.startX - x) / geometry.pixelsPerTick;
          const deltaPitch = Math.round((y - drag.startY) / geometry.rowHeight);
          callbacks.scrollTo(
            Math.max(0, drag.startScrollTicks + deltaTicks),
            drag.startTopPitch + deltaPitch,
          );
          break;
        }

        case "marquee": {
          drag.currentX = x;
          drag.currentY = y;
          setMarquee(normaliseRect(drag.startX, drag.startY, x, y));
          break;
        }

        case "move": {
          const rawTicks = xToTick(geometry, x) - drag.startTicks;
          // Snapping applies to where the note lands, not to how far it moved,
          // so a note dragged onto the grid sits exactly on it.
          const anchor = doc.tracks
            .flatMap((track) => track.notes)
            .find((note) => selection.has(note.id));
          const deltaTicks = anchor
            ? snapToGrid(anchor.ticks + rawTicks, doc.ppq, snapDivision) - anchor.ticks
            : Math.round(rawTicks);

          setPreview({
            deltaTicks,
            deltaPitch: yToPitch(geometry, y) - drag.startPitch,
            resizeDeltaTicks: 0,
            resizeEdge: null,
          });
          break;
        }

        case "resize": {
          const raw = xToTick(geometry, x) - drag.startTicks;
          const step = snapTicks(doc.ppq, snapDivision);
          const deltaTicks = step > 0 ? Math.round(raw / step) * step : Math.round(raw);
          setPreview({
            deltaTicks: 0,
            deltaPitch: 0,
            resizeDeltaTicks: deltaTicks,
            resizeEdge: drag.edge,
          });
          break;
        }

        case "draw": {
          const step = snapTicks(doc.ppq, snapDivision);
          const pointerTicks = xToTick(geometry, x);
          const snapped =
            step > 0
              ? Math.max(drag.originTicks + step, snapToGrid(pointerTicks, doc.ppq, snapDivision))
              : Math.max(drag.originTicks + 1, Math.round(pointerTicks));
          const created = doc.tracks
            .find((track) => track.id === drag.trackId)
            ?.notes.find((note) => note.id === drag.noteId);
          if (created) {
            setPreview({
              deltaTicks: 0,
              deltaPitch: 0,
              resizeDeltaTicks: snapped - drag.originTicks - created.durationTicks,
              resizeEdge: "end",
            });
          }
          break;
        }

        case "erase": {
          const hit = hitTestNote(
            {
              geometry,
              tracks: doc.tracks,
              activeTrackId,
              isCoarsePointer: event.pointerType !== "mouse",
            },
            x,
            y,
          );
          if (hit) callbacks.deleteNotes(new Set([hit.note.id]));
          break;
        }
      }
    },
    [localPoint],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const { geometry, doc, selection, activeTrackId, callbacks } = latest.current;
      const drag = dragRef.current;
      dragRef.current = null;
      setCursor("default");

      if (!drag || drag.pointerId !== event.pointerId) {
        setPreview(null);
        setMarquee(null);
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const { x, y } = localPoint(event);

      switch (drag.kind) {
        case "marquee": {
          if (drag.moved) {
            const rect = normaliseRect(drag.startX, drag.startY, x, y);
            const found = notesInRect(geometry, doc.tracks, rect, null);
            if (drag.additive) {
              const merged = new Set(selection);
              for (const id of found) merged.add(id);
              callbacks.setSelection(merged);
            } else {
              callbacks.setSelection(found);
            }
          }
          break;
        }

        case "move": {
          if (drag.moved && preview) {
            callbacks.moveNotes(selection, {
              deltaTicks: preview.deltaTicks,
              deltaPitch: preview.deltaPitch,
            });
            // Hearing the result confirms the new pitch without pressing play.
            const anchorTrack = doc.tracks.find((track) => track.id === activeTrackId);
            const anchorNote = anchorTrack?.notes.find((note) => selection.has(note.id));
            if (anchorTrack && anchorNote) {
              auditionNote(anchorTrack.id, anchorNote.pitch + preview.deltaPitch, anchorNote.velocity);
            }
          }
          break;
        }

        case "resize":
        case "draw": {
          if (drag.moved && preview && preview.resizeEdge) {
            callbacks.resizeNotes(selection, preview.resizeDeltaTicks, preview.resizeEdge);
          }
          break;
        }
      }

      setPreview(null);
      setMarquee(null);
    },
    [localPoint, preview],
  );

  return { preview, marquee, cursor, onPointerDown, onPointerMove, onPointerUp };
}
