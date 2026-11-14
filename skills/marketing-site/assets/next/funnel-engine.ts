// Funnel config and pure logic, shared by QuizFunnel and the lead route.
// The config shape is the contract with the HTML draft: the draft's <script id="funnel-config"> JSON
// is pasted here unchanged (assets/draft.js implements the same logic in plain JS).

export type FunnelOption = { value: string; label: string; sub?: string; n?: number };
export type FunnelStep = {
	id: string;
	short?: string;
	question: string;
	hint?: string;
	type: "single" | "multi";
	min?: number;
	skippable?: boolean;
	options: FunnelOption[];
};
export type FunnelField = {
	name: string;
	label: string;
	type?: "text" | "email" | "tel" | "url" | "select" | "textarea";
	required?: boolean;
	full?: boolean;
	placeholder?: string;
	autocomplete?: string;
	options?: string[];
};
export type FunnelConfig = {
	name: string;
	webhook?: string; // unused in Next.js: the route reads LEAD_WEBHOOK_URL
	steps: FunnelStep[];
	result?: {
		title: string;
		label: string;
		expr?: string; // arithmetic over step ids, each step contributes its chosen option's n
		digits?: number;
		valueTemplate?: string;
		explain?: string;
		notes?: { when: Record<string, string | string[]>; text: string }[];
		cta?: string;
	};
	contact: {
		title: string;
		promise?: string;
		fields: FunnelField[];
		submit?: string;
		legal?: string;
		successTitle?: string;
		successText?: string;
	};
};
export type Answers = Record<string, string | string[] | undefined>;

export function numbers(config: FunnelConfig, answers: Answers): Record<string, number | null> {
	const v: Record<string, number | null> = {};
	for (const s of config.steps) {
		const opt = s.options.find((o) => o.value === answers[s.id]);
		v[s.id] = opt?.n ?? null;
	}
	return v;
}

export function labels(config: FunnelConfig, answers: Answers): Record<string, { label: string }> {
	const l: Record<string, { label: string }> = {};
	for (const s of config.steps) {
		const a = answers[s.id];
		const vals = Array.isArray(a) ? a : a == null ? [] : [a];
		l[s.id] = { label: s.options.filter((o) => vals.includes(o.value)).map((o) => o.label).join(", ") };
	}
	return l;
}

// Only digits, operators, parentheses and step ids may appear; the config is authored, never user input.
export function evaluate(expr: string, vars: Record<string, number | null>): number | null {
	const names = Object.keys(vars);
	const stripped = names.reduce((e, n) => e.replaceAll(n, ""), expr);
	if (!/^[\d\s+\-*/().]*$/.test(stripped)) throw new Error(`result.expr has unknown tokens: ${expr}`);
	if (names.some((n) => expr.includes(n) && vars[n] == null)) return null;
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	return new Function(...names, `"use strict"; return (${expr});`)(...names.map((n) => vars[n])) as number;
}

export function fill(tpl: string | undefined, ctx: Record<string, unknown>): string {
	return (tpl ?? "").replace(/\{([\w.]+)\}/g, (_, k: string) => {
		const [a, b] = k.split(".");
		const v = ctx[a] as Record<string, unknown> | string | number | undefined;
		const out = b && v && typeof v === "object" ? v[b] : v;
		return out == null ? "" : String(out);
	});
}

export function activeNotes(config: FunnelConfig, answers: Answers) {
	return (config.result?.notes ?? []).filter((n) =>
		Object.entries(n.when).every(([k, want]) => {
			const list = Array.isArray(want) ? want : [want];
			const a = answers[k];
			return Array.isArray(a) ? a.some((x) => list.includes(x)) : a != null && list.includes(a);
		}),
	);
}

// Prefill from ?<stepId>=<value> (closing block links, CTA deep links).
export function prefill(config: FunnelConfig, params: URLSearchParams): Answers {
	const answers: Answers = {};
	for (const s of config.steps) {
		const v = params.get(s.id);
		if (v && s.options.some((o) => o.value === v)) answers[s.id] = s.type === "multi" ? [v] : v;
	}
	return answers;
}

// Every other parameter (?paket=, ?modul=, ?rolle=, utm_*) travels with the lead as context.
export function context(config: FunnelConfig, params: URLSearchParams): Record<string, string> {
	const ids = new Set(config.steps.map((s) => s.id));
	return Object.fromEntries([...params].filter(([k]) => !ids.has(k)));
}

export const formatNumber = (n: number, digits = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: digits });
