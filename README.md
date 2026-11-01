# claude-mods

Mods for Claude Code by Eric Liebrecht.

## agent-crew

Live view of running sub-agents as animated pixel critters, with the current step of the engineering flow
(grill, spec, tickets, implement, retro, PR) and the state of the session's prompt cache. A band above the prompt and a pane (`/crew`). `/crew demo` toggles three made-up agents for a look at the dashboard without a running crew.
The retro is optional, only every now and then: Claude is told not to run one every round, and a round that goes
straight to `/pr` shows it as skipped.

Install in a terminal session of Claude Code:

```
/plugin install agent-crew --marketplace eric-liebrecht/claude-mods
```

Answer `y` to "Add marketplace?" and pick the user scope. Mods loaded this way also draw in local sessions of the desktop app.

## skills

Skills for Claude Code, installed once per machine for the user (`~/.claude/`), so every repo on it uses the same version and one `git pull` updates them all. Only `docs/agents/factory.md` lives in each repo.

| Skill                                                                                                                                      | What it does                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [factory](./skills/factory/SKILL.md)                                                                                                       | Software factory: `/factory #<issue>` builds a released ticket AFK in a throwaway worktree (builder, security and code review), opens a PR and ends with a retro per built job. The label `factory-in-progress` marks tickets the factory has taken on until `/factory close`, so several sessions can run it on one repo in parallel. |
| `implement`, `tdd`, `pr`, `code-review`, `to-spec`, `retro`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `writing-for-agents` | The skills of [mattpocock/skills](https://github.com/mattpocock/skills) the factory and its agents call, copied unchanged, so the factory runs on the versions it was written against.                                                                                                                                                 |
| `grilling`, `grill-me`, `grill-with-docs`                                                                                                  | The grill skills of [mattpocock/skills](https://github.com/mattpocock/skills), with one change: `grilling` asks every round with `AskUserQuestion`, so in the desktop and web app the questions come as a pop-up to click; other clients get plain text. `grill-me` and `grill-with-docs` only call it.                                |

The factory has five agents (`builder`, `reviewer-code`, `reviewer-security`, `spec-writer`, `retro`) in [skills/factory/subagents/](./skills/factory/subagents/); the retro reads the other agents' transcripts condensed by [scripts/transcript.mjs](./skills/factory/scripts/transcript.mjs), and [scripts/session-title.mjs](./skills/factory/scripts/session-title.mjs) names the session. The factory reads what is special about a repo from `docs/agents/factory.md` (template: [skills/factory/config.md](./skills/factory/config.md)). Specs are issues by default; with a `## Specs` section there, they are files in the repo: the factory drafts one as a draft PR, builds from the released file and marks it implemented on `/factory close`.

### Install for the user

Once per machine (macOS, Linux, Windows; needs Node and Git):

```bash
git clone https://github.com/eric-liebrecht/claude-mods ~/.claude-mods
node ~/.claude-mods/install.mjs
```

`install.mjs` links every skill into `~/.claude/skills/`, the factory's agents into `~/.claude/agents/` and registers the hook of [Session title](#session-title) in `~/.claude/settings.json`; it keeps every other setting. On Windows skills become junctions and agents copies. Restart running sessions afterwards.

| Option        | Effect                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| `--copy`      | copies instead of links (cloud sessions, a snapshot that a `git pull` doesn't change) |
| `--force`     | replaces a skill or agent of the same name that `install.mjs` did not install         |
| `--dry-run`   | prints what it would do                                                               |
| `--uninstall` | removes what it installed and the hook                                                |

It honours `CLAUDE_CONFIG_DIR`. Then per repo: copy [skills/factory/config.md](./skills/factory/config.md) to `docs/agents/factory.md` and fill it in (the factory stops with a hint when it is missing).

**Update:** `git -C ~/.claude-mods pull` (after `--copy` also `node ~/.claude-mods/install.mjs` again), then restart the sessions. **Pin** a machine to a release with `git -C ~/.claude-mods checkout v1.3.0`; back to the newest with `git -C ~/.claude-mods checkout main && git -C ~/.claude-mods pull`.

**Don't install the same skills twice.** A skill in `~/.claude/skills/` wins over the project's `.claude/skills/` of the same name, but an agent in the project's `.claude/agents/` wins over the user's, so an old project-local copy mixes versions. Remove the project's copies of these skills and agents (and the project's session-title hook) when you switch; the [Platform Cookbook](https://github.com/eric-liebrecht/platform-cookbook) does it in `platform-cookbook skills`. Don't install the same names from `mattpocock/skills` either.

### Cloud sessions

A cloud session (claude.ai/code) starts in a fresh container: it sees neither your machine's `~/.claude/` nor plugins. Put the install into the **setup script of the cloud environment** once; every repo of that environment gets the factory:

```bash
git clone --depth 1 https://github.com/eric-liebrecht/claude-mods ~/.claude-mods
node ~/.claude-mods/install.mjs --copy
```

Add `--branch v1.3.0` to the clone to pin a release. The factory names its cloud session itself; the hook is not needed there.

### Project-local install

Still supported, for a repo that must pin its skills in Git (or for collaborators without the user install). The factory finds skills and agents in the project first: `<repo>/.claude/skills/` and `<repo>/.claude/agents/`.

The repo is a package: `package.json` carries the version, every version on `main` is tagged `v<version>` with a GitHub release (workflow [release.yml](./.github/workflows/release.yml)). Pin it as a devDependency and copy with your own sync script:

```bash
pnpm add -D -w "github:eric-liebrecht/claude-mods#semver:^1.0.0"
pnpm update claude-mods --latest   # later: newest tagged version, pinned in pnpm-lock.yaml
```

Copy `node_modules/claude-mods/skills/<name>` to `.claude/skills/<name>` and `skills/factory/subagents/*.md` to `.claude/agents/`, and commit the copies: Claude Code loads skills at session start, before any install. Or, always the newest `main`, with the skills CLI:

```bash
npx skills@latest add eric-liebrecht/claude-mods --agent claude-code --copy -y \
  --skill factory --skill implement --skill tdd --skill pr --skill code-review --skill to-spec --skill retro \
  --skill diagnosing-bugs --skill codebase-design --skill domain-modeling --skill writing-for-agents \
  --skill grilling --skill grill-me --skill grill-with-docs
mkdir -p .claude/agents && cp .claude/skills/factory/subagents/*.md .claude/agents/
```

Then register the hook of [Session title](#session-title) in the project's `.claude/settings.json`.

To release: change the skills, bump `version` in `package.json` (minor for new behaviour, major when a project has to change its `docs/agents/factory.md` or its setup), merge into `main`. The workflow tags it.

### Session title

The factory names its session after the job (`Factory · #142 Bewertungsfilter`). In a local session a hook does it; in a cloud session the factory sets the title itself. `install.mjs` registers the hook in `~/.claude/settings.json` with the absolute path of the script. A project-local install registers it in the project's `.claude/settings.json`:

```json
{
	"hooks": {
		"UserPromptSubmit": [
			{
				"hooks": [
					{
						"type": "command",
						"command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/factory/scripts/session-title.mjs\""
					}
				]
			}
		]
	}
}
```

The hook answers only `/factory` prompts and reads the issue titles with `gh`; every other prompt passes untouched.
