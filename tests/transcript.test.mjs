import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { SCRIPTS, tempDir, transcriptLines, write } from "./helpers.mjs";

test("condenses a transcript found by its agent id, with what it cost", () => {
	const config = tempDir();
	write(join(config, "projects", "-w-app", "session-1", "subagents", "agent-abc123.jsonl"), `${transcriptLines()}\n{broken`);
	const result = spawnSync(process.execPath, [join(SCRIPTS, "transcript.mjs"), "abc123", "missing"], {
		encoding: "utf8",
		env: { ...process.env, CLAUDE_CONFIG_DIR: config },
	});
	assert.equal(result.status, 0, result.stderr);
	const text = result.stdout;
	assert.match(text, /# Transcript abc123/);
	assert.match(text, /Tool calls: 2, failed: 1, tool result chars: 20/);
	assert.match(text, /Duration: 2 min, tokens: 163 Tsd \(cache read 150 Tsd, output 600\)/);
	assert.match(text, /USER: Job: x\. Build round 1\./);
	assert.match(text, /→ Bash command=ls -la/);
	assert.match(text, /→ Edit file_path=\/w\/a\.ts edit 3→4 chars/);
	assert.match(text, /← ERROR String not found/);
	assert.match(text, /AGENT: STATUS: READY/);
	assert.match(text, /# Transcript missing\n\nNot found\./);
});

test("cuts the middle of a long transcript", () => {
	const dir = tempDir();
	const file = join(dir, "t.jsonl");
	const long = Array.from({ length: 200 }, (_, index) =>
		JSON.stringify({ type: "assistant", message: { id: `m${index}`, content: [{ type: "text", text: `step ${index} ${"x".repeat(100)}` }] } }),
	).join("\n");
	write(file, long);
	const result = spawnSync(process.execPath, [join(SCRIPTS, "transcript.mjs"), file, "--max", "2000"], { encoding: "utf8" });
	assert.match(result.stdout, /chars of the middle left out/);
	assert.match(result.stdout, /step 0 /);
	assert.match(result.stdout, /step 199 /);
});

test("usage without arguments", () => {
	const result = spawnSync(process.execPath, [join(SCRIPTS, "transcript.mjs")], { encoding: "utf8" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /usage/);
});
