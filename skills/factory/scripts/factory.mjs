#!/usr/bin/env node
// The deterministic steps of the factory, so the orchestrator runs one command and reads JSON instead of following
// prose through a dozen git and gh calls. SKILL.md says when each one runs; this file is how.
//
//   node factory.mjs <command> [args]          from the main checkout (or any worktree of it)
//
//   ready [<n> …]                     ready check of tickets: config, agents, gh, fetch, every condition (none: preflight)
//   next [--limit 30] [--bodies]      the frontier: open ready-for-agent tickets nobody has taken on, ready-checked
//   names <job>                       worktree, scratch, schema lock, skills, agents of a job
//   claim <job> --mode build|fix|brief|spec|rework [--branch <b>] [--issues 1,2] [--fix "<text>"] [--brief <file>]
//                                     [--skip-labeled]
//   setup <job>                       the config's ## Setup in the job's worktree, log in <scratch>/setup.log
//   check <job> [--round N] [--base <sha>] [--section Check|Validate]
//                                     runs the config's checks in the worktree, writes <scratch>/check.md
//   ci <pr> [--wait 540] [--logs <file>]   waits for the PR's checks, writes the logs of failed ones
//   preview start|stop <job>          starts or stops the config's ## Preview server for the job's worktree
//   screenshot <url> <out.png> [--mobile] [--worktree <dir>]   a screenshot with Playwright, console errors in JSON
//   stats <job> [--json]              duration, tokens and tool calls of the job's agents (<scratch>/agents.md)
//   cleanup <job> [--branch <b>]      removes worktree, local branch, scratch, the schema lock this job holds
//   close [<pr> …]                    closes the tickets of merged factory PRs and the specs that are done
//   doctor [--fix] [--stale-hours 12] checks the install, the config and leftovers of earlier runs
//   version                           the claude-mods version and whether the installed agents match it
//
// Every command prints one JSON object. Exit code 0 when it ran, 1 when it stopped (`ok: false`), 2 on bad usage.
import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	agentDrift,
	blockedByLines,
	closesLines,
	commandHeads,
	CONFIG_PATH,
	criteriaLine,
	criterionState,
	factoryVersion,
	fillCommand,
	formatDuration,
	formatTokens,
	hasCriteria,
	hasPlaceholder,
	headSentence,
	installDirs,
	isReleased,
	isSpec,
	jobNumbers,
	jobPaths,
	LABEL,
	LABEL_COLOR,
	LABEL_DESCRIPTION,
	matchesAny,
	onPath,
	parentFromBody,
	parseConfig,
	READY_LABEL,
	readTranscript,
	REQUIRED_HEADINGS,
	SPEC_LINES,
	specLine,
	specReleased,
	specStatus,
	tail,
	usageOf,
	findTranscript,
	configDir,
} from "./lib.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const FACTORY = dirname(SCRIPTS);
const windows = process.platform === "win32";

// ---------------------------------------------------------------------------------------------------------------
// Process helpers

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		windowsHide: true,
		...options,
	});
	return {
		code: result.status ?? (result.error ? 127 : 1),
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? (result.error ? String(result.error.message) : ""),
	};
}

const git = (cwd, ...args) => run("git", args, { cwd });

/** Changed paths between two revisions, unquoted (Umlauts, spaces): `git diff --name-only -z`. */
function changedFiles(cwd, range) {
	const result = run("git", ["-c", "core.quotePath=false", "diff", "--name-only", "-z", range], { cwd });
	if (result.code !== 0) throw new Stop("git diff fehlgeschlagen", null, tail(result.stderr, 5));
	return result.stdout.split("\0").filter(Boolean);
}
const gh = (cwd, ...args) => run("gh", args, { cwd });

class Stop extends Error {
	constructor(reason, mustDo, error) {
		super(reason);
		this.reason = reason;
		this.mustDo = mustDo;
		this.error = error;
	}
}

function must(result, reason, mustDo) {
	if (result.code !== 0) throw new Stop(reason, mustDo, tail(`${result.stderr}\n${result.stdout}`.trim(), 5));
	return result.stdout.trim();
}

function ghJson(cwd, args, reason) {
	const result = gh(cwd, ...args);
	return JSON.parse(must(result, reason ?? "gh fehlgeschlagen") || "null");
}

function out(object) {
	process.stdout.write(`${JSON.stringify(object, null, 2)}\n`);
}

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const [key, inline] = arg.slice(2).split("=", 2);
		if (inline !== undefined) flags[key] = inline;
		else if (index + 1 < argv.length && !argv[index + 1].startsWith("--")) flags[key] = argv[++index];
		else flags[key] = true;
	}
	return { positional, flags };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------------------------------------------------------
// Context: main checkout, config, repo, install

function context(cwd = process.cwd()) {
	const common = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
	if (common.code !== 0) throw new Stop("kein Git-Repo", "/factory im Hauptcheckout des Repos starten");
	const main = dirname(common.stdout.trim());
	const configFile = join(main, CONFIG_PATH);
	const dirs = installDirs(main);
	const ctx = {
		main,
		configFile,
		configText: existsSync(configFile) ? readFileSync(configFile, "utf8") : null,
		skills: dirs.skills,
		agents: dirs.agents,
		userDir: dirs.user,
		paths: (job) => jobPaths(main, job),
	};
	ctx.config = ctx.configText === null ? null : parseConfig(ctx.configText);
	let repo;
	let me;
	ctx.repo = () =>
		(repo ??= must(
			gh(main, "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"),
			"gh repo view fehlgeschlagen",
		));
	ctx.me = () => (me ??= must(gh(main, "api", "user", "--jq", ".login"), "gh api user fehlgeschlagen"));
	return ctx;
}

function requireConfig(ctx) {
	if (!ctx.config)
		throw new Stop(
			"docs/agents/factory.md fehlt",
			`Vorlage ${join(ctx.skills, "factory", "config.md")} nach docs/agents/factory.md kopieren und ausfüllen`,
		);
	return ctx.config;
}

function versionInfo(ctx) {
	const { version, source } = factoryVersion(FACTORY);
	const drift = agentDrift(join(FACTORY, "subagents"), ctx.agents);
	return { version, source, factory: FACTORY, skills: ctx.skills, agents: ctx.agents, drift };
}

function requireAgents(ctx, info) {
	// Every agent is needed before a ticket is claimed; only the UI review can be skipped.
	const missing = info.drift.filter((agent) => agent.state === "missing" && agent.name !== "reviewer-ui");
	if (missing.length > 0 || info.drift.length === 0)
		throw new Stop(
			"Factory-Agenten fehlen",
			"node install.mjs in claude-mods ausführen (oder <skills>/factory/subagents/*.md nach .claude/agents/ kopieren), Session neu starten",
		);
}

