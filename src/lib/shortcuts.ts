/**
 * The keyboard shortcut table.
 *
 * Kept as data rather than a switch statement so the help dialog and the
 * handler read from one list. A shortcut that exists but is undocumented is a
 * shortcut nobody finds.
 */

export interface Shortcut {
  id: string;
  keys: string;
  description: string;
  group: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "play", keys: "Space", description: "Play or pause", group: "Playback" },
  { id: "stop", keys: "Enter", description: "Stop and return to the start", group: "Playback" },
  { id: "loop", keys: "L", description: "Turn the loop on or off", group: "Playback" },
  { id: "clearLoop", keys: "Shift + L", description: "Clear the loop region", group: "Playback" },
  { id: "follow", keys: "F", description: "Follow the playhead while playing", group: "Playback" },

  { id: "open", keys: "Ctrl + O", description: "Open a MIDI file", group: "File" },
  { id: "save", keys: "Ctrl + S", description: "Save", group: "File" },
  { id: "saveAs", keys: "Ctrl + Shift + S", description: "Save as a new file", group: "File" },

  { id: "undo", keys: "Ctrl + Z", description: "Undo", group: "Edit" },
  { id: "redo", keys: "Ctrl + Shift + Z", description: "Redo", group: "Edit" },
  { id: "selectAll", keys: "Ctrl + A", description: "Select every note", group: "Edit" },
  { id: "deselect", keys: "Escape", description: "Clear the selection", group: "Edit" },
  { id: "delete", keys: "Delete", description: "Delete the selected notes", group: "Edit" },
  { id: "quantize", keys: "Q", description: "Snap selected notes to the grid", group: "Edit" },
  { id: "nudgeLeft", keys: "Arrow Left", description: "Nudge notes one grid step earlier", group: "Edit" },
  { id: "nudgeRight", keys: "Arrow Right", description: "Nudge notes one grid step later", group: "Edit" },
  { id: "nudgeUp", keys: "Arrow Up", description: "Move notes up a semitone", group: "Edit" },
  { id: "nudgeDown", keys: "Arrow Down", description: "Move notes down a semitone", group: "Edit" },
  { id: "octaveUp", keys: "Shift + Arrow Up", description: "Move notes up an octave", group: "Edit" },
  { id: "octaveDown", keys: "Shift + Arrow Down", description: "Move notes down an octave", group: "Edit" },

  { id: "toolSelect", keys: "1", description: "Select tool", group: "Tools" },
  { id: "toolDraw", keys: "2", description: "Draw tool", group: "Tools" },
  { id: "toolErase", keys: "3", description: "Erase tool", group: "Tools" },

  { id: "zoomIn", keys: "= or Ctrl + Wheel", description: "Zoom in", group: "View" },
  { id: "zoomOut", keys: "- or Ctrl + Wheel", description: "Zoom out", group: "View" },
  { id: "zoomVertical", keys: "Ctrl + Shift + Wheel", description: "Zoom the note height", group: "View" },
  { id: "scrollHorizontal", keys: "Shift + Wheel", description: "Scroll left and right", group: "View" },
  { id: "help", keys: "?", description: "Show this list", group: "View" },
] as const;

export const SHORTCUT_GROUPS = ["Playback", "File", "Edit", "Tools", "View"] as const;
