import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Activity, CacheStats, CrewAgent, Issue } from '../types'
import { SPRITES } from './sprites'

const PANE = 'agent-crew'
const agents = atom({ plugin: 'agent-crew', key: 'agents' } as const, [] as CrewAgent[])
const activity = atom({ plugin: 'agent-crew', key: 'activity' } as const, {} as Record<string, Activity[]>)
const frame = atom({ plugin: 'agent-crew', key: 'frame' } as const, 0)
// GitHub issues seen so far, by number; links: agent id (or "main") -> issue numbers it touched, latest last.
const issues = atom({ plugin: 'agent-crew', key: 'issues' } as const, {} as Record<string, Issue>)
const links = atom({ plugin: 'agent-crew', key: 'links' } as const, {} as Record<string, number[]>)
const tokens = atom({ plugin: 'agent-crew', key: 'tokens' } as const, {} as Record<string, number>)
// Model per agent id: what its spawn resolved to, then what its latest request ran on (fallbacks too).
// Display name per agent id, handed out once and kept.
const names = atom({ plugin: 'agent-crew', key: 'names' } as const, {} as Record<string, string>)
const models = atom({ plugin: 'agent-crew', key: 'models' } as const, {} as Record<string, string>)
// Prompt cache of the session: the main loop's last response, and sums over every loop.
const cache = atom(
  { plugin: 'agent-crew', key: 'cache' } as const,
  { last: null, read: 0, create: 0, input: 0 } as CacheStats,
)
// How long the prompt cache stays warm after its last use: 1 hour by default, 5 minutes where the
// engine says so (cache_ttl on a model switch).
const cacheTtl = atom({ plugin: 'agent-crew', key: 'cacheTtlMs' } as const, 3_600_000)
// Redraw heartbeat so ages ("vor 3m") move while nothing else happens.
const tick = atom({ plugin: 'agent-crew', key: 'tick' } as const, 0)
// The engineering flow: index of the active step (STEPS.length = everything done).
const flow = atom({ plugin: 'agent-crew', key: 'flow' } as const, 0)

type Step = { label: string; names: string[]; command: string }
const STEPS: Step[] = [
  { label: 'Grillen', names: ['grill-me', 'grill-with-docs', 'grilling'], command: '/mattpocock-skills:grill-me' },
  { label: 'Spec', names: ['to-spec'], command: '/mattpocock-skills:to-spec' },
  { label: 'Tickets', names: ['to-tickets'], command: '/mattpocock-skills:to-tickets' },
  { label: 'Umsetzen', names: ['implement-spec'], command: '/implement-spec' },
]
const stepOf = (text: string): number => {
  const m = /(?:^|<command-name>)[ ]*[/](?:[a-z-]+:)?([a-z-]+)/.exec(text)
  if (!m) return -1
  return STEPS.findIndex(st => st.names.includes(m[1]!))
}

const COLORS = ['magenta', 'cyan', 'yellow', 'green', 'red', 'blue'] as const
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const colorOf = (id: string) => COLORS[hash(id) % COLORS.length]!
const isLive = (a: CrewAgent) => a.status === 'running' || a.status === 'waiting' || a.status === 'pending'

// A slightly silly name per agent, so the crew reads like a crew and not like a list of ids.
const NAMES = [
  'Debug-Dieter', 'Turbo-Toni', 'Commit-Carla', 'Pixel-Paula', 'Kaffee-Klaus', 'Semikolon-Susi',
  'Merge-Moritz', 'Lint-Lotte', 'Bash-Bärbel', 'Cache-Charlie', 'Stack-Steffi', 'Grep-Gregor',
  'Null-Norbert', 'Async-Anni', 'Patch-Paul', 'Byte-Brigitte', 'Loop-Lukas', 'Regex-Rita',
  'Diff-Detlef', 'Token-Tina', 'Branch-Bruno', 'Kompilier-Kurt', 'Hotfix-Heidi', 'Bit-Bernd',
]
// First free name from the agent's own spot in the list; numbered once all are taken.
const pickName = (id: string, taken: Set<string>): string => {
  const start = hash(id) % NAMES.length
  for (let round = 1; ; round++) {
    for (let k = 0; k < NAMES.length; k++) {
      const n = NAMES[(start + k) % NAMES.length]! + (round > 1 ? ` ${round}` : '')
      if (!taken.has(n)) return n
    }
  }
}

