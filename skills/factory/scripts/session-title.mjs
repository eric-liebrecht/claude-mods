#!/usr/bin/env node
// UserPromptSubmit hook: names the session after what a /factory prompt does, `Factory · #142 Bewertungsfilter`.
// Every other prompt passes untouched. install.mjs registers it once for the user in ~/.claude/settings.json with
// its absolute path; a project-local install registers it in the repo's .claude/settings.json (README):
//
//   "UserPromptSubmit": [{ "hooks": [{ "type": "command",
//     "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/factory/scripts/session-title.mjs\"" }] }]
//
// Issue titles come from `gh`; without it, or after its timeout, the numbers stand alone. Never blocks a prompt.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX = 60;

/** The issue title cut to its first three words, as the factory's Start block writes it. */
function issueTitle(number, cwd) {
	try {
		const title = execFileSync("gh", ["issue", "view", number, "--json", "title", "--jq", ".title"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 4000,
		}).trim();
		return title.split(/\s+/).slice(0, 3).join(" ");
	} catch {
		return "";
	}
}

function titleFor(args, cwd) {
	const [command = "", ...rest] = args.split(/\s+/);
	if (command === "" || command === "help") return null;
	if (command === "close") return "Factory · close";
	if (command === "next") return "Factory · next";
	if (command === "fix") return `Factory · fix ${rest.join(" ")}`;
	if (command === "rework") return `Factory · rework #${(rest[0] ?? "").replace(/^#/, "")}`;
	const numbers = [...args.matchAll(/#?(\d+)/g)].map((match) => match[1]);
	if (numbers.length === 0) return null;
	if (args.includes("--bundle")) {
		const title = issueTitle(numbers[0], cwd);
		return `Factory · ${numbers.map((number) => `#${number}`).join("+")}${title ? ` ${title}` : ""}`;
	}
	if (numbers.length === 1) {
		const title = issueTitle(numbers[0], cwd);
		return `Factory · #${numbers[0]}${title ? ` ${title}` : ""}`;
	}
	return `Factory · ${numbers.map((number) => `#${number}`).join(", ")}`;
}

try {
	const input = JSON.parse(readFileSync(0, "utf8"));
	const match = /^\/factory(?:\s+([\s\S]*))?$/.exec((input.prompt ?? "").trim());
	if (match) {
		const title = titleFor((match[1] ?? "").trim(), input.cwd ?? process.cwd());
		if (title) {
			const sessionTitle = title.length > MAX ? `${title.slice(0, MAX - 1)}…` : title;
			process.stdout.write(
				JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", sessionTitle } }),
			);
		}
	}
} catch {
	// A hook that fails must not stop the prompt; the session simply keeps its name.
}
