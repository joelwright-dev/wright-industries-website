// Reconnaissance script run once at the start of the build to confirm the
// shape of the user's Notion workspace before the dynamic discovery code is
// written. Reports:
//
//   1. The Projects database property schema.
//   2. The first few project pages and their child blocks — specifically
//      whether each has a `child_database` block (full child DB, easy case)
//      or only a `link_to_page` reference (linked DB, harder case).
//   3. For the first project with a child DB, the notes DB property schema
//      and a sample of rows, with Type and Status values seen.
//
// No writes. Read-only. Safe to run repeatedly.

import 'dotenv/config'
import {
  Client,
  isFullPage,
  isFullDatabase,
  isFullBlock,
} from '@notionhq/client'

const NOTION_TOKEN = process.env['NOTION_TOKEN']
const PROJECTS_DB_ID = process.env['NOTION_PROJECTS_DATABASE_ID']

if (!NOTION_TOKEN || !PROJECTS_DB_ID) {
  console.error(
    'Missing NOTION_TOKEN or NOTION_PROJECTS_DATABASE_ID. Copy .env.example to .env and fill them in.',
  )
  process.exit(1)
}

const notion = new Client({ auth: NOTION_TOKEN })

function rule(char = '─', n = 78): string {
  return char.repeat(n)
}

function titleOf(page: { properties: Record<string, unknown> }): string {
  for (const prop of Object.values(page.properties)) {
    const p = prop as { type?: string; title?: Array<{ plain_text?: string }> }
    if (p.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t) => t.plain_text ?? '').join('') || '(untitled)'
    }
  }
  return '(untitled)'
}

function describeProperty(name: string, prop: unknown): string {
  const p = prop as {
    type: string
    select?: { options?: Array<{ name: string }> }
    multi_select?: { options?: Array<{ name: string }> }
    status?: { options?: Array<{ name: string }> }
  }
  let meta = ''
  if (p.type === 'select' && p.select?.options) {
    meta = `  options: [${p.select.options.map((o) => o.name).join(', ')}]`
  } else if (p.type === 'multi_select' && p.multi_select?.options) {
    meta = `  options: [${p.multi_select.options.map((o) => o.name).join(', ')}]`
  } else if (p.type === 'status' && p.status?.options) {
    meta = `  options: [${p.status.options.map((o) => o.name).join(', ')}]`
  }
  return `    ${name.padEnd(22)} ${p.type.padEnd(16)}${meta}`
}

async function main(): Promise<void> {
  console.log(rule('═'))
  console.log('  NOTION PROBE — Wright Industries')
  console.log(rule('═'))
  console.log()

  // 1. Projects DB schema
  const projectsDb = await notion.databases.retrieve({
    database_id: PROJECTS_DB_ID!,
  })
  console.log('PROJECTS DATABASE')
  console.log(rule())
  if (isFullDatabase(projectsDb)) {
    const dbTitle = projectsDb.title
      .map((t) => ('plain_text' in t ? t.plain_text : ''))
      .join('')
    console.log(`  id:    ${projectsDb.id}`)
    console.log(`  title: ${dbTitle}`)
    console.log('  properties:')
    for (const [name, prop] of Object.entries(projectsDb.properties)) {
      console.log(describeProperty(name, prop))
    }
  }
  console.log()

  // 2. Sample of projects
  const projects = await notion.databases.query({
    database_id: PROJECTS_DB_ID!,
    page_size: 10,
  })
  console.log(`Found ${projects.results.length} project page(s) (first 10).`)
  console.log()

  let foundChildDb = false
  let firstChildDbId: string | null = null
  let firstProjectTitle = ''

  for (const project of projects.results) {
    if (!isFullPage(project)) continue
    const title = titleOf(project)
    console.log(`PROJECT — ${title}`)
    console.log(rule())
    console.log(`  page id: ${project.id}`)

    const children = await notion.blocks.children.list({
      block_id: project.id,
      page_size: 100,
    })

    const blockKinds = new Map<string, number>()
    let childDbBlock: { id: string; child_database?: { title?: string } } | null = null
    let linkToPageBlock: unknown = null

    for (const block of children.results) {
      if (!isFullBlock(block)) continue
      const t = block.type
      blockKinds.set(t, (blockKinds.get(t) ?? 0) + 1)
      if (t === 'child_database' && !childDbBlock) {
        childDbBlock = block as unknown as {
          id: string
          child_database?: { title?: string }
        }
      }
      if (t === 'link_to_page' && !linkToPageBlock) {
        linkToPageBlock = block
      }
    }

    console.log(`  child blocks (${children.results.length} total):`)
    for (const [k, v] of blockKinds) {
      console.log(`    ${k.padEnd(22)} ${v}`)
    }

    if (childDbBlock) {
      console.log(
        `  ✓ child_database found: "${childDbBlock.child_database?.title ?? '(no title)'}"`,
      )
      console.log(`    id: ${childDbBlock.id}`)
      if (!foundChildDb) {
        foundChildDb = true
        firstChildDbId = childDbBlock.id
        firstProjectTitle = title
      }
    } else if (linkToPageBlock) {
      console.log(
        '  ⚠ no child_database — found a link_to_page block. Notes DB is likely a linked reference, not a true child database. Discovery will need to follow the link.',
      )
    } else {
      console.log(
        '  ⚠ no child_database and no link_to_page found. Notes DB may be deeper in the page tree, or this project has no notes yet.',
      )
    }
    console.log()
  }

  // 3. First found notes DB — schema + sample
  if (foundChildDb && firstChildDbId) {
    console.log(`NOTES DATABASE (from project: ${firstProjectTitle})`)
    console.log(rule())
    const notesDb = await notion.databases.retrieve({
      database_id: firstChildDbId,
    })
    if (isFullDatabase(notesDb)) {
      console.log(`  id: ${notesDb.id}`)
      console.log('  properties:')
      for (const [name, prop] of Object.entries(notesDb.properties)) {
        console.log(describeProperty(name, prop))
      }
    }
    console.log()

    const notes = await notion.databases.query({
      database_id: firstChildDbId,
      page_size: 25,
    })
    console.log(`  Sample notes (${notes.results.length}):`)
    const typeSeen = new Set<string>()
    const statusSeen = new Set<string>()
    for (const n of notes.results) {
      if (!isFullPage(n)) continue
      const props = n.properties as Record<string, unknown>
      const ntitle = titleOf(n)
      const typeProp = props['Type'] as
        | { select?: { name?: string } }
        | undefined
      const statusProp = props['Status'] as
        | { select?: { name?: string }; status?: { name?: string } }
        | undefined
      const typeVal = typeProp?.select?.name ?? '—'
      const statusVal =
        statusProp?.select?.name ?? statusProp?.status?.name ?? '—'
      typeSeen.add(typeVal)
      statusSeen.add(statusVal)
      console.log(
        `    [${typeVal.padEnd(10)}] [${statusVal.padEnd(10)}] ${ntitle}`,
      )
    }
    console.log()
    console.log(`  Type values seen:   ${[...typeSeen].join(', ')}`)
    console.log(`  Status values seen: ${[...statusSeen].join(', ')}`)
  } else {
    console.log(
      '⚠ No child_database located on any project page. Discovery code will need a different traversal strategy. Worth a look at the Notion structure manually.',
    )
  }

  console.log()
  console.log(rule('═'))
  console.log('  END PROBE')
  console.log(rule('═'))
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
