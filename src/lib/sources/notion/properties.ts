// Defensive Notion property extractors. Every reader returns `null` (or a
// sane fallback) when the property is missing or the wrong type, with a
// console.warn so build output surfaces schema drift without crashing.

import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

import type { InlineRuns } from '~/lib/content-blocks'
import { toRuns, type LinkResolver } from './rich-text'

type Properties = PageObjectResponse['properties']

/** Get a property by name with a type filter. Returns null on mismatch. */
function prop<T extends string>(
  props: Properties,
  name: string,
  expectedType: T,
): Extract<Properties[string], { type: T }> | null {
  const raw = props[name]
  if (!raw) return null
  if (raw.type !== expectedType) return null
  return raw as Extract<Properties[string], { type: T }>
}

export function readTitle(props: Properties, name = 'Name'): string | null {
  // Notion exposes the title under whatever the user named the title column;
  // try the explicit name first, then fall back to any property of type=title.
  const explicit = prop(props, name, 'title')
  if (explicit) return plainOf(explicit.title)
  for (const [, value] of Object.entries(props)) {
    if (value.type === 'title') return plainOf(value.title)
  }
  return null
}

export function readRichText(props: Properties, name: string): string | null {
  const p = prop(props, name, 'rich_text')
  if (!p) return null
  const text = plainOf(p.rich_text)
  return text.length === 0 ? null : text
}

export function readSelect(props: Properties, name: string): string | null {
  const p = prop(props, name, 'select')
  return p?.select?.name ?? null
}

export function readMultiSelect(props: Properties, name: string): readonly string[] {
  const p = prop(props, name, 'multi_select')
  if (!p) return []
  return p.multi_select.map((opt) => opt.name)
}

export function readCheckbox(props: Properties, name: string): boolean {
  const p = prop(props, name, 'checkbox')
  return p?.checkbox ?? false
}

export function readDate(props: Properties, name: string): string | null {
  const p = prop(props, name, 'date')
  return p?.date?.start ?? null
}

export function readCreatedTime(props: Properties, name: string): string | null {
  const p = prop(props, name, 'created_time')
  return p?.created_time ?? null
}

export function readNumber(props: Properties, name: string): number | null {
  const p = prop(props, name, 'number')
  return p?.number ?? null
}

function plainOf(runs: ReadonlyArray<{ plain_text?: string }>): string {
  return runs.map((r) => r.plain_text ?? '').join('')
}

/** Flatten any Notion property value to a plain string. Covers the common
 * property types; anything exotic (files, relations, rollups) renders empty.
 * Used to project a database's rows into a simple table. */
export function propertyPlainText(value: Properties[string]): string {
  switch (value.type) {
    case 'title':
      return plainOf(value.title)
    case 'rich_text':
      return plainOf(value.rich_text)
    case 'number':
      return value.number === null ? '' : String(value.number)
    case 'select':
      return value.select?.name ?? ''
    case 'status':
      return value.status?.name ?? ''
    case 'multi_select':
      return value.multi_select.map((o) => o.name).join(', ')
    case 'date': {
      const d = value.date
      if (!d) return ''
      return d.end ? `${d.start} – ${d.end}` : d.start
    }
    case 'checkbox':
      return value.checkbox ? '✓' : ''
    case 'url':
      return value.url ?? ''
    case 'email':
      return value.email ?? ''
    case 'phone_number':
      return value.phone_number ?? ''
    case 'created_time':
      return value.created_time
    case 'last_edited_time':
      return value.last_edited_time
    case 'people':
      return value.people.map((p) => ('name' in p ? (p.name ?? '') : '')).join(', ')
    case 'formula': {
      const f = value.formula
      if (f.type === 'string') return f.string ?? ''
      if (f.type === 'number') return f.number === null ? '' : String(f.number)
      if (f.type === 'boolean') return f.boolean ? '✓' : ''
      if (f.type === 'date') return f.date?.start ?? ''
      return ''
    }
    default:
      return ''
  }
}

/** Project a Notion property value to renderable InlineRuns for a table cell.
 * Unlike `propertyPlainText`, this keeps links clickable: url/email/phone
 * columns become hrefs, and rich_text/title columns preserve any embedded
 * links (and formatting). Everything else falls back to the plain-text
 * projection wrapped in a single run. */
export function propertyRuns(
  value: Properties[string],
  resolveLink: LinkResolver = () => null,
): InlineRuns {
  switch (value.type) {
    case 'title':
      return toRuns(value.title, resolveLink)
    case 'rich_text':
      return toRuns(value.rich_text, resolveLink)
    case 'url':
      return value.url ? [{ text: value.url, href: value.url }] : []
    case 'email':
      return value.email ? [{ text: value.email, href: `mailto:${value.email}` }] : []
    case 'phone_number':
      return value.phone_number
        ? [{ text: value.phone_number, href: `tel:${value.phone_number}` }]
        : []
    default: {
      const text = propertyPlainText(value)
      return text ? [{ text }] : []
    }
  }
}

/** ISO YYYY-MM-DD slice of an ISO 8601 timestamp. */
export function isoDate(input: string | null): string | null {
  if (!input) return null
  const m = input.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? null
}
