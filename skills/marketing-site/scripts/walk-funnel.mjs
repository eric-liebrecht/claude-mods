#!/usr/bin/env node
// Walks a multi-step funnel or form like a visitor: picks the first option on each step, screenshots every
// screen (desktop and mobile), prints each screen's text, fields and buttons, and stops at the contact
// fields. It never submits.
//
//   node walk-funnel.mjs <url|file> <outdir> [--max 12]
import { chromium, devices } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [target, outDir] = process.argv.slice(2);
const max = Number(process.argv[process.argv.indexOf("--max") + 1]) || 12;
if (!target || !outDir) {
	console.error("usage: node walk-funnel.mjs <url|file> <outdir> [--max 12]");
	process.exit(2);
}
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(resolve(target.split("#")[0])).href + (target.includes("#") ? "#" + target.split("#")[1] : "");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const [mode, ctxOpts] of [["d", { viewport: { width: 1440, height: 900 } }], ["m", { ...devices["iPhone 13"], deviceScaleFactor: 1 }]]) {
	const page = await (await browser.newContext({ ...ctxOpts, locale: "de-DE" })).newPage();
	await page.goto(url, { waitUntil: "load", timeout: 60000 });
	await page.waitForTimeout(1000);
	for (const name of [/^(alle )?ablehnen$/i, /^reject( all)?$/i]) {
		const b = page.getByRole("button", { name }).first();
		if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
	}
	let last = "";
	for (let i = 0; i < max; i++) {
		await page.waitForTimeout(700);
		await page.screenshot({ path: join(outDir, `funnel.${mode}-${String(i).padStart(2, "0")}.png`), fullPage: true });
		const info = await page.evaluate(() => {
			const vis = (e) => e.offsetParent !== null;
			const pick = (sel) => [...document.querySelectorAll(sel)].find(vis);
			const scope = pick("[data-funnel]") || pick("form") || pick("main") || document.body;
			return {
				text: scope.innerText.trim().slice(0, 1200),
				fields: [...scope.querySelectorAll("input,select,textarea")].filter((e) => e.type !== "hidden" && vis(e)).map((e) => `${e.type || e.tagName.toLowerCase()}:${e.name}${e.required ? "*" : ""}`),
				buttons: [...scope.querySelectorAll("button,[role=radio],a.option")].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 20),
			};
		});
		if (mode === "d") console.log(`=== screen ${i}\n${info.text}\nFIELDS ${JSON.stringify(info.fields)}\nBUTTONS ${JSON.stringify(info.buttons)}\n`);
		if (info.fields.some((f) => /^(email|tel)|:(e-?mail|phone|telefon|name)/i.test(f))) {
			if (mode === "d") console.log("reached contact fields: stop, nothing submitted");
			break;
		}
		if (info.text === last) break;
		last = info.text;
		const scope = (await page.$("[data-funnel]")) ? "[data-funnel] " : "";
		const option = page.locator(`${scope}.option, ${scope}[role=radio], ${scope}button`).filter({ hasNotText: /zurück|back|senden|absenden|submit|überspringen|cookie|ablehnen|akzeptieren/i }).first();
		if (!(await option.count())) break;
		const textOf = () => page.evaluate(() => (document.querySelector("[data-funnel]") || document.body).innerText);
		const before = await textOf();
		await option.click().catch(() => {});
		await page.waitForTimeout(300);
		// multi-select steps need "Weiter"; a single choice already advanced the screen
		const progressed = (await textOf()) !== before;
		const next = page.locator(`${scope}button`).filter({ hasText: /^\s*(weiter|next|nächste)\b/i }).first();
		if (!progressed && (await next.isVisible().catch(() => false))) await next.click().catch(() => {});
	}
}
await browser.close();
