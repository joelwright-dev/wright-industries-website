// Content-model rules derived from the Notion probe on 2026-05-13.
// See docs/decisions.md ADR-012 for the rationale.

import type { EntryType, ProjectStatus } from '~/lib/sources/ContentSource'

// Notion `Status` select values on the Projects DB.
export type NotionProjectStatus =
  | 'Active'
  | 'Planning'
  | 'Future'
  | 'On Hold'
  | 'Archived'

export const PROJECT_STATUS_MAP: Record<NotionProjectStatus, ProjectStatus> = {
  Active: 'active',
  Planning: 'planning',
  Future: 'future',
  'On Hold': 'on-hold',
  Archived: 'archived',
}

// Notion `Type` select values on the per-project notes DB.
// The user will add `Release` and re-tag existing entries.
export type NotionEntryType =
  | 'Research'
  | 'Ideation'
  | 'Decision'
  | 'Question'
  | 'Reference'
  | 'Sketch'
  | 'Structured Research Notes'
  | 'Release'

// The single Type value that is hidden from the public site. Everything else
// is public.
const HIDDEN_TYPE: NotionEntryType = 'Reference'

// Returns the public-site classification for an entry. Returns `null` when
// the entry must not appear on the public site at all.
export function classifyEntry(notionType: string | null | undefined): EntryType | null {
  if (notionType == null) return 'note' // unset Type defaults to note, still public
  if (notionType === HIDDEN_TYPE) return null
  if (notionType === 'Release') return 'release'
  return 'note'
}

export function normaliseProjectStatus(notionStatus: string | null | undefined): ProjectStatus {
  if (notionStatus && notionStatus in PROJECT_STATUS_MAP) {
    return PROJECT_STATUS_MAP[notionStatus as NotionProjectStatus]
  }
  return 'active' // sane default: if status is missing/unrecognised, treat as active
}

// Cover aspect-ratio targets — build-time warnings emitted on mismatch.
// (Warnings, not errors. See ADR-006.)
export const COVER_RATIO = {
  project: 3 / 2, // 3:2
  release: 16 / 9, // 16:9
} as const

// How loose to be when comparing actual ratio to target. 5% slack on either
// side accommodates Notion's image cropping quirks without false alarms.
export const COVER_RATIO_TOLERANCE = 0.05
