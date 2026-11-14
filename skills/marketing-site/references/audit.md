# Audit

Tests a site against every rule in [rules.md](rules.md) and ends in a prioritised report; fixes follow only on the user's release. Works on live URLs, local builds and draft files.

## Setup (once per machine)

`npm install --prefix <skill>/scripts && npx --prefix <skill>/scripts playwright install chromium`. In cloud sessions where Chromium is preinstalled, the install step may already be satisfied; run a script and install only if it fails. Write captures outside the repo, e.g. `/tmp/ms-audit/<site>/`.

## Steps

1. **Inventory**: `node <skill>/scripts/discover.mjs <origin> --links > pages.tsv`. Groups pages by template; `+link` marks pages missing from the sitemap. Funnels and forms are often among those: list them.
2. **Depth** (default): visual capture for the start page, every money page (services, audience tracks, pricing, about, contact) and every funnel or form page; for each other template (blog, glossary, legal, paginated lists) capture data for all pages and screenshots for one or two samples. Capture everything visually only when the user asks.
3. **Capture**: `node <skill>/scripts/capture.mjs <out> --list visual.tsv --shots` and `node <skill>/scripts/capture.mjs <out> --list rest.tsv`. Then `node <skill>/scripts/walk-funnel.mjs <funnel-url> <out>/funnel` for every funnel and form (it never submits).
4. **Mechanical report**: `node <skill>/scripts/report.mjs <out> --cta "<primary CTA label>"`. Its findings carry rule IDs.
5. **Look at every screenshot** of the visual set, desktop and mobile, top to bottom, plus every funnel screen, each slice at full size (a contact sheet of thumbnails does not count). A page whose report says `capture` was cut short gets re-captured with a higher `--max-slices`. For more than about six visual pages, dispatch reviewer subagents in parallel, one per page group, each with: the rules file path, its pages' screenshot and JSON paths, and the instruction to return per page the section order and a verdict per applicable rule with evidence (quote, section, screenshot file). You merge their results and verify their strongest claims in the JSON yourself before reporting them.
6. **Consistency**: collect every factual claim (prices, durations, conditions, location, who it is for, figures) from all page texts and the funnel; compare them with each other and with `docs/marketing/brief.md` if it exists. Each contradiction is a finding.
7. **Report** (below). Structural findings (section order, funnel, hero) additionally get a draft of the improved page per [draft.md](draft.md) once brief fields 1–8 come from the user; with a derived brief, the draft is the report's proposed next step after grilling those fields.
8. **Release**: ask the user which findings to fix. With the code in the project, implement the released fixes; otherwise the report is the deliverable.

The audit is complete when every rule has a verdict (pass, finding, n/a) for every captured page type, and every finding has evidence.

## Report

Write `docs/marketing/audit-<JJJJ-MM-TT>.md` in the project folder you work in (with or without git); only a site you have as nothing but a URL gets its report in `/tmp/ms-audit/<site>/`:

```markdown
# Audit <site> · <date>

**Kurzfazit**: biggest weakness, biggest lever (2–3 sentences).

## Prioritäten
| # | Regel | Seite(n) | Befund (Beleg) | Fix | Hypothese → Metrik | Wirkung | Aufwand |
|---|---|---|---|---|---|---|---|
| 1 | arch-cta-rhythm | /leistung | first CTA at 35 % (d-03.png) | CTA pair in the hero | more track starts → cta_click hero / sessions | hoch | klein |

## Was gut ist (keep)
## Alle Regeln
<rule → pass | finding | n/a, one line each>
## Offene Fragen
<anything needing the user's decision, "juristisch prüfen" items>
```

Order by impact × effort: first funnel and CTA gaps, then trust and consistency, then copy, design, SEO. Every fix names its hypothesis and the event or metric that proves it (event names from `assets/next/track.ts`).

## Self-audit

The same steps on your own output before calling it done: a draft (`file.html#/<slug>` per page) or a build (`next start` on localhost). Mandatory checks: every page captured desktop and mobile and looked at, funnel walked to the contact step, `report.mjs` clean except accepted exceptions, consistency against the brief clean, no invented proof. Fix, re-run, then report.
