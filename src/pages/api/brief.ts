import type { APIRoute } from 'astro';
import { validateContact, buildAnswers, normalizePhone } from '../../lib/brief-validation';
import { createSupabaseServiceClient } from '../../lib/supabase';
import { sendEmail } from '../../lib/resend';

export const prerender = false;

const ADMIN_EMAIL = 'sharon@samp.ninja';

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ success: false, error: 'invalid_form' }, 400);
  }

  // honeypot
  if ((form.get('_honey') ?? '').toString().trim()) return json({ success: true });

  const contact = {
    business_name: (form.get('business_name') ?? '').toString().trim(),
    contact_name: (form.get('contact_name') ?? '').toString().trim(),
    phone: (form.get('phone') ?? '').toString().trim(),
    email: (form.get('email') ?? '').toString().trim(),
  };

  const v = validateContact(contact);
  if (!v.ok) return json({ success: false, error: v.error }, 400);

  const answers = buildAnswers(form);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

  // persist
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('intake_briefs')
    .insert({
      business_name: contact.business_name,
      contact_name: contact.contact_name,
      phone: normalizePhone(contact.phone),
      email: contact.email || null,
      answers,
      ip,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[brief] insert failed', error.message);
    return json({ success: false, error: 'save_failed' }, 502);
  }

  // notify admin (non-fatal)
  await sendEmail({
    to: [ADMIN_EMAIL],
    reply_to: contact.email || undefined,
    subject: `אפיון חדש: ${contact.business_name}`,
    html: renderAdmin(contact, answers, data!.id),
  });

  return json({ success: true });
};

function renderAdmin(
  c: { business_name: string; contact_name: string; phone: string; email: string },
  answers: Record<string, unknown>,
  id: string,
) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = Object.entries(answers)
    .map(
      ([k, val]) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;"><strong>${esc(k)}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(Array.isArray(val) ? val.join(', ') : String(val))}</td></tr>`,
    )
    .join('');
  return `
    <div style="font-family:'Heebo',system-ui,sans-serif;max-width:680px;margin:0 auto;color:#0a0a0a;direction:rtl;">
      <h2>אפיון חדש — ${esc(c.business_name)}</h2>
      <p>איש קשר: ${esc(c.contact_name)} · ${esc(c.phone)} · ${esc(c.email || '—')}</p>
      <p>מזהה רשומה: <code>${esc(id)}</code></p>
      <table style="border-collapse:collapse;width:100%;margin-top:14px;">${rows}</table>
    </div>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
