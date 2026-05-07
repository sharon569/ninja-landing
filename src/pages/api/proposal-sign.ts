import type { APIRoute } from 'astro';
import { generateProposalPDF } from '../../lib/proposal-pdf';

export const prerender = false;

const TO_EMAIL = 'sharon@samp.ninja';
const FROM_EMAIL = process.env.PROPOSAL_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';
const REPLY_TO_CUSTOMER = 'sharon@samp.ninja';

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

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ ok: true, sent: false, reason: 'RESEND_API_KEY not configured' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sigAttachment = buildSignatureAttachment(payload.signature);

  let pdfAttachment: ResendAttachment[] = [];
  try {
    const pdfBuffer = await generateProposalPDF(payload);
    pdfAttachment = [{
      filename: 'proposal-ninja-digital.pdf',
      content: pdfBuffer.toString('base64'),
      content_type: 'application/pdf',
    }];
  } catch (err) {
    console.error('[proposal-sign] PDF generation failed', err instanceof Error ? err.message : err);
  }

  const adminRes = await sendEmail(key, {
    to: [TO_EMAIL],
    reply_to: payload.email,
    subject: `הצעת מחיר ${payload.proposal}: אושרה ע"י ${payload.name ?? 'לקוח'}`,
    html: renderAdmin(payload, ip),
    attachments: [...(sigAttachment ?? []), ...pdfAttachment],
  });

  if (!adminRes.ok) {
    const text = await adminRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, sent: false, reason: `admin Resend ${adminRes.status}: ${text.slice(0, 200)}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let customerSent = false;
  if (payload.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    const customerRes = await sendEmail(key, {
      to: [payload.email],
      reply_to: REPLY_TO_CUSTOMER,
      subject: `אישור חתימה: הצעת מחיר NINJA Digital`,
      html: renderCustomer(payload, pdfAttachment.length > 0),
      attachments: [...(sigAttachment ?? []), ...pdfAttachment],
    });
    customerSent = customerRes.ok;
    if (!customerSent) {
      console.error('[proposal-sign] customer confirmation failed but admin sent');
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent: true, customerSent }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

interface ResendAttachment {
  filename: string;
  content: string;
  content_id?: string;
  content_type?: string;
}

async function sendEmail(
  key: string,
  body: {
    to: string[];
    reply_to?: string;
    subject: string;
    html: string;
    attachments?: ResendAttachment[];
  },
) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, ...body }),
  });
}

function buildSignatureAttachment(signature?: string): ResendAttachment[] | undefined {
  if (!signature) return undefined;
  const match = signature.match(/^data:image\/([a-z]+);base64,(.+)$/i);
  if (!match) return undefined;
  return [{
    filename: `signature.${match[1].toLowerCase()}`,
    content: match[2],
    content_id: 'signature',
    content_type: `image/${match[1].toLowerCase()}`,
  }];
}

function escape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function proposalUrl(id: string) {
  const slug = (id ?? '').split('-')[0] || 'feffer';
  return `https://www.samp.ninja/proposal/${slug}`;
}

function renderAdmin(payload: Payload, ip: string) {
  return `
    <div style="font-family: system-ui, -apple-system, 'Heebo', sans-serif; max-width: 640px; margin: 0 auto; color: #0a0a0a;">
      <h2 style="font-weight: 700; letter-spacing: -0.01em;">הצעת מחיר אושרה</h2>
      <p>ההצעה אושרה בעמוד <code>/proposal/${escape(payload.proposal ?? '')}</code>.</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 14px;">
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>שם</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(payload.name ?? '')}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>אימייל</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(payload.email ?? '')}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>טלפון</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(payload.phone ?? '')}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>תפקיד</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(payload.title ?? '')}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>תאריך אישור</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(payload.signedAt ?? '')}</td></tr>
        <tr><td style="padding: 6px 10px; border-bottom: 1px solid #eee;"><strong>IP</strong></td><td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escape(ip)}</td></tr>
      </table>
      <h3 style="margin-top: 22px;">חתימה דיגיטלית</h3>
      ${payload.signature ? `<img src="cid:signature" alt="Signature" style="max-width: 100%; border: 1px solid #ddd; padding: 4px;" />` : '<em>לא צורפה תמונה</em>'}
      ${payload.interest && payload.interest.length ? `
        <h3 style="margin-top: 22px;">שירותים נוספים שסומנו כמעניינים</h3>
        <ul style="padding-inline-start: 20px; line-height: 1.8;">
          ${payload.interest.map((id) => `<li>${escape(id)}</li>`).join('')}
        </ul>` : ''}
      <p style="margin-top: 22px; color: #666; font-size: 0.9rem;">
        אישורי העלות והתנאים: scope=${escape(payload.confirm_scope ?? '')}, price=${escape(payload.confirm_price ?? '')}, terms=${escape(payload.confirm_terms ?? '')}
      </p>
    </div>
  `;
}

