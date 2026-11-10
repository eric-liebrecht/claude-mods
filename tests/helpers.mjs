// Shared test helpers: temp folders, a git repo with an `origin`, and a fake `gh` that answers from rules and logs
// every call, so the factory's scripts run end to end without GitHub.
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCRIPTS = join(ROOT, "skills", "factory", "scripts");
export const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

export function tempDir(prefix = "claude-mods-") {
	return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

const GIT_ENV = {
	GIT_AUTHOR_NAME: "Test",
	GIT_AUTHOR_EMAIL: "test@example.com",
	GIT_COMMITTER_NAME: "Test",
	GIT_COMMITTER_EMAIL: "test@example.com",
	GIT_CONFIG_NOSYSTEM: "1",
};

export function git(cwd, ...args) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...GIT_ENV } });
	if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

export function write(file, text) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
}

export const CONFIG = `# Factory

## Repository

- Integration branch: \`main\`
- Protected branches: \`main\`

## Setup

\`\`\`bash
node -e "process.exit(0)"
\`\`\`

## Validate

\`\`\`bash
node check.mjs <files>
\`\`\`

## Check

\`\`\`bash
node check.mjs <files>
\`\`\`

## Schema

None.

## Docs

None.

## Preview

- Start: \`node server.mjs <port>\`
- URL: \`http://127.0.0.1:<port>/\`
- Paths: \`web/**\`
- Timeout: 20 seconds

## CI

- Wait: 5 minutes
- Fix rounds: 1

## Standards

- \`AGENTS.md\`

## Danger list

- \`.github/workflows/\`

## Security

- None yet.
`;

const CHECK = `// Fails when a changed file contains BAD.
import { readFileSync } from "node:fs";
const bad = process.argv.slice(2).filter((file) => readFileSync(file, "utf8").includes("BAD"));
if (bad.length) { console.error("BAD in " + bad.join(", ")); process.exit(1); }
console.log("ok");
`;

const SERVER = `import { createServer } from "node:http";
createServer((request, response) => {
	response.setHeader("content-type", "text/html");
	response.end("<!doctype html><title>Preview</title><h1>Hallo</h1>");
}).listen(Number(process.argv[2]), "127.0.0.1");
`;

/** A main checkout `app` with an `origin`, the factory config and a fake gh, plus a user config with the agents. */
export function makeRepo({ config = CONFIG } = {}) {
	const root = tempDir();
	const origin = join(root, "origin.git");
	const main = join(root, "work", "app");
	mkdirSync(join(root, "work"), { recursive: true });
	git(root, "init", "--quiet", "--bare", "--initial-branch=main", origin);
	git(join(root, "work"), "clone", "--quiet", origin, "app");
	git(main, "checkout", "--quiet", "-B", "main");
	write(join(main, "README.md"), "# app\n");
	write(join(main, "docs", "agents", "factory.md"), config);
	write(join(main, "check.mjs"), CHECK);
	write(join(main, "server.mjs"), SERVER);
	write(join(main, ".gitignore"), "node_modules/\n");
	git(main, "add", ".");
	git(main, "commit", "--quiet", "-m", "init");
	git(main, "push", "--quiet", "-u", "origin", "main");

	const claude = join(root, "claude");
	mkdirSync(join(claude, "agents"), { recursive: true });
	cpSync(join(ROOT, "skills", "factory", "subagents"), join(claude, "agents"), { recursive: true });
	const temp = join(root, "tmp");
	mkdirSync(temp, { recursive: true });
	const bin = join(root, "bin");
	mkdirSync(bin, { recursive: true });
	const ghFile = join(bin, "gh");
	writeFileSync(ghFile, `#!/bin/sh\nexec "${process.execPath}" "${join(ROOT, "tests", "fake-gh.mjs")}" "$@"\n`);
	chmodSync(ghFile, 0o755);
	const rules = join(root, "gh-rules.json");
	const log = join(root, "gh-log.jsonl");
	writeFileSync(rules, "[]");
	return {
		root,
		main,
		origin,
		claude,
		temp,
		rules,
		log,
		env: {
			...process.env,
			...GIT_ENV,
			PATH: `${bin}:${process.env.PATH}`,
			CLAUDE_CONFIG_DIR: claude,
			TMPDIR: temp,
			FAKE_GH_RULES: rules,
			FAKE_GH_LOG: log,
		},
		/** Rules: [match regex over the joined args, stdout (string or JSON), code, stderr]. First match wins. */
		gh(list) {
			writeFileSync(
				rules,
				JSON.stringify(
					list.map(([match, stdout = "", code = 0, stderr = ""]) => ({
						match,
						stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
						code,
						stderr,
					})),
				),
			);
		},
		calls() {
			if (!existsSync(log)) return [];
			return readFileSync(log, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line).join(" "));
		},
		factory(...args) {
			const result = spawnSync(process.execPath, [join(SCRIPTS, "factory.mjs"), ...args], {
				cwd: main,
				encoding: "utf8",
				env: this.env,
			});
			let json = null;
			try {
				json = JSON.parse(result.stdout);
			} catch {
				// left null: the test shows stdout and stderr
			}
			return { code: result.status, json, stdout: result.stdout, stderr: result.stderr };
		},
	};
}

/** The gh answers every ready check needs: auth, repo, user. */
export const BASE_GH = [
	["^auth status", "Logged in"],
	["^repo view", "o/r"],
	["^api user", "me"],
	["^label create", ""],
];

export function issue(number, { body = "## Acceptance criteria\n\n- [ ] works\n", labels = ["ready-for-agent"], state = "OPEN", assignees = [], title = "Rating filter for reviews" } = {}) {
	return {
		number,
		title,
		body,
		state,
		url: `https://github.com/o/r/issues/${number}`,
		labels: labels.map((name) => ({ name })),
		assignees: assignees.map((login) => ({ login })),
	};
}

export function issueMeta(number, { subIssues = 0, blockedBy = 0 } = {}) {
	return { id: 1000 + number, number, sub_issues_summary: { total: subIssues }, issue_dependencies_summary: { blocked_by: blockedBy } };
}

export const NOT_FOUND = ["", 1, "gh: Not Found (HTTP 404)"];

/** A transcript as Claude Code writes it for a sub-agent: prompt, a tool call that works, one that fails. */
export function transcriptLines() {
	const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50000, cache_creation_input_tokens: 3000 };
	return [
		{ type: "user", timestamp: "2026-11-10T10:00:00Z", message: { role: "user", content: "Job: x. Build round 1." } },
		{ type: "assistant", timestamp: "2026-11-10T10:00:05Z", message: { id: "m1", usage, content: [{ type: "text", text: "Reading the ticket." }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls -la" } }] } },
		{ type: "user", timestamp: "2026-11-10T10:00:06Z", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "a\nb\n" }] } },
		{ type: "assistant", timestamp: "2026-11-10T10:01:00Z", message: { id: "m2", usage, content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "/w/a.ts", old_string: "abc", new_string: "abcd" } }] } },
		{ type: "user", timestamp: "2026-11-10T10:01:01Z", message: { content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: "String not found" }] } },
		{ type: "assistant", timestamp: "2026-11-10T10:02:00Z", message: { id: "m3", usage, content: [{ type: "text", text: "STATUS: READY" }] } },
	]
		.map((line) => JSON.stringify(line))
		.join("\n");
}
