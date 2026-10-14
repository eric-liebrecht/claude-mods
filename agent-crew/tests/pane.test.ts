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
    const named = (await ui.findAll({ type: 'Text', text: /^[A-ZÄÖÜ][a-zäöü]+-[A-ZÄÖÜ][a-zäöü]+$/ }))
      .filter(x => x.text !== 'Session-Cache')
    expect(named).toHaveLength(2)
    expect(named[0]!.text).not.toBe(named[1]!.text)
    expect(await ui.find({ type: 'Text', text: /Implement #105/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /npx prisma/ })).toBeUndefined()
    await ui.unmount()
  }
})
