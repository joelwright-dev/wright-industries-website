import { defineConfig, envField } from 'astro/config'
import vercel from '@astrojs/vercel'
import sitemap from '@astrojs/sitemap'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const SITE_URL = process.env.SITE_URL ?? 'https://wrightindustries.com.au'

/** Run Pagefind against the actual build output directory. Hooked into the
 * Astro build instead of chained from package.json so it runs unconditionally
 * — Vercel's Astro preset invokes `astro build` directly and would skip a
 * `pnpm build` script. */
function pagefindIntegration() {
  return {
    name: 'pagefind',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const site = fileURLToPath(dir)
        logger.info(`Running Pagefind against ${site}`)
        const res = spawnSync('pnpm', ['exec', 'pagefind', '--site', site], {
          stdio: 'inherit',
        })
        if (res.status !== 0) {
          throw new Error(`pagefind exited with status ${res.status}`)
        }
      },
    },
  }
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap(), pagefindIntegration()],
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
