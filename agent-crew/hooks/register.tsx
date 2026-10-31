import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Activity, CacheStats, CrewAgent, Issue, MainState } from '../types'
import {
  GOLD, HUES, INK, MUTED, PANE_BG, RED, RING_COLUMNS, RING_ROWS, SOFT, SPRITE_BG, SPRITE_COLUMNS, SPRITE_ROWS,
  barSpan, barSvg, ringCells, ringSvg, spriteCells,
} from './gfx'
import type { Hue } from './gfx'
import { BOSS, SPRITES } from './sprites'

const PANE = 'agent-crew'
const OPEN = { id: PANE, title: 'Agent Crew', backgroundColor: PANE_BG }
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
// The main agent, kept apart from the crew: busy while a turn of its own runs.
const main = atom({ plugin: 'agent-crew', key: 'main' } as const, { busy: false, since: 0, turns: 0 } as MainState)
const MAIN = 'main'
// Busy as a plain flag too, for the frame clock, which reads no atoms.
let mainBusy = false
// `/crew demo` draws three made-up agents instead of the real crew, for visual checks and recordings.
const demo = atom({ plugin: 'agent-crew', key: 'demo' } as const, false)
let demoOn = false

type Step = { label: string; names: string[]; command: string }
const STEPS: Step[] = [
  { label: 'Grillen', names: ['grill-me', 'grill-with-docs', 'grilling'], command: '/mattpocock-skills:grill-me' },
  { label: 'Spec', names: ['to-spec'], command: '/mattpocock-skills:to-spec' },
  { label: 'Tickets', names: ['to-tickets'], command: '/mattpocock-skills:to-tickets' },
  { label: 'Umsetzen', names: ['implement-spec'], command: '/implement-spec' },
  { label: 'Retro', names: ['retro'], command: '/retro' },
  { label: 'PR', names: ['pr'], command: '/pr' },
]
// The retro is no step of every round, only every now and then: optional, and skipped when the
// round goes straight on to /pr.
const RETRO = STEPS.findIndex(st => st.command === '/retro')
const RETRO_NOTE = 'optional · immer mal wieder'
const RETRO_PROMPT =
  'Retro (/retro) ist optional und nur immer mal wieder dran, nicht in jeder Runde. ' +
  'Ruf /retro nicht von dir aus nach jedem /implement-spec auf; meist geht es direkt mit /pr weiter. ' +
  'Schlag eine Retro nur vor, wenn länger keine mehr lief oder es in der Runde etwas zu lernen gab, ' +
  'und mach sie, wenn die Person danach fragt.'
// Whether the current round of the flow ran its retro.
const retroRan = atom({ plugin: 'agent-crew', key: 'retroRan' } as const, false)

const stepOf = (text: string): number => {
  const m = /(?:^|<command-name>)[ ]*[/](?:[a-z-]+:)?([a-z-]+)/.exec(text)
  if (!m) return -1
  return STEPS.findIndex(st => st.names.includes(m[1]!))
}

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
// Hues in the order agents got their names: stable, and different for the first six.
const hueOf = (id: string, names: Record<string, string>): Hue => {
  if (id === MAIN) return GOLD
  const at = Object.keys(names).indexOf(id)
  return HUES[(at >= 0 ? at : hash(id)) % HUES.length]!
}
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

// The main agent as a crew member, so it picks its critter the same way: working while its turn
// runs, cheering for a moment after, then dozing until the next prompt.
const mainAgent = (m: MainState, now: number): CrewAgent => ({
  id: MAIN,
  type: 'Claude',
  description: '',
  status: m.busy ? 'running' : m.turns > 0 && now - m.since < 8000 ? 'completed' : 'idle',
  startedAt: m.since,
})

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
const totalOf = (tok: Record<string, number>) => Object.values(tok).reduce((a, b) => a + b, 0)
const shareOf = (n: number | undefined, sum: number) => (sum > 0 ? Math.round(((n ?? 0) / sum) * 100) : 0)
// Longest status or task line on a card; it must stay one line.
const CARD_TEXT = 48
// Rows of the screen a docked pane leaves to the engine: prompt, status lines, its own title.
const PANE_CHROME = 9

