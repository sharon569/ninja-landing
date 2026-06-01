// שדות פרטי קשר — לא נכנסים ל-answers, חלקם חובה.
const CONTACT_FIELDS = new Set(['business_name', 'contact_name', 'phone', 'email']);
const META_FIELDS = new Set(['_honey']);

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-]/g, '');
}

export function isValidPhone(raw: string): boolean {
  return /^0\d{8,9}$/.test(normalizePhone(raw));
}

export interface ContactInput {
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string;
}

export function validateContact(c: ContactInput): { ok: boolean; error?: string } {
  if ((c.business_name ?? '').trim().length < 2) return { ok: false, error: 'invalid_business' };
  if ((c.contact_name ?? '').trim().length < 2) return { ok: false, error: 'invalid_contact' };
  if (!isValidPhone(c.phone ?? '')) return { ok: false, error: 'invalid_phone' };
  return { ok: true };
}

/** אוסף את כל שדות השאלון (פרט לפרטי קשר ו-meta) ל-object גמיש; ערכים חוזרים → מערך. */
export function buildAnswers(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (CONTACT_FIELDS.has(key) || META_FIELDS.has(key)) continue;
    const values = form.getAll(key).map((v) => v.toString().trim()).filter(Boolean);
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}
