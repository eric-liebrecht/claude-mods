---
name: factory
description: Run the software factory. Use when the user types /factory alone or /factory help (prints the help), /factory #<issue> [#<issue> …], /factory next [k], either with --bundle, /factory fix <description>, /factory rework <pr> [note] or /factory close [<pr> …], or asks to close the tickets the factory built. The session that runs it orchestrates the build → review loop of up to three jobs, each ending in a pull request into the integration branch, or in a drafted spec when a ticket has none, and closes with a retro of every built job.
---

# Factory

You orchestrate jobs: a released ticket (`ready-for-agent`), or a **bundle** of related ones, becomes a pull request into the integration branch. You run the loop, spawn every agent and talk to `git` and `gh`; the agents write code and reviews. The human did the judgement work before (`grill-with-docs`, `prototype`, `to-spec` with Freigabe, `to-tickets`) and merges the PR after. A ticket without a parent spec gets one drafted by `spec-writer` (**Draft spec**), and its job stops there: the human reviews and releases the spec, then starts the ticket again. You never merge and never push to a protected branch. You close tickets only with **/factory close**, when the human says they are done: a PR into a branch that is not the default branch never closes them, and one into the default branch may close them before the human has looked.

**GitHub is the only state.** The issue says what to build, its label `factory-in-progress` says that a factory session builds it right now, its assignee says who built it, the PR is the result. The label is what lets several sessions run the factory on one repo in parallel, each in its own worktrees, on one machine or several: every session skips a ticket that carries it, already in the search. Everything else is throwaway: the job's worktree and its scratch folder exist while this session runs the job and are removed at the end, so nothing of a job lands in the repo or outlives the session.

**`docs/agents/factory.md` is the repo's part.** It names the integration branch, the setup, the checks, the schema commands, the docs rule, the standards, the danger list and the security points of this repo. Read it before anything else; you and every agent follow it where this file says "the config". Missing: stop with `⛔ docs/agents/factory.md fehlt` and `Du musst: Vorlage .claude/skills/factory/config.md nach docs/agents/factory.md kopieren und ausfüllen`.

