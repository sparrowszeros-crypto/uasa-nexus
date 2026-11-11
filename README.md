# UASA Nexus

Sistem pengurusan peperiksaan untuk Peralihan dan Tingkatan 1–3. Aplikasi menggunakan React, TypeScript, Netlify Functions, dan Neon PostgreSQL.

Sistem log masuk menggunakan pengesahan e-mel dan kata laluan selamat (scrypt + HMAC-SHA256 session token):
- E-mel didaftarkan oleh Setiausaha Peperiksaan (`sparrowszeros@gmail.com`).
- Dilengkapi cabaran Captcha SVG untuk setiap sesi log masuk.
- Perlindungan sekatan akaun automatik (lockout) sekiranya 3 kali cubaan kata laluan salah secara berturut-turut.
- Setiausaha peperiksaan boleh mendaftar guru dengan mana-mana e-mel sah dan membuka sekatan akaun guru sekiranya disekat.

Versi pengujian v0.4 menyokong pendaftaran guru, kelas, subjek dan murid serta tugasan dan kawalan akses staf. Kemasukan markah, slip dan akses ibu bapa masih dalam pembangunan.

Gunakan Node.js 24. Dalam folder `web`, jalankan `npm ci`, sediakan fail `.env` tempatan dan jalankan `npm run dev`. Semak aplikasi dengan `npm test`, `npm run lint` dan `npm run build`. Di PowerShell, gunakan `npm.cmd` jika skrip npm disekat.

Rujuk [panduan deploy](docs/deploy-netlify.md) dan [panduan Firebase](docs/FIREBASE-LOGIN.md). SQL awal dalam folder `database` ialah rujukan sejarah; jangan jalankan semula penciptaan jadual pada pangkalan Neon yang sudah digunakan.
