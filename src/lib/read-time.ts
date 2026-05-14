// Rough reading-time estimator over a ContentBlock tree. Recurses into
// containers (list, quote, callout, toggle) and counts code-block words.
// Skips non-text blocks (image, divider, bookmark, equation, embed, table).

import type { ContentBlock, InlineRuns } from './content-blocks'

function runsToWordCount(runs: InlineRuns): number {
  const text = runs.map((r) => r.text).join(' ')
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

function blockWordCount(blocks: readonly ContentBlock[]): number {
  let total = 0
  for (const b of blocks) {
    switch (b.kind) {
      case 'paragraph':
      case 'heading':
        total += runsToWordCount(b.runs)
        break
      case 'quote':
      case 'callout':
        total += runsToWordCount(b.runs) + blockWordCount(b.children)
        break
      case 'toggle':
        total += runsToWordCount(b.summary) + blockWordCount(b.children)
        break
      case 'list':
        for (const item of b.items) {
          total += runsToWordCount(item.runs) + blockWordCount(item.children)
        }
        break
      case 'code':
        total += b.code.split(/\s+/).filter((w) => w.length > 0).length
        break
      default:
        break
    }
  }
  return total
}

export function estimatedReadMinutes(
  blocks: readonly ContentBlock[],
  wpm = 200,
): number {
  return Math.max(1, Math.round(blockWordCount(blocks) / wpm))
}
