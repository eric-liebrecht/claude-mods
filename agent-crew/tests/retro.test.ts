import { expect, mock, test } from 'claude-code/testing'

const DAY = 86_400_000

const setup = async ($: any, on: any, stored: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: 30 * DAY })
  on('agent.list', () => ({ value: [] }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }) as any)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }) as any)
  on('prompt.compose', () => ({ sections: [] }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on, stored)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return clock
}
const retroText = async ($: any) =>
  (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })).sections.find((s: any) => s.id === 'agent-crew:retro')?.text as string

test('a retro is due when none ran yet', async ($, on) => {
  await setup($, on)
  expect(await retroText($)).toMatch(/fällig\. Schlag sie/)
  const band = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'AbovePrompt', props: {} as any })
  expect(await band.find({ type: 'Text', text: /^fällig$/ })).toBeDefined()
  await band.unmount()
})

test('after a retro the next one waits a week and the step is optional', async ($, on) => {
  await setup($, on)
  await $.prompt.submit({ text: '/retro' } as any)
  expect(await retroText($)).toMatch(/nicht von dir aus/)
  await $.prompt.submit({ text: '/implement-spec' } as any)
  await $.prompt.submit({ text: '/pr' } as any)
  const pane = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew', props: {} as any })
  expect(await pane.find({ type: 'Text', text: /optional · ab/ })).toBeDefined()
  await pane.unmount()
})

test('a week after the last retro the next one is due', async ($, on) => {
  await setup($, on, { lastRetro: 23 * DAY })
  expect(await retroText($)).toMatch(/ist fällig/)
})

test('within the week the retro stays optional', async ($, on) => {
  await setup($, on, { lastRetro: 25 * DAY })
  expect(await retroText($)).toMatch(/erst ab/)
})
