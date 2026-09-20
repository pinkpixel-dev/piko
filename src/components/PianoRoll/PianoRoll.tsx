/**
 * Puts the piano roll together: the ruler on top, the keyboard down the side,
 * and the note canvas filling the rest. Owns the viewport size, wheel and pinch
 * handling, and following the playhead during playback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import { useTransportStore } from "../../state/transportStore";
import { Keyboard } from "./Keyboard";
import { RollSurface } from "./RollSurface";
import { Ruler } from "./Ruler";
import { visibleEndTick, type RollGeometry } from "./geometry";
import { useRollDrag } from "./useRollDrag";
import "./PianoRoll.css";

/** Wheel zoom step per notch. */
const ZOOM_STEP = 1.12;
/** Keeps the playhead this far from the right edge when following. */
const FOLLOW_MARGIN = 0.25;

export function PianoRoll() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const doc = useProjectStore((state) => state.history.present);
  const timing = useProjectStore((state) => state.timing);
  const moveNotes = useProjectStore((state) => state.moveNotes);
  const resizeNotes = useProjectStore((state) => state.resizeNotes);
  const deleteNotes = useProjectStore((state) => state.deleteNotes);
  const addNote = useProjectStore((state) => state.addNote);

  const editor = useEditorStore();
  const transport = useTransportStore();
  const positionTicksRef = useTransportStore((state) => state.positionTicks);

  // The canvas needs its size in pixels, which only the browser knows.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry: RollGeometry = useMemo(
    () => ({
      scrollTicks: editor.scrollTicks,
      topPitch: editor.topPitch,
      pixelsPerTick: editor.pixelsPerTick,
      rowHeight: editor.rowHeight,
      width: size.width,
      height: size.height,
    }),
    [editor.scrollTicks, editor.topPitch, editor.pixelsPerTick, editor.rowHeight, size],
  );

  const loop = useMemo(
    () => ({
      enabled: transport.loopEnabled,
      startTicks: transport.loopStartTicks,
      endTicks: transport.loopEndTicks,
    }),
    [transport.loopEnabled, transport.loopStartTicks, transport.loopEndTicks],
  );

  const drag = useRollDrag({
    geometry,
    doc,
    tool: editor.tool,
    snapDivision: editor.snapDivision,
    selection: editor.selection,
    activeTrackId: editor.activeTrackId,
    callbacks: {
      setSelection: editor.setSelection,
      toggleInSelection: editor.toggleInSelection,
      clearSelection: editor.clearSelection,
      setActiveTrackId: editor.setActiveTrackId,
      moveNotes,
      resizeNotes,
      deleteNotes,
      addNote,
      scrollTo: (scrollTicks, topPitch) => {
        editor.setScrollTicks(scrollTicks);
        editor.setTopPitch(topPitch);
      },
    },
  });

  /*
   * Wheel handling is attached by hand rather than through onWheel, because
   * React attaches wheel listeners passively and a passive listener cannot call
   * preventDefault. Without that the page itself scrolls while zooming.
   */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = useEditorStore.getState();

      if (event.ctrlKey || event.metaKey) {
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        if (event.shiftKey) state.zoomVertically(factor);
        else state.zoomHorizontally(factor);
        return;
      }

      if (event.shiftKey) {
        state.setScrollTicks(state.scrollTicks + event.deltaY / state.pixelsPerTick);
        return;
      }

      state.scrollBy(
        event.deltaX / state.pixelsPerTick,
        Math.round(event.deltaY / state.rowHeight),
      );
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // Follow the playhead so a song plays itself into view.
  useEffect(() => {
    if (!transport.isPlaying || !editor.autoScroll || size.width === 0) return;

    let handle = 0;
    const follow = () => {
      const state = useEditorStore.getState();
      const position = positionTicksRef();
      const view: RollGeometry = {
        scrollTicks: state.scrollTicks,
        topPitch: state.topPitch,
        pixelsPerTick: state.pixelsPerTick,
        rowHeight: state.rowHeight,
        width: size.width,
        height: size.height,
      };
      const end = visibleEndTick(view);
      const span = end - state.scrollTicks;

      if (position > end - span * FOLLOW_MARGIN || position < state.scrollTicks) {
        // Jump so the playhead sits near the left, leaving most of the view
        // showing what is about to be played rather than what just was.
        state.setScrollTicks(Math.max(0, position - span * FOLLOW_MARGIN));
      }

      handle = requestAnimationFrame(follow);
    };

    handle = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(handle);
  }, [transport.isPlaying, editor.autoScroll, size.width, size.height, positionTicksRef]);

  const handleSeek = useCallback(
    (ticks: number) => transport.seekTicks(ticks),
    [transport],
  );

  const handleSetLoop = useCallback(
    (startTicks: number, endTicks: number) => transport.setLoopRegion(startTicks, endTicks),
    [transport],
  );

  return (
    <div className="piano-roll">
      <div className="piano-roll__ruler-row">
        <div className="piano-roll__ruler-spacer" />
        <Ruler
          geometry={geometry}
          meter={timing.meter}
          loop={loop}
          onSeek={handleSeek}
          onSetLoop={handleSetLoop}
        />
      </div>

      <div className="piano-roll__body">
        <Keyboard geometry={geometry} activeTrackId={editor.activeTrackId} />
        <div className="piano-roll__viewport" ref={viewportRef}>
          <RollSurface
            geometry={geometry}
            doc={doc}
            meter={timing.meter}
            selection={editor.selection}
            activeTrackId={editor.activeTrackId}
            loop={loop}
            preview={drag.preview}
            marquee={drag.marquee}
            cursor={drag.cursor}
            getPositionTicks={positionTicksRef}
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
          />
        </div>
      </div>
    </div>
  );
}
