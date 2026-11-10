---
name: factory
description: Run the software factory. Use when the user types /factory alone or /factory help (prints the help), /factory #<issue> [#<issue> …], /factory next [k], either with --bundle, /factory fix <description>, /factory rework <pr> [note], /factory close [<pr> …] or /factory doctor [--fix], or asks to close the tickets the factory built. The session that runs it orchestrates the build → check → review loop of up to three jobs, each ending in a pull request into the integration branch whose CI it watches, or in a drafted spec when a ticket has none, and closes with a retro of every built job.
---

# Factory

You orchestrate jobs: a released ticket (`ready-for-agent`), or a **bundle** of related ones, becomes a pull request into the integration branch. You run the loop, spawn every agent and talk to `git` and `gh`; the agents write code and reviews. The human did the judgement work before (`grill-with-docs`, `prototype`, `to-spec` with Freigabe, `to-tickets`) and merges the PR after. A ticket without a parent spec gets one drafted by `spec-writer` (**Draft spec**), and its job stops there: the human reviews and releases the spec, then starts the ticket again. You never merge and never push to a protected branch. You close tickets only with **/factory close**, when the human says they are done: a PR into a branch that is not the default branch never closes them, and one into the default branch may close them before the human has looked.

**GitHub is the only state.** The issue says what to build, its label `factory-in-progress` says that the factory has taken it on, from the claim until **/factory close**, its assignee says who built it, the PR is the result. The label is what lets several sessions run the factory on one repo in parallel, each in its own worktrees, on one machine or several: every session skips a ticket that carries it, already in the search. Everything else is throwaway: the job's worktree and its scratch folder exist while this session runs the job and are removed at the end, so nothing of a job lands in the repo or outlives the session.

**`docs/agents/factory.md` is the repo's part.** It names the integration branch, the setup, the checks, the schema commands, the docs rule, the standards, the danger list and the security points of this repo, and optionally the specs in the repo (`## Specs`), the preview for the UI review (`## Preview`) and the CI watch (`## CI`). You and every agent follow it where this file says "the config".

**`factory.mjs` runs the fixed steps.** `node <skills>/factory/scripts/factory.mjs <command>` (below just `factory.mjs`, always from the main checkout) does the ready check, the claim, the setup, the gate before a review, the CI watch, the clean up, `/factory close` and `/factory doctor`, and prints one JSON object. Run it instead of doing its steps by hand. On `ok: false` stop with `⛔ <stop.reason>`, `Du musst: <stop.mustDo>` when it names one, and `error` under `Fehler <job>:`. It stops with `⛔ docs/agents/factory.md fehlt` and `⛔ Factory-Agenten fehlen` itself.

