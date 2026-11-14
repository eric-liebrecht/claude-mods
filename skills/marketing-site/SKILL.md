---
name: marketing-site
description: Builds and audits marketing websites that turn visitors into leads (SaaS, agencies, services, personal brands). Use when the user wants a new website or landing page, a relaunch, an HTML mockup of a site, more conversions or inquiries from an existing site, a CRO or website audit, a lead funnel or quiz, or better hero, CTA, pricing, proof or SEO on a marketing page.
---

# Marketing site

Two modes over one rule set: **Build** makes a site from a brief, **Audit** tests an existing one and fixes what the user releases. Both stand on [references/rules.md](references/rules.md) (every rule has an ID and a check) and [references/blueprints.md](references/blueprints.md) (section order per page type). Read both before the first page or the first verdict.

**The brief is the source of truth**: `docs/marketing/brief.md` in the project, per [references/brief.md](references/brief.md). Every claim on the site traces back to it. **Never invent proof**: testimonials, figures, logos, customers and ratings come from the brief or stay a marked placeholder (rule `trust-no-invention`).

Pick the mode from the request; a request that touches an existing site and asks for a new one is an audit followed by a build.

## Build

1. **Brief.** Read what exists (current site, repo, documents), then grill the gaps and always the positioning and the offer, with the `grilling` skill, per [references/brief.md](references/brief.md). Write `docs/marketing/brief.md`. Done when every required field has an answer or an explicit `OFFEN`.
2. **Draft.** New site or relaunch: the single-file HTML draft of every page per [references/draft.md](references/draft.md), self-audited, handed to the user. Wait for the release. A single new page or section in an existing site may skip the draft.
3. **Build.** Port the released draft per [references/build.md](references/build.md): Next.js with `assets/site.css` and the components in `assets/next/` for new sites, the project's own stack for existing ones.
4. **Self-audit** per [references/audit.md](references/audit.md#self-audit). Done when it passes; report the open placeholders and env variables.

## Audit

1. **Brief.** Use `docs/marketing/brief.md` if it exists; otherwise derive a provisional one from the site and mark it as derived.
2. **Run the audit** per [references/audit.md](references/audit.md): inventory, capture, mechanical report, every screenshot looked at, consistency check, prioritised report with hypothesis and metric per fix. Structural findings get an HTML draft of the improved page.
3. **Fix** what the user releases, in the project's code, then self-audit the changed pages.

## Assets and scripts

- `assets/site.css`: the one stylesheet (tokens, components, presets `dark` and `split`) for draft and build.
- `assets/draft-template.html`, `assets/draft.js`: the draft's example site and runtime (hash router, funnel engine, sticky CTA).
- `assets/next/`: funnel engine and config, `QuizFunnel`, `StickyCta`, server blocks, event tracking, lead route.
- `scripts/` (Node + Playwright, setup in audit.md): `assemble-draft.mjs`, `discover.mjs`, `capture.mjs`, `walk-funnel.mjs`, `report.mjs`. Each prints its usage when run without arguments.
