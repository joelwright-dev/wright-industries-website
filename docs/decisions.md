# Decision log

ADR-lite entries documenting non-obvious choices. New decisions are appended at
the bottom; previous decisions are not edited in place — superseding entries
reference the original.

---

## ADR-001 · 2026-05-13 · Full SSG, no ISR

**Context.** The brief asked for Astro hybrid + ISR-style revalidation. Astro 5
collapsed `hybrid` into `static` + per-route `prerender = false`; full SSR is
reserved for `/api/*` endpoints.

**Decision.** Full static site generation. `/api/revalidate` triggers a Vercel
Deploy Hook that rebuilds the entire site on Notion content changes.

**Why.** The dataset is small (tens of notes initially), so whole-site rebuilds
are cheap. Pagefind only indexes statically-built pages — ISR'd routes would
silently fail to appear in search. One source of truth for what's deployed.

---

## ADR-002 · 2026-05-13 · Typography — Newsreader + IBM Plex Mono

**Decision.** Newsreader (Production Type, OFL) handles body text **and**
display sizes via its optical-size variable axis. IBM Plex Mono carries
chrome, marginalia, code, figure numbers. Both self-hosted as WOFF2 — never
loaded from Google Fonts CDN.

**Why.** Single serif family for body + display mirrors how 1960s NASA
technical reports and Bell Labs journals actually set type: same voice,
louder. Plex Mono is period-correct to the IBM-era aesthetic the brief calls
out and pairs cleanly with the IBM-red accent.

---

## ADR-003 · 2026-05-13 · Colour — flag, not brand

**Decision.** Warm cream background (`#F2EDE0` light / `#1A1612` dark). IBM-era
red (`#C8102E` light / `#E63946` dark) used only as a flag — emphasis bars,
hover states, current-section indicators, the `RELEASE` badge in feeds. Navy
(`#1F3A5F` / `#7AA0CC`) carries secondary emphasis and default link colour.
Body links underlined always; hover swaps to red.

**Why.** Editorial restraint. The artefact aesthetic depends on colour being
meaningful rather than ambient.

---

## ADR-004 · 2026-05-13 · Document numbering — per-project chronological

**Decision.** Each note and release receives a document number scoped to its
project: `DOC NIXIE-V3 / 0042`. Computed at build time from chronological order
of published entries within that project. An optional Notion `DocNumber`
property on the entry overrides the computed value for manual renumbering after
draft deletions.

**Why.** Per-project is more meaningful than a global counter and survives
reordering. The override handles edge cases (deleted drafts shifting numbers,
deliberate renumbering for a milestone) without forcing schema gymnastics.

---

## ADR-005 · 2026-05-13 · ContentSource interface in Phase 1

**Decision.** All content access goes through a `ContentSource` interface
(`src/lib/sources/ContentSource.ts`). Notion is the first implementation.
Phase 2 Shopify (`/shop`) becomes a second implementation rather than a
parallel system. The `/shop` route is reserved in the routing structure but no
pages are built in Phase 1.

**Why.** Retrofitting an abstraction is expensive; the upfront cost is small
and isolates Notion-specific concerns (presigned URL handling, block
rendering) from the page templates.

---

## ADR-006 · 2026-05-13 · Image strategy — build-time download, content hash

**Decision.** All Notion-hosted images are downloaded at build time to
`public/_notion-images/<sha256-prefix>.<ext>`, the directory is gitignored,
and block URLs are rewritten to local paths. Images are served with
`Cache-Control: public, max-age=31536000, immutable`.

Build emits **warnings** (not errors) when:
- An image is missing `alt` text in Notion's caption field;
- A project cover deviates from 3:2;
- A release cover deviates from 16:9.

**Why.** Notion presigned URLs expire ~1 hour, so deferring to Notion at
request time fails on a delay. Content-hashed filenames mean unchanged images
don't churn between builds. Warnings (not errors) keep the build green while
the user catches up — the brief explicitly preferred this over hard failure.

---

## ADR-007 · 2026-05-13 · Date formatting — ISO in mono, DMY in prose

