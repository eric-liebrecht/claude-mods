#!/usr/bin/env node
// Captures pages for review: structured data (JSON) always, screenshots with --shots.
// Screenshots are taken viewport by viewport while scrolling, so scroll-reveal content is visible,
// after rejecting the consent banner; an overlay without a reject button is measured, then hidden for the
// remaining screenshots (overlayForceHidden). Per page <slug>:
//   <slug>.json                 title, meta, headings, CTAs (text, href, y, % of height), forms, schema, images,
//                               internal links, sticky elements, visible text, hidden-until-scroll sections
//   <slug>.d-NN.png             desktop 1440x900, top to bottom
//   <slug>.m-NN.png             mobile (iPhone 13), top to bottom; m-00 is the first screen a visitor sees
//   <slug>.m-consent.png        mobile first screen with the consent banner still open
// A target is a URL or a local .html file (a draft: pass #/page hashes as extra URLs, e.g. file:///x.html#/leistung).
//
//   node capture.mjs <outdir> <url|file> [more …] [--shots] [--list urls.tsv] [--max-slices 20]
// --list takes one page per line; the URL may be any tab-separated column (discover.mjs output works as is).
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const outDir = args.shift();
if (!outDir) {
	console.error("usage: node capture.mjs <outdir> <url|file> [more …] [--shots] [--list urls.tsv] [--max-slices 20]");
	process.exit(2);
}
const shots = args.includes("--shots");
const maxSlices = Number(args[args.indexOf("--max-slices") + 1]) || 20;
let targets = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--list" && args[i - 1] !== "--max-slices");
if (args.includes("--list")) targets.push(...readFileSync(args[args.indexOf("--list") + 1], "utf8").split("\n").map((line) => line.split("\t").map((c) => c.trim()).find((c) => /^(https?|file):/.test(c))).filter(Boolean));
targets = targets.map((t) => (/^(https?|file):/.test(t) ? t : existsSync(t.split("#")[0]) ? pathToFileURL(resolve(t.split("#")[0])).href + (t.includes("#") ? "#" + t.split("#")[1] : "") : t));
mkdirSync(outDir, { recursive: true });

const slug = (u) => {
	const x = new URL(u);
	const s = (x.protocol === "file:" ? x.pathname.split("/").pop() : x.hostname.replace(/^www\./, "") + x.pathname) + x.hash;
	return s.replace(/\/$/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
};

async function rejectConsent(page) {
	for (const name of [/^(alle )?ablehnen$/i, /^reject( all)?$/i, /^nur (notwendige|essenzielle)/i, /^decline$/i]) {
		const b = page.getByRole("button", { name }).first();
		if (await b.isVisible().catch(() => false)) {
			await b.click().catch(() => {});
			await page.waitForTimeout(400);
			return true;
		}
	}
	return false;
}

// Hide fixed overlays taller than 35 % of the viewport (consent banners without reject, popups)
// so the screenshots show the page; the overlay itself is reported, not hidden from the findings.
async function hideOverlays(page) {
	return page.evaluate(() => {
		let n = 0;
		for (const e of document.querySelectorAll("body *")) {
			const cs = getComputedStyle(e);
			const r = e.getBoundingClientRect();
			if (cs.position === "fixed" && r.height > innerHeight * 0.35 && r.width > innerWidth * 0.6 && !e.closest(".draft-bar")) {
				e.style.setProperty("display", "none", "important");
				n++;
			}
		}
		return n;
	});
}

async function scrollShots(page, prefix, vh) {
	const height = await page.evaluate(() => document.documentElement.scrollHeight);
	// step = viewport minus a sticky header, minus 40 px overlap, so no content falls between two shots
	const header = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll("body *")].filter((e) => ["fixed", "sticky"].includes(getComputedStyle(e).position) && e.getBoundingClientRect().top <= 0 && e.getBoundingClientRect().height < 160).map((e) => e.getBoundingClientRect().height)));
	const step = Math.max(200, vh - header - 40);
	const n = Math.min(Math.ceil((height - vh) / step) + 1, maxSlices);
	for (let i = 0; i < n; i++) {
		await page.evaluate((y) => window.scrollTo(0, y), i * step);
		await page.waitForTimeout(450);
		await page.screenshot({ path: `${prefix}-${String(i).padStart(2, "0")}.png` });
	}
	await page.evaluate(() => window.scrollTo(0, 0));
	return { height, slices: n, truncated: (n - 1) * step + vh < height };
}