// The three agents of `/crew demo`, each working through a few tools. Orange, green, blue as named.
const DEMO = [
  { id: 'demo-code', name: 'Code Agent', model: 'claude-sonnet-5-5', tokens: 84_000, secs: 312, task: 'Baut die neue Pane', tools: ['Edit', 'Bash', 'Read'], command: 'git status' },
  { id: 'demo-research', name: 'Research Agent', model: 'claude-haiku-5-5', tokens: 52_000, secs: 148, task: 'Liest die Render-API', tools: ['Grep', 'WebFetch', 'Read'], command: '' },
  { id: 'demo-review', name: 'Review Agent', model: 'claude-opus-5-5', tokens: 31_000, secs: 67, task: 'Prüft den Diff', tools: ['Read', 'Bash', 'Grep'], command: 'bun test' },
]
function demoData(now: number, t: number) {
  const of = <T,>(f: (d: (typeof DEMO)[number]) => T) => Object.fromEntries(DEMO.map(d => [d.id, f(d)]))
  return {
    list: DEMO.map(d => ({ id: d.id, type: 'general-purpose', description: d.task, status: 'running', startedAt: now - d.secs * 1000 })) as CrewAgent[],
    acts: of(d => [{ tool: d.tools[Math.floor(t / 8) % d.tools.length]!, detail: d.command, at: now }]),
    nm: of(d => d.name),
    mods: { ...of(d => d.model), [MAIN]: 'claude-opus-5-5' } as Record<string, string>,
    tok: { ...of(d => d.tokens), [MAIN]: 96_000 } as Record<string, number>,
    boss: { busy: true, since: now - 95_000, turns: 4 },
    cs: {
      last: { read: 182_000, create: 7_500, input: 2_500, at: now - 720_000 },
      read: 920_000, create: 88_000, input: 12_000,
    },
    ttl: 3_600_000,
    lk: {} as Record<string, number[]>,
    iss: {} as Record<string, Issue>,
  }
}

// Everything a drawing shows; reading it subscribes the drawing to it.
async function snapshot($: any, now: number) {
  const s = {
    list: await read($, agents),
    acts: await read($, activity),
    t: await read($, frame),
    lk: await read($, links),
    iss: await read($, issues),
    tok: await read($, tokens),
    active: await read($, flow),
    cs: await read($, cache),
    ttl: await read($, cacheTtl),
    mods: await read($, models),
    nm: await read($, names),
    boss: await read($, main),
    ranRetro: await read($, retroRan),
  }
  await read($, tick)
  return (await read($, demo)) ? { ...s, ...demoData(now, s.t) } : s
}

let implementing = false
async function startStep($: any, i: number) {
  implementing = i === STEPS.length - 1
  if (i === RETRO) {
    await update($, retroRan, () => true)
  } else if (i < RETRO) {
    await update($, retroRan, () => false)
  }
  await update($, flow, () => i)
  await $.store.set('flow', i)
}

const pctOf = (c: { read: number; create: number; input: number }) => {
  const total = c.read + c.create + c.input
  return total > 0 ? Math.round((c.read / total) * 100) : 0
}
const ago = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}

const clockTime = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// The drawings of one render, in whatever its surface can draw. Ask the surface, not the table: an
// element a surface lacks can still resolve, to a stub that draws nothing, so `Svg ?` is true on the
// terminal and blanks every drawing there.
function drawings({ Box, Svg, Raster }: any, surface: string) {
  const vector = surface !== 'terminal'
  return {
    sprite: (key: string, source: string, alt: string, bg?: string) =>
      vector ? (
        <Svg source={source} alt={alt} width={60} height={50} />
      ) : (
        <Box width={SPRITE_COLUMNS} flexShrink={0}>
          <Raster key={key} columns={SPRITE_COLUMNS} rows={SPRITE_ROWS} cells={spriteCells(source, bg)} />
        </Box>
      ),
    // The terminal's bar is boxes, so it takes the room its card has at any pane width.
    bar: (pct: number, hue: Hue, pulse?: number, width = 180) => {
      if (vector) return <Svg source={barSvg(pct, hue, pulse)} alt={`${pct} Prozent`} width={width} height={10} />
      const [offset, fill] = barSpan(pct, pulse)
      return (
        <Box flexDirection="row" flexGrow={1} height={1} minWidth={8} backgroundColor={hue.track}>
          {offset > 0 && <Box flexGrow={offset} />}
          {fill > 0 && <Box flexGrow={fill} backgroundColor={hue.fg} />}
          {offset + fill < 100 && <Box flexGrow={100 - offset - fill} />}
        </Box>
      )
    },
    ring: (key: string, pct: number | null, hue: Hue, text: string) =>
      vector ? (
        <Svg source={ringSvg(pct, hue, text)} alt={`${text}`} width={64} height={64} />
      ) : (
        <Raster key={key} columns={RING_COLUMNS} rows={RING_ROWS} cells={ringCells(pct, hue, text)} />
      ),
  }
}

