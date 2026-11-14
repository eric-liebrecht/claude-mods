# Rules

Every rule has an ID, the rule, and its **check**: how a build verifies it and an audit tests it. Building means every rule applied; auditing means every rule checked, with a verdict per rule. `[script]` marks checks `scripts/report.mjs` finds mechanically; the rest need the screenshots and the text.

Copy examples are German originals; their effect depends on the exact wording. Adapt them to the brief, keep the pattern.

## 1. Strategy

**strat-one-conversion**: One main conversion per site and one CTA label, identical everywhere (header, hero, pricing, closing block, sticky bar). Secondary actions are exploring, never a second conversion.
Check: `[script]` "Distinct filled-button labels" shows one conversion label (plus explore labels like "Leistung ansehen").

**strat-diagnosis-cta**: The CTA names a free diagnosis with a result, never "Kontakt", "Anfrage" or "Mehr erfahren". Pattern: `Kostenlosen <Name>-Check starten`, `Erste Einschätzung holen`.
Check: the label contains the free offer and an action verb.

**strat-hard-number**: The audience is narrowed with a hard number or condition, visibly on the start page and in the funnel: "Für Betriebe mit 10 bis 249 Mitarbeitenden", "Mindestbeteiligung 200.000 €", "Zu groß für Zettel, zu klein für ein ERP-Projekt."
Check: the number appears above the fold or in the first section after the hero.

**strat-against**: Position against the alternative the visitor knows. Patterns: "Kein <X>. Ein <Y>.", "<Y>, nicht <X>.", "<X>-Alternative" in title and eyebrow.
Check: the alternative is named in the hero or the first H2.

**strat-method**: The way of working has a name and numbered steps, each with duration and price type. The brand name may explain the method.
Check: a numbered process section exists; every step has duration and outcome.

**strat-ladder**: Offer ladder: free diagnosis → small paid entry at a fixed price, credited on order → main service → recurring. The entry is what the funnel sells.
Check: entry price visible on pricing and in the closing block ("Danach Workshop zum Festpreis von 990 € netto").

**strat-segments**: Several audiences get separate tracks (nav "Für Gründer" / "Für Investoren", own pages, own forms). The contact page routes with one card per audience. Pages catch the wrong visitor and redirect them ("Du willst nicht angestellt sein, sondern gründen?").
Check: no page addresses two audiences with one CTA.

## 2. Architecture

**arch-start-order**: Start page sections in this order unless the brief gives a reason: hero → "passt, wenn" (problem + qualification) → offer (with links to detail pages) → method → pricing → scenarios or proof → control and trust → FAQ → closing block → footer. Order per page type: [blueprints.md](blueprints.md).
Check: section list of the page against the blueprint.

**arch-section-frame**: Every section: eyebrow (mono label naming what the section does: "PASST, WENN", "ABLAUF", "PREISMODELL", "EHRLICH GESAGT") → H2 → 1–3 sentence lead → content.
Check: every section has the three heads.

**arch-detail-template**: All pages of one type share one template (same sections, same order, same depth). Depth is equal: no FAQ with one question, no page missing the example day its siblings have.
Check: sections of sibling pages side by side.

**arch-closing**: The closing block is identical on every content page: question H2, effort ("Sechs kurze Fragen, eine erste Einschätzung in unter einer Minute."), three risk bullets ("Kein Pitch, kein Foliensatz"), the first funnel question embedded as tiles that deep-link into the funnel.
Check: present on every content page; tiles link with `?<step>=<value>`.

**arch-cta-rhythm**: CTA in header, hero, pricing, closing block, plus the mobile sticky bar. The middle of the page argues without CTAs. The first conversion CTA sits in the first screen.
Check: `[script]` first conversion CTA ≤ 25 % of page height; a scroll button ("Mehr erfahren ↓") does not count.

**arch-bare-funnel**: The funnel page has no navigation, no footer links, no sticky bar, only the logo and "Schließen ×".
Check: funnel screenshots.

**arch-seo-below**: Long-form SEO text sits below the closing block as a collapsed FAQ (`faq--seo`), so the selling part stays short. The answers are real answers.
Check: no SEO prose between hero and closing block.

## 3. Hero

**hero-structure**: Eyebrow = category keyword ("KI-BETRIEBSSYSTEM FÜR KMU"). H1 = outcome promise, punchline last (the part that fades to grey). Lead = what, for whom, how, in two sentences.
Check: H1 ≤ 10 words or two short clauses; lead names the audience.

