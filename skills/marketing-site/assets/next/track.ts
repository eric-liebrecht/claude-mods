// Event schema of every marketing site. Pushes to window.dataLayer; Google Tag Manager (or any tag) loads
// only after consent and reads the queue then, so nothing leaves the browser before consent.
//
//   cta_click           { cta_position: "header" | "hero" | "pricing" | "closing" | "sticky" | "contact" | "content", cta_text }
//   funnel_start        { funnel }
//   funnel_step         { funnel, step, step_index, answer }
//   funnel_result_view  { funnel, estimate }
//   lead_submit         { funnel }                  sent when the route answered 2xx
//   lead_error          { funnel, status }
type EventName = "cta_click" | "funnel_start" | "funnel_step" | "funnel_result_view" | "lead_submit" | "lead_error";

declare global {
	interface Window {
		dataLayer?: Record<string, unknown>[];
	}
}

export function track(event: EventName, params: Record<string, unknown> = {}) {
	if (typeof window === "undefined") return;
	window.dataLayer = window.dataLayer ?? [];
	window.dataLayer.push({ event, ...params });
}

// One delegated listener for every element with data-cta="<position>". Call once in a client component.
export function trackCtaClicks() {
	const onClick = (e: MouseEvent) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cta]");
		if (el) track("cta_click", { cta_position: el.dataset.cta, cta_text: el.textContent?.trim() });
	};
	document.addEventListener("click", onClick);
	return () => document.removeEventListener("click", onClick);
}
