// NotionContentSource — implements `ContentSource` against the user's Notion
// workspace. Discovery: query the master Projects database, find the
// `child_database` block under each project page (verified by the probe on
// 2026-05-13), query that as the per-project notes database.
//
// All fetches are cached for the lifetime of the build via internal Maps.

import { Client, isFullPage, isFullBlock } from '@notionhq/client'
import type {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

import type {
  ContentSource,
  EntryMeta,
  ProjectMeta,
  RenderedEntry,
  RenderedProject,
} from '~/lib/sources/ContentSource'
import type { ContentBlock } from '~/lib/content-blocks'
import {
  classifyEntry,
  normaliseProjectStatus,
} from '~/config/content'
import { slugify } from '~/lib/slug'
import {
  isoDate,
  readCheckbox,
  readCreatedTime,
  readDate,
  readMultiSelect,
  readNumber,
  readRichText,
  readSelect,
  readTitle,
} from './properties'
import { convertBlocks, numberFigures, type BlockNode } from './blocks'
import { localizeImageUrl, localizeImagesInBlocks } from './images'

export interface NotionContentSourceOptions {
  readonly token: string
  readonly projectsDatabaseId: string
}

interface ProjectInternal {
  readonly meta: ProjectMeta
  readonly pageId: string
  readonly notesDbId: string | null
}

interface EntryInternal {
  readonly meta: EntryMeta
  readonly pageId: string
}

export class NotionContentSource implements ContentSource {
  readonly name = 'notion'
  private readonly client: Client
  private readonly projectsDatabaseId: string

  // Caches. Lifetime = single build (or single dev session).
  private projectsCache: Promise<readonly ProjectInternal[]> | null = null
  private entriesByProjectCache = new Map<string, Promise<readonly EntryInternal[]>>()
  private blockTreeCache = new Map<string, Promise<readonly BlockNode[]>>()

  constructor(opts: NotionContentSourceOptions) {
    this.client = new Client({ auth: opts.token, timeoutMs: 90_000 })
    this.projectsDatabaseId = opts.projectsDatabaseId
  }

  // ─── Public ContentSource API ────────────────────────────────────────

  async listProjects(): Promise<readonly ProjectMeta[]> {
    const internals = await this.loadProjects()
    return internals.map((p) => p.meta)
  }

  async getProject(slug: string): Promise<RenderedProject | null> {
    const projects = await this.loadProjects()
    const internal = projects.find((p) => p.meta.slug === slug)
    if (!internal) return null
    // Project overview blocks = all child blocks of the project page,
    // excluding the embedded notes child_database.
    const tree = await this.getBlockTree(internal.pageId)
    const overviewNodes = tree.filter((n) => n.block.type !== 'child_database')
    const blocks = await localizeImagesInBlocks(
      numberFigures(convertBlocks(overviewNodes)),
    )
    return { ...internal.meta, blocks }
  }

  async listEntries(projectSlug: string): Promise<readonly EntryMeta[]> {
    const entries = await this.loadEntriesByProjectSlug(projectSlug)
    return entries.map((e) => e.meta)
  }

  async getEntry(projectSlug: string, slug: string): Promise<RenderedEntry | null> {
    const entries = await this.loadEntriesByProjectSlug(projectSlug)
    const internal = entries.find((e) => e.meta.slug === slug)
    if (!internal) return null
    const tree = await this.getBlockTree(internal.pageId)
    const blocks = await localizeImagesInBlocks(
      numberFigures(convertBlocks(tree)),
    )
    return { ...internal.meta, blocks }
  }

  async listAllEntries(): Promise<readonly EntryMeta[]> {
    const projects = await this.loadProjects()
    const all = await Promise.all(
      projects.map((p) => this.loadEntriesByProjectSlug(p.meta.slug)),
    )
    return all.flat().map((e) => e.meta)
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private loadProjects(): Promise<readonly ProjectInternal[]> {
    if (this.projectsCache) return this.projectsCache
    const promise = this.doLoadProjects().catch((err: unknown) => {
      this.projectsCache = null // self-evict so a retry can succeed
      throw err
    })
    this.projectsCache = promise
    return promise
  }

  private async doLoadProjects(): Promise<readonly ProjectInternal[]> {
    const pages = await this.queryAllDatabasePages(this.projectsDatabaseId)
    const result: ProjectInternal[] = []
    for (const page of pages) {
      const title = readTitle(page.properties)
      if (!title) {
        console.warn(`[notion] project page ${page.id} has no title — skipping`)
        continue
      }
      const explicitSlug = readRichText(page.properties, 'Slug')
      const slug = explicitSlug ? slugify(explicitSlug) : slugify(title)
      const description = readRichText(page.properties, 'Description')
      const status = normaliseProjectStatus(readSelect(page.properties, 'Status'))
      const startedRaw =
        readDate(page.properties, 'Started') ??
        readCreatedTime(page.properties, 'Started')
      const started = isoDate(startedRaw)
      const coverUrl = await localizeImageUrl(extractPageCover(page))

      const tree = await this.getBlockTree(page.id)
      const childDbNode = tree.find((n) => n.block.type === 'child_database')
      const notesDbId = childDbNode?.block.id ?? null
      if (!notesDbId) {
        console.warn(
          `[notion] project "${title}" has no child_database — notes will not be discovered`,
        )
      }

      result.push({
        meta: {
          id: page.id,
          slug,
          title,
          description,
          status,
          started,
          coverUrl,
        },
        pageId: page.id,
        notesDbId,
      })
    }
    return result
  }

  private loadEntriesByProjectSlug(slug: string): Promise<readonly EntryInternal[]> {
    const cached = this.entriesByProjectCache.get(slug)
    if (cached) return cached
    const promise = this.doLoadEntries(slug).catch((err: unknown) => {
      this.entriesByProjectCache.delete(slug)
      throw err
    })
    this.entriesByProjectCache.set(slug, promise)
    return promise
  }

  private doLoadEntries(slug: string): Promise<readonly EntryInternal[]> {
    return (async (): Promise<readonly EntryInternal[]> => {
      const projects = await this.loadProjects()
      const project = projects.find((p) => p.meta.slug === slug)
      if (!project || !project.notesDbId) return []

      const pages = await this.queryAllDatabasePages(project.notesDbId)
      const entries: EntryInternal[] = []

      // Pre-compute doc numbers: per-project chronological order of public
      // entries (oldest = 0001).
      const publicPages = pages
        .map((page) => {
          const notionType = readSelect(page.properties, 'Type')
          const classified = classifyEntry(notionType)
          return classified ? { page, classifiedType: classified, notionType } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      publicPages.sort((a, b) => {
        const da = pickEntryDate(a.page) ?? '0000-00-00'
        const db = pickEntryDate(b.page) ?? '0000-00-00'
        return da.localeCompare(db)
      })

      await Promise.all(
        publicPages.map(async (entry, idx) => {
          const { page, classifiedType } = entry
          const title =
            readTitle(page.properties, 'Title') ?? readTitle(page.properties, 'Name')
          if (!title) {
            console.warn(`[notion] entry page ${page.id} has no title — skipping`)
            return
          }
          const explicitSlug = readRichText(page.properties, 'Slug')
          const noteSlug = explicitSlug ? slugify(explicitSlug) : slugify(title)
          const tags = readMultiSelect(page.properties, 'Tags')
          const featured = readCheckbox(page.properties, 'Featured')
          const docNumberOverride = readNumber(page.properties, 'DocNumber')
          const excerpt = readRichText(page.properties, 'Excerpt')
          const date = isoDate(pickEntryDate(page)) ?? isoDate(page.created_time)
          const coverUrl = await localizeImageUrl(extractPageCover(page))

          entries.push({
            meta: {
              id: page.id,
              slug: noteSlug,
              projectSlug: project.meta.slug,
              projectTitle: project.meta.title,
              title,
              type: classifiedType,
              date: date ?? '0000-00-00',
              tags,
              excerpt,
              docNumber: idx + 1,
              docNumberOverride,
              featured,
              coverUrl,
            },
            pageId: page.id,
          })
        }),
      )

      // Re-sort entries by date asc to ensure doc number order is preserved
      // (Promise.all does not guarantee push order).
      entries.sort((a, b) => a.meta.date.localeCompare(b.meta.date))
      // Reassign docNumber to match position.
      const final: EntryInternal[] = entries.map((e, idx) => ({
        ...e,
        meta: { ...e.meta, docNumber: idx + 1 },
      }))
      return final
    })()
  }

  private getBlockTree(blockId: string): Promise<readonly BlockNode[]> {
    const cached = this.blockTreeCache.get(blockId)
    if (cached) return cached
    const promise = this.fetchBlockTree(blockId).catch((err: unknown) => {
      this.blockTreeCache.delete(blockId)
      throw err
    })
    this.blockTreeCache.set(blockId, promise)
    return promise
  }

  // Recursively fetch a block's children in parallel. Sequential recursion on
  // deeply-nested pages compounded per-call latency badly enough to trip the
  // Notion client's request timeout.
  private async fetchBlockTree(blockId: string): Promise<readonly BlockNode[]> {
    const children = await withRetry(() => this.fetchAllBlockChildren(blockId))
    const fullChildren = children.filter(isFullBlock)
    return Promise.all(
      fullChildren.map(async (block) => {
        const grandchildren = block.has_children
          ? await this.fetchBlockTree(block.id)
          : []
        return { block, children: grandchildren }
      }),
    )
  }

  private async fetchAllBlockChildren(
    blockId: string,
  ): Promise<ReadonlyArray<BlockObjectResponse | PartialBlockObjectResponse>> {
    const all: Array<BlockObjectResponse | PartialBlockObjectResponse> = []
    let cursor: string | undefined = undefined
    do {
      const res = await this.client.blocks.children.list({
        block_id: blockId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      })
      all.push(...res.results)
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    } while (cursor)
    return all
  }

  private async queryAllDatabasePages(
    databaseId: string,
  ): Promise<ReadonlyArray<PageObjectResponse>> {
    const all: PageObjectResponse[] = []
    let cursor: string | undefined = undefined
    do {
      const res = await this.client.databases.query({
        database_id: databaseId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      })
      for (const item of res.results) {
        if (isFullPage(item)) all.push(item)
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
    } while (cursor)
    return all
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function pickEntryDate(page: PageObjectResponse): string | null {
  // Preference order: explicit Date property → Created (created_time
  // property if the user named it that) → page.created_time.
  return (
    readDate(page.properties, 'Date') ??
    readCreatedTime(page.properties, 'Created') ??
    page.created_time
  )
}

function extractPageCover(page: PageObjectResponse): string | null {
  const cover = page.cover
  if (!cover) return null
  if (cover.type === 'external') return cover.external.url
  if (cover.type === 'file') return cover.file.url
  return null
}

// Retry wrapper for transient Notion API failures (timeout, rate-limit,
// 5xx). Tries up to `attempts` times with exponential backoff.
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 500,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        const delay = baseMs * 2 ** i
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

// Re-export for completeness against the API surface.
export type { PartialPageObjectResponse, ContentBlock }