**hero-cta-pair**: Primary CTA (accent, arrow) plus one ghost button to explore ("Leistung ansehen").
Check: exactly one accent button in the hero.

**hero-proof-points**: Two short proof points under the CTA: "**1 Woche** bis zum klickbaren Entwurf · **Festpreis** für den Bau".
Check: present, each with a bold number or fact.

**hero-visual**: The visual shows the product in the customer's world: a UI mockup with realistic sample data from their industry, labelled "Beispielansicht", the accent only on what needs action. For services: the method as a graphic. Where the work itself is the product (video, photo, design, architecture), the hero shows the work: showreel or best project. Photos only of real people and products.
Check: no stock photo; mockup labelled.

**hero-mobile**: On mobile the H1 fits in three lines and the primary CTA is in the first screen.
Check: `[script]` mobileFirstScreen.h1Visible and primaryCtaVisible.

## 4. Conversion mechanics

**cta-one**: See strat-one-conversion; CTA text adapts to context only by role: "Jetzt als CTO bewerben".
Check: `[script]` with `--cta "<label>"`.

**funnel-quiz**: Leads come through a quiz, not a bare form (a site with only a form gets one finding here; the other funnel-* rules are then n/a, except funnel-contact for the form): 4–6 click questions as tiles with a sub-line, progress in percent, "Frage x von n", back link. Sensitive questions are skippable and say why they are asked ("Davon hängt ab, ob Sie E-Rechnungen ab 2027 versenden müssen.").
Check: `scripts/walk-funnel.mjs` screens.

**funnel-value-first**: Before the contact fields comes a personal result computed from the answers ("ca. 10 h / Monat"), with the calculation shown and "Kein Angebot, keine Zusage."
Check: a result screen exists and names its assumptions.

**funnel-contact**: Few required fields (name, company, email); phone optional; role as select; free text with an example placeholder. A fixed response promise: "Wir melden uns innerhalb von zwei Werktagen für ein 30-Minuten-Gespräch."
Check: required fields ≤ 3 (B2B lead) or justified by rule funnel-friction.

**funnel-context**: Context travels in the URL: `?paket=workshop`, `?<step>=<value>`, `?rolle=CTO`. The funnel preselects it; the lead record carries it.
Check: pricing and closing links carry parameters.

**funnel-friction**: Deliberate friction (CV, video, proof link) only where quality beats volume, and then softened ("Das Video muss nicht perfekt sein, wir wollen dich sehen."). What the page demands ("Ohne Proof keine Bewerbung") the form requires.
Check: page claims and required fields agree.

**funnel-qualify**: Qualifying selects are optional; the floor sits in the options ("200k bis 500k" as the smallest ticket).
Check: form review.

**funnel-risk-microcopy**: Next to every conversion CTA: free, effort, response time ("✓ kostenlos ✓ ca. 1 Minute ✓ Antwort innerhalb von zwei Werktagen").
Check: present on the funnel page and in the closing block.

## 5. Copy

**copy-contrast**: Lead headline pattern "X, nicht Y" / "Kein X. Ein Y." ("Ein System, kein Foliensatz.", "Festpreis statt Stundenzettel.").
Check: at least the hero or the first H2 uses it.

**copy-triad**: Rhythm headlines with numbers: "Ein Workshop. Eine Woche. Ihr Entwurf." / "Ein System. Neun Phasen. Ein Ziel."
Check: used for the closing or method headline.

**copy-specific**: Numbers, deadlines, prices, times of day, the customer's own tools (DATEV, lexoffice, XRechnung). No superlatives, no exclamation marks, sentences of 8–20 words.
Check: grep for "!", "beste", "führend", "innovativ", "einzigartig", "revolution".

**copy-state**: Describe outcomes as states, not activities: "Du hast den passenden Mitgründer an deiner Seite." instead of "Wir suchen Mitgründer."
Check: method steps read as outcomes.

**copy-honest**: Name the downsides openly ("Diese Zeit ist unbezahlt.", "Ein Versprechen auf Rendite gibt es nicht, das wäre unseriös."). Every example number carries its label ("Richtwerte, die wir mit Ihren Daten prüfen").
Check: each estimate, scenario and example has its disclaimer.

**copy-disqualify**: Say who it is not for: "Das ist nichts für dich, wenn …" followed by "Dann sparen wir uns beide Zeit."
Check: one disqualifying block on audience pages.

**copy-identity**: Address identity, not features: "Operator, nicht Verwalter.", "Unternehmer-DNA".
Check: used on audience or recruiting pages.

