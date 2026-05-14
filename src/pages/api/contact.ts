// Contact-form endpoint. Stubbed until the domain DKIM/SPF is wired up
// (blocked on ASIC business-name registration — ADR-008). For now,
// submissions are validated and logged to the function logs; the
// Resend-backed email delivery branch is in place behind RESEND_API_KEY but
// inactive when the key is empty.

import type { APIRoute } from 'astro'
import { RESEND_API_KEY } from 'astro:env/server'

// Render as a serverless function instead of pre-building.
export const prerender = false

interface Submission {
  readonly name: string
  readonly email: string
  readonly subject: string
  readonly message: string
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData()
    const submission: Submission = {
      name: String(form.get('name') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      subject: String(form.get('subject') ?? '').trim(),
      message: String(form.get('message') ?? '').trim(),
    }

    const errors: string[] = []
    if (submission.name.length === 0) errors.push('name')
    if (submission.email.length === 0) errors.push('email')
    else if (!isValidEmail(submission.email)) errors.push('email-format')
    if (submission.subject.length === 0) errors.push('subject')
    if (submission.message.length === 0) errors.push('message')
    if (submission.message.length > 8000) errors.push('message-too-long')

    if (errors.length > 0) {
      return Response.redirect(
        new URL(`/contact?error=${encodeURIComponent(errors.join(','))}`, request.url),
        303,
      )
    }

    // Log to function output. In Vercel this lands in the function logs.
    console.log('[contact submission]', {
      at: new Date().toISOString(),
      name: submission.name,
      email: submission.email,
      subject: submission.subject,
      length: submission.message.length,
    })

    if (RESEND_API_KEY && RESEND_API_KEY.length > 0) {
      // Resend wiring lands once the domain is verified. Stubbed for now;
      // the API key is read but not yet used to send.
      // const resend = new Resend(RESEND_API_KEY)
      // await resend.emails.send({ ... })
    }

    return Response.redirect(new URL('/contact?ok=1', request.url), 303)
  } catch (err) {
    console.error('[contact] error', err)
    return new Response('Server error', { status: 500 })
  }
}

export const GET: APIRoute = () =>
  new Response('Method not allowed', { status: 405 })
