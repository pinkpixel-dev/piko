/**
 * The top bar: file actions on the left, editing tools in the middle, view
 * controls on the right.
 */

import {
  Eraser,
  FolderOpen,
  HelpCircle,
  Magnet,
  MousePointer2,
  PanelLeft,
  Pencil,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { SNAP_DIVISIONS, useEditorStore } from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import { IconButton } from "../common/IconButton";
import "./Toolbar.css";

interface ToolbarProps {
  onOpen: () => void;
  onSave: () => void;
  onShowShortcuts: () => void;
  isBusy: boolean;
}

export function Toolbar({ onOpen, onSave, onShowShortcuts, isBusy }: ToolbarProps) {
  const doc = useProjectStore((state) => state.history.present);
  const isDirty = useProjectStore((state) => state.isDirty);
  const canUndo = useProjectStore((state) => state.canUndo());
  const canRedo = useProjectStore((state) => state.canRedo());
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);

  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const snapDivision = useEditorStore((state) => state.snapDivision);
  const setSnapDivision = useEditorStore((state) => state.setSnapDivision);
  const zoomHorizontally = useEditorStore((state) => state.zoomHorizontally);
  const railOpen = useEditorStore((state) => state.railOpen);
  const toggleRail = useEditorStore((state) => state.toggleRail);

  const hasSong = doc.tracks.length > 0;

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <span className="toolbar__rail-toggle">
          <IconButton
            icon={PanelLeft}
            label={railOpen ? "Hide the track list" : "Show the track list"}
            isToggle
            active={railOpen}
            tone="accent"
            onClick={toggleRail}
          />
        </span>
        <IconButton icon={FolderOpen} label="Open a MIDI file" onClick={onOpen} disabled={isBusy} />
        <IconButton
          icon={Save}
          label="Save"
          onClick={onSave}
          disabled={!hasSong || isBusy}
        />
        <span className="toolbar__separator" aria-hidden="true" />
        <IconButton icon={Undo2} label="Undo" onClick={undo} disabled={!canUndo} />
        <IconButton icon={Redo2} label="Redo" onClick={redo} disabled={!canRedo} />
      </div>

      <div className="toolbar__title">
        <h1 className="toolbar__name" title={doc.name}>
          {doc.name}
        </h1>
        {isDirty ? (
          <span className="toolbar__dirty" title="This song has unsaved changes">
            Unsaved
          </span>
        ) : null}
      </div>

      <div className="toolbar__group">
        <div className="toolbar__tools" role="group" aria-label="Editing tool">
          <IconButton
            icon={MousePointer2}
            label="Select tool"
            isToggle
            active={tool === "select"}
            tone="accent"
            onClick={() => setTool("select")}
          />
          <IconButton
            icon={Pencil}
            label="Draw tool"
            isToggle
            active={tool === "draw"}
            tone="accent"
            onClick={() => setTool("draw")}
          />
          <IconButton
            icon={Eraser}
            label="Erase tool"
            isToggle
            active={tool === "erase"}
            tone="accent"
            onClick={() => setTool("erase")}
          />
        </div>

        <span className="toolbar__separator" aria-hidden="true" />

        <label className="toolbar__snap" title="Snap notes to this grid division">
          <Magnet size={14} strokeWidth={2} aria-hidden="true" />
          <span className="visually-hidden">Snap to grid</span>
          <select
            value={snapDivision}
            onChange={(event) => setSnapDivision(Number(event.target.value))}
          >
            {SNAP_DIVISIONS.map((division) => (
              <option key={division.value} value={division.value}>
                {division.label}
              </option>
            ))}
          </select>
        </label>

        <span className="toolbar__separator" aria-hidden="true" />

        <span className="toolbar__zoom">
          <IconButton icon={ZoomOut} label="Zoom out" onClick={() => zoomHorizontally(1 / 1.3)} />
          <IconButton icon={ZoomIn} label="Zoom in" onClick={() => zoomHorizontally(1.3)} />
        </span>
        <IconButton icon={HelpCircle} label="Keyboard shortcuts" onClick={onShowShortcuts} />
      </div>
    </header>
  );
}
