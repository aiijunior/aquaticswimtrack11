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
    *   Salin (**copy**) seluruh skrip SQL di bawah ini, lalu tempel (**paste**) ke dalam editor kueri di Supabase.
    *   Klik tombol hijau "**RUN**". Ini akan membuat semua tabel, peran, dan kebijakan keamanan yang diperlukan.

    ```sql
    -- Create custom types for enums, but only if they don't already exist.
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swim_style') THEN
            CREATE TYPE public.swim_style AS ENUM ('Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Medley', 'Papan Luncur');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
            CREATE TYPE public.gender AS ENUM ('Men''s', 'Women''s', 'Mixed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swimmer_gender') THEN
            CREATE TYPE public.swimmer_gender AS ENUM ('Male', 'Female');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_type') THEN
            CREATE TYPE public.record_type AS ENUM ('PORPROV', 'Nasional');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
            CREATE TYPE public.user_role AS ENUM ('SUPER_ADMIN', 'ADMIN');
        END IF;
    END $$;

    -- Table for Competition Information
    CREATE TABLE IF NOT EXISTS public.competition_info (
        id bigint PRIMARY KEY DEFAULT 1,
        event_name text NOT NULL,
        event_date date NOT NULL,
        event_logo text,
        sponsor_logo text,
        is_registration_open boolean NOT NULL DEFAULT false,
        number_of_lanes integer NOT NULL DEFAULT 8
    );
    ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read competition info" ON public.competition_info;
    CREATE POLICY "Public can read competition info" ON public.competition_info FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can update competition info" ON public.competition_info;
    CREATE POLICY "Admins can update competition info" ON public.competition_info FOR UPDATE USING (auth.role() = 'authenticated');

    -- Table for Swimmers
    CREATE TABLE IF NOT EXISTS public.swimmers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        birth_year integer NOT NULL,
        gender public.swimmer_gender NOT NULL,
        club text NOT NULL
    );
    ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read swimmers" ON public.swimmers;
    CREATE POLICY "Public can read swimmers" ON public.swimmers FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can manage swimmers" ON public.swimmers;
    CREATE POLICY "Admins can manage swimmers" ON public.swimmers FOR ALL USING (auth.role() = 'authenticated');

    -- Table for Swim Events
    CREATE TABLE IF NOT EXISTS public.events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        distance integer NOT NULL,
        style public.swim_style NOT NULL,
        gender public.gender NOT NULL,
        session_number integer,
        heat_order integer,
        session_date_time timestamp with time zone,
        relay_legs integer,
        category text
    );
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read events" ON public.events;
    CREATE POLICY "Public can read events" ON public.events FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
    CREATE POLICY "Admins can manage events" ON public.events FOR ALL USING (auth.role() = 'authenticated');

    -- Table for Event Entries (linking swimmers to events)
    CREATE TABLE IF NOT EXISTS public.event_entries (
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
        seed_time bigint NOT NULL,
        PRIMARY KEY (event_id, swimmer_id)
    );
    ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read event entries" ON public.event_entries;
    CREATE POLICY "Public can read event entries" ON public.event_entries FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can manage event entries" ON public.event_entries;
    CREATE POLICY "Admins can manage event entries" ON public.event_entries FOR ALL USING (auth.role() = 'authenticated');

    -- Table for Event Results
    CREATE TABLE IF NOT EXISTS public.event_results (
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
        "time" bigint NOT NULL,
        PRIMARY KEY (event_id, swimmer_id)
    );
    ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read event results" ON public.event_results;
    CREATE POLICY "Public can read event results" ON public.event_results FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can manage event results" ON public.event_results;
    CREATE POLICY "Admins can manage event results" ON public.event_results FOR ALL USING (auth.role() = 'authenticated');

    -- Table for Swim Records
    CREATE TABLE IF NOT EXISTS public.records (
        id text PRIMARY KEY,
        "type" public.record_type NOT NULL,
        gender public.gender NOT NULL,
        distance integer NOT NULL,
        style public.swim_style NOT NULL,
        "time" bigint NOT NULL,
        holder_name text NOT NULL,
        year_set integer NOT NULL,
        location_set text,
        relay_legs integer,
        category text
    );
    ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read records" ON public.records;
    CREATE POLICY "Public can read records" ON public.records FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Admins can manage records" ON public.records;
    CREATE POLICY "Admins can manage records" ON public.records FOR ALL USING (auth.role() = 'authenticated');

    -- Table for User Roles (linked to Supabase Auth)
    CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        "role" public.user_role NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can read their own role" ON public.users;
    CREATE POLICY "Users can read their own role" ON public.users FOR SELECT USING (auth.uid() = id);
    DROP POLICY IF EXISTS "Admins can see all users" ON public.users;
    CREATE POLICY "Admins can see all users" ON public.users FOR SELECT USING (auth.role() = 'authenticated');

    -- Function to automatically add a new user to the users table.
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.users (id, role)
      VALUES (new.id, 'ADMIN'); -- Default role for new sign-ups is ADMIN
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Trigger to call the function when a new user signs up.
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

    -- Initial default competition info.
    INSERT INTO public.competition_info (id, event_name, event_date, number_of_lanes)
    VALUES (1, 'My Awesome Swim Meet', CURRENT_DATE, 8)
    ON CONFLICT (id) DO NOTHING;
    ```

