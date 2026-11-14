# Blueprints

Section order per page type. Each line: section → its job → the rules it carries. Every content page ends with the closing block (`arch-closing`) and the footer; the SEO FAQ (`arch-seo-below`) goes between them where the page targets a keyword.

## Start page

1. **Hero** → promise, CTA, proof points, mockup → hero-*
2. **Passt, wenn** → problem in four pain cards + hard number → strat-hard-number
3. **Angebot** → mockups of the product + cards per area/service, each linking its detail page → seo-hub
4. **Ablauf** → named method, numbered, duration and price type per step → strat-method, trust-process
5. **Preismodell** → price cards = method steps, entry marked → price-*
6. **Belege** → figures row and testimonials; without proof: scenarios "Heute / Mit uns" → trust-*
7. **Vertrauen** → main objection of the category as four cards → trust-objection-section
8. **FAQ** → objections, last "Wie starte ich?" → faq-objections
9. **Closing block** → arch-closing
10. **SEO FAQ** (optional) → arch-seo-below

## Detail page (service, product module, feature)

One template for all siblings (`arch-detail-template`).

1. **Hero** → breadcrumb, eyebrow "<TYP> · <BEREICH>", H1 "<Keyword>: <Ergebnis>.", lead, process chips, CTA pair with `?paket=`
2. **Mockup** of this module, labelled
3. **Problem → Leistung** → narrow prose column, 4–5 bullets (SEO body)
4. **Kontrolle / Einwände** of this module → 1–2 H2
5. **Bezug zum Hauptprodukt** → one paragraph, link to the hub (written per page, never one paragraph pasted on all siblings)
6. **Beispieltag** with clock times, or a **calculator** (inputs → result → disclaimer) where the value is countable
7. **FAQ** ≥ 3 questions about this module
8. **Weitere** → 3–4 sibling cards, rotating so every sibling is linked; with a single detail page, cards to the hub's other offers or the method instead
9. **Closing block**; where the funnel's first question has an option for this module, link the module's CTAs with that option (`?<step>=<value>`)

## Hub page (list of detail pages)

1. **Hero** with CTA pair
2. **Katalog** → one card per detail page: label, H3, one sentence, process chips, link → seo-hub
3. **Wie es arbeitet** → three stages (e.g. "Läuft mit / Sie geben frei / Nur noch Ausnahmen")
4. **Konkret** → example day or tabbed examples
5. **Szenarien** → today / with us
6. **FAQ**, **closing block**

## Audience track (one per audience when strat-segments applies)

1. **Hero** → identity headline ("Wir suchen Co-Founder mit Unternehmer-DNA"), CTA to the track's form in the first screen
2. **Was du bekommst** → offer cards
3. **Wen wir suchen** → criteria cards (copy-identity)
4. **Das ist nichts für dich, wenn …** → copy-disqualify
5. **Reden wir über Geld** → conditions with numbers (copy-honest)
6. **Ablauf** → numbered steps from application to start, purpose per step
7. **Stimmen** of this audience → trust-targeted
8. **FAQ** → conditions and objections
9. **CTA band** whose H2 matches its button, **SEO FAQ**

Role/listing pages inside a track: hero with H1 "<Rolle> (m/w/d) als <…> gesucht", mission, must-haves, proof required, not-for-you, CTA with `?rolle=`, JobPosting schema.

## About page

1. **Hero** → H1 states what the team does for the customer, CTA pair
2. **Menschen** → every person: photo, name, role, bio with checkable fact, LinkedIn (trust-people)
3. **Wie wir arbeiten** → 3–5 principles as bold short sentences + one line each ("Erst sehen, dann zahlen.")
4. **Hinter der Marke** → company, location as in the imprint, founding year, figures
5. **Closing block**

## Contact page (router)

1. **Hero** → "Wählen Sie Ihren Weg oder rufen Sie an."
2. **Router cards** → one per audience/track, each with its CTA; one card for existing customers; one for phone
3. **Short form** for everything else (name, email, message), response promise
4. Address, phone, map link as in the imprint

## Funnel page

Bare (`arch-bare-funnel`): logo + "Schließen ×" → eyebrow → H1 "Ihre erste Einschätzung in <n> Fragen." → risk micro-copy → funnel card (questions → result → contact) → imprint/privacy links. Rules: funnel-*.

## Article (blog, guide, pillar)

Breadcrumb → H1 (keyword + promise) → author with photo and date → intro answering the query in 2–3 sentences → table of contents (pillar only) → H2/H3 body with glossary links → inline CTA at ~⅓ → FAQ (pillar) → CTA box by topic → 3 related articles. Schema Article + Person + BreadcrumbList (+ FAQPage). Pillar pages link every article of their cluster and are linked from the content hub.

## Glossary entry

H1 = term → definition in the first sentence → 2–4 H2 (Bedeutung, Beispiel, Abgrenzung) with ≥ 300 words total → link to the matching article and money page → CTA box by topic → related terms. Schema DefinedTerm in a DefinedTermSet. The glossary index shows a one-line definition per term.

## Legal pages

Header with CTA, plain content, full footer. Imprint lists every managing director and notes AI-generated visuals.
