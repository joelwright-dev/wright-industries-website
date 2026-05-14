// Per-project RSS feed.

import rss from '@astrojs/rss'
import type { APIContext, GetStaticPaths } from 'astro'

import { source } from '~/lib/source'
import { SITE } from '~/config/site'

export const getStaticPaths = (async () => {
  const projects = await source.listProjects()
  return projects.map((p) => ({
    params: { project: p.slug },
    props: { projectSlug: p.slug, projectTitle: p.title, projectDescription: p.description },
  }))
}) satisfies GetStaticPaths

interface Props {
  projectSlug: string
  projectTitle: string
  projectDescription: string | null
}

export async function GET(context: APIContext): Promise<Response> {
  const site = context.site?.toString() ?? SITE.url
  const { projectSlug, projectTitle, projectDescription } = context.props as Props
  const entries = await source.listEntries(projectSlug)
  const desc = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  return rss({
    title: `${projectTitle} · ${SITE.title}`,
    description: projectDescription ?? `${projectTitle} notes and releases.`,
    site,
    items: desc.map((e) => ({
      title: e.type === 'release' ? `[Release] ${e.title}` : e.title,
      pubDate: new Date(e.date),
      description: e.excerpt ?? '',
      categories: [e.type, ...e.tags],
      link: `/projects/${projectSlug}/${
        e.type === 'release' ? 'releases' : 'notes'
      }/${e.slug}`,
    })),
    customData: '<language>en-au</language>',
  })
}