**copy-scenarios**: Scenarios as "Heute / Mit <Produkt>" with company type and size and one big result word ("nur Ausnahmen"). An example day with clock times ("07:00 · 86 Belege aus dem Postfach") makes automation tangible.
Check: labelled as scenario or example.

**copy-anrede**: Du or Sie per brief, consistent across pages, funnel, errors and emails.
Check: grep both forms.

## 6. Trust and objections

**trust-no-invention**: Never invent testimonials, numbers, logos, customer names, ratings or case studies. Missing proof becomes a marked placeholder (`.placeholder`, "PROOF FEHLT: …") and an `OFFEN` in the brief. Allowed substitutes, always labelled: UI mockups ("Beispielansicht"), scenarios ("Szenario"), example days ("Beispielablauf"), the method, risk reversal.
Check: every proof element traces to brief field 9.

**trust-order**: Use the strongest proof available: real figures and cases with a measured result > testimonials with photo, name and role > work samples, showreel or linked portfolio > team with bio and LinkedIn > mockups and scenarios.
Check: proof section uses the top available tier.

**trust-visible**: The strongest proof is visible on the start page (a figures row), never only inside an accordion or SEO text.
Check: the brief's "stärkster Beleg" appears in visible text.

**trust-targeted**: Proof matches the track: investor voices on the investor page, founder voices on the founder page, customer voices on service pages.
Check: testimonial roles per page.

**trust-objection-section**: The category's main objection gets its own section of four cards (for automation: control, liability, data ownership, existing partners). Neutralise third parties who could block the deal: "Steuerberater bleibt".
Check: brief field 10 main objection is answered in a section, not only in the FAQ.

**trust-process**: The method shows gates and exit criteria ("Kein Bauauftrag ohne überzeugenden Entwurf", "Dann ziehen wir gemeinsam die Konsequenz") and the provider's own risk ("geht selbst als Pre-Seed-Investor ins Risiko").
Check: method or pricing names the exit.

**trust-people**: About page: every person with photo, name, role, a bio with a checkable fact and a LinkedIn link; as many people as the H1 promises. Phone in header and footer; address matches the imprint.
Check: about page and imprint side by side.

**trust-consistency**: No contradictions between pages, funnel, FAQ, imprint and brief (pay, prices, location, durations, who it is for). Honest framing collapses on one contradiction.
Check: list every factual claim per page and compare; part of every self-audit.

**faq-objections**: FAQ = objections in customer language; the H2 names the audience ("Was Inhaber und Geschäftsführer vorher wissen wollen."); the last question is "Wie starte ich?" and its answer ends in the CTA. At least three questions per FAQ.
Check: question count and last question.

## 7. Pricing

**price-show**: Show prices or "ab" prices. The H2 names the model ("Festpreis fürs System. Agenten nach Ergebnis."), the lead removes the fear ("Keine offenen Tagessätze. Sie kennen den Preis, bevor wir bauen."). B2B: "Alle Preise netto zzgl. USt. Angebot ausschließlich für Unternehmen."
Check: pricing section exists or the brief states why not.

**price-steps**: Price cards are the method's steps ("Schritt 1 · Sehen"); the entry card is marked "Einstieg"; every card carries the one CTA with its `?paket=` parameter.
Check: cards ↔ method steps. Without a paid entry the free diagnosis takes the "Einstieg" card.

**urgency-real**: Urgency only from an external, sourced fact (law with paragraph, deadline, season). No countdowns, no invented scarcity.
Check: every urgency claim has a source in brief field 11.

## 8. Design system

The look is fixed by principles; colour and type come from the brand. Without a brand, use preset `dark` (default) or `split` from `assets/site.css`.

**design-accent**: One accent colour, used only for actions and warning states (primary CTA, progress, "Nachweis fehlt", the one highlighted bar), plus at most a faint glow behind the hero visual and the closing block. Everything else is black, white, grey.
Check: screenshots: accent appears on nothing decorative.

**design-type**: One sans family for everything, headlines 600–800 with tight tracking, H1 large (52–104 px desktop). A mono family for eyebrows, labels, numbers and times.
Check: `[script]` fonts list ≤ 2 families.

**design-headline-fade**: Headlines in two parts: statement in full text colour, punchline in muted grey (or in accent for one brand word).
Check: H1 and H2s use `.fade` on the punchline.

**design-cards**: Cards with a 1 px line and ~12 px radius, grids of 2–4 columns, generous section spacing. In preset `split`: dark sections carry stance and CTA, light sections carry facts.
Check: screenshots.

