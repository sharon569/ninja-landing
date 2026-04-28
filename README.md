# NINJA Digital — Landing Page

דף נחיתה לסוכנות שיווק דיגיטלי. סטטי לחלוטין (HTML/CSS/JS), מוכן לפריסה ב-Vercel.

## מבנה
- `index.html` — מבנה הדף
- `styles.css` — עיצוב, אנימציות, רספונסיביות
- `script.js` — אינטראקציות (reveal, counters, tilt, ולידציה לטופס)

## הרצה מקומית
```bash
python -m http.server 8088
```
ואז `http://localhost:8088`

## פריסה ב-Vercel
1. Push ל-GitHub
2. ב-Vercel: Import Project → בחר את הריפו → Deploy
3. אין הגדרות build נדרשות (סטטי טהור)

## TODO
- חיבור הטופס ל-webhook אמיתי (`script.js`, חיפוש `הדמיית שליחה`)
- עדכון מספר טלפון/WhatsApp (חיפוש `972500000000` ב-`index.html`)
