// Combined RSS feed — every published note + release across every project,
// reverse-chronological. Per-project feeds live at
// `/projects/[slug]/rss.xml`.

import rss from '@astrojs/rss'
import type { APIContext } from 'astro'

import { source } from '~/lib/source'
import { SITE } from '~/config/site'

export async function GET(context: APIContext): Promise<Response> {
  const site = context.site?.toString() ?? SITE.url
  const entries = await source.listAllEntries()
  const desc = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  return rss({
    title: SITE.title,
    description: SITE.description,
    site,
    items: desc.map((e) => ({
      title: e.type === 'release' ? `[Release] ${e.title}` : e.title,
      pubDate: new Date(e.date),
      description: e.excerpt ?? '',
      categories: [e.type, e.projectTitle, ...e.tags],
      link: `/projects/${e.projectSlug}/${
        e.type === 'release' ? 'releases' : 'notes'
      }/${e.slug}`,
    })),
    customData: '<language>en-au</language>',
  })
}