function renderCustomer(payload: Payload, hasPDF: boolean) {
  const date = formatDate(payload.signedAt);
  const url = proposalUrl(payload.proposal);
  const name = payload.name ?? '';

  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 0;color:#71717a;width:110px;font-size:13px;vertical-align:top;">${escape(label)}</td><td style="padding:6px 0;color:#0a0a0a;font-size:14px;">${escape(value)}</td></tr>`
      : '';

  const details = [
    row('שם', name),
    row('אימייל', payload.email ?? ''),
    row('טלפון', payload.phone ?? ''),
    row('תפקיד', payload.title ?? ''),
    row('תאריך חתימה', date),
  ].join('');

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#f5f5f7;">
<div style="background:#f5f5f7;padding:40px 16px;font-family:'Heebo',system-ui,Arial,sans-serif;direction:rtl;color:#0a0a0a;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;padding:40px 36px;">
        <div style="text-align:center;margin-bottom:28px;">
          <img src="https://www.samp.ninja/brand/assets/shuriken-mark-512.png" width="48" height="48" alt="" style="display:block;margin:0 auto 12px;border:0;outline:none;">
          <div style="font-family:'Rubik',Arial,sans-serif;font-weight:900;letter-spacing:0.22em;font-size:12px;color:#0a0a0a;">NINJA DIGITAL</div>
        </div>

        <div style="font-size:11px;color:#a1a1aa;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:6px;">אישור חתימה</div>
        <h1 style="font-family:'Rubik',Arial,sans-serif;font-size:24px;font-weight:900;color:#0a0a0a;margin:0 0 14px;line-height:1.25;letter-spacing:-0.01em;">תודה${name ? `, ${escape(name)}` : ''}. החתימה התקבלה.</h1>
        <p style="color:#52525b;font-size:15px;line-height:1.7;margin:0 0 26px;">הקלטנו את הסכמתך להצעת המחיר במערכת. מייל זה משמש כאישור החתימה${hasPDF ? `, וקובץ ה-PDF של ההצעה החתומה מצורף למייל זה` : ''}. נחזור אליך בימים הקרובים עם קיק-אוף ולוח זמנים לתחילת העבודה.</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border-radius:10px;margin-bottom:24px;border-collapse:separate;">
          <tr><td style="padding:18px 22px;">
            <div style="font-size:11px;color:#a1a1aa;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">פרטי החתימה</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;line-height:1.7;">${details}</table>
          </td></tr>
        </table>

        <div style="background:#fafafa;border-right:3px solid #ff2a3c;border-radius:6px;padding:14px 18px;margin-bottom:24px;color:#27272a;font-size:13px;line-height:1.7;">
          אישרת את היקף השירותים, את המחיר ואת תנאי ההתקשרות.
        </div>

        ${payload.signature ? `
        <div style="margin-bottom:26px;">
          <div style="font-size:11px;color:#a1a1aa;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">החתימה הדיגיטלית שלך</div>
          <div style="background:#ffffff;border:1px solid #e5e5ea;border-radius:8px;padding:10px;text-align:center;">
            <img src="cid:signature" alt="חתימה" style="max-width:100%;height:auto;display:inline-block;">
          </div>
        </div>` : ''}

        <div style="text-align:center;margin-bottom:26px;">
          <a href="${url}" style="display:inline-block;padding:11px 22px;background:#0a0a0a;color:#ffffff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">לצפייה בהצעת המחיר המלאה</a>
        </div>

        <div style="border-top:1px solid #e5e5ea;padding-top:22px;text-align:center;">
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
      <td style="text-align:center;padding-top:16px;">
        <a href="https://www.samp.ninja" style="color:#a1a1aa;font-size:11px;text-decoration:none;letter-spacing:0.22em;">WWW.SAMP.NINJA</a>
      </td>
    </tr>
  </table>
</div>
</body></html>
  `.trim();
}
