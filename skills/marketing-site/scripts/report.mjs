#!/usr/bin/env node
// Summarises a capture folder as a Markdown table plus site-wide findings the rules check mechanically:
// title/description length, H1 count, schema types, first conversion CTA position, CTA labels, images without
// alt, duplicate og:title, mobile first screen, sticky CTA, third-party requests before consent, reveal-hidden
// sections, broken JSON-LD.
//
//   node report.mjs <capturedir> [--cta "Exact primary CTA label"]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const ctaLabel = process.argv.includes("--cta") ? process.argv[process.argv.indexOf("--cta") + 1] : null;
if (!dir) {
	console.error('usage: node report.mjs <capturedir> [--cta "label"]');
	process.exit(2);
}
const pages = readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), "utf8")) }));

const noise = /cookie|ablehnen|akzeptieren|einstellungen|zum inhalt|mehr lesen|menü|menu|schließen/i;
const rows = [];
const findings = [];
const og = new Map();
for (const p of pages) {
	const path = p.url.startsWith("file:") ? p.url.split("/").pop() : p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
	// a CTA is a short one-line button; cards and option tiles are links with several lines
	const ctas = p.ctas.filter((c) => !noise.test(c.text) && c.y > 90 && (c.lines ?? 1) === 1 && c.text.length <= 45);
	const labels = [...new Set(ctas.filter((c) => c.style === "filled").map((c) => c.text.replace(/\s*[→↓]\s*$/, "")))];
	const first = ctas.find((c) => c.style === "filled" && !/↓/.test(c.text) && (c.submit || (c.href && (!c.href.startsWith("#") || c.href.startsWith("#/")))));
	const h1 = p.headings.filter((h) => h.tag === "H1");
	rows.push(`| ${path} | ${p.title.length} | ${(p.description || "").length} | ${h1.length} | ${p.schemaTypes.join(", ") || "–"} | ${first ? `${first.pct} %` : "none"} | ${labels.slice(0, 2).join(" / ") || "–"} | ${p.wordCount} |`);
	if (p.ogTitle) og.set(p.ogTitle, [...(og.get(p.ogTitle) || []), path]);
	const add = (rule, msg) => findings.push(`- [${rule}] ${path}: ${msg}`);
	if (p.title.length > 60) add("seo-title", `title ${p.title.length} chars`);
	if (!p.description) add("seo-meta", "no meta description");
	else if (p.description.length > 160 || p.description.length < 110) add("seo-meta", `description ${p.description.length} chars`);
	if (h1.length !== 1) add("seo-h1", `${h1.length} H1`);
	if (p.jsonld.includes("INVALID JSON-LD")) add("seo-schema", "invalid JSON-LD");
	const skipCta = p.kind === "legal" || p.kind === "funnel";
	if (skipCta) {
		// legal pages are plain, funnel pages are bare: no CTA, sticky or hero checks
	} else if (!first) add("arch-cta-rhythm", "no conversion CTA on the page (scroll buttons do not count)");
	// a CTA in the first desktop screen passes, however short the page
	else if (first.pct > 25 && first.y > 900) add("arch-cta-rhythm", `first conversion CTA at ${first.pct} % of the page`);
	if (ctaLabel && !skipCta && !ctas.some((c) => c.text.includes(ctaLabel))) add("cta-one", `primary label "${ctaLabel}" missing`);
	const noAlt = p.images.filter((i) => !i.alt).length;
	if (noAlt) add("seo-alt", `${noAlt} images without alt`);
	if (p.hiddenUntilScroll) add("design-motion", `${p.hiddenUntilScroll} sections invisible until scrolled (opacity 0)`);
	if (p.thirdPartyBeforeConsent?.length) add("legal-consent", `third-party requests before consent: ${p.thirdPartyBeforeConsent.join(", ")}`);
	if (!skipCta && p.mobileFirstScreen && !p.mobileFirstScreen.primaryCtaVisible) add("hero-mobile", "no primary CTA in the mobile first screen");
	if (p.mobileFirstScreen && !p.mobileFirstScreen.h1Visible) add("hero-mobile", "H1 not in the mobile first screen");
	if (p.mobileOverlayCoverage > 35) add("mobile-consent", `fixed overlay covers ${p.mobileOverlayCoverage} % of the mobile first screen before any click`);
	if (p.mobileOverlayCoverage > 35 && p.mobileConsentRejectable === false) add("legal-consent", "overlay without a reject button on the first screen (hidden for the screenshots)");
	if (p.desktopShots?.truncated || p.mobileShots?.truncated) add("capture", "screenshots stop before the page end: re-run with a higher --max-slices");
	if (!skipCta && p.mobileStickyAfterScroll && !p.mobileStickyAfterScroll.some((t) => t.length > 3)) add("mobile-sticky", "no sticky CTA after scrolling on mobile");
	if (p.robots && /noindex/.test(p.robots)) add("seo-index", `robots: ${p.robots}`);
}
for (const [title, paths] of og) if (paths.length > 2) findings.push(`- [seo-og] og:title "${title.slice(0, 60)}" shared by ${paths.length} pages`);

console.log(`# Capture report: ${pages.length} pages\n`);
console.log("| Page | Title | Desc | H1 | Schema | First CTA | Primary CTA labels | Words |\n|---|---|---|---|---|---|---|---|");
console.log(rows.sort().join("\n"));
const allLabels = new Set(pages.flatMap((p) => p.ctas.filter((c) => c.style === "filled" && !noise.test(c.text) && (c.lines ?? 1) === 1 && c.text.length <= 45).map((c) => c.text.replace(/\s*[→↓]\s*$/, ""))));
console.log(`\n**Distinct filled-button labels site-wide (${allLabels.size}):** ${[...allLabels].slice(0, 25).join(" · ")}\n`);
console.log(`## Mechanical findings (${findings.length})\n`);
console.log(findings.join("\n") || "none");
