/**
 * The transport bar: play, stop, the position readout, the scrubber, and the
 * master volume.
 *
 * The time readout and the scrubber are driven from a requestAnimationFrame
 * loop reading the engine directly. Routing the playhead through React state
 * would re-render the editor on every frame of playback.
 */

import { useEffect, useRef } from "react";
import { Play, Pause, Square, Volume2, VolumeX, Repeat } from "lucide-react";
import { formatBarBeat, formatTempo, formatTime } from "../../lib/format";
import { useProjectStore } from "../../state/projectStore";
import { useTransportStore } from "../../state/transportStore";
import { IconButton } from "../common/IconButton";
import "./Transport.css";

export function Transport() {
  const timing = useProjectStore((state) => state.timing);
  const durationTicks = useProjectStore((state) => state.durationTicks);

  const transport = useTransportStore();
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const tempoRef = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const isScrubbing = useRef(false);

  const durationSeconds = timing.tempo.ticksToSeconds(durationTicks);

  useEffect(() => {
    let handle = 0;

    const frame = () => {
      const ticks = useTransportStore.getState().positionTicks();
      const seconds = timing.tempo.ticksToSeconds(ticks);
      const position = timing.meter.positionAt(ticks);

      if (timeRef.current) timeRef.current.textContent = formatTime(seconds);
      if (barRef.current) barRef.current.textContent = formatBarBeat(position.bar, position.beat);
      if (tempoRef.current) tempoRef.current.textContent = formatTempo(timing.tempo.bpmAt(ticks));
      // While a finger is on the scrubber it belongs to the person, not the clock.
      if (scrubRef.current && !isScrubbing.current) {
        scrubRef.current.value = String(Math.min(ticks, durationTicks));
      }

      handle = requestAnimationFrame(frame);
    };

    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [timing, durationTicks]);

  const hasSong = durationTicks > 0;

  return (
    <footer className="transport">
      <div className="transport__controls">
        <IconButton
          icon={transport.isPlaying ? Pause : Play}
          label={transport.isPlaying ? "Pause" : "Play"}
          size="lg"
          tone="accent"
          onClick={() => void transport.togglePlay()}
          disabled={!hasSong || transport.status === "error"}
        />
        <IconButton
          icon={Square}
          label="Stop and return to the start"
          onClick={transport.stop}
          disabled={!hasSong}
        />
        <IconButton
          icon={Repeat}
          label={transport.loopEnabled ? "Turn loop off" : "Turn loop on"}
          tone="accent"
          isToggle
          active={transport.loopEnabled}
          onClick={transport.toggleLoop}
          disabled={transport.loopEndTicks <= transport.loopStartTicks}
        />
      </div>

      <div className="transport__readout">
        <span className="transport__time tabular" ref={timeRef}>
          0:00.0
        </span>
        <span className="transport__duration tabular">/ {formatTime(durationSeconds)}</span>
        <span className="transport__divider" aria-hidden="true" />
        <span className="transport__meta">
          <span className="transport__meta-label">Bar</span>
          <span className="tabular" ref={barRef}>
            1.1
          </span>
        </span>
        <span className="transport__meta">
          <span className="transport__meta-label">BPM</span>
          <span className="tabular" ref={tempoRef}>
            120
          </span>
        </span>
      </div>

      <input
        ref={scrubRef}
        className="transport__scrubber"
        type="range"
        min={0}
        max={Math.max(1, durationTicks)}
        defaultValue={0}
        disabled={!hasSong}
        onPointerDown={() => {
          isScrubbing.current = true;
        }}
        onPointerUp={() => {
          isScrubbing.current = false;
        }}
        onChange={(event) => transport.seekTicks(Number(event.target.value))}
        aria-label="Playback position"
      />

      <div className="transport__volume">
        <IconButton
          icon={transport.isMuted ? VolumeX : Volume2}
          label={transport.isMuted ? "Unmute" : "Mute"}
          isToggle
          active={transport.isMuted}
          onClick={transport.toggleMute}
        />
        <label className="transport__volume-slider">
          <span className="visually-hidden">Master volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(transport.masterVolume * 100)}
            onChange={(event) => transport.setMasterVolume(Number(event.target.value) / 100)}
            aria-valuetext={`${Math.round(transport.masterVolume * 100)} percent`}
          />
        </label>
      </div>
    </footer>
  );
}
