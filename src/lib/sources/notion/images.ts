// Asset localisation. Notion-hosted asset URLs (images, files, pdfs, video,
// audio) are presigned and expire around an hour after the API call that
// returned them — any solution that defers to them at request time will
// eventually break.
//
// At build (or first dev access), every Notion-hosted URL is downloaded,
// content-hashed, and written to disk under /public. The returned URL points
// to that local path. Identical content hashes to the same filename, so
// unchanged assets don't churn between builds.
//
// External URLs (Notion `image`/`file`/`pdf`/`video`/`audio` blocks with
// `type === 'external'`) are passed through unchanged.

import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ContentBlock, FileKind } from '~/lib/content-blocks'

const IMAGE_DIR = path.resolve(process.cwd(), 'public/_notion-images')
const IMAGE_URL = '/_notion-images'

const FILE_DIR = path.resolve(process.cwd(), 'public/_notion-files')
const FILE_URL = '/_notion-files'

const IMAGE_EXT = new Set(['jpg', 'png', 'webp', 'gif', 'svg', 'avif'])

// URL → resolved-local-path promise. Lifetime = one build.
const urlCache = new Map<string, Promise<string>>()

const dirEnsured = new Map<string, Promise<void>>()
function ensureDir(dir: string): Promise<void> {
  const existing = dirEnsured.get(dir)
  if (existing) return existing
  const p = mkdir(dir, { recursive: true }).then(() => undefined)
  dirEnsured.set(dir, p)
  return p
}

function isNotionHosted(url: string): boolean {
  return (
    url.includes('prod-files-secure.s3') ||
    url.includes('s3.us-west-2.amazonaws.com') ||
    url.includes('notion.so/image') ||
    url.includes('notion-static.com')
  )
}

function inferImageExt(url: string, contentType: string | null): string {
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('gif')) return 'gif'
    if (contentType.includes('svg')) return 'svg'
    if (contentType.includes('avif')) return 'avif'
  }
  const pathPart = url.split('?')[0] ?? ''
  const m = pathPart.match(/\.([a-zA-Z0-9]{2,5})$/)
  const candidate = m?.[1]?.toLowerCase() ?? ''
  const normalised = candidate === 'jpeg' ? 'jpg' : candidate
  return IMAGE_EXT.has(normalised) ? normalised : 'bin'
}

function inferFileExt(url: string, filename: string | null): string {
  const candidate = (filename ?? url.split('?')[0] ?? '')
    .split('/')
    .pop()
    ?.match(/\.([a-zA-Z0-9]{1,8})$/)
    ?.[1]
    ?.toLowerCase()
  return candidate && /^[a-z0-9]+$/.test(candidate) ? candidate : 'bin'
}

export function localizeImageUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  if (!isNotionHosted(url)) return Promise.resolve(url)
  const cached = urlCache.get(url)
  if (cached) return cached.then((p) => p)
  const promise = (async (): Promise<string> => {
    await ensureDir(IMAGE_DIR)
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(
        `[notion] image fetch ${res.status} for ${url.slice(0, 80)}…`,
      )
      return url
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const ext = inferImageExt(url, res.headers.get('content-type'))
    const filename = `${hash}.${ext}`
    const target = path.join(IMAGE_DIR, filename)
    try {
      await access(target)
    } catch {
      await writeFile(target, buf)
    }
    return `${IMAGE_URL}/${filename}`
  })().catch((err: unknown) => {
    urlCache.delete(url)
    console.warn(
      `[notion] image download failed for ${url.slice(0, 80)}…`,
      err,
    )
    return url
  })
  urlCache.set(url, promise)
  return promise
}

export interface LocalisedFile {
  readonly src: string
  readonly mimeType: string | null
  readonly sizeBytes: number | null
}

/** Download a Notion-hosted file URL (or pass an external URL through).
 * Filename is preserved by appending `?dl=<filename>` for browser download
 * UX — the served path itself is content-hashed for caching. */
export function localizeFileUrl(
  url: string | null | undefined,
  hint: { filename?: string | null } = {},
): Promise<LocalisedFile | null> {
  if (!url) return Promise.resolve(null)
  if (!isNotionHosted(url)) {
    return Promise.resolve({ src: url, mimeType: null, sizeBytes: null })
  }
  const cached = urlCache.get(url)
  if (cached) {
    return cached.then((src) => ({ src, mimeType: null, sizeBytes: null }))
  }
  let detectedType: string | null = null
  let detectedSize: number | null = null
  const promise = (async (): Promise<string> => {
    await ensureDir(FILE_DIR)
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(
        `[notion] file fetch ${res.status} for ${url.slice(0, 80)}…`,
      )
      return url
    }
    const buf = Buffer.from(await res.arrayBuffer())
    detectedType = res.headers.get('content-type')
    detectedSize = buf.byteLength
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const ext = inferFileExt(url, hint.filename ?? null)
    const stored = `${hash}.${ext}`
    const target = path.join(FILE_DIR, stored)
    try {
      await access(target)
    } catch {
      await writeFile(target, buf)
    }
    return `${FILE_URL}/${stored}`
  })().catch((err: unknown) => {
    urlCache.delete(url)
    console.warn(
      `[notion] file download failed for ${url.slice(0, 80)}…`,
      err,
    )
    return url
  })
  urlCache.set(url, promise)
  return promise.then((src) => ({
    src,
    mimeType: detectedType,
    sizeBytes: detectedSize,
  }))
}

/** Walk a ContentBlock tree and replace asset URLs with localised paths.
 * Handles image blocks and file blocks (file/pdf/video/audio). Recurses into
 * list items, quote/callout/toggle children. */
export async function localizeImagesInBlocks(
  blocks: readonly ContentBlock[],
): Promise<readonly ContentBlock[]> {
  return Promise.all(blocks.map(localizeOne))
}

async function localizeOne(b: ContentBlock): Promise<ContentBlock> {
  if (b.kind === 'image') {
    const localSrc = await localizeImageUrl(b.src)
    return { ...b, src: localSrc ?? b.src }
  }
  if (b.kind === 'file') {
    const local = await localizeFileUrl(b.src, { filename: b.filename })
    if (!local) return b
    return {
      ...b,
      src: local.src,
      mimeType: b.mimeType ?? local.mimeType,
      sizeBytes: b.sizeBytes ?? local.sizeBytes,
    }
  }
  if (b.kind === 'quote' || b.kind === 'callout' || b.kind === 'toggle') {
    return { ...b, children: await localizeImagesInBlocks(b.children) }
  }
  if (b.kind === 'list') {
    return {
      ...b,
      items: await Promise.all(
        b.items.map(async (item) => ({
          ...item,
          children: await localizeImagesInBlocks(item.children),
        })),
      ),
    }
  }
  return b
}

// Re-export the type for callers (notion/blocks.ts) so they don't need to
// import directly from content-blocks for this type alone.
export type { FileKind }
