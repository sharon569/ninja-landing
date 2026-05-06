/**
 * Proposal signature submission endpoint.
 *
 * Receives a JSON payload from the proposal page (name, email, phone, title,
 * confirms, signature dataURL). Logs it to console always, optionally writes
 * to Supabase if a `proposal_signatures` table exists, and optionally fires
 * an email via Resend if `RESEND_API_KEY` is configured.
 *
 * The page is treated as accepted as soon as we have the payload — actual
 * email delivery is best-effort.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const TO_EMAIL = 'sharon@samp.ninja';
const FROM_EMAIL = process.env.PROPOSAL_FROM_EMAIL ?? 'NINJA Digital <noreply@samp.ninja>';

interface Payload {
  proposal: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  confirm_scope?: string;
  confirm_price?: string;
  confirm_terms?: string;
  signature?: string;
  signedAt?: string;
  interest?: string[];
}

async function sendEmailViaResend(payload: Payload, ip: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'RESEND_API_KEY not configured' };

  const subject = `הצעת מחיר ${payload.proposal}: אושרה ע"י ${payload.name ?? 'לקוחה'}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, 'Heebo', sans-serif; max-width: 640px; margin: 0 auto; color: #0a0a0a;">
      <h2 style="font-weight: 700; letter-spacing: -0.01em;">הצעת מחיר אושרה</h2>
      <p>הלקוחה השלימה את אישור ההצעה בעמוד <code>/proposal/${payload.proposal}</code>.</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 14px;">
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>שם</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${payload.name ?? ''}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>אימייל</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${payload.email ?? ''}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>טלפון</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${payload.phone ?? ''}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>תפקיד</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${payload.title ?? ''}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>תאריך אישור</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${payload.signedAt ?? ''}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>IP</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${ip}</td></tr>
      </table>
      <h3 style="margin-top: 22px;">חתימה דיגיטלית</h3>
      ${payload.signature ? `<img src="${payload.signature}" alt="Signature" style="max-width: 100%; border: 1px solid #ddd; padding: 4px;" />` : '<em>לא צורפה תמונה</em>'}
      ${payload.interest && payload.interest.length ? `
        <h3 style="margin-top: 22px;">שירותים נוספים שסומנו כמעניינים</h3>
        <ul style="padding-inline-start: 20px; line-height: 1.8;">
          ${payload.interest.map((id) => `<li>${id}</li>`).join('')}
        </ul>` : ''}
      <p style="margin-top: 22px; color: #666; font-size: 0.9rem;">
        אישורי העלות והתנאים: scope=${payload.confirm_scope}, price=${payload.confirm_price}, terms=${payload.confirm_terms}
      </p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: payload.email,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { sent: false, reason: `Resend ${res.status}: ${text.slice(0, 200)}` };
  }
  return { sent: true };
}

export const POST: APIRoute = async ({ request }) => {
  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';

  // Always log so the submission is captured even before email is wired.
  console.log('[proposal-sign]', JSON.stringify({
    proposal: payload.proposal,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    title: payload.title,
    confirm_scope: payload.confirm_scope,
    confirm_price: payload.confirm_price,
    confirm_terms: payload.confirm_terms,
    signedAt: payload.signedAt,
    signatureBytes: payload.signature?.length ?? 0,
    interest: payload.interest,
    ip,
    ua,
  }));

  const emailResult = await sendEmailViaResend(payload, ip).catch((e) => ({
    sent: false,
    reason: e instanceof Error ? e.message : String(e),
  }));

  // Return 202 (accepted) when payload received but email transport is not
  // wired. Return 200 when the email actually sent.
  const status = emailResult.sent ? 200 : 202;
  return new Response(
    JSON.stringify({ ok: true, ...emailResult }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
};
