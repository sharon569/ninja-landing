---
title: "Schema Markup לאיקומרס: 5 דקות עבודה שיכולות לתת לכם עמוד 1"
description: "Schema הוא הקוד המוסתר שגוגל אוהב. עמודי מוצר עם Schema מקבלים Rich Results — תמונות, ביקורות, מחיר. CTR גדל ב-30%."
date: 2026-03-20
category: "SEO"
readTime: 6
---

יש לכם דף מוצר. אתם במקום 5 בגוגל. המתחרה במקום 7 — אבל מקבל 3 פעמים יותר קליקים. **למה?**

כי המתחרה הוסיף שורות קוד פשוטות שגוגל אוהב. בעולם ה-SEO זה נקרא **Schema Markup**, וזה הסוד הכי לא מנוצל בקרב 90% מהאתרים בישראל.

## מה זה Schema

Schema הוא **קוד JSON שאתם מטמיע בדפים** שמסביר לגוגל **בדיוק מה יש בדף**.

ללא Schema, גוגל מנחש:
> "יש כאן טקסט. אולי זה מוצר?"

עם Schema, גוגל יודע:
> "זה מוצר ׳נעלי ספורט נייקי׳, מחיר ₪450, 4.7 כוכבים מ-127 ביקורות, במלאי, משלוח 24 שעות."

ואז גוגל מציג זאת בתוצאת החיפוש כ-**Rich Result** — שורה שתופסת פי 3 מקום מקום מתוצאה רגילה.

## ההבדל בקליקים

תוצאה רגילה:
```
[כותרת]
[קישור]
[תיאור...]
```

Rich Result:
```
[כותרת]                          [תמונה]
[★★★★☆ 4.7 (127)] [₪450] [במלאי]
[משלוח חינם · החזרה חינם · 24h]
[קישור]
[תיאור...]
```

**ה-CTR גדל ב-30-50%**. זה בלי לעשות שום דבר אחר ב-SEO.

## הסוגים החשובים לאיקומרס

### 1. Product Schema (חיוני)

בכל דף מוצר:

```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "נעלי ספורט נייקי אייר מקס",
  "image": "https://yoursite.co.il/products/nike-airmax.jpg",
  "description": "נעלי ספורט נוחות לריצה",
  "brand": {
    "@type": "Brand",
    "name": "Nike"
  },
  "sku": "NK-AM-2024-BLK-42",
  "offers": {
    "@type": "Offer",
    "price": "450.00",
    "priceCurrency": "ILS",
    "availability": "https://schema.org/InStock",
    "shippingDetails": { ... }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "127"
  }
}
```

מה גוגל מציג מזה:
- ⭐ ביקורות וכוכבים
- 💰 מחיר
- 📦 זמינות
- 🚚 פרטי משלוח

### 2. BreadcrumbList Schema

מסלול ניווט. גוגל מציג אותו במקום ה-URL הארוך:

```
yoursite.co.il › ספורט › נעליים › נייקי
```

במקום:
```
yoursite.co.il/category/sport-shoes/nike-airmax-2024-product-id-12345
```

נראה הרבה יותר אמין → CTR גבוה יותר.

### 3. FAQ Schema

אם יש לכם שאלות נפוצות בדף — Schema מציג אותן ישר בגוגל:

```
[התוצאה שלכם]
▼ מתי המוצר מגיע?
▼ אפשר להחזיר?
▼ מה תכונות המוצר?
```

זה תופס **המון** מקום על המסך → המתחרים נדחפים למטה.

### 4. Organization Schema

בכל אתר, פעם אחת בדף הבית. עוזר לגוגל לבנות "Knowledge Panel" — הקופסה הצדדית עם פרטי החברה.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "השם שלכם",
  "url": "https://yoursite.co.il",
  "logo": "https://yoursite.co.il/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+972-3-1234567",
    "contactType": "customer service"
  },
  "sameAs": [
    "https://facebook.com/yourbrand",
    "https://instagram.com/yourbrand"
  ]
}
```

### 5. Review Schema

תמיד הוסף ביקורות מהשטח. זה יוצר אמון.

## איך מטמיעים

### Shopify
תוסף בחינם: **JSON-LD for SEO**. מטמיע אוטומטית. 5 דקות.

### WordPress / WooCommerce
תוסף **RankMath** או **Yoast Premium**. גם מטמיע אוטומטית.

### אתר Custom
חברו את ה-Schema ידנית. כל דף = JSON ייחודי. דורש מתכנת.

## בדיקה — חובה לפני שאתם זז

לפני שאתם אומר "טוב, מטמע" — תבדקו את ה-Schema:

**Rich Results Test:** https://search.google.com/test/rich-results

תכניס URL → תקבלו דוח שיגיד לכם אם ה-Schema נכון או לא.

**Schema Markup Validator:** https://validator.schema.org

עוד כלי לוולידציה.

## טעויות נפוצות

❌ **Schema של מוצר שלא במלאי, מסומן InStock** — גוגל יחסום אותך מ-Rich Results.

❌ **ביקורות מזויפות / שלא בדף** — אם תכריז "127 ביקורות" אבל אין להן מקבילה גלויה בדף → סנקציה.

❌ **Schema לא מתעדכן** — אם המחיר משתנה, ה-Schema צריך להתעדכן אוטומטית. אחרת אתם משקר לגוגל.

## דוגמה אמיתית

לקוח אופנה. 5,000 דפי מוצר.

**לפני Schema:**
- CTR ממוצע מ-Google: 2.4%
- תוצאות רגילות בלבד

**אחרי Schema (חודש 1):**
- 80% מהדפים מציגים Rich Results
- CTR ממוצע: **3.6%** (+50%)
- תנועה אורגנית: **+62%**

זמן עבודה: **3 שעות התקנה**. זה הכל.

---

רוצים שנבדוק את ה-Schema באתר שלכם? שלחו URL ב-[WhatsApp](https://wa.me/972545822451) — אריץ Rich Results Test ואחזור עם המלצות תוך 24 שעות.
