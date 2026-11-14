# Build (Next.js)

Turns a released draft into the production site. New sites: Next.js App Router with `assets/site.css` as the only stylesheet (no Tailwind; one component source for draft and build). Existing projects: keep their stack and styling system; port the structure, copy and funnel, and map `site.css` tokens onto the project's theme.

## Set up (new site)

1. `npx create-next-app@latest <name> --ts --app --eslint --no-tailwind --src-dir=false --import-alias "@/*"`.
2. Copy into the project:
   - `assets/site.css` → `app/site.css`, imported once in `app/layout.tsx`; brand tokens from the draft's head `<style>` go into `app/brand.css`, imported after it.
   - `assets/next/funnel-engine.ts`, `QuizFunnel.tsx`, `StickyCta.tsx`, `blocks.tsx`, `track.ts` → `components/marketing/`.
   - `assets/next/funnel-config.ts` → `funnel-config.ts`, then paste the released draft's funnel JSON into it (fix its import path to `@/components/marketing/funnel-engine`).
   - `assets/next/lead-route.ts` → `app/api/lead/route.ts`.
3. Fonts with `next/font/google` (preloaded, no layout shift), assigned to `--font-sans` / `--font-mono`.

## Port the draft

- Route groups: `app/(site)/layout.tsx` renders header, footer and `<StickyCta href="/anfrage" label="<CTA>" />`; `app/(bare)/anfrage/page.tsx` renders only logo, "Schließen ×" and `<Suspense><QuizFunnel config={funnelConfig} /></Suspense>`.
- Every `data-page` becomes a route; `#/x` links become `/x`; `#/x?s=id` becomes `/x#id`; `#/anfrage?ziel=a` becomes `/anfrage?ziel=a`.
- Sections stay HTML with the same classes; use `SectionHead`, `Mockup`, `PricingSteps`, `Faq`, `ClosingBlock`, `Placeholder` from `blocks.tsx` where they fit. Keep `data-cta="<position>"` on every CTA (header, hero, pricing, closing, sticky, contact, content).
- The header CTA in the dark preset is the light button (`btn--light`): the accent stays for the page's primary action.

## SEO

- `metadata` per route: title and description per rules seo-title / seo-meta, canonical, `openGraph.title` per page.
- `app/<route>/opengraph-image.tsx` with `ImageResponse`: page title on the brand background, so every page has its own og:image.
- JSON-LD per page type (rule seo-schema) with `JsonLd`; Organization and WebSite once in the root layout; Service with `offers` from the pricing data.
- `app/sitemap.ts` and `app/robots.ts`; redirects for old URLs in `next.config` (rule seo-redirects).
- Remove the draft's `noindex`.

## Leads and tracking

- Env: `LEAD_WEBHOOK_URL` (first choice), `RESEND_API_KEY` + `LEAD_MAIL_TO` (+ `LEAD_MAIL_FROM`) as fallback. Document them in `.env.example`. The route rejects incomplete leads, drops honeypot hits and returns 502 when neither channel delivers, so the visitor sees the error and can call.
- Tracking: `track.ts` pushes the event schema to `dataLayer`; GTM (or the brief's tag) loads only after consent through the consent tool. No tag in the HTML before consent (rule tech-performance).

## Done means

The self-audit of [audit.md](audit.md#self-audit) passes on `next build && next start`: every rule checked, every page captured on desktop and mobile, the funnel walked to the contact step, the consistency check against the brief clean, and `next build` without type or lint errors. Then report to the user with the open placeholders and the env variables still to set.