**Every message to the user follows [Output](#output)**, from the first line to the last, also when the user asks for the status.

## /factory or /factory help

When the arguments are empty or `help`, print the block below verbatim as your whole answer and stop: no tool call, no check, nothing else.

```text
/factory: Tickets mit ready-for-agent bauen, prüfen, reviewen, PR in den Integrationsbranch

  /factory #<n> [#<m> …]          Ticket(s) bauen, je ein PR (max. 3 parallel)
  /factory #<n> #<m> … --bundle   Diese Tickets zusammen: ein Branch, ein PR
  /factory next [k]               Die nächsten k freien Tickets (k ≤ 3, Standard 1)
  /factory next [k] --bundle      Freie Tickets nach Thema bündeln, k Bündel
  /factory fix <beschreibung>     Kleiner Fix ohne Ticket (ein Bug oder Text)
  /factory rework <pr> [notiz]    Offenen PR nacharbeiten (Notiz, Review-Kommentare, Konflikte)
  /factory close [<pr> …]         Tickets gemergter PRs schließen, dann ihre fertigen Specs
  /factory doctor [--fix]         Installation, Config und Reste früherer Läufe prüfen (--fix räumt auf)
  /factory help                   Diese Hilfe

Ablauf: Ready-Check → Builder → Checks → Security-, Code- und UI-Review (max. 3 Runden) → PR → CI → Retro.
Checks: die Factory führt ## Check aus, bevor Reviewer starten; rot geht direkt zurück an den Builder.
CI: die Factory wartet auf die Checks des PRs und lässt den Builder einmal nachbessern.
UI-Review: nur mit ## Preview in factory.md, wenn eine Runde dort genannte Pfade ändert.
Retro: pro gebautem Job ein Agent, am Ende eine Tabelle mit Verbesserungen und dem Aufwand.
Ticket ohne Spec: Spec-Entwurf als Issue, Ticket als Sub-Issue, Stopp bis zur Freigabe.
Freigabe: in der Spec "Freigegeben von: Name [JJJJ-MM-TT]" ausfüllen.
Specs im Repo (## Specs in factory.md): Entwurf als Draft-PR, Freigabe mit dem Release-Befehl im Spec-PR.
Draft-PR mit "Needs human", wenn du entscheiden musst. Branch: feat/<slug>-<n>, History linear.
Einstellungen des Repos: docs/agents/factory.md.
Label factory-in-progress: Ticket von der Factory übernommen, jede Session überspringt es.
Entfernt wird es nur von /factory close (oder /factory doctor --fix, wenn nichts mehr läuft).
Die Factory mergt nie und schließt Tickets nur mit /factory close.
```

## Session title

The session carries the name of what the factory does, so the user finds it among their sessions: `Factory · #142 Bewertungsfilter` (job label and the issue title cut to three words, as in **Start**), `Factory · #142, #150` for several jobs, `Factory · #143+#147 Review-Filter` for a bundle, `Factory · fix <slug>`, `Factory · rework #<pr>`, `Factory · close`, `Factory · doctor`. `/factory help` keeps the name it has.

- In a local session the hook `scripts/session-title.mjs` sets it from the `/factory` prompt before you start (`UserPromptSubmit`, `sessionTitle`); `install.mjs` of claude-mods registers it once in the user's `~/.claude/settings.json`, a project-local install in the repo's `.claude/settings.json` (README of claude-mods).
- When a tool that sets the session title is available, call it right after **Start** with the title of the jobs that started, also for `/factory next`, whose tickets the hook cannot know. In a cloud session that is `set_session_title` of the `claude-code-remote` server (load it with ToolSearch when it is deferred), with the id `get_session` without arguments returns.
- Neither available: go on without it. The title never appears in a message to the user.

## The loop

```
ticket → ready check ─ fails ─────────────────────────────► report, stop
              │      └─ no parent spec ─► spec-writer ─► spec issue or spec PR (Entwurf) ─► report, stop
              │ claim, setup
              ▼
           builder ◄──── checks red (max 2) ──── gate: factory.mjs check
              │                                    ▲          │ green
              └────────────────────────────────────┘          ▼
              ▲                          [security, code (, ui)] ──► WAIT FOR ALL
              │                                                         │
              └──────────── any CHANGES: resume builder (max 2) ◄───────┤
                                                                        │ all PASS, or rounds exhausted
                                                                        ▼
     sync (rebase on conflict) → PR into <integration> (draft when a human must decide) → watch CI
                                     ▲                                                        │
                                     └──── red: builder fixes, gate, one review round ◄───────┤
                                                                                              ▼
                                                     retro → clean up ─► last job ended: Status + Retro table
```

| Agent (`subagent_type`) | Writes                                                     | Skills                                                                                                            |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `builder`               | commits on the branch, `<scratch>/pr.md`, its final report | `implement`, `tdd`, `pr`; on demand `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `writing-for-agents` |
| `reviewer-security`     | `<scratch>/review-security.md`                             | none in the repo: its checklist and the config's `## Security`                                                    |
| `reviewer-code`         | `<scratch>/review-code.md`                                 | `code-review`, with its Spec and Standards sub-agents                                                             |
| `reviewer-ui`           | `<scratch>/review-ui.md`, `<scratch>/screens/`             | none: the config's `## Preview`, `factory.mjs preview` and `screenshot`                                           |
| `spec-writer`           | `<scratch>/spec.md` (and `criteria.md`), its final report  | `to-spec`, `codebase-design`                                                                                      |
| `retro`                 | `<scratch>/retro.md`, its final report                     | `retro`, `writing-for-agents`; reads the job's transcripts through `scripts/transcript.mjs` and `factory.mjs stats` |

The agents live in `<agents>` (**Names**); their source is `<skills>/factory/subagents/`. `factory.mjs ready` checks that they are installed and names in `warnings` every agent that is missing or whose installed copy differs from that source (an old copy): put each under `Du musst:` as `Factory: <warning>, node install.mjs, Session neu starten`, and go on. A missing `reviewer-ui` only skips the UI review; a missing `builder` or `retro` stops the ready check. What is special about this repo goes into `docs/agents/factory.md`, not into this file or the agents; rules for code live in `AGENTS.md`, which every agent reads.

## Names

- **Skills** (`<skills>`): the folder that holds this skill and the skills it calls, absolute. It is the parent of `${CLAUDE_SKILL_DIR}`. When that is not filled in: `<main>/.claude/skills` if it holds `factory/SKILL.md` (a project-local install), otherwise `~/.claude/skills` (or `$CLAUDE_CONFIG_DIR/skills`), with `~` expanded. Installed for the user by `install.mjs` of claude-mods, the factory serves every repo from there; only `docs/agents/factory.md` belongs to the repo.
- **Agents** (`<agents>`): `<main>/.claude/agents` when it holds `builder.md`, otherwise `~/.claude/agents` (or `$CLAUDE_CONFIG_DIR/agents`), absolute. Claude Code prefers the project's copy of an agent over the user's, the same order.
- **Version**: the claude-mods version the factory runs, `version` in the JSON of `factory.mjs ready` or `factory.mjs version` (`null` when unknown, then left out everywhere).
- **Repo**: `<owner>/<name>`, `repo` in the JSON of `factory.mjs ready`.
- **Integration branch** (`<integration>`): the config's `Integration branch`. **Protected branches**: the config's list, plus the integration branch and the default branch.
- **Spec job**: `spec-<n>[-<m> …]`, the numbers of the tickets without a spec, ascending (`spec-142-143`). It drafts a spec and builds nothing: no branch, a detached worktree, the scratch folder. With **Specs in the repo**, **Publish** puts the spec on the branch `spec/<spec>`, `<spec>` being the spec's folder name.
- **Job**: `<slug>-<n>`, a 2 to 4 word kebab-case English slug of the issue title plus the issue number (`rating-filter-142`). A bundle: a slug of what its tickets share plus every number, ascending (`review-filters-142-143-147`). For `/factory fix` without an issue: `<slug>` alone.
- **Branch**: `<type>/<job>`. `type` is `fix` when every ticket describes a bug, otherwise `feat`.
- **Worktree**, **Scratch**, **Schema lock**: `factory.mjs names <job>` prints them, and **Claim** returns them. The worktree is `<main>/../<name>-factory/<job>`, `<main>` the main checkout, `<name>` its directory name. Your session stays in the main checkout and only runs `git fetch`, `git worktree`, `git branch`, `gh` and `factory.mjs` there: it belongs to the user. The scratch folder is `<temp>/factory/<name>/<job>/` in the system's temp folder; agents pass notes through it, nothing in it is kept. The schema lock is `<temp>/factory/<name>/.schema-lock/`: all jobs of this repo on this machine share one dev database, so only one job at a time applies a migration. The builder takes it with `mkdir`; it holds the job name in `owner`.
- **Base**: the `origin/<integration>` commit the branch sits on: `base` of **Claim**, the rebase target after a **Sync**. Agents diff against it, so a moving integration branch never changes what they review.
- **In-progress label**: `factory-in-progress`. A job puts it on each of its tickets when it claims them (**Claim**). Only **/factory close** takes it off, when it closes the ticket, and **/factory doctor --fix** from a ticket that has no PR, branch or worktree left: no job end, no failure and no other command removes it. A ticket that carries it has been taken on by the factory, so the ready check fails for it and **/factory next** leaves it out.

## Record

The retro sees what the job's agents did through two things you keep in the scratch folder while the job runs:

- `<scratch>/agents.md`: one line per agent run, appended when you spawn the agent: `<agent> <round> <agent id>` (`builder 1 a1b2c3…`, `security 1 d4e5f6…`, `ui 1 …`). The agent id is the `agentId` the Agent tool result names. A builder resumed with `SendMessage` keeps its id and gets one more line with the new round. `factory.mjs stats <job>` reads this file.
- `<scratch>/history/`: when a builder finishes, its final report as `builder-<N>.md` (`builder-<N>-rebase.md` for a rebase, `builder-<N>-checks.md` and `builder-<N>-ci.md` for those fixes); after each gate, `cp` of `check.md` to `check-<N>.md`; when a review round is done, `cp` of every review file of the round to `review-security-<N>.md`, `review-code-<N>.md` and `review-ui-<N>.md`; after a red CI, `cp` of `ci.md` to `ci-<N>.md`. Always before the next run overwrites them.

Every agent prompt starts with `<head>`, the sentence **Claim** returns as `head`:
`Job: <job>. Tickets: #<n>[, #<m> …] in build order (or: Small fix: <description, verbatim>). Worktree: <worktree>. Branch: <branch>. Base: <base>. Scratch: <scratch>. Schema lock: <schema lock>. Skills: <skills>. Agents: <agents>.`
After a **Sync** its `Base:` is the new base.

## Freigabe

Every spec the factory drafts starts with this block. The human releases it by replacing only the two placeholders in the `Freigegeben von:` line, `Name` with their name and `JJJJ-MM-TT` with the date, keeping the square brackets:

```markdown
## Freigabe

- Entwurf: <who drafted it: Factory, /to-spec or a name>, <YYYY-MM-DD>
- Freigegeben von: Name [JJJJ-MM-TT]
```

- **Released** means the line reads `- Freigegeben von: <name> [YYYY-MM-DD]`: a name other than `Name`, then a real date in square brackets (`Freigegeben von: Erika Muster [2026-10-24]`). A spec without the block is released by a line `Status: freigegeben (<YYYY-MM-DD>)` with a real date. Nothing else is a Freigabe: not a `ready-for-agent` label on the spec, not an `Entwurf` line or `Status: entwurf`, not a date without a name in the block.
- **A spec** is an issue whose body has the `## Freigabe` block, a `## Problem Statement` or `## User Stories` section, or a line starting with `Status:`, or that has sub-issues.

`factory.mjs` applies exactly these rules (`scripts/lib.mjs`: `isReleased`, `isSpec`).

## Specs in the repo

When the config has a `## Specs` section, specs are files in the repo, not issues. Its lines are looked up by name: below, `Specs: <line>` is the command or rule of that line (`Specs: Check`, `Specs: Release`). Without the section, nothing of this applies.

- **The spec of a ticket** is the file its `Spec:` line names, as `Specs: Spec of a ticket` says, read from `origin/<integration>`. Wherever this file says parent spec, it means that file; a ticket without a `Spec:` line has none. Its `Kriterien:` line lists the criteria (`AC-<n>`) it delivers: they are its acceptance criteria.
- **Released** means what `Specs: Released` says, nothing else: not a draft PR, not a merged spec in `entwurf`. `factory.mjs` applies the template's rule (`Status:` reads `freigegeben` or `umgesetzt`); when the config's `Specs: Released` says something else, check that rule yourself after `factory.mjs ready`.
- The `## Freigabe` block and spec issues don't exist: every issue is a ticket.
- A spec file changes only by the human and the spec's commands. No builder edits it, and only **Draft spec** and **/factory close** run its commands.

## Linear history

Every job branch is a straight line of commits on top of its base, and stays one: `git rev-list --merges <base>..HEAD` prints nothing, at every step and before every push. The gate checks it in every round.

- A branch catches up with the integration branch only by `git rebase`. `git merge` and a plain `git pull` never run in a worktree.
- A conflict is resolved inside the rebase, commit by commit (**Sync**), never with a merge commit and never in GitHub's conflict editor, which writes one.
- A rebased branch that is already on `origin` is pushed with `git push --force-with-lease=<branch>:<its sha on origin before the rebase> origin <branch>`, only for the job's own branch. Every other push is a plain `git push`.

## /factory #<issue>

1. **Ready check.** `factory.mjs ready <n>`. It reads the config, checks the agents, `gh auth status`, fetches `origin/<integration>` and checks every condition that makes a ticket ready: open, `ready-for-agent`, acceptance criteria, unassigned or yours, no in-progress label, a ticket and not a spec, its parent spec released, every blocker closed; with **Specs in the repo** instead of the parent spec: its `Spec:` file merged on the integration branch and released, its `Kriterien:` line naming criteria of that spec that are not dropped. Its issue entry says:
    - `ready: true`: go to **Claim**.
    - `draftSpec: true` (no parent spec at all, and nothing else of the ticket itself fails): go to **Draft spec**. Open blockers don't stop the draft, only the build.
    - otherwise stop without creating anything and end with **Status**: the first failure's `reason` as `⛔ <reason>`, every `mustDo` under `Du musst:`. If `gh` fails, use the fallbacks in `docs/agents/issue-tracker.md`.

2. **Claim.** `factory.mjs claim <job> --mode build --branch <branch> --issues <n>[,<m> …]`. It cuts the worktree first, because that can be undone and the label cannot, then reads the labels again (another session, maybe on another machine, may have claimed the ticket since the ready check), sets the in-progress label and you as assignee, and creates the scratch folder with `history/`. `claimed: false`: stop with `⛔ <reason>` (`läuft bereits (Worktree existiert)`, `läuft bereits (Label)`). Its `warnings` go under `Du musst:`. Keep its `head` as `<head>`, and its `worktree`, `scratch` and `base`.
3. **Setup.** `factory.mjs setup <job>` runs the config's `## Setup` in the worktree. `ok: false`: go to **Clean up** with `⛔ <stop.reason>` and the error under `Fehler <job>:`.
4. **Build.** Spawn `builder` **with the name `builder-<job>`** and the prompt `<head> Build round 1.` When it finishes, go to **Build check**. From here on, every job ends with **Retro** before **Clean up**, also when it stops with a failure.

## Draft spec

A ticket without a parent spec gets one drafted and published as a draft. Nothing is built from it until the human has released it, so the job ends with the spec.

1. **Claim.** `factory.mjs claim <job> --mode spec --issues <n>[,<m> …]`: a detached worktree of `origin/<integration>` and the scratch folder. `claimed: false`: another session drafts this spec, stop with `⛔ läuft bereits (Worktree existiert)`. No **Setup**: the spec writer only reads. The ticket gets neither the in-progress label nor an assignee: nothing is built from it yet, and the human starts it with `/factory #<n>` once the spec is released.
2. **Draft.** Spawn `spec-writer` **with the name `spec-writer-<job>`** and the `head` of the claim as the prompt (`Job: <job>. Tickets: #<n>[, #<m> …]. Worktree: <worktree>. Scratch: <scratch>. Skills: <skills>.`). On `STATUS: BLOCKED`, go to step 5 with the blocker as `⛔ <reason>`.
3. **Check.** Line 1 of `<scratch>/spec.md` starts with `TITLE: `, line 3 is `## Freigabe`, and its `Freigegeben von:` line is still `- Freigegeben von: Name [JJJJ-MM-TT]`. Otherwise go to step 5 with `⛔ Spec-Entwurf fehlerhaft`.
4. **Publish.** Check every ticket once more for a parent (`factory.mjs ready <n> …`: a ticket whose `draftSpec` is now false has got one in the meantime); leave those out, and when none is left, go to step 5. Then:
    - `tail -n +3 <scratch>/spec.md | gh issue create --title "<title>" --body-file -`, without a label: the spec isn't built itself, and a label on a spec is no Freigabe.
    - Link each ticket as a sub-issue of the spec: `gh api --method POST repos/<repo>/issues/<spec>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the ticket's database id (`id` of its entry in `factory.mjs ready`). If that fails, name the ticket under `Du musst:` so the human links it.
    - Comment on each ticket: `gh issue comment <n> --body "Spec-Entwurf #<spec> angelegt. Gebaut wird nach der Freigabe."`.
5. **Clean up.** `factory.mjs cleanup <job>`; there is no branch. The job's bold row in **Status** is `📝 Spec #<spec>`, with `Du musst: #<spec>: <k> Offene Fragen klären, Freigabe ausfüllen, dann /factory #<n>` and each ticket that could not be linked (`#<n> als Sub-Issue von #<spec> verknüpfen`). Or `⛔ <reason>` when there is no spec.

### Draft spec with Specs in the repo

The spec becomes a file on its own branch and a draft PR into the integration branch. Steps 1 and 2 stay; the spec writer reads the config and also writes `<scratch>/criteria.md`. Steps 3 to 5 read:

3. **Check.** Line 1 of `<scratch>/spec.md` is `SPEC: <spec>`, a kebab-case folder name whose spec path (`Specs: Spec of a ticket`, `<path>` below) `origin/<integration>` doesn't have yet; line 3 starts with `# Spec: `; the status line is `Status: entwurf`. `<scratch>/criteria.md` has one line `#<n>: AC-<i>[, AC-<j> …]` per ticket. Otherwise go to step 5 with `⛔ Spec-Entwurf fehlerhaft`.
4. **Publish.** Check every ticket once more for a `Spec:` line (`gh issue view <n> --json body`); one that has got one in the meantime is left out, and when none is left, go to step 5. Then, in the worktree:
    - `git switch -c spec/<spec>`; `git ls-remote --exit-code --heads origin spec/<spec>` must find nothing. Otherwise another session drafts a spec of that name: go to step 5 with `⛔ läuft bereits (Branch existiert)`.
    - Write `tail -n +3 <scratch>/spec.md` to `<path>`, then run `Specs: Check`. If it fails, go to step 5 with `⛔ Spec-Entwurf fehlerhaft` and its output under `Fehler <job>:`.
    - `git add <path>`, commit as `docs(specs): draft <spec>` with one `Refs #<n>` line per ticket in the body, `git push -u origin spec/<spec>`.
    - Write `<scratch>/spec-pr.md` (below) and `gh pr create --draft --base <integration> --head spec/<spec> --title "docs(specs): <title>" --body-file <scratch>/spec-pr.md`, `<title>` being line 3 after `# Spec: `. The PR has no `Closes #<n>` line: a spec closes no ticket.
    - Append both lines to each ticket's body: `{ gh issue view <n> --json body --jq .body; printf '\nSpec: %s\nKriterien: %s\n' '<path>' '<ids>'; } | gh issue edit <n> --body-file -`, `<ids>` from its line in `criteria.md`. If that fails, name the ticket under `Du musst:`.
    - Comment on each ticket: `gh issue comment <n> --body "Spec-Entwurf in #<pr> (<path>). Gebaut wird nach Freigabe und Merge."`.
5. **Clean up.** `factory.mjs cleanup <job> --branch spec/<spec>` when **Publish** created the branch (the pushed branch lives on `origin`), otherwise `factory.mjs cleanup <job>`. The job's bold row in **Status** is `📝 Spec #<pr>`, with `Du musst: #<pr>: <k> Offene Fragen klären, freigeben (<Specs: Release>), mergen, dann /factory #<n>` and each ticket whose body could not be edited (`#<n>: Zeilen Spec: und Kriterien: ergänzen`). Or `⛔ <reason>` when there is no PR.

`<scratch>/spec-pr.md`, in German:

```markdown
Spec-Entwurf der Factory für #<n>[, #<m> …]. Gebaut wird nach Freigabe und Merge.

## Offene Fragen

<the spec's open questions, verbatim>

## Freigabe

1. Offene Fragen in `<path>` auf diesem Branch klären.
2. `<Specs: Release>` auf diesem Branch, committen, pushen.
3. PR auf ready setzen und mergen, dann `/factory #<n>[ #<m> …]`.
```

## /factory fix <description>

For a small fix without a ticket: one bug or one copy change, no new screen, no new schema model or migration, no new dependency. If the description is more than that, stop with `⛔ zu groß für fix` and `Du musst: /to-spec`. Otherwise run **/factory #<issue>** from step 2 with `factory.mjs claim <slug> --mode fix --branch fix/<slug> --fix "<description>"`: no label and no assignee (there is no ticket), and its `head` says `Small fix: <description>`.

## Build check

The first line of the builder's final report is `STATUS: READY` or `STATUS: BLOCKED`.

- `READY`: start the next review round, from its gate.
- `BLOCKED` on the schema lock, in a batch where another job of this session holds it: wait for that job's **Clean up**, then resume the builder with `The schema lock is free. Continue.`
- Any other `BLOCKED`: if the branch has commits beyond `<base>`, go to **Open PR** as a draft with the blocker under Needs human. Otherwise go to **Clean up** with the blocker as `⛔ <reason>`.

## Review round N

1. **Gate.** `factory.mjs check <job> --round <N>` (after a **Sync** with `--base <new base>`). It runs the config's `## Check` in the worktree, checks that the tree is clean and the history linear, writes `<scratch>/check.md` and returns `pass`, `prev` and `ui`. Checks take long: run it with `run_in_background: true` when other jobs of this session are running, and in **Several jobs** always.
    - `pass: false`: no reviewer starts. Resume the builder with `SendMessage` to `builder-<job>`: `Checks fail at round N: read <scratch>/check.md, fix the cause, commit, rewrite pr.md.`, then **Build check** and this gate again. A job gets two such fixes in all; when the gate fails a third time, go to **Open PR** as a draft with `Checks rot: <failed>` under Needs human.
    - `pass: true`: go on.
2. **Reviewers.** Spawn `reviewer-security` and `reviewer-code` **in one message**, so they run in parallel, and `reviewer-ui` in the same message when `ui` is true and the agent is installed. Each prompt is `<head> Review round N.`, plus ` Previous head: <prev>.` when `prev` is not null: then the reviewers check their last findings and review the delta since that head, not the whole branch again.
3. **WAIT FOR ALL.** The round is done when every reviewer of the round has finished and each of its `review-*.md` in `<scratch>` starts with `VERDICT: PASS` or `VERDICT: CHANGES`. Never resume the builder mid-round. If a reviewer finishes without such a file, stop with `⛔ Review-Datei fehlt`.
4. Decide:
    - **All PASS**: go to **Open PR**.
    - **Any CHANGES, round 1 or 2**: resume the builder with `SendMessage` to `builder-<job>`: `Round N reviews are in <scratch>. Address every review with VERDICT: CHANGES, commit, and rewrite pr.md.` When it finishes, go to **Build check**.
    - **Any CHANGES in round 3**: go to **Open PR** as a draft, with `Review rounds exhausted` and each outstanding finding under Needs human.

## Open PR

1. In the worktree, `git branch --show-current` must print the job's branch, and the last gate passed on the current `HEAD` (`git rev-parse HEAD` is the `HEAD:` of `check.md`). Otherwise stop with `⛔ Worktree nicht sauber`, leaving the worktree for the human to inspect (`Du musst: <worktree> prüfen`).
2. **Sync.** `git fetch origin <integration>`, then `git merge-tree --write-tree origin/<integration> HEAD`. No conflict: go on, GitHub can rebase the branch when the human merges. Conflict:
    - Resume the builder with `Rebase onto <sha of origin/<integration>>.` When it reports `READY`, that sha is the new `<base>`.
    - Run one more review round on the result, its gate with `--base <new base>`. Any `CHANGES` or a red gate there go under Needs human; the builder is not resumed again.
    - The builder reports `BLOCKED` on the rebase: it aborted it, so the branch is as before. Put the conflict under Needs human and go on.
3. **Needs human.** Collect what the human must decide before merging:
    - every path of `git diff --name-only <base>...HEAD` on the config's `## Danger list`;
    - every item under `## For the human` in the review files, and the Assumptions from the builder's report that are product decisions (pricing, what a plan includes, customer copy about the business);
    - an unresolved conflict with the integration branch;
    - the blocker, the red checks or the exhausted rounds that sent you here.
4. **PR text.** `<scratch>/pr.md` follows the `pr` skill: line 1 is `TITLE: <conventional commit title>`, line 2 is blank, and the body from line 3 has the headings `## Summary`, `## Evidence` and `## Merge Danger`. When one is missing, resume the builder with `pr.md does not follow the pr skill template: <what is missing>. Rewrite pr.md.` and check again; still missing, stop with `⛔ PR-Text ohne pr-Template`, leaving the worktree. Every PR the factory opens or edits takes its body from this file.
5. Push the branch as **Linear history** says, never any other branch.
6. Write the body to `<scratch>/pr-body.md`: `tail -n +3 <scratch>/pr.md`, then, when the Needs human list is not empty, a `## Needs human` section with it, and last the line `Gebaut mit claude-mods <version> (/factory).` when the version is known. With Needs human the PR is a draft.
    - New PR: `gh pr create --base <integration> --head <branch> --title "<title>" --body-file <scratch>/pr-body.md [--draft]`.
    - Rework: the push updated the PR; `gh pr edit <pr> --body-file <scratch>/pr-body.md`, and `gh pr ready <pr> --undo` when it now needs a human.
7. If push or PR creation fails, stop with `⛔ Push fehlgeschlagen` or `⛔ PR-Erstellung fehlgeschlagen` and the output under `Fehler <job>:`, leaving the worktree. Otherwise go to **Watch CI**.

## Watch CI

The PR's own checks run on GitHub; the job waits for them, so a PR is ✅ only when its CI is green. The config's `## CI` sets the wait (`Wait`, minutes) and the fix rounds (`Fix rounds`); without the section, 20 minutes and one round; `None.` skips this step.

1. `factory.mjs ci <pr> --wait 540 --logs <scratch>/ci.md` with a Bash timeout of 600000 (in **Several jobs** with `run_in_background: true`). `state: pending` while the wait is not used up: call it again.
2. `pass` or `none` (the repo has no checks): go to **Retro**.
3. `fail`, a fix round left: `cp` of `ci.md` to `history/ci-<N>.md`, resume the builder with `CI failed on #<pr>: read <scratch>/ci.md, fix the cause, commit, rewrite pr.md.` On `READY`: one review round on the fix, gate first (round N+1, also past round 3); any `CHANGES` or a red gate go under Needs human. Push (a plain `git push`), update the body as **Open PR** step 6 says, and watch again from step 1. A `BLOCKED` builder: its blocker goes under Needs human.
4. `fail` with no fix round left, or still `pending` when the wait is used up: put `CI rot: <failed>` or `CI nach <m> min nicht fertig` under Needs human, update the body as **Open PR** step 6 says and set the PR to draft (`gh pr ready <pr> --undo`). Go to **Retro**.

## Retro

Every job whose builder ran gets one retro, right before its **Clean up** or before a stop that leaves the worktree: a PR, a draft, a `BLOCKED` builder, a failed push. A bundle is one job and gets one retro for all its tickets. Spec jobs and jobs that stopped before the builder get none.

1. Spawn `retro` **with the name `retro-<job>`** and the prompt `<head> Retro: <scratch>/agents.md lists the agent runs, <scratch>/history/ holds the reports, checks, CI logs and reviews.` In **Several jobs** with `run_in_background: true`, like every agent.
2. When it finishes, line 1 of `<scratch>/retro.md` must be `STATUS: READY`. Keep its table rows (or `Keine Befunde.`) for the **Retro** block; they are gone with the scratch folder. No such file, or `STATUS: BLOCKED`: the retro row reads `⛔ <reason>`. The job result stays as it was: a retro never changes a PR.
3. `factory.mjs stats <job>`: keep its `line` for the **Aufwand** of **Status**; it too is gone with the scratch folder.
4. Go to **Clean up**, or stop as the step before said.

## Clean up

Always the last step of a job, also after a failure, and after its **Retro**: `factory.mjs cleanup <job>`. It stops a preview, removes the worktree, the local branch (the pushed branch lives on `origin`), the scratch folder and the schema lock when this job holds it. Then the job's last **Step** line ends in `PR ✅ #<pr>`, `PR ⚠️ #<pr> Draft` or `fertig` (followed by `→ retro` when a retro runs; the retro's own line then ends in `fertig`), and, when it was the last job, **Status** and **Retro** with the job result `✅ #<pr>`, or `⚠️ #<pr> Draft` with its Needs human items under `Du musst:`, or `⛔ <reason>`. The in-progress label stays on the tickets, also after a failure: a job that ends without a PR adds `#<n>: Label factory-in-progress entfernen, dann neu starten` under `Du musst:` for each of its tickets.

