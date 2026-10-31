export type CrewAgent = { id: string; type: string; description: string; status: string; startedAt: number; endedAt?: number }
export type Activity = { tool: string; detail: string; at: number }
export type Issue = { number: number; title: string; state: string }
// The main agent: whether a turn of it runs, since when, and how many turns it ran.
export type MainState = { busy: boolean; since: number; turns: number }

export type CacheLast = { read: number; create: number; input: number; at: number }
export type CacheStats = { last: CacheLast | null; read: number; create: number; input: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      agents: CrewAgent[]
      activity: Record<string, Activity[]>
      frame: number
      issues: Record<string, Issue>
      links: Record<string, number[]>
      tokens: Record<string, number>
      models: Record<string, string>
      names: Record<string, string>
      flow: number
      retroRan: boolean
      cache: CacheStats
      tick: number
      cacheTtlMs: number
      main: MainState
      demo: boolean
    }
  }
}
