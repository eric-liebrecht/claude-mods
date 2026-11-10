import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	agentDrift,
	backtickList,
	blockedByLines,
	closesLines,
	commandHeads,
	criteriaLine,
	criterionState,
	factoryVersion,
	fillCommand,
	formatDuration,
	formatTokens,
	globToRegExp,
	hasCriteria,
	headSentence,
	isReleased,
	isSpec,
	jobNumbers,
	jobPaths,
	matchesAny,
	parentFromBody,
	parseConfig,
	REQUIRED_HEADINGS,
	sections,
	shellQuote,
	SPEC_LINES,
	specLine,
	specReleased,
	specStatus,
	stripMarker,
	usageOf,
	validDate,
} from "../skills/factory/scripts/lib.mjs";
import { ROOT, tempDir, VERSION } from "./helpers.mjs";

const TEMPLATE = readFileSync(join(ROOT, "skills", "factory", "config.md"), "utf8");

test("the config template has every heading the factory looks up and parses to its defaults", () => {
	const config = parseConfig(TEMPLATE);
	for (const heading of REQUIRED_HEADINGS) assert.ok(config.headings.includes(heading), heading);
	assert.equal(config.integration, "main");
	assert.deepEqual(config.protected, ["main"]);
	assert.deepEqual(config.setup, ["pnpm install --frozen-lockfile"]);
	assert.deepEqual(config.check, ["pnpm exec prettier --check <files>", "pnpm lint && pnpm check-types && pnpm test"]);
	assert.equal(config.validate.length, 2);
	for (const name of SPEC_LINES) assert.ok(config.specs.has(name), `Specs: ${name}`);
	assert.equal(config.preview.start, "pnpm --filter web dev --port <port>");
	assert.equal(config.preview.url, "http://localhost:<port>/");
	assert.deepEqual(config.preview.paths, ["apps/web/**", "packages/ui/**"]);
	assert.equal(config.preview.timeout, 120);
	assert.deepEqual(config.ci, { enabled: true, wait: 20, fixRounds: 1 });
});

test("optional sections: absent or None. turn them off", () => {
	const base = "## Repository\n\n- Integration branch: `develop`\n- Protected branches: `main`, `develop`\n";
	const plain = parseConfig(base);
	assert.equal(plain.integration, "develop");
	assert.deepEqual(plain.protected, ["main", "develop"]);
	assert.equal(plain.specs, null);
	assert.equal(plain.preview, null);
	assert.deepEqual(plain.ci, { enabled: true, wait: 20, fixRounds: 1 });
	const none = parseConfig(`${base}\n## Preview\n\nNone.\n\n## CI\n\nNone.\n`);
	assert.equal(none.preview, null);
	assert.equal(none.ci.enabled, false);
});

test("sections ignores headings inside code fences", () => {
	const result = sections("## A\n\n```md\n## Not a heading\n```\n\n## B\ntext\n");
	assert.deepEqual([...result.keys()], ["A", "B"]);
	assert.equal(result.get("B"), "text");
	assert.deepEqual(backtickList("`a`, `b` and `c`"), ["a", "b", "c"]);
});

test("Freigabe: only a name and a real date release a spec", () => {
	const block = (line) => `## Freigabe\n\n- Entwurf: Factory, 2026-10-01\n- ${line}\n\n## Problem Statement\n`;
	assert.equal(isReleased(block("Freigegeben von: Erika Muster [2026-10-24]")), true);
	assert.equal(isReleased(block("Freigegeben von: Name [JJJJ-MM-TT]")), false);
	assert.equal(isReleased(block("Freigegeben von: Name [2026-10-24]")), false);
	assert.equal(isReleased(block("Freigegeben von: Erika [2026-02-30]")), false);
	assert.equal(isReleased(block("Freigegeben von: Erika [JJJJ-MM-TT]")), false);
	assert.equal(isReleased("Status: freigegeben (2026-10-24)\n"), true);
	assert.equal(isReleased("Status: entwurf\n"), false);
	assert.equal(isReleased(`${block("Freigegeben von: Name [JJJJ-MM-TT]")}\nStatus: freigegeben (2026-10-24)`), false);
	assert.equal(validDate("2026-02-29"), false);
	assert.equal(validDate("2028-02-29"), true);
});

