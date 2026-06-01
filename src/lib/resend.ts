// Minimal Resend REST helper (shared by lead + brief endpoints).
const FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';

export async function sendEmail(payload: {
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[email] no RESEND_API_KEY — logged only:', payload.subject);
    return { ok: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
  });
  if (!res.ok) {
    console.error('[email] resend rejected', res.status, (await res.text().catch(() => '')).slice(0, 200));
  }
  return { ok: res.ok };
}
