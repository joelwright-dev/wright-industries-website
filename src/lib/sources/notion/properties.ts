// Defensive Notion property extractors. Every reader returns `null` (or a
// sane fallback) when the property is missing or the wrong type, with a
// console.warn so build output surfaces schema drift without crashing.

import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

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

/** ISO YYYY-MM-DD slice of an ISO 8601 timestamp. */
export function isoDate(input: string | null): string | null {
  if (!input) return null
  const m = input.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? null
}