test("a spec is told from a ticket", () => {
	assert.equal(isSpec("## Freigabe\n"), true);
	assert.equal(isSpec("## User Stories\n"), true);
	assert.equal(isSpec("Status: entwurf\n"), true);
	assert.equal(isSpec("## Acceptance criteria\n- [ ] x", 2), true);
	assert.equal(isSpec("## Acceptance criteria\n- [ ] x"), false);
});

test("ticket bodies: parent, blockers, closes, criteria", () => {
	assert.equal(parentFromBody("## Parent\n\n#120\n\n## What\n#999"), 120);
	assert.equal(parentFromBody("no parent #5"), null);
	assert.deepEqual(blockedByLines("Blocked by: #3, #4\n- Blocked by: #4 #9"), [3, 4, 9]);
	assert.deepEqual(closesLines("x\nCloses #142\ncloses #143\nCloses #142\nnot Closes #1 inline"), [142, 143]);
	assert.equal(hasCriteria("## Akzeptanzkriterien\n\nEs geht."), true);
	assert.equal(hasCriteria("- [ ] filter works"), true);
	assert.equal(hasCriteria("Bitte bauen."), false);
});

test("specs in the repo: Spec, Kriterien and status lines", () => {
	const body = "Text\n\nSpec: docs/specs/task-notes/spec.md\nKriterien: AC-1, AC-3\n";
	assert.equal(specLine(body), "docs/specs/task-notes/spec.md");
	assert.deepEqual(criteriaLine(body), ["AC-1", "AC-3"]);
	assert.equal(criteriaLine("nothing"), null);
	const spec = "# Spec: Notizen\n\nStatus: freigegeben (2026-10-01, Eric)\n\n- AC-1: geht\n- AC-3: entfällt\n- AC-30: auch\n";
	assert.equal(specStatus(spec), "freigegeben");
	assert.equal(specReleased(spec), true);
	assert.equal(specReleased("Status: entwurf"), false);
	assert.equal(criterionState(spec, "AC-1"), "ok");
	assert.equal(criterionState(spec, "AC-3"), "dropped");
	assert.equal(criterionState(spec, "AC-2"), "missing");
	assert.equal(criterionState(spec, "AC-30"), "ok");
});

test("names of a job", () => {
	assert.deepEqual(jobNumbers("review-filters-142-143-147"), [142, 143, 147]);
	assert.deepEqual(jobNumbers("rating-filter-142"), [142]);
	assert.deepEqual(jobNumbers("typo"), []);
	const paths = jobPaths("/w/app", "rating-filter-142", "/t");
	assert.equal(paths.worktree, "/w/app-factory/rating-filter-142");
	assert.equal(paths.scratch, "/t/factory/app/rating-filter-142");
	assert.equal(paths.schemaLock, "/t/factory/app/.schema-lock");
	assert.equal(
		headSentence({ job: "j-1", issues: [1, 2], worktree: "/w", branch: "feat/j-1", base: "abc", scratch: "/s", schemaLock: "/l", skills: "/k", agents: "/a" }),
		"Job: j-1. Tickets: #1, #2 in build order. Worktree: /w. Branch: feat/j-1. Base: abc. Scratch: /s. Schema lock: /l. Skills: /k. Agents: /a.",
	);
	assert.match(headSentence({ job: "typo", fix: "Tippfehler im Footer", worktree: "/w" }), /^Job: typo\. Small fix: Tippfehler im Footer\. Worktree/);
});

test("globs decide which changes need a UI review", () => {
	assert.ok(globToRegExp("apps/web/**").test("apps/web/src/page.tsx"));
	assert.ok(!globToRegExp("apps/web/**").test("apps/api/main.ts"));
	assert.ok(globToRegExp("**/*.tsx").test("a/b/c.tsx"));
	assert.ok(globToRegExp("**/*.tsx").test("c.tsx"));
	assert.ok(globToRegExp("src/").test("src/x/y.ts"));
	assert.ok(globToRegExp("packages/ui").test("packages/ui/button.tsx"));
	assert.ok(!globToRegExp("packages/ui").test("packages/uikit/button.tsx"));
	assert.equal(matchesAny(["apps/api/x.ts"], ["apps/web/**"]), false);
	assert.equal(matchesAny(["apps/web/x.ts"], ["apps/web/**", "x"]), true);
	assert.equal(matchesAny(["a"], []), true);
	assert.equal(matchesAny([], []), false);
});

