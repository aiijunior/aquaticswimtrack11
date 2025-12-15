# R.E.A.C.T (Real-time Evaluation for Aquatic Competition & Timing)

R.E.A.C.T adalah platform modern, real-time, dan komprehensif untuk manajemen kompetisi renang. Dirancang untuk skalabilitas, aplikasi ini tidak hanya mengelola satu event secara efisien tetapi juga siap dikembangkan menjadi database karir atlet terpusat. Mulai dari pendaftaran online, penjadwalan nomor lomba, pencatatan waktu langsung (live timing), hingga publikasi hasil, R.E.A.C.T menyediakan semua yang dibutuhkan oleh panitia penyelenggara.

## Fitur Unggulan

- **Pengaturan Kompetisi**: Konfigurasi detail acara, tanggal, logo, dan aturan kompetisi.
- **Manajemen Peserta**: Tambah atlet secara manual, atau unggah peserta dan nomor lomba yang diikuti secara massal melalui file Excel.
- **Manajemen Nomor & Jadwal Lomba**: Buat nomor lomba perorangan dan estafet, lalu atur ke dalam sesi dengan penjadwal *drag-and-drop*.
- **Live Timing**: Antarmuka intuitif untuk menjalankan seri (*heat*), lengkap dengan stopwatch manual, pencatat waktu, dan manajemen diskualifikasi (DQ).
- **Hasil Real-time**: Hasil diperbarui secara *real-time* dan dapat dilihat di halaman publik.
- **Klasemen Medali**: Perhitungan dan tampilan otomatis klasemen medali untuk tim dan perorangan.
- **Manajemen Data**:
    - Impor/Ekspor nomor lomba dan rekor melalui Excel.
    - Fungsi backup dan restore seluruh database menggunakan file JSON.
- **Pendaftaran Online**: Formulir publik yang memungkinkan atlet mendaftar secara online (tergantung persetujuan admin).
- **Otentikasi Aman**: Kontrol akses berbasis peran (Admin, Super Admin) yang didukung oleh Supabase Auth.
- **UI/UX Modern**: Antarmuka yang bersih dan responsif dengan mode Terang (*Light*) dan Gelap (*Dark*).

---
## Pembaruan Aplikasi (Changelog)

Catatan ini melacak semua perubahan signifikan yang diterapkan pada aplikasi R.E.A.C.T.

---
### **Versi 1.1.7 (Pembaruan Terkini): Kategori Fleksibel & Logika Seeding Cerdas**
*Tanggal Rilis: Sesuai pembaruan terakhir*

Pembaruan ini memberikan fleksibilitas penuh kepada penyelenggara dalam penamaan kategori umur dan menyempurnakan integritas penyusunan seri lomba.

- **Fitur Baru: Kategori Umur (KU) Fleksibel**
  - **Penamaan Bebas**: Admin kini dapat menentukan sendiri daftar Kelompok Umur (misal: "TK", "SD A", "Elite", "Master", "KU 1") melalui menu Pengaturan Acara. Aplikasi tidak lagi membatasi pada format baku.
  - **Integrasi Penuh**: Daftar KU kustom ini otomatis muncul di *dropdown* menu tambah atlet dan formulir pendaftaran online.
  - **Perhatian Admin**: Untuk pengguna lama, fitur ini memerlukan penambahan kolom baru di database. Silakan buka menu **SQL Editor** di aplikasi untuk mendapatkan perintah pembaruan otomatis.

- **Peningkatan Logika Seeding (Penyusunan Seri)**
  - **Isolasi Atlet NT**: Algoritma `generateHeats` telah diperbarui. Atlet tambahan yang tidak memiliki catatan waktu (NT) kini dikelompokkan dan ditempatkan di seri-seri awal (*early heats*).
  - **Stabilitas Posisi**: Penambahan atlet NT tidak akan lagi menggeser atau mengubah komposisi seri atlet unggulan (yang memiliki catatan waktu), menjaga integritas kompetisi.

---
### **Versi 1.1.6: Dasbor Interaktif & Akurasi Data Statistik**

Pembaruan ini secara signifikan meningkatkan fungsionalitas dasbor admin dan akurasi data statistik di seluruh aplikasi.

