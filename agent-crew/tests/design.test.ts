import { expect, mock, test } from 'claude-code/testing'

import { HUES, RING_COLUMNS, RING_ROWS, SPRITE_COLUMNS, SPRITE_ROWS, ringCells, spriteCells } from '../hooks/gfx'
import { BOSS, SPRITES } from '../hooks/sprites'

const PANE = { plugin: 'agent-crew', component: 'Pane', requestId: 'agent-crew', props: {} as any } as const

const start = async ($: any, on: any) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [
    { id: 'a1', type: 'general-purpose', description: 'Implement #105', status: 'running' },
  ] }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}

// $.ui.mount draws Raster as an empty fragment, so the terminal's cells are checked at their source.
const words = (cells: string) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  return new Uint32Array(bytes.buffer)
}

test('on the terminal every critter keeps two different frames, in cells the engine takes', () => {
  for (const set of [SPRITES, BOSS]) {
    for (const [state, [a, b]] of Object.entries(set)) {
      const first = spriteCells(a, HUES[0]!.tint)
      expect(words(first)).toHaveLength(SPRITE_COLUMNS * SPRITE_ROWS * 3)
      if (first === spriteCells(b, HUES[0]!.tint)) throw new Error(`${state} has lost its animation`)
    }
  }
})

test('a gauge ring fills with its value and holds its text', () => {
  const lit = (pct: number) => {
    const w = words(ringCells(pct, HUES[0]!, `${pct}%`))
    expect(w).toHaveLength(RING_COLUMNS * RING_ROWS * 3)
    const fg = parseInt(HUES[0]!.fg.slice(1), 16)
    return w.filter((v, i) => i % 3 !== 0 && v === fg).length
  }
  expect(lit(75)).toBeGreaterThan(lit(25))
  const text = String.fromCodePoint(...words(ringCells(50, HUES[0]!, '50%')).filter((_, i) => i % 3 === 0))
  expect(text).toContain('50%')
})

test('desktop draws the critter as SVG and flips its two frames', async ($, on) => {
  const clock = await start($, on)
  const sprites = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const found = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    return found.map((x: any) => x.props.source as string).filter(s => s.includes('crispEdges'))
  }
  await clock.advance(600)
  const first = await sprites()
  await clock.advance(500)
  expect(first.length).toBeGreaterThan(0)
  expect(await sprites()).not.toEqual(first)
})

test('the gauges show what the session measured, and no data before there is any', async ($, on) => {
  await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const label of [/^Cache warm$/, /^Treffer$/, /^Crew$/]) expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^keine Daten$/ })).toHaveLength(2)
  await ui.unmount()
})

test('/crew demo shows three made-up agents, and a second time the real crew again', async ($, on) => {
  await start($, on)
  const shows = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const names = await ui.findAll({ type: 'Text', text: /^(Code|Research|Review) Agent$/ })
    await ui.unmount()
    return names.length
  }
  expect(await shows()).toBe(0)
  await $.command.run({ command: 'crew', args: 'demo' } as any)
  expect(await shows()).toBe(3)
  await $.command.run({ command: 'crew', args: 'demo' } as any)
  expect(await shows()).toBe(0)
})