## /factory next [k]

1. `factory.mjs next`. It searches the open, unassigned `ready-for-agent` tickets without the in-progress label, oldest first, ready-checks each and returns them as `candidates` (ready, or without a parent spec) in that order; specs and tickets with an open blocker are left out, except a blocked one without a parent spec, which counts as a draft.
2. Take the first `k` (default 1, at most 3) whose **Claim** succeeds; a ticket whose claim fails (it got the label in the meantime, or its worktree exists) is skipped, not an error, and the next candidate takes its place. A ticket with `draftSpec` counts as one of the `k`, and its job is a **Draft spec**. Its next `/factory next` skips it, because its spec then waits for the Freigabe. One ticket: run **/factory #<issue>** from **Claim**. More: run them as **Several jobs**. If none is left, answer `Factory · keine freien Tickets` and stop. With `--bundle`, form bundles instead (**Bundles**).

## Several jobs

`/factory #<a> #<b> #<c>` or `/factory next <k>` runs up to three jobs side by side in this session. When the user asks for more, take the first three; **Start** names the rest as `nicht gestartet: max. 3 Jobs`.

- Every job runs the steps above on its own: its own worktree, scratch, base and agents, all named with its job (`builder-<job>`, `spec-writer-<job>`). A **Draft spec** is a job too, one per ticket without a spec.
- Spawn every agent, and run every gate and CI watch, with `run_in_background: true`. When one finishes, move only its job one step; one job never waits for another, except on the schema lock.
- A job's reviewers still go out in one message, and its **WAIT FOR ALL** is per job.
- Several sessions may run the factory on the same repo at the same time, in their own worktrees: the in-progress label keeps them apart, so no ticket is built twice. The limit of three jobs holds per session.
- Tickets of one batch are independent by construction, because a ticket with an open blocker is not on the frontier. Two of them may still touch the same files: the second PR then conflicts once the first is merged, and `/factory rework <pr>` rebases it.
- Every **Step** line starts with its job label. When the last job is cleaned up, end with **Status** and **Retro** in one message.

