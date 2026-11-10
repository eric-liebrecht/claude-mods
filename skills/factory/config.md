# Factory

Settings of the software factory (`/factory`) for this repo. The factory and its agents read this file at every start; it is the only place where they learn what is special about this repo. Keep the headings: the agents look them up by name. Replace every `<…>` placeholder with this repo's value; `/factory doctor` reports the ones left. Template: `factory/config.md` of claude-mods (`~/.claude/skills/factory/config.md` when installed for the user).

## Repository

- Integration branch: `main`
- Protected branches: `main`
- Language: `de` (`de` or `en`: the language of the factory's messages, the specs it drafts, its retro and what it writes to issues and PRs)

PRs go into the integration branch. The factory never pushes to a protected branch and never merges.

## Setup

The fresh-checkout setup the factory runs in every new worktree, one command per line (each runs in the worktree's root in a shell of its own, so a `cd` does not carry over; end a line with `\` to continue it):

```bash
<command that installs the dependencies from the lockfile, e.g. npm ci>
```

## Validate

The builder runs these in the worktree before it reports READY; they may fix files (a formatter in write mode). `<files>` are the files the job changed, `<base>` is the job's base commit.

```bash
<formatter in write mode on <files>, e.g. npx prettier --write <files>>
<lint, type check and tests, e.g. npm run lint && npm test>
```

## Check

The factory runs these before every review round (its gate); none of them may rewrite a file.

```bash
<formatter in check mode on <files>, e.g. npx prettier --check <files>>
<lint, type check and tests, e.g. npm run lint && npm test>
```

## Schema

Write `None.` when the repo has no database schema. Otherwise:

- Schema files: `<where the models live>`
- Migration: `<command that creates a migration named <name>>`
- After a migration: `<command that regenerates the client, if any>`
- Never: edit an applied migration, reset the database.

## Docs

How code and docs stay in sync, so that the builder updates the docs in the same commit and the reviewer can check it: where the docs live, how to find the doc that owns a file, which index or log to update.

## Specs

Optional: leave this section out when specs are issues (the factory's `## Freigabe` block). With it, specs are files in this repo; the factory finds each line by the name before its colon.

- Spec of a ticket: the file its `Spec:` line names (`docs/specs/<spec>/spec.md`), read from the integration branch. Its `Kriterien:` line lists the acceptance criteria (`AC-<n>`) the ticket delivers.
- Released: the spec's `Status:` line reads `freigegeben (<date>, …)` or `umgesetzt (<date>, …)` (in English `released` or `implemented`).
- New: `<command>` writes `docs/specs/<spec>/spec.md` from `docs/specs/TEMPLATE.md`.
- Check: `<command that checks every spec and fails on a finding>`
- Release (only the human, or an agent on the human's explicit word): `<command that releases <spec>>`
- Done: `<command that marks <spec> as implemented and fails when a criterion has no test>`
- Test names: every test that proves a criterion names it as `<spec>/AC-<n>`.

## Preview

Optional: leave this section out (or write `None.`) when the repo has no screens to look at. With it, the factory's UI reviewer starts the job's worktree and screenshots the screens a round changes. `<port>` is a free port the factory picks; it is also in `PORT`.

- Start: `<command that starts the dev server on <port>, e.g. npm run dev -- --port <port>>`
- URL: `http://localhost:<port>/`
- Paths: `<globs of the files that render screens, e.g. src/pages/**>` (a round whose changes touch none of them gets no UI review; without this line, every round does)
- Timeout: 120 seconds until the URL answers
- Login: how the reviewer gets past a login in the dev server (a seeded user, a dev bypass), or leave the line out

## CI

Optional: without this section the factory waits up to 20 minutes for the PR's checks and gives the builder one round to fix a red CI. `None.` turns it off.

- Wait: 20 minutes
- Fix rounds: 1

## Standards

What every agent reads besides `AGENTS.md` and the `AGENTS.md` of each package or folder it touches. The named lines are looked up by name; a line left out means the file named here when the repo has it.

- Glossary: `CONTEXT.md` (the domain terms and their avoided synonyms; where a skill says `GLOSSARY.md`, this file)
- Decisions: `docs/adr/` (the architecture decision records)
- Issue tracker: `docs/agents/issue-tracker.md` (what to do when `gh` fails)
- Further files the code reviewer reads for the Standards axis, one per line.

## Product decisions

What only a human decides in this repo. The spec writer leaves these open under its open questions, the builder never decides one (it reports BLOCKED, or lists a small one as an Assumption), and the reviewers put one they find under For the human, so the PR opens as a draft. Write `- None yet.` when there are none. For example:

- `<prices and what a plan or tier includes>`
- `<copy that speaks for the business to its users>`
- `<what is sent to users or written to outside systems>`

## Danger list

Paths and topics a human must look at before a PR is merged. A PR that touches one opens as a draft with the item under Needs human.

- CI and deployment: `<.github/workflows/, Dockerfiles, infrastructure files>`
- configuration: environment variables, secrets
- `.claude/` settings, hooks, agents and skills
- dependencies: `<the manifest files, e.g. package.json, pyproject.toml>`
- database schema and migrations
- authentication and permissions
- the decision records (`Decisions` in `## Standards`)

## Security

What the security reviewer checks in this repo, on top of its general list. Its general list knows no repo: name here what applies, and leave out a line that doesn't. Write `- None yet.` when nothing does.

- Owner of data: `<who owns which data (a user, an account, a tenant) and where the owner comes from: the session, never the request>`
- Access: `<how an entry point (route, handler, command, job) is protected, and how one is opened deliberately>`
- Gates: `<checks a user must pass besides access, and how an exception is justified>`
- Dangerous actions and their one entry: `<action → the one function or service that does it>`
- External writes and messages: `<which writes to outside systems and messages to users need a confirmation, and which>`
- Input and URLs: `<where input is validated; how outgoing requests to user-supplied URLs are checked>`
- Client configuration: `<which variables reach a client (browser, app) and must never hold a secret>`
