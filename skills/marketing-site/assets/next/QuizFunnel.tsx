"use client";
// The funnel: questions as tiles → result computed from the answers → contact. Same markup classes as the
// draft (site.css). Mount on a bare funnel page (no header/footer, only "Schließen"), e.g. app/anfrage/page.tsx:
//   <QuizFunnel config={funnelConfig} />   inside <Suspense> (it reads the search params)
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { activeNotes, context, evaluate, fill, formatNumber, labels, numbers, prefill, type Answers, type FunnelConfig } from "./funnel-engine";
import { track } from "./track";

export function QuizFunnel({ config }: { config: FunnelConfig }) {
	const params = useSearchParams();
	const initial = useMemo(() => prefill(config, new URLSearchParams(params.toString())), [config, params]);
	const firstOpen = config.steps.findIndex((s) => s.type === "multi" || initial[s.id] == null);
	const [answers, setAnswers] = useState<Answers>(initial);
	const [idx, setIdx] = useState(firstOpen === -1 ? config.steps.length : firstOpen);
	const [state, setState] = useState<"open" | "sending" | "sent" | "error">("open");
	const started = useRef(false);
	const steps = config.steps;
	const total = steps.length + 2;
	const progress = Math.round((Math.min(idx, total - 1) / total) * 100);
	const step = steps[idx];

	useEffect(() => {
		if (!started.current) {
			started.current = true;
			track("funnel_start", { funnel: config.name });
		}
	}, [config.name]);

	const estimate = useMemo(() => {
		if (idx !== steps.length || !config.result?.expr) return null;
		try {
			return evaluate(config.result.expr, numbers(config, answers));
		} catch (err) {
			console.warn(err);
			return null;
		}
	}, [idx, steps.length, config, answers]);
	useEffect(() => {
		if (idx === steps.length && config.result) track("funnel_result_view", { funnel: config.name, estimate });
	}, [idx, steps.length, config, estimate]);

	function choose(value: string) {
		if (!step) return;
		if (step.type === "multi") {
			const list = (answers[step.id] as string[] | undefined) ?? [];
			setAnswers({ ...answers, [step.id]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
			return;
		}
		setAnswers({ ...answers, [step.id]: value });
		track("funnel_step", { funnel: config.name, step: step.id, step_index: idx + 1, answer: value });
		setIdx(idx + 1);
	}
	function next() {
		if (step) track("funnel_step", { funnel: config.name, step: step.id, step_index: idx + 1, answer: answers[step.id] });
		setIdx(idx === steps.length - 1 && !config.result ? steps.length + 1 : idx + 1);
	}

	async function submit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		if (!form.reportValidity()) return;
		setState("sending");
		const contact = Object.fromEntries(new FormData(form)) as Record<string, string>;
		const res = await fetch("/api/lead", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				funnel: config.name,
				answers,
				estimate,
				context: context(config, new URLSearchParams(location.search)),
				contact,
				page: location.href,
				referrer: document.referrer || null,
			}),
		}).catch(() => null);
		if (res?.ok) {
			track("lead_submit", { funnel: config.name });
			setState("sent");
		} else {
			track("lead_error", { funnel: config.name, status: res?.status ?? 0 });
			setState("error");
		}
	}

	const head = (
		<>
			<div className="funnel__meta">
				<span>{config.name}</span>
				<span>Fortschritt {progress} %</span>
			</div>
			<div className="progress">
				<i style={{ width: `${progress}%` }} />
			</div>
		</>
	);
	const back = idx > 0 && (
		<button type="button" className="link-btn" onClick={() => setIdx(idx - 1)}>
			← zurück
		</button>
	);

	if (state === "sent")
		return (
			<div className="funnel" data-funnel aria-live="polite">
				<div className="success">
					<h2>{config.contact.successTitle ?? "Danke, Ihre Anfrage ist da."}</h2>
					<p className="hint">{config.contact.successText}</p>
				</div>
			</div>
		);

	if (step) {
		const current = answers[step.id];
		const multi = step.type === "multi";
		const chosen = (v: string) => (multi ? ((current as string[] | undefined) ?? []).includes(v) : current === v);
		return (
			<div className="funnel" data-funnel aria-live="polite">
				{head}
				<h2>{step.question}</h2>
				{step.hint && <p className="hint">{step.hint}</p>}
				<div className="options">
					{step.options.map((o) => (
						<button key={o.value} type="button" className="option" aria-pressed={chosen(o.value)} onClick={() => choose(o.value)}>
							<b>{o.label}</b>
							{o.sub && <small>{o.sub}</small>}
						</button>
					))}
				</div>
				{multi && (
					<button type="button" className="btn btn--primary btn--block" style={{ marginTop: 18 }} disabled={((current as string[] | undefined) ?? []).length < (step.min ?? 1)} onClick={next}>
						Weiter <span className="arrow" />
					</button>
				)}
				{step.skippable && (
					<p className="hint">
						<button type="button" className="link-btn" onClick={() => setIdx(idx + 1)}>
							Frage überspringen →
						</button>
					</p>
				)}
				<div className="funnel__nav">
					{back || <span />}
					<span>
						Frage {idx + 1} von {steps.length}
					</span>
				</div>
			</div>
		);
	}

	if (idx === steps.length && config.result) {
		const r = config.result;
		const chosen = labels(config, answers);
		const ctx = { ...chosen, value: estimate == null ? "–" : formatNumber(estimate, r.digits) };
		return (
			<div className="funnel" data-funnel aria-live="polite">
				{head}
				<h2>{r.title}</h2>
				{r.expr && (
					<div className="result">
						<div className="card__label">{r.label}</div>
						<div className="result__value">{fill(r.valueTemplate ?? "{value}", ctx)}</div>
						<p className="hint">{fill(r.explain, ctx)}</p>
					</div>
				)}
				{activeNotes(config, answers).map((n) => (
					<p key={n.text} className="hint">
						{fill(n.text, ctx)}
					</p>
				))}
				<dl className="summary" style={{ marginTop: 18 }}>
					{steps.map((s) => (
						<div key={s.id} style={{ display: "contents" }}>
							<dt>{s.short ?? s.id}</dt>
							<dd>{chosen[s.id]?.label || "–"}</dd>
						</div>
					))}
				</dl>
				<button type="button" className="btn btn--primary btn--block" style={{ marginTop: 22 }} onClick={() => setIdx(idx + 1)}>
					{r.cta ?? "Weiter zur Kontaktangabe"} <span className="arrow" />
				</button>
				<div className="funnel__nav">{back}</div>
			</div>
		);
	}

	const c = config.contact;
	return (
		<div className="funnel" data-funnel aria-live="polite">
			{head}
			<h2>{c.title}</h2>
			{c.promise && <p className="hint">{c.promise}</p>}
			<form className="form" onSubmit={submit}>
				{c.fields.map((f) => (
					<label key={f.name} className={`field${f.full ? " field--full" : ""}`}>
						<span>
							{f.label} {!f.required && <small>(optional)</small>}
						</span>
						{f.type === "select" ? (
							<select name={f.name} required={f.required}>
								{f.options?.map((o) => <option key={o}>{o}</option>)}
							</select>
						) : f.type === "textarea" ? (
							<textarea name={f.name} required={f.required} placeholder={f.placeholder} />
						) : (
							<input name={f.name} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder} autoComplete={f.autocomplete} />
						)}
					</label>
				))}
				{/* honeypot: humans never see or fill it */}
				<input name="website_url" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
				<button type="submit" className="btn btn--primary" disabled={state === "sending"}>
					{c.submit ?? "Anfrage senden"} <span className="arrow" />
				</button>
				{state === "error" && <p className="legal is-warn">Das hat nicht geklappt. Bitte versuchen Sie es erneut oder rufen Sie uns an.</p>}
				{c.legal && <p className="legal" dangerouslySetInnerHTML={{ __html: c.legal }} />}
			</form>
			<div className="funnel__nav">
				{back}
				<span>Letzter Schritt: Kontakt</span>
			</div>
		</div>
	);
}
