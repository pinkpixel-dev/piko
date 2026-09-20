/**
 * The track list beside the roll. Also the mixer: every track's mute, solo,
 * volume, visibility, and instrument live here.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { nextId } from "../../lib/ids";
import { TRACK_COLOR_COUNT } from "../../midi/types";
import { useEditorStore } from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import { InstrumentPicker } from "./InstrumentPicker";
import { TrackRow } from "./TrackRow";
import "./TrackRail.css";

export function TrackRail() {
  const doc = useProjectStore((state) => state.history.present);
  const setTrackProperties = useProjectStore((state) => state.setTrackProperties);
  const toggleSolo = useProjectStore((state) => state.toggleSolo);
  const loadProject = useProjectStore((state) => state.loadProject);
  const filePath = useProjectStore((state) => state.filePath);

  const activeTrackId = useEditorStore((state) => state.activeTrackId);
  const setActiveTrackId = useEditorStore((state) => state.setActiveTrackId);

  const [pickerTrackId, setPickerTrackId] = useState<string | null>(null);
  const pickerTrack = doc.tracks.find((track) => track.id === pickerTrackId) ?? null;

  const addTrack = () => {
    const track = {
      id: nextId("t"),
      name: `Track ${doc.tracks.length + 1}`,
      channel: Math.min(15, doc.tracks.length),
      program: 0,
      isDrum: false,
      colorIndex: doc.tracks.length % TRACK_COLOR_COUNT,
      notes: [],
      muted: false,
      soloed: false,
      volume: 1,
      visible: true,
    };
    loadProject({ ...doc, tracks: [...doc.tracks, track] }, filePath);
    setActiveTrackId(track.id);
  };

  return (
    <aside className="track-rail" aria-label="Tracks">
      <header className="track-rail__header">
        <h2 className="track-rail__title">Tracks</h2>
        <button type="button" className="track-rail__add" onClick={addTrack}>
          <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
          Add
        </button>
      </header>

      <div className="track-rail__list">
        {doc.tracks.length === 0 ? (
          <p className="track-rail__empty">
            No tracks yet. Open a MIDI file, or add a track and start drawing notes.
          </p>
        ) : (
          doc.tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              isActive={track.id === activeTrackId}
              onSelect={() => setActiveTrackId(track.id)}
              onToggleMute={() => setTrackProperties(track.id, { muted: !track.muted })}
              onToggleSolo={(additive) => toggleSolo(track.id, additive)}
              onToggleVisible={() => setTrackProperties(track.id, { visible: !track.visible })}
              onVolumeChange={(volume) => setTrackProperties(track.id, { volume })}
              onProgramClick={() => setPickerTrackId(track.id)}
            />
          ))
        )}
      </div>

      {pickerTrack ? (
        <InstrumentPicker
          trackName={pickerTrack.name}
          program={pickerTrack.program}
          onSelect={(program) => {
            setTrackProperties(pickerTrack.id, { program, isDrum: false });
            setPickerTrackId(null);
          }}
          onClose={() => setPickerTrackId(null)}
        />
      ) : null}
    </aside>
  );
}
