// Image localisation. Notion-hosted image URLs are presigned and expire
// around an hour after the API call that returned them — any solution that
// defers to them at request time will eventually break.
//
// At build (or first dev access), every Notion-hosted URL is downloaded,
// content-hashed, and written to `public/_notion-images/<hash>.<ext>`. The
// returned URL points to that local path. Identical content hashes to the
// same filename, so unchanged images don't churn between builds.
//
// External image URLs (Notion `image` blocks with `type === 'external'`)
// are passed through unchanged.

import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ContentBlock } from '~/lib/content-blocks'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public/_notion-images')
const PUBLIC_URL = '/_notion-images'

const ALLOWED_EXT = new Set(['jpg', 'png', 'webp', 'gif', 'svg', 'avif'])

// URL → resolved-local-path promise. Lifetime = one build.
const urlCache = new Map<string, Promise<string>>()

let dirEnsured: Promise<void> | null = null
function ensureDir(): Promise<void> {
  if (dirEnsured) return dirEnsured
  dirEnsured = mkdir(PUBLIC_DIR, { recursive: true }).then(() => undefined)
  return dirEnsured
}

function isNotionHosted(url: string): boolean {
  return (
    url.includes('prod-files-secure.s3') ||
    url.includes('s3.us-west-2.amazonaws.com') ||
    url.includes('notion.so/image') ||
    url.includes('notion-static.com')
  )
}

function inferExt(url: string, contentType: string | null): string {
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
  return ALLOWED_EXT.has(normalised) ? normalised : 'bin'
}

export function localizeImageUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  if (!isNotionHosted(url)) return Promise.resolve(url)
  const cached = urlCache.get(url)
  if (cached) return cached.then((p) => p)
  const promise = (async (): Promise<string> => {
    await ensureDir()
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(
        `[notion] image fetch ${res.status} for ${url.slice(0, 80)}…`,
      )
      return url
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const ext = inferExt(url, res.headers.get('content-type'))
    const filename = `${hash}.${ext}`
    const target = path.join(PUBLIC_DIR, filename)
    try {
      await access(target)
    } catch {
      await writeFile(target, buf)
    }
    return `${PUBLIC_URL}/${filename}`
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

/** Walk a ContentBlock tree and replace `image.src` URLs with localised paths.
 * Recurses into list items, quote/callout/toggle children. */
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
