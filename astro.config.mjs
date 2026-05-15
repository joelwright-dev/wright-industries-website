import { defineConfig, envField } from 'astro/config'
import vercel from '@astrojs/vercel'
import sitemap from '@astrojs/sitemap'
import { fileURLToPath } from 'node:url'
import { cp, stat, readdir } from 'node:fs/promises'
import path from 'node:path'

const SITE_URL = process.env.SITE_URL ?? 'https://wrightindustries.com.au'

/** End-of-build integration that does two things:
 *
 *   1. Copies `public/_notion-images/` and `public/_notion-files/` into the
 *      build output. Astro's own public-asset copy snapshots `public/` early
 *      in the build, before NotionContentSource downloads assets during page
 *      render — so newly-created files in those dirs never make it to the
 *      deploy. We force the copy here, after all downloads are done.
 *   2. Builds the Pagefind index against the same output dir using the
 *      Pagefind JS API (no shell, no PATH dependency on `pnpm` or `npx`).
 *
 * Also copies into `.vercel/output/static/<dir>/` if that path exists already
 * at hook time — Vercel's adapter may have already created its output dir on
 * some build orderings.
 */
function postBuildIntegration() {
  async function copyAssetDir(name, outDir, logger) {
    const src = path.resolve(process.cwd(), 'public', name)
    try {
      const s = await stat(src)
      if (!s.isDirectory()) return
      const entries = await readdir(src)
      if (entries.length === 0) return
      const targetA = path.join(outDir, name)
      await cp(src, targetA, { recursive: true, force: true })
      logger.info(`wi-post-build: copied ${entries.length} ${name} entry/ies to ${targetA}`)

      const vercelStatic = path.resolve(process.cwd(), '.vercel/output/static')
      try {
        await stat(vercelStatic)
        const targetB = path.join(vercelStatic, name)
        await cp(src, targetB, { recursive: true, force: true })
        logger.info(`wi-post-build: also copied to ${targetB}`)
      } catch {
        /* .vercel/output/static doesn't exist yet — Astro adapter
         * will pick the files up from outDir later */
      }
    } catch (err) {
      if (err && typeof err === 'object' && err.code !== 'ENOENT') {
        logger.warn(
          `wi-post-build: ${name} copy failed: ${err.message ?? String(err)}`,
        )
      }
    }
  }

  return {
    name: 'wi-post-build',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir)

        await copyAssetDir('_notion-images', outDir, logger)
        await copyAssetDir('_notion-files', outDir, logger)

        // Pagefind via JS API
        logger.info(`wi-post-build: building Pagefind index for ${outDir}`)
        const pagefind = await import('pagefind')
        const createRes = await pagefind.createIndex({})
        if (createRes.errors && createRes.errors.length > 0) {
          throw new Error(
            `Pagefind createIndex errors: ${createRes.errors.join('; ')}`,
          )
        }
        const index = createRes.index
        if (!index) throw new Error('Pagefind createIndex returned no index')
        const addRes = await index.addDirectory({ path: outDir })
        if (addRes.errors && addRes.errors.length > 0) {
          throw new Error(
            `Pagefind addDirectory errors: ${addRes.errors.join('; ')}`,
          )
        }
        const writeRes = await index.writeFiles({
          outputPath: path.join(outDir, 'pagefind'),
        })
        if (writeRes.errors && writeRes.errors.length > 0) {
          throw new Error(
            `Pagefind writeFiles errors: ${writeRes.errors.join('; ')}`,
          )
        }
        logger.info(
          `wi-post-build: Pagefind indexed ${addRes.page_count} page(s)`,
        )
        await pagefind.close()
      },
    },
  }
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap(), postBuildIntegration()],
  env: {
    schema: {
      NOTION_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      NOTION_PROJECTS_DATABASE_ID: envField.string({ context: 'server', access: 'secret' }),
      SITE_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'https://wrightindustries.com.au',
      }),
      RESEND_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        default: '',
      }),
      // Vercel Deploy Hook URL. POSTing to /api/revalidate triggers a rebuild
      // by calling this hook. Configure in Vercel project settings → Git →
      // Deploy Hooks. Leave unset to disable the endpoint.
      VERCEL_DEPLOY_HOOK: envField.string({
        context: 'server',
        access: 'secret',
        default: '',
      }),
      // Optional shared secret that non-Notion callers of /api/revalidate
      // must provide via `?secret=` or X-Revalidate-Secret. Notion's own
      // webhooks use the X-Notion-Signature HMAC against
      // NOTION_WEBHOOK_TOKEN instead.
      REVALIDATE_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        default: '',
      }),
      // Verification token issued by Notion when the webhook subscription
      // is set up. Used to verify the X-Notion-Signature HMAC on incoming
      // events. Leave empty to disable Notion-signed-request handling.
      NOTION_WEBHOOK_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        default: '',
      }),
    },
  },
  vite: {
    resolve: {
      alias: {
        '~': new URL('./src', import.meta.url).pathname,
      },
    },
  },
})
