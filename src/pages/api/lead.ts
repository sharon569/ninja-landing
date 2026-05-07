import type { APIRoute } from 'astro';

export const prerender = false;

const TO_EMAIL = 'sharon@samp.ninja';
const FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ success: false, error: 'invalid_form' }, 400);
  }

  if (str(form.get('_honey'))) {
    return json({ success: true });
  }

  const name = str(form.get('name'));
  const phone = str(form.get('phone'));
  const email = str(form.get('email'));
  const topic = str(form.get('topic'));
  const msg = str(form.get('msg'));

  if (name.length < 2) {
    return json({ success: false, error: 'invalid_name' }, 400);
  }
  if (!/^0\d{8,9}$/.test(phone.replace(/[\s\-]/g, ''))) {
    return json({ success: false, error: 'invalid_phone' }, 400);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  console.log('[lead]', JSON.stringify({ name, phone, email, topic, msg: msg.slice(0, 200), ip }));

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return json({ success: true, transport: 'logged_only' });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email || undefined,
      subject: `ליד חדש: ${name}${topic ? ` (${topic})` : ''}`,
      html: render({ name, phone, email, topic, msg, ip }),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[lead] resend rejected', res.status, text.slice(0, 200));
    return json({ success: false, error: 'send_failed' }, 502);
  }

  return json({ success: true });
};

function str(v: FormDataEntryValue | null) {
  return (v ?? '').toString().trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(d: { name: string; phone: string; email: string; topic: string; msg: string; ip: string }) {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;"><strong>${escape(label)}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${escape(value)}</td></tr>`
      : '';
  return `
    <div style="font-family:system-ui,-apple-system,'Heebo',sans-serif;max-width:640px;margin:0 auto;color:#0a0a0a;direction:rtl;">
      <h2 style="font-weight:700;letter-spacing:-0.01em;">ליד חדש מאתר NINJA Digital</h2>
      <table style="border-collapse:collapse;width:100%;margin-top:14px;">
        ${row('שם', d.name)}
        ${row('טלפון', d.phone)}
        ${row('אימייל', d.email)}
        ${row('מעוניין ב', d.topic)}
        ${row('IP', d.ip)}
      </table>
      ${d.msg ? `<h3 style="margin-top:22px;">פרטים נוספים</h3><div style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:6px;">${escape(d.msg)}</div>` : ''}
    </div>
  `;
}