**Decision.** `YYYY-MM-DD` (ISO 8601) in every monospace context — document
strips, marginalia, feeds, code. `13 May 2026` (DMY, AU convention) only in
body prose. Centralised in `src/lib/dates.ts` (`formatIso`, `formatProse`).
Never mixed within a single context.

**Why.** ISO format reads as "stamped on the document" and reinforces the
artefact feel. DMY is natural for AU body prose. Strict separation prevents
visual drift.

---

## ADR-008 · 2026-05-13 · Footer — staged business naming

**Decision.** Until the J. Wright Industries business name is active at ASIC,
footer reads:

> WRIGHT INDUSTRIES · BRISBANE · ABN XX XXX XXX XXX

After registration, the `J.` prefix and the real ABN are swapped in via two
constants in `src/config/business.ts`.

**Why.** Avoids implying registration before it has been granted.

---

## ADR-009 · 2026-05-13 · Mono ceiling — three sizes

**Decision.** IBM Plex Mono appears in exactly three sizes across the site:

1. Chrome — document strips, navigation, footer
2. Marginalia — dates, doc numbers, project crumbs, tags
3. Figure captions — image captions, code-block labels

A fourth size requires explicit discussion before adoption.

**Why.** Editorial restraint depends on disciplined repetition. The brief
flagged mono proliferation as a real risk; this codifies the ceiling.

---

## ADR-010 · 2026-05-13 · Colophon page

**Decision.** `/colophon` is part of Phase 1. Contents: typefaces (with
foundry attribution), full stack, build tooling, design references (NASA TR /
IBM / Bell Labs / Vignelli), GitHub repo link when public. Set as a single
document page, no navigation chrome beyond the standard masthead.

**Why.** A real colophon is exactly the kind of artefact-feeling detail that
sells the aesthetic — and it's also genuinely useful for anyone curious about
how the site was built.

---

## ADR-012 · 2026-05-13 · Content-model rules (post-probe)

**Context.** Notion probe revealed the real schema differs from the brief's
assumed schema in two important ways:

1. The notes DB has no `Release` Type value; existing Types are Research,
   Ideation, Decision, Question, Reference, Sketch, Structured Research
   Notes.
2. The Status select is a kanban-style workflow (`Inbox`, `Active`,
   `Resolved`, `Archived`), not a Draft/Published gate, and most entries
   have Status unset.

**Decisions.**

- The user will **add `Release` as a new Type value** in the notes DB and
  re-tag entries as appropriate. The site treats `Type === 'Release'` as
  releases.
- **Visibility is Type-driven, not Status-driven.** `Type === 'Reference'`
  is hidden from the public site. Every other Type (including unset) is
  public.
- Status remains the user's private workflow tool; the site does not read it.
- **Project status** widened from the brief's `active | paused | archived`
  to mirror Notion: `active | planning | future | on-hold | archived`.
  `Active` is highlighted on the homepage strip; the others are listed on
  `/projects` with their state labelled.
- Mapping codified in `src/config/content.ts` (`classifyEntry`,
  `normaliseProjectStatus`).

**Why.** Adopt the user's actual mental model rather than forcing the brief's
nominal schema. `Reference` reads as the inbox/triage bucket — exactly the
kind of unfinished material that shouldn't be public. Type-driven visibility
also means the user keeps Status as a real workflow tool unencumbered by
publishing concerns.

---

## ADR-011 · 2026-05-13 · pnpm 11 — explicit build approvals

**Decision.** `pnpm-workspace.yaml` declares an `allowBuilds` map approving
`esbuild` and `sharp` postinstall scripts. No other packages are approved.

**Why.** pnpm 10+ moved to opt-in for postinstall scripts as a supply-chain
hardening measure — by default scripts are ignored and `pnpm` exits 1 with
a warning until the user explicitly approves each package. Both `esbuild`
and `sharp` are first-party Astro dependencies whose scripts we trust.
Approving them in the workspace file keeps the policy in version control
where it's reviewable.

**How.** New native dependencies added later must be approved in
`pnpm-workspace.yaml`. Don't add a blanket "approve all" — the per-package
gate is the value of the feature.
