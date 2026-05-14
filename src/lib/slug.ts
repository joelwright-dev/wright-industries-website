// Slug derivation. Used when an entry or project has no explicit `Slug`
// property in Notion (currently all of them — neither schema includes one).

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacriticals
    .toLowerCase()
    .replace(/[‘’']/g, '') // curly + straight apostrophes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled'
}
