/**
 * Bar numbers across the top, and the surface for setting the loop region.
 *
 * Clicking moves the playhead. Dragging sets a loop, which is the shortest path
 * from "I want to hear this part again" to hearing it.
 */

import { useCallback, useRef, useState } from "react";
import type { MeterMap } from "../../midi/timing";
import { tickToX, visibleEndTick, xToTick, type RollGeometry } from "./geometry";
import "./Ruler.css";

interface RulerProps {
  geometry: RollGeometry;
  meter: MeterMap;
  loop: { enabled: boolean; startTicks: number; endTicks: number };
  onSeek: (ticks: number) => void;
  onSetLoop: (startTicks: number, endTicks: number) => void;
}

/** A drag shorter than this is treated as a click, not a loop region. */
const LOOP_DRAG_THRESHOLD_PIXELS = 4;

export function Ruler({ geometry, meter, loop, onSeek, onSetLoop }: RulerProps) {
  const dragStart = useRef<{ x: number; ticks: number; pointerId: number } | null>(null);
  const [dragTicks, setDragTicks] = useState<number | null>(null);

  const ticksPerBar = meter.ticksPerBarAt(geometry.scrollTicks);
  const endTick = visibleEndTick(geometry);
  const barSpacing = ticksPerBar * geometry.pixelsPerTick;

  // Labelling every bar becomes unreadable when they are close together, so the
  // step grows until there is room for the text.
  const labelStep = Math.max(1, Math.ceil(56 / Math.max(barSpacing, 1)));

  const marks: Array<{ ticks: number; bar: number; labelled: boolean }> = [];
  const firstBar = meter.positionAt(geometry.scrollTicks).bar;
  for (let bar = firstBar; ; bar += 1) {
    const ticks = meter.ticksAtBar(bar);
    if (ticks > endTick) break;
    marks.push({ ticks, bar, labelled: (bar - 1) % labelStep === 0 });
    if (marks.length > 512) break;
  }

  const pointTicks = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      return Math.max(0, xToTick(geometry, event.clientX - bounds.left));
    },
    [geometry],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      x: event.clientX - bounds.left,
      ticks: pointTicks(event),
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (Math.abs(event.clientX - bounds.left - start.x) < LOOP_DRAG_THRESHOLD_PIXELS) return;
    setDragTicks(pointTicks(event));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragTicks === null) onSeek(start.ticks);
    else onSetLoop(Math.min(start.ticks, dragTicks), Math.max(start.ticks, dragTicks));

    setDragTicks(null);
  };

  const pending =
    dragStart.current && dragTicks !== null
      ? { start: Math.min(dragStart.current.ticks, dragTicks), end: Math.max(dragStart.current.ticks, dragTicks) }
      : null;
  const shownLoop = pending ?? (loop.endTicks > loop.startTicks ? { start: loop.startTicks, end: loop.endTicks } : null);

  return (
    <div
      className="ruler"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      tabIndex={0}
      aria-label="Timeline. Click to move the playhead, drag to set a loop."
      aria-valuemin={0}
      aria-valuenow={Math.round(geometry.scrollTicks)}
      aria-valuemax={Math.round(endTick)}
    >
      {shownLoop ? (
        <div
          className="ruler__loop"
          data-enabled={loop.enabled || pending !== null || undefined}
          style={{
            left: tickToX(geometry, shownLoop.start),
            width: Math.max(2, (shownLoop.end - shownLoop.start) * geometry.pixelsPerTick),
          }}
        />
      ) : null}

      {marks.map((mark) => (
        <div
          key={mark.bar}
          className="ruler__mark"
          data-labelled={mark.labelled || undefined}
          style={{ left: tickToX(geometry, mark.ticks) }}
        >
          {mark.labelled ? <span className="ruler__label tabular">{mark.bar}</span> : null}
        </div>
      ))}
    </div>
  );
}
