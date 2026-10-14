import { expect, mock, test } from 'claude-code/testing'

// The engine side of a session with no sub-agents.
const setup = async ($: any, on: any) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [] }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}

test('the main agent has its own card while its turn runs', async ($, on) => {
  const clock = await setup($, on)
  await $.turn.start({ text: 'fix it', turnId: 't1' } as any)
  await $.tool.call({ tool: 'Grep', pattern: 'TODO' } as any)
  await clock.advance(600)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew', props: {} as any })
    expect(await ui.find({ type: 'Text', text: /^Hauptagent$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^arbeitet$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Claude$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Grep {2}TODO/ })).toBeDefined()
    await ui.unmount()
  }
  const band = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'AbovePrompt', props: {} as any })
  expect(await band.find({ type: 'Text', text: /^Claude$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^sucht/ })).toBeDefined()
  await band.unmount()
})

test('after its turn the main agent is ready again', async ($, on) => {
  const clock = await setup($, on)
  await $.turn.start({ text: 'fix it', turnId: 't1' } as any)
  await $.turn.complete({ turnId: 't1', answer: 'fixed', durationMs: 500, isAborted: false, reason: 'answer' })
  await clock.advance(600)
  const ui = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew', props: {} as any })
  expect(await ui.find({ type: 'Text', text: /^bereit$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 Turn/ })).toBeDefined()
  await ui.unmount()
})
