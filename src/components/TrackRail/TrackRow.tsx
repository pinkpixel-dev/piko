/**
 * One track in the rail: its colour, name, instrument, and mixer controls.
 *
 * Mute and solo are toggle buttons with a pressed state rather than coloured
 * dots, so their state is announced by a screen reader and is not carried by
 * colour alone.
 */

import { Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { programName } from "../../midi/gm";
import { TRACK_COLOR_COUNT, type Track } from "../../midi/types";
import { IconButton } from "../common/IconButton";
import "./TrackRow.css";

interface TrackRowProps {
  track: Track;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: (additive: boolean) => void;
  onToggleVisible: () => void;
  onVolumeChange: (volume: number) => void;
  onProgramClick: () => void;
}

export function TrackRow({
  track,
  index,
  isActive,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleVisible,
  onVolumeChange,
  onProgramClick,
}: TrackRowProps) {
  const colorVar = `var(--track-${(track.colorIndex % TRACK_COLOR_COUNT) + 1})`;
  const instrument = track.isDrum ? "Drum Kit" : programName(track.program);

  return (
    <div
      className="track-row"
      data-active={isActive || undefined}
      data-muted={track.muted || undefined}
    >
      <button
        type="button"
        className="track-row__identity"
        onClick={onSelect}
        aria-pressed={isActive}
        aria-label={`Select ${track.name}`}
        title={track.name}
      >
        <span className="track-row__swatch" style={{ background: colorVar }} aria-hidden="true" />
        <span className="track-row__labels">
          <span className="track-row__name">{track.name}</span>
          <span className="track-row__index tabular">{index + 1}</span>
        </span>
      </button>

      <button
        type="button"
        className="track-row__instrument"
        onClick={onProgramClick}
        aria-label={`Change instrument for ${track.name}. Currently ${instrument}.`}
        title={instrument}
      >
        {instrument}
      </button>

      <div className="track-row__controls">
        <IconButton
          icon={track.muted ? VolumeX : Volume2}
          label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
          size="sm"
          tone="mute"
          isToggle
          active={track.muted}
          onClick={onToggleMute}
        />

        <button
          type="button"
          className="track-row__solo"
          data-active={track.soloed || undefined}
          // Shift-click adds to the solo set instead of replacing it.
          onClick={(event) => onToggleSolo(event.shiftKey)}
          aria-pressed={track.soloed}
          aria-label={track.soloed ? `Unsolo ${track.name}` : `Solo ${track.name}`}
          title="Solo. Hold Shift to solo more than one track."
        >
          S
        </button>

        <IconButton
          icon={track.visible ? Eye : EyeOff}
          label={track.visible ? `Hide ${track.name} notes` : `Show ${track.name} notes`}
          size="sm"
          isToggle
          active={!track.visible}
          onClick={onToggleVisible}
        />

        <label className="track-row__volume">
          <span className="visually-hidden">{`Volume for ${track.name}`}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(track.volume * 100)}
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            aria-valuetext={`${Math.round(track.volume * 100)} percent`}
          />
        </label>
      </div>
    </div>
  );
}
