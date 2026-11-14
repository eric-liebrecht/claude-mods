// Server components for the recurring blocks. Same classes as the draft (site.css), so a released draft
// section ports by turning its HTML into these. Client pieces: StickyCta (below), QuizFunnel.
import type { ReactNode } from "react";
import type { FunnelConfig } from "./funnel-engine";

/** Section head: eyebrow (what the section does) → H2 (statement + fading punchline) → lead. */
export function SectionHead({ eyebrow, title, fade, lead, center }: { eyebrow: string; title: string; fade?: string; lead?: ReactNode; center?: boolean }) {
	return (
		<div className={`section-head${center ? " section-head--center" : ""}`}>
			<span className="eyebrow">{eyebrow}</span>
			<h2 className="h2">
				{title} {fade && <span className="fade">{fade}</span>}
			</h2>
			{lead && <p className="lead">{lead}</p>}
		</div>
	);
}

/** "Beispielansicht": the product in the customer's world. Children = table, KPIs, list with sample data. */
export function Mockup({ title, label = "Beispielansicht", caption, children }: { title: string; label?: string; caption?: string; children: ReactNode }) {
	return (
		<figure style={{ margin: 0 }}>
			<div className="mockup" role="img" aria-label={`${label}: ${title}`}>
				<div className="mockup__bar">
					<span>{title}</span>
					<span className="mockup__tag">{label}</span>
				</div>
				<div className="mockup__body">{children}</div>
			</div>
			{caption && <figcaption className="figure-caption">{caption}</figcaption>}
		</figure>
	);
}

/** Pricing = the steps of the method. First tier is the entry offer; every card carries the one CTA. */
export type Tier = { step: string; name: string; price: string; unit: string; points: string[]; href: string; entry?: boolean };
export function PricingSteps({ tiers, cta, note }: { tiers: Tier[]; cta: string; note: string }) {
	return (
		<>
			<div className={`grid grid--${Math.min(tiers.length, 4)}`}>
				{tiers.map((t) => (
					<div key={t.name} className={`price-card${t.entry ? " price-card--featured" : ""}`}>
						{t.entry && <span className="badge">Einstieg</span>}
						<div className="card__label">{t.step}</div>
						<div className="card__title">{t.name}</div>
						<div className="price">
							{t.price} <small>{t.unit}</small>
						</div>
						<ul className="checks">
							{t.points.map((p) => (
								<li key={p}>{p}</li>
							))}
						</ul>
						<a className={`btn ${t.entry ? "btn--primary" : "btn--ghost"} btn--block`} href={t.href} data-cta="pricing">
							{cta}
						</a>
					</div>
				))}
			</div>
			<p className="note">{note}</p>
		</>
	);
}

/** FAQ as objections, with FAQPage schema. variant "seo" = the collapsed long-form block below the last CTA. */
export function Faq({ items, variant }: { items: { q: string; a: string }[]; variant?: "seo" }) {
	const schema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
	};
	return (
		<div className={`faq${variant === "seo" ? " faq--seo" : ""}`}>
			{items.map((i) => (
				<details key={i.q}>
					<summary>{i.q}</summary>
					<div>{i.a}</div>
				</details>
			))}
			<JsonLd data={schema} />
		</div>
	);
}

export function JsonLd({ data }: { data: object }) {
	return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/**
 * Closing block: identical on every content page. Left: question H2, effort, three risk bullets.
 * Right: the funnel's first question as links (/anfrage?<step>=<value>), so the click is already answer one.
 */
export function ClosingBlock({ title, fade, lead, bullets, config, cta, href = "/anfrage", meta }: { title: string; fade?: string; lead: string; bullets: string[]; config: FunnelConfig; cta: string; href?: string; meta: string }) {
	const first = config.steps[0];
	return (
		<section className="section section--glow">
			<div className="container closing">
				<div>
					<h2 className="h2">
						{title} {fade && <span className="fade">{fade}</span>}
					</h2>
					<p className="lead" style={{ marginTop: 16 }}>
						{lead}
					</p>
					<ul className="arrow-list">
						{bullets.map((b) => (
							<li key={b}>{b}</li>
						))}
					</ul>
				</div>
				<div className="funnel">
					<div className="funnel__meta">
						<span>{meta}</span>
					</div>
					<h3 style={{ marginTop: 14 }}>{first.question}</h3>
					<div className="options">
						{first.options.map((o) => (
							<a key={o.value} className="option" href={`${href}?${first.id}=${encodeURIComponent(o.value)}`} data-cta="closing">
								<b>{o.label}</b>
								{o.sub && <small>{o.sub}</small>}
							</a>
						))}
					</div>
					<a className="btn btn--primary btn--block" href={href} data-cta="closing" style={{ marginTop: 16 }}>
						{cta} <span className="arrow" />
					</a>
				</div>
			</div>
		</section>
	);
}

/** Marked placeholder for proof or photos the brief does not have yet. Visible on purpose: never invent proof. */
export function Placeholder({ children, minHeight }: { children: ReactNode; minHeight?: number }) {
	return (
		<div className="placeholder" style={minHeight ? { minHeight } : undefined}>
			{children}
		</div>
	);
}
