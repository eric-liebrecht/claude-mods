#!/usr/bin/env node
// Installs the skills of claude-mods for the user, once per machine, instead of into every project:
//
//   ~/.claude/skills/<skill>      every folder of skills/ (factory, implement, tdd, …)
//   ~/.claude/agents/<agent>.md   the factory's agents from skills/factory/subagents/
//   ~/.claude/settings.json       the factory's session-title hook (UserPromptSubmit)
//
// By default skills and agents are symlinks into this checkout, so `git pull` here updates every project at once.
// `--copy` copies instead (cloud sessions, or a pinned snapshot); then run this script again after each pull.
// On Windows agents are always copied (a file symlink needs admin rights) and skills are directory junctions.
// `--uninstall` removes what this script installed. `--force` replaces a skill or agent of the same name that this
// script did not install. `--dry-run` prints what would happen. Honours CLAUDE_CONFIG_DIR like Claude Code does.
//
//   node install.mjs [--copy] [--force] [--dry-run] [--uninstall]
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
for (const arg of args) {
	if (!["--copy", "--force", "--dry-run", "--uninstall"].includes(arg)) {
		console.error(`unknown option ${arg}\nusage: node install.mjs [--copy] [--force] [--dry-run] [--uninstall]`);
		process.exit(2);
	}
}
const copy = args.has("--copy");
const force = args.has("--force");
const dryRun = args.has("--dry-run");
const uninstall = args.has("--uninstall");
const windows = process.platform === "win32";

const repo = dirname(fileURLToPath(import.meta.url));
const source = join(repo, "skills");
const config = process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : join(homedir(), ".claude");
const skillsDir = join(config, "skills");
const agentsDir = join(config, "agents");
const settingsFile = join(config, "settings.json");
/** Written into every copy, so a later run knows the copy is its own and may replace or remove it. */
const MARKER = ".claude-mods";
const HOOK_SCRIPT = "factory/scripts/session-title.mjs";

const skills = readdirSync(source, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, "SKILL.md")))
	.map((entry) => entry.name);
const agentSource = join(source, "factory", "subagents");
const agents = readdirSync(agentSource).filter((name) => name.endsWith(".md"));

function log(message) {
	console.log(dryRun ? `[dry-run] ${message}` : message);
}

function isLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

function exists(path) {
	return isLink(path) || existsSync(path);
}

/** Whether `target` was put there by this script: a link into this checkout, or a copy carrying the marker. */
function ours(target, from) {
	if (isLink(target)) {
		try {
			return realpathSync(target) === realpathSync(from) || resolve(dirname(target), readlinkSync(target)) === from;
		} catch {
			return readlinkSync(target).includes("claude-mods");
		}
	}
	if (lstatSync(target).isDirectory()) return existsSync(join(target, MARKER));
	return readFileSync(target, "utf8").includes(`<!-- ${MARKER} -->`);
}

function remove(target) {
	if (!dryRun) rmSync(target, { recursive: true, force: true });
}

/** Puts `from` at `target` as a link or a copy; `file` for an agent, a folder otherwise. */
function place(from, target, file) {
	const name = target.slice(config.length + 1);
	if (exists(target)) {
		if (!ours(target, from) && !force) {
			console.warn(`skipped ${name}: exists and was not installed by claude-mods (--force replaces it)`);
			return false;
		}
		remove(target);
	}
	const asCopy = copy || (file && windows);
	log(`${asCopy ? "copy" : "link"} ${name}`);
	if (dryRun) return true;
	if (!asCopy) {
		symlinkSync(from, target, file ? "file" : "junction");
	} else if (file) {
		const text = readFileSync(from, "utf8");
		writeFileSync(target, `${text.trimEnd()}\n\n<!-- ${MARKER} -->\n`);
	} else {
		cpSync(from, target, { recursive: true });
		writeFileSync(join(target, MARKER), `Copied from ${repo} by install.mjs; run it again to update.\n`);
	}
	return true;
}

function readSettings() {
	if (!existsSync(settingsFile)) return {};
	return JSON.parse(readFileSync(settingsFile, "utf8"));
}

/** Drops every session-title hook of the factory, also the project-relative one of older installs. */
function withoutHook(settings) {
	const entries = settings.hooks?.UserPromptSubmit;
	if (!entries) return settings;
	const kept = entries
		.map((entry) => ({ ...entry, hooks: entry.hooks.filter((hook) => !String(hook.command).includes(HOOK_SCRIPT)) }))
		.filter((entry) => entry.hooks.length > 0);
	if (kept.length > 0) settings.hooks.UserPromptSubmit = kept;
	else delete settings.hooks.UserPromptSubmit;
	if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
	return settings;
}

function writeSettings(settings) {
	log(`update ${settingsFile}`);
	if (!dryRun) writeFileSync(settingsFile, `${JSON.stringify(settings, null, "\t")}\n`);
}

if (uninstall) {
	for (const skill of skills) {
		const target = join(skillsDir, skill);
		if (exists(target) && ours(target, join(source, skill))) {
			log(`remove skills/${skill}`);
			remove(target);
		}
	}
	for (const agent of agents) {
		const target = join(agentsDir, agent);
		if (exists(target) && ours(target, join(agentSource, agent))) {
			log(`remove agents/${agent}`);
			remove(target);
		}
	}
	if (existsSync(settingsFile)) writeSettings(withoutHook(readSettings()));
	log("claude-mods uninstalled.");
	process.exit(0);
}

if (!dryRun) {
	mkdirSync(skillsDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });
}
const failed = [];
for (const skill of skills) {
	if (!place(join(source, skill), join(skillsDir, skill), false)) failed.push(`skills/${skill}`);
}
for (const agent of agents) {
	if (!place(join(agentSource, agent), join(agentsDir, agent), true)) failed.push(`agents/${agent}`);
}

// An absolute path: the hook runs in every project, and $HOME is not set the same way in every shell Claude uses.
const script = join(skillsDir, HOOK_SCRIPT).split("\\").join("/");
const settings = withoutHook(readSettings());
settings.hooks ??= {};
(settings.hooks.UserPromptSubmit ??= []).push({ hooks: [{ type: "command", command: `node "${script}"` }] });
writeSettings(settings);

const version = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version;
log(`claude-mods ${version}: ${skills.length} skills, ${agents.length} agents in ${config}${copy ? " (copies)" : ""}.`);
if (failed.length > 0) {
	console.warn(`not installed: ${failed.join(", ")}`);
	process.exit(1);
}
log("Restart running Claude Code sessions to load them. Repo settings stay in each repo: docs/agents/factory.md.");