3.  **Dapatkan Kunci API Supabase**:
    *   Setelah skema selesai dijalankan, buka **Project Settings** (ikon roda gigi di bagian bawah menu kiri).
    *   Pilih **API** dari daftar pengaturan.
    *   Anda akan memerlukan tiga hal dari halaman ini:
        *   **Project URL**: Di bawah *Project API keys*, salin nilai dari field **URL**.
        *   **Project API Keys (anon public)**: Di bawah field URL, salin nilai dari field **anon** **public**.
        *   **Project API Keys (service_role secret)**: Di bawah field `anon public`, klik "Show" pada field `service_role secret` dan salin nilainya. **PERINGATAN: Kunci ini sangat rahasia. Jangan pernah membagikannya atau menaruhnya di kode frontend.**
    *   Simpan ketiga nilai ini di catatan sementara. Anda akan memerlukannya di Langkah 2 dan 4.

4.  **Konfigurasi Otentikasi & URL (SANGAT PENTING)**:
    *   Dari menu kiri, klik ikon pengguna untuk membuka **Authentication**.
    *   Di bawah **Configuration**, pilih **Providers**.
    *   Di dalam **Email** provider, **matikan** (toggle **OFF**) opsi **Confirm email**. Ini krusial karena aplikasi tidak memiliki alur konfirmasi email bawaan.
    *   Selanjutnya, di bawah **Configuration**, pilih **URL Configuration**.
        *   Di field **Site URL**, masukkan URL utama tempat aplikasi Anda akan di-deploy. Jika Anda menggunakan Netlify, ini akan terlihat seperti `https://nama-unik-anda.netlify.app`. **Jangan tambahkan garis miring di akhir.**
        *   Di bagian **Redirect URLs**, tambahkan URL berikut untuk memastikan login berfungsi baik saat pengembangan lokal maupun setelah di-deploy:
            ```
            http://localhost:8888
            ```
        *   **PENTING**: Jika Anda sudah memiliki URL Netlify, tambahkan juga di sini, misalnya: `https://nama-unik-anda.netlify.app`.
        *   Klik **Save**. Langkah ini sangat penting untuk mengizinkan aplikasi Anda berkomunikasi dengan Supabase tanpa error CORS atau masalah koneksi.

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

Untuk menjalankan aplikasi ini secara lokal, termasuk *serverless functions* untuk AI dan pendaftaran, Anda perlu menggunakan Netlify CLI. Ini akan mensimulasikan lingkungan Netlify di komputer Anda.

1.  Pastikan Anda telah menginstal [Node.js](https://nodejs.org/).
2.  Pastikan Anda telah mengisi file `config.ts` sesuai petunjuk di atas.
3.  Buka terminal di direktori utama proyek.
4.  **Instal Dependensi**: Jalankan perintah berikut untuk menginstal semua yang dibutuhkan, termasuk Netlify CLI:
    ```bash
    npm install
    ```
5.  **Siapkan Variabel Lingkungan Lokal**:
    *   Buat file baru di root proyek dengan nama `.env`.
    *   Salin (**copy**) dan tempel (**paste**) konten berikut ke dalam file `.env` tersebut, lalu isi dengan kunci rahasia Anda. File ini sudah ada di `.gitignore` sehingga tidak akan terunggah ke GitHub.
    ```
# Kunci untuk fitur AI (Google Gemini)
API_KEY=MASUKKAN_KUNCI_GEMINI_API_ANDA_DI_SINI

# Kunci untuk Pendaftaran Online & fungsi server lainnya (Supabase)
SUPABASE_URL=MASUKKAN_URL_SUPABASE_ANDA_DI_SINI
SUPABASE_SERVICE_KEY=MASUKKAN_KUNCI_SERVICE_ROLE_SUPABASE_ANDA_DI_SINI
    ```
6.  **Jalankan Server Pengembangan**:
    *   Jalankan perintah berikut:
    ```bash
    npm run dev
    ```
    *   Netlify CLI akan memulai server pengembangan, biasanya di `http://localhost:8888`.
7.  Buka browser Anda dan navigasikan ke alamat yang ditampilkan di terminal. Aplikasi sekarang akan berjalan penuh, termasuk semua fitur backend.

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