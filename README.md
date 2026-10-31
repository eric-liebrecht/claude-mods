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

Skills for Claude Code, installed into a project with the [skills CLI](https://github.com/vercel-labs/skills), project-local and pinned in `skills-lock.json`.

| Skill                                                                                                                                      | What it does                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [factory](./skills/factory/SKILL.md)                                                                                                       | Software factory: `/factory #<issue>` builds a released ticket AFK in a throwaway worktree (builder, security and code review), opens a PR and ends with a retro per built job. The label `factory-in-progress` marks tickets the factory has taken on until `/factory close`, so several sessions can run it on one repo in parallel. |
| `implement`, `tdd`, `pr`, `code-review`, `to-spec`, `retro`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `writing-for-agents` | The skills of [mattpocock/skills](https://github.com/mattpocock/skills) the factory and its agents call, copied unchanged, so the factory runs on the versions it was written against.                                                                                                                                                 |
| `grilling`, `grill-me`, `grill-with-docs`                                                                                                  | The grill skills of [mattpocock/skills](https://github.com/mattpocock/skills), with one change: `grilling` asks every round with `AskUserQuestion`, so in the desktop and web app the questions come as a pop-up to click; other clients get plain text. `grill-me` and `grill-with-docs` only call it. |

The factory has five agents (`builder`, `reviewer-code`, `reviewer-security`, `spec-writer`, `retro`) in [skills/factory/subagents/](./skills/factory/subagents/); the retro reads the other agents' transcripts condensed by [scripts/transcript.mjs](./skills/factory/scripts/transcript.mjs), and [scripts/session-title.mjs](./skills/factory/scripts/session-title.mjs) names the session. The factory reads what is special about a repo from `docs/agents/factory.md` (template: [skills/factory/config.md](./skills/factory/config.md)). Specs are issues by default; with a `## Specs` section there, they are files in the repo: the factory drafts one as a draft PR, builds from the released file and marks it implemented on `/factory close`.

### Install with versions (pnpm)

The repo is a package: `package.json` carries the version, every version on `main` is tagged `v<version>` with a GitHub release (workflow [release.yml](./.github/workflows/release.yml)). A project pins it as a devDependency and copies the skills into `.claude/` with its own sync script:

```bash
pnpm add -D -w "github:eric-liebrecht/claude-mods#semver:^1.0.0"
pnpm update claude-mods --latest   # later: newest tagged version, pinned in pnpm-lock.yaml
```

The package ships `skills/` only. Copy `node_modules/claude-mods/skills/<name>` to `.claude/skills/<name>` and `skills/factory/subagents/*.md` to `.claude/agents/`, and commit the copies: Claude Code loads skills at session start, before any install. Ratinghero OS does this in `pnpm skills:update`.

To release: change the skills, bump `version` in `package.json` (minor for new behaviour, major when a project has to change its `docs/agents/factory.md` or its setup), merge into `main`. The workflow tags it.

### Install with the skills CLI

Without versions, always the newest `main`:

```bash
npx skills@latest add eric-liebrecht/claude-mods --agent claude-code --copy -y \
  --skill factory --skill implement --skill tdd --skill pr --skill code-review --skill to-spec --skill retro \
  --skill diagnosing-bugs --skill codebase-design --skill domain-modeling --skill writing-for-agents \
  --skill grilling --skill grill-me --skill grill-with-docs
mkdir -p .claude/agents && cp .claude/skills/factory/subagents/*.md .claude/agents/
cp .claude/skills/factory/config.md docs/agents/factory.md   # then fill it in
```

The [Platform Cookbook](https://github.com/eric-liebrecht/platform-cookbook) does all three steps in `platform-cookbook skills`, plus the hook of [Session title](#session-title). Don't install the same skills from `mattpocock/skills` as well, or the lock holds two sources for one name.

### Session title

The factory names its session after the job (`Factory · #142 Bewertungsfilter`). In a local session a hook does it, registered once in the project's `.claude/settings.json`; in a cloud session the factory sets the title itself:

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
