// Convert Notion rich_text arrays into the framework-agnostic InlineRun[]
// used by the renderer. Folds adjacent runs with identical formatting into a
// single InlineRun to keep the DOM tight.

import type { RichTextItemResponse } from '@notionhq/client/build/src/api-endpoints'
import type { InlineRun, InlineRuns } from '~/lib/content-blocks'

export function toRuns(items: ReadonlyArray<RichTextItemResponse>): InlineRuns {
  const out: InlineRun[] = []
  for (const item of items) {
    const ann = item.annotations
    const text = item.plain_text
    if (text.length === 0) continue
    const run: InlineRun = {
      text,
      ...(ann.bold ? { bold: true } : {}),
      ...(ann.italic ? { italic: true } : {}),
      ...(ann.code ? { code: true } : {}),
      ...(ann.strikethrough ? { strikethrough: true } : {}),
      ...(ann.underline ? { underline: true } : {}),
      ...(item.href ? { href: item.href } : {}),
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
