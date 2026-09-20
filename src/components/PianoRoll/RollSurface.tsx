/**
 * The canvas the notes are drawn on, plus the playhead that moves over it.
 *
 * Drawing runs from a requestAnimationFrame loop rather than from React
 * renders. The playhead moves with the audio clock, which ticks far faster than
 * React should re-render, so the loop reads the position straight from the
 * engine and repaints. React is only involved when something structural
 * changes, such as the selection or the document.
 */

import { useEffect, useRef } from "react";
import type { MeterMap } from "../../midi/timing";
import type { NoteId, ProjectDoc } from "../../midi/types";
import { tickToX, type Rect, type RollGeometry } from "./geometry";
import { renderRoll, type NotePreview, type RenderTrack } from "./render";
import "./RollSurface.css";

interface RollSurfaceProps {
  geometry: RollGeometry;
  doc: ProjectDoc;
  meter: MeterMap;
  selection: ReadonlySet<NoteId>;
  activeTrackId: string | null;
  loop: { enabled: boolean; startTicks: number; endTicks: number };
  preview: NotePreview | null;
  marquee: Rect | null;
  cursor: string;
  /** Reads the live playhead position in ticks. */
  getPositionTicks: () => number;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

export function RollSurface(props: RollSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Everything the draw loop needs, refreshed each render so the loop itself
  // never needs to be torn down and restarted.
  const frameProps = useRef(props);
  frameProps.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let handle = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    let lastRatio = 0;

    const frame = () => {
      const current = frameProps.current;
      const { geometry, doc } = current;
      const ratio = window.devicePixelRatio || 1;

      // Resizing the backing store clears it, so it only happens when the size
      // or the display density has actually changed.
      if (geometry.width !== lastWidth || geometry.height !== lastHeight || ratio !== lastRatio) {
        canvas.width = Math.max(1, Math.floor(geometry.width * ratio));
        canvas.height = Math.max(1, Math.floor(geometry.height * ratio));
        canvas.style.width = `${geometry.width}px`;
        canvas.style.height = `${geometry.height}px`;
        lastWidth = geometry.width;
        lastHeight = geometry.height;
        lastRatio = ratio;
      }

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const renderTracks: RenderTrack[] = doc.tracks.map((track) => {
        let maxDurationTicks = 0;
        for (const note of track.notes) {
          if (note.durationTicks > maxDurationTicks) maxDurationTicks = note.durationTicks;
        }
        return { track, maxDurationTicks };
      });

      renderRoll(ctx, {
        geometry,
        tracks: renderTracks,
        meter: current.meter,
        selection: current.selection,
        activeTrackId: current.activeTrackId,
        loop: current.loop,
        preview: current.preview,
        marquee: current.marquee,
      });

      const playhead = playheadRef.current;
      if (playhead) {
        const x = tickToX(geometry, current.getPositionTicks());
        const visible = x >= 0 && x <= geometry.width;
        playhead.style.visibility = visible ? "visible" : "hidden";
        // transform rather than left, so the browser never re-lays out.
        if (visible) playhead.style.transform = `translateX(${x}px)`;
      }

      handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <div className="roll-surface">
      <canvas
        ref={canvasRef}
        className="roll-surface__canvas"
        style={{ cursor: props.cursor }}
        onPointerDown={props.onPointerDown}
        onPointerMove={props.onPointerMove}
        onPointerUp={props.onPointerUp}
        onPointerCancel={props.onPointerUp}
        role="application"
        aria-label="Piano roll editor"
      />
      <div ref={playheadRef} className="roll-surface__playhead" aria-hidden="true" />
    </div>
  );
}
