import { expect, test } from 'claude-code/testing'

// Hands back, in place of the model, what agent-crew stored for the spawn.
const peek = {
  name: 'peek',
  register: (on: any) => {
    on('agent.spawn', async ($: any, e: any, next: any) => {
      const r = await next(e)
      if (e.prompt !== 'peek') return r
      return { ...r, model: JSON.stringify((await $.state.get({ plugin: 'agent-crew', key: 'models' })).value ?? null) }
    })
  },
}

test('remembers the model a subagent was spawned on', { plugins: [peek] }, async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  await $.agent.spawn({ prompt: 'look around', subagentType: 'Explore' })
  // peek stands beneath agent-crew: a second spawn reads what the first one left.
  const r = await $.agent.spawn({ prompt: 'peek', subagentType: 'Explore' })
  expect('model' in r ? JSON.parse(r.model) : null).toMatchObject({ a1: 'claude-opus-5-5' })
})
