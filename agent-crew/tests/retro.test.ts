import { expect, mock, test } from 'claude-code/testing'

const setup = async ($: any, on: any) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [] }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }) as any)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }) as any)
  on('prompt.compose', () => ({ sections: [] }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}
const retroText = async ($: any) =>
  (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })).sections.find((s: any) => s.id === 'agent-crew:retro')?.text as string

test('the retro is optional and Claude is told so', async ($, on) => {
  await setup($, on)
  expect(await retroText($)).toMatch(/optional und nur immer mal wieder/)
  const band = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'AbovePrompt', props: {} as any })
  expect(await band.find({ type: 'Text', text: /^immer mal wieder$/ })).toBeDefined()
  await band.unmount()
})

test('a round straight to /pr shows the retro as skipped', async ($, on) => {
  await setup($, on)
  await $.prompt.submit({ text: '/implement-spec' } as any)
  await $.prompt.submit({ text: '/pr' } as any)
  const pane = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew', props: {} as any })
  expect(await pane.find({ type: 'Text', text: /optional · immer mal wieder/ })).toBeDefined()
  await pane.unmount()
})

test('a round with a retro shows it like any other step', async ($, on) => {
  await setup($, on)
  await $.prompt.submit({ text: '/retro' } as any)
  await $.prompt.submit({ text: '/pr' } as any)
  const pane = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew', props: {} as any })
  expect(await pane.find({ type: 'Text', text: /immer mal wieder/ })).toBeUndefined()
  await pane.unmount()
})
