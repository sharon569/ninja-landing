import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.tar';

export interface ProposalPDFInput {
  proposal?: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  signedAt?: string;
  signature?: string;
  confirm_scope?: string;
  confirm_price?: string;
  confirm_terms?: string;
}

export async function generateProposalPDF(input: ProposalPDFInput): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderHTML(input), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
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
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function renderHTML(d: ProposalPDFInput): string {
  const today = formatDate(new Date().toISOString());
  const signedAt = formatDate(d.signedAt);
  const name = escape(d.name ?? '');
  const role = escape(d.title ?? '');
  const email = escape(d.email ?? '');
  const phone = escape(d.phone ?? '');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>הצעת מחיר NINJA Digital</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&family=Rubik:wght@600;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Heebo', system-ui, sans-serif; color: #0a0a0a; background: #fff; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 28px 32px; }

  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid #e5e5ea; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 36px; height: 36px; }
  .brand-name { font-family: 'Rubik', sans-serif; font-weight: 900; letter-spacing: 0.18em; font-size: 13px; color: #0a0a0a; }
  .doc-meta { text-align: left; font-size: 11px; color: #71717a; line-height: 1.5; }
  .doc-meta strong { color: #0a0a0a; font-weight: 700; display: block; font-size: 12px; margin-top: 2px; }

  h1 { font-family: 'Rubik', sans-serif; font-size: 26px; font-weight: 900; line-height: 1.15; letter-spacing: -0.01em; margin-bottom: 6px; }
  h1 em { font-style: normal; color: #ff2a3c; }
  .lede { color: #52525b; font-size: 13px; max-width: 540px; margin-bottom: 26px; }

  .recipient { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 14px 18px; background: #fafafa; border: 1px solid #e5e5ea; border-radius: 10px; margin-bottom: 24px; }
  .recipient .cell { font-size: 12px; }
  .recipient .label { color: #71717a; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .recipient .value { color: #0a0a0a; font-size: 13px; font-weight: 600; }

  .section { margin-bottom: 22px; }
  .section-eyebrow { display: inline-block; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700; color: #ff2a3c; margin-bottom: 6px; }
  .section h2 { font-family: 'Rubik', sans-serif; font-size: 16px; font-weight: 800; margin-bottom: 10px; letter-spacing: -0.005em; }
  .section p { font-size: 12.5px; color: #3f3f46; }
  .section ul { padding-inline-start: 18px; margin-top: 6px; font-size: 12px; color: #3f3f46; line-height: 1.85; }

  table.price { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  table.price th, table.price td { padding: 10px 12px; text-align: right; border-bottom: 1px solid #f0f0f1; }
  table.price th { background: #fafafa; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #71717a; font-weight: 700; }
  table.price td.amount { text-align: left; font-weight: 700; color: #0a0a0a; white-space: nowrap; }
  table.price tr.total td { font-size: 14px; padding-top: 14px; padding-bottom: 14px; border-top: 2px solid #0a0a0a; border-bottom: none; }
  table.price tr.total td.amount { font-family: 'Rubik', sans-serif; font-size: 18px; font-weight: 900; }
  table.price tr.muted td { color: #71717a; }

  .terms { background: #fafafa; border-right: 3px solid #ff2a3c; border-radius: 6px; padding: 14px 18px; font-size: 12px; color: #27272a; line-height: 1.75; margin-top: 14px; }
  .terms strong { color: #0a0a0a; font-weight: 700; }

  .signing { margin-top: 24px; padding-top: 22px; border-top: 1px solid #e5e5ea; }
  .signing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
  .sig-box { border: 1px solid #e5e5ea; border-radius: 8px; padding: 10px; background: #fff; min-height: 110px; display: flex; align-items: center; justify-content: center; }
  .sig-box img { max-width: 100%; max-height: 100px; }
  .sig-empty { color: #a1a1aa; font-size: 12px; font-style: italic; }
  .sig-meta { font-size: 12px; line-height: 2; }
  .sig-meta .row { display: flex; gap: 8px; }
  .sig-meta .lbl { color: #71717a; min-width: 70px; }
  .sig-meta .val { color: #0a0a0a; font-weight: 600; }

  .confirms { margin-top: 14px; font-size: 12px; color: #3f3f46; line-height: 1.95; }
  .confirms .ok { color: #0a0a0a; font-weight: 700; }
  .confirms .check { color: #16a34a; font-weight: 700; margin-left: 4px; }

  .footer { margin-top: 26px; padding-top: 14px; border-top: 1px solid #e5e5ea; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #71717a; letter-spacing: 0.04em; }
  .footer .brand-mini { font-family: 'Rubik', sans-serif; font-weight: 800; letter-spacing: 0.18em; color: #0a0a0a; }
</style>
</head>
<body>
  <header class="header">
    <div class="brand">
      <img src="https://www.samp.ninja/brand/assets/shuriken-mark-512.png" alt="">
      <div class="brand-name">NINJA DIGITAL</div>
    </div>
    <div class="doc-meta">
      מסמך זה<strong>הצעת מחיר</strong>
      תאריך הפקה<strong>${today}</strong>
      תוקף<strong>30 יום</strong>
    </div>
  </header>

  <h1>אתר התאגידי של <em>UNOX × י. פפר בע"מ</em></h1>
  <p class="lede">פירוט מלא של היקף העבודה, תוכן הפרויקט, סיכום עלויות ותנאי ההתקשרות.</p>

  <div class="recipient">
    <div class="cell"><div class="label">לקוח</div><div class="value">י. פפר בע"מ</div></div>
    <div class="cell"><div class="label">חתימה ע"י</div><div class="value">${name || '—'}</div></div>
    <div class="cell"><div class="label">פרויקט</div><div class="value">אתר תאגידי + קונפיגורטור</div></div>
  </div>

  <div class="section">
    <span class="section-eyebrow">תיאור הפרויקט</span>
    <h2>שבעה עמודי תוכן + קונפיגורטור הזמנה אינטראקטיבי</h2>
    <p>אתר תאגידי מודרני בעברית מלאה, נבנה על Next.js עם אופטימיזציית SEO, רספונסיביות מלאה, ומערכת ניהול תוכן שמאפשרת לכם לעדכן את הכול בעצמכם.</p>
    <ul>
      <li>7 עמודי תוכן: עמוד הבית, סדרות מוצרים, אפליקציה ופלטפורמת ענן, בלוג, אודות, יצירת קשר, קונפיגורטור הזמנה.</li>
      <li>32 דגמים, 9 סדרות, 6 ליינים, 16 פוסטים בבלוג, 189 אביזרים אמיתיים בקונפיגורטור.</li>
      <li>תפריט mega-menu, גלריה דינמית, מטריצת התאמה חכמה לאביזרים, JSON-LD ו-sitemap אוטומטי.</li>
    </ul>
  </div>

  <div class="section">
    <span class="section-eyebrow">סיכום עלויות</span>
    <h2>מחיר חד-פעמי לבנייה ולמערכת</h2>
    <table class="price">
      <thead>
        <tr><th>פריט</th><th style="text-align:left;">סכום (ש"ח, לפני מע"מ)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>בניית אתר תאגידי + קונפיגורטור הזמנה + בלוג</td>
          <td class="amount">9,000</td>
        </tr>
        <tr class="muted">
          <td>מערכת ניהול תוכן + דשבורד מנהל</td>
          <td class="amount">כלול</td>
        </tr>
        <tr class="muted">
          <td>הדרכה ותמיכה שוטפת</td>
          <td class="amount">כלול</td>
        </tr>
        <tr class="muted">
          <td>זמן ביצוע</td>
          <td class="amount" style="font-weight:600;">עד שבוע ממועד האישור</td>
        </tr>
        <tr class="total">
          <td>סה"כ לבנייה (לפני מע"מ)</td>
          <td class="amount">9,000 ₪</td>
        </tr>
        <tr class="muted">
          <td>אחסון שנתי ב-Vercel (CDN גלובלי, SSL, גיבויים) — לחיוב נפרד</td>
          <td class="amount">850 ₪ / שנה</td>
        </tr>
      </tbody>
    </table>

    <div class="terms">
      <strong>תנאי תשלום:</strong> מקדמה של 50% עם תחילת העבודה, יתרת התשלום במסירה. תוספת מע"מ כחוק. תשלום במזומן או בהעברה בנקאית.
    </div>
  </div>

  <div class="signing">
    <span class="section-eyebrow">אישור חתימה</span>
    <h2 style="font-family:'Rubik',sans-serif;font-size:16px;font-weight:800;margin-bottom:14px;">פרטי החותם והחתימה הדיגיטלית</h2>
    <div class="signing-grid">
      <div class="sig-meta">
        <div class="row"><span class="lbl">שם מלא</span><span class="val">${name || '—'}</span></div>
        <div class="row"><span class="lbl">תפקיד</span><span class="val">${role || '—'}</span></div>
        <div class="row"><span class="lbl">אימייל</span><span class="val">${email || '—'}</span></div>
        <div class="row"><span class="lbl">טלפון</span><span class="val">${phone || '—'}</span></div>
        <div class="row"><span class="lbl">תאריך חתימה</span><span class="val">${signedAt || '—'}</span></div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;font-weight:700;margin-bottom:6px;">חתימה דיגיטלית</div>
        <div class="sig-box">
          ${d.signature ? `<img src="${d.signature}" alt="חתימה">` : `<span class="sig-empty">לא צורפה חתימה</span>`}
        </div>
      </div>
    </div>

    <div class="confirms">
      <span class="ok">אישור מלא ע"י החותם:</span>
      <div><span class="check">✓</span> אישור היקף השירותים שתואר בהצעה</div>
      <div><span class="check">✓</span> אישור המחיר: 9,000 ש"ח + מע"מ עבור בנייה, ו-850 ש"ח + מע"מ לשנה אחסון</div>
      <div><span class="check">✓</span> אישור תנאי ההתקשרות: מקדמה 50% ויתרה במסירה</div>
    </div>
  </div>

  <div class="footer">
    <span class="brand-mini">NINJA DIGITAL</span>
    <span>sharon@samp.ninja · 054-582-2451 · samp.ninja</span>
  </div>
</body>
</html>`;
}
