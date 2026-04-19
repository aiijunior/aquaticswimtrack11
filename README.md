# R.E.A.C.T (Real-time Evaluation for Aquatic Competition & Timing)

R.E.A.C.T adalah platform modern, real-time, dan komprehensif untuk manajemen kompetisi renang. Dirancang untuk skalabilitas, aplikasi ini tidak hanya mengelola satu event secara efisien tetapi juga siap dikembangkan menjadi database karir atlet terpusat. Mulai dari pendaftaran online, penjadwalan nomor lomba, pencatatan waktu langsung (live timing), hingga publikasi hasil, R.E.A.C.T menyediakan semua yang dibutuhkan oleh panitia penyelenggara.

## Fitur Unggulan

- **Pengaturan Kompetisi**: Konfigurasi detail acara, tanggal, logo, dan aturan kompetisi.
- **Sistem Biaya Dinamis**: Admin dapat mengatur kompetisi sebagai **GRATIS** (menyembunyikan formulir bayar) atau **BERBAYAR** (meminta bukti transfer).
- **Pendaftaran Mandiri & Kolektif**: Atlet bisa mendaftar sendiri-sendiri atau klub mendaftar secara massal menggunakan file Excel yang didukung dropdown otomatis.
- **Manajemen Nomor & Jadwal Lomba**: Buat nomor lomba perorangan dan estafet, lalu atur ke dalam sesi dengan penjadwal *drag-and-drop*.
- **Live Timing (Arduino Integration)**: Antarmuka intuitif untuk menjalankan seri (*heat*), lengkap dengan stopwatch manual atau otomatis via Arduino Uno (USB).
- **Hasil Real-time**: Hasil diperbarui secara *real-time* dan dapat dilihat di halaman publik.
- **Manajemen Data**:
    - Impor/Ekspor nomor lomba dan rekor melalui Excel.
    - Fungsi backup dan restore seluruh database menggunakan file JSON.
- **Otentikasi Aman**: Kontrol akses berbasis peran (Admin, Super Admin) yang didukung oleh Supabase Auth.

---
## Pembaruan Aplikasi (Changelog)

### **Versi 1.2.0 (Pembaruan Terkini): Pendaftaran Kolektif & Manajemen Biaya**
*Tanggal Rilis: Maret 2024*

Pembaruan besar ini menghadirkan sistem pendaftaran yang jauh lebih profesional dan akuntabel.

- **Fitur Baru: Pendaftaran Kolektif (Team Mode)**
  - **Excel Pintar**: Admin menyediakan template Excel yang sudah terisi otomatis dengan daftar KU dan Nomor Lomba yang tersedia. Klub tinggal mengisi data atlet dan mengunggahnya.
  - **Kontak PIC**: Menambahkan kolom **Nama PIC** dan **Nomor HP/WA Aktif** untuk memudahkan panitia menghubungi pendaftar jika terjadi masalah data/pembayaran.
  
- **Fitur Baru: Manajemen Pembayaran**
  - **Mode Gratis/Berbayar**: Jika Admin memilih mode "GRATIS", seluruh formulir pendaftaran online akan menyembunyikan instruksi pembayaran secara otomatis.
  - **Verifikasi Bukti Bayar**: Jika "BERBAYAR", pendaftar wajib mengunggah foto bukti transfer dan memasukkan nominal sesuai yang dibayarkan.
  - **Detail Rekening**: Pengaturan Nama Penerima dan Nomor Rekening dapat diatur langsung di menu Pengaturan Acara.

---
## Tindakan yang Diperlukan

### **1. Untuk Pengguna Baru**
Jalankan skrip SQL lengkap di bawah ini pada menu **SQL Editor** di dasbor Supabase Anda untuk membuat struktur database yang sudah lengkap dengan semua fitur terbaru.

### **2. Untuk Pengguna Lama (Migrasi)**
Skrip di bawah sekarang menyertakan perintah `ALTER TABLE` yang secara otomatis menambahkan kolom baru jika belum ada. Anda dapat menjalankan seluruh skrip ini tanpa khawatir merusak data lama.

---

## Panduan Instalasi Database (Supabase)

### Langkah 1: Jalankan Skema SQL Lengkap
Buka **SQL Editor** di Supabase, buat **New Query**, lalu salin dan jalankan skrip ini secara menyeluruh:

```sql
-- 1. Create custom types for enums (Safe Execution)
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

-- 2. Table for Competition Information
CREATE TABLE IF NOT EXISTS public.competition_info (
    id bigint PRIMARY KEY DEFAULT 1,
    event_name text NOT NULL,
    event_date date NOT NULL,
    event_logo text,
    sponsor_logo text,
    is_registration_open boolean NOT NULL DEFAULT false,
    number_of_lanes integer NOT NULL DEFAULT 8,
    registration_deadline timestamp with time zone,
    age_groups text,
    is_free boolean DEFAULT true,
    recipient_name text,
    account_number text,
    fee_per_event integer DEFAULT 0
);

-- MIGRASI: Pastikan kolom baru ada jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS fee_per_event integer DEFAULT 0;

-- 3. Table for Swimmers
CREATE TABLE IF NOT EXISTS public.swimmers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    birth_year integer NOT NULL,
    gender public.swimmer_gender NOT NULL,
    club text NOT NULL,
    age_group text,
    payment_proof text,
    payment_amount integer,
    pic_name text,
    pic_phone text
);

-- MIGRASI: Pastikan kolom baru ada jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_proof text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS payment_amount integer;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.swimmers ADD COLUMN IF NOT EXISTS pic_phone text;

-- 4. Table for Swim Events
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

-- 5. Table for Event Entries
CREATE TABLE IF NOT EXISTS public.event_entries (
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    seed_time bigint NOT NULL,
    PRIMARY KEY (event_id, swimmer_id)
);

-- 6. Table for Event Results
CREATE TABLE IF NOT EXISTS public.event_results (
    event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    swimmer_id uuid NOT NULL REFERENCES public.swimmers(id) ON DELETE CASCADE,
    "time" bigint NOT NULL,
    PRIMARY KEY (event_id, swimmer_id)
);

-- 7. Table for Swim Records
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

-- 8. Table for User Roles
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "role" public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 9. Setup RLS (Row Level Security)
ALTER TABLE public.competition_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- 10. Policies with existence check (Idempotent)
DO $$ BEGIN
    -- Public Read Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'competition_info') THEN
        CREATE POLICY "Public read access" ON public.competition_info FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'swimmers') THEN
        CREATE POLICY "Public read access" ON public.swimmers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'events') THEN
        CREATE POLICY "Public read access" ON public.events FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'event_entries') THEN
        CREATE POLICY "Public read access" ON public.event_entries FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'event_results') THEN
        CREATE POLICY "Public read access" ON public.event_results FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read access' AND tablename = 'records') THEN
        CREATE POLICY "Public read access" ON public.records FOR SELECT USING (true);
    END IF;

    -- Admin Full Access Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'competition_info') THEN
        CREATE POLICY "Admin full access" ON public.competition_info FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'swimmers') THEN
        CREATE POLICY "Admin full access" ON public.swimmers FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'events') THEN
        CREATE POLICY "Admin full access" ON public.events FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_entries') THEN
        CREATE POLICY "Admin full access" ON public.event_entries FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'event_results') THEN
        CREATE POLICY "Admin full access" ON public.event_results FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin full access' AND tablename = 'records') THEN
        CREATE POLICY "Admin full access" ON public.records FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- 11. Auth Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, role)
  VALUES (new.id, 'ADMIN');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Fix Trigger Existence Error (Drop if exists then create)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 13. Initial Data
INSERT INTO public.competition_info (id, event_name, event_date, number_of_lanes, is_free)
VALUES (1, 'R.E.A.C.T Championship', CURRENT_DATE, 8, true)
ON CONFLICT (id) DO UPDATE 
SET event_name = EXCLUDED.event_name,
    is_free = COALESCE(competition_info.is_free, EXCLUDED.is_free);
```

---

## Langkah Deployment Lengkap

1.  **Supabase**: Jalankan SQL di atas, ambil `URL` dan `Anon Key`.
2.  **Konfigurasi**: Ubah nama `config.ts.txt` menjadi `config.ts` dan masukkan kredensial Supabase.
3.  **Netlify**: Unggah kode ke GitHub, hubungkan ke Netlify.
4.  **Environment Variables**: Tambahkan `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` di Netlify Dashboard.
5.  **Site URL**: Update Site URL di dasbor Supabase (Authentication -> URL Configuration) agar sesuai dengan domain Netlify Anda.

**Selamat Menggunakan R.E.A.C.T!** platform renang paling modern dan akurat untuk kompetisi Anda.