**design-visuals**: Mockups, method graphics, charts with one highlighted point. Photos only of real people and products, never stock.
Check: image list.

**design-motion**: Motion is small (typing effect in the H1, hover lift). Content is visible without scrolling animations.
Check: `[script]` no sections with opacity 0 until scrolled.

**design-footer**: Footer carries claim, phone, every money page and a keyword line.
Check: footer links ⊇ nav links ∪ detail pages.

## 9. Mobile

**mobile-sticky**: A sticky CTA bar appears once the hero CTA has scrolled away (never on the funnel page). Phone button in the header.
Check: `[script]` mobileStickyAfterScroll.

**mobile-tables**: Comparison tables turn into cards on mobile, own column first; charts keep readable labels.
Check: mobile screenshots of tables and charts.

**mobile-consent**: The consent banner is compact and leaves H1 and CTA visible; "Ablehnen" is as easy as "Akzeptieren".
Check: `<slug>.m-consent.png`.

## 10. SEO and technology

**seo-title**: Title "<Keyword>: <Nutzen> | Marke", ≤ 60 characters, different from the H1 (the H1 may be more emotional). The keyword also sits in the eyebrow.
Check: `[script]` length.

**seo-meta**: Meta description 120–155 characters: audience, outcome, one concrete fact (price, duration).
Check: `[script]` length.

**seo-h1**: Exactly one H1 per page.
Check: `[script]`.

**seo-alt**: Every content image has an alt text that says what it shows; decorative images have `alt=""`.
Check: `[script]` images without alt.

**seo-index**: Every public page is indexable (no `noindex`), except funnels' thank-you states, forms with personal data and legal pages by choice; drafts are always `noindex`.
Check: `[script]` robots.

**seo-schema**: Schema per page type: Organization + WebSite everywhere; Service with `offers` on service pages; FAQPage where a FAQ is visible; BreadcrumbList below the start page; Article with author (Person) and dates on articles; JobPosting on job pages; DefinedTerm on glossary entries.
Check: `[script]` schema column against this list.

**seo-hub**: Hub-and-spoke: the hub lists every detail page with a short description; each detail page links the hub (breadcrumb), 3–4 rotating siblings, and the footer lists all. No page gets only footer links.
Check: inbound links per detail page.

**seo-intent**: One page per search intent; keyword variants go into H2s and FAQ questions ("Ist <Marke> eine KI-Agentur?"). Glossary entries link to the matching article and money page; content hubs are in the main navigation.
Check: no two pages target the same keyword.

**seo-content-cta**: Articles carry a CTA after about a third and a dark CTA box at the end, the variant chosen by topic (founders, investors, method); the article text and the box address the same audience.
Check: article template.

**seo-og**: Every page has its own og:title and an auto-generated og:image.
Check: `[script]` shared og:title.

**seo-redirects**: Old URLs redirect to the topically matching page; internal links point at final URLs.
Check: crawl of old slugs.

**tech-performance**: Static or server-rendered HTML, fonts preloaded, ≤ 600 KB transfer on the start page before interaction, no third-party request before consent. Video: poster image first; self-hosted files load on click or when in view; YouTube/Vimeo embeds load only after consent (click-to-load with the poster).
Check: `[script]` transferKB, thirdPartyBeforeConsent, lcpMs.

**tech-tracking**: The event schema of `assets/next/track.ts` (cta_click with position, funnel_start, funnel_step, funnel_result_view, lead_submit, lead_error), pushed to `dataLayer`, tags loaded only after consent.
Check: events fire in the browser console during a funnel walk.

## 11. Legal (DE/EU) and guardrails

**legal-claims**: No unprovable success promises (UWG): "garantiert", "100 %", "sofort mehr Umsatz" only with proof. Results as ranges with conditions.
**legal-prices**: B2B prices netto with the B2B-only note; B2C prices brutto.
**legal-imprint**: Imprint and privacy linked from every page including the funnel; address and company as in the imprint; AI-generated visuals noted in the imprint.
**legal-consent**: No tracking before consent; equal "Ablehnen".
**legal-dark-patterns**: No fake timers, invented scarcity, pre-ticked options, confirmshaming, hidden costs.
**legal-en**: English pages for non-EU markets: keep the EU privacy setup, drop "netto" wording unless B2B, flag market-specific law as an open question for the user.
Check for all: read the copy against the list; when unsure, write "juristisch prüfen" into the report instead of deciding.