function extract() {
	const q = (s) => [...document.querySelectorAll(s)];
	const H = document.documentElement.scrollHeight;
	const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content ?? null;
	const vis = (el) => {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
	};
	const top = (el) => Math.round(el.getBoundingClientRect().top + scrollY);
	const chrome = (el) => el.closest(".draft-bar");
	const ctas = q("a,button")
		.filter((a) => vis(a) && !chrome(a))
		.map((a) => {
			const cs = getComputedStyle(a);
			const bg = cs.backgroundColor;
			const filled = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
			const outlined = parseFloat(cs.borderWidth) > 0 && cs.borderStyle !== "none";
			return { submit: a.type === "submit", text: a.innerText.trim().replace(/\s+/g, " ").slice(0, 80), lines: a.innerText.trim().split(/\n+/).length, href: a.getAttribute("href"), y: top(a), pct: Math.round((top(a) / H) * 100), style: filled ? "filled" : outlined ? "outline" : "link", bg };
		})
		.filter((c) => c.text && c.style !== "link");
	const jsonld = q('script[type="application/ld+json"]').map((s) => {
		try {
			return JSON.parse(s.textContent);
		} catch {
			return "INVALID JSON-LD";
		}
	});
	const types = jsonld.flatMap((j) => (j && j["@graph"] ? j["@graph"].map((g) => g["@type"]) : [j && j["@type"]])).filter(Boolean);
	// content that is invisible until scrolled into view (reveal animations)
	const hiddenUntilScroll = q("section,[class*=reveal]").filter((el) => getComputedStyle(el).opacity === "0").length;
	const sticky = q("body *")
		.filter((e) => ["fixed", "sticky"].includes(getComputedStyle(e).position) && vis(e) && !chrome(e))
		.map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 60), text: e.innerText.trim().replace(/\s+/g, " ").slice(0, 60), h: Math.round(e.getBoundingClientRect().height) }));
	return {
		title: document.title,
		description: meta("description"),
		robots: meta("robots"),
		canonical: document.querySelector("link[rel=canonical]")?.href ?? null,
		ogTitle: meta("og:title"),
		ogImage: meta("og:image"),
		lang: document.documentElement.lang,
		headings: q("h1,h2,h3").filter(vis).map((h) => ({ tag: h.tagName, text: h.innerText.trim().replace(/\s+/g, " "), y: top(h), pct: Math.round((top(h) / H) * 100) })),
		ctas,
		forms: q("form").map((f) => ({ fields: [...f.querySelectorAll("input,select,textarea")].filter((i) => i.type !== "hidden").map((i) => ({ type: i.type || i.tagName.toLowerCase(), name: i.name, label: i.closest("label")?.innerText.trim().split("\n")[0] ?? i.getAttribute("aria-label") ?? i.placeholder, required: i.required })) })),
		schemaTypes: types,
		jsonld,
		images: q("img").map((i) => ({ src: (i.currentSrc || i.src).slice(-80), alt: i.alt, w: i.naturalWidth })),
		internalLinks: [...new Set(q("a[href]").map((a) => a.href).filter((h) => h.startsWith(location.origin)))],
		sticky,
		hiddenUntilScroll,
		// page kind for the report's exceptions: legal pages and bare funnel pages skip CTA and sticky checks
		kind: /impressum|datenschutz|privacy|imprint|agb|legal/i.test(location.pathname + location.hash) ? "legal" : document.querySelector("[data-funnel]:not(:empty), form") && ![...document.querySelectorAll("header nav a, .site-header a")].some(vis) ? "funnel" : "content",
		fonts: [...new Set(q("h1,h2,p,a,button").map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "")))],
		wordCount: document.body.innerText.split(/\s+/).filter(Boolean).length,
		height: H,
		text: document.body.innerText,
	};
}

