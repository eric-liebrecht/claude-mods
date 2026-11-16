import { expect, mock, test } from 'claude-code/testing'

const BAND = { plugin: 'agent-crew', component: 'AbovePrompt', props: {} as any } as const

const start = async ($: any, on: any, store?: any) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [] }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on, store)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}

const look = async ($: any, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...BAND, surface })
  const out = {
    chevron: (await ui.find({ type: 'Text', text: /^[▾◢▸]$/ }))?.text,
    flow: (await ui.find({ type: 'Text', text: /Grillen/ })) !== undefined,
    critter: (await ui.find({ type: 'Text', text: /^Claude$/ })) !== undefined,
    cache: (await ui.find({ type: 'Text', text: /Cache/ })) !== undefined,
  }
  await ui.unmount()
  return out
}

test('the band folds away behind its chevron and unfolds again, step by step', async ($, on) => {
  const clock = await start($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await look($, surface)).toEqual({ chevron: '▾', flow: true, critter: true, cache: true })

    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'band-toggle' })
    await ui.unmount()
    // Mid-fold: the cache line is gone first, the chevron is turning.
    const mid = await look($, surface)
    expect(mid.cache).toBe(false)
    expect(mid.flow).toBe(true)
    expect(mid.chevron).toBe('◢')

    await clock.advance(1000)
    expect(await look($, surface)).toEqual({ chevron: '▸', flow: false, critter: false, cache: false })

    const again = await $.ui.mount({ ...BAND, surface })
    await again.press({ key: 'band-toggle' })
    await again.unmount()
    await clock.advance(1000)
    expect(await look($, surface)).toEqual({ chevron: '▾', flow: true, critter: true, cache: true })
  }
})

test('a folded band stays folded in the next session', async ($, on) => {
  await start($, on, { bandClosed: true })
  expect(await look($, 'terminal')).toEqual({ chevron: '▸', flow: false, critter: false, cache: false })
})
