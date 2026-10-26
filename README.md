# claude-mods

Mods for Claude Code by Eric Liebrecht.

## agent-crew

Live view of running sub-agents as animated pixel critters, with the current step of the engineering flow
(grill, spec, tickets, implement, retro, PR) and the state of the session's prompt cache. A band above the prompt and a pane (`/crew`).
The retro is optional, only every now and then: Claude is told not to run one every round, and a round that goes
straight to `/pr` shows it as skipped.

Install in a terminal session of Claude Code:

```
/plugin install agent-crew --marketplace eric-liebrecht/claude-mods
```

Answer `y` to "Add marketplace?" and pick the user scope. Mods loaded this way also draw in local sessions of the desktop app.

## skills

Skills for Claude Code, installed into a project with the [skills CLI](https://github.com/vercel-labs/skills), project-local and pinned in `skills-lock.json`.

| Skill                                                                                                                                      | What it does                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [factory](./skills/factory/SKILL.md)                                                                                                       | Software factory: `/factory #<issue>` builds a released ticket AFK in a throwaway worktree (builder, security and code review), opens a PR and ends with a retro per built job.        |
| `implement`, `tdd`, `pr`, `code-review`, `to-spec`, `retro`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `writing-for-agents` | The skills of [mattpocock/skills](https://github.com/mattpocock/skills) the factory and its agents call, copied unchanged, so the factory runs on the versions it was written against. |

The factory has five agents (`builder`, `reviewer-code`, `reviewer-security`, `spec-writer`, `retro`) in [skills/factory/subagents/](./skills/factory/subagents/); the retro reads the other agents' transcripts condensed by [scripts/transcript.mjs](./skills/factory/scripts/transcript.mjs). The factory reads what is special about a repo from `docs/agents/factory.md` (template: [skills/factory/config.md](./skills/factory/config.md)). Install in a project:

```bash
npx skills@latest add eric-liebrecht/claude-mods --agent claude-code --copy -y \
  --skill factory --skill implement --skill tdd --skill pr --skill code-review --skill to-spec --skill retro \
  --skill diagnosing-bugs --skill codebase-design --skill domain-modeling --skill writing-for-agents
mkdir -p .claude/agents && cp .claude/skills/factory/subagents/*.md .claude/agents/
cp .claude/skills/factory/config.md docs/agents/factory.md   # then fill it in
```

The [Platform Cookbook](https://github.com/eric-liebrecht/platform-cookbook) does all three steps in `platform-cookbook skills`. Don't install the same skills from `mattpocock/skills` as well, or the lock holds two sources for one name.
