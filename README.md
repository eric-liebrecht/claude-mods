# claude-mods

Mods for Claude Code by Eric Liebrecht.

## agent-crew

Live view of running sub-agents as animated pixel critters, with the current step of the engineering flow
(grill, spec, tickets, implement, retro, PR) and the state of the session's prompt cache. A band above the prompt and a pane (`/crew`). The chevron in the band's top right corner folds it away to the toggle alone and unfolds it again; the band remembers it for the next session. `/crew demo` toggles three made-up agents for a look at the dashboard without a running crew.
The retro is optional, only every now and then: Claude is told not to run one every round, and a round that goes
straight to `/pr` shows it as skipped.

Install in a terminal session of Claude Code:

```
/plugin install agent-crew --marketplace eric-liebrecht/claude-mods
```

Answer `y` to "Add marketplace?" and pick the user scope. Mods loaded this way also draw in local sessions of the desktop app.

## Factory and skills

The software factory (`/factory`) and the skills it called no longer live in this repository. Version 1.5.0 was the last one here.
