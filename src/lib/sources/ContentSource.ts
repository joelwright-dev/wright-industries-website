// Generic content source interface. The Notion implementation is the first
// consumer; a Shopify implementation will be added in Phase 2. Page templates
// depend only on this module — never on `@notionhq/client` directly.

// Project status — mirrors the actual Notion `Status` select values, lowered
// and kebabed. `active` is highlighted on the homepage; the rest are listed
// on `/projects` with their state labelled.
export type ProjectStatus =
  | 'active'
  | 'planning'
  | 'future'
  | 'on-hold'
  | 'archived'

// An entry is either a Note (rough build log / experiment / observation) or a
// Release (refined, formal milestone write-up). Distinction is driven by the
// Notion `Type` select on the per-project notes DB — `Release` → release;
// every other public Type → note. `Reference` is hidden entirely. See
// `src/config/content.ts`.
export type EntryType = 'note' | 'release'

export interface ProjectMeta {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string | null
  readonly status: ProjectStatus
  readonly started: string | null // ISO YYYY-MM-DD
  readonly coverUrl: string | null
}

export interface EntryMeta {
  readonly id: string
  readonly slug: string
  readonly projectSlug: string
  readonly projectTitle: string
  readonly title: string
  readonly type: EntryType
  readonly date: string // ISO YYYY-MM-DD
  readonly tags: readonly string[]
  readonly excerpt: string | null
  readonly docNumber: number // 1-based, per-project chronological
  readonly docNumberOverride: number | null
  readonly featured: boolean
  readonly coverUrl: string | null
}

import type { ContentBlock } from '~/lib/content-blocks'

export interface RenderedEntry extends EntryMeta {
  readonly blocks: readonly ContentBlock[]
}

export interface RenderedProject extends ProjectMeta {
  readonly blocks: readonly ContentBlock[]
}

export interface ContentSource {
  readonly name: string
  listProjects(): Promise<readonly ProjectMeta[]>
  getProject(slug: string): Promise<RenderedProject | null>
  listEntries(projectSlug: string): Promise<readonly EntryMeta[]>
  getEntry(projectSlug: string, slug: string): Promise<RenderedEntry | null>
  listAllEntries(): Promise<readonly EntryMeta[]>
}
