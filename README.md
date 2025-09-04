# Aquatic Swimtrack 11

Aquatic Swimtrack 11 adalah aplikasi modern, *offline-first*, dan *real-time* yang dirancang untuk mengelola kompetisi renang secara komprehensif. Mulai dari pendaftaran atlet, penjadwalan nomor lomba, hingga pencatatan waktu langsung (*live timing*), publikasi hasil, dan pembuatan komentar berbasis AI, aplikasi ini menyediakan semua yang dibutuhkan oleh panitia penyelenggara.

## Fitur Unggulan

- **Pengaturan Kompetisi**: Konfigurasi detail acara, tanggal, logo, dan aturan kompetisi.
- **Manajemen Peserta**: Tambah perenang secara manual, atau unggah peserta dan nomor lomba yang diikuti secara massal melalui file Excel.
- **Manajemen Nomor & Jadwal Lomba**: Buat nomor lomba perorangan dan estafet, lalu atur ke dalam sesi dengan penjadwal *drag-and-drop*.
- **Live Timing**: Antarmuka intuitif untuk menjalankan seri (*heat*), lengkap dengan stopwatch manual, pencatat waktu, dan manajemen diskualifikasi (DQ).
- **Hasil Real-time**: Hasil diperbarui secara *real-time* dan dapat dilihat di halaman publik.
- **Klasemen Medali**: Perhitungan dan tampilan otomatis klasemen medali untuk klub dan perorangan.
- **Komentar Lomba AI**: Hasilkan komentar seru layaknya siaran langsung untuk lomba yang telah selesai menggunakan Google Gemini API secara aman melalui serverless function.
- **Manajemen Data**:
    - Impor/Ekspor nomor lomba dan rekor melalui Excel.
    - Fungsi backup dan restore seluruh database menggunakan file JSON.
- **Laporan Cetak**: Buat dan cetak laporan profesional, termasuk Buku Acara (*Start List*), Hasil Lomba, Klasemen Medali, dan lainnya.
- **Pendaftaran Online**: Formulir publik yang memungkinkan atlet mendaftar secara online (tergantung persetujuan admin).
- **Otentikasi Aman**: Kontrol akses berbasis peran (Admin, Super Admin) yang didukung oleh Supabase Auth.
- **UI/UX Modern**: Antarmuka yang bersih dan responsif dengan mode Terang (*Light*) dan Gelap (*Dark*).

