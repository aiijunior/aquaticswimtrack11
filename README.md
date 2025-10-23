# R.E.A.C.T (Real-time Evaluation for Aquatic Competition & Timing)

R.E.A.C.T adalah aplikasi modern, *offline-first*, dan *real-time* yang dirancang untuk mengelola kompetisi renang secara komprehensif. Mulai dari pendaftaran atlet, penjadwalan nomor lomba, hingga pencatatan waktu langsung (*live timing*), dan publikasi hasil, aplikasi ini menyediakan semua yang dibutuhkan oleh panitia penyelenggara.

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
### **Pembaruan Terkini: Penambahan Kelompok Umur (KU)**
*Tanggal Rilis: Sesuai pembaruan terakhir*

Pembaruan ini memperkenalkan fungsionalitas Kelompok Umur (KU) untuk setiap atlet, meningkatkan kemampuan aplikasi dalam mengelola kompetisi berbasis usia.

- **Fitur Baru: Data Kelompok Umur (KU)**
  - **Data Atlet**: Setiap atlet kini memiliki kolom "KU" opsional (`KU Senior`, `KU 1` - `KU 5`).
  - **Manajemen Admin**: Kolom KU ditambahkan pada tabel, formulir tambah, dan edit atlet di halaman "Daftar Atlet".
  - **Pendaftaran Online**: Formulir pendaftaran online sekarang menyertakan input dropdown untuk KU, dengan fungsionalitas pengisian otomatis untuk atlet yang sudah ada.
  - **Unggah Massal**: Template Excel untuk pendaftaran massal diperbarui dengan kolom "KU" baru.
  - **Skema Database**: Skema SQL diperbarui untuk menyertakan kolom `age_group` pada tabel `swimmers`.

---
### **Versi 1.1.5: Fitur SQL Editor & Perbaikan Tipe Data**
*Tanggal Rilis: Sesuai pembaruan terakhir*

Pembaruan ini memperkenalkan fitur baru untuk administrator tingkat lanjut dan memperbaiki masalah terkait penyimpanan data.

- **Fitur Baru: SQL Editor (Khusus Super Admin)**
  - Menambahkan tautan "SQL Editor" baru di menu samping untuk pengguna dengan peran Super Admin.
  - Untuk menjaga keamanan, fitur ini tidak menjalankan kueri dari dalam aplikasi. Sebaliknya, fitur ini memberikan tautan aman langsung ke editor SQL di dasbor Supabase proyek Anda.
  - Halaman ini menyertakan peringatan keamanan dan contoh kueri untuk memandu administrator.

- **Perbaikan: Tipe Data 'Papan Luncur'**
  - Memperbaiki bug kritis di mana nomor lomba dengan gaya "Papan Luncur" tidak dapat disimpan ke database.
  - Skrip SQL di README.md telah diperbarui untuk menyertakan "Papan Luncur" sebagai tipe `swim_style` yang valid. Pengguna baru atau yang mengatur ulang database harus menjalankan skrip terbaru.

---
### **Versi 1.1.4 (Pembaruan Terkini): Dasbor Analitik & Peningkatan UI**
*Tanggal Rilis: Sesuai pembaruan terakhir*

Pembaruan ini berfokus pada perombakan dasbor admin untuk memberikan wawasan data yang lebih kaya dan meningkatkan pengalaman pengguna secara keseluruhan.

- **Fitur Baru: Dasbor Analitik**
  - **Statistik Kunci**: Dasbor kini menampilkan empat statistik utama: Total Atlet, Total Nomor Lomba, Total Tim, dan Total Pendaftaran, memberikan gambaran cepat mengenai skala kompetisi.
  - **Bagan Distribusi Tim**: Menambahkan bagan (chart) visual baru yang menampilkan distribusi jumlah atlet per tim. Bagan ini menyorot 7 tim teratas untuk analisis yang mudah dan mengelompokkan sisanya.