const browser = await chromium.launch();
for (const url of targets) {
	const s = slug(url);
	try {
		const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
		const page = await desk.newPage();
		let bytes = 0;
		const thirdPartyBeforeConsent = new Set();
		const host = new URL(url).hostname;
		page.on("response", async (r) => {
			try {
				bytes += (await r.body()).length;
			} catch {}
			const h = new URL(r.url()).hostname;
			if (h && host && !h.endsWith(host.replace(/^www\./, "")) && !/fonts\.(googleapis|gstatic)\.com$/.test(h)) thirdPartyBeforeConsent.add(h);
		});
		const t0 = Date.now();
		const resp = await page.goto(url, { waitUntil: "load", timeout: 60000 });
		await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
		const loadMs = Date.now() - t0;
		const lcp = await page.evaluate(() => new Promise((res) => {
			let v = 0;
			try {
				new PerformanceObserver((l) => (v = l.getEntries().at(-1).startTime)).observe({ type: "largest-contentful-paint", buffered: true });
			} catch {}
			setTimeout(() => res(Math.round(v)), 800);
		}));
		const beforeConsent = [...thirdPartyBeforeConsent];
		const consentFound = await rejectConsent(page);
		const desktopOverlaysHidden = consentFound ? 0 : await hideOverlays(page);
		const data = await page.evaluate(extract);
		Object.assign(data, { url, finalUrl: page.url(), status: resp?.status() ?? null, loadMs, lcpMs: lcp, transferKB: Math.round(bytes / 1024), thirdPartyBeforeConsent: beforeConsent, consentBanner: consentFound, overlayForceHidden: desktopOverlaysHidden > 0 });
		if (shots) data.desktopShots = await scrollShots(page, join(outDir, `${s}.d`), 900);
		await desk.close();

		if (shots) {
			const mob = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1, locale: "de-DE" });
			const mp = await mob.newPage();
			await mp.goto(url, { waitUntil: "load", timeout: 60000 });
			await mp.waitForTimeout(1200);
			await mp.screenshot({ path: join(outDir, `${s}.m-consent.png`) });
			// share of the first screen covered by fixed overlays (consent banners, popups) before any click
			data.mobileOverlayCoverage = await mp.evaluate(() => {
				const vh = innerHeight;
				const hs = [...document.querySelectorAll("body *")]
					.filter((e) => getComputedStyle(e).position === "fixed" && !e.closest(".draft-bar"))
					.map((e) => e.getBoundingClientRect())
					.filter((r) => r.width > innerWidth * 0.6 && r.height > 120)
					.map((r) => Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)));
				return Math.round((Math.max(0, ...hs) / vh) * 100);
			});
			data.mobileConsentRejectable = await rejectConsent(mp);
			if (!data.mobileConsentRejectable) await hideOverlays(mp);
			await mp.waitForTimeout(600);
			data.mobileFirstScreen = await mp.evaluate(() => {
				const vh = innerHeight;
				const h1 = [...document.querySelectorAll("h1")].find((h) => h.offsetParent !== null);
				const inView = (el) => el && el.getBoundingClientRect().top < vh && el.getBoundingClientRect().bottom > 0;
				// a scroll button ("Mehr erfahren ↓", href="#…") is not a conversion CTA
				const cta = [...document.querySelectorAll("a,button")].find((a) => {
					const bg = getComputedStyle(a).backgroundColor;
					const scroll = /↓/.test(a.innerText) || /^#[^/]/.test(a.getAttribute("href") || "");
					let fixed = false;
					for (let e = a; e && !fixed; e = e.parentElement) fixed = getComputedStyle(e).position === "fixed";
					return inView(a) && !scroll && !fixed && a.getBoundingClientRect().top > 70 && bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
				});
				return { h1Visible: inView(h1), primaryCtaVisible: Boolean(cta), ctaText: cta?.innerText.trim() ?? null };
			});
			data.mobileShots = await scrollShots(mp, join(outDir, `${s}.m`), 844);
			await mp.evaluate(() => window.scrollTo(0, 1600));
			await mp.waitForTimeout(800);
			data.mobileStickyAfterScroll = await mp.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => !e.closest(".draft-bar") && getComputedStyle(e).position === "fixed" && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top > innerHeight / 2).map((e) => e.innerText.trim().replace(/\s+/g, " ").slice(0, 60)));
			await mob.close();
		}
		writeFileSync(join(outDir, `${s}.json`), JSON.stringify(data, null, 1));
		console.log(`ok\t${s}\t${data.height}px\t${data.wordCount} words${shots ? `\t${data.desktopShots.slices}+${data.mobileShots.slices} shots` : ""}`);
	} catch (err) {
		console.log(`ERR\t${url}\t${err.message.split("\n")[0]}`);
	}
}
await browser.close();
