# Changelog

All notable changes to this project are recorded here. This project uses
[semantic versioning](https://semver.org/).

## 0.1.0 - September 20, 2026

First release.

### 🎹 Playback

- Opens `.mid`, `.midi`, and `.rmi` files through the toolbar, `Ctrl + O`, or by dropping a file on the window
- Plays through a bundled GeneralUser GS soundfont, with all 128 General MIDI instruments and drum kits
- Lookahead scheduler drives the synthesiser note by note, so mute, solo, looping, and edits take effect during playback
- Transport with play, pause, stop, a scrubber, a bar and beat readout, and master volume
- Loop any region by dragging across the ruler

### 🎼 Editing

- Piano roll with draw, select, and erase tools
- Move, resize, delete, nudge, and quantise notes, with snapping from 1/1 to 1/32 or off
- Undo and redo across every edit, up to 200 steps
- Per-track mute, solo, volume, visibility, and instrument, with a searchable GM instrument picker
- Saves back to a standard MIDI file, preserving notes, tempo, time signatures, track names, channels, and programs

### 🎨 Interface

- Dark charcoal interface with a per-track colour palette, note opacity following velocity
- Notes drawn on a canvas so large files stay responsive
- Piano keyboard down the left edge that auditions notes on the active track
- Full keyboard, mouse, and touch control, with a shortcut reference in the help dialog
- Track list collapses to a slide-in panel below 600px so the roll keeps the full width

### 🔒 Security

- The webview has no filesystem scope. Reading and writing files go through two narrow Rust commands that only accept MIDI file extensions.
