# UASA Nexus v0.4 — Pendaftaran murid

Untuk projek yang sudah memasang v0.3. Hentikan pelayan dengan Ctrl+C, ekstrak ZIP ke D:/CODING/exam-nexus dan benarkan penggantian fail yang disertakan. Jalankan npm.cmd run dev dalam folder web. Tiada migrasi Neon atau perubahan .env diperlukan pada skema semasa.

Di Kelas & Murid, pilih kelas dan masukkan nombor daftar sekolah, nama penuh dan tarikh mula dalam tahun kelas. Jangan gunakan nombor IC sebagai nombor daftar. Guru kelas hanya boleh membuka kelas jagaannya; setiausaha boleh membuka semua kelas.

Nombor daftar mesti unik. Gunakan Betulkan nama untuk rekod aktif. Gunakan Kemas kini status untuk merekod Pindah sekolah atau Dibuang sekolah dengan tarikh keluar antara tarikh mula dan hari ini (waktu Malaysia). Tindakan ini menamatkan pendaftaran kelas serta mengekalkan sejarah; tiada penghapusan rekod. Pendaftaran semula, pindah antara kelas, naik sesi dan import CSV belum tersedia.

Ujian integrasi: node --env-file=.env --experimental-strip-types --test tests/*.test.ts. Ujian menggunakan jadual sementara dengan rekod rekaan.
