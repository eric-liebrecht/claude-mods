import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BASE_GH, CONFIG, git, issue, issueMeta, makeRepo, NOT_FOUND, SCRIPTS, transcriptLines, VERSION, write } from "./helpers.mjs";

const released = "## Freigabe\n\n- Entwurf: Factory, 2026-10-01\n- Freigegeben von: Eric [2026-10-02]\n\n## Problem Statement\n";
const draft = "## Freigabe\n\n- Entwurf: Factory, 2026-10-01\n- Freigegeben von: Name [JJJJ-MM-TT]\n";

function readyRules(extra = []) {
	return [
		...BASE_GH,
		...extra,
		["^issue view 142 ", issue(142, { body: "## Parent\n\n#120\n\n## Acceptance criteria\n\n- [ ] filter\n" })],
		["^api repos/o/r/issues/142$", issueMeta(142)],
		["^api repos/o/r/issues/142/parent", ...NOT_FOUND],
		["^issue view 120 ", { number: 120, body: released, url: "u", state: "OPEN" }],
		["^issue view 143 ", issue(143)],
		["^api repos/o/r/issues/143$", issueMeta(143, { blockedBy: 1 })],
		["^api repos/o/r/issues/143/parent", ...NOT_FOUND],
		["^api repos/o/r/issues/143/dependencies/blocked_by", "158\n"],
		["^issue view 144 ", issue(144, { body: "## Acceptance criteria\n- [ ] x\n\nBlocked by: #158\n" })],
		["^api repos/o/r/issues/144$", issueMeta(144)],
		["^api repos/o/r/issues/144/parent", "121"],
		["^issue view 121 ", { number: 121, body: draft, url: "u", state: "OPEN" }],
		["^issue view 158 --json state", "OPEN"],
		["^issue view 145 ", issue(145, { body: "## User Stories\n", labels: ["ready-for-agent", "factory-in-progress"] })],
		["^api repos/o/r/issues/145$", issueMeta(145)],
		["^api repos/o/r/issues/145/parent", ...NOT_FOUND],
	];
}