## Bundles (--bundle)

`--bundle` puts related tickets on one branch and into one PR, so work that belongs together is built, reviewed and merged together.

- `/factory #<a> #<b> … --bundle`: the named tickets are one job.
- `/factory next [k] --bundle`: you form the bundles. `factory.mjs next --limit 100 --bodies` returns the `candidates` with their bodies, and in `blockedOnly` the tickets whose only failures are open blockers. A ticket of `blockedOnly` joins a bundle only when every one of its `blockers` is in the same bundle. Then group:
    - **Related** means one branch is the natural place for them: the same parent spec first, otherwise the same feature, screen, module or model named in their titles and bodies. A shared word or label alone is not enough; in doubt, a ticket stays on its own.
    - A bundle holds at most 4 tickets. A ticket blocked by one outside its bundle stays out.
    - Take the bundle of the oldest ticket, then the next disjoint one, up to `k` (default 1, at most 3). A ticket with no related one is a bundle of one, a normal job.
    - **Start** names each bundle with its reason in at most six words (`Bündel: gleiche Spec #120`).
- **Build order**: blockers before the tickets they block, otherwise oldest first. It is the order of `--issues` in the claim and in `<head>`.
- The ready check and the claim hold for every ticket: `factory.mjs claim <job> --mode build --branch <branch> --issues <a>,<b>,…` claims the bundle as one, and stops with `läuft bereits (Label #<n>)` when one carries the label. With `next --bundle`, pass `--skip-labeled`: it drops those tickets (`dropped`) and claims the rest.
- Tickets without a parent spec: with `/factory #<a> #<b> … --bundle`, they get one spec together (**Draft spec**), and the bundle stops there, also for its tickets that have a released spec. With `next --bundle` they join no bundle: each becomes its own **Draft spec** job and counts as one of the `k`.
- The builder commits each ticket separately and may drop a ticket it can't build (`## Dropped` in its report). Remove the assignee from each dropped ticket (`gh issue edit <n> --remove-assignee @me`); the label stays. List it under `Du musst:` as `#<n>: nicht gebaut, <reason>, Label entfernen`. When it dropped all of them, it reports `BLOCKED`.
- The PR names every ticket it built, one `Closes #<n>` line each; dropped ones are not named.

