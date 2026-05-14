// Renders an InlineRun[] as an escaped HTML string. The Astro block
// components splice this in via `set:html`. Escaping covers the four
// reserved chars in text + attribute contexts, and href values are filtered
// to safe schemes only (http, https, mailto, tel, anchor #, relative /).

import type { InlineRuns } from './content-blocks'

const SAFE_SCHEMES = ['http://', 'https://', 'mailto:', 'tel:']

function escapeText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(input: string): string {
  return escapeText(input).replace(/"/g, '&quot;')
}

function isSafeHref(href: string): boolean {
  if (href.startsWith('/') || href.startsWith('#')) return true
  return SAFE_SCHEMES.some((scheme) => href.toLowerCase().startsWith(scheme))
}

export function inlineHTML(runs: InlineRuns): string {
  return runs.map(renderRun).join('')
}

function renderRun(run: InlineRuns[number]): string {
  let html = escapeText(run.text)
  if (run.code) html = `<code>${html}</code>`
  if (run.bold) html = `<strong>${html}</strong>`
  if (run.italic) html = `<em>${html}</em>`
  if (run.strikethrough) html = `<s>${html}</s>`
  if (run.underline) html = `<u>${html}</u>`
  if (run.href && isSafeHref(run.href)) {
    html = `<a href="${escapeAttr(run.href)}">${html}</a>`
  }
  return html
}

/** Plain-text reduction — for excerpts, OG descriptions, etc. */
export function inlineText(runs: InlineRuns): string {
  return runs.map((r) => r.text).join('')
}