test("ready: a released ticket, a draft, an unreleased spec with a blocker, a labeled spec", () => {
	const repo = makeRepo();
	repo.gh(readyRules());
	const { code, json, stderr } = repo.factory("ready", "142", "#143", "144", "145");
	assert.equal(code, 0, stderr);
	assert.equal(json.version, VERSION);
	assert.equal(json.repo, "o/r");
	assert.equal(json.integration, "main");
	assert.equal(json.base, git(repo.main, "rev-parse", "origin/main"));
	assert.deepEqual(json.warnings, []);
	const [ready, drafted, blocked, labeled] = json.issues;
	assert.equal(ready.ready, true);
	assert.deepEqual(ready.spec, { number: 120, url: "u", released: true });
	assert.equal(drafted.ready, false);
	assert.equal(drafted.draftSpec, true, "an open blocker does not stop a draft");
	assert.deepEqual(drafted.blockers, [158]);
	assert.equal(blocked.ready, false);
	assert.deepEqual(
		blocked.failures.map((failure) => failure.reason),
		["Spec #121 nicht freigegeben", "Blocker #158 offen"],
	);
	assert.match(blocked.failures[0].mustDo, /#121: Freigabe ausfüllen/);
	assert.equal(labeled.draftSpec, false);
	assert.deepEqual(
		labeled.failures.map((failure) => failure.reason),
		["Akzeptanzkriterien fehlen", "läuft bereits (Label)", "#145 ist eine Spec"],
	);
});

test("ready stops without the config, without agents and without gh", () => {
	const missing = makeRepo({ config: "" });
	git(missing.main, "rm", "--quiet", "docs/agents/factory.md");
	git(missing.main, "commit", "--quiet", "-m", "rm");
	missing.gh(BASE_GH);
	const noConfig = missing.factory("ready", "1");
	assert.equal(noConfig.code, 1);
	assert.equal(noConfig.json.stop.reason, "docs/agents/factory.md fehlt");

	const repo = makeRepo();
	repo.gh(BASE_GH);
	writeFileSync(join(repo.claude, "agents", "reviewer-code.md"), "old\n");
	const old = repo.factory("ready", "142");
	assert.equal(old.code, 1, "the issue is unknown to the fake gh");
	repo.gh([["^auth status", "", 1, "not logged in"]]);
	assert.equal(repo.factory("ready", "142").json.stop.reason, "gh nicht angemeldet");
	const version = repo.factory("version").json;
	assert.equal(version.agentsOk, false);
	assert.deepEqual(version.drift.find((agent) => agent.name === "reviewer-code"), { name: "reviewer-code", state: "differs" });

	const bare = makeRepo();
	bare.env.CLAUDE_CONFIG_DIR = join(bare.root, "nothing");
	bare.gh(BASE_GH);
	assert.equal(bare.factory("ready", "142").json.stop.reason, "Factory-Agenten fehlen");
});

test("specs in the repo: the Spec file must be merged and released, its criteria in it", () => {
	const config = `${readFileSync(join(import.meta.dirname, "..", "skills", "factory", "config.md"), "utf8")}`;
	const repo = makeRepo({ config });
	write(join(repo.main, "docs", "specs", "notes", "spec.md"), "# Spec: Notizen\n\nStatus: freigegeben (2026-10-01)\n\n- AC-1: a\n- AC-2: entfällt\n");
	write(join(repo.main, "docs", "specs", "draft", "spec.md"), "# Spec: Entwurf\n\nStatus: entwurf\n");
	git(repo.main, "add", ".");
	git(repo.main, "commit", "--quiet", "-m", "specs");
	git(repo.main, "push", "--quiet");
	repo.gh([
		...BASE_GH,
		["^issue view 1 ", issue(1, { body: "Spec: docs/specs/notes/spec.md\nKriterien: AC-1\n" })],
		["^issue view 2 ", issue(2, { body: "Spec: docs/specs/notes/spec.md\nKriterien: AC-1, AC-2, AC-9\n" })],
		["^issue view 3 ", issue(3, { body: "Spec: docs/specs/draft/spec.md\nKriterien: AC-1\n" })],
		["^issue view 4 ", issue(4, { body: "Spec: docs/specs/gone/spec.md\n" })],
		["^issue view 5 ", issue(5, { body: "Keine Spec.\n" })],
		["^api repos/o/r/issues/\\d+$", issueMeta(1)],
	]);
	const { json, stderr } = repo.factory("ready", "1", "2", "3", "4", "5");
	assert.ok(json, stderr);
	const [one, two, three, four, five] = json.issues;
	assert.equal(one.ready, true);
	assert.deepEqual(two.failures.map((failure) => failure.reason), ["AC-2 nicht in Spec", "AC-9 nicht in Spec"]);
	assert.equal(three.failures[0].reason, "Spec nicht freigegeben");
	assert.equal(four.failures[0].reason, "Spec nicht gemergt");
	assert.equal(five.draftSpec, true);
});

test("next returns the candidates in order and the tickets only blockers hold back", () => {
	const repo = makeRepo();
	repo.gh(readyRules([["^issue list", [issue(144), issue(143), issue(142)]]]));
	const { json } = repo.factory("next", "--bodies");
	assert.deepEqual(json.candidates.map((candidate) => candidate.number), [143, 142]);
	assert.ok(json.candidates[0].body);
	assert.deepEqual(json.blockedOnly.map((candidate) => candidate.number), []);
	assert.match(repo.calls().find((call) => call.startsWith("issue list")), /no:assignee -label:factory-in-progress sort:created-asc/);
});

test("claim, setup, check, cleanup: one job from worktree to nothing", () => {
	const repo = makeRepo();
	repo.gh([...BASE_GH, ["^issue view 142 --json labels", { labels: [{ name: "ready-for-agent" }] }], ["^issue edit", ""]]);
	const claim = repo.factory("claim", "search-filter-142", "--mode", "build", "--branch", "feat/search-filter-142", "--issues", "142");
	assert.equal(claim.json.claimed, true, claim.stdout + claim.stderr);
	const { worktree, scratch, base } = claim.json;
	assert.equal(worktree, join(repo.root, "work", "app-factory", "search-filter-142"));
	assert.ok(scratch.startsWith(join(repo.temp, "factory", "app-")));
	assert.match(claim.json.owner, /^[0-9a-f]{12}$/);
	assert.equal(claim.json.repo, "o/r");
	assert.deepEqual(claim.json.ci, { enabled: true, wait: 5, fixRounds: 1 });
	assert.ok(existsSync(join(scratch, "history")));
	assert.equal(base, git(repo.main, "rev-parse", "origin/main"));
	assert.equal(git(worktree, "branch", "--show-current"), "feat/search-filter-142");
	assert.match(claim.json.head, /^Job: search-filter-142\. Tickets: #142 in build order\. Worktree: .* Base: [0-9a-f]{40}\. Scratch: .* Agents: .*\.$/);
	assert.ok(repo.calls().includes("issue edit 142 --add-label factory-in-progress --add-assignee @me"));
	assert.ok(repo.calls().some((call) => call.startsWith("label create factory-in-progress")));

	const again = repo.factory("claim", "search-filter-142", "--mode", "build", "--branch", "feat/search-filter-142", "--issues", "142");
	assert.deepEqual([again.json.claimed, again.json.reason], [false, "läuft bereits (Worktree existiert)"]);

	assert.equal(repo.factory("setup", "search-filter-142").json.ok, true);

	write(join(worktree, "src", "filter.js"), "export const ok = 1;\n");
	git(worktree, "add", ".");
	git(worktree, "commit", "--quiet", "-m", "feat: filter");
	const round1 = repo.factory("check", "search-filter-142", "--round", "1").json;
	assert.equal(round1.pass, true);
	assert.equal(round1.prev, null);
	assert.deepEqual(round1.files, ["src/filter.js"]);
	assert.equal(round1.ui, false);
	const report = readFileSync(join(scratch, "check.md"), "utf8");
	assert.match(report, /^CHECK: PASS\n/);
	assert.match(report, new RegExp(`HEAD: ${round1.head}`));
	assert.match(report, /`node check\.mjs <files>`: pass/);

	write(join(worktree, "web", "page.js"), "BAD\n");
	git(worktree, "add", ".");
	git(worktree, "commit", "--quiet", "-m", "feat: page");
	const round2 = repo.factory("check", "search-filter-142", "--round", "2").json;
	assert.equal(round2.pass, false);
	assert.equal(round2.prev, round1.head);
	assert.deepEqual(round2.deltaFiles, ["web/page.js"]);
	assert.equal(round2.ui, true, "web/** is on the Preview paths");
	assert.deepEqual(round2.failed, ["node check.mjs <files>"]);
	assert.match(readFileSync(join(scratch, "check.md"), "utf8"), /BAD in web\/page\.js/);

	write(join(worktree, "web", "page.js"), "fine\n");
	const dirty = repo.factory("check", "search-filter-142", "--round", "2").json;
	assert.deepEqual(dirty.failed, ["git status --porcelain"]);
	const validate = repo.factory("check", "search-filter-142", "--section", "Validate").json;
	assert.equal(validate.pass, true, "Validate runs before the commit, a dirty tree is fine there");
	assert.ok(existsSync(join(scratch, "validate.md")));

	mkdirSync(claim.json.schemaLock, { recursive: true });
	writeFileSync(join(claim.json.schemaLock, "owner"), "search-filter-142\n");
	const foreign = repo.factory("cleanup", "search-filter-142");
	assert.equal(foreign.json.stop.reason, "Job gehört einer anderen Session");
	assert.ok(existsSync(worktree), "without the owner nothing is removed");
	const cleanup = repo.factory("cleanup", "search-filter-142", "--owner", claim.json.owner).json;
	assert.deepEqual(cleanup.removed, ["worktree", "branch feat/search-filter-142", "scratch", "schema lock"]);
	assert.ok(!existsSync(worktree));
	assert.ok(!existsSync(scratch));
	assert.equal(git(repo.main, "branch", "--list", "feat/search-filter-142"), "");
});

test("claim undoes the worktree when another session labeled the ticket, or skips it in a bundle", () => {
	const repo = makeRepo();
	repo.gh([
		...BASE_GH,
		["^issue view 142 --json labels", { labels: [{ name: "factory-in-progress" }] }],
		["^issue view 143 --json labels", { labels: [] }],
		["^issue edit", ""],
	]);
	const single = repo.factory("claim", "x-142", "--branch", "feat/x-142", "--issues", "142").json;
	assert.deepEqual([single.claimed, single.reason], [false, "läuft bereits (Label)"]);
	assert.ok(!existsSync(join(repo.root, "work", "app-factory", "x-142")));
	assert.equal(git(repo.main, "branch", "--list", "feat/x-142"), "");

	const bundle = repo.factory("claim", "x-142-143", "--branch", "feat/x-142-143", "--issues", "142,143").json;
	assert.deepEqual([bundle.claimed, bundle.reason], [false, "läuft bereits (Label #142)"]);
	const skipping = repo.factory("claim", "x-142-143", "--branch", "feat/x-142-143", "--issues", "142,143", "--skip-labeled").json;
	assert.equal(skipping.claimed, true);
	assert.deepEqual(skipping.issues, [143]);
	assert.deepEqual(skipping.dropped, [142]);
	assert.ok(!repo.calls().includes("issue edit 142 --add-label factory-in-progress --add-assignee @me"));
});

test("claim for a spec, a fix and a rework", () => {
	const repo = makeRepo();
	repo.gh(BASE_GH);
	const spec = repo.factory("claim", "spec-150", "--mode", "spec", "--issues", "150").json;
	assert.equal(spec.claimed, true);
	assert.equal(git(spec.worktree, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD");
	assert.match(spec.head, /^Job: spec-150\. Tickets: #150\. Worktree: .*\. Scratch: .*\. Skills: .*\.$/);
	assert.ok(!repo.calls().some((call) => call.startsWith("issue edit")));

	const fix = repo.factory("claim", "footer-typo", "--mode", "fix", "--branch", "fix/footer-typo", "--fix", "Tippfehler im Footer").json;
	assert.equal(fix.claimed, true);
	assert.match(fix.head, /Small fix: Tippfehler im Footer\./);

	write(join(fix.worktree, "a.txt"), "a\n");
	git(fix.worktree, "add", ".");
	git(fix.worktree, "commit", "--quiet", "-m", "fix: a");
	git(fix.worktree, "push", "--quiet", "origin", "fix/footer-typo");
	repo.factory("cleanup", "footer-typo", "--owner", fix.owner);
	const rework = repo.factory("claim", "footer-typo", "--mode", "rework", "--branch", "fix/footer-typo").json;
	assert.equal(rework.claimed, true, JSON.stringify(rework));
	assert.equal(rework.base, git(repo.main, "rev-parse", "origin/main"));
	assert.equal(git(rework.worktree, "log", "-1", "--format=%s"), "fix: a");

	const protectedBranch = repo.factory("claim", "x", "--branch", "main");
	assert.equal(protectedBranch.json.stop.reason, "main ist geschützt");
});

test("ci: green, red with the failed log, no checks", () => {
	const repo = makeRepo();
	const link = "https://github.com/o/r/actions/runs/55/job/77";
	repo.gh([
		["^pr checks 1 ", [{ name: "test", state: "SUCCESS", bucket: "pass", link, workflow: "CI" }]],
		["^pr checks 2 ", [{ name: "test", state: "FAILURE", bucket: "fail", link, workflow: "CI" }, { name: "lint", state: "SUCCESS", bucket: "pass", link, workflow: "CI" }], 1],
		["^run view --job 77 --log-failed", "test\tFAIL src/a.test.ts\nexpected 1 to be 2\n"],
		["^pr checks 3 ", "", 1, "no checks reported on the 'feat/x' branch"],
	]);
	assert.equal(repo.factory("ci", "1").json.state, "pass");
	const logs = join(repo.temp, "ci.md");
	const red = repo.factory("ci", "2", "--logs", logs).json;
	assert.equal(red.state, "fail");
	assert.deepEqual(red.failed, ["test"]);
	const text = readFileSync(logs, "utf8");
	assert.match(text, /^CI: FAIL/);
	assert.match(text, /## CI \/ test/);
	assert.match(text, /expected 1 to be 2/);
	assert.equal(repo.factory("ci", "3", "--grace", "0").json.state, "none");
	repo.gh([
		["^pr view 1 --json headRefOid", "old0\n"],
		["^pr checks 3 ", "", 1, "no checks reported on the 'feat/x' branch"],
		["^pr checks 1 ", [{ name: "test", state: "FAILURE", bucket: "fail", link, workflow: "CI" }]],
	]);
	const stale = repo.factory("ci", "1", "--sha", "new1", "--wait", "1", "--interval", "1").json;
	assert.equal(stale.state, "pending", "the checks of the commit before do not count");
	const waiting = repo.factory("ci", "3", "--grace", "60", "--wait", "1", "--interval", "1").json;
	assert.equal(waiting.state, "pending", "checks that are not registered yet are still pending");
});

test("close: tickets of a merged PR, their label, and the spec without open tickets", () => {
	const repo = makeRepo();
	repo.gh([
		...BASE_GH,
		["^pr view 512 ", { number: 512, state: "MERGED", baseRefName: "main", body: "x\n\nCloses #142\nCloses #143\n", headRefName: "feat/a-142-143", url: "pr512" }],
		["^pr view 513 ", { number: 513, state: "OPEN", baseRefName: "main", body: "Closes #150", headRefName: "feat/b-150", url: "pr513" }],
		["^issue view 142 --json state,labels,body", { state: "OPEN", labels: [{ name: "factory-in-progress" }], body: "## Parent\n#120\n" }],
		["^issue view 143 --json state,labels,body", { state: "CLOSED", labels: [{ name: "factory-in-progress" }], body: "" }],
		["^api repos/o/r/issues/142/parent", ...NOT_FOUND],
		["^api repos/o/r/issues/143/parent", "120"],
		["^issue view 120 --json state", { state: "OPEN" }],
		["^api --paginate repos/o/r/issues/120/sub_issues", "142\tclosed\n143\tclosed\n"],
		["^issue list --state open", [{ number: 160, body: "## Parent\n#999" }]],
		["^issue (close|edit)", ""],
	]);
	const { json, stderr } = repo.factory("close", "512", "513");
	assert.ok(json, stderr);
	assert.deepEqual(json.rows, [
		{ pr: 513, url: "pr513", closed: [], spec: "⛔ nicht gemergt" },
		{ pr: 512, url: "pr512", closed: [142], spec: "#120 geschlossen" },
	]);
	const calls = repo.calls();
	assert.ok(calls.includes("issue close 142 --reason completed --comment Umgesetzt in #512, gemergt in main."));
	assert.ok(!calls.some((call) => call.startsWith("issue close 143")));
	assert.ok(calls.includes("issue edit 142 --remove-label factory-in-progress"));
	assert.ok(calls.includes("issue edit 143 --remove-label factory-in-progress"));
	assert.ok(calls.includes("issue close 120 --reason completed --comment Alle Tickets erledigt: #142, #143. Geschlossen mit /factory close."));
});

test("close keeps a spec open while it has open tickets, and lists only PRs it changed", () => {
	const repo = makeRepo();
	repo.gh([
		...BASE_GH,
		[
			"^pr list --base main --state merged",
			[
				{ number: 600, body: "Closes #1", headRefName: "feat/a-1", url: "a" },
				{ number: 601, body: "Closes #2", headRefName: "feat/b-2", url: "b" },
				{ number: 602, body: "Closes #3", headRefName: "chore/c", url: "c" },
			],
		],
		["^issue view 1 --json state,labels,body", { state: "OPEN", labels: [], body: "" }],
		["^issue view 2 --json state,labels,body", { state: "CLOSED", labels: [], body: "" }],
		["^api repos/o/r/issues/1/parent", "120"],
		["^api repos/o/r/issues/2/parent", ...NOT_FOUND],
		["^issue view 120 --json state", { state: "OPEN" }],
		["^api --paginate repos/o/r/issues/120/sub_issues", "1\tclosed\n5\topen\n"],
		["^issue list --state open", []],
		["^issue (close|edit)", ""],
	]);
	const { json } = repo.factory("close");
	assert.deepEqual(json.rows, [{ pr: 600, url: "a", closed: [1], spec: "#120 offen: #5" }]);
	repo.gh([...BASE_GH, ["^pr list", []]]);
	assert.equal(repo.factory("close").json.nothing, true);
});

test("doctor finds leftovers and stale labels, --fix removes what is safe", () => {
	const repo = makeRepo();
	const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
	repo.gh([
		...BASE_GH,
		["^issue list --state open --label factory-in-progress", [{ number: 148, title: "x" }, { number: 149, title: "y" }, { number: 150, title: "z" }]],
		["^pr list --state all", [{ number: 700, state: "MERGED", body: "Closes #149", headRefName: "feat/y-149" }, { number: 701, state: "OPEN", body: "Closes #150", headRefName: "feat/z-150" }]],
		["^api --paginate repos/o/r/issues/148/events", `${old}\n`],
		["^issue edit 148 --remove-label", ""],
	]);
	const root = repo.factory("names", "x").json.root;
	mkdirSync(join(root, "gone-job-1"), { recursive: true });
	const report = repo.factory("doctor").json;
	const messages = report.checks.map((check) => `${check.level} ${check.area}: ${check.message}`);
	assert.ok(messages.includes("ok Config: alle Abschnitte da"), messages.join("\n"));
	assert.ok(messages.some((line) => /^warn Reste: Scratch gone-job-1 ohne Worktree/.test(line)));
	assert.ok(messages.some((line) => /^warn Labels: #148: Label factory-in-progress, kein PR, kein Branch, kein Worktree/.test(line)));
	assert.ok(messages.some((line) => /^warn Labels: #149: PR #700 gemergt/.test(line)));
	assert.ok(!messages.some((line) => line.includes("#150")), "a ticket with an open PR is busy");
	assert.equal(report.level, "warn");
	assert.ok(!repo.calls().some((call) => call.includes("--remove-label")), "no fix without --fix");

	const fixed = repo.factory("doctor", "--fix").json;
	assert.deepEqual(fixed.fixed.sort(), ["#148: Label factory-in-progress entfernt", "Scratch gone-job-1 entfernt"]);
	assert.ok(!existsSync(join(root, "gone-job-1")));
	assert.ok(repo.calls().includes("issue edit 148 --remove-label factory-in-progress"));
});

test("doctor reports a broken config and duplicate installs", () => {
	const repo = makeRepo({ config: "# Factory\n\n## Repository\n\n- Integration branch: `develop`\n\n## Check\n\n```bash\nprettier --write .\nno-such-tool-xyz run\n```\n" });
	repo.gh([...BASE_GH, ["^issue list", []], ["^pr list", []]]);
	write(join(repo.claude, "skills", "factory", "SKILL.md"), "x");
	write(join(repo.claude, "skills", "factory", ".claude-mods"), "claude-mods 1.0.0, copied");
	write(join(repo.main, ".claude", "skills", "factory", "SKILL.md"), "old");
	const report = repo.factory("doctor").json;
	const messages = report.checks.map((check) => `${check.level} ${check.message}`);
	assert.equal(report.level, "error");
	assert.ok(messages.some((line) => /^error Abschnitte fehlen: Setup, Validate, Schema/.test(line)), messages.join("\n"));
	assert.ok(messages.includes("error Integrationsbranch develop fehlt auf origin"));
	assert.ok(messages.includes("error ## Check schreibt Dateien (--write/--fix)"));
	// Other tools may be missing too (prettier on a bare CI runner): the unknown one must be among them.
	assert.ok(messages.some((line) => /nicht gefunden: .*no-such-tool-xyz/.test(line)), messages.join("\n"));
	assert.ok(messages.some((line) => line.startsWith("warn Doppelt installiert")));
});

test("stats sums the job's agents from their transcripts", () => {
	const repo = makeRepo();
	const scratch = repo.factory("names", "search-filter-142").json.scratch;
	write(join(scratch, "agents.md"), "builder 1 aaa\nsecurity 1 bbb\nbuilder 2 aaa\ncode 1 ccc\n");
	write(join(repo.claude, "projects", "p", "s", "subagents", "agent-aaa.jsonl"), transcriptLines());
	write(join(repo.claude, "projects", "p", "s", "subagents", "agent-bbb.jsonl"), transcriptLines());
	const { json } = repo.factory("stats", "search-filter-142");
	assert.equal(json.agents.length, 3);
	assert.deepEqual(json.agents[0].labels, ["builder 1", "builder 2"]);
	assert.equal(json.agents[2].found, false);
	assert.equal(json.total.totalTokens, 2 * 3 * 54200);
	assert.equal(json.total.toolCalls, 4);
	assert.match(json.line, /^4 min · 325 Tsd Tokens \(Cache 300 Tsd\) · 3 Agenten · 4 Tool-Aufrufe$/);
});

test("preview starts the config's server on a free port and stops it", async () => {
	const repo = makeRepo();
	repo.gh(BASE_GH);
	const claim = repo.factory("claim", "page-1", "--mode", "fix", "--branch", "fix/page-1").json;
	const started = repo.factory("preview", "start", "page-1").json;
	assert.equal(started.ok, true, JSON.stringify(started));
	const response = await fetch(started.url);
	assert.match(await response.text(), /Hallo/);
	assert.equal(repo.factory("preview", "stop", "page-1").json.stopped, true);
	await new Promise((done) => setTimeout(done, 300));
	await assert.rejects(fetch(started.url));
	assert.ok(claim.claimed);
	repo.factory("cleanup", "page-1", "--force");
});

const playwright = (() => {
	try {
		return createRequire(import.meta.url)("playwright");
	} catch {
		return null;
	}
})();

test("screenshot takes a PNG and reports console errors", { skip: playwright ? false : "Playwright not installed" }, async () => {
	const repo = makeRepo();
	const server = createServer((request, response) => {
		response.setHeader("content-type", "text/html");
		response.end("<!doctype html><title>T</title><script>console.error('boom')</script><p>x</p>");
	});
	await new Promise((done) => server.listen(0, "127.0.0.1", done));
	try {
		const file = join(repo.temp, "shot.png");
		// Async: the server lives in this process and must keep answering while factory.mjs runs.
		const child = spawn(process.execPath, [join(SCRIPTS, "factory.mjs"), "screenshot", `http://127.0.0.1:${server.address().port}/`, file, "--mobile"], { cwd: repo.main, env: repo.env });
		let stdout = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		await new Promise((done) => child.on("close", done));
		const json = JSON.parse(stdout);
		assert.equal(json.ok, true, stdout);
		assert.equal(json.status, 200);
		assert.deepEqual(json.consoleErrors, ["boom"]);
		assert.equal(readFileSync(file).subarray(1, 4).toString(), "PNG");
	} finally {
		server.close();
	}
});

test("check: paths with umlauts and spaces reach the commands, a UI review with CHANGES runs again", () => {
	const repo = makeRepo();
	repo.gh([...BASE_GH, ["^issue view 7 --json labels", { labels: [] }], ["^issue edit", ""]]);
	const claim = repo.factory("claim", "page-7", "--branch", "feat/page-7", "--issues", "7").json;
	write(join(claim.worktree, "web", "Übersicht", "a b.js"), "BAD\n");
	git(claim.worktree, "add", ".");
	git(claim.worktree, "commit", "--quiet", "-m", "feat: page");
	const round1 = repo.factory("check", "page-7", "--round", "1").json;
	assert.deepEqual(round1.files, ["web/Übersicht/a b.js"]);
	assert.equal(round1.ui, true);
	assert.equal(round1.pass, false, "the check saw the file and its BAD");
	write(join(claim.worktree, "web", "Übersicht", "a b.js"), "fine\n");
	git(claim.worktree, "commit", "--quiet", "-am", "fix: page");
	repo.factory("check", "page-7", "--round", "1");
	writeFileSync(join(claim.scratch, "review-ui.md"), "VERDICT: CHANGES\n");
	write(join(claim.worktree, "lib", "i18n.js"), "x\n");
	git(claim.worktree, "add", ".");
	git(claim.worktree, "commit", "--quiet", "-m", "fix: copy");
	const round2 = repo.factory("check", "page-7", "--round", "2").json;
	assert.deepEqual(round2.deltaFiles, ["lib/i18n.js"]);
	assert.equal(round2.ui, true, "the open UI finding is checked again");
	writeFileSync(join(claim.scratch, "review-ui.md"), "VERDICT: PASS\n");
	write(join(claim.worktree, "lib", "i18n.js"), "y\n");
	git(claim.worktree, "commit", "--quiet", "-am", "fix: copy 2");
	assert.equal(repo.factory("check", "page-7", "--round", "3").json.ui, false);
});

test("doctor --fix keeps a worktree whose commits are not on origin", () => {
	const repo = makeRepo();
	repo.gh([...BASE_GH, ["^issue list", []], ["^pr list", []], ["^issue view 9 --json labels", { labels: [] }], ["^issue edit", ""]]);
	const pushed = repo.factory("claim", "a-9", "--branch", "feat/a-9", "--issues", "9").json;
	const local = repo.factory("claim", "b-9", "--branch", "feat/b-9", "--issues", "9").json;
	for (const tree of [pushed, local]) {
		write(join(tree.worktree, `${tree.job}.txt`), "x\n");
		git(tree.worktree, "add", ".");
		git(tree.worktree, "commit", "--quiet", "-m", "feat: x");
	}
	git(pushed.worktree, "push", "--quiet", "origin", "feat/a-9");
	git(local.worktree, "push", "--quiet", "origin", "feat/b-9");
	write(join(local.worktree, "more.txt"), "y\n");
	git(local.worktree, "add", ".");
	git(local.worktree, "commit", "--quiet", "-m", "feat: not pushed");
	const report = repo.factory("doctor", "--fix", "--stale-hours", "0").json;
	assert.ok(report.fixed.includes("Worktree a-9 entfernt"), JSON.stringify(report.fixed));
	assert.ok(!existsSync(pushed.worktree));
	assert.ok(existsSync(local.worktree), "unpushed commits stay");
	assert.ok(report.checks.some((check) => check.message.startsWith("Worktree b-9") && check.message.includes("Branch nicht gepusht")));
});

test("doctor reports the template's unfilled placeholders", () => {
	const repo = makeRepo({ config: readFileSync(join(import.meta.dirname, "..", "skills", "factory", "config.md"), "utf8") });
	repo.gh([...BASE_GH, ["^issue list", []], ["^pr list", []]]);
	const messages = repo.factory("doctor").json.checks.map((check) => `${check.level} ${check.message}`);
	for (const section of ["Setup", "Validate", "Check"]) assert.ok(messages.includes(`error ## ${section}: Platzhalter <…> nicht ausgefüllt`), section);
	assert.ok(messages.some((line) => line.startsWith("warn Platzhalter <…> in ## ") && line.includes("Security")), messages.join("\n"));
});

test("close writes its comments in the repo's language", () => {
	const repo = makeRepo({ config: CONFIG.replace("- Protected branches: `main`", "- Protected branches: `main`\n- Language: `en`") });
	repo.gh([
		...BASE_GH,
		["^pr view 512 ", { number: 512, state: "MERGED", baseRefName: "main", body: "Closes #142\n", headRefName: "feat/a-142", url: "pr512" }],
		["^issue view 142 --json state,labels,body", { state: "OPEN", labels: [], body: "" }],
		["^api repos/o/r/issues/142/parent", ...NOT_FOUND],
		["^issue close", ""],
	]);
	repo.factory("close", "512");
	assert.ok(repo.calls().includes("issue close 142 --reason completed --comment Implemented in #512, merged into main."));
});

test("grill: the preflight without tickets, and a claim that carries the brief", () => {
	const repo = makeRepo();
	repo.gh(BASE_GH);
	const preflight = repo.factory("ready").json;
	assert.equal(preflight.ok, true);
	assert.deepEqual(preflight.issues, []);
	assert.equal(preflight.language, "de");
	const root = repo.factory("names", "csv-import").json.root;
	const draft = join(root, "csv-import.brief.md");
	write(draft, "# Auftrag: CSV-Import\n\n## Akzeptanzkriterien\n\n1. Import geht\n");
	const claim = repo.factory("claim", "csv-import", "--mode", "brief", "--branch", "feat/csv-import", "--brief", draft).json;
	assert.equal(claim.claimed, true, JSON.stringify(claim));
	assert.equal(claim.brief, join(claim.scratch, "brief.md"));
	assert.match(readFileSync(claim.brief, "utf8"), /CSV-Import/);
	assert.ok(!existsSync(draft), "the claim moves the brief into the scratch folder");
	assert.match(claim.head, new RegExp(`^Job: csv-import\\. Brief: ${claim.brief.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(no ticket`));
	assert.ok(!repo.calls().some((call) => call.startsWith("issue edit")), "no ticket, no label");
	assert.equal(repo.factory("claim", "x", "--mode", "brief", "--branch", "feat/x").code, 2, "a brief claim needs its file");
});
