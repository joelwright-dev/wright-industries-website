import { defineConfig, envField } from 'astro/config'
import vercel from '@astrojs/vercel'
import sitemap from '@astrojs/sitemap'

const SITE_URL = process.env.SITE_URL ?? 'https://wrightindustries.com.au'

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
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
      // Optional shared secret that callers of /api/revalidate must provide
      // via `?secret=` or the X-Revalidate-Secret header. Leave unset to
      // accept any POST.
      REVALIDATE_SECRET: envField.string({
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
