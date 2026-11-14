#!/usr/bin/env node
// Lists every page of a site: sitemap.xml (and sitemap indexes) plus internal links of the start page,
// grouped by template (first path segment, or "article" for long single-segment slugs).
// Prints TSV: group<TAB>url, sorted by group. Pages missing from the sitemap are marked "+link".
//
//   node discover.mjs <origin>            e.g. https://example.com
//   node discover.mjs <origin> --links    also follow internal links of every sitemap page (slower)
import { chromium } from "playwright";

const [origin, flag] = process.argv.slice(2);
if (!origin) {
	console.error("usage: node discover.mjs <origin> [--links]");
	process.exit(2);
}
const base = new URL(origin);

async function sitemap(url, seen = new Set()) {
	if (seen.has(url)) return [];
	seen.add(url);
	const res = await fetch(url, { redirect: "follow" }).catch(() => null);
	if (!res || !res.ok) return [];
	const xml = await res.text();
	const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
	if (/<sitemapindex/i.test(xml)) return (await Promise.all(locs.map((l) => sitemap(l, seen)))).flat();
	return locs;
}

function norm(u) {
	const x = new URL(u, base);
	x.hash = "";
	x.search = "";
	return x.href.replace(/\/$/, "");
}
function group(u) {
	const parts = new URL(u).pathname.split("/").filter(Boolean);
	if (parts.length === 0) return "home";
	if (parts.length === 1 && parts[0].split("-").length >= 4) return "article";
	return parts.length > 1 ? `${parts[0]}/*` : parts[0];
}

const fromSitemap = new Set((await sitemap(new URL("/sitemap.xml", base).href)).map(norm));
const robots = await fetch(new URL("/robots.txt", base)).then((r) => (r.ok ? r.text() : "")).catch(() => "");
for (const m of robots.matchAll(/^sitemap:\s*(\S+)/gim)) for (const u of await sitemap(m[1])) fromSitemap.add(norm(u));

const browser = await chromium.launch();
const page = await browser.newPage();
const linked = new Set();
const toVisit = flag === "--links" ? [base.href, ...fromSitemap] : [base.href];
for (const u of toVisit) {
	try {
		await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
		const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
		for (const h of hrefs) {
			const x = new URL(h);
			if (x.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && !/\.(pdf|jpe?g|png|svg|zip)$/i.test(x.pathname)) linked.add(norm(h));
		}
	} catch {}
}
await browser.close();

const all = new Map();
for (const u of fromSitemap) all.set(u, "");
for (const u of linked) if (!all.has(u)) all.set(u, "+link");
const rows = [...all].map(([u, mark]) => [group(u), u, mark]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
for (const [g, u, mark] of rows) console.log(`${g}\t${u}${mark ? `\t${mark}` : ""}`);
console.error(`${rows.length} pages (${fromSitemap.size} in sitemap, ${rows.filter((r) => r[2]).length} only via links)`);