function readJob(scratch) {
	const file = join(scratch, "job.json");
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function writeJob(scratch, job) {
	mkdirSync(scratch, { recursive: true });
	writeFileSync(join(scratch, "job.json"), `${JSON.stringify(job, null, "\t")}\n`);
}

// ---------------------------------------------------------------------------------------------------------------
// ready, next

function parentOf(ctx, number, body) {
	const result = gh(ctx.main, "api", `repos/${ctx.repo()}/issues/${number}/parent`, "--jq", ".number");
	if (result.code === 0 && /^\d+$/.test(result.stdout.trim())) return Number(result.stdout.trim());
	if (result.code !== 0 && !/404|not found/i.test(result.stderr + result.stdout))
		throw new Stop("gh fehlgeschlagen", null, tail(result.stderr, 5));
	return parentFromBody(body);
}

function openBlockers(ctx, number, body, summary) {
	const open = [];
	for (const blocker of blockedByLines(body)) {
		const state = gh(ctx.main, "issue", "view", String(blocker), "--json", "state", "--jq", ".state");
		if (state.code !== 0 || state.stdout.trim() !== "CLOSED") open.push(blocker);
	}
	if ((summary?.blocked_by ?? 0) > 0) {
		const listed = gh(
			ctx.main,
			"api",
			`repos/${ctx.repo()}/issues/${number}/dependencies/blocked_by`,
			"--jq",
			'.[] | select(.state == "open") | .number',
		);
		const numbers =
			listed.code === 0 ? listed.stdout.split(/\s+/).filter(Boolean).map(Number) : [];
		if (numbers.length === 0) open.push("?");
		open.push(...numbers);
	}
	return [...new Set(open)];
}

/** One ticket through the ready check of SKILL.md. */
function readyOne(ctx, number, issue) {
	const config = ctx.config;
	const n = Number(number);
	issue ??= ghJson(ctx.main, ["issue", "view", String(n), "--json", "number,title,body,labels,assignees,state,url"]);
	const meta = ghJson(ctx.main, ["api", `repos/${ctx.repo()}/issues/${n}`]);
	const body = issue.body ?? "";
	const labels = (issue.labels ?? []).map((label) => label.name);
	const assignees = (issue.assignees ?? []).map((assignee) => assignee.login);
	const failures = [];
	const add = (gate, reason, mustDo) => failures.push({ gate, reason, mustDo });
	const specsInRepo = config.specs !== null;

	if (issue.state !== "OPEN") add("base", `#${n} geschlossen`, null);
	if (!labels.includes(READY_LABEL)) add("base", "ready-for-agent fehlt", `#${n}: freigeben (Label ready-for-agent)`);
	if (!specsInRepo && !hasCriteria(body)) add("base", "Akzeptanzkriterien fehlen", `#${n}: Akzeptanzkriterien ergänzen`);
	if (assignees.length > 0 && !assignees.includes(ctx.me()))
		add("base", `zugewiesen an ${assignees[0]}`, `#${n}: Zuweisung an ${assignees.join(", ")} klären`);
	if (labels.includes(LABEL))
		add("base", "läuft bereits (Label)", `#${n}: Label factory-in-progress entfernen, falls kein Job und kein PR mehr läuft`);
	if (!specsInRepo && isSpec(body, meta.sub_issues_summary?.total ?? 0))
		add("base", `#${n} ist eine Spec`, `#${n}: /to-tickets, dann die Tickets starten`);

	let spec = null;
	if (specsInRepo) {
		const path = specLine(body);
		if (path) {
			spec = { path, released: false };
			const shown = git(ctx.main, "show", `origin/${config.integration}:${path}`);
			const release = config.specs.get("Release")?.code ?? "Release-Befehl";
			if (shown.code !== 0) add("spec", "Spec nicht gemergt", `${path}: Spec-PR freigeben und mergen, dann /factory #${n}`);
			else {
				spec.status = specStatus(shown.stdout);
				spec.released = specReleased(shown.stdout);
				if (!spec.released)
					add("spec", "Spec nicht freigegeben", `${path}: freigeben (${release}) und mergen, dann /factory #${n}`);
				const ids = criteriaLine(body);
				if (!ids || ids.length === 0) add("spec", "Kriterien fehlen", `#${n}: Zeile "Kriterien: AC-<i>, …" ergänzen`);
				else
					for (const id of ids)
						if (criterionState(shown.stdout, id) !== "ok")
							add("spec", `${id} nicht in Spec`, `#${n}: Kriterien an ${path} anpassen`);
			}
		}
	} else {
		const parent = parentOf(ctx, n, body);
		if (parent) {
			const parentIssue = ghJson(ctx.main, ["issue", "view", String(parent), "--json", "number,body,url,state"]);
			spec = { number: parent, url: parentIssue.url, released: isReleased(parentIssue.body ?? "") };
			if (!spec.released)
				add("spec", `Spec #${parent} nicht freigegeben`, `#${parent}: Freigabe ausfüllen (Name und Datum), dann /factory #${n}`);
		}
	}

	const blockers = openBlockers(ctx, n, body, meta.issue_dependencies_summary);
	for (const blocker of blockers)
		add(
			"blocker",
			blocker === "?" ? "Blocker offen" : `Blocker #${blocker} offen`,
			blocker === "?" ? `#${n}: Blocker schließen, dann /factory #${n}` : `#${blocker} schließen, dann /factory #${n}`,
		);

	const base = failures.filter((failure) => failure.gate === "base");
	const draftSpec = spec === null && base.length === 0;
	return {
		number: n,
		title: issue.title,
		url: issue.url,
		ready: !draftSpec && failures.length === 0,
		draftSpec,
		failures: draftSpec ? [] : failures,
		spec,
		blockers,
		labels,
		id: meta.id,
	};
}

function preflight(ctx) {
	const config = requireConfig(ctx);
	const info = versionInfo(ctx);
	requireAgents(ctx, info);
	must(gh(ctx.main, "auth", "status"), "gh nicht angemeldet", "gh auth login");
	must(git(ctx.main, "fetch", "--quiet", "origin", config.integration), "git fetch fehlgeschlagen");
	const base = must(git(ctx.main, "rev-parse", `origin/${config.integration}`), "Integrationsbranch fehlt");
	return {
		version: info.version,
		repo: ctx.repo(),
		integration: config.integration,
		base,
		me: ctx.me(),
		specsInRepo: config.specs !== null,
		language: config.language,
		ci: config.ci,
		preview: config.preview,
		skills: ctx.skills,
		agents: ctx.agents,
		warnings: info.drift
			.filter((agent) => agent.state !== "ok")
			.map((agent) => `Agent ${agent.name}: ${agent.state === "missing" ? "fehlt" : "weicht von claude-mods ab"}`),
	};
}

function cmdReady(ctx, { positional }) {
	// Without tickets it is the preflight alone: config, agents, gh, fetch (for /factory grill).
	const head = preflight(ctx);
	const issues = positional.map((arg) => readyOne(ctx, arg.replace(/^#/, "")));
	return { ok: true, ...head, issues };
}

function cmdNext(ctx, { flags }) {
	const head = preflight(ctx);
	const limit = String(flags.limit ?? 30);
	const list = ghJson(ctx.main, [
		"issue",
		"list",
		"--state",
		"open",
		"--label",
		READY_LABEL,
		"--search",
		`no:assignee -label:${LABEL} sort:created-asc`,
		"--json",
		"number,title,body,labels,assignees,state,url",
		"--limit",
		limit,
	]);
	const candidates = [];
	const blockedOnly = [];
	for (const issue of list) {
		const result = readyOne(ctx, issue.number, issue);
		if (!flags.bodies) delete result.labels;
		if (flags.bodies) result.body = issue.body;
		if (result.ready || result.draftSpec) candidates.push(result);
		else if (result.failures.every((failure) => failure.gate === "blocker")) blockedOnly.push(result);
	}
	return { ok: true, ...head, candidates, blockedOnly };
}

// ---------------------------------------------------------------------------------------------------------------
// names, claim, cleanup

function cmdNames(ctx, { positional }) {
	const job = positional[0] ?? usage("names <job>");
	return { ok: true, job, main: ctx.main, ...ctx.paths(job), skills: ctx.skills, agents: ctx.agents, version: factoryVersion(FACTORY).version };
}

function issueLabels(ctx, number) {
	const result = ghJson(ctx.main, ["issue", "view", String(number), "--json", "labels"]);
	return (result.labels ?? []).map((label) => label.name);
}

function cmdClaim(ctx, { positional, flags }) {
	const job = positional[0] ?? usage("claim <job> --mode build|fix|brief|spec|rework --branch <b> --issues 1,2");
	const config = requireConfig(ctx);
	const mode = flags.mode ?? "build";
	const paths = ctx.paths(job);
	let issues = String(flags.issues ?? "")
		.split(/[,\s]+/)
		.filter(Boolean)
		.map((value) => Number(value.replace(/^#/, "")));
	const branch = flags.branch;
	if (["build", "fix", "brief", "rework"].includes(mode) && !branch) usage("claim … --branch <type/job>");
	if (mode === "brief" && (!flags.brief || !existsSync(String(flags.brief)))) usage("claim … --mode brief --brief <file with the brief>");
	if (branch && config.protected.includes(branch)) throw new Stop(`${branch} ist geschützt`, null);
	mkdirSync(paths.factoryDir, { recursive: true });

	must(git(ctx.main, "fetch", "--quiet", "origin", config.integration), "git fetch fehlgeschlagen");
	let base = must(git(ctx.main, "rev-parse", `origin/${config.integration}`), "Integrationsbranch fehlt");
	let added;
	if (mode === "spec") added = git(ctx.main, "worktree", "add", "--detach", paths.worktree, `origin/${config.integration}`);
	else if (mode === "rework") {
		must(git(ctx.main, "fetch", "--quiet", "origin", branch), `Branch ${branch} fehlt auf origin`);
		base = must(git(ctx.main, "merge-base", `origin/${config.integration}`, `origin/${branch}`), "merge-base fehlgeschlagen");
		added = existsSync(paths.worktree)
			? { code: 1, stderr: "worktree exists" }
			: git(ctx.main, "worktree", "add", "-B", branch, paths.worktree, `origin/${branch}`);
	} else added = git(ctx.main, "worktree", "add", "-b", branch, paths.worktree, base);
	if (added.code !== 0)
		return { ok: true, claimed: false, job, reason: "läuft bereits (Worktree existiert)", error: tail(added.stderr, 3) };

	const undo = () => {
		git(ctx.main, "worktree", "remove", "--force", paths.worktree);
		if (mode !== "spec" && mode !== "rework") git(ctx.main, "branch", "-D", branch);
	};
	const warnings = [];
	let dropped = [];
	if (mode === "build") {
		gh(ctx.main, "label", "create", LABEL, "--color", LABEL_COLOR, "--description", LABEL_DESCRIPTION, "--force");
		let labeled;
		try {
			labeled = issues.filter((number) => issueLabels(ctx, number).includes(LABEL));
		} catch (error) {
			undo();
			throw error;
		}
		if (labeled.length > 0 && (!flags["skip-labeled"] || labeled.length === issues.length)) {
			undo();
			const reason = issues.length > 1 ? `läuft bereits (Label #${labeled[0]})` : "läuft bereits (Label)";
			return { ok: true, claimed: false, job, reason, labeled };
		}
		dropped = labeled;
		issues = issues.filter((number) => !labeled.includes(number));
		for (const number of issues) {
			const edit = gh(ctx.main, "issue", "edit", String(number), "--add-label", LABEL, "--add-assignee", "@me");
			if (edit.code !== 0) warnings.push(`#${number}: Label und Zuweisung setzen fehlgeschlagen`);
		}
	}

	const briefText = mode === "brief" ? readFileSync(String(flags.brief), "utf8") : null;
	rmSync(paths.scratch, { recursive: true, force: true });
	mkdirSync(mode === "spec" ? paths.scratch : join(paths.scratch, "history"), { recursive: true });
	const brief = briefText === null ? null : join(paths.scratch, "brief.md");
	if (brief) {
		writeFileSync(brief, briefText);
		if (resolve(String(flags.brief)) !== brief) rmSync(String(flags.brief), { force: true });
	}
	const record = {
		job,
		mode,
		branch: branch ?? null,
		issues,
		fix: flags.fix ?? null,
		brief,
		base,
		worktree: paths.worktree,
		scratch: paths.scratch,
		schemaLock: paths.schemaLock,
		heads: {},
		version: factoryVersion(FACTORY).version,
		claimedAt: new Date().toISOString(),
		owner: randomBytes(6).toString("hex"),
	};
	writeJob(paths.scratch, record);
	const head =
		mode === "spec"
			? `Job: ${job}. Tickets: ${issues.map((number) => `#${number}`).join(", ")}. Worktree: ${paths.worktree}. Scratch: ${paths.scratch}. Skills: ${ctx.skills}.`
			: headSentence({ ...record, fix: record.fix, skills: ctx.skills, agents: ctx.agents });
	let repo = null;
	try {
		repo = ctx.repo();
	} catch {
		// only needed for gh api calls; the claim stands without it
	}
	return { ok: true, claimed: true, ...record, repo, language: config.language, ci: config.ci, preview: config.preview, dropped, warnings, head };
}

function stopPreview(scratch) {
	const pidFile = join(scratch, "preview.pid");
	if (!existsSync(pidFile)) return false;
	const pid = Number(readFileSync(pidFile, "utf8").trim());
	try {
		if (windows) run("taskkill", ["/pid", String(pid), "/T", "/F"]);
		else process.kill(-pid, "SIGTERM");
	} catch {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// already gone
		}
	}
	rmSync(pidFile, { force: true });
	return true;
}

function cmdCleanup(ctx, { positional, flags }) {
	const job = positional[0] ?? usage("cleanup <job> --owner <token> [--branch <b>] | cleanup <job> --force");
	const paths = ctx.paths(job);
	const record = readJob(paths.scratch);
	// The job must be this session's: a failed claim must never remove the worktree of the session that runs it.
	if (!flags.force && (!record || record.owner !== flags.owner))
		throw new Stop("Job gehört einer anderen Session", `${paths.worktree} prüfen; nur wenn dort nichts mehr läuft: factory.mjs cleanup ${job} --force`);
	const branch = flags.branch ?? record?.branch ?? null;
	const protectedBranches = ctx.config?.protected ?? ["main", "master"];
	const removed = [];
	if (existsSync(paths.scratch) && stopPreview(paths.scratch)) removed.push("preview");
	if (existsSync(paths.worktree)) {
		const result = git(ctx.main, "worktree", "remove", "--force", paths.worktree);
		if (result.code === 0) removed.push("worktree");
		else rmSync(paths.worktree, { recursive: true, force: true });
	}
	git(ctx.main, "worktree", "prune");
	if (branch && !protectedBranches.includes(branch) && git(ctx.main, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).code === 0) {
		if (git(ctx.main, "branch", "-D", branch).code === 0) removed.push(`branch ${branch}`);
	}
	if (existsSync(paths.scratch)) {
		rmSync(paths.scratch, { recursive: true, force: true });
		removed.push("scratch");
	}
	const owner = join(paths.schemaLock, "owner");
	if (existsSync(owner) && readFileSync(owner, "utf8").trim() === job) {
		rmSync(paths.schemaLock, { recursive: true, force: true });
		removed.push("schema lock");
	}
	return { ok: true, job, removed };
}

// ---------------------------------------------------------------------------------------------------------------
// setup

function cmdSetup(ctx, { positional }) {
	const job = positional[0] ?? usage("setup <job>");
	const config = requireConfig(ctx);
	const paths = ctx.paths(job);
	if (!existsSync(paths.worktree)) throw new Stop("Worktree fehlt", null);
	mkdirSync(paths.scratch, { recursive: true });
	const log = [];
	for (const line of config.setup) {
		const started = Date.now();
		const result = spawnSync(line, { cwd: paths.worktree, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
		log.push(`$ ${line}`, output.trimEnd(), "");
		if (result.status !== 0) {
			writeFileSync(join(paths.scratch, "setup.log"), `${log.join("\n")}\n`);
			return { ok: false, job, stop: { reason: `${line.split(/\s+/).slice(0, 2).join(" ")} fehlgeschlagen`, mustDo: null }, command: line, error: tail(output, 5) };
		}
		log.push(`(${Math.round((Date.now() - started) / 1000)} s)`, "");
	}
	writeFileSync(join(paths.scratch, "setup.log"), `${log.join("\n")}\n`);
	return { ok: true, job, commands: config.setup.length };
}

// ---------------------------------------------------------------------------------------------------------------
// check

function cmdCheck(ctx, { positional, flags }) {
	const job = positional[0] ?? usage("check <job> [--round N] [--base <sha>] [--section Check|Validate]");
	const config = requireConfig(ctx);
	const paths = ctx.paths(job);
	if (!existsSync(paths.worktree)) throw new Stop("Worktree fehlt", `/factory für ${job} neu starten`);
	const record = readJob(paths.scratch) ?? { job, heads: {} };
	const section = flags.section ?? "Check";
	const commands = section === "Validate" ? config.validate : config.check;
	if (flags.base && flags.base !== record.base) record.base = flags.base;
	const base = record.base ?? must(git(paths.worktree, "merge-base", `origin/${config.integration}`, "HEAD"), "merge-base fehlgeschlagen");
	const head = must(git(paths.worktree, "rev-parse", "HEAD"), "rev-parse fehlgeschlagen");
	const changed = changedFiles(paths.worktree, `${base}...HEAD`);
	const files = changed.filter((file) => existsSync(join(paths.worktree, file)));
	const round = flags.round ? Number(flags.round) : null;
	let prev = null;
	if (round && round > 1) {
		const candidate = record.heads?.[round - 1];
		if (candidate && candidate !== head && git(paths.worktree, "merge-base", "--is-ancestor", candidate, head).code === 0)
			prev = candidate;
	}
	const deltaFiles = prev ? changedFiles(paths.worktree, `${prev}..HEAD`) : changed;

	const results = [];
	if (section === "Check") {
		// The gate before a review: the builder left a clean, linear branch.
		const status = git(paths.worktree, "status", "--porcelain").stdout.trim();
		results.push({ command: "git status --porcelain", pass: status === "", output: status });
		const merges = git(paths.worktree, "rev-list", "--merges", `${base}..HEAD`).stdout.trim();
		results.push({ command: `git rev-list --merges ${base.slice(0, 12)}..HEAD`, pass: merges === "", output: merges });
	}
	for (const line of commands) {
		if (line.includes("<files>") && files.length === 0) {
			results.push({ command: line, pass: true, skipped: true, output: "" });
			continue;
		}
		const command = fillCommand(line, { files, base });
		const started = Date.now();
		const result = spawnSync(command, { cwd: paths.worktree, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
		results.push({
			command: line,
			pass: result.status === 0,
			code: result.status,
			ms: Date.now() - started,
			output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
		});
	}
	const pass = results.every((result) => result.pass);
	// A UI review that asked for changes runs again until it passes, whatever the delta touches.
	const lastUi = join(paths.scratch, "review-ui.md");
	const uiOpen = Boolean(prev) && existsSync(lastUi) && readFileSync(lastUi, "utf8").startsWith("VERDICT: CHANGES");
	const ui = Boolean(config.preview) && (uiOpen || matchesAny(deltaFiles, config.preview?.paths ?? []));

	const lines = [`CHECK: ${pass ? "PASS" : "FAIL"}`, "", `HEAD: ${head}`, `Base: ${base}`, ""];
	if (round) lines.splice(3, 0, `Round: ${round}`);
	if (prev) lines.splice(3, 0, `Previous head: ${prev}`);
	lines.push("## Commands", "");
	for (const result of results) {
		const state = result.skipped ? "skipped (no files)" : result.pass ? "pass" : `fail (exit ${result.code ?? 1})`;
		lines.push(`- \`${result.command}\`: ${state}${result.ms !== undefined ? `, ${Math.round(result.ms / 1000)} s` : ""}`);
	}
	for (const result of results.filter((candidate) => !candidate.pass)) {
		lines.push("", `## Output: ${result.command}`, "", "```text", tail(result.output, 80), "```");
	}
	const file = join(paths.scratch, section === "Validate" ? "validate.md" : "check.md");
	mkdirSync(paths.scratch, { recursive: true });
	writeFileSync(file, `${lines.join("\n")}\n`);
	if (round) {
		record.heads = { ...(record.heads ?? {}), [round]: head };
	}
	if (existsSync(paths.scratch)) writeJob(paths.scratch, record);
	return {
		ok: true,
		pass,
		head,
		base,
		prev,
		files: changed,
		deltaFiles,
		ui,
		failed: results.filter((result) => !result.pass).map((result) => result.command),
		file,
	};
}

// ---------------------------------------------------------------------------------------------------------------
// ci

function readChecks(ctx, pr) {
	const result = gh(ctx.main, "pr", "checks", String(pr), "--json", "name,state,bucket,link,workflow");
	const text = result.stdout.trim();
	if (text.startsWith("[")) return JSON.parse(text);
	if (/no checks reported/i.test(result.stderr + result.stdout)) return [];
	throw new Stop("gh pr checks fehlgeschlagen", null, tail(result.stderr, 5));
}

async function cmdCi(ctx, { positional, flags }) {
	const pr = positional[0] ?? usage("ci <pr> [--sha <head>] [--wait 540] [--logs <file>]");
	const wait = Number(flags.wait ?? 540) * 1000;
	const interval = Number(flags.interval ?? 20) * 1000;
	const grace = Number(flags.grace ?? 90) * 1000;
	const started = Date.now();
	let checks = [];
	let state = "pending";
	for (;;) {
		const elapsed = Date.now() - started;
		// Right after a push the PR may still show the checks of the commit before: wait until it names this head.
		const headSeen = !flags.sha || gh(ctx.main, "pr", "view", String(pr), "--json", "headRefOid", "--jq", ".headRefOid").stdout.trim() === flags.sha;
		checks = headSeen ? readChecks(ctx, pr) : [];
		if (!headSeen) state = "pending";
		else if (checks.length === 0) state = elapsed < grace ? "pending" : "none";
		else if (checks.some((check) => check.bucket === "pending")) state = "pending";
		else if (checks.some((check) => check.bucket === "fail" || check.bucket === "cancel")) state = "fail";
		else state = "pass";
		if (state !== "pending" || elapsed + interval > wait) break;
		await sleep(interval);
	}
	const failed = checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel");
	let logs = null;
	if (state === "fail" && flags.logs) {
		const parts = [`CI: FAIL`, "", `PR: #${pr}`, ""];
		for (const check of failed) {
			parts.push(`## ${check.workflow ? `${check.workflow} / ` : ""}${check.name}`, "", check.link ?? "", "");
			const match = /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(check.link ?? "");
			if (!match) {
				parts.push("No Actions log: open the link.", "");
				continue;
			}
			const args = match[2] ? ["run", "view", "--job", match[2], "--log-failed"] : ["run", "view", match[1], "--log-failed"];
			const log = gh(ctx.main, ...args);
			parts.push("```text", tail(log.code === 0 ? log.stdout : log.stderr, 150), "```", "");
		}
		logs = String(flags.logs);
		mkdirSync(dirname(logs), { recursive: true });
		writeFileSync(logs, `${parts.join("\n")}\n`);
	}
	return {
		ok: true,
		pr: Number(pr),
		state,
		checks: checks.map(({ name, bucket, link, workflow }) => ({ name, bucket, link, workflow })),
		failed: failed.map((check) => check.name),
		waitedSeconds: Math.round((Date.now() - started) / 1000),
		logs,
	};
}

// ---------------------------------------------------------------------------------------------------------------
// preview, screenshot

function freePort() {
	return new Promise((done, fail) => {
		const server = createServer();
		server.unref();
		server.on("error", fail);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => done(port));
		});
	});
}

async function cmdPreview(ctx, { positional }) {
	const [action, job] = positional;
	if (!["start", "stop"].includes(action) || !job) usage("preview start|stop <job>");
	const config = requireConfig(ctx);
	const paths = ctx.paths(job);
	if (action === "stop") return { ok: true, job, stopped: stopPreview(paths.scratch) };
	if (!config.preview?.start || !config.preview?.url)
		throw new Stop("Preview nicht konfiguriert", "docs/agents/factory.md: ## Preview mit Start und URL ergänzen");
	if (!existsSync(paths.worktree)) throw new Stop("Worktree fehlt", null);
	stopPreview(paths.scratch);
	const port = await freePort();
	const command = fillCommand(config.preview.start, { port });
	const url = fillCommand(config.preview.url, { port });
	mkdirSync(paths.scratch, { recursive: true });
	const logFile = join(paths.scratch, "preview.log");
	const log = openSync(logFile, "w");
	const child = spawn(command, {
		cwd: paths.worktree,
		shell: true,
		detached: !windows,
		stdio: ["ignore", log, log],
		env: { ...process.env, PORT: String(port), BROWSER: "none" },
		windowsHide: true,
	});
	child.unref();
	writeFileSync(join(paths.scratch, "preview.pid"), String(child.pid));
	const deadline = Date.now() + config.preview.timeout * 1000;
	let exited = null;
	child.on("exit", (code) => {
		exited = code ?? 1;
	});
	while (Date.now() < deadline && exited === null) {
		try {
			const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
			if (response.status < 500) return { ok: true, job, url, port, pid: child.pid, log: logFile };
		} catch {
			// not up yet
		}
		await sleep(1000);
	}
	stopPreview(paths.scratch);
	const reason = exited !== null ? "Preview-Server beendet" : "Preview startet nicht";
	return { ok: false, job, stop: { reason, mustDo: null }, error: tail(readFileSync(logFile, "utf8"), 20), log: logFile };
}

/** Playwright from the worktree, its packages (workspaces), the main checkout, NODE_PATH or the global npm root. */
function loadPlaywright(worktree) {
	const dirs = [];
	for (const root of [worktree, process.cwd()].filter(Boolean)) {
		dirs.push(root);
		for (const level1 of safeList(root)) {
			dirs.push(join(root, level1));
			for (const level2 of safeList(join(root, level1))) dirs.push(join(root, level1, level2));
		}
	}
	const global = run("npm", ["root", "-g"]).stdout.trim();
	if (global) dirs.push(global);
	const bases = [...dirs.filter((dir) => existsSync(join(dir, "package.json")) || dir === global).map((dir) => join(dir, "noop.js")), fileURLToPath(import.meta.url)];
	for (const base of bases) {
		for (const name of ["playwright", "@playwright/test"]) {
			try {
				return createRequire(base)(name);
			} catch {
				// next place
			}
		}
	}
	return null;
}

function safeList(dir) {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

async function cmdScreenshot(ctx, { positional, flags }) {
	const [url, file] = positional;
	if (!url || !file) usage("screenshot <url> <out.png> [--mobile] [--worktree <dir>]");
	const playwright = loadPlaywright(flags.worktree);
	if (!playwright) throw new Stop("Playwright fehlt", "Playwright im Repo installieren (npm i -D playwright, dann npx playwright install chromium)");
	const browser = await playwright.chromium.launch();
	try {
		const page = await browser.newPage({
			viewport: flags.mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
			deviceScaleFactor: 1,
		});
		const consoleErrors = [];
		const pageErrors = [];
		const failedRequests = [];
		page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text().slice(0, 300)));
		page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 300)));
		page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`.slice(0, 200)));
		const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((error) => {
			pageErrors.push(String(error.message).slice(0, 300));
			return null;
		});
		mkdirSync(dirname(resolve(file)), { recursive: true });
		await page.screenshot({ path: file, fullPage: Boolean(flags.full) });
		return {
			ok: true,
			url,
			finalUrl: page.url(),
			status: response?.status() ?? null,
			title: await page.title(),
			file: resolve(file),
			consoleErrors,
			pageErrors,
			failedRequests,
		};
	} finally {
		await browser.close();
	}
}

// ---------------------------------------------------------------------------------------------------------------
// stats

function jobStats(ctx, job) {
	const paths = ctx.paths(job);
	const file = join(paths.scratch, "agents.md");
	if (!existsSync(file)) return { job, agents: [], total: null, line: "keine Agenten aufgezeichnet" };
	const projects = join(configDir(), "projects");
	const runs = new Map();
	for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 3) continue;
		const id = parts.at(-1);
		const label = parts.slice(0, -1).join(" ");
		if (runs.has(id)) runs.get(id).labels.push(label);
		else runs.set(id, { id, labels: [label] });
	}
	const total = { durationMs: 0, totalTokens: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, toolCalls: 0 };
	const agents = [];
	for (const runInfo of runs.values()) {
		const path = findTranscript(runInfo.id, projects);
		if (!path) {
			agents.push({ ...runInfo, found: false });
			continue;
		}
		const usage = usageOf(readTranscript(path));
		agents.push({ ...runInfo, found: true, ...usage });
		total.durationMs += usage.durationMs;
		total.totalTokens += usage.totalTokens;
		total.toolCalls += usage.toolCalls;
		for (const key of Object.keys(total.tokens)) total.tokens[key] += usage.tokens[key];
	}
	const record = readJob(paths.scratch);
	const wall = record?.claimedAt ? Date.now() - Date.parse(record.claimedAt) : null;
	return {
		job,
		agents,
		total,
		wallMs: wall,
		line: `${formatDuration(wall ?? total.durationMs)} · ${formatTokens(total.totalTokens)} Tokens (Cache ${formatTokens(total.tokens.cacheRead)}) · ${agents.length} Agenten · ${total.toolCalls} Tool-Aufrufe`,
	};
}

function cmdStats(ctx, { positional }) {
	const job = positional[0] ?? usage("stats <job>");
	return { ok: true, ...jobStats(ctx, job) };
}

// ---------------------------------------------------------------------------------------------------------------
// close

function cmdClose(ctx, { positional }) {
	const config = requireConfig(ctx);
	must(gh(ctx.main, "auth", "status"), "gh nicht angemeldet", "gh auth login");
	const repo = ctx.repo();
	const named = positional.length > 0;
	let prs;
	const rows = [];
	if (named) {
		prs = [];
		for (const arg of positional) {
			const number = arg.replace(/^#/, "");
			const pr = ghJson(ctx.main, ["pr", "view", number, "--json", "number,state,baseRefName,body,mergedAt,headRefName,url"]);
			if (pr.state !== "MERGED" || pr.baseRefName !== config.integration) rows.push({ pr: pr.number, url: pr.url, closed: [], spec: "⛔ nicht gemergt" });
			else prs.push(pr);
		}
	} else {
		prs = ghJson(ctx.main, [
			"pr",
			"list",
			"--base",
			config.integration,
			"--state",
			"merged",
			"--limit",
			"50",
			"--json",
			"number,title,body,headRefName,url",
		]).filter((pr) => /^(feat|fix)\//.test(pr.headRefName) && closesLines(pr.body).length > 0);
	}

	// Pass 1: close every ticket of every PR, so no spec is judged while one of its tickets is still to close.
	const done = [];
	for (const pr of prs) {
		const entry = { pr, closed: [], changed: false, specs: [] };
		for (const number of closesLines(pr.body)) {
			const issue = ghJson(ctx.main, ["issue", "view", String(number), "--json", "state,labels,body"]);
			if (issue.state === "OPEN") {
				const result = gh(
					ctx.main,
					"issue",
					"close",
					String(number),
					"--reason",
					"completed",
					"--comment",
					config.language === "en"
						? `Implemented in #${pr.number}, merged into ${config.integration}.`
						: `Umgesetzt in #${pr.number}, gemergt in ${config.integration}.`,
				);
				if (result.code === 0) {
					entry.closed.push(number);
					entry.changed = true;
				}
			}
			if ((issue.labels ?? []).some((label) => label.name === LABEL)) {
				gh(ctx.main, "issue", "edit", String(number), "--remove-label", LABEL);
				entry.changed = true;
			}
			const key = config.specs ? specLine(issue.body ?? "") : parentOfClosed(ctx, repo, number, issue.body ?? "");
			if (key && !entry.specs.includes(key)) entry.specs.push(key);
		}
		done.push(entry);
	}

	// Pass 2: every spec once, after all its tickets of this run are closed.
	let openIssues = null;
	const openWithBodies = () =>
		(openIssues ??= ghJson(ctx.main, ["issue", "list", "--state", "open", "--limit", "200", "--json", "number,body"]));
	const specs = new Map();
	for (const key of new Set(done.flatMap((entry) => entry.specs))) {
		specs.set(key, config.specs ? closeFileSpec(ctx, config, key) : closeIssueSpec(ctx, repo, key, openWithBodies, config.language));
	}
	for (const entry of done) {
		const changed = entry.changed || entry.specs.some((key) => specs.get(key).changed);
		const spec = entry.specs.map((key) => specs.get(key).text).join("; ") || "–";
		if (named || changed) rows.push({ pr: entry.pr.number, url: entry.pr.url, closed: entry.closed, spec });
	}
	return { ok: true, rows, nothing: rows.length === 0 };
}

