// 2D sequencer: free-floating tiles. X = time within the loop, Y = pitch.
// Pitch snaps to a scale row so it always sounds musical; X is continuous.

const canvas = document.getElementById("grid") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const bpmInput = document.getElementById("bpm") as HTMLInputElement;
const bpmVal = document.getElementById("bpmVal") as HTMLSpanElement;

const W = canvas.width;
const H = canvas.height;

const TILE_W = 26;
const TILE_H = 16;

// Continuous pitch range across the canvas height.
const MIDI_HIGH = 84; // C6 at top
const MIDI_LOW = 36;  // C2 at bottom
const SCALE = new Set([0, 2, 4, 7, 9]); // major pentatonic (for guideline highlighting)
const ROOT_PC = 0; // C

function yToMidi(y: number): number {
  const t = 1 - y / H; // 0 at bottom, 1 at top
  return MIDI_LOW + t * (MIDI_HIGH - MIDI_LOW);
}
function midiToY(m: number): number {
  const t = (m - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW);
  return (1 - t) * H;
}
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Tile = { id: number; x: number; y: number };
let nextId = 1;
const tiles: Tile[] = [];

let bpm = parseInt(bpmInput.value, 10);
let isPlaying = false;
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

// Loop length in seconds. Treat the canvas width as 4 bars of 4/4 sixteenths
// so feel matches the BPM (16 sixteenths per bar * 4 bars = 64 subdivisions).
function loopDuration(): number {
  return (60 / bpm) * 16; // 16 beats = 4 bars
}
function xToTime(x: number): number {
  return (x / W) * loopDuration();
}

// Scheduler: continuous time within loop, fire any tile whose x falls in the window.
const SCHEDULE_AHEAD = 0.1;
const LOOKAHEAD_MS = 25;
let timerId: number | null = null;
let loopStartTime = 0; // audioCtx time when current loop iteration started
let lastScheduledTime = 0; // loop-relative time we've already scheduled up to

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioCtx.destination);
  }
}

function playNoteAt(midi: number, when: number) {
  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(midi);
  const dur = 0.28;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.4, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain).connect(masterGain);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function scheduler() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const horizon = now + SCHEDULE_AHEAD;
  const dur = loopDuration();

  while (loopStartTime + lastScheduledTime < horizon) {
    const windowStart = lastScheduledTime;
    const windowEnd = Math.min(dur, lastScheduledTime + 0.05); // 50ms slices

    for (const t of tiles) {
      const tTime = xToTime(t.x);
      if (tTime >= windowStart && tTime < windowEnd) {
        playNoteAt(yToMidi(t.y), loopStartTime + tTime);
      }
    }

    lastScheduledTime = windowEnd;
    if (lastScheduledTime >= dur) {
      loopStartTime += dur;
      lastScheduledTime = 0;
    }
  }
}

function startScheduler() {
  ensureAudio();
  if (audioCtx!.state === "suspended") audioCtx!.resume();
  loopStartTime = audioCtx!.currentTime + 0.05;
  lastScheduledTime = 0;
  if (timerId) clearInterval(timerId);
  timerId = window.setInterval(scheduler, LOOKAHEAD_MS);
}

function stopScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function playheadX(): number {
  if (!isPlaying || !audioCtx) return -1;
  const dur = loopDuration();
  let elapsed = audioCtx.currentTime - loopStartTime;
  if (elapsed < 0) elapsed = 0;
  elapsed = elapsed % dur;
  return (elapsed / dur) * W;
}

function draw() {
  ctx.fillStyle = "#14161a";
  ctx.fillRect(0, 0, W, H);

  // Horizontal pitch guidelines: bright at root, mid at scale, dim at chromatic
  for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
    const pc = ((m % 12) + 12) % 12;
    const isRoot = pc === ROOT_PC;
    const inScale = SCALE.has(pc);
    const y = midiToY(m);
    if (isRoot) {
      ctx.fillStyle = "rgba(120,160,255,0.10)";
      ctx.fillRect(0, y - 0.5, W, 1);
    } else if (inScale) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, y - 0.5, W, 1);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.015)";
      ctx.fillRect(0, y - 0.5, W, 1);
    }
  }

  // Vertical beat guides
  const dur = loopDuration();
  const beats = Math.round(dur / (60 / bpm));
  for (let b = 0; b < beats; b++) {
    const x = (b / beats) * W;
    ctx.fillStyle = b % 4 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)";
    ctx.fillRect(x, 0, 1, H);
  }

  // Tiles
  for (const t of tiles) {
    const x = t.x - TILE_W / 2;
    const y = t.y - TILE_H / 2;
    const isHover = t.id === hoverId;
    const isDrag = t.id === dragId;
    ctx.fillStyle = isDrag ? "#5aa2ff" : isHover ? "#3b85f5" : "#1f6feb";
    roundRect(ctx, x, y, TILE_W, TILE_H, 5);
    ctx.fill();
    if (isHover || isDrag) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Playhead
  const ph = playheadX();
  if (ph >= 0) {
    ctx.strokeStyle = "rgba(255,200,80,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ph + 0.5, 0);
    ctx.lineTo(ph + 0.5, H);
    ctx.stroke();
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function loop() {
  draw();
  requestAnimationFrame(loop);
}

// --- Interaction ---
let dragId: number | null = null;
let hoverId: number | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function tileAt(mx: number, my: number): Tile | null {
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (
      mx >= t.x - TILE_W / 2 &&
      mx <= t.x + TILE_W / 2 &&
      my >= t.y - TILE_H / 2 &&
      my <= t.y + TILE_H / 2
    ) {
      return t;
    }
  }
  return null;
}

function mousePos(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = mousePos(e);
  const hit = tileAt(x, y);
  if (e.shiftKey || e.button === 2) {
    if (hit) tiles.splice(tiles.indexOf(hit), 1);
    return;
  }
  if (hit) {
    dragId = hit.id;
    dragOffsetX = x - hit.x;
    dragOffsetY = y - hit.y;
  } else {
    const t: Tile = { id: nextId++, x, y };
    tiles.push(t);
    dragId = t.id;
    dragOffsetX = 0;
    dragOffsetY = 0;
    ensureAudio();
    if (audioCtx!.state === "suspended") audioCtx!.resume();
    playNoteAt(yToMidi(y), audioCtx!.currentTime);
  }
});

canvas.addEventListener("mousemove", (e) => {
  const { x, y } = mousePos(e);
  if (dragId != null) {
    const t = tiles.find((t) => t.id === dragId);
    if (t) {
      t.x = Math.max(TILE_W / 2, Math.min(W - TILE_W / 2, x - dragOffsetX));
      t.y = Math.max(TILE_H / 2, Math.min(H - TILE_H / 2, y - dragOffsetY));
    }
  } else {
    const hit = tileAt(x, y);
    hoverId = hit ? hit.id : null;
    canvas.style.cursor = hit ? "grab" : "crosshair";
  }
});

window.addEventListener("mouseup", () => {
  dragId = null;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

playBtn.addEventListener("click", () => {
  isPlaying = !isPlaying;
  playBtn.textContent = isPlaying ? "Stop" : "Play";
  if (isPlaying) startScheduler();
  else stopScheduler();
});

clearBtn.addEventListener("click", () => {
  tiles.length = 0;
});

bpmInput.addEventListener("input", () => {
  bpm = parseInt(bpmInput.value, 10);
  bpmVal.textContent = String(bpm);
});

loop();
