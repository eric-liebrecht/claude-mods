# HTML draft

The draft is one self-contained HTML file with every page of the site in its final design: plain CSS and plain JS, no framework, no build, no second file. It is the step where the user and the client see the whole site and release it; only a released draft gets built. It carries real copy from the brief and a working funnel; it carries no SEO meta (`noindex`, that comes in the build).

Required for a new site and a relaunch; optional for a single new page or section; in an audit, made when the findings change the page structure (new section order, new funnel, new hero).

## Make it

1. Copy `<skill>/assets/draft-template.html` to `docs/marketing/draft/source.html` in the project. It is a complete example site (start, detail, about, contact, funnel) with every component; replace its content entirely.
2. **Pages**: one `<main data-page="<slug>" data-title="…">` per page from brief field 13 (imprint and privacy included; a path like `/funktionen/ausfaelle` becomes `data-page="funktionen/ausfaelle"`), sections in the order of [blueprints.md](blueprints.md). Links between pages are `#/<slug>`; a link to a section is `#/<slug>?s=<id>`. Funnel pages get `data-bare`. Repeat the closing block with `<div data-closing-slot></div>`; it exists once, in the `<section data-closing>`.
3. **Brand**: override tokens in the head `<style>` block (`--accent`, fonts via the Google Fonts link plus `--font-sans`/`--font-mono`); preset `split` = `class="theme-split"` on `<body>`. Set `--accent-ink` (text on accent buttons) to whichever of `#fff` or `#0a0a0a` reaches 4.5:1 contrast on the accent. Change nothing in `site.css` for one client; a gap in the component set is a change to the skill.
4. **Copy**: from the brief only. Every proof element traces to brief field 9; a missing one is `<div class="placeholder">PROOF FEHLT: …</div>`; a missing photo `FOTO FEHLT`. Mockups use invented sample data that is obviously sample ("Kunde A", "GmbH, 12 MA") and the label "Beispielansicht".
5. **Visuals**: inline SVG only (icons, mockup charts, method graphics). Photos the brief provides may be embedded; everything else stays a placeholder.
6. **Funnel**: write the `<script type="application/json" id="funnel-config">`. Shape: `steps[]` (`id`, `short`, `question`, `hint`, `type` single|multi, `min`, `skippable`, `options[]` with `value`, `label`, `sub`, `n`), `result` (`expr` over step ids using each chosen option's `n`, `valueTemplate`, `explain` with `{step.label}` and `{value}`, `notes[]` with `when`), `contact` (`fields[]`, `promise`, `legal`, success texts), `webhook` (empty = the lead is logged to the console). The same JSON becomes `funnel-config.ts` in the build, unchanged.
7. **Assemble**: `node <skill>/scripts/assemble-draft.mjs docs/marketing/draft/source.html docs/marketing/draft/<marke>-entwurf.html`. It inlines `site.css` and `draft.js` and validates the funnel JSON.

## Check it before showing it

Run the self-audit of [audit.md](audit.md#self-audit) on the assembled file: `capture.mjs` with every page as `file.html#/<slug>`, `walk-funnel.mjs` on the funnel page's `#/<slug>` (brief field 13), `report.mjs`, then look at every screenshot. Fix and re-assemble until the rules hold. SEO findings (`seo-meta`, `seo-index`) do not apply to the draft.

## Hand it over

Send the assembled file to the user. Navigation: the page bar at the bottom, `#/alle` shows every page stacked (also for printing). Say which placeholders are open and what the brief still lacks. Wait for the release; feedback goes into the brief first, then into the draft.
