// Framework-agnostic renderable content blocks. The Notion adapter
// (`src/lib/sources/notion/blocks.ts`) converts Notion block objects into
// these; Astro components in `src/components/blocks/` render them. Adding a
// new variant requires updating the adapter, the renderer dispatcher, and
// the per-variant component.

/** Inline run inside a paragraph/heading/list item — a span of text with
 * Notion-style annotations and an optional link. */
export interface InlineRun {
  readonly text: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly code?: boolean
  readonly strikethrough?: boolean
  readonly underline?: boolean
  readonly href?: string | null
}

export type InlineRuns = readonly InlineRun[]

export type HeadingLevel = 1 | 2 | 3

export interface HeadingBlock {
  readonly kind: 'heading'
  readonly level: HeadingLevel
  readonly runs: InlineRuns
}

export interface ParagraphBlock {
  readonly kind: 'paragraph'
  readonly runs: InlineRuns
}

export interface ListBlock {
  readonly kind: 'list'
  readonly ordered: boolean
  readonly items: readonly ListItem[]
}

export interface ListItem {
  readonly runs: InlineRuns
  readonly children: readonly ContentBlock[]
}

export interface QuoteBlock {
  readonly kind: 'quote'
  readonly runs: InlineRuns
  readonly children: readonly ContentBlock[]
}

export interface CodeBlock {
  readonly kind: 'code'
  readonly code: string
  readonly language: string | null
  readonly caption: InlineRuns
}

export interface CalloutBlock {
  readonly kind: 'callout'
  readonly icon: string | null
  readonly runs: InlineRuns
  readonly children: readonly ContentBlock[]
}

export interface ToggleBlock {
  readonly kind: 'toggle'
  readonly summary: InlineRuns
  readonly children: readonly ContentBlock[]
}

export interface ImageBlock {
  readonly kind: 'image'
  /** Final local path — set by the build-time image download pipeline. */
  readonly src: string
  readonly width: number | null
  readonly height: number | null
  /** Alt text. Derived from caption if present; warned on absence. */
  readonly alt: string
  readonly caption: InlineRuns
  /** Figure number computed at render time based on figure-counter in the entry. */
  readonly figureNumber?: number
}

export interface DividerBlock {
  readonly kind: 'divider'
}

export interface BookmarkBlock {
  readonly kind: 'bookmark'
  readonly url: string
  readonly caption: InlineRuns
}

export interface EquationBlock {
  readonly kind: 'equation'
  readonly expression: string
}

export interface EmbedBlock {
  readonly kind: 'embed'
  readonly url: string
  readonly caption: InlineRuns
}

/** Notion `file`, `pdf`, `video`, `audio` blocks. `src` is the final local
 * URL after build-time download (or the external URL passed through). */
export type FileKind = 'file' | 'pdf' | 'video' | 'audio'

export interface FileBlock {
  readonly kind: 'file'
  readonly fileKind: FileKind
  readonly src: string
  readonly filename: string | null
  readonly mimeType: string | null
  readonly sizeBytes: number | null
  readonly caption: InlineRuns
}

export interface TableBlock {
  readonly kind: 'table'
  readonly hasHeaderRow: boolean
  readonly hasHeaderColumn: boolean
  readonly rows: readonly TableRow[]
}

export interface TableRow {
  readonly cells: readonly InlineRuns[]
}

/** Fallback for any block we don't yet handle. Renders as a console warning
 * during build and as a small mono notice in the page. Never silent. */
export interface UnknownBlock {
  readonly kind: 'unknown'
  readonly notionType: string
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | QuoteBlock
  | CodeBlock
  | CalloutBlock
  | ToggleBlock
  | ImageBlock
  | DividerBlock
  | BookmarkBlock
  | EquationBlock
  | EmbedBlock
  | FileBlock
  | TableBlock
  | UnknownBlock
