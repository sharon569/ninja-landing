import type { APIRoute } from 'astro';

export const prerender = false;

const TO_EMAIL = 'sharon@samp.ninja';
const FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';
const REPLY_TO_CUSTOMER = 'sharon@samp.ninja';

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

  const adminRes = await sendEmail(key, {
    to: [TO_EMAIL],
    reply_to: email || undefined,
    subject: `ליד חדש: ${name}${topic ? ` (${topic})` : ''}`,
    html: renderAdmin({ name, phone, email, topic, msg, ip }),
  });

  if (!adminRes.ok) {
    return json({ success: false, error: 'send_failed' }, 502);
  }

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const customerRes = await sendEmail(key, {
      to: [email],
      reply_to: REPLY_TO_CUSTOMER,
      subject: `תודה ${name}, קיבלנו את פנייתך`,
      html: renderCustomer({ name, phone, topic, msg }),
    });
    if (!customerRes.ok) {
      console.error('[lead] customer thank-you failed but admin sent — continuing');
    }
  }

  return json({ success: true });
};

async function sendEmail(
  key: string,
  payload: { to: string[]; reply_to?: string; subject: string; html: string },
) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[lead] resend rejected', res.status, text.slice(0, 200));
  }
  return res;
}

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

function renderAdmin(d: { name: string; phone: string; email: string; topic: string; msg: string; ip: string }) {
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

function renderCustomer(d: { name: string; phone: string; topic: string; msg: string }) {
  const recapRow = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:5px 0;color:#6a6f7c;width:90px;font-size:13px;">${escape(label)}</td><td style="padding:5px 0;color:#f5f5f7;font-size:14px;">${escape(value)}</td></tr>`
      : '';
  const recap = [d.name && recapRow('שם', d.name), d.phone && recapRow('טלפון', d.phone), d.topic && recapRow('נושא', d.topic)]
    .filter(Boolean)
    .join('');

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#08090c;">
<div style="background:#08090c;padding:48px 16px;font-family:'Heebo','Rubik',system-ui,Arial,sans-serif;direction:rtl;color:#f5f5f7;">
  <table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:#0c0e13;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:48px 36px;">
        <div style="text-align:center;margin-bottom:36px;">
          <img src="https://www.samp.ninja/brand/assets/shuriken-mark-512.png" width="56" height="56" alt="" style="display:block;margin:0 auto 14px;border:0;outline:none;">
          <div style="font-family:'Rubik',Arial,sans-serif;font-weight:900;letter-spacing:0.22em;font-size:13px;color:#ffd166;">NINJA DIGITAL</div>
        </div>
        <h1 style="font-family:'Rubik',Arial,sans-serif;font-size:32px;font-weight:900;color:#f5f5f7;margin:0 0 14px;text-align:center;line-height:1.15;letter-spacing:-0.01em;">תודה, ${escape(d.name)}.</h1>
        <p style="color:#a8acb6;font-size:16px;line-height:1.7;margin:0 0 32px;text-align:center;">קיבלנו את פנייתך. נחזור אליך תוך 24 שעות עם תוכנית התקפה ראשונית.</p>
        ${recap ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:32px;border-collapse:separate;">
          <tr><td style="padding:20px 22px;">
            <div style="font-size:11px;color:#6a6f7c;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">פרטים שהשארת</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;line-height:1.8;">${recap}</table>
          </td></tr>
        </table>` : ''}
        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:28px;text-align:center;">
          <div style="color:#f5f5f7;font-weight:700;font-size:14px;margin-bottom:8px;">שרון, NINJA Digital</div>
          <div style="font-size:13px;line-height:1.8;">
            <a href="https://wa.me/972545822451" style="color:#ffd166;text-decoration:none;">WhatsApp 054-582-2451</a>
            &nbsp;·&nbsp;
            <a href="mailto:sharon@samp.ninja" style="color:#ffd166;text-decoration:none;">sharon@samp.ninja</a>
          </div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding-top:20px;">
        <a href="https://www.samp.ninja" style="color:#6a6f7c;font-size:11px;text-decoration:none;letter-spacing:0.22em;">WWW.SAMP.NINJA</a>
      </td>
    </tr>
  </table>
</div>
</body></html>
  `.trim();
}