- **Penyempurnaan UI/UX**:
  - **Tata Letak Dasbor Baru**: Mengatur ulang tata letak dasbor untuk tampilan yang lebih modern, bersih, dan fokus pada data.
  - **Integrasi Grafik**: Menambahkan pustaka `Chart.js` untuk memastikan visualisasi data yang andal dan responsif, serta mendukung mode terang dan gelap.

---
### **Versi 1.1.3: Perbaikan Stabilitas & Notifikasi**

Versi ini mengatasi beberapa masalah mendasar terkait interaksi pengguna dan memperkaya alur kerja pendaftaran.

- **Perbaikan: Stabilitas Tombol Aplikasi**
  - Memperbaiki masalah kritis di mana tombol di dalam formulir (seperti 'Hapus', 'Tambah', atau 'Buka Modal') secara tidak sengaja bertindak sebagai tombol 'submit', yang menyebabkan perilaku aplikasi yang tidak diharapkan. Semua tombol sekarang secara default diatur ke `type="button"`, kecuali jika secara eksplisit ditujukan untuk mengirimkan formulir.

- **Perbaikan: Notifikasi Pendaftaran yang Lebih Informatif**
  - Notifikasi keberhasilan pendaftaran online sekarang telah disempurnakan. Selain menampilkan nomor lomba yang baru didaftarkan, notifikasi kini juga mencantumkan riwayat nomor lomba yang sudah pernah didaftarkan oleh atlet tersebut sebelumnya, memberikan konfirmasi yang lebih lengkap kepada pengguna.

---
### **Versi 1.1.2: Optimasi Kinerja & Keamanan**

Pembaruan ini berfokus pada peningkatan kecepatan dan perbaikan keamanan di level database.

- **Peningkatan: Kinerja Halaman Pendaftaran Online**
  - Mengatasi kelambatan pada menu pendaftaran online dengan mengoptimalkan kueri data. Halaman sekarang hanya memuat informasi yang relevan untuk pendaftaran (info acara dan entri) tanpa mengambil data hasil lomba yang besar, sehingga waktu muat menjadi jauh lebih cepat.

- **Perbaikan: Kebijakan Keamanan Database (RLS)**
  - Menambahkan kebijakan Row Level Security (RLS) yang hilang untuk operasi `INSERT` pada tabel `competition_info`. Hal ini memperbaiki error `new row violates row-level security policy` yang terjadi saat aplikasi mencoba membuat data kompetisi untuk pertama kalinya (misalnya, setelah menghapus semua data).

---
## Tindakan yang Diperlukan

- **Untuk Pengguna Umum**: Tidak ada tindakan yang diperlukan. Cukup muat ulang aplikasi untuk melihat perubahan terbaru pada dasbor dan fungsionalitas lainnya.
- **Untuk Administrator Database**: Jika Anda baru meng-install aplikasi ini atau telah mengatur ulang database Anda, pastikan Anda telah menjalankan skrip SQL terbaru dari bagian **"Langkah 1: Pengaturan Supabase"** di bawah ini. Skrip tersebut telah diperbarui untuk menyertakan kebijakan keamanan (RLS) yang memperbaiki masalah `INSERT` (lihat changelog Versi 1.1.2).

---
## Troubleshooting Umum

### Error: `new row violates row-level security policy for table "competition_info"`

**Penyebab:** Kesalahan ini terjadi karena kebijakan keamanan (Row Level Security) di database Supabase Anda belum dikonfigurasi dengan benar untuk mengizinkan penambahan data baru (`INSERT`) pada tabel yang kosong. Ini biasanya terjadi pada instalasi baru atau setelah data dihapus.

**Solusi:** Skrip SQL di bawah pada **Langkah 1: Pengaturan Supabase** telah diperbarui untuk mengatasi masalah ini. Cukup salin seluruh skrip SQL terbaru dari panduan ini dan jalankan di **SQL Editor** Supabase Anda. Tindakan ini aman untuk dijalankan kembali dan akan memperbaiki kebijakan keamanan yang ada.

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
        registration_deadline timestamp with time zone
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
    *   Selanjutnya, di bawah **Configuration**, pilih---