// What the cache gauges show: warm time left and hit rate of the last main-loop response.
function cacheNow(c: CacheStats, now: number, ttlMs: number) {
  if (!c.last) return null
  const expiresAt = c.last.at + ttlMs
  const left = expiresAt - now
  return {
    left,
    expiresAt,
    remaining: Math.max(0, Math.min(100, Math.round((left / ttlMs) * 100))),
    hit: pctOf(c.last),
    hue: left <= 0 || left < ttlMs * 0.2 ? RED : HUES[3]!,
  }
}

// The cache in one line, for the band above the prompt.
function cacheLine(ui: any, surface: string, c: CacheStats, now: number, ttlMs: number) {
  const { Box, Text } = ui
  const s = cacheNow(c, now, ttlMs)
  if (!s) return <Text dimColor>Cache: noch keine Daten</Text>
  const warm = s.left > 0
  return (
    <Box flexDirection="row" alignItems="center" width={72}>
      <Text dimColor>Cache </Text>
      <Box flexGrow={1} flexShrink={1} flexDirection="row">{drawings(ui, surface).bar(s.remaining, s.hue, undefined, 100)}</Box>
      <Text bold color={s.hue.fg}> {s.remaining}%</Text>
      <Text dimColor>
        {warm ? ` · Treffer ${s.hit}% · bis ${clockTime(s.expiresAt)}` : ` · kalt seit ${ago(-s.left)} · nächster Prompt schreibt neu`}
      </Text>
    </Box>
  )
}

// The flow as one row of chips: done, active, open. A press writes the skill into the prompt.
function stepper($: any, Box: any, Text: any, Button: any, active: number, pulse: number, ranRetro: boolean) {
  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center">
      {STEPS.map((st, i) => {
        // A skipped retro shows as skipped, not as done.
        const optional = i === RETRO && !ranRetro
        const isDone = i < active && !optional
        const isActive = i === active
        const color = isDone ? HUES[1]!.fg : isActive ? HUES[4]!.fg : undefined
        const mark = optional ? '◌' : isDone ? '✓' : isActive ? (pulse ? '◉' : '●') : '○'
        return (
          <Box key={`step-${i}`} flexDirection="row">
            {i > 0 && <Text color={i <= active ? HUES[1]!.fg : undefined} dimColor={i > active}> ─ </Text>}
            <Button key={`btn-${i}`} plain onPress={() => $.prompt.fill({ text: `${st.command} `, mode: 'replace' })}>
              <Text color={color} bold={isActive} dimColor={!isDone && !isActive}>
                {mark} {st.label}
              </Text>
            </Button>
          </Box>
        )
      })}
      {!ranRetro && <Text dimColor italic>{`  ${RETRO_NOTE}`}</Text>}
      {active >= STEPS.length && <Text color={HUES[1]!.fg} bold>{'  Alles erledigt'}</Text>}
    </Box>
  )
}

