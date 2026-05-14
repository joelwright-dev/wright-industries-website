// Notion block → ContentBlock conversion. Consumes a tree of fetched Notion
// blocks (with children already resolved by `fetchBlockTree` in index.ts)
// and produces the framework-agnostic ContentBlock[] consumed by renderers.
//
// Consecutive bulleted_list_item / numbered_list_item blocks are folded into
// a single ListBlock. Image src starts as the original Notion URL — the
// build-time image pipeline rewrites these to local paths in a later pass.

import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'

import type {
  ContentBlock,
  ListItem,
  TableRow,
} from '~/lib/content-blocks'

import { toRuns, plainText } from './rich-text'

/** A Notion block plus its (recursively resolved) children. */
export interface BlockNode {
  readonly block: BlockObjectResponse
  readonly children: readonly BlockNode[]
}

export function convertBlocks(nodes: readonly BlockNode[]): readonly ContentBlock[] {
  const out: ContentBlock[] = []
  let listBuf: { ordered: boolean; items: ListItem[] } | null = null

  const flushList = (): void => {
    if (!listBuf) return
    out.push({ kind: 'list', ordered: listBuf.ordered, items: listBuf.items })
    listBuf = null
  }

  for (const node of nodes) {
    const t = node.block.type

    if (t === 'bulleted_list_item' || t === 'numbered_list_item') {
      const ordered = t === 'numbered_list_item'
      const runs = t === 'bulleted_list_item'
        ? toRuns(node.block.bulleted_list_item.rich_text)
        : toRuns(node.block.numbered_list_item.rich_text)
      const item: ListItem = {
        runs,
        children: convertBlocks(node.children),
      }
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList()
        listBuf = { ordered, items: [] }
      }
      listBuf.items.push(item)
      continue
    }

    flushList()

    const converted = convertOne(node)
    if (converted) out.push(converted)
  }

  flushList()
  return out
}

function convertOne(node: BlockNode): ContentBlock | null {
  const b = node.block
  switch (b.type) {
    case 'heading_1':
      return { kind: 'heading', level: 1, runs: toRuns(b.heading_1.rich_text) }
    case 'heading_2':
      return { kind: 'heading', level: 2, runs: toRuns(b.heading_2.rich_text) }
    case 'heading_3':
      return { kind: 'heading', level: 3, runs: toRuns(b.heading_3.rich_text) }
    case 'paragraph':
      return { kind: 'paragraph', runs: toRuns(b.paragraph.rich_text) }
    case 'quote':
      return {
        kind: 'quote',
        runs: toRuns(b.quote.rich_text),
        children: convertBlocks(node.children),
      }
    case 'code':
      return {
        kind: 'code',
        code: plainText(b.code.rich_text),
        language: b.code.language && b.code.language !== 'plain text' ? b.code.language : null,
        caption: toRuns(b.code.caption),
      }
    case 'callout':
      return {
        kind: 'callout',
        icon: extractIcon(b.callout.icon),
        runs: toRuns(b.callout.rich_text),
        children: convertBlocks(node.children),
      }
    case 'toggle':
      return {
        kind: 'toggle',
        summary: toRuns(b.toggle.rich_text),
        children: convertBlocks(node.children),
      }
    case 'image': {
      const src = b.image.type === 'external' ? b.image.external.url : b.image.file.url
      const caption = toRuns(b.image.caption)
      const alt = plainText(b.image.caption).trim()
      if (alt.length === 0) {
        console.warn(
          `[notion] image block ${b.id} has no caption/alt text — add a caption in Notion for accessibility`,
        )
      }
      return {
        kind: 'image',
        src,
        width: null,
        height: null,
        alt: alt.length > 0 ? alt : '',
        caption,
      }
    }
    case 'divider':
      return { kind: 'divider' }
    case 'bookmark':
      return {
        kind: 'bookmark',
        url: b.bookmark.url,
        caption: toRuns(b.bookmark.caption),
      }
    case 'equation':
      return { kind: 'equation', expression: b.equation.expression }
    case 'embed':
      return {
        kind: 'embed',
        url: b.embed.url,
        caption: toRuns(b.embed.caption),
      }
    case 'table': {
      const rows: TableRow[] = node.children
        .filter((c) => c.block.type === 'table_row')
        .map((c) => {
          const tr = c.block as Extract<BlockObjectResponse, { type: 'table_row' }>
          return { cells: tr.table_row.cells.map((cell) => toRuns(cell)) }
        })
      return {
        kind: 'table',
        hasHeaderRow: b.table.has_column_header,
        hasHeaderColumn: b.table.has_row_header,
        rows,
      }
    }
    case 'table_row':
      // Handled by the table case via children.
      return null
    case 'child_database':
      // Used by discovery; not rendered.
      return null
    case 'column_list':
    case 'column':
      // Notion columns flatten into sequential blocks for now — the site
      // doesn't have a multi-column body layout. Children are spread inline.
      // (We return null here; caller flattens children in a preprocessing
      // step if needed. For now they collapse.)
      return null
    default: {
      console.warn(`[notion] unsupported block type: ${b.type}`)
      return { kind: 'unknown', notionType: b.type }
    }
  }
}

function extractIcon(
  icon:
    | { type: 'emoji'; emoji: string }
    | { type: 'external'; external: { url: string } }
    | { type: 'file'; file: { url: string; expiry_time: string } }
    | { type: 'custom_emoji'; custom_emoji: { id: string; name: string; url: string } }
    | null,
): string | null {
  if (!icon) return null
  if (icon.type === 'emoji') return icon.emoji
  if (icon.type === 'custom_emoji') return icon.custom_emoji.name
  return null
}

/** Walk a block tree and apply figure numbering to image blocks (1-based,
 * in document order). Pure — does not mutate; returns a fresh tree. */
export function numberFigures(blocks: readonly ContentBlock[]): readonly ContentBlock[] {
  let counter = 0
  function walk(bs: readonly ContentBlock[]): readonly ContentBlock[] {
    return bs.map((b) => {
      if (b.kind === 'image') {
        counter += 1
        return { ...b, figureNumber: counter }
      }
      if (b.kind === 'quote' || b.kind === 'callout' || b.kind === 'toggle') {
        return { ...b, children: walk(b.children) }
      }
      if (b.kind === 'list') {
        return {
          ...b,
          items: b.items.map((it) => ({ ...it, children: walk(it.children) })),
        }
      }
      return b
    })
  }
  return walk(blocks)
}
