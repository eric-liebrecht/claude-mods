import { expect, mock, test } from 'claude-code/testing'

const band = (bodyColumns = 120) => ({ plugin: 'agent-crew', component: 'AbovePrompt', props: { bodyColumns } as any }) as const

const start = async ($: any, on: any, store?: any, ownOpen = false, crew: any[] = []) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: crew }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  if (!ownOpen) on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on, store)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}

const look = async ($: any, surface: 'terminal' | 'desktop', columns = 120) => {
  const ui = await $.ui.mount({ ...band(columns), surface })
  const out = {
    chevron: (await ui.find({ type: 'Button', key: 'band-toggle' }))?.text,
    flow: (await ui.find({ type: 'Text', text: /○ Spec/ })) !== undefined,
    critter: (await ui.find({ type: 'Button', text: /^Claude$/ })) !== undefined,
    cache: (await ui.find({ type: 'Text', text: /^Cache/ })) !== undefined,
    line: (await ui.find({ type: 'Text', text: /^♛ Claude$/ })) !== undefined,
  }
  await ui.unmount()
  return out
}

const OPEN = { chevron: '▾', flow: true, critter: true, cache: true, line: false }
const FOLDED = { chevron: '▸', flow: false, critter: false, cache: true, line: true }

test('the band folds to one line of details behind its chevron and unfolds again, step by step', async ($, on) => {
  const clock = await start($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await look($, surface)).toEqual(OPEN)

    const ui = await $.ui.mount({ ...band(), surface })
    await ui.press({ key: 'band-toggle' })
    await ui.unmount()
    // Mid-fold: the cache line is gone first, the chevron is turning.
    const mid = await look($, surface)
    expect(mid.cache).toBe(false)
    expect(mid.flow).toBe(true)
    expect(mid.chevron).toBe('◂')

    await clock.advance(1000)
    expect(await look($, surface)).toEqual(FOLDED)

    const again = await $.ui.mount({ ...band(), surface })
    await again.press({ key: 'band-toggle' })
    await again.unmount()
    await clock.advance(1000)
    expect(await look($, surface)).toEqual(OPEN)
  }
})

test('the band controls are one glyph each, so a desktop draws icons and no words', async ($, on) => {
  await start($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(), surface })
    for (const key of ['pane-toggle', 'band-toggle']) {
      expect([...(await ui.find({ type: 'Button', key }))!.text]).toHaveLength(1)
    }
    await ui.unmount()
  }
})

const CREW = [
  { id: 'a1', type: 'general-purpose', description: 'Tests', status: 'running' },
  { id: 'a2', type: 'general-purpose', description: 'Docs', status: 'running' },
  { id: 'a3', type: 'general-purpose', description: 'Review', status: 'running' },
]

test('the folded line says who works, how many and how warm the cache is, and fits any width', async ($, on) => {
  const clock = await start($, on, { bandClosed: true }, false, CREW.slice(0, 1))
  await $.tool.call({ tool: 'Bash', command: 'bun test', agentId: 'a1' } as any)
  await clock.advance(600)
  const one = await $.ui.mount({ ...band(120), surface: 'desktop' })
  expect(await one.find({ type: 'Text', text: /^♛ Claude$/ })).toBeDefined()
  expect(await one.find({ type: 'Text', text: /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/ })).toBeDefined()
  expect(await one.find({ type: 'Text', text: /^ testet$/ })).toBeDefined()
  expect(await one.find({ type: 'Text', text: /^Cache$/ })).toBeDefined()
  await one.unmount()
})

test('with several agents the folded line counts them and stays inside the band', async ($, on) => {
  const clock = await start($, on, { bandClosed: true }, false, CREW)
  await clock.advance(600)
  for (const columns of [30, 50, 70, 100, 160]) {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...band(columns), surface })
      const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
      // The line and its two icons (and a gap) stay inside the band.
      expect(texts.length + 3).toBeLessThanOrEqual(columns)
      expect(await ui.find({ type: 'Text', text: /^♛ Claude$/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^3 Agenten$/ })) !== undefined).toBe(columns >= 50)
      await ui.unmount()
    }
  }
})

test('open, the band shows every step where they fit and the active one alone where not', async ($, on) => {
  const clock = await start($, on, undefined, false, CREW)
  await clock.advance(600)
  for (const surface of ['terminal', 'desktop'] as const) {
    const wide = await $.ui.mount({ ...band(120), surface })
    expect(await wide.find({ type: 'Text', text: /○ PR/ })).toBeDefined()
    await wide.unmount()

    const slim = await $.ui.mount({ ...band(40), surface })
    expect(await slim.find({ type: 'Text', text: /○ PR/ })).toBeUndefined()
    expect(await slim.find({ type: 'Text', text: /Grillen/ })).toBeDefined()
    // Only the critters that fit, the rest as a count.
    expect(await slim.find({ type: 'Button', text: /^\+\d$/ })).toBeDefined()
    await slim.unmount()
  }
})

test('a folded band stays folded in the next session', async ($, on) => {
  await start($, on, { bandClosed: true })
  expect(await look($, 'terminal')).toEqual(FOLDED)
})

test('the band closes the pane on the right and opens it again, open or folded', async ($, on) => {
  const panes: string[] = []
  on('ui.panes', () => ({ value: panes.map(id => ({ id, title: 'Agent Crew', isShown: true, isFocused: false, isPlaced: true })) }) as any)
  on('ui.close', (_$: any, e: any) => {
    panes.splice(panes.indexOf(e.id), 1)
    return { value: undefined } as any
  })
  on('ui.open', (_$: any, e: any) => {
    if (!panes.includes(e.id)) panes.push(e.id)
    return { value: { isPlaced: true } } as any
  })
  await start($, on, undefined, true)
  const dim = async (ui: any) => (await ui.find({ type: 'Button', key: 'pane-toggle' }))!.props.dimColor

  for (const folded of [false, true]) {
    if (folded) {
      const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
      await ui.press({ key: 'band-toggle' })
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
    expect(await dim(ui)).toBe(false)
    await ui.press({ key: 'pane-toggle' })
    expect(panes).toEqual([])
    expect(await dim(ui)).toBe(true)
    await ui.press({ key: 'pane-toggle' })
    expect(panes).toEqual(['agent-crew'])
    expect(await dim(ui)).toBe(false)
    await ui.unmount()
  }
})
