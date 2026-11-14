"use client";
// Mobile sticky CTA: hidden while the hero CTA (data-cta="hero") is on screen, shown once it has scrolled
// away; shown at once on pages without one. Also registers the delegated cta_click tracking.
// Render once in the marketing layout, never on the bare funnel page.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { trackCtaClicks } from "./track";

export function StickyCta({ href, label }: { href: string; label: string }) {
	const [on, setOn] = useState(false);
	const pathname = usePathname();

	useEffect(() => trackCtaClicks(), []);
	useEffect(() => {
		const hero = document.querySelector('[data-cta="hero"]');
		if (!hero) {
			setOn(true);
			return;
		}
		setOn(false);
		const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting && e.boundingClientRect.top < 0));
		io.observe(hero);
		return () => io.disconnect();
	}, [pathname]);

	return (
		<div className={`sticky-cta${on ? " is-on" : ""}`}>
			<a className="btn btn--primary btn--block" href={href} data-cta="sticky">
				{label} <span className="arrow" />
			</a>
		</div>
	);
}
