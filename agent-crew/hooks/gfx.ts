// The dashboard's look, free of the engine: neon hues, and the drawings in the two forms the
// surfaces take. Desktop, editor and mobile draw SVG; the terminal has no Svg and draws cell grids
// (Raster), so the same sprites and gauges are packed into half-block cells here.

// fg: the neon accent. tint: a card's dark background in that hue. track: a bar's empty part.
export type Hue = { fg: string; tint: string; track: string }

export const HUES: Hue[] = [
  { fg: '#ff9f43', tint: '#2b1a0b', track: '#54320f' }, // orange
  { fg: '#3ddc84', tint: '#0c2617', track: '#14492c' }, // green
  { fg: '#4c9dff', tint: '#0d1c33', track: '#183762' }, // blue
  { fg: '#ff5fa2', tint: '#2d0f1f', track: '#5a1d3c' }, // pink
  { fg: '#2de2e6', tint: '#0a2729', track: '#124a4d' }, // cyan
  { fg: '#b388ff', tint: '#1e1433', track: '#3b2866' }, // violet
]
export const GOLD: Hue = { fg: '#ffd166', tint: '#2b240c', track: '#544611' }
export const RED: Hue = { fg: '#ff5c5c', tint: '#2e1010', track: '#5c2020' }
export const MUTED: Hue = { fg: '#7d8590', tint: '#161b22', track: '#2d333b' }

// Behind a card's critter: an exact xterm colour, so under tmux, where the engine clamps to 256
// colours and Raster and Box round differently, the portrait looks the same.
export const SPRITE_BG = '#121212'
// For the dark cards only: what sits on the pane itself takes theme keys, as its background is the
// surface's, white in a light theme.
export const INK = '#e6edf3'
export const SOFT = '#9aa7b4'

const TERMINAL_DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const SPACE = 0x20

const rgb = (hex: string) => parseInt(hex.slice(1), 16)

// RasterProps.cells: little-endian u32 triplets [code point, foreground, background], base64.
const pack = (words: number[]): string => {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word >>> 0, true))
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// One cell of two stacked square pixels; null is see-through, showing the background.
const halfBlock = (top: number | null, bottom: number | null, bg: number): number[] => {
  if (top === null && bottom === null) return [SPACE, bg, bg]
  if (top === null) return [LOWER, bottom!, bg]
  if (bottom === null) return [UPPER, top, bg]
  return [UPPER, top, bottom]
}

export const SPRITE_COLUMNS = 12
export const SPRITE_ROWS = 5
const SPRITE_W = 24
const SPRITE_H = 20

const pixelsOf = (svg: string): (number | null)[] => {
  const px = new Array<number | null>(SPRITE_W * SPRITE_H).fill(null)
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"/g)) {
    const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px[yy * SPRITE_W + xx] = rgb(m[5]!)
  }
  return px
}

// Halves the sprite: each 2x2 block takes its commonest colour, but a near-black pixel beats the
// rest, so eyes and mouths survive; a block with less than half its pixels set stays see-through.
const FEATURE_LUMA = 700
const halved = (px: (number | null)[]): (number | null)[] => {
  const out: (number | null)[] = []
  const luma = (c: number) => (c >> 16) * 3 + ((c >> 8) & 255) * 6 + (c & 255)
  for (let y = 0; y < SPRITE_H; y += 2) {
    for (let x = 0; x < SPRITE_W; x += 2) {
      const set = [px[y * SPRITE_W + x], px[y * SPRITE_W + x + 1], px[(y + 1) * SPRITE_W + x], px[(y + 1) * SPRITE_W + x + 1]]
        .filter((c): c is number => c !== null)
      const count = (c: number) => set.filter(o => o === c).length
      const feature = set.find(c => luma(c) < FEATURE_LUMA)
      const commonest = [...set].sort((a, b) => count(b) - count(a) || luma(a) - luma(b))[0]
      out.push(set.length >= 2 ? (feature ?? commonest!) : null)
    }
  }
  return out
}