// Title and state of an issue as GitHub has them now; one lookup per issue at a time.
const fetching = new Set<number>()
function refresh($: any, n: number) {
  if (fetching.has(n)) return
  fetching.add(n)
  void $.process
    .run(['gh', 'issue', 'view', String(n), '--json', 'title,state'], { timeoutMs: 15000 })
    .then(async (r: any) => {
      if (r.exitCode !== 0) return
      const j = JSON.parse(r.stdout) as { title?: string; state?: string }
      await update($, issues, m => ({
        ...m,
        [n]: { number: n, title: j.title ?? m[n]?.title ?? '', state: j.state ?? m[n]?.state ?? '' },
      }))
    })
    .catch(() => {})
    .finally(() => fetching.delete(n))
}
// Every issue shown: closed or reopened elsewhere (on GitHub, by a merged PR) shows here too.
async function refreshAll($: any) {
  const known = ((await $.state.get({ plugin: 'agent-crew', key: 'issues' })).value ?? {}) as Record<string, Issue>
  for (const n of Object.keys(known).map(Number).sort((a, b) => b - a).slice(0, 8)) refresh($, n)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Show running sub-agents as pixel critters', argumentHint: '[demo]' })
    void $.ui.open(OPEN)
    demoOn = await read($, demo)

    $.clock.every(10000, () => update($, tick, n => n + 1))
    void refreshAll($).catch(() => {})
    $.clock.every(60000, () => refreshAll($).catch(() => {}))

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
      await update($, agents, () => mapped)
      // Names are display only: a failure here never holds back the agent list.
      if (mapped.some(a => !named.has(a.id))) {
        try {
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
          for (const a of mapped) named.add(a.id)
        } catch {
          // shown by type until a name sticks
        }
      }
      if (live || mainBusy || demoOn) await update($, frame, n => n + 1)
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
      const id = ((e as any).agentId as string | undefined) ?? MAIN
      if (e.model) await update($, models, m => (m[id] === e.model ? m : { ...m, [id]: e.model }))
    } catch {
      // display only
    }
    return yield* next(e)
  })

  on('command.run', { command: 'crew' }, async ($, e) => {
    if (e.args.trim() === 'demo') {
      demoOn = !demoOn
      await update($, demo, () => demoOn)
    }
    await $.ui.open(OPEN)
    return { text: `Agent Crew pane opened${demoOn ? ' (demo)' : ''}.` }
  })

  // A turn of the main agent starts: its critter gets to work.
  on('turn.start', async ($, e, next) => {
    try {
      if (!(e as any).agentId) {
        mainBusy = true
        const at = await $.clock.now()
        await update($, main, m => ({ ...m, busy: true, since: at }))
      }
    } catch {
      // display only
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Tokens per agent, summed over its turns.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    try {
      if (!(e as any).agentId) {
        mainBusy = false
        const at = await $.clock.now()
        await update($, main, m => ({ busy: false, since: at, turns: m.turns + 1 }))
      }
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
      if (u) {
        const who = id ?? MAIN
        const total = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
        await update($, tokens, m => ({ ...m, [who]: (m[who] ?? 0) + total }))
      }
    } catch {
      // display only
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Tells Claude the retro is optional, so it does not run one every round.
  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    return { sections: [...out.sections, { id: 'agent-crew:retro', text: RETRO_PROMPT, scope: 'session' as const }] }
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

    // Remember an issue and link it to the agent working on it; its state is looked up once the
    // command has run, so a close or reopen shows as what it did.
    const touch = async (n: number, title?: string) => {
      await update($, links, m => {
        const rest = (m[who] ?? []).filter(x => x !== n)
        return { ...m, [who]: [...rest, n].slice(-5) }
      })
      await update($, issues, m => ({
        ...m,
        [n]: { number: n, title: title ?? m[n]?.title ?? '', state: m[n]?.state ?? '' },
      }))
    }
    const used = isShell ? [...command.matchAll(ISSUE_USE)].map(m => Number(m[1])) : []

    try {
      if (e.tool === 'Skill' && who === 'main') {
        const i = STEPS.findIndex(st => st.names.includes(String((e as any).skill ?? '').split(':').pop()!))
        if (i >= 0) await startStep($, i)
      }
      const entry: Activity = { tool: e.tool, detail: detailOf(e), at: await $.clock.now() }
      await update($, activity, m => ({ ...m, [who]: [...(m[who] ?? []), entry].slice(-3) }))
      for (const n of used) await touch(n)
    } catch {
      // never block a tool call because of the display
    }

    const ran = await next(e)

    try {
      for (const n of used) refresh($, n)
      if (isShell && ISSUE_CREATE.test(command)) {
        const m = ISSUE_URL.exec(JSON.stringify((ran as any).result ?? ''))
        if (m) {
          const t = TITLE_ARG.exec(command)
          await touch(Number(m[1]), t ? (t[1] ?? t[2]) : undefined)
          refresh($, Number(m[1]))
        }
      }
    } catch {
      // display only
    }

    return ran
  })

  // Band above the prompt: the flow, one critter per agent with its bar, and the cache in a line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const now = await $.clock.now()
    const s = await snapshot($, now)
    const list = s.list.filter(a => isLive(a) || (a.endedAt !== undefined && now - a.endedAt < 8000))
    const ui = $.ui.resolve(e) as any
    const { Box, Text, Button } = ui
    const draw = drawings(ui, e.surface)
    const open = () => $.ui.open(OPEN)
    const sum = totalOf(s.tok)

    const critter = (id: string, source: string, name: string, status: string, hue: Hue, pulse?: number) => (
      <Box key={`agent-${id}`} flexDirection="row" marginRight={2}>
        {draw.sprite(`band-${id}`, source, status)}
        <Box flexDirection="column" marginLeft={1} width={18}>
          <Button key={`open-${id}`} plain onPress={open}>
            <Text bold color={hue.fg}>{clip(name, 18)}</Text>
          </Button>
          <Text dimColor>{clip(status, 18)}</Text>
          <Box flexDirection="row">{draw.bar(shareOf(s.tok[id], sum), hue, pulse, 120)}</Box>
        </Box>
      </Box>
    )

    const bossSprite = spriteFor(mainAgent(s.boss, now), (s.acts[MAIN] ?? []).slice(-1)[0], now)
    const bossStatus = [LABEL[bossSprite], s.boss.busy ? sec(now - s.boss.since) : '', modelName(s.mods[MAIN])].filter(Boolean).join(' · ')
    return (
      <Box flexDirection="column" alignItems="center">
        {stepper($, Box, Text, Button, s.active, s.t % 2, s.ranRetro)}
        <Box flexDirection="row" flexWrap="wrap" alignSelf="flex-start" marginTop={1}>
          {critter(MAIN, BOSS[bossSprite]![s.t % 2]!, 'Claude', bossStatus, GOLD, s.boss.busy ? s.t : undefined)}
          {list.slice(0, 3).map(a => {
            const sprite = spriteFor(a, (s.acts[a.id] ?? []).slice(-1)[0], now)
            const status = [LABEL[sprite], modelName(s.mods[a.id])].filter(Boolean).join(' · ')
            return critter(a.id, SPRITES[sprite]![s.t % 2]!, s.nm[a.id] ?? a.type, status, hueOf(a.id, s.nm), isLive(a) ? s.t : undefined)
          })}
          {list.length > 3 && <Text dimColor>+{list.length - 3}</Text>}
        </Box>
        <Box marginTop={1}>{cacheLine(ui, e.surface, s.cs, now, s.ttl)}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as any
    const { Box, Text, Button } = ui
    const draw = drawings(ui, e.surface)
    const now = await $.clock.now()
    const { list, acts, t, lk, iss, tok, active, cs, ttl, mods, nm, boss, ranRetro } = await snapshot($, now)
    const running = list.filter(isLive)
    const done = list.filter(a => !isLive(a)).slice(-3)
    const sum = totalOf(tok)

    const issueLine = (n: number) => `#${n} ${iss[String(n)]?.title || '…'}`
    const issueCount = Math.min(Object.keys(iss).length, 8)

    // Rows the pane's body needs with framed cards, against what the surface leaves it. Short of
    // room the cards give up their frames, so the gauges below them stay in view.
    const needed = 6 + (running.length + 1) * 7 + done.length + (issueCount > 0 ? issueCount + 2 : 0) + RING_ROWS + 2
    const slim = needed > (e.viewport?.rows ?? Infinity) - PANE_CHROME

    // One agent: critter on the left, then name and badge, status, task, and its share of the tokens.
    type Card = {
      id: string; source: string; name: string; tag?: string; badge: string; status: string
      task: string; hue: Hue; pulse?: number
    }
    const cardOf = (c: Card) => (
      <Box
        key={`card-${c.id}`}
        flexDirection="row"
        alignItems="center"
        {...(slim ? {} : { borderStyle: 'round', borderColor: c.hue.fg })}
        backgroundColor={c.hue.tint}
        paddingRight={1}
        paddingLeft={slim ? 0 : 1}
      >
        {slim && <Box width={1} height={SPRITE_ROWS} marginRight={1} backgroundColor={c.hue.fg} />}
        <Box marginRight={2} flexShrink={0}>{draw.sprite(`sprite-${c.id}`, c.source, c.status, SPRITE_BG)}</Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              <Text bold color={INK}>{c.name}</Text>
              {c.tag && <Box marginLeft={2}><Text color={c.hue.fg}>{c.tag}</Text></Box>}
            </Box>
            <Text color={c.hue.fg}>{c.badge}</Text>
          </Box>
          <Text color={c.hue.fg} wrap="truncate">{clip(c.status, CARD_TEXT)}</Text>
          {c.task ? <Text color={SOFT} wrap="truncate">{clip(c.task, CARD_TEXT)}</Text> : null}
          <Box flexDirection="row" alignItems="center">
            {draw.bar(shareOf(tok[c.id], sum), c.hue, c.pulse)}
            <Text bold color={c.hue.fg}>{` ${kTok(tok[c.id] ?? 0).padStart(5)}`}</Text>
          </Box>
        </Box>
      </Box>
    )

    const card = (a: CrewAgent) => {
      const sprite = spriteFor(a, (acts[a.id] ?? []).slice(-1)[0], now)
      const cur = (lk[a.id] ?? []).slice(-1)[0]
      return cardOf({
        id: a.id,
        source: SPRITES[sprite]![t % 2]!,
        name: nm[a.id] ?? a.type,
        badge: `● ${sec(now - a.startedAt)}`,
        status: [LABEL[sprite], modelName(mods[a.id])].filter(Boolean).join(' · '),
        task: cur !== undefined ? issueLine(cur) : a.description,
        hue: hueOf(a.id, nm),
        pulse: t,
      })
    }

    // The main agent's own card: the crowned critter, its state and turns, and its ticket.
    const mainCard = () => {
      const sprite = spriteFor(mainAgent(boss, now), (acts[MAIN] ?? []).slice(-1)[0], now)
      const cur = (lk[MAIN] ?? []).slice(-1)[0]
      const since = boss.turns === 0 && !boss.busy ? '' : boss.busy ? ago(now - boss.since) : `vor ${ago(now - boss.since)}`
      return cardOf({
        id: MAIN,
        source: BOSS[sprite]![t % 2]!,
        name: 'Claude',
        tag: 'Hauptagent',
        badge: boss.busy ? 'arbeitet' : 'bereit',
        status: [
          LABEL[sprite],
          modelName(mods[MAIN]),
          since,
          boss.turns > 0 ? `${boss.turns} ${boss.turns === 1 ? 'Turn' : 'Turns'}` : '',
        ].filter(Boolean).join(' · '),
        task: cur !== undefined ? issueLine(cur) : '',
        hue: GOLD,
        pulse: boss.busy ? t : undefined,
      })
    }

    // Finished agents give up their card for a single line.
    const doneRow = (a: CrewAgent) => {
      const failed = a.status === 'failed' || a.status === 'killed'
      return (
        <Box key={`done-${a.id}`} flexDirection="row" paddingLeft={2}>
          <Text color={failed ? RED.fg : HUES[1]!.fg}>{failed ? '✗ ' : '✓ '}</Text>
          <Text color={SOFT}>
            {`${nm[a.id] ?? a.type} · ${sec((a.endedAt ?? now) - a.startedAt)} · ${kTok(tok[a.id] ?? 0)}`}
          </Text>
        </Box>
      )
    }

    const issueNumbers = Object.keys(iss).map(Number).sort((a, b) => b - a).slice(0, 8)
    const workersOf = (n: number) => [
      ...(boss.busy && (lk[MAIN] ?? []).includes(n) ? [mainAgent(boss, now)] : []),
      ...list.filter(a => (lk[a.id] ?? []).includes(n) && isLive(a)),
    ]

    // A section: a heading with a short summary to its right, then its content.
    const section = (key: string, title: string, meta: string, body: any, action?: any) => (
      <Box key={`sec-${key}`} flexDirection="column" marginBottom={slim ? 0 : 1}>
        <Box flexDirection="row" alignItems="center">
          <Text bold color={HUES[4]!.fg}>▍</Text>
          <Text bold color={INK}>{title}</Text>
          {meta ? <Box marginLeft={3}><Text color={SOFT}>{meta}</Text></Box> : null}
          {action ? <Box marginLeft={3}>{action}</Box> : null}
        </Box>
        {body}
      </Box>
    )

    const STATE: Record<string, { label: string; color: string }> = {
      OPEN: { label: '● offen', color: HUES[1]!.fg },
      CLOSED: { label: '● geschlossen', color: HUES[5]!.fg },
    }
    const issueRow = (n: number) => {
      const i = iss[String(n)]
      const w = workersOf(n)
      const st = STATE[(i?.state ?? '').toUpperCase()]
      return (
        <Box key={`issue-${n}`} flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text bold color={w.length > 0 ? hueOf(w[0]!.id, nm).fg : SOFT}>#{n}</Text>
          {st && <Text color={st.color}>{st.label}</Text>}
          <Text color={i?.title ? INK : SOFT}>{i?.title ? clip(i.title, 60) : 'Titel wird geladen …'}</Text>
          {w.map(a => (
            <Text key={`worker-${n}-${a.id}`} bold color={hueOf(a.id, nm).fg}>
              {a.id === MAIN ? 'Claude' : nm[a.id] ?? a.type}
            </Text>
          ))}
        </Box>
      )
    }

    // Round gauges from what the session measures: warm time left, hit rate, the crew's token share.
    const c = cacheNow(cs, now, ttl)
    const crewTokens = sum - (tok[MAIN] ?? 0)
    const gauge = (key: string, label: string, pct: number | null, hue: Hue, note: string) => (
      <Box key={`gauge-${key}`} flexDirection="column" alignItems="center" marginRight={3} width={14}>
        {draw.ring(`ring-${key}`, pct, hue, pct === null ? '–' : `${pct}%`)}
        <Text bold color={hue.fg}>{label}</Text>
        <Text color={SOFT}>{note}</Text>
      </Box>
    )

    const flowMeta = active >= STEPS.length ? 'alles erledigt' : `Schritt ${active + 1} von ${STEPS.length}`
    const crewMeta = [`${running.length} aktiv`, done.length > 0 ? `${done.length} fertig` : '', 'Balken: Token-Anteil'].filter(Boolean).join(' · ')
    const busyIssues = issueNumbers.filter(n => workersOf(n).length > 0).length

    return (
      <Box flexDirection="column" paddingX={1}>
        {section(
          'flow',
          'Ablauf',
          flowMeta,
          stepper($, Box, Text, Button, active, t % 2, ranRetro),
          <Button
            key="reset"
            plain
            dimColor
            onPress={async () => {
              await update($, flow, () => 0)
              await $.store.set('flow', 0)
              await update($, retroRan, () => false)
            }}
          >
            ↺ zurücksetzen
          </Button>,
        )}
        {section(
          'crew',
          'Agenten',
          crewMeta,
          <Box flexDirection="column">
            {mainCard()}
            {running.map(card)}
            {list.length === 0 && <Text color={SOFT}>Keine Sub-Agents. Es ist ruhig im Bau …</Text>}
            {done.map(doneRow)}
          </Box>,
        )}
        {issueNumbers.length > 0 &&
          section(
            'issues',
            'Issues',
            `${issueNumbers.length} verknüpft${busyIssues > 0 ? ` · ${busyIssues} in Arbeit` : ''}`,
            <Box flexDirection="column">{issueNumbers.map(issueRow)}</Box>,
          )}
        <Box flexDirection="row" flexWrap="wrap" justifyContent="center">
          {gauge(
            'warm',
            'Cache warm',
            c ? c.remaining : null,
            c ? c.hue : MUTED,
            !c ? 'keine Daten' : c.left > 0 ? `bis ${clockTime(c.expiresAt)}` : `kalt seit ${ago(-c.left)}`,
          )}
          {gauge('hit', 'Treffer', c ? c.hit : null, c ? HUES[1]! : MUTED, c ? `Session ${pctOf(cs)}%` : 'keine Daten')}
          {gauge('crew', 'Crew', sum > 0 ? Math.round((crewTokens / sum) * 100) : null, sum > 0 ? HUES[2]! : MUTED, `${kTok(sum)} Tokens`)}
        </Box>
      </Box>
    )
  })
}
