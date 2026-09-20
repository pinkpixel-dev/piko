# MIDI Player

A desktop MIDI player and piano-roll editor. Open a `.mid` file, hear it play through a real General MIDI soundfont, and edit the notes directly on the roll.

It ships with the soundfont built in, so there is nothing to download and nothing to configure. No account, no network, no telemetry. Open a file and it plays.

I built this because most MIDI players either just play the file with no way to see what is in it, or they are a full DAW when all I wanted was to look at a song, mute a track, fix a few notes, and save it back out.

## What it does

- Opens `.mid`, `.midi`, and `.rmi` files, either from the Open button or by dropping one on the window
- Plays them through a bundled General MIDI soundfont, so every instrument sounds like the instrument it is meant to be
- Shows every track on a piano roll, coloured per track, with note opacity following velocity
- Per-track mute, solo, volume, visibility, and instrument, with all 128 GM instruments searchable
- Edits notes: draw, select, drag, resize, delete, nudge, and quantise to the grid
- Undo and redo across every edit, up to 200 steps
- Loop any region by dragging across the ruler
- Saves back to a standard MIDI file that other software reads

## Requirements

To run a build you need nothing beyond the app itself.

To build it from source you need:

- Node.js 20 or newer
- Rust 1.77 or newer
- The [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform. On Linux that is `webkit2gtk-4.1` and its build tools.

## Install from source

Clone the repository, then install the dependencies:

```bash
npm install
```

Run it in development mode:

```bash
npm run tauri dev
```

Build a release binary and an installer:

```bash
npm run tauri build
```

The build writes to `src-tauri/target/release/`. Installer packages land in `src-tauri/target/release/bundle/`.

On Linux, build the `.deb`, `.rpm`, and AppImage packages together:

```bash
npm run build:linux
```

Release packages use the manual **Build Linux packages** workflow in GitHub
Actions. It builds on Ubuntu 22.04 so Tauri can bundle the GStreamer files that
WebKitGTK needs for audio playback.

Open the repository's Actions tab, select **Build Linux packages**, and run the
workflow. Download `piko-linux-x86_64` after the job finishes. The artifact
contains the `.deb`, `.rpm`, and AppImage packages. The workflow does not create
or publish a GitHub Release.

## Using it

Open a file with the folder button in the toolbar, with `Ctrl + O`, or by dropping a `.mid` file onto the window. The view frames the song vertically, so the notes are on screen without scrolling to find them.

Press Space to play. Press it again to pause. Enter stops and returns to the start.

### The three tools

The toolbar has a tool switcher, and the number keys select them.

| Key | Tool | What a drag does |
|---|---|---|
| `1` | Select | Drags a box to select notes, or moves and resizes the notes you grab |
| `2` | Draw | Creates a note and sets its length |
| `3` | Erase | Deletes every note you drag across |

With the Select tool, grab the middle of a note to move it and either end to change its length. Notes snap to the grid division in the toolbar. Set that to Off for free positioning.

### Looping a section

Drag across the ruler at the top to set the loop region, which turns looping on. Press `L` to turn it off and on, and `Shift + L` to clear it.

### Tracks

The track list on the left holds the mixer. Each track has mute, solo, a visibility toggle that hides its notes from the roll without silencing it, and a volume slider. Clicking the instrument name opens the GM instrument picker.

Solo is exclusive by default. Hold `Shift` while clicking solo to solo more than one track at once.

Click a track to make it active. The active track is the one the Draw tool writes into, and the one the piano keyboard plays.

### On a phone or a narrow window

Below 600px the track list becomes a panel that slides in from the toolbar button on the left, so the roll keeps the full width. Tap anywhere on the roll to put it away.

One finger pans the roll. Notes still drag with one finger. The full shortcut list is in the help dialog, reachable from the toolbar button.

## How it works

The interface is React and TypeScript. Tauri provides the desktop shell, with a small amount of Rust handling the two file operations the webview should not do for itself.

Sound comes from [SpessaSynth](https://github.com/spessasus/SpessaSynth), which runs a SoundFont synthesiser in an AudioWorklet. The app drives it note by note rather than handing it the file, which is what makes mute, solo, looping, scrubbing, and live edits take effect immediately.

Playback uses a lookahead scheduler. A timer wakes every 25ms and queues every note starting in the next 100ms, stamped with an exact audio-clock time. The timer can be late by a few milliseconds without anything being audible, because the notes were already queued.

The document stores time in MIDI ticks rather than seconds. Ticks are integers and do not depend on tempo, so editing, quantising, and tempo changes never accumulate rounding error. Seconds are worked out on demand from the tempo map.

Notes are drawn on a canvas rather than as DOM elements. A busy song holds tens of thousands of notes, and that many nodes makes scrolling unusable.

### Project structure

```text
src/
  midi/        Parsing, writing, timing maps, General MIDI tables
  audio/       Synthesiser, scheduler, and the engine that joins them
  state/       Document store, undo history, transport, view state
  components/  Piano roll, track rail, transport, toolbar
src-tauri/
  src/         Rust backend, two file commands
public/
  soundfonts/  The bundled GeneralUser GS soundfont
```

## Development

```bash
npm run dev         # frontend only, in a browser at localhost:1420
npm run tauri dev   # the real desktop app
npm test            # unit tests
npx tsc --noEmit    # type check
```

`npm run dev` runs the interface in an ordinary browser tab, which is quicker for UI work. Opening and saving fall back to a file input and a download there, because there is no Tauri backend to talk to.

The tests cover the parts where a mistake is quiet rather than obvious: tick and bar arithmetic across tempo and metre changes, the import and export round trip, the scheduler against a controlled clock, the note edit functions, and the roll geometry.

## Known limitations

- Control changes, pitch bends, and sysex messages in a file are played back as written by the synthesiser but are not shown or editable, and they are not carried through when you save. Notes, tempo, time signatures, track names, channels, and programs all survive a round trip.
- There is no tempo or time signature editor yet. The app reads and preserves both, but you cannot change them.
- Only tested on Linux so far. The Tauri shell supports macOS and Windows, and nothing in the code is platform specific, but I have not run it there.
- The soundfont is fixed. There is no way to load a different SF2 or SF3 file yet.
- Velocity is editable through the shortcut but has no dedicated editor lane.

## Credits

The bundled soundfont is [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) by S. Christian Collins, in the SF3 form distributed with SpessaSynth. It is included under its own licence, which permits redistribution.

Synthesis is by [SpessaSynth](https://github.com/spessasus/SpessaSynth). MIDI parsing and writing use [@tonejs/midi](https://github.com/Tonejs/Midi).

## Licence

Apache 2.0. See [LICENSE](LICENSE).

Made with 💖 by Pink Pixel
