# Sequencer

A 2D musical sequencer where notes are free-floating tiles on a canvas. The
**X axis** is time within a fixed loop, the **Y axis** is pitch (continuous —
microtonal if you want). A playhead sweeps across the canvas and triggers each
tile as it passes.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer (includes `npm`)

## Setup

```bash
git clone <this-repo-url> sequencer
cd sequencer
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173/`).

## How to use

- **Play / Stop** — toggles the loop. Audio starts on first interaction (browser autoplay policy).
- **BPM slider** — changes loop tempo. The loop is 4 bars of 4/4.
- **Click empty space** — drops a new tile at that position and previews its note.
- **Drag a tile** — moves it in time (X) and pitch (Y).
- **Shift-click or right-click a tile** — deletes it.
- **Clear** — removes all tiles.

Faint horizontal lines mark every semitone. Brighter lines mark notes in the
C major pentatonic scale. The brightest line is C (the root). Use them as
visual guidelines — tiles are not snapped to them.

## Scripts

- `npm run dev` — start the Vite dev server with hot reload
- `npm run build` — produce a production build in `dist/`
- `npm run preview` — preview the production build locally

## Stack

Vanilla TypeScript + Canvas 2D + Web Audio API, bundled with Vite. No runtime
dependencies.
# sequencer
