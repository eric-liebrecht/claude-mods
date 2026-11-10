// Pure helpers of the factory scripts: reading docs/agents/factory.md, the Freigabe and spec rules of SKILL.md,
// the names of a job, the version of the install and the usage in agent transcripts. No git, no gh: factory.mjs
// runs those and hands their output here, so every rule can be tested without a repo.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const LABEL = "factory-in-progress";
export const LABEL_COLOR = "FBCA04";
export const LABEL_DESCRIPTION = "Von der Factory übernommen, bis /factory close";
export const READY_LABEL = "ready-for-agent";
export const CONFIG_PATH = "docs/agents/factory.md";
/** The headings of docs/agents/factory.md the factory and its agents look up by name. */
export const REQUIRED_HEADINGS = [
	"Repository",
	"Setup",
	"Validate",
	"Check",
	"Schema",
	"Docs",
	"Standards",
	"Danger list",
	"Security",
];
export const SPEC_LINES = ["Spec of a ticket", "Released", "New", "Check", "Release", "Done", "Test names"];
export const MARKER = ".claude-mods";

// ---------------------------------------------------------------------------------------------------------------
// docs/agents/factory.md

/** The level-2 sections of a markdown file, headings inside code fences ignored: Map heading → body. */
export function sections(markdown) {
	const result = new Map();
	let current = null;
	let fence = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		const heading = !fence && /^##\s+(.+?)\s*$/.exec(line);
		if (heading) {
			current = heading[1];
			result.set(current, []);
		} else if (current !== null) {
			result.get(current).push(line);
		}
	}
	return new Map([...result].map(([key, lines]) => [key, lines.join("\n").trim()]));
}

/** The command lines of the first code block of a section: one command per line, comments and blanks left out. */
export function codeLines(body = "") {
	const match = /```[^\n]*\n([\s\S]*?)```/.exec(body);
	if (!match) return [];
	// One command per line; a line ending in a backslash continues on the next.
	return match[1]
		.replace(/\s*\\\r?\n\s*/g, " ")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"));
}