test("commands get their placeholders filled and quoted", () => {
	assert.equal(fillCommand("prettier --check <files>", { files: ["a b.ts", "c.ts"] }, false), "prettier --check 'a b.ts' c.ts");
	assert.equal(fillCommand("git diff <base>", { base: "abc" }, false), "git diff abc");
	assert.equal(fillCommand("dev --port <port> <keep>", { port: 4000 }, false), "dev --port 4000 <keep>");
	assert.equal(shellQuote("it's", false), "'it'\\''s'");
	assert.equal(shellQuote('a"b', true), '"a""b"');
	assert.deepEqual(commandHeads("pnpm lint && FOO=1 pnpm test | tee x; cd a && make"), ["pnpm", "pnpm", "tee", "make"]);
});

test("usage of a transcript counts a streamed message once", () => {
	const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 };
	const entries = [
		{ type: "user", timestamp: "2026-11-10T10:00:00Z", message: { content: "go" } },
		{ type: "assistant", timestamp: "2026-11-10T10:00:10Z", message: { id: "m1", model: "m", usage, content: [{ type: "text", text: "a" }] } },
		{ type: "assistant", timestamp: "2026-11-10T10:00:11Z", message: { id: "m1", model: "m", usage, content: [{ type: "tool_use", name: "Bash", input: {} }] } },
		{ type: "assistant", timestamp: "2026-11-10T10:02:00Z", message: { id: "m2", model: "m", usage, content: [{ type: "tool_use", name: "Read", input: {} }] } },
	];
	const result = usageOf(entries);
	assert.equal(result.durationMs, 120000);
	assert.deepEqual(result.tokens, { input: 20, output: 10, cacheRead: 200, cacheWrite: 40 });
	assert.equal(result.totalTokens, 270);
	assert.equal(result.toolCalls, 2);
	assert.deepEqual(result.models, ["m"]);
	assert.equal(formatDuration(40000), "40 s");
	assert.equal(formatDuration(38 * 60000), "38 min");
	assert.equal(formatDuration(65 * 60000), "1 h 05 min");
	assert.equal(formatTokens(2_140_000), "2,1 Mio");
	assert.equal(formatTokens(850_400), "850 Tsd");
	assert.equal(formatTokens(900), "900");
});

test("version of the factory: from the checkout, from a copy's marker, or unknown", () => {
	assert.deepEqual(
		{ ...factoryVersion(join(ROOT, "skills", "factory")), checkout: undefined },
		{ version: VERSION, source: "checkout", checkout: undefined },
	);
	const dir = tempDir();
	const copy = join(dir, "skills", "factory");
	mkdirSync(copy, { recursive: true });
	writeFileSync(join(copy, ".claude-mods"), "claude-mods 9.8.7, copied from /x by install.mjs; run it again to update.\n");
	assert.deepEqual(factoryVersion(copy), { version: "9.8.7", source: "copy" });
	const bare = join(dir, "bare", "factory");
	mkdirSync(bare, { recursive: true });
	assert.deepEqual(factoryVersion(bare), { version: null, source: "unknown" });
	assert.equal(factoryVersion(join(dir, "missing")).source, "missing");
	const link = join(dir, "linked");
	symlinkSync(join(ROOT, "skills", "factory"), link);
	assert.equal(factoryVersion(link).version, VERSION);
});

test("agent drift: the install marker is ignored, a changed text is not", () => {
	const dir = tempDir();
	const source = join(dir, "source");
	const installed = join(dir, "agents");
	mkdirSync(source);
	mkdirSync(installed);
	writeFileSync(join(source, "builder.md"), "# Builder\n\ntext\n");
	writeFileSync(join(source, "retro.md"), "# Retro\n");
	writeFileSync(join(source, "spec-writer.md"), "# Spec\n");
	writeFileSync(join(installed, "builder.md"), "# Builder\n\ntext\n\n<!-- .claude-mods 1.4.0 -->\n");
	writeFileSync(join(installed, "retro.md"), "# Retro, old\n\n<!-- .claude-mods -->\n");
	assert.equal(stripMarker("a\n\n<!-- .claude-mods 1.4.0 -->\n"), "a");
	assert.deepEqual(agentDrift(source, installed), [
		{ name: "builder", state: "ok" },
		{ name: "retro", state: "differs" },
		{ name: "spec-writer", state: "missing" },
	]);
});