## /factory rework <pr> [note]

Sends an open factory PR back to the builder, with the human's note and the PR's review comments. A PR that conflicts with the integration branch needs no note: **Sync** rebases it.

1. `gh pr view <pr> --json state,headRefName,body,comments,reviews` and `gh api repos/<repo>/pulls/<pr>/comments`. The PR must be open and its branch a `feat/` or `fix/` branch. `<job>` is the branch without its type, the tickets are the `Closes #<n>` lines of the body (none for a small fix).
2. `factory.mjs claim <job> --mode rework --branch <branch> --issues <n>[,<m> …]`: base is the merge base of the branch with `origin/<integration>`. `claimed: false`: stop with `⛔ läuft bereits (Worktree existiert)`. Then **Setup**.
3. Write `<scratch>/rework.md`: the note verbatim, then every unresolved review comment with its path and line, then the current PR body.
4. Spawn `builder` named `builder-<job>` with `<head> Rework: read <scratch>/rework.md and address it, then write pr.md.` Continue from **Build check** with a fresh count of rounds. **Open PR** then syncs and updates the existing PR, and **Watch CI** watches it.

## /factory close [<pr> …]

Closes the tickets of merged factory PRs, once the human says they are done with them, and then every parent spec that has no open ticket left. The `Closes #<n>` lines of the PRs are the record of what the factory built.