## Teknologi yang Digunakan

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend-as-a-Service (BaaS)**: [Supabase](https://supabase.com/)
    - **Database**: Supabase Postgres
    - **Authentication**: Supabase Auth
    - **Realtime**: Supabase Realtime Subscriptions
- **Serverless Functions**: [Netlify Functions](https://www.netlify.com/products/functions/)
- **AI**: [Google Gemini API](https://ai.google.dev/)
- **Client-side Excel**: [SheetJS (xlsx)](https://sheetjs.com/)

---

## Prasyarat

Sebelum memulai, pastikan Anda telah mendaftar untuk layanan-layanan gratis berikut. Panduan di bawah ini akan memandu Anda melalui proses penggunaan masing-masing layanan.

1.  **[Supabase](https://supabase.com/)**: Untuk database, otentikasi, dan backend.
2.  **[GitHub](https://github.com/)**: Untuk menyimpan kode Anda secara online.
3.  **[Netlify](https://www.netlify.com/)**: Untuk mempublikasikan (hosting) aplikasi Anda agar dapat diakses publik.
4.  **[Google AI Studio](https://aistudio.google.com/)**: Untuk mendapatkan kunci API yang diperlukan untuk fitur AI.

---

## Langkah-langkah Instalasi & Deployment Lengkap

Ikuti panduan ini dari awal hingga akhir untuk menjalankan aplikasi Anda sendiri, dari pengaturan backend hingga publikasi online.

### Langkah 1: Pengaturan Supabase (Backend Anda)

Supabase akan berfungsi sebagai database, layanan otentikasi, dan backend *real-time* Anda.

1.  **Buat Akun & Proyek**:
    *   Buka [supabase.com](https://supabase.com/) dan daftar untuk akun gratis.
    *   Setelah masuk, klik "**New project**".
    *   Pilih organisasi Anda (atau buat yang baru).
    *   Beri nama proyek Anda (misalnya, `swimtrack-app`), buat kata sandi database yang kuat (simpan di tempat aman!), pilih wilayah terdekat, dan klik "**Create new project**".

2.  **Jalankan Skema SQL**:
    *   Tunggu hingga proyek Anda selesai dibuat.
    *   Dari menu di sebelah kiri, klik ikon database untuk membuka **SQL Editor**.
    *   Klik "**+ New query**".
    *   Salin (**copy**) seluruh konten dari file `schema.sql` yang ada di proyek ini, lalu tempel (**paste**) ke dalam editor kueri di Supabase.
    *   Klik tombol hijau "**RUN**". Ini akan membuat semua tabel, peran, dan kebijakan keamanan yang diperlukan.

3.  **Dapatkan Kunci API Supabase**:
    *   Setelah skema selesai dijalankan, buka **Project Settings** (ikon roda gigi di bagian bawah menu kiri).
    *   Pilih **API** dari daftar pengaturan.
    *   Anda akan memerlukan tiga hal dari halaman ini:
        *   **Project URL**: Di bawah *Project API keys*, salin nilai dari field **URL**.
        *   **Project API Keys (anon public)**: Di bawah field URL, salin nilai dari field **anon** **public**.
        *   **Project API Keys (service_role secret)**: Di bawah field `anon public`, klik "Show" pada field `service_role secret` dan salin nilainya. **PERINGATAN: Kunci ini sangat rahasia. Jangan pernah membagikannya atau menaruhnya di kode frontend.**
    *   Simpan ketiga nilai ini di catatan sementara. Anda akan memerlukannya di Langkah 2 dan 4.

4.  **Konfigurasi Otentikasi**:
    *   Dari menu kiri, klik ikon pengguna untuk membuka **Authentication**.
    *   Di bawah **Configuration**, pilih **Providers**.
    *   Pastikan provider **Email** sudah aktif (di-toggle **ON**).
    *   Klik provider Email untuk membuka pengaturannya. **Matikan** (toggle **OFF**) opsi **Confirm email**. Ini penting karena aplikasi tidak memiliki alur konfirmasi email bawaan.

### Langkah 2: Pengaturan Kode Aplikasi (Lokal)

Sekarang Anda akan mengkonfigurasi kode aplikasi untuk terhubung ke backend Supabase Anda.

1.  **Dapatkan Kode**: Unduh atau kloning repositori ini ke komputer Anda.

2.  **Buat File Konfigurasi**:
    *   Di dalam folder proyek yang baru Anda unduh, temukan file bernama `config.ts.txt`.
    *   Ubah nama file ini menjadi `config.ts`.

3.  **Isi Kredensial**:
    *   Buka file `config.ts` yang baru.
    *   **Supabase**:
        *   Ganti `YOUR_SUPABASE_URL_HERE` dengan **Project URL** yang Anda salin dari Supabase.
        *   Ganti `YOUR_SUPABASE_ANON_KEY_HERE` dengan kunci **anon public** yang Anda salin dari Supabase.
    *   **Super Admin**:
        *   Ganti `email` dan `password` di dalam objek `superAdmin` dengan kredensial yang Anda inginkan untuk akun admin utama. Akun ini memiliki hak akses tertinggi dan tidak disimpan di database.
    *   **Google Gemini API Key & Supabase Service Key**: Kunci-kunci ini tidak lagi diatur di sini. Mereka akan diatur di Netlify pada langkah selanjutnya untuk keamanan.
    *   Simpan file `config.ts`.

### Langkah 3: Unggah Kode ke GitHub (Penyimpanan Kode)

GitHub adalah tempat Anda akan menyimpan kode aplikasi Anda secara online, yang memungkinkan Netlify untuk mengakses dan mempublikasikannya.

1.  **Buat Akun & Repositori GitHub**:
    *   Buka [github.com](https://github.com/) dan daftar untuk akun gratis.
    *   Setelah masuk, klik tombol **+** di pojok kanan atas, lalu pilih "**New repository**".
    *   Beri nama repositori Anda (misalnya, `aquatic-swimtrack-app`).
    *   Pilih **Public** (Publik).
    *   Klik "**Create repository**".

2.  **Siapkan Git & Unggah Kode**:
    *   Pastikan Anda telah menginstal [Git](https://git-scm.com/downloads) di komputer Anda.
    *   Buka terminal atau command prompt di dalam folder proyek Anda (folder yang sama dengan `index.html`).
    *   Jalankan perintah berikut satu per satu. Ganti `<URL_REPOSITORI_ANDA>` dengan URL yang Anda dapatkan dari GitHub setelah membuat repositori (misalnya, `https://github.com/username/aquatic-swimtrack-app.git`).

    ```bash
    # Inisialisasi Git di folder Anda
    git init

    # Tambahkan semua file untuk dilacak (kecuali yang ada di .gitignore)
    git add .

    # Buat "snapshot" pertama dari kode Anda
    git commit -m "Initial commit"

    # Ganti nama branch utama menjadi "main"
    git branch -M main

    # Hubungkan folder lokal Anda ke repositori online di GitHub
    git remote add origin <URL_REPOSITORI_ANDA>

    # Unggah (push) kode Anda ke GitHub
    git push -u origin main
    ```
    *   Refresh halaman repositori GitHub Anda. Anda sekarang akan melihat semua file proyek Anda di sana. File `config.ts` tidak akan diunggah karena sudah tercantum di `.gitignore`, yang menjaga keamanan kredensial Anda.

### Langkah 4: Publikasi ke Netlify (Hosting)

Netlify akan mengambil kode dari GitHub Anda dan mempublikasikannya ke web.

1.  **Buat Akun & Hubungkan ke GitHub**:
    *   Buka [netlify.com](https://www.netlify.com/) dan daftar untuk akun gratis. Cara termudah adalah mendaftar menggunakan akun GitHub Anda.
    *   Izinkan Netlify untuk mengakses repositori GitHub Anda.

2.  **Buat Situs Baru**:
    *   Dari dasbor Netlify, klik "**Add new site**" > "**Import an existing project**".
    *   Pilih **GitHub** sebagai provider Git Anda.
    *   Temukan dan pilih repositori yang baru saja Anda buat (`aquatic-swimtrack-app`).

3.  **Konfigurasi Pengaturan Build**:
    *   Netlify akan otomatis mendeteksi file `package.json` dan `netlify.toml` Anda. Pengaturan default sudah benar:
        *   **Build command**: Netlify akan menjalankan `npm install` secara otomatis.
        *   **Publish directory**: `.` (sesuai `netlify.toml`).
    *   Klik "**Deploy site**". Netlify akan mulai mem-build dan mempublikasikan situs Anda, termasuk serverless function.

4.  **Atur Kunci API & Variabel Lingkungan (Langkah Paling Penting)**:
    *   Setelah Netlify selesai melakukan deploy awal, buka **Site configuration** untuk situs baru Anda.
    *   Di menu kiri, pilih **Build & deploy** > **Environment** > **Environment variables**.
    *   Klik "**Add a variable**" dan tambahkan **tiga** variabel berikut, satu per satu:
        *   **Untuk Google Gemini (Komentar AI):**
            *   **Key**: `API_KEY`
            *   **Value**: Tempelkan kunci **Google Gemini API** Anda di sini.
        *   **Untuk Pendaftaran Online & Koneksi Server:**
            *   **Key**: `SUPABASE_URL`
            *   **Value**: Tempelkan **Project URL** Supabase Anda di sini (dari Langkah 1).
            *   **Key**: `SUPABASE_SERVICE_KEY`
            *   **Value**: Tempelkan kunci **service_role secret** Supabase Anda di sini (dari Langkah 1).
    *   Variabel-variabel ini akan disuntikkan secara aman ke serverless function Anda oleh Netlify.

5.  **Redeploy dengan Kunci API**:
    *   Pergi ke tab **Deploys** untuk situs Anda.
    *   Di bagian atas, klik tombol "**Trigger deploy**" dan pilih "**Deploy site**". Ini akan mempublikasikan ulang situs Anda, kali ini dengan serverless function yang sudah memiliki akses ke kunci API.

6.  **Selesai!**
    *   Setelah deploy selesai, Netlify akan memberikan URL publik untuk situs Anda (misalnya, `nama-unik.netlify.app`). Klik URL tersebut untuk melihat aplikasi Anda yang sudah aktif!

---

## Menjalankan Secara Lokal

Proyek ini dibuat dengan modul ES modern dan tidak memerlukan proses *build* yang rumit seperti Webpack atau Vite untuk pengembangan lokal.

1.  Pastikan Anda telah menginstal [Node.js](https://nodejs.org/) (untuk menggunakan `npx`).
2.  Pastikan Anda telah mengisi file `config.ts` sesuai petunjuk di atas.
3.  Buka terminal di direktori utama proyek.
4.  Jalankan `npm install` untuk menginstal dependensi yang diperlukan.
5.  Gunakan server statis sederhana seperti `serve`. Jika belum terinstal, jalankan: `npm install -g serve`.
6.  Jalankan server: `serve -s .` (Flag `-s` penting untuk menangani rute di sisi klien).
7.  Buka browser Anda dan navigasikan ke alamat lokal yang disediakan oleh server (misalnya, `http://localhost:3000`).

---
## Panduan Penggunaan Aplikasi

1.  **Login**: Akses dasbor admin menggunakan kredensial yang telah Anda buat di Supabase atau kredensial Super Admin dari `config.ts`.
2.  **Pengaturan Acara**:
    *   Buka "Pengaturan Acara".
    *   Atur nama kompetisi, tanggal, dan logo.
    *   Gunakan tab "Pengaturan Jadwal" untuk membuat sesi dan seret-lepas (*drag-and-drop*) nomor lomba ke dalamnya.
3.  **Tambah Peserta**:
    *   Buka "Unggah Peserta".
    *   Unduh templat Excel.
    *   Isi dengan informasi perenang dan nomor lomba yang mereka ikuti.
    *   Unggah file tersebut untuk mendaftarkan semua peserta sekaligus.
    *   Atau, tambahkan perenang satu per satu di "Daftar Perenang".
4.  **Jalankan Lomba**:
    *   Buka "Nomor Lomba".
    *   Klik "Timing" pada nomor lomba yang sudah memiliki peserta terdaftar.
    *   Gunakan antarmuka *live timing* untuk memulai lomba dan ketuk untuk mencatat waktu finis.
5.  **Lihat Hasil**:
    *   Halaman "Hasil Lomba" dan halaman hasil publik akan diperbarui secara otomatis saat hasil disimpan.
6.  **Cetak Laporan**:
    *   Buka "Unduh Laporan".
    *   Pilih laporan yang ingin Anda lihat/cetak (misalnya, Buku Acara).
    *   Gunakan fungsi cetak browser untuk menghasilkan PDF atau mencetak salinan fisik.