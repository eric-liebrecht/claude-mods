#!/usr/bin/env node
// Builds the single-file HTML draft: replaces <style data-inline="site.css"></style> and
// <script data-inline="draft.js"></script> in the source with assets/site.css and assets/draft.js.
// The output has no local dependencies (fonts load from Google Fonts with a system fallback).
//
//   node assemble-draft.mjs <source.html> <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
	console.error("usage: node assemble-draft.mjs <source.html> <out.html>");
	process.exit(2);
}
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const inline = {
	"site.css": (s) => `<style>\n${s}\n</style>`,
	"draft.js": (s) => `<script>\n${s}\n</script>`,
};
let html = readFileSync(src, "utf8");
let count = 0;
html = html.replace(/<(style|script) data-inline="([\w.]+)"><\/\1>/g, (tag, _kind, name) => {
	if (!inline[name]) return tag;
	count++;
	// a function replacer keeps "$" in the inlined code literal
	return inline[name](readFileSync(join(assets, name), "utf8"));
});
if (count !== 2) {
	console.error(`expected 2 data-inline tags (site.css, draft.js), found ${count}`);
	process.exit(1);
}
const json = html.match(/<script type="application\/json" id="funnel-config">([\s\S]*?)<\/script>/);
if (json) {
	try {
		JSON.parse(json[1]);
	} catch (err) {
		console.error(`funnel-config is not valid JSON: ${err.message}`);
		process.exit(1);
	}
}
writeFileSync(out, html);
console.log(`${out}: ${Math.round(html.length / 1024)} KB, ${(html.match(/<main[^>]*data-page="/g) || []).length} pages`);
