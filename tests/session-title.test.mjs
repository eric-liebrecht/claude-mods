import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { makeRepo, SCRIPTS } from "./helpers.mjs";

const repo = makeRepo();
repo.gh([
	["^issue view 142 ", "Search filter for the order list\n"],
	["^issue view 143 ", "Review filters\n"],
]);

function title(prompt) {
	const result = spawnSync(process.execPath, [join(SCRIPTS, "session-title.mjs")], {
		input: JSON.stringify({ prompt, cwd: repo.main }),
		encoding: "utf8",
		env: repo.env,
	});
	assert.equal(result.status, 0);
	return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.sessionTitle : null;
}

test("names the session after the /factory command", () => {
	assert.equal(title("/factory #142"), "Factory · #142 Search filter for");
	assert.equal(title("/factory #142 #150"), "Factory · #142, #150");
	assert.equal(title("/factory #142 #143 --bundle"), "Factory · #142+#143 Search filter for");
	assert.equal(title("/factory close"), "Factory · close");
	assert.equal(title("/factory doctor --fix"), "Factory · doctor");
	assert.equal(title("/factory next 2"), "Factory · next");
	assert.equal(title("/factory rework 512 bitte Texte"), "Factory · rework #512");
	assert.equal(title("/factory fix typo"), "Factory · fix typo");
	assert.equal(title(`/factory fix ${"x".repeat(80)}`).length, 60);
});

test("leaves every other prompt and the help alone", () => {
	assert.equal(title("/factory"), null);
	assert.equal(title("/factory help"), null);
	assert.equal(title("bitte /factory #1"), null);
	assert.equal(title("hello"), null);
	assert.equal(title("/factory #999"), "Factory · #999", "a failing gh leaves the number alone");
});

test("a broken input never blocks the prompt", () => {
	const result = spawnSync(process.execPath, [join(SCRIPTS, "session-title.mjs")], { input: "not json", encoding: "utf8" });
	assert.equal(result.status, 0);
	assert.equal(result.stdout, "");
});
