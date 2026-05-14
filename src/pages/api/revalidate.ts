// Revalidation webhook. Triggers a Vercel Deploy Hook when content in Notion
// changes — Notion's webhook integration POSTs here, this endpoint forwards
// to the configured Vercel deploy hook, Vercel rebuilds the whole site.
//
// Two auth paths:
//
//   - Notion subscription requests carry an `X-Notion-Signature: sha256=<hex>`
//     header. We verify it against NOTION_WEBHOOK_TOKEN.
//   - Other callers (manual curl, Zap, etc.) can use `?secret=...` /
//     `X-Revalidate-Secret` matching REVALIDATE_SECRET.
//
// A Notion verification request — POST with `{ verification_token }` in the
// body — is handled before either check and just logs the token loudly so
// you can paste it back into the Notion UI.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { APIRoute } from 'astro'
import {
  NOTION_WEBHOOK_TOKEN,
  REVALIDATE_SECRET,
  VERCEL_DEPLOY_HOOK,
} from 'astro:env/server'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  if (!VERCEL_DEPLOY_HOOK || VERCEL_DEPLOY_HOOK.length === 0) {
    return new Response('Deploy hook not configured', { status: 503 })
  }

  // Read once — we may need the body string for HMAC verification.
  const rawBody = await request.text()

  // Notion subscription verification handshake.
  const verificationToken = extractVerificationToken(rawBody)
  if (verificationToken) {
    const rule = '━'.repeat(64)
    console.log(rule)
    console.log('  NOTION WEBHOOK — VERIFICATION REQUEST')
    console.log(`  verification_token: ${verificationToken}`)
    console.log('  Steps:')
    console.log('    1. Copy the token above.')
    console.log('    2. Paste it into the Notion webhook UI to confirm.')
    console.log('    3. Set NOTION_WEBHOOK_TOKEN to the same value in Vercel')
    console.log('       env vars, then redeploy so HMAC verification works.')
    console.log(rule)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Auth — Notion HMAC signature if present, otherwise shared secret.
  const notionSignature = request.headers.get('x-notion-signature')
  if (notionSignature) {
    if (!NOTION_WEBHOOK_TOKEN || NOTION_WEBHOOK_TOKEN.length === 0) {
      console.warn(
        '[revalidate] Notion-signed request arrived but NOTION_WEBHOOK_TOKEN is not set',
      )
      return new Response('Webhook token not configured', { status: 503 })
    }
    if (!verifyNotionSignature(rawBody, notionSignature, NOTION_WEBHOOK_TOKEN)) {
      return new Response('Invalid signature', { status: 401 })
    }
  } else if (REVALIDATE_SECRET && REVALIDATE_SECRET.length > 0) {
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

function extractVerificationToken(rawBody: string): string | null {
  if (rawBody.length === 0) return null
  try {
    const parsed = JSON.parse(rawBody) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'verification_token' in parsed &&
      typeof (parsed as { verification_token: unknown }).verification_token ===
        'string'
    ) {
      return (parsed as { verification_token: string }).verification_token
    }
  } catch {
    /* not JSON — not a verification request */
  }
  return null
}

function verifyNotionSignature(
  rawBody: string,
  headerValue: string,
  token: string,
): boolean {
  // Expected header form: `sha256=<hex>`
  const expectedHex = createHmac('sha256', token).update(rawBody).digest('hex')
  const expected = `sha256=${expectedHex}`
  if (headerValue.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(headerValue), Buffer.from(expected))
  } catch {
    return false
  }
}