`factory.mjs close [<pr> …]` does all of it:

- With numbers, each PR must be merged into the integration branch; one that is not gets the row `⛔ nicht gemergt`. Without, it takes the merged `feat/` and `fix/` PRs with `Closes #<n>` lines (the last 50) and lists only those where it changed something.
- It closes each open ticket of a PR (`Umgesetzt in #<pr>, gemergt in <integration>.`) and takes the in-progress label off every ticket of the PR that still carries it. This is the only place the factory removes it, besides **/factory doctor --fix**.
- It closes every parent spec with no open ticket left (`Alle Tickets erledigt: … Geschlossen mit /factory close.`). With **Specs in the repo** a spec is never closed: when its tickets are done and its status is `freigegeben`, it runs `Specs: Done` on the branch `docs/spec-<spec>-done` and opens a ready PR `docs(specs): mark <spec> as implemented`; a criterion without a test stops that with `⛔ AC-<n> ohne Test`.

Answer with **Close**, one row per entry of `rows`; `nothing: true` is `Factory close · nichts zu schließen`.

## /factory doctor [--fix]

`factory.mjs doctor [--fix]` checks the install (version, agents that differ from their source, skills installed both in the repo and for the user, the session-title hook), `gh`, the config (every heading, the integration branch on `origin`, the commands of Setup, Validate and Check on the PATH, a `## Check` that rewrites files, the lines of `## Specs` and `## Preview`) and what earlier runs left behind: worktrees untouched for 12 hours, scratch folders and schema locks without a worktree, tickets with the in-progress label but no open PR, no branch and no worktree, tickets whose PR was merged but that are still open.