const detailOf = (e: any): string => {
  const a = e.args ?? e.input ?? e
  const raw = a.command ?? a.file_path ?? a.path ?? a.pattern ?? a.query ?? a.url ?? a.description ?? ''
  return String(raw).replace(/\s+/g, ' ').slice(0, 90)
}

// "gh issue view 42", "gh issue comment #42 ..." and so on.
const ISSUE_USE = /gh +issue +(?:view|comment|edit|close|reopen|develop) +#?([0-9]+)/g
const ISSUE_CREATE = /gh +issue +create/
const TITLE_ARG = /(?:--title|-t)[ =]+(?:"([^"]*)"|'([^']*)')/
const ISSUE_URL = /\/issues\/([0-9]+)/

// Which pixel critter an agent shows, from what it did last.
const STALE_MS = 5000
const spriteFor = (a: CrewAgent, last: Activity | undefined, now: number): string => {
  if (a.status === 'completed') return 'done'
  if (a.status === 'failed' || a.status === 'killed') return 'fail'
  if (a.status === 'idle' || a.status === 'pending') return 'idle'
  if (!last || now - last.at > STALE_MS) return 'think'
  const d = last.detail
  switch (last.tool) {
    case 'Read':
      return 'read'
    case 'Grep':
    case 'Glob':
      return 'search'
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'edit'
    case 'WebFetch':
    case 'WebSearch':
      return 'web'
    case 'Agent':
      return 'agent'
    case 'Bash':
    case 'PowerShell':
      if (/(test|vitest|jest|spec|lint|check-types)/.test(d)) return 'test'
      if (/(^| )(git|gh)( |$)|prisma|psql|redis/.test(d)) return 'git'
      if (/(build|install|compile|tsc|turbo|pnpm add)/.test(d)) return 'build'
      return 'bash'
    default:
      return 'think'
  }
}

const ALT: Record<string, string> = {
  idle: '💤', think: '💭', read: '📖', search: '🔎', edit: '✏️', bash: '⚡', test: '🏋️',
  git: '🗄️', build: '🛠️', web: '🌐', agent: '✨', done: '✅', fail: '💥',
}

const LABEL: Record<string, string> = {
  idle: 'wartet', think: 'denkt', read: 'liest', search: 'sucht', edit: 'schreibt', bash: 'Terminal',
  test: 'testet', git: 'git', build: 'baut', web: 'Web', agent: 'startet Agent', done: 'fertig', fail: 'Fehler',
}

// "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5"; anything else as given.
const modelName = (m: string | undefined): string => {
  if (!m) return ''
  const x = /(opus|sonnet|haiku|fable)-([0-9]+)(?:-([0-9]{1,2}))?(?![0-9])/i.exec(m)
  if (!x) return m.replace(/^claude-/, '')
  const fam = x[1]!.charAt(0).toUpperCase() + x[1]!.slice(1).toLowerCase()
  return x[3] ? `${fam} ${x[2]}.${x[3]}` : `${fam} ${x[2]}`
}

const sec = (ms: number) => `${Math.max(0, Math.floor(ms / 1000))}s`
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const kTok = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

let implementing = false
async function startStep($: any, i: number) {
  implementing = i === STEPS.length - 1
  await update($, flow, () => i)
  await $.store.set('flow', i)
}

  // The flow as a vertical list: done, active, open. A press writes the skill into the prompt.
const pctOf = (c: { read: number; create: number; input: number }) => {
  const total = c.read + c.create + c.input
  return total > 0 ? Math.round((c.read / total) * 100) : 0
}
const ago = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}
// The bar shows how much of the warm time is left, so it runs down.
const cacheBar = (pct: number) => {
  const col = pct >= 40 ? GREEN : pct >= 20 ? '#f4c430' : '#ef5350'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 8">` +
    `<rect width="100" height="8" rx="4" fill="${GRAY}"/>` +
    `<rect width="${Math.max(pct, pct > 0 ? 6 : 0)}" height="8" rx="4" fill="${col}"/></svg>`
  )
}

