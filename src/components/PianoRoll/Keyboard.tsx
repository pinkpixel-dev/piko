/**
 * The piano keyboard down the left edge.
 *
 * Doubles as an instrument: pressing a key auditions that pitch on the active
 * track, which is the quickest way to find the note you want before drawing it.
 */

import { isBlackKey, noteName } from "../../midi/gm";
import { auditionNote } from "../../state/transportStore";
import { pitchToY, visibleHighestPitch, visibleLowestPitch, type RollGeometry } from "./geometry";
import "./Keyboard.css";

interface KeyboardProps {
  geometry: RollGeometry;
  activeTrackId: string | null;
}

export function Keyboard({ geometry, activeTrackId }: KeyboardProps) {
  const lowest = visibleLowestPitch(geometry);
  const highest = visibleHighestPitch(geometry);
  const keys: number[] = [];
  for (let pitch = highest; pitch >= lowest; pitch -= 1) keys.push(pitch);

  // Note names need room to read; below that only the C of each octave is
  // labelled, which is still enough to keep your bearings.
  const showAllNames = geometry.rowHeight >= 16;

  return (
    <div className="keyboard" role="group" aria-label="Piano keyboard">
      {keys.map((pitch) => {
        const black = isBlackKey(pitch);
        const name = noteName(pitch);
        const labelled = showAllNames || pitch % 12 === 0;

        return (
          <button
            key={pitch}
            type="button"
            className="keyboard__key"
            data-black={black || undefined}
            style={{ top: pitchToY(geometry, pitch), height: geometry.rowHeight }}
            onPointerDown={() => {
              if (activeTrackId) auditionNote(activeTrackId, pitch, 100);
            }}
            disabled={!activeTrackId}
            aria-label={`Play ${name}`}
            title={name}
          >
            {labelled && geometry.rowHeight >= 9 ? (
              <span className="keyboard__label">{name}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
