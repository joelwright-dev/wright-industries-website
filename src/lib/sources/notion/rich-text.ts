// Convert Notion rich_text arrays into the framework-agnostic InlineRun[]
// used by the renderer. Folds adjacent runs with identical formatting into a
// single InlineRun to keep the DOM tight.
//
// Page-link resolution: Notion page mentions (and bare text links to Notion
// page URLs) carry a Notion href like
// `https://www.notion.so/<title>-<32-hex-pageid>`. Without rewriting, those
// land users on Notion (often a permission-denied page). A resolver, built
// from the loaded project + entry metadata, maps page IDs → site URLs.

import type { RichTextItemResponse } from '@notionhq/client/build/src/api-endpoints'
import type { InlineRun, InlineRuns } from '~/lib/content-blocks'

/** Returns the site-internal URL for a Notion page ID, or null if unknown. */
export type LinkResolver = (notionPageId: string) => string | null

export function toRuns(
  items: ReadonlyArray<RichTextItemResponse>,
  resolveLink: LinkResolver = () => null,
): InlineRuns {
  const out: InlineRun[] = []
  for (const item of items) {
    const ann = item.annotations
    const text = item.plain_text
    if (text.length === 0) continue
    const href = resolveHref(item, resolveLink)
    const run: InlineRun = {
      text,
      ...(ann.bold ? { bold: true } : {}),
      ...(ann.italic ? { italic: true } : {}),
      ...(ann.code ? { code: true } : {}),
      ...(ann.strikethrough ? { strikethrough: true } : {}),
      ...(ann.underline ? { underline: true } : {}),
      ...(href ? { href } : {}),
    }
    const prev = out[out.length - 1]
    if (prev && sameFormatting(prev, run)) {
      out[out.length - 1] = { ...prev, text: prev.text + run.text }
    } else {
      out.push(run)
    }
  }
  return out
}

function resolveHref(
  item: RichTextItemResponse,
  resolveLink: LinkResolver,
): string | null {
  // Explicit page mention — most direct path.
  if (item.type === 'mention') {
    if (item.mention.type === 'page') {
      // Unresolvable mention → drop the href (renders as plain text) rather
      // than leak a Notion-only URL or 404 path.
      return resolveLink(item.mention.page.id)
    }
    if (item.mention.type === 'database') {
      return resolveLink(item.mention.database.id)
    }
  }
  // Bare link: if the href looks like a Notion page reference, try to
  // resolve it. If it identifies as Notion but doesn't resolve, drop the
  // href (Notion path-only `/<id>` would 404 on our site); otherwise pass
  // the original href through unchanged.
  if (item.href) {
    const pageId = extractNotionPageId(item.href)
    if (pageId !== null) {
      return resolveLink(pageId)
    }
    return item.href
  }
  return null
}

/** Notion href forms we want to recognise:
 *  - /<32hex>                         (path-only — what the API actually
 *    returns for an inline cmd-K link to another Notion page)
 *  - /<dashed-uuid>
 *  - https://www.notion.so/Workspace/Title-<32hex>
 *  - https://www.notion.so/<32hex>
 *  - https://www.notion.so/<dashed-uuid>
 *  - notion://... variants
 * Returns the page ID with dashes stripped, or null. */
export function extractNotionPageId(href: string): string | null {
  const isNotionScheme = /^notion:|notion\.so|notion\.site/.test(href)
  const isPathOnly = href.startsWith('/')
  if (!isNotionScheme && !isPathOnly) return null
  const last = href.split('?')[0]?.split('#')[0]?.split('/').pop() ?? ''
  // Dashed UUID at end
  const dashed = last.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  if (dashed?.[1]) return dashed[1].replace(/-/g, '').toLowerCase()
  // 32-hex (often after a slug-and-dash)
  const undashed = last.match(/([0-9a-f]{32})$/i)
  if (undashed?.[1]) return undashed[1].toLowerCase()
  return null
}

function sameFormatting(a: InlineRun, b: InlineRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.code === !!b.code &&
    !!a.strikethrough === !!b.strikethrough &&
    !!a.underline === !!b.underline &&
    (a.href ?? null) === (b.href ?? null)
  )
}

/** Plain-text reduction — for excerpts, alt fallbacks, etc. */
export function plainText(items: ReadonlyArray<RichTextItemResponse>): string {
  return items.map((i) => i.plain_text).join('')
}
