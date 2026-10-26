#!/usr/bin/env node
// Condenses Claude Code agent transcripts for the factory retro: prompts and texts in full (capped), every tool call
// as one line, tool results only as their size, or their text when they failed.
//
//   node transcript.mjs <agent id | path to .jsonl> … [--max <chars per transcript>]
//
// An agent id is looked up as `agent-<id>.jsonl` under `$CLAUDE_CONFIG_DIR/projects` (default `~/.claude/projects`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const maxIndex = args.indexOf("--max");
const max = maxIndex === -1 ? 60000 : Number(args.splice(maxIndex, 2)[1]);
if (args.length === 0) {
	console.error("usage: transcript.mjs <agent id | path.jsonl> … [--max <chars>]");
	process.exit(1);
}

const PROJECTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");

/** Finds `agent-<id>.jsonl` in any project and session below PROJECTS. */
function findTranscript(id) {
	const name = `agent-${id}.jsonl`;
	const walk = (dir, depth) => {
		if (depth > 4 || !existsSync(dir)) return null;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isFile() && entry.name === name) return path;
			if (entry.isDirectory()) {
				const found = walk(path, depth + 1);
				if (found) return found;
			}
		}
		return null;
	};
	return walk(PROJECTS, 0);
}

const cap = (text, limit) => (text.length > limit ? `${text.slice(0, limit)} …[+${text.length - limit}]` : text);
const oneLine = (text) => text.replace(/\s+/g, " ").trim();

function resultText(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content))
		return content.map((part) => (part.type === "text" ? part.text : `[${part.type}]`)).join("\n");
	return "";
}

/** The part of a tool input that says what the call did. */
function inputSummary(input = {}) {
	const keys = [
		"command",
		"file_path",
		"pattern",
		"path",
		"skill",
		"description",
		"subagent_type",
		"to",
		"url",
		"query",
	];
	const parts = keys.filter((key) => input[key] !== undefined).map((key) => `${key}=${oneLine(String(input[key]))}`);
	if (input.old_string !== undefined)
		parts.push(`edit ${String(input.old_string).length}→${String(input.new_string ?? "").length} chars`);
	if (input.content !== undefined) parts.push(`${String(input.content).length} chars`);
	return cap(parts.join(" "), 300);
}

function condense(path) {
	const lines = [];
	let calls = 0;
	let errors = 0;
	let resultChars = 0;
	for (const raw of readFileSync(path, "utf8").split("\n")) {
		if (!raw.trim()) continue;
		let entry;
		try {
			entry = JSON.parse(raw);
		} catch {
			continue;
		}
		const message = entry.message;
		if (!message || entry.isMeta) continue;
		const content =
			typeof message.content === "string" ? [{ type: "text", text: message.content }] : (message.content ?? []);
		for (const block of content) {
			if (entry.type === "user" && block.type === "text") lines.push(`USER: ${cap(block.text, 4000)}`);
			else if (entry.type === "assistant" && block.type === "text" && block.text.trim())
				lines.push(`AGENT: ${cap(block.text, 2000)}`);
			else if (block.type === "tool_use") {
				calls += 1;
				lines.push(`→ ${block.name} ${inputSummary(block.input)}`);
			} else if (block.type === "tool_result") {
				const text = resultText(block.content);
				resultChars += text.length;
				if (block.is_error || /^(Error|error:|fatal:|Exit code [1-9])/m.test(text.slice(0, 400))) {
					errors += 1;
					lines.push(`← ERROR ${cap(oneLine(text), 600)}`);
				} else {
					lines.push(`← ok ${text.length} chars`);
				}
			}
		}
	}
	let body = lines.join("\n");
	if (body.length > max) {
		const head = body.slice(0, Math.floor(max * 0.4));
		const tail = body.slice(body.length - Math.floor(max * 0.6));
		body = `${head}\n…[${body.length - max} chars of the middle left out]…\n${tail}`;
	}
	return `Tool calls: ${calls}, failed: ${errors}, tool result chars: ${resultChars}\n\n${body}`;
}

for (const arg of args) {
	const path = arg.endsWith(".jsonl") ? arg : findTranscript(arg);
	console.log(`# Transcript ${arg}\n`);
	console.log(path && existsSync(path) ? condense(path) : "Not found.");
	console.log("");
}
