# Navique — website + contact backend

## Chalane ka tareeka (Run)
1. Node.js 18+ install karein.
2. Is folder me terminal kholein:
   ```
   npm install          # (sirf email alerts chahiye to; warna skip kar sakte hain)
   cp .env.example .env # phir .env me ADMIN_KEY badlein
   npm start
   ```
3. Browser me kholein: http://localhost:3000
4. Messages dekhne ke liye: http://localhost:3000/admin?key=<ADMIN_KEY>
   (JSON chahiye to `&format=json` jodein.) Sab messages `data/contacts.jsonl` file me bhi save hote hain.

## Email alert (optional)
`.env` me SMTP_USER, SMTP_PASS (Gmail me "App Password"), NOTIFY_EMAIL bharein. Har naye message par aapko email aayega, aur Reply karte hi customer ko jayega.

## Kya hota hai
- Contact form -> `POST /api/contact` -> validate -> file me save -> (optional) email.
- "Get an AI Agent" button ab Contact page kholta hai, service "AI Agents" pehle se chuni hoti hai. Websites / Automation page ke Contact buttons bhi apni service pehle se chun dete hain.
- Spam se bachav: har IP se 10 minute me 5 message, hidden honeypot field, size limit.

## Online host karna
Render / Railway / any VPS par ye folder deploy karein (start command: `npm start`). Free hosts par file storage kabhi-kabhi mit jaati hai, isliye email alerts ON rakhein ya persistent disk lagayein.
Agar website kisi aur domain par ho, to `.env` me `ALLOWED_ORIGIN=https://aapki-site.com` daalein aur index.html me `FORM_ENDPOINT` ko poore backend URL par set karein.
