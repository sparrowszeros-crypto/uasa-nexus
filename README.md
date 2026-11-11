# UASA Nexus

Sistem pengurusan peperiksaan untuk Peralihan dan Tingkatan 1–3. Aplikasi menggunakan React, TypeScript, Netlify Functions, Neon PostgreSQL, dan pengesahan penuh 100% Firebase Authentication (Google Sign-In).

Sistem log masuk menggunakan Firebase Authentication:
- Guru dan pentadbir log masuk terus menggunakan akaun Google yang didaftarkan oleh Setiausaha Peperiksaan (`sparrowszeros@gmail.com`).
- Tiada kata laluan manual atau captcha diperlukan kerana pengesahan diuruskan secara selamat oleh Google / Firebase Authentication API.

Versi pengujian v0.4 menyokong pendaftaran guru, kelas, subjek dan murid serta tugasan dan kawalan akses staf. Kemasukan markah, slip dan akses ibu bapa masih dalam pembangunan.

Gunakan Node.js 24. Dalam folder `web`, jalankan `npm ci`, sediakan fail `.env` tempatan dan jalankan `npm run dev`. Semak aplikasi dengan `npm test`, `npm run lint` dan `npm run build`. Di PowerShell, gunakan `npm.cmd` jika skrip npm disekat.

Rujuk [panduan deploy](docs/deploy-netlify.md) dan [panduan Firebase](docs/FIREBASE-LOGIN.md). SQL awal dalam folder `database` ialah rujukan sejarah; jangan jalankan semula penciptaan jadual pada pangkalan Neon yang sudah digunakan.