function parentOfClosed(ctx, repo, number, body) {
	const result = gh(ctx.main, "api", `repos/${repo}/issues/${number}/parent`, "--jq", ".number");
	if (result.code === 0 && /^\d+$/.test(result.stdout.trim())) return Number(result.stdout.trim());
	return parentFromBody(body);
}

function closeIssueSpec(ctx, repo, spec, openWithBodies, language) {
	const view = ghJson(ctx.main, ["issue", "view", String(spec), "--json", "state"]);
	if (view.state !== "OPEN") return { text: `#${spec} geschlossen`, changed: false };
	const subs = gh(ctx.main, "api", "--paginate", `repos/${repo}/issues/${spec}/sub_issues`, "--jq", ".[] | [.number, .state] | @tsv");
	const all = [];
	const open = [];
	for (const line of subs.stdout.split("\n").filter(Boolean)) {
		const [number, state] = line.split("\t");
		all.push(Number(number));
		if (state === "open") open.push(Number(number));
	}
	for (const issue of openWithBodies()) {
		if (parentFromBody(issue.body ?? "") === spec && !open.includes(issue.number)) open.push(issue.number);
	}
	if (open.length > 0) return { text: `#${spec} offen: ${open.map((number) => `#${number}`).join(", ")}`, changed: false };
	const list = all.length > 0 ? all.map((number) => `#${number}`).join(", ") : "–";
	const result = gh(
		ctx.main,
		"issue",
		"close",
		String(spec),
		"--reason",
		"completed",
		"--comment",
		language === "en" ? `All tickets done: ${list}. Closed with /factory close.` : `Alle Tickets erledigt: ${list}. Geschlossen mit /factory close.`,
	);
	return result.code === 0 ? { text: `#${spec} geschlossen`, changed: true } : { text: `#${spec} ⛔ schließen fehlgeschlagen`, changed: false };
}

function closeFileSpec(ctx, config, path) {
	const spec = basename(dirname(path));
	// The search index lags behind: a ticket closed a moment ago may still be listed as open, so ask each one.
	const open = ghJson(ctx.main, ["issue", "list", "--state", "open", "--search", `"${path}" in:body`, "--limit", "200", "--json", "number,body"])
		.filter((issue) => specLine(issue.body ?? "") === path)
		.map((issue) => issue.number)
		.filter((number) => gh(ctx.main, "issue", "view", String(number), "--json", "state", "--jq", ".state").stdout.trim() !== "CLOSED");
	if (open.length > 0) return { text: `${spec} offen: ${open.map((number) => `#${number}`).join(", ")}`, changed: false };
	git(ctx.main, "fetch", "--quiet", "origin", config.integration);
	const shown = git(ctx.main, "show", `origin/${config.integration}:${path}`);
	const status = shown.code === 0 ? specStatus(shown.stdout) : null;
	if (status === "umgesetzt" || status === "implemented") return { text: `${spec} bereits umgesetzt`, changed: false };
	if (status !== "freigegeben" && status !== "released") return { text: `${spec} ${status ?? "fehlt"}`, changed: false };
	const branch = `docs/spec-${spec}-done`;
	if (git(ctx.main, "ls-remote", "--exit-code", "--heads", "origin", branch).code === 0) {
		const pr = gh(ctx.main, "pr", "list", "--head", branch, "--json", "number", "--jq", ".[0].number").stdout.trim();
		return { text: `${spec} umgesetzt: ${pr ? `#${pr}` : branch} (offen)`, changed: false };
	}
	const done = config.specs.get("Done")?.code;
	if (!done) return { text: `${spec} ⛔ Specs: Done fehlt`, changed: false };
	const worktree = join(ctx.paths(`spec-${spec}-done`).factoryDir, `spec-${spec}-done`);
	const added = git(ctx.main, "worktree", "add", "-b", branch, worktree, `origin/${config.integration}`);
	if (added.code !== 0) return { text: `${spec} ⛔ Worktree fehlgeschlagen`, changed: false };
	try {
		const result = spawnSync(fillCommand(done, { spec }), { cwd: worktree, shell: true, encoding: "utf8" });
		if (result.status !== 0) {
			const id = /AC-\d+/.exec(`${result.stdout}${result.stderr}`)?.[0];
			return { text: `${spec} ⛔ ${id ? `${id} ohne Test` : "Done fehlgeschlagen"}`, changed: false };
		}
		must(git(worktree, "add", path), "git add fehlgeschlagen");
		must(git(worktree, "commit", "-m", `docs(specs): mark ${spec} as implemented`), "git commit fehlgeschlagen");
		must(git(worktree, "push", "-u", "origin", branch), "Push fehlgeschlagen");
		const tickets = ghJson(ctx.main, ["issue", "list", "--state", "closed", "--search", `"${path}" in:body`, "--limit", "200", "--json", "number,body"])
			.filter((issue) => specLine(issue.body ?? "") === path)
			.map((issue) => `#${issue.number}`);
		const created = must(
			gh(
				ctx.main,
				"pr",
				"create",
				"--base",
				config.integration,
				"--head",
				branch,
				"--title",
				`docs(specs): mark ${spec} as implemented`,
				"--body",
				config.language === "en"
					? `All tickets of the spec done: ${tickets.join(", ") || "–"}. Opened with /factory close.`
					: `Alle Tickets der Spec erledigt: ${tickets.join(", ") || "–"}. Angelegt mit /factory close.`,
			),
			"PR-Erstellung fehlgeschlagen",
		);
		const number = /\/pull\/(\d+)/.exec(created)?.[1];
		return { text: `${spec} umgesetzt: #${number ?? "?"}`, changed: true };
	} catch (error) {
		return { text: `${spec} ⛔ ${error.reason ?? error.message}`, changed: false };
	} finally {
		git(ctx.main, "worktree", "remove", "--force", worktree);
		git(ctx.main, "branch", "-D", branch);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// doctor, version

function cmdVersion(ctx) {
	const info = versionInfo(ctx);
	return { ok: true, ...info, agentsOk: info.drift.every((agent) => agent.state === "ok") };
}

/** Skills of claude-mods in a skills folder: links into the same checkout as the factory, or copies with the marker. */
function claudeModsSkills(dir) {
	if (!existsSync(dir)) return [];
	const ours = new Set(readdirSync(dirname(realpathSync(FACTORY))));
	return readdirSync(dir).filter((name) => ours.has(name) && existsSync(join(dir, name, "SKILL.md")));
}

function hookCommands(file) {
	if (!existsSync(file)) return [];
	try {
		const settings = JSON.parse(readFileSync(file, "utf8"));
		return (settings.hooks?.UserPromptSubmit ?? []).flatMap((entry) => (entry.hooks ?? []).map((hook) => String(hook.command)));
	} catch {
		return [];
	}
}

function labelAge(ctx, repo, number) {
	const result = gh(ctx.main, "api", "--paginate", `repos/${repo}/issues/${number}/events`, "--jq", `.[] | select(.event == "labeled" and .label.name == "${LABEL}") | .created_at`);
	const times = result.stdout.split("\n").filter(Boolean).map(Date.parse);
	return times.length > 0 ? Date.now() - Math.max(...times) : null;
}

function cmdDoctor(ctx, { flags }) {
	const checks = [];
	const fixed = [];
	const add = (level, area, message, fix = null) => checks.push({ level, area, message, fix });
	const fix = Boolean(flags.fix);
	const staleMs = Number(flags["stale-hours"] ?? 12) * 3600 * 1000;

	// Install
	const info = versionInfo(ctx);
	add(info.version ? "ok" : "warn", "Install", `claude-mods ${info.version ?? "Version unbekannt"} (${info.source}), Skills ${info.skills}`, info.version ? null : "node install.mjs in claude-mods ausführen");
	for (const agent of info.drift) {
		if (agent.state === "missing") add("error", "Agenten", `${agent.name} fehlt in ${info.agents}`, "node install.mjs in claude-mods ausführen, Session neu starten");
		else if (agent.state === "differs") add("warn", "Agenten", `${agent.name} weicht von ${join(FACTORY, "subagents")} ab (alte Kopie?)`, "node install.mjs (nach --copy erneut), Session neu starten");
	}
	if (info.drift.length > 0 && info.drift.every((agent) => agent.state === "ok")) add("ok", "Agenten", `${info.drift.length} Agenten passen zur Factory`);
	const projectSkills = claudeModsSkills(join(ctx.main, ".claude", "skills"));
	const userSkills = claudeModsSkills(join(ctx.userDir, "skills"));
	if (projectSkills.length > 0 && userSkills.length > 0)
		add("warn", "Install", `Doppelt installiert: ${projectSkills.length} Skills auch in .claude/skills/ des Repos`, `node <claude-mods>/install.mjs --clean-project ${ctx.main} --dry-run, dann ohne --dry-run (abweichende Kopien mit --force), committen`);
	const projectHook = hookCommands(join(ctx.main, ".claude", "settings.json")).some((command) => command.includes("session-title.mjs"));
	const userHook = hookCommands(join(ctx.userDir, "settings.json")).some((command) => command.includes("session-title.mjs"));
	if (projectHook && userHook) add("warn", "Install", "Session-Titel-Hook im Repo und beim User registriert", "Hook aus .claude/settings.json des Repos entfernen (install.mjs --clean-project)");
	if (!projectHook && !userHook) add("warn", "Install", "Session-Titel-Hook nicht registriert", "node install.mjs in claude-mods ausführen");

	// Tools
	const ghOk = gh(ctx.main, "auth", "status").code === 0;
	add(ghOk ? "ok" : "error", "Tools", ghOk ? "gh angemeldet" : "gh nicht angemeldet", ghOk ? null : "gh auth login");

	// Config
	const config = ctx.config;
	if (!config) {
		add("error", "Config", "docs/agents/factory.md fehlt", `Vorlage ${join(FACTORY, "config.md")} nach docs/agents/factory.md kopieren und ausfüllen`);
	} else {
		const missing = REQUIRED_HEADINGS.filter((heading) => !config.headings.includes(heading));
		add(missing.length === 0 ? "ok" : "error", "Config", missing.length === 0 ? "alle Abschnitte da" : `Abschnitte fehlen: ${missing.join(", ")}`, missing.length ? `docs/agents/factory.md: ## ${missing.join(", ## ")} ergänzen (Vorlage config.md)` : null);
		const integration = git(ctx.main, "ls-remote", "--exit-code", "--heads", "origin", config.integration);
		add(integration.code === 0 ? "ok" : "error", "Config", `Integrationsbranch ${config.integration} ${integration.code === 0 ? "auf origin" : "fehlt auf origin"}`, integration.code === 0 ? null : "Integration branch in docs/agents/factory.md korrigieren");
		for (const [section, lines] of [["Setup", config.setup], ["Validate", config.validate], ["Check", config.check]]) {
			if (lines.length === 0 && section !== "Setup") add("error", "Config", `## ${section} ohne Befehle`, `docs/agents/factory.md: ## ${section} mit einem bash-Block füllen`);
			const unknown = [...new Set(lines.flatMap(commandHeads).filter((head) => !onPath(head)))];
			if (unknown.length > 0) add("warn", "Config", `## ${section}: nicht gefunden: ${unknown.join(", ")}`, "installieren oder Befehl korrigieren");
		}
		for (const [section, lines] of [["Setup", config.setup], ["Validate", config.validate], ["Check", config.check]]) {
			if (lines.some(hasPlaceholder)) add("error", "Config", `## ${section}: Platzhalter <…> nicht ausgefüllt`, `docs/agents/factory.md: ## ${section} mit den Befehlen dieses Repos füllen`);
		}
		const prose = ["Repository", "Schema", "Specs", "Preview", "Standards", "Product decisions", "Danger list", "Security"].filter(
			(section) => config.sections.has(section) && hasPlaceholder(config.sections.get(section).replace(/`<command>`/g, "")),
		);
		if (prose.length > 0) add("warn", "Config", `Platzhalter <…> in ## ${prose.join(", ## ")}`, "ausfüllen oder die Zeile streichen");
		if (config.headings.includes("Standards") && !config.glossary && !config.decisions)
			add("warn", "Config", "## Standards ohne die Zeilen Glossary, Decisions, Issue tracker (ältere Vorlage)", "Zeilen aus der Vorlage config.md übernehmen; bis dahin gelten CONTEXT.md, docs/adr/ und docs/agents/issue-tracker.md");
		if (!config.headings.includes("Product decisions")) add("warn", "Config", "## Product decisions fehlt: Agenten kennen die Produktentscheidungen dieses Repos nicht", "Abschnitt aus der Vorlage config.md übernehmen");
		if (config.check.some((line) => /--write\b|\s--fix\b/.test(line))) add("error", "Config", "## Check schreibt Dateien (--write/--fix)", "in ## Check nur prüfende Befehle (--check)");
		if (config.specs) {
			const absent = SPEC_LINES.filter((name) => !config.specs.has(name));
			if (absent.length > 0) add("error", "Config", `## Specs: Zeilen fehlen: ${absent.join(", ")}`, "Zeilen aus der Vorlage config.md übernehmen");
		}
		if (config.preview && (!config.preview.start || !config.preview.url)) add("error", "Config", "## Preview ohne Start oder URL", "Start: `<befehl mit <port>>` und URL: `http://localhost:<port>/` ergänzen");
		if (config.preview && !loadPlaywright(ctx.main)) add("warn", "Tools", "Playwright fehlt: der UI-Review kann keine Screenshots machen", "npm i -D playwright (und npx playwright install chromium)");
	}

	// Leftovers of earlier runs
	const paths = jobPaths(ctx.main, "x");
	const worktrees = [];
	const list = git(ctx.main, "worktree", "list", "--porcelain").stdout;
	for (const block of list.split(/\n\n+/)) {
		const path = /^worktree (.+)$/m.exec(block)?.[1];
		if (!path || !resolve(path).startsWith(paths.factoryDir)) continue;
		const job = basename(path);
		const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
		const dirty = existsSync(path) && git(path, "status", "--porcelain").stdout.trim() !== "";
		let touched = 0;
		try {
			const index = must(git(path, "rev-parse", "--path-format=absolute", "--git-path", "index"), "");
			touched = Math.max(statSync(index).mtimeMs, Number(git(path, "log", "-1", "--format=%ct").stdout.trim()) * 1000 || 0);
		} catch {
			touched = 0;
		}
		worktrees.push({ path, job, branch, dirty, ageMs: Date.now() - touched });
	}
	for (const tree of worktrees) {
		const old = tree.ageMs > staleMs;
		// Pushed means the local head is on origin, not just that a branch of that name exists there.
		const fetched = tree.branch && git(ctx.main, "fetch", "--quiet", "origin", tree.branch).code === 0;
		const pushed = Boolean(fetched) && git(ctx.main, "rev-list", "--count", `origin/${tree.branch}..refs/heads/${tree.branch}`).stdout.trim() === "0";
		if (!old) {
			add("ok", "Reste", `Worktree ${tree.job}: aktiv (${formatDuration(tree.ageMs)})`);
			continue;
		}
		const safe = !tree.dirty && (pushed || !tree.branch);
		if (fix && safe) {
			git(ctx.main, "worktree", "remove", "--force", tree.path);
			if (tree.branch) git(ctx.main, "branch", "-D", tree.branch);
			rmSync(join(paths.root, tree.job), { recursive: true, force: true });
			fixed.push(`Worktree ${tree.job} entfernt`);
		} else
			add("warn", "Reste", `Worktree ${tree.job} seit ${formatDuration(tree.ageMs)} unberührt${tree.dirty ? ", mit Änderungen" : ""}${pushed ? "" : ", Branch nicht gepusht"}`, safe ? "/factory doctor --fix" : `${tree.path} prüfen, dann factory.mjs cleanup ${tree.job} --force`);
	}
	if (existsSync(paths.root)) {
		for (const entry of readdirSync(paths.root)) {
			const scratch = join(paths.root, entry);
			if (entry === ".schema-lock") {
				const owner = existsSync(join(scratch, "owner")) ? readFileSync(join(scratch, "owner"), "utf8").trim() : "?";
				if (worktrees.some((tree) => tree.job === owner)) continue;
				if (fix) {
					rmSync(scratch, { recursive: true, force: true });
					fixed.push(`Schema-Lock von ${owner} entfernt`);
				} else add("warn", "Reste", `Schema-Lock von ${owner} ohne Worktree`, "/factory doctor --fix");
				continue;
			}
			if (worktrees.some((tree) => tree.job === entry) || existsSync(join(paths.factoryDir, entry))) continue;
			if (fix) {
				stopPreview(scratch);
				rmSync(scratch, { recursive: true, force: true });
				fixed.push(`Scratch ${entry} entfernt`);
			} else add("warn", "Reste", `Scratch ${entry} ohne Worktree`, "/factory doctor --fix");
		}
	}

	// Labels of tickets nobody works on
	if (ghOk) {
		try {
			const repo = ctx.repo();
			const labeled = ghJson(ctx.main, ["issue", "list", "--state", "open", "--label", LABEL, "--limit", "200", "--json", "number,title"]);
			const prs = ghJson(ctx.main, ["pr", "list", "--state", "all", "--limit", "200", "--json", "number,state,body,headRefName"]);
			const heads = git(ctx.main, "ls-remote", "--heads", "origin").stdout.split("\n").map((line) => line.split("refs/heads/")[1]).filter(Boolean);
			for (const issue of labeled) {
				const n = issue.number;
				const openPr = prs.find((pr) => pr.state === "OPEN" && closesLines(pr.body ?? "").includes(n));
				const mergedPr = prs.find((pr) => pr.state === "MERGED" && closesLines(pr.body ?? "").includes(n));
				const branch = heads.find((head) => /^(feat|fix)\//.test(head) && jobNumbers(head).includes(n));
				const local = worktrees.find((tree) => jobNumbers(tree.job).includes(n));
				if (mergedPr) {
					add("warn", "Labels", `#${n}: PR #${mergedPr.number} gemergt, Ticket noch offen`, `/factory close ${mergedPr.number}`);
					continue;
				}
				if (openPr || local) continue;
				const age = labelAge(ctx, repo, n);
				// Unknown age (the events could not be read) counts as fresh: another machine may have claimed it a minute ago.
				if (age === null || age < staleMs) continue;
				const where = branch ? `nur Branch ${branch}, kein PR` : "kein PR, kein Branch, kein Worktree";
				if (fix && !branch) {
					gh(ctx.main, "issue", "edit", String(n), "--remove-label", LABEL);
					fixed.push(`#${n}: Label factory-in-progress entfernt`);
				} else add("warn", "Labels", `#${n}: Label factory-in-progress, ${where}${age ? ` (seit ${formatDuration(age)})` : ""}`, branch ? `${branch} prüfen, dann Label an #${n} entfernen` : "/factory doctor --fix");
			}
			if (labeled.length === 0) add("ok", "Labels", "keine Tickets mit factory-in-progress");
		} catch (error) {
			add("warn", "Labels", `nicht geprüft: ${error.reason ?? error.message}`);
		}
	}
	const level = checks.some((check) => check.level === "error") ? "error" : checks.some((check) => check.level === "warn") ? "warn" : "ok";
	return { ok: true, level, version: info.version, checks, fixed };
}

// ---------------------------------------------------------------------------------------------------------------

function usage(text) {
	console.error(`usage: node factory.mjs ${text}`);
	process.exit(2);
}

const COMMANDS = {
	ready: cmdReady,
	next: cmdNext,
	names: cmdNames,
	claim: cmdClaim,
	setup: cmdSetup,
	check: cmdCheck,
	ci: cmdCi,
	preview: cmdPreview,
	screenshot: cmdScreenshot,
	stats: cmdStats,
	cleanup: cmdCleanup,
	close: cmdClose,
	doctor: cmdDoctor,
	version: cmdVersion,
};

const [name, ...rest] = process.argv.slice(2);
if (!COMMANDS[name]) usage(`<${Object.keys(COMMANDS).join("|")}> …`);
try {
	const ctx = name === "screenshot" ? null : context();
	const result = await COMMANDS[name](ctx, parseArgs(rest));
	out(result);
	process.exit(result.ok === false ? 1 : 0);
} catch (error) {
	if (error instanceof Stop) {
		out({ ok: false, stop: { reason: error.reason, mustDo: error.mustDo ?? null }, error: error.error ?? null });
		process.exit(1);
	}
	out({ ok: false, stop: { reason: "factory.mjs fehlgeschlagen", mustDo: null }, error: String(error.stack ?? error).slice(0, 2000) });
	process.exit(1);
}