/** `- Name: value` lines of a section: Map name → { text, code }, `code` being the value's first backtick span. */
export function namedLines(body = "") {
	const result = new Map();
	for (const line of body.split(/\r?\n/)) {
		const match = /^\s*[-*]\s+([^:`(]+(?:\([^)]*\))?):\s*(.*)$/.exec(line);
		if (!match) continue;
		const code = /`([^`]+)`/.exec(match[2]);
		// `Release (only the human, …): \`cmd\`` is the line `Release`: a note in brackets is not part of the name.
		const name = match[1].replace(/\s*\(.*\)\s*$/, "").trim();
		result.set(name, { text: match[2].trim(), code: code ? code[1] : null });
	}
	return result;
}

/** An unfilled `<…>` placeholder of the template; `<files>`, `<base>`, `<port>`, `<spec>` and `<name>` are filled by the factory. */
export function hasPlaceholder(text = "") {
	return /<(?!(?:files|base|port|spec|name)>)[^>\n]*>/.test(text);
}

/** Every backtick span of a value, for lists such as `Protected branches: \`main\`, \`develop\``. */
export function backtickList(text = "") {
	return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

const isNone = (body) => /^none\b/i.test(body.trim());

/** Reads docs/agents/factory.md into what the scripts need. Optional sections are null when absent or `None.`. */
export function parseConfig(text) {
	const all = sections(text);
	const repository = namedLines(all.get("Repository"));
	const integration = repository.get("Integration branch")?.code ?? "main";
	const protectedBranches = backtickList(repository.get("Protected branches")?.text);
	const specsBody = all.get("Specs");
	const previewBody = all.get("Preview");
	const ciBody = all.get("CI");
	let preview = null;
	if (previewBody !== undefined && !isNone(previewBody)) {
		const lines = namedLines(previewBody);
		preview = {
			start: lines.get("Start")?.code ?? null,
			url: lines.get("URL")?.code ?? null,
			paths: backtickList(lines.get("Paths")?.text),
			timeout: Number(/\d+/.exec(lines.get("Timeout")?.text ?? "")?.[0] ?? 120),
		};
	}
	let ci = { enabled: true, wait: 20, fixRounds: 1 };
	if (ciBody !== undefined) {
		if (isNone(ciBody)) ci = { enabled: false, wait: 0, fixRounds: 0 };
		else {
			const lines = namedLines(ciBody);
			const number = (name, fallback) => Number(/\d+/.exec(lines.get(name)?.text ?? "")?.[0] ?? fallback);
			ci = { enabled: true, wait: number("Wait", 20), fixRounds: number("Fix rounds", 1) };
		}
	}
	const standards = namedLines(all.get("Standards"));
	const language = (repository.get("Language")?.code ?? "de").toLowerCase().startsWith("en") ? "en" : "de";
	return {
		headings: [...all.keys()],
		sections: all,
		language,
		glossary: standards.get("Glossary")?.code ?? null,
		decisions: standards.get("Decisions")?.code ?? null,
		issueTracker: standards.get("Issue tracker")?.code ?? null,
		integration,
		protected: [...new Set([...protectedBranches, integration])],
		setup: codeLines(all.get("Setup")),
		validate: codeLines(all.get("Validate")),
		check: codeLines(all.get("Check")),
		specs: specsBody === undefined ? null : namedLines(specsBody),
		preview,
		ci,
	};
}

// ---------------------------------------------------------------------------------------------------------------
// Tickets and specs (SKILL.md: Freigabe, Specs in the repo)

/** A real calendar date in YYYY-MM-DD. */
export function validDate(text) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
	const date = new Date(`${text}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

const FREIGABE = /^##\s+(Freigabe|Approval)\b/m;

/**
 * Released as SKILL.md's Freigabe defines it: a filled-in `Freigegeben von:` line (`Approved by:` in English), or
 * `Status: freigegeben (<date>)` (`released`) without the block. Both languages count in every repo.
 */
export function isReleased(body = "") {
	if (FREIGABE.test(body)) {
		const line = /^\s*-\s*(?:Freigegeben von|Approved by):\s*(.+?)\s*\[([^\]]*)\]\s*$/m.exec(body);
		return Boolean(line && line[1] !== "Name" && validDate(line[2].trim()));
	}
	const status = /^Status:\s*(?:freigegeben|released)\s*\(\s*(\d{4}-\d{2}-\d{2})/im.exec(body);
	return Boolean(status && validDate(status[1]));
}

/** An issue is a spec when it has the Freigabe block, a Problem Statement or User Stories section, a Status line or sub-issues. */
export function isSpec(body = "", subIssues = 0) {
	return (
		FREIGABE.test(body) || /^##\s+(Problem Statement|User Stories)\b/m.test(body) || /^Status:/m.test(body) || subIssues > 0
	);
}

/** The issue number the `## Parent` section names, or null. */
export function parentFromBody(body = "") {
	const parent = sections(body).get("Parent");
	const match = parent && /#(\d+)/.exec(parent);
	return match ? Number(match[1]) : null;
}

/** Every issue a `Blocked by:` line names. */
export function blockedByLines(body = "") {
	const numbers = [];
	for (const match of body.matchAll(/^\s*(?:[-*]\s*)?Blocked by:\s*(.*)$/gim)) {
		for (const number of match[1].matchAll(/#(\d+)/g)) numbers.push(Number(number[1]));
	}
	return [...new Set(numbers)];
}

/** The tickets of `Closes #<n>` lines, in order. */
export function closesLines(body = "") {
	return [...new Set([...body.matchAll(/^\s*Closes\s+#(\d+)\s*$/gim)].map((match) => Number(match[1])))];
}

/** Whether a ticket body carries acceptance criteria: a criteria heading or a checkbox list. */
export function hasCriteria(body = "") {
	return (
		/^#{1,6}\s*(acceptance criteria|akzeptanzkriterien|kriterien|definition of done|fertig wenn|done when)\b/im.test(
			body,
		) || /^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(body)
	);
}

/** The path of a ticket's `Spec:` line (specs in the repo), or null. */
export function specLine(body = "") {
	const match = /^Spec:\s*`?([^`\s]+)`?\s*$/m.exec(body);
	return match ? match[1] : null;
}

/** The criteria ids of a ticket's `Kriterien:` line, or null when it has none. */
export function criteriaLine(body = "") {
	const match = /^Kriterien:\s*(.*)$/m.exec(body);
	if (!match) return null;
	return [...match[1].matchAll(/AC-\d+/g)].map((id) => id[0]);
}

/** The first word of a spec file's `Status:` line, lower case (`entwurf`, `freigegeben`, `umgesetzt`), or null. */
export function specStatus(text = "") {
	const match = /^Status:\s*([\p{L}-]+)/imu.exec(text);
	return match ? match[1].toLowerCase() : null;
}

/** Released as the template's `Specs: Released` line says: `freigegeben` or `umgesetzt` (`released`, `implemented`). */
export function specReleased(text = "") {
	return ["freigegeben", "umgesetzt", "released", "implemented"].includes(specStatus(text));
}

/** Whether criterion `id` is defined in a spec, and whether its line drops it. */
export function criterionState(text, id) {
	const pattern = new RegExp(`\\b${id}(?!\\d)`);
	const line = text.split(/\r?\n/).find((candidate) => pattern.test(candidate));
	if (!line) return "missing";
	return /entfällt|dropped/i.test(line) ? "dropped" : "ok";
}

/** The ticket numbers a job name ends in: `review-filters-142-143` → [142, 143]. */
export function jobNumbers(job = "") {
	const tail = /((?:-\d+)+)$/.exec(job);
	return tail ? tail[1].slice(1).split("-").map(Number) : [];
}

// ---------------------------------------------------------------------------------------------------------------
// Names (SKILL.md: Names)

/** The config folder of Claude Code: CLAUDE_CONFIG_DIR or ~/.claude. */
export function configDir(env = process.env) {
	return env.CLAUDE_CONFIG_DIR ? resolve(env.CLAUDE_CONFIG_DIR) : join(homedir(), ".claude");
}

/** `<skills>` and `<agents>` as SKILL.md resolves them: the project's copies first, then the user's. */
export function installDirs(main, env = process.env) {
	const user = configDir(env);
	const projectSkills = join(main, ".claude", "skills");
	const projectAgents = join(main, ".claude", "agents");
	return {
		skills: existsSync(join(projectSkills, "factory", "SKILL.md")) ? projectSkills : join(user, "skills"),
		agents: existsSync(join(projectAgents, "builder.md")) ? projectAgents : join(user, "agents"),
		user,
	};
}

/** The paths of a job: worktree, scratch, schema lock. */
export function jobPaths(main, job, temp = tmpdir()) {
	const name = basename(main);
	const factoryDir = resolve(main, "..", `${name}-factory`);
	// Two checkouts with the same folder name must not share scratch folders and the schema lock.
	const root = join(temp, "factory", `${name}-${createHash("sha256").update(resolve(main)).digest("hex").slice(0, 8)}`);
	return {
		name,
		factoryDir,
		root,
		worktree: join(factoryDir, job),
		scratch: join(root, job),
		schemaLock: join(root, ".schema-lock"),
	};
}

/** The sentence every agent prompt starts with (SKILL.md: Record, `<head>`). */
export function headSentence({ job, issues = [], fix, brief, worktree, branch, base, scratch, schemaLock, skills, agents }) {
	const tickets = brief
		? `Brief: ${brief} (no ticket: it holds the goal, the acceptance criteria and the decisions).`
		: fix
			? `Small fix: ${fix}.`
			: `Tickets: ${issues.map((number) => `#${number}`).join(", ")} in build order.`;
	return `Job: ${job}. ${tickets} Worktree: ${worktree}. Branch: ${branch}. Base: ${base}. Scratch: ${scratch}. Schema lock: ${schemaLock}. Skills: ${skills}. Agents: ${agents}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Version and drift of the install

/** The claude-mods version of the factory at `factoryDir`: a checkout (link install), the install marker of a copy, or unknown. */
export function factoryVersion(factoryDir) {
	let real;
	try {
		real = realpathSync(factoryDir);
	} catch {
		return { version: null, source: "missing" };
	}
	for (let dir = real, depth = 0; depth < 4; depth += 1, dir = dirname(dir)) {
		const file = join(dir, "package.json");
		if (!existsSync(file)) continue;
		try {
			const pkg = JSON.parse(readFileSync(file, "utf8"));
			if (pkg.name === "claude-mods") return { version: pkg.version, source: "checkout", checkout: dir };
		} catch {
			// not ours
		}
	}
	const marker = join(factoryDir, MARKER);
	if (existsSync(marker)) {
		const match = /claude-mods (\d+\.\d+\.\d+[\w.-]*)/.exec(readFileSync(marker, "utf8"));
		return { version: match ? match[1] : null, source: "copy" };
	}
	return { version: null, source: "unknown" };
}

/** An agent file without the install marker install.mjs appends to copies. */
export function stripMarker(text) {
	return text.replace(new RegExp(`\\s*<!-- ${MARKER.replace(".", "\\.")}[^>]*-->\\s*$`), "").trimEnd();
}

/** Each agent of `sourceDir` compared with its installed copy in `agentsDir`: ok, differs or missing. */
export function agentDrift(sourceDir, agentsDir) {
	const names = existsSync(sourceDir) ? readdirSync(sourceDir).filter((name) => name.endsWith(".md")) : [];
	return names.map((file) => {
		const installed = join(agentsDir, file);
		const name = file.slice(0, -3);
		if (!existsSync(installed)) return { name, state: "missing" };
		const same = stripMarker(readFileSync(installed, "utf8")) === stripMarker(readFileSync(join(sourceDir, file), "utf8"));
		return { name, state: same ? "ok" : "differs" };
	});
}

// ---------------------------------------------------------------------------------------------------------------
// Paths, globs and shells

/** Converts a glob (`apps/web/**`, `*.tsx`, `src/`) into a RegExp over repo-relative paths. */
export function globToRegExp(glob) {
	let pattern = glob.replace(/^\.\//, "");
	if (pattern.endsWith("/")) pattern += "**";
	if (!/[*?]/.test(pattern)) return new RegExp(`^${escape(pattern)}(?:/.*)?$`);
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === "*" && pattern[index + 1] === "*") {
			const slash = pattern[index + 2] === "/";
			source += slash ? "(?:.*/)?" : ".*";
			index += slash ? 2 : 1;
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += escape(char);
	}
	return new RegExp(`^${source}$`);
}

function escape(text) {
	return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** Whether any of `files` matches any of `globs`; no globs matches every non-empty list. */
export function matchesAny(files, globs) {
	if (globs.length === 0) return files.length > 0;
	const patterns = globs.map(globToRegExp);
	return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

/** Quotes one argument for the shell `spawn(…, { shell: true })` uses. */
export function shellQuote(text, windows = process.platform === "win32") {
	if (windows) return `"${text.replace(/"/g, '""')}"`;
	return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

/** A config command with `<files>`, `<base>`, `<spec>`, `<port>` filled in. */
export function fillCommand(command, values, windows = process.platform === "win32") {
	return command.replace(/<(files|base|spec|port|name)>/g, (whole, key) => {
		if (!(key in values)) return whole;
		const value = values[key];
		return Array.isArray(value) ? value.map((item) => shellQuote(item, windows)).join(" ") : String(value);
	});
}

/** The executables a command line starts, one per `&&`, `||`, `;` or `|` segment, without env assignments and builtins. */
export function commandHeads(line) {
	const builtins = new Set(["cd", "export", "set", "true", "false", "echo", "test", "[", "exit", "source", "."]);
	return line
		.split(/&&|\|\||;|\|/)
		.map((segment) => segment.trim().split(/\s+/).filter((word) => !/^\w+=/.test(word))[0])
		.filter((word) => word && !builtins.has(word) && !word.startsWith("<") && !word.startsWith("$"));
}

/** Whether `name` is an executable on PATH (or a path that exists). */
export function onPath(name, env = process.env, windows = process.platform === "win32") {
	if (name.includes("/") || name.includes("\\")) return existsSync(name);
	const exts = windows ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").concat([""]) : [""];
	const dirs = (env.PATH ?? env.Path ?? "").split(windows ? ";" : ":").filter(Boolean);
	return dirs.some((dir) => exts.some((ext) => existsSync(join(dir, name + ext))));
}

/** The last `count` lines of a text. */
export function tail(text = "", count = 80) {
	const lines = text.trimEnd().split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Transcripts (retro and stats)

/** Finds `agent-<id>.jsonl` in any project and session below `projects`. */
export function findTranscript(id, projects) {
	const name = `agent-${id}.jsonl`;
	const walk = (dir, depth) => {
		if (depth > 5 || !existsSync(dir)) return null;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return null;
		}
		for (const entry of entries) if (entry.isFile() && entry.name === name) return join(dir, entry.name);
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const found = walk(join(dir, entry.name), depth + 1);
			if (found) return found;
		}
		return null;
	};
	return walk(projects, 0);
}

/** The parsed lines of a transcript, unparsable ones left out. */
export function readTranscript(path) {
	const entries = [];
	for (const raw of readFileSync(path, "utf8").split("\n")) {
		if (!raw.trim()) continue;
		try {
			entries.push(JSON.parse(raw));
		} catch {
			// a line cut off while the agent was writing
		}
	}
	return entries;
}

/** Duration, tokens, tool calls and models of a transcript. A message streamed in several lines counts once. */
export function usageOf(entries) {
	const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	const seen = new Set();
	const models = new Set();
	let toolCalls = 0;
	let first = null;
	let last = null;
	for (const entry of entries) {
		const time = entry.timestamp ? Date.parse(entry.timestamp) : Number.NaN;
		if (!Number.isNaN(time)) {
			first = first === null ? time : Math.min(first, time);
			last = last === null ? time : Math.max(last, time);
		}
		const message = entry.message;
		if (!message || entry.type !== "assistant") continue;
		for (const block of Array.isArray(message.content) ? message.content : []) {
			if (block.type === "tool_use") toolCalls += 1;
		}
		const key = message.id ?? entry.uuid;
		if (!message.usage || seen.has(key)) continue;
		seen.add(key);
		if (message.model) models.add(message.model);
		tokens.input += message.usage.input_tokens ?? 0;
		tokens.output += message.usage.output_tokens ?? 0;
		tokens.cacheRead += message.usage.cache_read_input_tokens ?? 0;
		tokens.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
	}
	return {
		durationMs: first === null ? 0 : last - first,
		tokens,
		totalTokens: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite,
		toolCalls,
		models: [...models],
	};
}

/** `38 min`, `1 h 05 min`, `40 s`. */
export function formatDuration(ms) {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds} s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** `2,1 Mio`, `850 Tsd`, `900`, German as the factory's output. */
export function formatTokens(count) {
	if (count >= 1e6) return `${(count / 1e6).toFixed(1).replace(".", ",")} Mio`;
	if (count >= 1e3) return `${Math.round(count / 1e3)} Tsd`;
	return String(count);
}
