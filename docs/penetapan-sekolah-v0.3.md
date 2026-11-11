# UASA Nexus v0.3 — Penetapan sekolah

Untuk pemasangan UASA Nexus v0.2 yang sudah boleh log masuk melalui DELIMa. Tiada pakej npm baharu, perubahan fail .env atau migrasi Neon diperlukan pada skema semasa. Hentikan pelayan pembangunan, ekstrak arkib ke D:/CODING/exam-nexus dan jalankan npm.cmd run dev dalam folder web.

1. Log masuk sebagai setiausaha. Di Kelas & Murid, daftarkan kelas bagi sesi 2027 dan subjek yang diperlukan.
2. Di Guru & Penugasan, daftar guru dengan nama dan e-mel DELIMa. Pilih Guru Kelas, Guru Subjek atau kedua-duanya. Akaun sedia ada tidak diubah dengan borang pendaftaran ini.
3. Tetapkan guru kepada kelas, atau kepada pasangan kelas dan subjek.
4. Minta guru log masuk menggunakan akaun DELIMa yang didaftarkan dan semak kad Akses kelas dan subjek. Menarik balik tugasan membuang akses berdasarkan tugasan itu; guru mungkin masih ada akses lain melalui penugasan atau peranan lain.

Perubahan direkodkan dalam audit_events. Modul pendaftaran murid, import CSV dan kemasukan markah belum termasuk.

Ujian integrasi: node --env-file=.env --experimental-strip-types --test tests/*.test.ts. Ujian menggunakan jadual sementara di Neon dengan rekod rekaan.
