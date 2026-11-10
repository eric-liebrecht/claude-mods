// The prose and the code of the factory name the same things: every agent, skill and factory.mjs command that
// exists is documented where the orchestrator and the human look for it.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT } from "./helpers.mjs";

const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");
const FACTORY = read("skills", "factory", "SKILL.md");
const README = read("README.md");
const AGENT_DIR = join(ROOT, "skills", "factory", "subagents");
const AGENTS = readdirSync(AGENT_DIR).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3));
const frontmatter = (text) => Object.fromEntries([...(/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "").matchAll(/^(\w+):\s*(.*)$/gm)].map((match) => [match[1], match[2]]));

test("every agent names itself as its file does and is in SKILL.md's table and the README", () => {
	for (const agent of AGENTS) {
		const meta = frontmatter(read("skills", "factory", "subagents", `${agent}.md`));
		assert.equal(meta.name, agent);
		assert.ok(meta.description, `${agent}: description`);
		assert.ok(FACTORY.includes(`| \`${agent}\``), `${agent} in SKILL.md's agent table`);
		assert.ok(README.includes(`\`${agent}\``), `${agent} in README`);
	}
});

test("every skill names itself as its folder does and is in the README", () => {
	for (const skill of readdirSync(join(ROOT, "skills"))) {
		const file = join(ROOT, "skills", skill, "SKILL.md");
		if (!existsSync(file)) continue;
		assert.equal(frontmatter(readFileSync(file, "utf8")).name, skill);
		assert.ok(README.includes(skill), `${skill} in README`);
	}
});

test("every factory.mjs command is used by SKILL.md or an agent", () => {
	const script = read("skills", "factory", "scripts", "factory.mjs");
	const commands = Object.keys(Object.fromEntries([.../const COMMANDS = \{([\s\S]*?)\};/.exec(script)[1].matchAll(/^\s*(\w+):/gm)].map((match) => [match[1], 1])));
	assert.ok(commands.length >= 10);
	const prose = [FACTORY, ...AGENTS.map((agent) => read("skills", "factory", "subagents", `${agent}.md`))].join("\n");
	for (const command of commands) assert.match(prose, new RegExp(`factory\\.mjs ${command}\\b`), command);
});

test("the help names every /factory command the description triggers on", () => {
	const help = /```text\n(\/factory:[\s\S]*?)```/.exec(FACTORY)[1];
	for (const command of ["#<n>", "--bundle", "next", "fix", "rework", "close", "doctor", "help"]) assert.ok(help.includes(command), command);
	const description = frontmatter(FACTORY).description;
	for (const command of ["/factory next", "/factory fix", "/factory rework", "/factory close", "/factory doctor"]) assert.ok(description.includes(command), command);
});

test("the README's pinned release is the current version", () => {
	const version = JSON.parse(read("package.json")).version;
	for (const pin of README.matchAll(/v(\d+\.\d+\.\d+)/g)) assert.equal(pin[1], version, `README pins v${pin[1]}`);
});
