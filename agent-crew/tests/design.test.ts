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

const words = (cells: string) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  return new Uint32Array(bytes.buffer)
}

test('the terminal mounts every drawing as cells, never as a stub, and flips the frames', async ($, on) => {
  const clock = await start($, on)
  const draw = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const sprite = await ui.find({ type: 'Raster', key: 'sprite-a1' })
    const boss = await ui.find({ type: 'Raster', key: 'sprite-main' })
    const rings = await ui.findAll({ type: 'Raster', text: undefined })
    const svgs = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    return { sprite: sprite?.props.cells as string, boss: boss?.props.cells as string, rings: rings.length, svgs: svgs.length }
  }
  await clock.advance(600)
  const first = await draw()
  await clock.advance(500)
  const second = await draw()
  expect(first.svgs).toBe(0)
  expect(first.rings).toBe(5) // two critters, three gauges
  // Not blank: the critter's cells carry half blocks.
  expect(words(first.sprite).filter((w, i) => i % 3 === 0 && (w === 0x2580 || w === 0x2584)).length).toBeGreaterThan(10)
  expect(second.sprite).not.toBe(first.sprite)
  expect(second.boss).not.toBe(first.boss)
  await clock.advance(500)
  expect((await draw()).sprite).toBe(first.sprite)
})

test('short of room the cards lose their frames, with room they keep them', async ($, on) => {
  const clock = await start($, on)
  await clock.advance(600)
  const bordered = async (rows: number) => {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 60, rows } } as any)
    const card = await ui.find({ key: 'card-a1' })
    await ui.unmount()
    expect(card).toBeDefined()
    return card!.props.borderStyle !== undefined
  }
  expect(await bordered(80)).toBe(true)
  expect(await bordered(24)).toBe(false)
})

test('the band mounts its critters as cells on the terminal', async ($, on) => {
  const clock = await start($, on)
  await clock.advance(600)
  const band = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'AbovePrompt', props: {} as any })
  expect(await band.find({ type: 'Raster', key: 'band-a1' })).toBeDefined()
  expect(await band.find({ type: 'Raster', key: 'band-main' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toHaveLength(0)
  await band.unmount()
})

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
