# Kemas kini log masuk guru

Kod ini menambah log masuk Google DELIMa dan pengesahan pelayan terhadap Firebase serta peranan aktif dalam Neon. Modul ibu bapa, murid, markah dan analisis belum dilaksanakan.

## Pasang

1. Salin folder web dan database daripada pakej ini ke akar repositori. Kekalkan .env sedia ada.
2. Dalam folder web, jalankan npm.cmd run auth:check.
3. Jalankan npm.cmd run auth:migrate untuk menyediakan account_identities tanpa mengubah rekod akaun sedia ada.
4. Jalankan npm.cmd run lint, npm.cmd test dan npm.cmd run build.
5. Jalankan npm.cmd run dev. Log masuk menggunakan akaun DELIMa setiausaha yang sudah didaftarkan.

## Konfigurasi

.env memerlukan DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_BASE64 serta empat pembolehubah VITE_FIREBASE_ sedia ada. Hanya VITE_FIREBASE_ mengandungi konfigurasi web yang dihantar kepada pelayar. Jangan tambah awalan VITE_ pada sambungan pangkalan data atau service account.

Kod menggunakan verifyIdToken(token, true), termasuk semakan token dibatalkan atau akaun Firebase dilumpuhkan. Akaun aktif dan peranan sekolah disemak pada setiap panggilan endpoint log masuk. Projek dan UID Firebase dipautkan kepada akaun sekolah; akaun yang telah dipautkan tidak boleh ditindih oleh UID lain melalui log masuk.

Endpoint POST /api/auth/login menerima Authorization: Bearer <Firebase ID token>. Endpoint ini tidak menerima peranan daripada pelayar. Setiap endpoint data baharu WAJIB mengesahkan identiti serta penugasan sumber di pelayan. Menu di pelayar bukan sempadan keselamatan.

Akaun yang telah dinyahaktifkan atau belum didaftarkan tidak mendapat profil aplikasi. Pengguna Firebase mungkin wujud walaupun akses aplikasi ditolak; ini tidak memberikan akses Neon.

Sesi Firebase pada pelayar menggunakan session persistence. Tiada sesi tambahan dicipta dalam jadual sessions untuk langkah ini. Ruang ibu bapa belum dibuka kerana proses pengaktifan dan pautan anak belum dilaksanakan.

## Semakan manual

- Akaun setiausaha yang didaftarkan boleh masuk dan melihat peranan sebenar.
- Google lain yang tidak didaftarkan mesti ditolak.
- Tanpa bearer token, POST /api/auth/login mesti memulangkan 401.
- Token palsu atau tamat tempoh tidak mendapat akses.
- GET endpoint log masuk mesti memulangkan 405.
- Log keluar menutup dashboard; muat semula masih memerlukan sesi sah.
- Tiada kata laluan, token atau service account dipaparkan dalam respons atau log.