With `--fix` it removes the leftovers that are safe to remove (a clean worktree whose branch is on `origin`, a scratch folder or schema lock without a worktree) and the in-progress label of a ticket with nothing left; everything else stays a finding. Answer with **Doctor**.

## Output

Every message to the user is one of the blocks below, filled in, in German, with nothing before or after it: no intro, no recap of what you did, no explanation, no tool narration, no closing remark. Only two exceptions: `/factory help` prints its own block, and a direct question from the user gets at most two sentences, followed by **Status** when jobs exist. Where the steps above say "stop", "say so" or "report", that means the block named there. Spell PRs and issues as links, `[#512](<url>)`.

Fixed words, nothing else in their place:

- **Job label**: its ticket numbers, `#142`, a bundle `#143+#147`; a small fix without a ticket: `fix <slug>`.
- **Agent**: `builder`, `security`, `code`, `ui`, `spec-writer`, each with its round: `builder 2`, `security 1`. A rework builder counts from 1 again; a rebase is `builder <n> Rebase`, a fix after red checks `builder <n> Checks`, after a red CI `builder <n> CI`. The retro is `retro`, without a round. Steps without an agent: `Checks <n>` (the gate of round `<n>`), `CI`.
- **Agent result**: `✓` (READY, PASS, green), `✓ <k> Commits` for a builder, `✓ Entwurf` for the spec writer, `✓ <k> Befunde` for the retro (`✓ 1 Befund`, `✓ keine Befunde`), `✗ <k> Findings: <main finding>` (CHANGES), singular for one (`✓ 1 Commit`, `✗ 1 Finding: …`), `✗ <command>` for a red gate, `✗ <check>` for a red CI, `⛔ <reason>` (BLOCKED, failure), `🔄 läuft` (spawned or waiting, not finished).
- **Job result**: `🔄` (running), `✅ #<pr>` (PR ready, CI green), `⚠️ #<pr> Draft` (PR needs a human), `📝 Spec #<n>` (spec drafted: its issue, or its PR with **Specs in the repo**), `⛔ <reason>` (no PR).
- A `<reason>` or `<main finding>` has at most six words and names the cause, not the step: `Blocker #158 offen`, `Spec #120 nicht freigegeben`, `läuft bereits`, `pnpm install fehlgeschlagen`, `Tenant-Filter fehlt`.

### Start

Once, after the ready check and the claims, before the first agent is spawned. A heading with the number of jobs and the version, one line per job, then one line per ticket you did not start:

```text
Factory · 3 Jobs · claude-mods 1.4.0
- #142 Bewertungsfilter
- #143+#147 Review-Filter · Bündel: gleiche Spec #120
- #150 CSV-Export · ohne Spec → spec-writer
- #151 nicht gestartet: Blocker #149 offen
```

The title after the label is the issue title cut to at most three words. Without a known version the heading ends after `Jobs`. Skip **Start** when no job starts; then **Status** says why.

### Step

One line whenever an agent, a gate or a CI watch finishes, naming what comes next: `<job label> · <agent or step> · <result> → <next agent(s), wartet auf …, PR, CI or fertig>`. A spawn always appears behind an arrow, so every agent shows up once when it starts and once when it ends.

```text
#142 · builder 1 · ✓ 4 Commits → Checks 1
#142 · Checks 1 · ✗ pnpm lint → builder 1 Checks
#142 · builder 1 Checks · ✓ 1 Commit → Checks 1
#142 · Checks 1 · ✓ → security 1 + code 1 + ui 1
#142 · security 1 · ✓ → wartet auf code 1, ui 1
#142 · code 1 · ✗ 2 Findings: Tenant-Filter fehlt → wartet auf ui 1
#142 · ui 1 · ✓ → builder 2
#143+#147 · builder 1 · ⛔ Schema-Lock → wartet auf #142
#142 · code 2 · ✓ → Sync: Konflikt → builder 2 Rebase
#142 · code 3 · ✓ → PR #512 → CI
#142 · CI · ✗ e2e → builder 3 CI
#142 · CI · ✓ → PR ✅ #512 → retro
#150 · spec-writer 1 · ✓ Entwurf → Spec #520, fertig
#142 · retro · ✓ 3 Befunde → fertig
```

Setup, sync and PR steps without an agent get a line only when they fail or change the course: `#142 · Setup · ⛔ pnpm install fehlgeschlagen → fertig`. A green gate between two agents may share the line of the agent before it: `#142 · builder 2 · ✓ 1 Commit → Checks 2 ✓ → security 2 + code 2`.

### Status

After each completed review round (all reviewers done), as the last message once every job has ended (followed by **Retro**), and the whole answer whenever the user asks for the status. One table: a bold row per job, in start order, with its review round reached and job result; below it one `↳` row per agent run of a running job, in spawn order, the running one included, and one `↳ Runde <n>` row per round of an ended job. Then `Aufwand:` once every job has ended, then `Du musst:` with what only the human can do:

