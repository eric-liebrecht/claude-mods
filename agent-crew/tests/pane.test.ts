import { expect, mock, test } from 'claude-code/testing'

test('agent cards show a funny name and no longer the running tool call', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [
    { id: 'a1', type: 'general-purpose', description: 'Implement #105 no-overwrite check', status: 'running' },
    { id: 'a2', type: 'general-purpose', description: 'Implement #104 approval reset', status: 'running' },
  ] }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npx prisma migrate', agentId: 'a1' } as any)
  await clock.advance(600)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew', props: {} as any })
    const named = await ui.findAll({ type: 'Text', text: /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/ })
    expect(named).toHaveLength(2)
    expect(named[0]!.text).not.toBe(named[1]!.text)
    expect(await ui.find({ type: 'Text', text: /Implement #105/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /npx prisma/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('linked issues get their own card with state and the agent working on them', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('agent.list', () => ({ value: [
    { id: 'a1', type: 'general-purpose', description: 'Implement #105', status: 'running' },
  ] }) as any)
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{"title":"Never overwrite a reply","state":"OPEN"}', stderr: '' } }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'gh issue view 105', agentId: 'a1' } as any)
  await clock.advance(600)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agent-crew', props: {} as any })
    expect(await ui.find({ type: 'Text', text: /^Issues$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1 verknüpft · 1 in Arbeit$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^#105$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^● offen$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Never overwrite a reply$/ })).toBeDefined()
    // The row names who works on it: the agent's name, beside the card that has it as its task.
    expect((await ui.findAll({ type: 'Text', text: /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/ })).length).toBe(2)
    await ui.unmount()
  }
})

// GitHub's side: issue 105 is open until a close runs, here or elsewhere.
const github = (on: any) => {
  const gh = { state: 'OPEN' }
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ title: 'Never overwrite a reply', state: gh.state }), stderr: '' } }) as any)
  on('tool.call', (_$: any, e: any) => {
    if (/gh issue close/.test(e.command ?? '')) gh.state = 'CLOSED'
    return { result: 'ok' } as any
  })
  return gh
}
const startCrew = async ($: any, on: any) => {
  on('agent.list', () => ({ value: [] }) as any)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', () => ({ value: { isPlaced: true } }) as any)
  mock.store(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
}
const issueState = async ($: any) => {
  const ui = await $.ui.mount({ plugin: 'agent-crew', surface: 'terminal', component: 'Pane', requestId: 'agent-crew', props: {} as any })
  const closed = await ui.find({ type: 'Text', text: /^● geschlossen$/ })
  const open = await ui.find({ type: 'Text', text: /^● offen$/ })
  await ui.unmount()
  return closed ? 'closed' : open ? 'open' : 'none'
}

test('an issue closed with gh shows as closed', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  github(on)
  await startCrew($, on)
  await $.tool.call({ tool: 'Bash', command: 'gh issue view 105' } as any)
  await clock.advance(600)
  expect(await issueState($)).toBe('open')
  await $.tool.call({ tool: 'Bash', command: 'gh issue close 105 --comment "done"' } as any)
  await clock.advance(600)
  expect(await issueState($)).toBe('closed')
})

test('an issue closed elsewhere shows as closed within a minute', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const gh = github(on)
  await startCrew($, on)
  await $.tool.call({ tool: 'Bash', command: 'gh issue view 105' } as any)
  await clock.advance(600)
  expect(await issueState($)).toBe('open')
  gh.state = 'CLOSED'
  await clock.advance(60_000)
  expect(await issueState($)).toBe('closed')
})
