# UASA Nexus — Akses staf v0.2

Kemas kini untuk projek yang sudah boleh log masuk menggunakan Google DELIMa. Tiada pakej npm tambahan atau migrasi untuk pangkalan Neon semasa. API markah menggunakan jadual exam_subjects yang sudah ada di Neon; salinan SQL awal yang lebih lama tidak mempunyai struktur ini.

1. Hentikan pelayan pembangunan (Ctrl+C).
2. Ekstrak ZIP ke D:/CODING/exam-nexus. Arkib mengandungi folder web dan docs.
3. Dalam PowerShell: cd D:/CODING/exam-nexus/web, kemudian npm.cmd run dev.
4. Log masuk seperti biasa dan semak kad Akses kelas dan subjek di Dashboard.

API staf: GET /api/staff/scope dan GET /api/staff/results?examId=UUID&classId=UUID&subjectId=UUID. Kedua-duanya perlukan token Google DELIMa Firebase yang sah dan akaun staf aktif yang telah dipautkan. Guru subjek hanya membaca pasangan kelas dan subjek yang ditugaskan. Guru kelas hanya membaca keputusan yang telah diterbitkan untuk kelas jagaan. Setiausaha boleh membaca semua penawaran peperiksaan. API markah belum dipautkan ke borang pengguna dan tiada operasi tulis.

Ujian biasa: npm.cmd test. Ujian integrasi (jadual sementara dan rekod rekaan sahaja): node --env-file=.env --experimental-strip-types --test tests/staff-data.test.ts.