```text
| Ticket / Agent | Runde | Ergebnis |
| --- | --- | --- |
| **#142 Bewertungsfilter** | 2/3 | 🔄 |
| ↳ builder 1 | – | ✓ 4 Commits |
| ↳ Checks 1 | 1 | ✓ |
| ↳ security 1 | 1 | ✓ |
| ↳ code 1 | 1 | ✗ 2 Findings: Tenant-Filter fehlt |
| ↳ ui 1 | 1 | ✓ |
| ↳ builder 2 | 2 | ✓ 1 Commit |
| ↳ Checks 2 | 2 | ✓ |
| ↳ security 2 | 2 | 🔄 läuft |
| ↳ code 2 | 2 | 🔄 läuft |
| **#143+#147 Review-Filter** | 3/3 | ⚠️ #513 Draft |
| ↳ Runde 1 | 1 | builder ✓ · Checks ✗ · builder Checks ✓ · Checks ✓ · security ✓ · code ✗ 2 Findings |
| ↳ Runde 2 | 2 | builder ✓ · Checks ✓ · security ✗ 1 Finding · code ✓ |
| ↳ Runde 3 | 3 | builder ✓ · Checks ✓ · security ✓ · code ✗ 1 Finding |
| ↳ CI | – | ✓ |
| ↳ retro | – | ✓ 2 Befunde |
| **#150 CSV-Export** | – | 📝 Spec #520 |
| ↳ spec-writer 1 | – | ✓ Entwurf |
| **#161 Import** | – | ⛔ Blocker #158 offen |

Aufwand:
- #143+#147: 52 min · 3,4 Mio Tokens (Cache 2,9 Mio) · 9 Agenten · 412 Tool-Aufrufe

Du musst:
- #513: Migration prüfen
- #520: 3 Offene Fragen klären, Freigabe ausfüllen, dann /factory #150
- #158 schließen, dann /factory #161
```

- `Runde` is the review round the row belongs to: a reviewer and a gate their round, `builder <n>` round `<n>`, whose code it writes, except `builder 1`, which gets `–`. On the bold row the round reached, out of 3. `–` for spec jobs and the CI row.
- A round row of an ended job holds its builder, its gates and its reviewers, each with `✓`, `✗`, `✗ <k> Findings` or `⛔`, without the main finding; a rebase builder joins the round after it. The CI keeps its own `↳ CI` row (`✓`, `✗ <check>`, `⛔ nicht fertig`, `–` without checks) and the retro its own `↳ retro` row, below the rounds. A spec job keeps its single `↳ spec-writer 1` row.
- Every agent row of a running job is written out, none merged.
- `Aufwand:` holds one line per built job, the `line` of its `factory.mjs stats`; leave it out while jobs run and when no job was built.
- `Du musst:` holds at most three items per job, each one line starting with the PR or issue it is about, as an imperative: the Needs human items of a draft PR, the next step after a spec or a stop, each dropped ticket of a bundle (`#147: nicht gebaut, <reason>`), an old or missing agent (`Factory: Agent reviewer-ui: fehlt, node install.mjs, …`). Leave the heading out when there is nothing.
- When `git`, `gh` or `factory.mjs` failed, add `Fehler <job label>:` and at most five lines of their output in a code block.
- No job in this session: `Factory · keine Jobs in dieser Session`. `/factory next` with no ticket left: `Factory · keine freien Tickets`.

### Retro

Once, right below the final **Status**, when at least one job had a retro. You merge the rows of every `retro.md` of this session into one table:

```text
Retro · 2 Jobs · 5 Befunde
| # | Bereich | Schwere | Befund | Vorschlag | Jobs |
| --- | --- | --- | --- | --- | --- |
| 1 | Checks | hoch | Prettier-Fehler erst im Code-Review | prettier --check in factory.md Validate | #142, #143+#147 |
| 2 | Navigation | mittel | Builder suchte Guards in 14 Aufrufen | Zeiger in apps/api/AGENTS.md | #142 |
| 3 | Factory | niedrig | Security liest Billing-Doku ohne Billing | Security-Abschnitt in factory.md kürzen | #143+#147 |
```

- One row per distinct improvement: findings of several jobs that propose the same change become one row, with every job label under `Jobs` and the highest `Schwere`. Keep the wording short; shorten a `Befund` or `Vorschlag` rather than wrap it.
- Order: `hoch` before `mittel` before `niedrig`, then by the number of jobs. At most eight rows; the count in the heading counts the merged rows, `+<k> weitere` after the table names what you left out.
- A retro that failed: a line `<job label>: Retro ⛔ <reason>` below the table. Every retro without findings: `Retro · keine Befunde`.
- You suggest; you change nothing. The human picks the rows worth a change.

### Close

The whole answer of `/factory close`:

```text
| PR | Tickets geschlossen | Spec |
| --- | --- | --- |
| #512 | #142, #143 | #120 geschlossen |
| #513 | #150 | #121 offen: #151, #152 |
| #514 | – | ⛔ nicht gemergt |
```

The Spec column is the `spec` of the row as `factory.mjs close` gives it. With **Specs in the repo** it names the spec's folder: `task-notes umgesetzt: #530` (the done PR), `task-notes offen: #151, #152`, `task-notes ⛔ AC-3 ohne Test`, `task-notes bereits umgesetzt`, `task-notes entwurf`.

Nothing closed: `Factory close · nichts zu schließen`.

### Doctor

The whole answer of `/factory doctor`: a heading with the version and the overall level, one row per check that is not `ok` (`ok` ones only as their count), then what `--fix` did and the fixes left to the human:

```text
Factory doctor · claude-mods 1.4.0 · ⚠️ 3 Hinweise · 9 ok
| Bereich | Befund |
| --- | --- |
| Agenten | ⚠️ reviewer-code weicht von claude-mods ab (alte Kopie?) |
| Labels | ⚠️ #148: Label factory-in-progress, kein PR, kein Branch, kein Worktree (seit 2 h 10 min) |
| Reste | ⚠️ Worktree rating-filter-142 seit 1 h 30 min unberührt, mit Änderungen |

Aufgeräumt:
- Scratch old-job-12 entfernt

Du musst:
- Agenten: node install.mjs (nach --copy erneut), Session neu starten
- #148: /factory doctor --fix
```

- The level is `✅ alles ok`, `⚠️ <k> Hinweise` or `⛔ <k> Fehler` (`⛔` rows before `⚠️` rows), from the `level` of each check.
- `Aufgeräumt:` lists `fixed`; leave it out when empty. `Du musst:` holds the `fix` of each row, the same fix once.