- **Fitur Baru: Dasbor Interaktif**
  - Semua kartu statistik di dasbor admin (Total Atlet, Total Tim, Tim Estafet, dll.) kini dapat diklik untuk navigasi cepat.

- **Peningkatan Statistik**:
  - **Rekap Tim Estafet**: Menampilkan statistik unik untuk tim estafet.
  - **Akurasi Jumlah Atlet**: Perhitungan kini hanya menghitung atlet perorangan asli, mengabaikan placeholder tim estafet.

---
### **Versi 1.1.5: Fitur SQL Editor & Perbaikan Tipe Data**

Pembaruan ini memperkenalkan fitur baru untuk administrator tingkat lanjut dan memperbaiki masalah terkait penyimpanan data.

- **Fitur Baru: SQL Editor (Khusus Super Admin)**
  - Menambahkan menu "SQL Editor" untuk memfasilitasi pembaruan struktur database yang aman melalui dasbor Supabase.

- **Perbaikan: Tipe Data 'Papan Luncur'**
  - Memperbaiki dukungan database untuk gaya renang "Papan Luncur".

---
## Tindakan yang Diperlukan

- **Untuk Pengguna Baru**: Jalankan skrip SQL lengkap di bawah ini pada langkah instalasi. Skrip sudah mencakup semua fitur terbaru (termasuk kolom `age_groups`).
- **Untuk Pengguna Lama**: 
    1. Masuk sebagai Super Admin.
    2. Buka menu **SQL Editor**.
    3. Salin perintah pada kartu **"Pembaruan Skema Database: Kategori Fleksibel"**.
    4. Jalankan perintah tersebut di SQL Editor Supabase Anda.

---

## Prasyarat

Sebelum memulai, pastikan Anda telah mendaftar untuk layanan-layanan gratis berikut. Panduan di bawah ini akan memandu Anda melalui proses penggunaan masing-masing layanan.

