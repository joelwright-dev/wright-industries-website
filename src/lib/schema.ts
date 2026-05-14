// JSON-LD structured-data builders. Articles on notes/releases, Organization
// on the homepage, BreadcrumbList on nested pages.

import { SITE } from '~/config/site'
import { footerBusinessName } from '~/config/business'
import type { EntryMeta, ProjectMeta } from './sources/ContentSource'

export interface Schema {
  '@context': 'https://schema.org'
  '@type': string
  [k: string]: unknown
}

export function organizationSchema(siteUrl: string): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: footerBusinessName(),
    url: siteUrl,
    description: SITE.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.location,
      addressCountry: 'AU',
    },
  }
}

export function articleSchema(
  entry: EntryMeta,
  project: ProjectMeta,
  siteUrl: string,
): Schema {
  const path = `${siteUrl}/projects/${project.slug}/${
    entry.type === 'release' ? 'releases' : 'notes'
  }/${entry.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry.title,
    description: entry.excerpt ?? '',
    datePublished: entry.date,
    author: {
      '@type': 'Organization',
      name: footerBusinessName(),
    },
    publisher: {
      '@type': 'Organization',
      name: footerBusinessName(),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': path },
    isPartOf: { '@type': 'WebSite', name: SITE.title, url: siteUrl },
    articleSection: project.title,
    keywords: entry.tags.join(', '),
    ...(entry.coverUrl
      ? { image: entry.coverUrl.startsWith('http') ? entry.coverUrl : `${siteUrl}${entry.coverUrl}` }
      : {}),
  }
}

export function breadcrumbSchema(
  items: ReadonlyArray<{ name: string; url: string }>,
): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}
