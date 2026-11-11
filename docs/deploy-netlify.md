# Deploy UASA Nexus

1. Pautkan projek Netlify kepada repo GitHub, cabang `main`. Fail `netlify.toml` menetapkan folder asas `web`, arahan `npm run build`, folder terbitan `dist` dan folder Functions `netlify/functions`.
2. Salin nilai konfigurasi daripada persekitaran tempatan ke Netlify Production:
   - Binaan: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
   - Functions: `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_BASE64`.
   Jangan masukkan nilai rahsia atau fail .env ke GitHub. Gunakan konfigurasi Firebase Admin dan Web daripada projek Firebase yang sama.
3. Dalam Firebase Authentication → Settings → Authorized domains, tambah `uasa-nexus.netlify.app`. Kekalkan penyedia Google.
4. Selepas deploy, semak laman utama, `/api/health` (HTTP 200 jika Neon dapat dihubungi) dan `/api/staff/class-roster` (HTTP 401 tanpa log masuk).
5. Uji setiausaha dahulu, kemudian satu akaun DELIMa sebenar bagi setiap jenis guru. Gunakan rekod murid rekaan untuk ujian.

Jika Google memaparkan “Couldn't find this account”, semak alamat dengan pentadbir DELIMa. Pendaftaran dalam UASA Nexus memberikan akses aplikasi dan tidak mencipta akaun Google. Untuk mengganti alamat contoh, daftarkan alamat DELIMa yang sebenar dan tarik balik tugasan rekod contoh.