// Sprites are a fixed set and every frame redraws them: each is packed once per background.
const packed = new Map<string, string>()
export function spriteCells(svg: string, bg?: string): string {
  const id = `${bg ?? ''}${svg}`
  const hit = packed.get(id)
  if (hit) return hit
  const px = halved(pixelsOf(svg))
  const back = bg ? rgb(bg) : TERMINAL_DEFAULT
  const words: number[] = []
  for (let row = 0; row < SPRITE_ROWS; row++) {
    for (let x = 0; x < SPRITE_COLUMNS; x++) {
      words.push(...halfBlock(px[row * 2 * SPRITE_COLUMNS + x]!, px[(row * 2 + 1) * SPRITE_COLUMNS + x]!, back))
    }
  }
  const cells = pack(words)
  packed.set(id, cells)
  return cells
}

const clamp = (pct: number) => Math.max(0, Math.min(100, pct))

// A bar's filled part as [offset, width] in percent. A live agent has no tokens until a turn ends,
// so at zero a short block wanders along the track: it says "busy", not how far.
export function barSpan(pct: number, pulse?: number): [number, number] {
  if (pct > 0 || pulse === undefined) return [0, clamp(pct)]
  const span = 84
  const at = (pulse * 6) % (span * 2)
  return [at <= span ? at : span * 2 - at, 16]
}

export function barSvg(pct: number, hue: Hue, pulse?: number): string {
  const [x, w] = barSpan(pct, pulse)
  const id = `b${hue.fg.slice(1)}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 8" preserveAspectRatio="none">` +
    `<defs><linearGradient id="${id}"><stop offset="0" stop-color="${hue.track}"/><stop offset="0.6" stop-color="${hue.fg}"/>` +
    `<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
    `<rect width="100" height="8" rx="4" fill="${hue.track}"/>` +
    `<rect x="${x}" width="${w > 0 ? Math.max(w, 6) : 0}" height="8" rx="4" fill="url(#${id})"/></svg>`
  )
}

export const RING_COLUMNS = 11
export const RING_ROWS = 5

// The ring runs clockwise from twelve; the text sits in its middle row.
export function ringCells(pct: number | null, hue: Hue, text: string, bg?: string): string {
  const back = bg ? rgb(bg) : TERMINAL_DEFAULT
  const fg = rgb(hue.fg)
  const track = rgb(hue.track)
  const center = RING_COLUMNS / 2
  const outer = RING_ROWS
  const inner = outer - 2
  // A pixel's colour: x and y count square pixels, two to a row.
  const pixel = (x: number, y: number): number | null => {
    const dx = x + 0.5 - center
    const dy = y + 0.5 - RING_ROWS
    const r = Math.hypot(dx, dy)
    if (r > outer || r < inner) return null
    const turn = ((Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1) * 100
    return pct !== null && turn <= pct ? fg : track
  }
  const words: number[] = []
  const middle = (RING_ROWS - 1) / 2
  const start = Math.floor((RING_COLUMNS - text.length) / 2)
  for (let row = 0; row < RING_ROWS; row++) {
    for (let x = 0; x < RING_COLUMNS; x++) {
      const ch = row === middle ? text.codePointAt(x - start) : undefined
      if (ch !== undefined && x >= start) words.push(ch, fg, back)
      else words.push(...halfBlock(pixel(x, row * 2), pixel(x, row * 2 + 1), back))
    }
  }
  return pack(words)
}

export function ringSvg(pct: number | null, hue: Hue, text: string): string {
  const r = 26
  const len = 2 * Math.PI * r
  const dash = pct === null ? 0 : (clamp(pct) / 100) * len
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${hue.track}" stroke-width="8"/>` +
    `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${hue.fg}" stroke-width="8" stroke-linecap="round" ` +
    `stroke-dasharray="${dash.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 32 32)"/>` +
    `<text x="32" y="37" text-anchor="middle" font-family="ui-monospace,monospace" font-size="14" font-weight="700" fill="${hue.fg}">${text}</text></svg>`
  )
}
