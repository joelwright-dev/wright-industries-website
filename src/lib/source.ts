// Module-level singleton — every page imports `source` from here and never
// instantiates a content source directly. Swapping the implementation (e.g.
// adding Shopify in Phase 2) happens in this file.

import { NOTION_TOKEN, NOTION_PROJECTS_DATABASE_ID } from 'astro:env/server'
import type { ContentSource } from './sources/ContentSource'
import { NotionContentSource } from './sources/notion'

export const source: ContentSource = new NotionContentSource({
  token: NOTION_TOKEN,
  projectsDatabaseId: NOTION_PROJECTS_DATABASE_ID,
})
