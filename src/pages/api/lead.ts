import type { APIRoute } from 'astro';

export const prerender = false;

const TO_EMAIL = 'sharon@samp.ninja';
const FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';
const REPLY_TO_CUSTOMER = 'sharon@samp.ninja';

const SERVICE_BLURBS: Record<string, string> = {
  'גוגל אדס': 'אנחנו בונים תשתיות אגרסיביות בגוגל אדס: bid management אוטומטי, audience signals חכמים, אופטימיזציה יומית. המדד היחיד שמעניין אותנו זה ROAS.',
  'SEO אורגני': 'SEO אצלנו מבוסס על topic clusters, schema markup ו-EEAT אמיתי. מילות המפתח שאנחנו מדרגים הן אלה שמייצרות לידים, לא רק תנועה.',
  'בניית אתר / התממשקויות': 'אתרים שנבנים לקונברסיה. סטאק מודרני, ביצועים מושלמים, והתממשקויות ל-CRM ולסליקה שעובדות באמת ולא רק על הנייר.',
  'פלאשי / ניהול לקוחות': 'הקמה ותחזוקה שוטפת של פלאשי. אוטומציות SMS ו-WhatsApp, סגמנטציה חכמה, ושימור לקוחות שעובד מהיום הראשון.',
  'מועדון לקוחות': 'מועדון שלא נשאר במגירה. מנגנוני נקודות, הפניות ואוטומציות. לקוחות חוזרים זה ה-ROAS האמיתי.',
  'חבילה משולבת': 'כשגוגל אדס, SEO, אתר ומועדון רצים מאותה מערכת, התוצאות מכפילות. אנחנו בונים את כל הצינור מקצה לקצה.',
};

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
      ? `<tr><td style="padding:6px 0;color:#71717a;width:90px;font-size:13px;">${escape(label)}</td><td style="padding:6px 0;color:#0a0a0a;font-size:14px;">${escape(value)}</td></tr>`
      : '';
  const recap = [d.name && recapRow('שם', d.name), d.phone && recapRow('טלפון', d.phone), d.topic && recapRow('נושא', d.topic)]
    .filter(Boolean)
    .join('');

  const blurb = SERVICE_BLURBS[d.topic];

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#f5f5f7;">
<div style="background:#f5f5f7;padding:40px 16px;font-family:'Heebo',system-ui,Arial,sans-serif;direction:rtl;color:#0a0a0a;">
  <table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:#ffffff;border:1px solid #e5e5ea;border-radius:18px;padding:44px 36px;">
        <div style="text-align:center;margin-bottom:32px;">
          <img src="https://www.samp.ninja/brand/assets/shuriken-mark-512.png" width="56" height="56" alt="" style="display:block;margin:0 auto 14px;border:0;outline:none;">
          <div style="font-family:'Rubik',Arial,sans-serif;font-weight:900;letter-spacing:0.22em;font-size:13px;color:#0a0a0a;">NINJA DIGITAL</div>
        </div>
        <h1 style="font-family:'Rubik',Arial,sans-serif;font-size:30px;font-weight:900;color:#0a0a0a;margin:0 0 14px;text-align:center;line-height:1.15;letter-spacing:-0.01em;">תודה, ${escape(d.name)}.</h1>
        <p style="color:#52525b;font-size:16px;line-height:1.7;margin:0 0 28px;text-align:center;">קיבלנו את פנייתך. נחזור אליך תוך 24 שעות עם תוכנית התקפה ראשונית.</p>
        ${blurb ? `<div style="border-right:3px solid #ff2a3c;background:#fafafa;padding:18px 22px;margin-bottom:28px;border-radius:6px;color:#27272a;font-size:14px;line-height:1.75;">${escape(blurb)}</div>` : ''}
        ${recap ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border-radius:12px;margin-bottom:28px;border-collapse:separate;">
          <tr><td style="padding:18px 22px;">
            <div style="font-size:11px;color:#a1a1aa;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">פרטים שהשארת</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;line-height:1.8;">${recap}</table>
          </td></tr>
        </table>` : ''}
        <div style="border-top:1px solid #e5e5ea;padding-top:24px;text-align:center;">
          <div style="color:#0a0a0a;font-weight:700;font-size:14px;margin-bottom:6px;">שרון, NINJA Digital</div>
          <div style="font-size:13px;line-height:1.8;color:#52525b;">
            <a href="https://wa.me/972545822451" style="color:#a07b00;text-decoration:none;font-weight:600;">WhatsApp 054-582-2451</a>
            &nbsp;·&nbsp;
            <a href="mailto:sharon@samp.ninja" style="color:#a07b00;text-decoration:none;font-weight:600;">sharon@samp.ninja</a>
          </div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="text-align:center;padding-top:18px;">
        <a href="https://www.samp.ninja" style="color:#a1a1aa;font-size:11px;text-decoration:none;letter-spacing:0.22em;">WWW.SAMP.NINJA</a>
      </td>
    </tr>
  </table>
</div>
</body></html>
  `.trim();
}
