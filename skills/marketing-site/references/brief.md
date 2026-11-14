# Brief

The brief is the single source of truth for every page, draft, build and audit of a site. It lives in the project at `docs/marketing/brief.md`. Every claim on the site traces back to it; the consistency check compares the pages against it.

## Filling it

1. **Read first.** Pull every field you can from what exists: the current site (run `scripts/capture.mjs` on it), the repo, documents and notes the user points to, an existing brief. Record the source next to each answer (`Quelle: Startseite`, `Quelle: Gespräch 2026-11-14`). When the user asks for a "new website" and names no current one, whether one exists is the first question: an existing site means an audit comes first.
2. **Grill the gaps.** Invoke the `grilling` skill with the open fields as its plan, in the user's language and register. Grill as a design tree with this root: **audience (2) and offer focus (3)** first, then the main conversion (1); they decide the alternative (4), method (5), promise (6), offer ladder (7) and risk reversal (8). Fields 2–8 are always grilled, even when material exists: vague answers there sink the whole site. Low-stakes fields (urgency, tracking, preset when there is no brand) go into the round as stated assumptions to confirm, not as questions; a round holds at most six real questions.
   An existing brief the user calls agreed is not grilled again from scratch: check fields 2–8 for vague answers, contradictions and facts the pages will need but the brief lacks, and grill only those. When the user is not reachable, list them as questions at the hand-over and mark the affected copy as placeholder.
3. **Write the file** in the template below, after every round, so progress survives an interruption. A field the user cannot answer yet stays `OFFEN: <what is missing>`; the pages that need it get a marked placeholder.

The brief is complete when every required field has an answer or an explicit `OFFEN`, and fields 2–8 have survived grilling.

## Template

```markdown
# Marketing-Brief: <Marke>

Stand: <JJJJ-MM-TT> · Quellen: <…>

## 0. Ausgangslage
Bestehende Website: <URL | keine>   Anfragen heute: <Anzahl/Monat, Quellen: Empfehlung, Google, Social, Plattformen>
Ziel: <Anfragen/Monat oder Umsatz>   Kapazität: <how many new clients can be served>

## 1. Haupt-Conversion
<one action, e.g. "Kostenlosen Kanzlei-Check starten" → Quiz → Erstgespräch>
CTA-Text (überall gleich): "<…>"
Diagnose-Angebot (kostenlos, mit Ergebnis): <…>

## 2. Zielgruppe
Wer entscheidet: <Rolle>
Harte Eingrenzung (Zahl): <e.g. 10 bis 249 Mitarbeitende / Mindestbudget 5.000 € netto>
Situation und Auslöser: <why now>
Weitere Zielgruppen mit eigener Strecke: <none | e.g. Bewerber, Investoren>
Anrede: Sie | Du  (rule below)

## 3. Leistung und Schwerpunkt
Was wir verkaufen: <services/products>   Führt auf der Seite: <the one offer or project type the site leads with, and why: margin, proof, demand>

## 4. Alternative, gegen die wir uns abgrenzen
<what the visitor would do instead: ERP, agency, freelancer, doing it in-house, doing nothing>
Abgrenzungssatz: "Kein <X>. Ein <Y>." / "<Y>, nicht <X>."

## 5. Eigene Methode
Name: <…>   Schritte (nummeriert, Dauer, Preisart): <1 …, 2 …>
Ergebnis je Schritt (Zustand, nicht Tätigkeit): <…>

## 6. Kernversprechen
Ergebnis in ≤ 8 Wörtern: <…>   Mechanismus in einem Satz: <…>

## 7. Angebotsleiter
Kostenlos: <diagnosis>  →  Einstieg (Festpreis, anrechenbar): <…, price>  →  Hauptleistung: <…, price or "ab">  →  Laufend: <…>
Preise zeigen: ja | ab-Preise | Spannen | nein (Grund)
Netto/B2B-Hinweis: <…>

## 8. Risikoumkehr
<what the visitor can stop or get back, built into the method, e.g. "Kein Bauauftrag ohne überzeugenden Entwurf">

## 9. Belege (nur echte)
| Beleg | Art (Zahl, Testimonial, Logo, Fall, Arbeitsprobe/Showreel, Person) | Freigabe zur Nennung | Quelle |
Stärkster Beleg: <…>  (goes visible on the start page, never only in an accordion)
Fehlend: <→ marked placeholders, see rules: trust-no-invention>

## 10. Einwände (in Kundensprache)
<"Was kostet das?", "Verliere ich die Kontrolle?", "Was sagt mein Steuerberater?" …>
Haupteinwand der Kategorie: <…>   Antwort: <…>

## 11. Dringlichkeit (nur mit externem Beleg)
<law, deadline, season with source> | keine

## 12. Marke
Name, Logo-Schreibweise: <…>   Akzentfarbe: <hex | preset>   Schrift: <family | preset>
Preset: dark | split   Ton: <3 adjectives>   Verbotene Wörter: <…>

## 13. Seiten
<page list with type from blueprints.md, slug, primary keyword; always including Impressum and Datenschutz>
Funnel-Seite: <slug, e.g. /anfrage or /check>

## 14. Technik und Kontakt
Stack: <Next.js (new) | existing: …>   Lead-Ziel: LEAD_WEBHOOK_URL=<…> / Mail an <…>
Telefon, Adresse (wie im Impressum): <…>   Markt: DE | EU | EN
Tracking: GTM-ID <…> | keins   Consent-Tool: <…>
```

## Anrede

Set it once in field 2 and keep it on every page, in the funnel and in error messages.

- **Sie**: B2B decision makers from small business upward, regulated professions (tax, law, medicine), older target groups, high-ticket services.
- **Du**: founders, creatives, developers, B2C lifestyle, personal brands, communities.
- Existing site with a different choice: flag it in the audit and ask. A brand decision outranks the rule.

## When the brief changes

Update the file first, then the pages. A page that contradicts the brief is a finding in every audit (rule `trust-consistency`).