**Every message to the user follows [Output](#output)**, from the first line to the last, also when the user asks for the status.

## /factory or /factory help

When the arguments are empty or `help`, print the block below verbatim as your whole answer and stop: no tool call, no check, nothing else.

```text
/factory: Tickets mit ready-for-agent bauen, reviewen, PR in den Integrationsbranch

  /factory #<n> [#<m> …]          Ticket(s) bauen, je ein PR (max. 3 parallel)
  /factory #<n> #<m> … --bundle   Diese Tickets zusammen: ein Branch, ein PR
  /factory next [k]               Die nächsten k freien Tickets (k ≤ 3, Standard 1)
  /factory next [k] --bundle      Freie Tickets nach Thema bündeln, k Bündel
  /factory fix <beschreibung>     Kleiner Fix ohne Ticket (ein Bug oder Text)
  /factory rework <pr> [notiz]    Offenen PR nacharbeiten (Notiz, Review-Kommentare, Konflikte)
  /factory close [<pr> …]         Tickets gemergter PRs schließen, dann ihre fertigen Specs
  /factory help                   Diese Hilfe

Ablauf: Ready-Check → Builder → Security- und Code-Review (max. 3 Runden) → PR → Retro.
Retro: pro gebautem Job ein Agent, am Ende eine Tabelle mit Verbesserungen.
Ticket ohne Spec: Spec-Entwurf als Issue, Ticket als Sub-Issue, Stopp bis zur Freigabe.
Freigabe: in der Spec "Freigegeben von: Name [JJJJ-MM-TT]" ausfüllen.
Draft-PR mit "Needs human", wenn du entscheiden musst. Branch: feat/<slug>-<n>, History linear.
Einstellungen des Repos: docs/agents/factory.md.
Label factory-in-progress: Ticket läuft gerade, jede andere Session überspringt es.
Die Factory mergt nie und schließt Tickets nur mit /factory close.
```

## The loop

```
ticket → ready check ─ fails ─────────────────────────────► report, stop
              │      └─ no parent spec ─► spec-writer ─► spec issue (Entwurf) ─► report, stop
              │ claim
              ▼
           builder ◄──── any CHANGES: resume builder (max 2) ────┐
              │                                                  │
              ▼                                                  │
    [security, code] ──► WAIT FOR BOTH ──────────────────────────┘
              │ both PASS, or rounds exhausted
              ▼
     sync (rebase on conflict) → PR into <integration> (draft when a human must decide) → retro → clean up
                                                                                    │
                                              last job ended ─► Status + Retro table ◄┘
```

| Agent (`subagent_type`) | Writes                                                     | Skills                                                                                                            |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `builder`               | commits on the branch, `<scratch>/pr.md`, its final report | `implement`, `tdd`, `pr`; on demand `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `writing-for-agents` |
| `reviewer-security`     | `<scratch>/review-security.md`                             | none in the repo: its checklist and the config's `## Security`                                                    |
| `reviewer-code`         | `<scratch>/review-code.md`                                 | `code-review`, with its Spec and Standards sub-agents                                                             |
| `spec-writer`           | `<scratch>/spec.md`, its final report                      | `to-spec`, `codebase-design`                                                                                      |
| `retro`                 | `<scratch>/retro.md`, its final report                     | `retro`, `writing-for-agents`; reads the job's transcripts through `scripts/transcript.mjs`                       |

The agents live in `.claude/agents/`; their source is `.claude/skills/factory/subagents/`. When `.claude/agents/builder.md` or `.claude/agents/retro.md` is missing, stop with `⛔ Factory-Agenten fehlen` and `Du musst: .claude/skills/factory/subagents/*.md nach .claude/agents/ kopieren, Session neu starten`. What is special about this repo goes into `docs/agents/factory.md`, not into this file or the agents; rules for code live in `AGENTS.md`, which every agent reads.

## Names

- **Repo**: `<owner>/<name>`, from `gh repo view --json nameWithOwner --jq .nameWithOwner` in the main checkout. Every `gh api repos/<repo>/…` below uses it.
- **Integration branch** (`<integration>`): the config's `Integration branch`. **Protected branches**: the config's list, plus the integration branch and the default branch.
- **Spec job**: `spec-<n>[-<m> …]`, the numbers of the tickets without a spec, ascending (`spec-142-143`). It drafts a spec and builds nothing: no branch, a detached worktree, the scratch folder.
- **Job**: `<slug>-<n>`, a 2 to 4 word kebab-case English slug of the issue title plus the issue number (`rating-filter-142`). A bundle: a slug of what its tickets share plus every number, ascending (`review-filters-142-143-147`). For `/factory fix` without an issue: `<slug>` alone.
- **Branch**: `<type>/<job>`. `type` is `fix` when every ticket describes a bug, otherwise `feat`.
- **Worktree**: `<main>/../<name>-factory/<job>`, absolute. `<main>` is the main checkout (`git rev-parse --show-toplevel`), `<name>` its directory name. Your session stays there and only runs `git fetch`, `git worktree`, `git branch` and `gh` in it: it belongs to the user.
- **Scratch**: `${TMPDIR:-/tmp}/factory/<name>/<job>/`, absolute. Agents pass notes through it; nothing in it is kept. Besides the agents' files it holds the job's **record** for the retro (**Record**).
- **Base**: the `origin/<integration>` commit the branch sits on: `git rev-parse origin/<integration>` when the worktree is cut, the rebase target after a **Sync**. Agents diff against it, so a moving integration branch never changes what they review.
- **In-progress label**: `factory-in-progress`. A job puts it on each of its tickets when it claims them (**Claim**) and takes it off again when it ends (**Release**). A ticket that carries it belongs to a running job of some session, so the ready check fails for it and the searches of **/factory next** and **Bundles** leave it out.
- **Schema lock**: `${TMPDIR:-/tmp}/factory/<name>/.schema-lock/`. All jobs of this repo on this machine share one dev database, so only one job at a time applies a migration. The builder takes it with `mkdir`; it holds the job name in `owner`.

## Record

The retro sees what the job's agents did through two things you keep in the scratch folder while the job runs:

- `<scratch>/agents.md`: one line per agent run, appended when you spawn the agent: `<agent> <round> <agent id>` (`builder 1 a1b2c3…`, `security 1 d4e5f6…`). The agent id is the `agentId` the Agent tool result names. A builder resumed with `SendMessage` keeps its id and gets one more line with the new round.
- `<scratch>/history/`: when a builder finishes, its final report as `builder-<N>.md` (`builder-<N>-rebase.md` for a rebase); when a review round is done, `cp` of both review files to `review-security-<N>.md` and `review-code-<N>.md`, before the next round overwrites them.

Every agent prompt starts with
`Job: <job>. Tickets: #<n>[, #<m> …] in build order (or: Small fix: <description, verbatim>). Worktree: <worktree>. Branch: <branch>. Base: <base>. Scratch: <scratch>. Schema lock: <schema lock>.`
Below, `<head>` stands for that sentence.

## Release

Every job that put the in-progress label on its tickets takes it off again when it ends in this session, whatever the end: in **Clean up**, and right before every stop that leaves the worktree (`⛔ Worktree nicht sauber`, `⛔ PR-Text ohne pr-Template`, a failed push or PR). For each ticket of the job: `gh issue edit <n> --remove-label factory-in-progress`. If that fails, name the ticket under `Du musst:` as `#<n>: Label factory-in-progress entfernen`. A session that dies mid-job leaves the label behind; the human removes it by hand once no session runs the job any more.

## Freigabe

Every spec the factory drafts starts with this block. The human releases it by replacing only the two placeholders in the `Freigegeben von:` line, `Name` with their name and `JJJJ-MM-TT` with the date, keeping the square brackets:

```markdown
## Freigabe

- Entwurf: <who drafted it: Factory, /to-spec or a name>, <YYYY-MM-DD>
- Freigegeben von: Name [JJJJ-MM-TT]
```

- **Released** means the line reads `- Freigegeben von: <name> [YYYY-MM-DD]`: a name other than `Name`, then a real date in square brackets (`Freigegeben von: Erika Muster [2026-10-24]`). A spec without the block is released by a line `Status: freigegeben (<YYYY-MM-DD>)` with a real date. Nothing else is a Freigabe: not a `ready-for-agent` label on the spec, not an `Entwurf` line or `Status: entwurf`, not a date without a name in the block.
- **A spec** is an issue whose body has the `## Freigabe` block, a `## Problem Statement` or `## User Stories` section, or a line starting with `Status:`, or that has sub-issues.

## Linear history

Every job branch is a straight line of commits on top of its base, and stays one: `git rev-list --merges <base>..HEAD` prints nothing, at every step and before every push.

- A branch catches up with the integration branch only by `git rebase`. `git merge` and a plain `git pull` never run in a worktree.
- A conflict is resolved inside the rebase, commit by commit (**Sync**), never with a merge commit and never in GitHub's conflict editor, which writes one.
- A rebased branch that is already on `origin` is pushed with `git push --force-with-lease=<branch>:<its sha on origin before the rebase> origin <branch>`, only for the job's own branch. Every other push is a plain `git push`.

## /factory #<issue>

1. **Ready check.** In the main checkout read `docs/agents/factory.md`, check that `.claude/agents/builder.md` and `.claude/agents/retro.md` exist, run `gh auth status`, `git fetch origin <integration>` and `gh issue view <n> --json number,title,body,labels,assignees,state`. The ticket is ready when all hold:
    - it is open, carries `ready-for-agent`, has acceptance criteria and is unassigned or assigned to you;
    - it does not carry `factory-in-progress` (another session builds it; `⛔ läuft bereits (Label)`, with `Du musst: #<n>: Label factory-in-progress entfernen, falls kein Job mehr läuft`);
    - it is a ticket, not a spec (**Freigabe** says how to tell);
    - its parent spec (the `## Parent` section or the parent sub-issue) is released, as **Freigabe** defines it;
    - every blocker is closed (`gh api repos/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` is 0, and every issue in a `Blocked by:` line is closed).

    **No parent spec at all** (no `## Parent` section, and `gh api repos/<repo>/issues/<n>/parent` answers 404): when the first two conditions hold, go to **Draft spec** instead of stopping. Open blockers don't stop the draft, only the build.

    If anything else fails, stop without creating anything and end with **Status**: the failed condition as `⛔ <reason>`, the step that fixes it under `Du musst:` (filling in name and date in the spec's `## Freigabe` block, `/to-tickets`, closing a blocker). If `gh` fails, use the fallbacks in `docs/agents/issue-tracker.md`.

2. **Claim.** Two parts, the label first, because it is the one every session on every machine sees:
    - **Label.** `gh label create factory-in-progress --color FBCA04 --description "Die Factory baut dieses Ticket gerade" --force` (creates it once, a no-op after). Read the labels again right before setting it (`gh issue view <n> --json labels`): another session may have claimed the ticket since the ready check. Then stop with `⛔ läuft bereits (Label)`. Otherwise `gh issue edit <n> --add-label factory-in-progress --add-assignee @me`.
    - **Worktree.** `git worktree add -b <branch> <worktree> <base>`: it fails when the branch already exists, because another session on this machine runs the job (or left it behind, `git worktree list` shows it). Then **Release** the label you just set and stop with `⛔ läuft bereits (Worktree existiert)`. Otherwise `mkdir -p <scratch>/history`.
3. **Setup.** In the worktree the commands of the config's `## Setup`, in order. If any of them fails, go to **Clean up** with `⛔ <command> fehlgeschlagen` and the error under `Fehler <job>:`.
4. **Build.** Spawn `builder` **with the name `builder-<job>`** and the prompt `<head> Build round 1.` When it finishes, go to **Build check**. From here on, every job ends with **Retro** before **Clean up**, also when it stops with a failure.

## Draft spec

A ticket without a parent spec gets one drafted and published as a draft. Nothing is built from it until the human has released it, so the job ends with the spec.

1. **Claim.** The label as in **/factory #<issue>** step 2, on every ticket of the spec job, but without `--add-assignee`: the ticket gets no assignee. Then `git worktree add --detach <worktree> origin/<integration>`: it fails when the path exists, because another session drafts this spec. Then **Release** and stop with `⛔ läuft bereits (Worktree existiert)`. Otherwise `mkdir -p <scratch>`. No **Setup**: the spec writer only reads.
2. **Draft.** Spawn `spec-writer` **with the name `spec-writer-<job>`** and the prompt `Job: <job>. Tickets: #<n>[, #<m> …]. Worktree: <worktree>. Scratch: <scratch>.` On `STATUS: BLOCKED`, go to step 5 with the blocker as `⛔ <reason>`.
3. **Check.** Line 1 of `<scratch>/spec.md` starts with `TITLE: `, line 3 is `## Freigabe`, and its `Freigegeben von:` line is still `- Freigegeben von: Name [JJJJ-MM-TT]`. Otherwise go to step 5 with `⛔ Spec-Entwurf fehlerhaft`.
4. **Publish.** Check every ticket once more for a parent (`…/issues/<n>/parent`); one that has got one in the meantime is left out, and when none is left, go to step 5. Then:
    - `tail -n +3 <scratch>/spec.md | gh issue create --title "<title>" --body-file -`, without a label: the spec isn't built itself, and a label on a spec is no Freigabe.
    - Link each ticket as a sub-issue of the spec: `gh api --method POST repos/<repo>/issues/<spec>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the ticket's database id (`gh api repos/<repo>/issues/<n> --jq .id`). If that fails, name the ticket under `Du musst:` so the human links it.
    - Comment on each ticket: `gh issue comment <n> --body "Spec-Entwurf #<spec> angelegt. Gebaut wird nach der Freigabe."`.
5. **Clean up.** **Release**, `git worktree remove --force <worktree>` and `rm -rf <scratch>`; there is no branch. The job's bold row in **Status** is `📝 Spec #<spec>`, with `Du musst: #<spec>: <k> Offene Fragen klären, Freigabe ausfüllen, dann /factory #<n>` and each ticket that could not be linked (`#<n> als Sub-Issue von #<spec> verknüpfen`). Or `⛔ <reason>` when there is no spec.

## /factory fix <description>

For a small fix without a ticket: one bug or one copy change, no new screen, no new schema model or migration, no new dependency. If the description is more than that, stop with `⛔ zu groß für fix` and `Du musst: /to-spec`. Otherwise run **/factory #<issue>** from step 2, without the label and the assignee (there is no ticket), with `type: fix`, and use `Small fix: <description>` in `<head>`.

## Build check

The first line of the builder's final report is `STATUS: READY` or `STATUS: BLOCKED`.

- `READY`: start the next review round.
- `BLOCKED` on the schema lock, in a batch where another job of this session holds it: wait for that job's **Clean up**, then resume the builder with `The schema lock is free. Continue.`
- Any other `BLOCKED`: if the branch has commits beyond `<base>`, go to **Open PR** as a draft with the blocker under Needs human. Otherwise go to **Clean up** with the blocker as `⛔ <reason>`.

## Review round N

1. Spawn `reviewer-security` and `reviewer-code` **in one message**, so they run in parallel, each with `<head> Review round N.`
2. **WAIT FOR BOTH.** The round is done when both have finished and both `review-*.md` in `<scratch>` start with `VERDICT: PASS` or `VERDICT: CHANGES`. Never resume the builder mid-round. If a reviewer finishes without such a file, stop with `⛔ Review-Datei fehlt`.
3. Decide:
    - **Both PASS**: go to **Open PR**.
    - **Any CHANGES, round 1 or 2**: resume the builder with `SendMessage` to `builder-<job>`: `Round N reviews are in <scratch>. Address every review with VERDICT: CHANGES, commit, and rewrite pr.md.` When it finishes, go to **Build check**.
    - **Any CHANGES in round 3**: go to **Open PR** as a draft, with `Review rounds exhausted` and each outstanding finding under Needs human.

## Open PR

1. In the worktree, `git status --porcelain` and `git rev-list --merges <base>..HEAD` must print nothing and `git branch --show-current` must print the job's branch. Otherwise stop with `⛔ Worktree nicht sauber`, leaving the worktree for the human to inspect (`Du musst: <worktree> prüfen`).
2. **Sync.** `git fetch origin <integration>`, then `git merge-tree --write-tree origin/<integration> HEAD`. No conflict: go on, GitHub can rebase the branch when the human merges. Conflict:
    - Resume the builder with `Rebase onto <sha of origin/<integration>>.` When it reports `READY`, that sha is the new `<base>`.
    - Run one more review round on the result. Any `CHANGES` there go under Needs human; the builder is not resumed again.
    - The builder reports `BLOCKED` on the rebase: it aborted it, so the branch is as before. Put the conflict under Needs human and go on.
3. **Needs human.** Collect what the human must decide before merging:
    - every path of `git diff --name-only <base>...HEAD` on the config's `## Danger list`;
    - every item under `## For the human` in the review files, and the Assumptions from the builder's report that are product decisions (pricing, what a plan includes, customer copy about the business);
    - an unresolved conflict with the integration branch;
    - the blocker or the exhausted rounds that sent you here.
4. **PR text.** `<scratch>/pr.md` follows the `pr` skill: line 1 is `TITLE: <conventional commit title>`, line 2 is blank, and the body from line 3 has the headings `## Summary`, `## Evidence` and `## Merge Danger`. When one is missing, resume the builder with `pr.md does not follow the pr skill template: <what is missing>. Rewrite pr.md.` and check again; still missing, stop with `⛔ PR-Text ohne pr-Template`, leaving the worktree. Every PR the factory opens or edits takes its body from this file.
5. Push the branch as **Linear history** says, never any other branch.
6. When the Needs human list is not empty, append it to the body as a `## Needs human` section and open the PR as a draft.
    - New PR: `tail -n +3 <scratch>/pr.md | gh pr create --base <integration> --head <branch> --title "<title>" --body-file - [--draft]`.
    - Rework: the push updated the PR; `tail -n +3 <scratch>/pr.md | gh pr edit <pr> --body-file -`, and `gh pr ready <pr> --undo` when it now needs a human.
7. If push or PR creation fails, stop with `⛔ Push fehlgeschlagen` or `⛔ PR-Erstellung fehlgeschlagen` and the output under `Fehler <job>:`, leaving the worktree. Otherwise go to **Retro**.

## Retro

Every job whose builder ran gets one retro, right before its **Clean up** or before a stop that leaves the worktree: a PR, a draft, a `BLOCKED` builder, a failed push. A bundle is one job and gets one retro for all its tickets. Spec jobs and jobs that stopped before the builder get none.

1. Spawn `retro` **with the name `retro-<job>`** and the prompt `<head> Retro: <scratch>/agents.md lists the agent runs, <scratch>/history/ holds the reports and reviews.` In **Several jobs** with `run_in_background: true`, like every agent.
2. When it finishes, line 1 of `<scratch>/retro.md` must be `STATUS: READY`. Keep its table rows (or `Keine Befunde.`) for the **Retro** block; they are gone with the scratch folder. No such file, or `STATUS: BLOCKED`: the retro row reads `⛔ <reason>`. The job result stays as it was: a retro never changes a PR.
3. Go to **Clean up**, or stop as the step before said.

## Clean up

Always the last step of a job, also after a failure, and after its **Retro**: **Release**, `git worktree remove --force <worktree>`, `git branch -D <branch>` (the pushed branch lives on `origin`), `rm -rf <scratch>`, and `rm -rf <schema lock>` when its `owner` names this job. Then the job's last **Step** line ends in `PR ✅ #<pr>`, `PR ⚠️ #<pr> Draft` or `fertig` (followed by `→ retro` when a retro runs; the retro's own line then ends in `fertig`), and, when it was the last job, **Status** and **Retro** with the job result `✅ #<pr>`, or `⚠️ #<pr> Draft` with its Needs human items under `Du musst:`, or `⛔ <reason>`.

## /factory next [k]

Find frontier tickets, as `docs/agents/issue-tracker.md` defines them:

1. `gh issue list --state open --label ready-for-agent --search "no:assignee -label:factory-in-progress sort:created-asc" --json number,title --limit 30`. The `-label:` filter keeps out every ticket another session builds right now.
2. Walk the list in order and skip an issue that is a spec (**Freigabe** says how to tell; sub-issues: `gh api repos/<repo>/issues/<n> --jq .sub_issues_summary.total` above 0). This also catches a spec whose tickets don't exist yet. Skip a ticket with an open blocker as well, unless it has no parent spec.
3. Take the first `k` (default 1, at most 3) that pass the ready check and the claim; a ticket whose claim fails (it got the label from another session in the meantime, or its worktree exists) is skipped, not an error, and the next one on the list takes its place. A ticket without a parent spec counts as one of the `k`, and its job is a **Draft spec**. Its next `/factory next` skips it, because its spec then waits for the Freigabe. One ticket: run **/factory #<issue>**. More: run them as **Several jobs**. If none is left, answer `Factory · keine freien Tickets` and stop. With `--bundle`, form bundles instead (**Bundles**).

## Several jobs

`/factory #<a> #<b> #<c>` or `/factory next <k>` runs up to three jobs side by side in this session. When the user asks for more, take the first three; **Start** names the rest as `nicht gestartet: max. 3 Jobs`.

- Every job runs the steps above on its own: its own worktree, scratch, base and agents, all named with its job (`builder-<job>`, `spec-writer-<job>`). A **Draft spec** is a job too, one per ticket without a spec.
- Spawn every agent with `run_in_background: true`. When an agent finishes, move only its job one step; one job never waits for another, except on the schema lock.
- A job's two reviewers still go out in one message, and its **WAIT FOR BOTH** is per job.
- Several sessions may run the factory on the same repo at the same time, in their own worktrees: the in-progress label keeps them apart, so no ticket is built twice. The limit of three jobs holds per session.
- Tickets of one batch are independent by construction, because a ticket with an open blocker is not on the frontier. Two of them may still touch the same files: the second PR then conflicts once the first is merged, and `/factory rework <pr>` rebases it.
- Every **Step** line starts with its job label. When the last job is cleaned up, end with **Status** and **Retro** in one message.

## Bundles (--bundle)

`--bundle` puts related tickets on one branch and into one PR, so work that belongs together is built, reviewed and merged together.

- `/factory #<a> #<b> … --bundle`: the named tickets are one job.
- `/factory next [k] --bundle`: you form the bundles. Load every open, unassigned `ready-for-agent` issue that no session builds: `gh issue list --state open --label ready-for-agent --search "no:assignee -label:factory-in-progress sort:created-asc" --json number,title,body,labels --limit 100`. Drop specs (as in **/factory next** step 2) and every ticket that fails the ready check, except where its only open blockers are tickets of the same bundle. Then group:
    - **Related** means one branch is the natural place for them: the same parent spec first, otherwise the same feature, screen, module or model named in their titles and bodies. A shared word or label alone is not enough; in doubt, a ticket stays on its own.
    - A bundle holds at most 4 tickets. A ticket blocked by one outside its bundle stays out.
    - Take the bundle of the oldest ticket, then the next disjoint one, up to `k` (default 1, at most 3). A ticket with no related one is a bundle of one, a normal job.
    - **Start** names each bundle with its reason in at most six words (`Bündel: gleiche Spec #120`).
- **Build order**: blockers before the tickets they block, otherwise oldest first. It is the order in `<head>`.
- The ready check and the claim hold for every ticket: every ticket gets the label and the assignee, then the branch is the one worktree claim. When one ticket's label claim fails, **Release** the ones already labelled and stop with `⛔ läuft bereits (Label #<n>)`; with `next --bundle`, drop that ticket and claim the rest. A bundle runs the same loop as one ticket and counts as one job in **Several jobs**.
- Tickets without a parent spec: with `/factory #<a> #<b> … --bundle`, they get one spec together (**Draft spec**), and the bundle stops there, also for its tickets that have a released spec. With `next --bundle` they join no bundle: each becomes its own **Draft spec** job and counts as one of the `k`.
- The builder commits each ticket separately and may drop a ticket it can't build (`## Dropped` in its report). Remove the label and the assignee from each dropped ticket (`gh issue edit <n> --remove-label factory-in-progress --remove-assignee @me`) and list it under `Du musst:` as `#<n>: nicht gebaut, <reason>`. When it dropped all of them, it reports `BLOCKED`.
- The PR names every ticket it built, one `Closes #<n>` line each; dropped ones are not named.

## /factory rework <pr> [note]

Sends an open factory PR back to the builder, with the human's note and the PR's review comments. A PR that conflicts with the integration branch needs no note: **Sync** rebases it.

1. `gh pr view <pr> --json state,headRefName,body,comments,reviews` and `gh api repos/<repo>/pulls/<pr>/comments`. The PR must be open and its branch a `feat/` or `fix/` branch. `<job>` is the branch without its type, the tickets are the `Closes #<n>` lines of the body (none for a small fix).
2. `git fetch origin <integration> <branch>`. Base is `git merge-base origin/<integration> origin/<branch>`. Claim with `git worktree add -B <branch> <worktree> origin/<branch>` (stop with `⛔ läuft bereits (Worktree existiert)` when the worktree exists already), then the scratch folder and **Setup**.
3. Write `<scratch>/rework.md`: the note verbatim, then every unresolved review comment with its path and line, then the current PR body.
4. Spawn `builder` named `builder-<job>` with `<head> Rework: read <scratch>/rework.md and address it, then write pr.md.` Continue from **Build check** with a fresh count of rounds. **Open PR** then syncs and updates the existing PR.

## /factory close [<pr> …]

Closes the tickets of merged factory PRs, once the human says they are done with them, and then every parent spec that has no open ticket left. The `Closes #<n>` lines of the PRs are the record of what the factory built.

1. **Find the PRs.** With numbers: each must be merged into the integration branch (`gh pr view <pr> --json state,baseRefName,body,mergedAt`); skip any that is not and give it the row `⛔ nicht gemergt`. Without: `gh pr list --base <integration> --state merged --limit 50 --json number,title,body,headRefName` and keep the `feat/` and `fix/` PRs with `Closes #<n>` lines.
2. **Find the tickets.** The `Closes #<n>` lines of each PR.
3. **Close the tickets.** Close each open one: `gh issue close <n> --reason completed --comment "Umgesetzt in #<pr>, gemergt in <integration>."`.
4. **Close the specs.** For every ticket of step 2, open or already closed, find its parent spec (the parent sub-issue, `gh api repos/<repo>/issues/<n>/parent --jq .number`, or the `## Parent` section). For each open spec, its open tickets are:
    - its open sub-issues: `gh api --paginate repos/<repo>/issues/<spec>/sub_issues --jq '.[] | select(.state == "open") | .number'`;
    - open issues whose `## Parent` section names `#<spec>`: `gh issue list --state open --limit 200 --json number,body`, filtered on the body.

    None left: `gh issue close <spec> --reason completed --comment "Alle Tickets erledigt: #<n>, #<m> …. Geschlossen mit /factory close."`, naming every ticket of the spec. Otherwise the spec stays open, with its open tickets in **Close**.

5. Answer with **Close**: one row per PR with the tickets you closed and its spec, closed or with its open tickets.

Close only tickets a merged PR names in a `Closes #<n>` line; a ticket of an open or closed-unmerged PR stays open. Close a spec only when none of its tickets is open.

## Output

Every message to the user is one of the five blocks below, filled in, in German, with nothing before or after it: no intro, no recap of what you did, no explanation, no tool narration, no closing remark. Only two exceptions: `/factory help` prints its own block, and a direct question from the user gets at most two sentences, followed by **Status** when jobs exist. Where the steps above say "stop", "say so" or "report", that means the block named there. Spell PRs and issues as links, `[#512](<url>)`.

Fixed words, nothing else in their place:

- **Job label**: its ticket numbers, `#142`, a bundle `#143+#147`; a small fix without a ticket: `fix <slug>`.
- **Agent**: `builder`, `security`, `code`, `spec-writer`, each with its round: `builder 2`, `security 1`. A rework builder counts from 1 again; a rebase is `builder <n> Rebase`. The retro is `retro`, without a round.
- **Agent result**: `✓` (READY, PASS), `✓ <k> Commits` for a builder, `✓ Entwurf` for the spec writer, `✓ <k> Befunde` for the retro (`✓ 1 Befund`, `✓ keine Befunde`), `✗ <k> Findings: <main finding>` (CHANGES), singular for one (`✓ 1 Commit`, `✗ 1 Finding: …`), `⛔ <reason>` (BLOCKED, failure), `🔄 läuft` (spawned, not finished).
- **Job result**: `🔄` (running), `✅ #<pr>` (PR ready), `⚠️ #<pr> Draft` (PR needs a human), `📝 Spec #<n>` (spec drafted), `⛔ <reason>` (no PR).
- A `<reason>` or `<main finding>` has at most six words and names the cause, not the step: `Blocker #158 offen`, `Spec #120 nicht freigegeben`, `läuft bereits`, `pnpm install fehlgeschlagen`, `Tenant-Filter fehlt`.

### Start

Once, after the ready check and the claims, before the first agent is spawned. One line per job, then one line per ticket you did not start:

```text
Factory · 3 Jobs
- #142 Bewertungsfilter
- #143+#147 Review-Filter · Bündel: gleiche Spec #120
- #150 CSV-Export · ohne Spec → spec-writer
- #151 nicht gestartet: Blocker #149 offen
```

The title after the label is the issue title cut to at most three words. Skip **Start** when no job starts; then **Status** says why.

### Step

One line whenever an agent finishes, naming what is spawned next: `<job label> · <agent> · <agent result> → <next agent(s), wartet auf …, PR or fertig>`. A spawn always appears behind an arrow, so every agent shows up once when it starts and once when it ends.

```text
#142 · builder 1 · ✓ 4 Commits → security 1 + code 1
#142 · security 1 · ✓ → wartet auf code 1
#142 · code 1 · ✗ 2 Findings: Tenant-Filter fehlt → builder 2
#143+#147 · builder 1 · ⛔ Schema-Lock → wartet auf #142
#142 · code 2 · ✓ → Sync: Konflikt → builder 2 Rebase
#142 · code 3 · ✓ → PR ✅ #512 → retro
#150 · spec-writer 1 · ✓ Entwurf → Spec #520, fertig
#142 · retro · ✓ 3 Befunde → fertig
```

Setup, sync and PR steps without an agent get a line only when they fail or change the course: `#142 · Setup · ⛔ pnpm install fehlgeschlagen → fertig`.

### Status

After each completed review round (both reviewers done), as the last message once every job has ended (followed by **Retro**), and the whole answer whenever the user asks for the status. One table: a bold row per job, in start order, with its review round reached and job result; below it one `↳` row per agent run of a running job, in spawn order, the running one included, and one `↳ Runde <n>` row per round of an ended job. Then `Du musst:` with what only the human can do:

```text
| Ticket / Agent | Runde | Ergebnis |
| --- | --- | --- |
| **#142 Bewertungsfilter** | 2/3 | 🔄 |
| ↳ builder 1 | – | ✓ 4 Commits |
| ↳ security 1 | 1 | ✓ |
| ↳ code 1 | 1 | ✗ 2 Findings: Tenant-Filter fehlt |
| ↳ builder 2 | 2 | ✓ 1 Commit |
| ↳ security 2 | 2 | 🔄 läuft |
| ↳ code 2 | 2 | 🔄 läuft |
| **#143+#147 Review-Filter** | 3/3 | ⚠️ #513 Draft |
| ↳ Runde 1 | 1 | builder ✓ · security ✓ · code ✗ 2 Findings |
| ↳ Runde 2 | 2 | builder ✓ · security ✗ 1 Finding · code ✓ |
| ↳ Runde 3 | 3 | builder ✓ · security ✓ · code ✗ 1 Finding |
| ↳ retro | – | ✓ 2 Befunde |
| **#150 CSV-Export** | – | 📝 Spec #520 |
| ↳ spec-writer 1 | – | ✓ Entwurf |
| **#161 Import** | – | ⛔ Blocker #158 offen |

Du musst:
- #513: Migration prüfen
- #520: 3 Offene Fragen klären, Freigabe ausfüllen, dann /factory #150
- #158 schließen, dann /factory #161
```

- `Runde` is the review round the row belongs to: a reviewer its round, `builder <n>` round `<n>`, whose code it writes, except `builder 1`, which gets `–`. On the bold row the round reached, out of 3. `–` for spec jobs.
- A round row of an ended job holds its builder and both reviewers, each with `✓`, `✗ <k> Findings` or `⛔`, without the main finding; a rebase builder joins the round after it. The retro keeps its own `↳ retro` row, below the rounds. A spec job keeps its single `↳ spec-writer 1` row.
- Every agent row of a running job is written out, none merged.
- `Du musst:` holds at most three items per job, each one line starting with the PR or issue it is about, as an imperative: the Needs human items of a draft PR, the next step after a spec or a stop, each dropped ticket of a bundle (`#147: nicht gebaut, <reason>`). Leave the heading out when there is nothing.
- When `git` or `gh` failed, add `Fehler <job label>:` and at most five lines of their output in a code block.
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

Nothing closed: `Factory close · nichts zu schließen`.
