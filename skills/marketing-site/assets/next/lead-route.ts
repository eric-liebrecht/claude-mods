// app/api/lead/route.ts: one lead = funnel answers + estimate + context (offer, module, UTM) + contact, as one JSON record.
// Delivery: POST to LEAD_WEBHOOK_URL (Zapier, Make, n8n, CRM). If that is unset or fails, mail via Resend
// (RESEND_API_KEY, LEAD_MAIL_TO, LEAD_MAIL_FROM). If both fail the visitor gets an error and can retry
// or call: a lead is never silently dropped.
import { NextResponse } from "next/server";
import { funnelConfig } from "@/funnel-config";

export const runtime = "nodejs";

type Lead = {
	funnel: string;
	answers: Record<string, unknown>;
	estimate: number | null;
	context: Record<string, string>; // ?paket=, ?modul=, utm_* …
	contact: Record<string, string>;
	page: string;
	referrer: string | null;
};

export async function POST(req: Request) {
	let lead: Lead;
	try {
		lead = await req.json();
	} catch {
		return NextResponse.json({ error: "invalid json" }, { status: 400 });
	}
	if (lead.contact?.website_url) return NextResponse.json({ ok: true }); // honeypot filled: bot
	delete lead.contact.website_url;
	const missing = funnelConfig.contact.fields.filter((f) => f.required && !lead.contact?.[f.name]?.trim()).map((f) => f.name);
	if (missing.length) return NextResponse.json({ error: "missing", fields: missing }, { status: 422 });
	if (lead.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.contact.email)) return NextResponse.json({ error: "email" }, { status: 422 });

	const record = { ...lead, received_at: new Date().toISOString() };

	const hook = process.env.LEAD_WEBHOOK_URL;
	if (hook) {
		const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) }).catch(() => null);
		if (res?.ok) return NextResponse.json({ ok: true });
		console.error("lead webhook failed", res?.status);
	}
	if (process.env.RESEND_API_KEY && process.env.LEAD_MAIL_TO) {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: process.env.LEAD_MAIL_FROM ?? "Website <leads@resend.dev>",
				to: process.env.LEAD_MAIL_TO.split(","),
				reply_to: lead.contact.email,
				subject: `Neue Anfrage (${lead.funnel}): ${lead.contact.company ?? lead.contact.name}`,
				text: JSON.stringify(record, null, 2),
			}),
		}).catch(() => null);
		if (res?.ok) return NextResponse.json({ ok: true });
		console.error("lead mail failed", res?.status);
	}
	console.error("lead not delivered", JSON.stringify(record));
	return NextResponse.json({ error: "delivery" }, { status: 502 });
}
