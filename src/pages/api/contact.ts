// Contact-form endpoint. Validates the submission, then uses Resend to
// (1) notify the business inbox and (2) auto-reply to the submitter.
//
// Resend setup required (one-off):
//   1. Verify the wrightindustries.com.au domain in the Resend dashboard
//      by adding the provided DKIM/SPF/DMARC DNS records at the registrar.
//   2. Set RESEND_API_KEY in Vercel project env vars.
//
// If RESEND_API_KEY is empty, the endpoint logs the submission to the
// function output and redirects to the success URL — so local dev and
// previews don't error when the key isn't wired up.

import type { APIRoute } from 'astro'
import { RESEND_API_KEY } from 'astro:env/server'
import { Resend } from 'resend'

import { BUSINESS_EMAIL } from '~/config/business'

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

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    console.log('[contact submission]', {
      at: new Date().toISOString(),
      name: submission.name,
      email: submission.email,
      subject: submission.subject,
      length: submission.message.length,
    })

    if (!RESEND_API_KEY || RESEND_API_KEY.length === 0) {
      console.warn(
        '[contact] RESEND_API_KEY not set — submission logged only, no email sent',
      )
      return Response.redirect(new URL('/contact?ok=1', request.url), 303)
    }

    const resend = new Resend(RESEND_API_KEY)

    // 1. Notification to the business inbox.
    const notifyRes = await resend.emails.send({
      from: BUSINESS_EMAIL.notificationFrom,
      to: BUSINESS_EMAIL.inbox,
      replyTo: submission.email,
      subject: `[WI Contact] ${submission.subject}`,
      text: notificationText(submission),
      html: notificationHTML(submission),
    })
    if (notifyRes.error) {
      console.error('[contact] notification send failed', notifyRes.error)
      return new Response('Email delivery failed', { status: 502 })
    }

    // 2. Auto-reply confirmation to the submitter. Non-fatal if it fails —
    //    the notification has already landed, so the user's message is
    //    safely received even if the courtesy reply bounces.
    const replyRes = await resend.emails.send({
      from: BUSINESS_EMAIL.autoReplyFrom,
      to: submission.email,
      replyTo: BUSINESS_EMAIL.inbox,
      subject: `Re: ${submission.subject}`,
      text: autoReplyText(submission),
      html: autoReplyHTML(submission),
    })
    if (replyRes.error) {
      console.warn('[contact] auto-reply send failed (non-fatal)', replyRes.error)
    }

    return Response.redirect(new URL('/contact?ok=1', request.url), 303)
  } catch (err) {
    console.error('[contact] error', err)
    return new Response('Server error', { status: 500 })
  }
}

export const GET: APIRoute = () =>
  new Response('Method not allowed', { status: 405 })

function notificationText(s: Submission): string {
  return [
    `From:    ${s.name} <${s.email}>`,
    `Subject: ${s.subject}`,
    '',
    s.message,
    '',
    '—',
    'Sent via the contact form at wrightindustries.com.au',
  ].join('\n')
}

function notificationHTML(s: Submission): string {
  const body = escapeHTML(s.message).replace(/\n/g, '<br>')
  return `<!doctype html>
<html><body style="font-family: ui-serif, Georgia, serif; color: #1A1612; max-width: 580px; margin: 0; padding: 0;">
  <table style="border-collapse: collapse; margin-bottom: 1.25rem; font-family: ui-monospace, monospace; font-size: 12px; color: #5A5046;">
    <tr><td style="padding-right: 1rem;">FROM</td><td>${escapeHTML(s.name)} &lt;${escapeHTML(s.email)}&gt;</td></tr>
    <tr><td style="padding-right: 1rem;">SUBJECT</td><td>${escapeHTML(s.subject)}</td></tr>
  </table>
  <div style="font-size: 16px; line-height: 1.55;">${body}</div>
  <hr style="border: 0; border-top: 1px solid #C8BFAD; margin-top: 2rem;">
  <p style="font-family: ui-monospace, monospace; font-size: 11px; color: #5A5046;">
    Sent via the contact form at wrightindustries.com.au
  </p>
</body></html>`
}

function autoReplyText(s: Submission): string {
  return [
    `Hi ${s.name.split(/\s+/)[0] ?? s.name},`,
    '',
    "Thanks for your message — it's landed in my inbox and I'll get back to",
    'you as soon as I can. For reference, this is what you sent:',
    '',
    `Subject: ${s.subject}`,
    '',
    s.message,
    '',
    '— Joel',
    'J Wright Industries · wrightindustries.com.au',
  ].join('\n')
}

function autoReplyHTML(s: Submission): string {
  const firstName = s.name.split(/\s+/)[0] ?? s.name
  const body = escapeHTML(s.message).replace(/\n/g, '<br>')
  return `<!doctype html>
<html><body style="font-family: ui-serif, Georgia, serif; color: #1A1612; max-width: 580px; margin: 0; padding: 0;">
  <p style="font-size: 16px; line-height: 1.55;">Hi ${escapeHTML(firstName)},</p>
  <p style="font-size: 16px; line-height: 1.55;">
    Thanks for your message — it's landed in my inbox and I'll get back to you
    as soon as I can. For reference, this is what you sent:
  </p>
  <table style="border-collapse: collapse; margin: 1.25rem 0; font-family: ui-monospace, monospace; font-size: 12px; color: #5A5046;">
    <tr><td style="padding-right: 1rem;">SUBJECT</td><td>${escapeHTML(s.subject)}</td></tr>
  </table>
  <div style="font-size: 16px; line-height: 1.55; border-left: 2px solid #8A8170; padding-left: 1rem; color: #5A5046;">${body}</div>
  <p style="font-size: 16px; line-height: 1.55; margin-top: 2rem;">— Joel</p>
  <hr style="border: 0; border-top: 1px solid #C8BFAD;">
  <p style="font-family: ui-monospace, monospace; font-size: 11px; color: #5A5046;">
    J Wright Industries · wrightindustries.com.au
  </p>
</body></html>`
}
