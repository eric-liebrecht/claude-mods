import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, tempDir, VERSION, write } from "./helpers.mjs";

const SKILLS = readdirSync(join(ROOT, "skills")).filter((name) => existsSync(join(ROOT, "skills", name, "SKILL.md")));
const AGENTS = readdirSync(join(ROOT, "skills", "factory", "subagents")).filter((name) => name.endsWith(".md"));

function install(config, ...args) {
	return spawnSync(process.execPath, [join(ROOT, "install.mjs"), ...args], {
		encoding: "utf8",
		env: { ...process.env, CLAUDE_CONFIG_DIR: config },
	});
}

const settings = (config) => JSON.parse(readFileSync(join(config, "settings.json"), "utf8"));
const hooks = (config) =>
	(settings(config).hooks?.UserPromptSubmit ?? []).flatMap((entry) => entry.hooks.map((hook) => hook.command));

test("links every skill and agent and registers the hook once, keeping other settings", () => {
	const config = tempDir();
	writeFileSync(join(config, "settings.json"), JSON.stringify({ theme: "dark", hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo other" }] }] } }));
	for (let run = 0; run < 2; run += 1) {
		const result = install(config);
		assert.equal(result.status, 0, result.stderr);
	}
	for (const skill of SKILLS) {
		assert.ok(lstatSync(join(config, "skills", skill)).isSymbolicLink(), skill);
		assert.equal(realpathSync(join(config, "skills", skill)), realpathSync(join(ROOT, "skills", skill)));
	}
	for (const agent of AGENTS) assert.ok(lstatSync(join(config, "agents", agent)).isSymbolicLink(), agent);
	assert.equal(settings(config).theme, "dark");
	const commands = hooks(config);
	assert.equal(commands.filter((command) => command.includes("session-title.mjs")).length, 1);
	assert.ok(commands.includes("echo other"));
	assert.ok(commands.some((command) => command.includes(join(config, "skills", "factory", "scripts", "session-title.mjs"))));
});

test("--copy writes the version into every copy, and a second run replaces its own copies", () => {
	const config = tempDir();
	for (let run = 0; run < 2; run += 1) assert.equal(install(config, "--copy").status, 0);
	const marker = readFileSync(join(config, "skills", "factory", ".claude-mods"), "utf8");
	assert.match(marker, new RegExp(`^claude-mods ${VERSION.replace(/\./g, "\\.")}, copied from`));
	const builder = readFileSync(join(config, "agents", "builder.md"), "utf8");
	assert.ok(builder.trimEnd().endsWith(`<!-- .claude-mods ${VERSION} -->`));
	assert.ok(!lstatSync(join(config, "skills", "tdd")).isSymbolicLink());
});

test("a foreign skill of the same name is skipped, --force replaces it", () => {
	const config = tempDir();
	write(join(config, "skills", "tdd", "SKILL.md"), "mine\n");
	const skipped = install(config);
	assert.equal(skipped.status, 1);
	assert.match(skipped.stderr, /skipped skills\/tdd/);
	assert.equal(readFileSync(join(config, "skills", "tdd", "SKILL.md"), "utf8"), "mine\n");
	assert.equal(install(config, "--force").status, 0);
	assert.ok(lstatSync(join(config, "skills", "tdd")).isSymbolicLink());
});

test("--uninstall removes only what it installed, and the hook", () => {
	const config = tempDir();
	install(config);
	write(join(config, "skills", "mine", "SKILL.md"), "mine\n");
	assert.equal(install(config, "--uninstall").status, 0);
	for (const skill of SKILLS) assert.ok(!existsSync(join(config, "skills", skill)), skill);
	for (const agent of AGENTS) assert.ok(!existsSync(join(config, "agents", agent)), agent);
	assert.ok(existsSync(join(config, "skills", "mine", "SKILL.md")));
	assert.deepEqual(hooks(config), []);
});

test("--dry-run changes nothing", () => {
	const config = tempDir();
	const result = install(config, "--dry-run");
	assert.equal(result.status, 0);
	assert.match(result.stdout, /\[dry-run\] link skills\/factory/);
	assert.ok(!existsSync(join(config, "skills")));
	assert.ok(!existsSync(join(config, "settings.json")));
});

test("--clean-project removes a repo's old copies and its hook, nothing else", () => {
	const config = tempDir();
	const project = tempDir();
	cpSync(join(ROOT, "skills", "tdd"), join(project, ".claude", "skills", "tdd"), { recursive: true });
	write(join(project, ".claude", "skills", "pr", "SKILL.md"), "the repo's own pr skill\n");
	cpSync(join(ROOT, "skills", "factory"), join(project, ".claude", "skills", "factory"), { recursive: true });
	write(join(project, ".claude", "skills", "factory", ".claude-mods"), "claude-mods 1.0.0, copied\n");
	write(join(project, ".claude", "skills", "mine", "SKILL.md"), "project skill\n");
	write(join(project, ".claude", "agents", "builder.md"), `${readFileSync(join(ROOT, "skills", "factory", "subagents", "builder.md"), "utf8")}\n<!-- .claude-mods 1.0.0 -->\n`);
	write(join(project, ".claude", "agents", "mine.md"), "project agent\n");
	write(
		join(project, ".claude", "settings.json"),
		JSON.stringify({
			permissions: { allow: ["Bash(ls)"] },
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/skills/factory/scripts/session-title.mjs"' }] },
					{ hooks: [{ type: "command", command: "echo keep" }] },
				],
			},
		}),
	);
	const preview = install(config, "--dry-run", "--clean-project", project);
	assert.equal(preview.status, 0);
	assert.ok(existsSync(join(project, ".claude", "skills", "tdd")));
	const result = install(config, "--clean-project", project);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /commit the change there/);
	assert.ok(!existsSync(join(project, ".claude", "skills", "tdd")));
	assert.ok(!existsSync(join(project, ".claude", "skills", "factory")));
	assert.ok(!existsSync(join(project, ".claude", "agents", "builder.md")));
	assert.ok(existsSync(join(project, ".claude", "skills", "mine", "SKILL.md")));
	assert.ok(existsSync(join(project, ".claude", "agents", "mine.md")));
	const kept = JSON.parse(readFileSync(join(project, ".claude", "settings.json"), "utf8"));
	assert.deepEqual(kept.permissions, { allow: ["Bash(ls)"] });
	assert.deepEqual(kept.hooks.UserPromptSubmit, [{ hooks: [{ type: "command", command: "echo keep" }] }]);
	assert.ok(!existsSync(join(config, "skills")), "it installs nothing for the user");
	assert.ok(existsSync(join(project, ".claude", "skills", "pr", "SKILL.md")), "a copy that differs stays");
	assert.match(result.stderr, /kept .*pr: differs from claude-mods/);
	assert.equal(install(config, "--clean-project", project, "--force").status, 0);
	assert.ok(!existsSync(join(project, ".claude", "skills", "pr")));
	assert.match(install(config, "--clean-project", project).stdout, /nothing of claude-mods/);
});

test("bad options exit with 2", () => {
	const config = tempDir();
	mkdirSync(config, { recursive: true });
	assert.equal(install(config, "--nope").status, 2);
	assert.equal(install(config, "--clean-project").status, 2);
});