1.  **[Supabase](https://supabase.com/)**: Untuk database, otentikasi, dan backend.
2.  **[GitHub](https://github.com/)**: Untuk menyimpan kode Anda secara online.
3.  **[Netlify](https://www.netlify.com/)**: Untuk mempublikasikan (hosting) aplikasi Anda agar dapat diakses publik.

---

## Langkah-langkah Instalasi & Deployment Lengkap

Ikuti panduan ini dari awal hingga akhir untuk menjalankan aplikasi Anda sendiri, dari pengaturan backend hingga publikasi online.

### Langkah 1: Pengaturan Supabase (Backend Anda)

Supabase akan berfungsi sebagai database, layanan otentikasi, dan backend *real-time* Anda.

1.  **Buat Akun & Proyek**:
    *   Buka [supabase.com](https://supabase.com/) dan daftar untuk akun gratis.
    *   Setelah masuk, klik "**New project**".
    *   Pilih organisasi Anda (atau buat yang baru).
    *   Beri nama proyek Anda (misalnya, `react-swim-app`), buat kata sandi database yang kuat (simpan di tempat aman!), pilih wilayah terdekat, dan klik "**Create new project**".

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

    -- If the 'swim_style' type already exists, add the new value.
    -- This command will fail gracefully if the type or value already exists.
    ALTER TYPE public.swim_style ADD VALUE IF NOT EXISTS 'Papan Luncur';

    -- Table for Competition Information
    CREATE TABLE IF NOT EXISTS public.competition_info (
        id bigint PRIMARY KEY DEFAULT 1,
        event_name text NOT NULL,
        event_date date NOT NULL,
        event_logo text,
        sponsor_logo text,
        is_registration_open boolean NOT NULL DEFAULT false,
        number_of_lanes integer NOT NULL DEFAULT 8,
        registration_deadline timestamp with time zone,
        age_groups text
    );
    -- RLS Policies for competition_info
    ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read competition info" ON public.competition_info;
    CREATE POLICY "Public can read competition info" ON public.competition_info FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage competition info" ON public.competition_info;
    DROP POLICY IF EXISTS "Admins can insert competition info" ON public.competition_info;
    DROP POLICY IF EXISTS "Admins can update and delete competition info" ON public.competition_info;
    DROP POLICY IF EXISTS "Admins can write to competition info" ON public.competition_info;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to competition info" ON public.competition_info
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

    -- Table for Swimmers
    CREATE TABLE IF NOT EXISTS public.swimmers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        birth_year integer NOT NULL,
        gender public.swimmer_gender NOT NULL,
        club text NOT NULL,
        age_group text
    );
    -- RLS Policies for swimmers
    ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read swimmers" ON public.swimmers;
    CREATE POLICY "Public can read swimmers" ON public.swimmers FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage swimmers" ON public.swimmers;
    DROP POLICY IF EXISTS "Admins can insert swimmers" ON public.swimmers;
    DROP POLICY IF EXISTS "Admins can update and delete swimmers" ON public.swimmers;
    DROP POLICY IF EXISTS "Admins can write to swimmers" ON public.swimmers;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to swimmers" ON public.swimmers
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

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
    -- RLS Policies for events
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read events" ON public.events;
    CREATE POLICY "Public can read events" ON public.events FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
    DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
    DROP POLICY IF EXISTS "Admins can update and delete events" ON public.events;
    DROP POLICY IF EXISTS "Admins can write to events" ON public.events;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to events" ON public.events
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

    -- Table for Event Entries (linking swimmers to events)
    CREATE TABLE IF NOT EXISTS public.event_entries (
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
        seed_time bigint NOT NULL,
        PRIMARY KEY (event_id, swimmer_id)
    );
    -- RLS Policies for event_entries
    ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read event entries" ON public.event_entries;
    CREATE POLICY "Public can read event entries" ON public.event_entries FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage event entries" ON public.event_entries;
    DROP POLICY IF EXISTS "Admins can insert event entries" ON public.event_entries;
    DROP POLICY IF EXISTS "Admins can update and delete event entries" ON public.event_entries;
    DROP POLICY IF EXISTS "Admins can write to event entries" ON public.event_entries;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to event entries" ON public.event_entries
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

    -- Table for Event Results
    CREATE TABLE IF NOT EXISTS public.event_results (
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
        "time" bigint NOT NULL,
        PRIMARY KEY (event_id, swimmer_id)
    );
    -- RLS Policies for event_results
    ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read event results" ON public.event_results;
    CREATE POLICY "Public can read event results" ON public.event_results FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage event results" ON public.event_results;
    DROP POLICY IF EXISTS "Admins can insert event results" ON public.event_results;
    DROP POLICY IF EXISTS "Admins can update and delete event results" ON public.event_results;
    DROP POLICY IF EXISTS "Admins can write to event results" ON public.event_results;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to event results" ON public.event_results
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

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
    -- RLS Policies for records
    ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public can read records" ON public.records;
    CREATE POLICY "Public can read records" ON public.records FOR SELECT USING (true);
    -- Cleanup old/conflicting policies
    DROP POLICY IF EXISTS "Admins can manage records" ON public.records;
    DROP POLICY IF EXISTS "Admins can insert records" ON public.records;
    DROP POLICY IF EXISTS "Admins can update and delete records" ON public.records;
    DROP POLICY IF EXISTS "Admins can write to records" ON public.records;
    -- Consolidated write policy for authenticated users
    CREATE POLICY "Admins can write to records" ON public.records
        FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

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
    *   Di sini, Anda perlu mengatur **Site URL**. Untuk tahap pengembangan, isinya adalah `http://localhost:8888`.
    *   Klik "**Save**".
    *   (Anda akan kembali ke sini nanti di Langkah 4 untuk memperbarui URL ini dengan URL Netlify Anda).

### Langkah 2: Konfigurasi Kode Aplikasi

Sekarang Anda akan menghubungkan aplikasi R.E.A.C.T dengan backend Supabase Anda.

1.  **Buka File `config.ts`**:
    *   Di editor kode Anda, temukan file `config.ts.txt`.
    *   **Ubah nama** file ini menjadi `config.ts`.

2.  **Masukkan Kredensial Supabase**:
    *   Buka file `config.ts` yang baru saja Anda ubah namanya.
    *   Tempel **URL Proyek** Supabase Anda ke dalam nilai `url`.
    *   Tempel kunci **anon public** Supabase Anda ke dalam nilai `anonKey`.

3.  **Atur Kredensial Super Admin**:
    *   Di file `config.ts` yang sama, ubah `email` dan `password` di bawah bagian `superAdmin`. Akun ini memiliki akses penuh ke aplikasi dan tidak memerlukan akun Supabase. **Gunakan kata sandi yang kuat dan unik!**

### Langkah 3: Menjalankan Aplikasi Secara Lokal (Development)

Sekarang aplikasi Anda siap untuk dijalankan di komputer Anda.

1.  **Buka Terminal**:
    *   Buka terminal atau command prompt di direktori utama proyek Anda (folder di mana `package.json` berada).

2.  **Instal Dependensi**:
    *   Jika ini pertama kalinya Anda menjalankan proyek, jalankan perintah ini untuk menginstal semua pustaka yang diperlukan:
        ```bash
        npm install
        ```

3.  **Jalankan Server Development**:
    *   Setelah instalasi selesai, jalankan perintah ini untuk memulai server development Netlify:
        ```bash
        npm run dev
        ```
    *   Terminal akan menampilkan output yang mengatakan server berjalan. Biasanya, aplikasi Anda akan dapat diakses di `http://localhost:8888`.
    *   Buka URL tersebut di browser Anda. Anda seharusnya melihat halaman login R.E.A.C.T!

### Langkah 4: Deployment ke Netlify (Publikasi Online)

Langkah terakhir adalah mempublikasikan aplikasi Anda agar dapat diakses dari mana saja di internet.

1.  **Dorong Kode ke GitHub**:
    *   Buat repositori baru di akun GitHub Anda (misalnya, `react-swim-app`).
    *   Ikuti petunjuk di GitHub untuk menghubungkan folder proyek lokal Anda ke repositori baru dan mendorong (push) kode Anda.

2.  **Buat Akun & Situs Netlify**:
    *   Buka [netlify.com](https://app.netlify.com/) dan daftar.
    *   Klik "**Add new site**" -> "**Import an existing project**".
    *   Pilih **GitHub** sebagai provider Git Anda dan otorisasi Netlify.
    *   Pilih repositori GitHub yang baru saja Anda buat.

3.  **Konfigurasi Pengaturan Build**:
    *   Netlify biasanya akan mendeteksi pengaturan build Anda secara otomatis. Pastikan pengaturannya adalah:
        *   **Build command**: `npm run build` atau `esbuild index.tsx --bundle --outfile=dist/main.js --jsx=automatic && cp index.html dist/index.html && cp metadata.json dist/metadata.json`
        *   **Publish directory**: `dist`
    *   Klik "**Show advanced**", lalu "**New variable**". Di sinilah Anda akan menyimpan kunci rahasia Supabase Anda.
    *   Tambahkan dua **Environment variables** (variabel lingkungan):
        *   **Key**: `SUPABASE_URL`, **Value**: Tempel **URL Proyek** Supabase Anda.
        *   **Key**: `SUPABASE_SERVICE_KEY`, **Value**: Tempel kunci **service_role secret** Supabase Anda yang telah Anda salin sebelumnya.
    *   Klik "**Deploy site**". Netlify akan mulai membangun dan mempublikasikan aplikasi Anda.

4.  **Perbarui URL Supabase (Langkah Terakhir!)**:
    *   Setelah Netlify selesai melakukan deployment, Anda akan mendapatkan URL publik untuk situs Anda (misalnya, `https://nama-unik-anda.netlify.app`). Salin URL ini.
    *   Kembali ke dasbor Supabase Anda. Buka **Authentication** -> **URL Configuration**.
    *   Ganti **Site URL** dari `http://localhost:8888` menjadi URL Netlify Anda yang baru.
    *   Klik "**Save**".

**Selesai!** Aplikasi manajemen kompetisi renang Anda sekarang sudah aktif dan dapat diakses secara global. Anda dapat login menggunakan akun Super Admin yang Anda buat di `config.ts`, atau membuat akun Admin baru langsung dari Supabase.