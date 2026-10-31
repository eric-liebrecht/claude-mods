---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the user's answers before the next round.

Ask every round with the **AskUserQuestion** tool, so the user answers each question by clicking an option instead of scrolling through a list and typing. The tool changes how a question is delivered, never how deep it goes: each question carries the same context, choices and recommendation it would as text.

1. **Context first.** Directly before each call, write what its questions need to be answered well: what you found, why the decision matters, what hangs off it. As many paragraphs as the decision needs, under a bold heading per question. When your recommendation needs nuance an option label can't hold, state it here in full. When more than 4 choices are viable, name the rest here, or split the decision into smaller ones.
2. **One question per decision**, with a short `header` and the full question.
3. **Real options.** `options`: 2-4 distinct, genuinely viable choices, never filler to reach a count. Put **your recommended answer first**, append ` (Recommended)` to its label, and say _why_ in its `description`; every other option's `description` names its trade-off. For an open question (a name, a number, a free-form rule), offer your best concrete candidates; the tool always adds a free-text field, so never add an "Other" option yourself. On single-select questions, use `preview` (shown for the focused option) for code, schemas or layouts worth comparing.
4. `multiSelect: true` only when the choices are not mutually exclusive; then mark every option you recommend.

One call takes at most 4 questions. If the frontier has more, split it over consecutive calls without re-planning in between; the round ends once all of them are answered.

Treat free-text answers and notes as answers in their own right: when one is vague, contradicts an earlier decision or opens a new branch, put that to the user in the next round rather than smoothing it over. A question the user dismisses stays open: ask it again or ask why, never assume your recommendation.

If AskUserQuestion is not available (another client), fall back to plain text and format the round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each text question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a background sub-agent to find it before you ask the round; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
