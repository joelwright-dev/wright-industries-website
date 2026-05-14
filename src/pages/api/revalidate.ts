// Revalidation webhook. Triggers a Vercel Deploy Hook when content in Notion
// changes — Notion's webhook integration POSTs here, this endpoint forwards
// to the configured Vercel deploy hook, Vercel rebuilds the whole site.
//
// Optional shared secret check via `?secret=...` query param or the
// X-Revalidate-Secret header — anyone with the deploy hook URL alone cannot
// trigger a rebuild.

import type { APIRoute } from 'astro'
import { VERCEL_DEPLOY_HOOK, REVALIDATE_SECRET } from 'astro:env/server'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  if (!VERCEL_DEPLOY_HOOK || VERCEL_DEPLOY_HOOK.length === 0) {
    return new Response('Deploy hook not configured', { status: 503 })
  }

  if (REVALIDATE_SECRET && REVALIDATE_SECRET.length > 0) {
    const url = new URL(request.url)
    const provided =
      url.searchParams.get('secret') ??
      request.headers.get('x-revalidate-secret') ??
      ''
    if (provided !== REVALIDATE_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  try {
    const res = await fetch(VERCEL_DEPLOY_HOOK, { method: 'POST' })
    if (!res.ok) {
      console.error(`[revalidate] deploy hook ${res.status}`)
      return new Response(`Deploy hook returned ${res.status}`, { status: 502 })
    }
    return new Response(
      JSON.stringify({ triggered: true, at: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[revalidate] error', err)
    return new Response('Failed to trigger deploy hook', { status: 500 })
  }
}

export const GET: APIRoute = () =>
  new Response('Method not allowed', { status: 405 })
