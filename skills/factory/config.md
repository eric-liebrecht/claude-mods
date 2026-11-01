# Factory

Settings of the software factory (`/factory`) for this repo. The factory and its agents read this file at every start; it is the only place where they learn what is special about this repo. Keep the headings: the agents look them up by name. Template: `factory/config.md` of claude-mods (`~/.claude/skills/factory/config.md` when installed for the user).

## Repository

- Integration branch: `main`
- Protected branches: `main`

PRs go into the integration branch. The factory never pushes to a protected branch and never merges.

## Setup

The fresh-checkout setup the factory runs in every new worktree, one command per line:

```bash
pnpm install --frozen-lockfile
```

## Validate

The builder runs these in the worktree before it reports READY. `<files>` are the files the job changed, `<base>` is the job's base commit.

```bash
pnpm exec prettier --write <files>
pnpm lint && pnpm check-types && pnpm test
```

## Check

The code reviewer runs these; none of them may rewrite a file.

```bash
pnpm exec prettier --check <files>
pnpm lint && pnpm check-types && pnpm test
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
- Released: the spec's `Status:` line reads `freigegeben (<date>, …)` or `umgesetzt (<date>, …)`.
- New: `<command>` writes `docs/specs/<spec>/spec.md` from `docs/specs/TEMPLATE.md`.
- Check: `<command that checks every spec and fails on a finding>`
- Release (only the human, or an agent on the human's explicit word): `<command that releases <spec>>`
- Done: `<command that marks <spec> as implemented and fails when a criterion has no test>`
- Test names: every test that proves a criterion names it as `<spec>/AC-<n>`.

## Standards

Files the code reviewer reads for the Standards axis, besides `AGENTS.md` and the package `AGENTS.md` files:

- `CONTEXT.md` (domain terms; where a skill says `GLOSSARY.md`, use `CONTEXT.md`)
- `docs/adr/`

## Danger list

Paths and topics a human must look at before a PR is merged. A PR that touches one opens as a draft with the item under Needs human.

- `.github/workflows/`, Dockerfiles, env variables, secrets
- `.claude/` settings, hooks, agents and skills
- any `package.json` dependency
- database schema and migrations
- auth, roles, guards
- `docs/adr/`

## Security

What the security reviewer checks in this repo, on top of its general list: the tenant, how access is decided, which actions are dangerous and have exactly one entry, which external writes and messages need a confirmation.

- None yet.