const clockTime = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Cache line: hit rate of the last main-loop response, and how long the cache stays warm.
function cacheLine(Box: any, Text: any, Svg: any, c: CacheStats, now: number, ttlMs: number, detailed: boolean) {
  if (!c.last) return <Text dimColor>Cache: noch keine Daten</Text>
  const pct = pctOf(c.last)
  const total = pctOf(c)
  const expiresAt = c.last.at + ttlMs
  const left = expiresAt - now
  const isWarm = left > 0
  const color = !isWarm ? 'red' : left < ttlMs * 0.2 ? 'yellow' : 'green'
  const remaining = Math.max(0, Math.min(100, Math.round((left / ttlMs) * 100)))
  return (
    <Box flexDirection="column" alignItems="center">
      <Box flexDirection="row" alignItems="center">
        <Text dimColor>Cache  </Text>
        {Svg && <Svg source={cacheBar(remaining)} alt={`${remaining} Prozent warm`} width={80} height={8} />}
        <Text bold color={color}> {remaining}%</Text>
        <Text dimColor>  Treffer {pct}% · vor {ago(now - c.last.at)}</Text>
      </Box>
      <Text color={color} bold={!isWarm || left < ttlMs * 0.2}>
        {isWarm
          ? `warm noch ${ago(left)} · läuft ${clockTime(expiresAt)} ab`
          : `kalt seit ${ago(-left)} · beim nächsten Prompt wird neu geschrieben`}
      </Text>
      {detailed && (
        <Text dimColor>
          gelesen {kTok(c.last.read)} · neu geschrieben {kTok(c.last.create)} · Session {total}% ({kTok(c.read)} gelesen) · Gültigkeit {ago(ttlMs)}
        </Text>
      )}
    </Box>
  )
}

// One node of the vertical timeline: line above and below, a circle in the middle.
const GREEN = '#3ddc84'
const CYAN = '#4cc9f0'
const GRAY = '#4a4f5c'
function nodeSvg(i: number, active: number, pulse: number): string {
  const isDone = i < active
  const isActive = i === active
  const top = i === 0 ? '' : `<rect x="7" y="0" width="2" height="13" fill="${i <= active ? GREEN : GRAY}"/>`
  const bottom =
    i === STEPS.length - 1 ? '' : `<rect x="7" y="27" width="2" height="13" fill="${i < active ? GREEN : GRAY}"/>`
  let circle: string
  if (isDone) {
    circle =
      `<circle cx="8" cy="20" r="7" fill="${GREEN}"/>` +
      `<path d="M4.8 20.2 L7.2 22.6 L11.4 17.6" stroke="#0d1117" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  } else if (isActive) {
    circle =
      `<circle cx="8" cy="20" r="7" fill="#0d1117" stroke="${CYAN}" stroke-width="2"/>` +
      `<circle cx="8" cy="20" r="${pulse ? 4 : 3}" fill="${CYAN}"/>`
  } else {
    circle = `<circle cx="8" cy="20" r="6" fill="none" stroke="${GRAY}" stroke-width="2"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 40">${top}${bottom}${circle}</svg>`
}

// Horizontal variant: circle at the left of its cell, line running to the right edge.
const CELL = 150
function nodeSvgH(i: number, active: number, pulse: number): string {
  const isDone = i < active
  const isActive = i === active
  const line =
    i === STEPS.length - 1
      ? ''
      : `<rect x="17" y="8" width="${CELL - 17}" height="2" fill="${i < active ? GREEN : GRAY}"/>`
  let circle: string
  if (isDone) {
    circle =
      `<circle cx="9" cy="9" r="7" fill="${GREEN}"/>` +
      `<path d="M5.8 9.2 L8.2 11.6 L12.4 6.6" stroke="#0d1117" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  } else if (isActive) {
    circle =
      `<circle cx="9" cy="9" r="7" fill="#0d1117" stroke="${CYAN}" stroke-width="2"/>` +
      `<circle cx="9" cy="9" r="${pulse ? 4 : 3}" fill="${CYAN}"/>`
  } else {
    circle = `<circle cx="9" cy="9" r="6" fill="none" stroke="${GRAY}" stroke-width="2"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CELL} 18">${line}${circle}</svg>`
}

// The flow as a vertical timeline: done, active, open. A press writes the skill into the prompt.
function stepper(
  $: any, Box: any, Text: any, Button: any, Svg: any, active: number, pulse: number, horizontal = false,
) {
  if (horizontal) {
    return (
      <Box flexDirection="row" justifyContent="center">
        {STEPS.map((st, i) => {
          const isDone = i < active
          const isActive = i === active
          return (
            <Box key={`step-${i}`} flexDirection="column" alignItems="flex-start">
              {Svg ? (
                <Svg source={nodeSvgH(i, active, pulse)} alt={isDone ? 'erledigt' : isActive ? 'aktiv' : 'offen'} width={CELL} height={18} />
              ) : (
                <Text color={isDone ? 'green' : isActive ? 'cyan' : undefined}>{isDone ? '✓' : isActive ? '●' : '○'}</Text>
              )}
              <Button key={`btn-${i}`} plain onPress={() => $.prompt.fill({ text: `${st.command} `, mode: 'replace' })}>
                <Text color={isDone ? 'green' : isActive ? 'cyan' : undefined} bold={isActive} dimColor={!isDone && !isActive}>
                  {st.label}
                </Text>
              </Button>
              <Text dimColor hover={{ dimColor: false, color: 'cyan' }}>
                {st.command.replace('/mattpocock-skills:', '/')}
              </Text>
            </Box>
          )
        })}
        {active >= STEPS.length && <Text color="green" bold> Alles erledigt</Text>}
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {STEPS.map((st, i) => {
        const isDone = i < active
        const isActive = i === active
        return (
          <Box key={`step-${i}`} flexDirection="row">
            {Svg ? (
              <Svg source={nodeSvg(i, active, pulse)} alt={isDone ? 'erledigt' : isActive ? 'aktiv' : 'offen'} width={16} height={40} />
            ) : (
              <Text color={isDone ? 'green' : isActive ? 'cyan' : undefined}>{isDone ? '✓' : isActive ? '●' : '○'}</Text>
            )}
            <Box flexDirection="column" marginLeft={2}>
              <Button key={`btn-${i}`} plain onPress={() => $.prompt.fill({ text: `${st.command} `, mode: 'replace' })}>
                <Text color={isDone ? 'green' : isActive ? 'cyan' : undefined} bold={isActive} dimColor={!isDone && !isActive}>
                  {st.label}
                </Text>
              </Button>
              <Text dimColor hover={{ dimColor: false, color: 'cyan' }}>
                {st.command.replace('/mattpocock-skills:', '/')}
              </Text>
            </Box>
          </Box>
        )
      })}
      {active >= STEPS.length && <Text color="green" bold>Alles erledigt</Text>}
    </Box>
  )
}

export const register: Register = on => {
  const fetching = new Set<number>()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Show running sub-agents as pixel critters' })
    void $.ui.open({ id: PANE, title: 'Agent Crew' })

    $.clock.every(10000, () => update($, tick, n => n + 1))

    const saved = await $.store.get('flow')
    if (typeof saved === 'number') await update($, flow, () => saved)

    const named = new Set<string>()
    const known = new Map<string, number>()
    const ended = new Map<string, number>()
    $.clock.every(500, async () => {
      const now = await $.clock.now()
      const list = await $.agent.list()
      const mapped: CrewAgent[] = list.map(a => {
        if (!known.has(a.id)) known.set(a.id, now)
        const live = a.status === 'running' || a.status === 'waiting' || a.status === 'pending' || a.status === 'idle'
        if (!live && !ended.has(a.id)) ended.set(a.id, now)
        return {
          id: a.id, type: a.type, description: a.description, status: a.status,
          startedAt: known.get(a.id)!, endedAt: ended.get(a.id),
        }
      })
      const live = mapped.some(isLive)
      if (mapped.some(a => !named.has(a.id))) {
        for (const a of mapped) named.add(a.id)
        await update($, names, m => {
          const out = { ...m }
          const taken = new Set(Object.values(out))
          for (const a of mapped) {
            if (out[a.id]) continue
            out[a.id] = pickName(a.id, taken)
            taken.add(out[a.id]!)
          }
          return out
        })
      }
      await update($, agents, () => mapped)
      if (live) await update($, frame, n => n + 1)
    })

    return next(e)
  })

  // A model switch says which cache lifetime the session runs on.
  on('classic.PostModelSwitch', async ($, e, next) => {
    try {
      const ttl = (e as any).cache_ttl as string | undefined
      if (ttl === '5m' || ttl === '1h') await update($, cacheTtl, () => (ttl === '5m' ? 300_000 : 3_600_000))
    } catch {
      // display only
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Which model a subagent starts on, and what each of its requests actually runs on.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if ('agentId' in r && r.model) {
        const id = String(r.agentId)
        await update($, models, m => ({ ...m, [id]: r.model }))
      }
    } catch {
      // display only
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    try {
      const id = (e as any).agentId as string | undefined
      if (id && e.model) await update($, models, m => (m[id] === e.model ? m : { ...m, [id]: e.model }))
    } catch {
      // display only
    }
    return yield* next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agent Crew' })
    return { text: 'Agent Crew pane opened.' }
  })

  // Tokens per agent, summed over its turns.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    try {
      if (implementing && !(e as any).agentId) {
        implementing = false
        await update($, flow, () => STEPS.length)
        await $.store.set('flow', STEPS.length)
      }
      const id = (e as any).agentId as string | undefined
      const u = ran.usage
      if (u) {
        const at = await $.clock.now()
        await update($, cache, c => ({
          last: id ? c.last : { read: u.cache_read_input_tokens, create: u.cache_creation_input_tokens, input: u.input_tokens, at },
          read: c.read + u.cache_read_input_tokens,
          create: c.create + u.cache_creation_input_tokens,
          input: c.input + u.input_tokens,
        }))
      }
      if (id && u) {
        const total = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
        await update($, tokens, m => ({ ...m, [id]: (m[id] ?? 0) + total }))
      }
    } catch {
      // display only
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Which step of the flow the person started: the slash command at the start of a prompt.
  on('prompt.submit', async ($, e, next) => {
    try {
      const i = stepOf(e.text)
      if (i >= 0) await startStep($, i)
    } catch {
      // display only
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const who = ((e as any).agentId as string | undefined) ?? 'main'
    const command = String((e as any).command ?? '')
    const isShell = e.tool === 'Bash' || e.tool === 'PowerShell'

    // Remember an issue (and look up its title once) and link it to the agent working on it.
    const touch = async (n: number, title?: string) => {
      await update($, links, m => {
        const rest = (m[who] ?? []).filter(x => x !== n)
        return { ...m, [who]: [...rest, n].slice(-5) }
      })
      await update($, issues, m => ({
        ...m,
        [n]: { number: n, title: title ?? m[n]?.title ?? '', state: m[n]?.state ?? '' },
      }))
      if (fetching.has(n)) return
      fetching.add(n)
      void $.process
        .run(['gh', 'issue', 'view', String(n), '--json', 'title,state'], { timeoutMs: 15000 })
        .then(async r => {
          if (r.exitCode !== 0) return
          const j = JSON.parse(r.stdout) as { title?: string; state?: string }
          await update($, issues, m => ({
            ...m,
            [n]: { number: n, title: j.title ?? m[n]?.title ?? '', state: j.state ?? '' },
          }))
        })
        .catch(() => {})
        .finally(() => fetching.delete(n))
    }

    try {
      if (e.tool === 'Skill' && who === 'main') {
        const i = STEPS.findIndex(st => st.names.includes(String((e as any).skill ?? '').split(':').pop()!))
        if (i >= 0) await startStep($, i)
      }
      const entry: Activity = { tool: e.tool, detail: detailOf(e), at: await $.clock.now() }
      await update($, activity, m => ({ ...m, [who]: [...(m[who] ?? []), entry].slice(-3) }))
      if (isShell) {
        for (const m of command.matchAll(ISSUE_USE)) await touch(Number(m[1]))
      }
    } catch {
      // never block a tool call because of the display
    }

    const ran = await next(e)

    try {
      if (isShell && ISSUE_CREATE.test(command)) {
        const m = ISSUE_URL.exec(JSON.stringify((ran as any).result ?? ''))
        if (m) {
          const t = TITLE_ARG.exec(command)
          await touch(Number(m[1]), t ? (t[1] ?? t[2]) : undefined)
        }
      }
    } catch {
      // display only
    }

    return ran
  })

  // Band above the prompt: the flow, and below it one pixel critter per agent.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const now = await $.clock.now()
    const list = (await read($, agents)).filter(a => isLive(a) || (a.endedAt !== undefined && now - a.endedAt < 8000))
    const active = await read($, flow)
    const t = await read($, frame)
    const acts = await read($, activity)
    const cs = await read($, cache)
    const ttl = await read($, cacheTtl)
    const mods = await read($, models)
    const nm = await read($, names)
    await read($, tick)
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any

    return (
      <Box flexDirection="column" alignItems="center">
        {stepper($, Box, Text, Button, Svg, active, t % 2, true)}
        <Box flexDirection="row" justifyContent="flex-start" alignSelf="flex-start" marginTop={1}>
        {list.slice(0, 4).map(a => {
          const sprite = spriteFor(a, (acts[a.id] ?? []).slice(-1)[0], now)
          return (
            <Box key={`agent-${a.id}`} flexDirection="row" marginRight={4}>
              {Svg ? (
                <Svg source={SPRITES[sprite]![t % 2]!} alt={LABEL[sprite]!} width={36} height={30} />
              ) : (
                <Text>{ALT[sprite]} </Text>
              )}
              <Box flexDirection="column" marginLeft={1}>
                <Button key={`open-${a.id}`} plain onPress={() => $.ui.open({ id: PANE, title: 'Agent Crew' })}>
                  <Text bold color={colorOf(a.id)}>{clip(nm[a.id] ?? a.type, 18)}</Text>
                </Button>
                <Text dimColor>
                  {LABEL[sprite]}
                  {mods[a.id] ? ` · ${modelName(mods[a.id])}` : ''}
                </Text>
              </Box>
            </Box>
          )
        })}
        {list.length > 4 && <Text dimColor>+{list.length - 4}</Text>}
        </Box>
        <Box marginTop={1}>{cacheLine(Box, Text, Svg, cs, now, ttl, false)}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    const list = await read($, agents)
    const acts = await read($, activity)
    const t = await read($, frame)
    const lk = await read($, links)
    const iss = await read($, issues)
    const tok = await read($, tokens)
    const active = await read($, flow)
    const cs = await read($, cache)
    const ttl = await read($, cacheTtl)
    const mods = await read($, models)
    const nm = await read($, names)
    await read($, tick)
    const now = await $.clock.now()
    const running = list.filter(isLive)
    const done = list.filter(a => !isLive(a)).slice(-3)

    const issueLine = (n: number) => {
      const i = iss[String(n)]
      const st = i?.state ? ({ OPEN: 'offen', CLOSED: 'geschlossen' } as Record<string, string>)[i.state.toUpperCase()] ?? i.state.toLowerCase() : ''
      return `#${n} ${i?.title ? clip(i.title, 60) : '…'}${st ? ` · ${st}` : ''}`
    }

    const card = (a: CrewAgent) => {
      const color = colorOf(a.id)
      const live = isLive(a)
      const last = (acts[a.id] ?? []).slice(-1)[0]
      const mine = lk[a.id] ?? []
      const cur = mine.slice(-1)[0]
      const sprite = spriteFor(a, last, now)
      const meta = [
        a.type,
        mods[a.id] ? modelName(mods[a.id]) : '',
        LABEL[sprite]!,
        sec((a.endedAt ?? now) - a.startedAt),
        `${kTok(tok[a.id] ?? 0)} Tokens`,
      ].filter(Boolean)
      return (
        <Box
          key={`card-${a.id}`}
          flexDirection="row"
          alignItems="center"
          borderStyle="round"
          borderColor={live ? color : undefined}
          borderDimColor={!live}
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Box marginRight={3}>
            {Svg ? (
              <Svg source={SPRITES[sprite]![t % 2]!} alt={LABEL[sprite]!} width={72} height={60} />
            ) : (
              <Text>{ALT[sprite]}</Text>
            )}
          </Box>
          <Box flexDirection="column" flexShrink={1} gap="xs">
            <Text bold color={live ? color : undefined} dimColor={!live}>
              {nm[a.id] ?? a.type}
            </Text>
            <Text dimColor>{meta.join('  ·  ')}</Text>
            {a.description ? <Text dimColor={!live}>{clip(a.description, 80)}</Text> : null}
            {cur !== undefined && (
              <Text color={live ? color : undefined} dimColor={!live}>
                🎫 {issueLine(cur)}
              </Text>
            )}
            {mine.slice(0, -1).map(n => (
              <Text dimColor>   auch: {issueLine(n)}</Text>
            ))}
          </Box>
        </Box>
      )
    }

    const issueNumbers = Object.keys(iss).map(Number).sort((a, b) => b - a).slice(0, 8)
    const workersOf = (n: number) => list.filter(a => (lk[a.id] ?? []).includes(n) && isLive(a))

    // A section: a clear heading with a short summary to its right, then its content.
    const section = (key: string, title: string, meta: string, body: any, first = false) => (
      <Box key={`sec-${key}`} flexDirection="column" marginTop={first ? 0 : 2}>
        <Box flexDirection="row" alignItems="center" marginBottom={1}>
          <Text bold color="cyan">▍</Text>
          <Box marginLeft={1}>
            <Text bold>{title}</Text>
          </Box>
          {meta ? (
            <Box marginLeft={3}>
              <Text dimColor>{meta}</Text>
            </Box>
          ) : null}
        </Box>
        {body}
      </Box>
    )
    // The same rounded frame the agent cards use, for the other blocks.
    const panel = (key: string, children: any, color?: string) => (
      <Box
        key={`panel-${key}`}
        flexDirection="column"
        borderStyle="round"
        borderColor={color}
        borderDimColor={!color}
        paddingX={2}
        paddingY={1}
      >
        {children}
      </Box>
    )

    const STATE: Record<string, { label: string; color: string }> = {
      OPEN: { label: '● offen', color: 'green' },
      CLOSED: { label: '● geschlossen', color: 'magenta' },
    }
    const issueCard = (n: number) => {
      const i = iss[String(n)]
      const w = workersOf(n)
      const accent = w.length > 0 ? colorOf(w[0]!.id) : undefined
      const st = STATE[(i?.state ?? '').toUpperCase()]
      return (
        <Box
          key={`issue-${n}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={accent}
          borderDimColor={!accent}
          paddingX={2}
          paddingY={1}
          marginTop={1}
          gap="xs"
        >
          <Box flexDirection="row">
            <Text bold color={accent} dimColor={!accent}>#{n}</Text>
            {st && (
              <Box marginLeft={3}>
                <Text color={st.color}>{st.label}</Text>
              </Box>
            )}
          </Box>
          <Text dimColor={!accent}>{i?.title ? clip(i.title, 90) : 'Titel wird geladen …'}</Text>
          {w.length > 0 ? (
            <Text dimColor>
              in Arbeit bei{' '}
              {w.map((a, k) => (
                <Text key={`w-${n}-${a.id}`} bold color={colorOf(a.id)}>
                  {k > 0 ? ', ' : ''}
                  {nm[a.id] ?? a.type}
                </Text>
              ))}
            </Text>
          ) : (
            <Text dimColor>gerade niemand dran</Text>
          )}
        </Box>
      )
    }

    const flowMeta = active >= STEPS.length ? 'alles erledigt' : `Schritt ${active + 1} von ${STEPS.length}`
    const crewMeta = [`${running.length} aktiv`, done.length > 0 ? `${done.length} fertig` : ''].filter(Boolean).join(' · ')
    const busyIssues = issueNumbers.filter(n => workersOf(n).length > 0).length

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {section(
          'flow',
          'Ablauf',
          flowMeta,
          panel(
            'flow',
            <Box flexDirection="column">
              {stepper($, Box, Text, Button, Svg, active, t % 2)}
              <Box marginTop={1}>
                <Button
                  key="reset"
                  plain
                  dimColor
                  onPress={async () => {
                    await update($, flow, () => 0)
                    await $.store.set('flow', 0)
                  }}
                >
                  ↺ zurücksetzen
                </Button>
              </Box>
            </Box>,
          ),
          true,
        )}
        {section('cache', 'Session-Cache', '', panel('cache', cacheLine(Box, Text, Svg, cs, now, ttl, true)))}
        {section(
          'crew',
          'Agenten',
          crewMeta,
          <Box flexDirection="column">
            {list.length === 0 && panel('empty', <Text dimColor>Keine Sub-Agents. Es ist ruhig im Bau …</Text>)}
            {running.map(card)}
            {done.length > 0 && (
              <Box marginTop={1}>
                <Text dimColor>Zuletzt fertig</Text>
              </Box>
            )}
            {done.map(card)}
          </Box>,
        )}
        {issueNumbers.length > 0 &&
          section(
            'issues',
            'Issues',
            `${issueNumbers.length} verknüpft${busyIssues > 0 ? ` · ${busyIssues} in Arbeit` : ''}`,
            <Box flexDirection="column">{issueNumbers.map(issueCard)}</Box>,
          )}
      </Box>
    )
  })
}
