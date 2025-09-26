import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { config } from '../config';

const ClipboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);


const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const textToCopy = children?.toString() || '';

    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="relative">
            <pre className="bg-background p-4 rounded-md text-sm text-text-primary whitespace-pre-wrap font-mono overflow-x-auto">
                <code>{children}</code>
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 rounded-md bg-surface hover:bg-border transition-colors text-text-secondary"
                title="Salin ke clipboard"
            >
                {copied ? <CheckIcon /> : <ClipboardIcon />}
            </button>
        </div>
    );
};

export const SqlEditorView: React.FC = () => {
    const projectRef = config.supabase.url.replace('https://', '').split('.')[0];
    const supabaseSqlEditorUrl = `https://app.supabase.com/project/${projectRef}/sql/new`;

    const fixPapanLuncurQuery = `-- Menambahkan 'Papan Luncur' ke tipe data gaya renang
ALTER TYPE public.swim_style ADD VALUE IF NOT EXISTS 'Papan Luncur';`;

    const fullSetupScript = `-- Create custom types for enums, but only if they don't already exist.
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
    club text NOT NULL
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
ON CONFLICT (id) DO NOTHING;`;

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">SQL Editor</h1>

            <Card className="border-yellow-500/50 bg-yellow-500/5 mb-6">
                <div className="flex items-start space-x-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <h2 className="text-xl font-bold text-yellow-600 dark:text-yellow-400">Peringatan Keamanan dan Fungsionalitas</h2>
                        <p className="text-text-secondary mt-2">
                            Menjalankan kueri SQL secara langsung dari aplikasi web (klien) memiliki risiko keamanan yang sangat tinggi dan dapat mengekspos database Anda terhadap serangan.
                            <br /><br />
                            Oleh karena itu, fitur ini mengarahkan Anda ke <strong>SQL Editor resmi di dasbor Supabase Anda</strong>. Ini adalah cara yang aman dan direkomendasikan untuk berinteraksi langsung dengan database Anda.
                        </p>
                    </div>
                </div>
            </Card>

            <Card>
                <h2 className="text-2xl font-bold mb-4">Akses SQL Editor Supabase</h2>
                <p className="text-text-secondary mb-4">
                    Gunakan tombol di bawah ini untuk membuka editor SQL di proyek Supabase Anda. Anda mungkin perlu login ke akun Supabase Anda terlebih dahulu.
                </p>
                <Button 
                    onClick={() => window.open(supabaseSqlEditorUrl, '_blank')}
                    title="Buka Editor SQL Supabase di tab baru"
                >
                    Buka Supabase SQL Editor
                </Button>
            </Card>

            <Card className="mt-6 border-orange-500/50 bg-orange-500/5">
                <h3 className="text-lg font-semibold text-orange-600 dark:text-orange-400">Perbaikan Cepat: Gaya "Papan Luncur"</h3>
                <p className="text-text-secondary mt-2">
                    Jika Anda mengalami galat saat mencoba membuat atau mengunggah nomor lomba dengan gaya <strong>"Papan Luncur"</strong>, kemungkinan skema database Anda perlu diperbarui.
                </p>
                <p className="text-text-secondary mt-2">
                    Jalankan perintah SQL berikut di Editor Supabase untuk memperbaikinya:
                </p>
                <CodeBlock>{fixPapanLuncurQuery}</CodeBlock>
            </Card>

            <Card className="mt-6">
                <h2 className="text-2xl font-bold mb-4">Skrip Pengaturan Database Lengkap</h2>
                <p className="text-text-secondary mb-4">
                    Gunakan skrip ini untuk melakukan instalasi pertama kali atau untuk mengatur ulang (reset) seluruh skema database Anda ke versi terbaru.
                </p>
                <p className="text-text-secondary mb-4 font-bold text-red-500">
                    PERINGATAN: Menjalankan skrip ini pada database yang sudah ada dapat menyebabkan kehilangan data. Gunakan dengan hati-hati.
                </p>
                <CodeBlock>{fullSetupScript}</CodeBlock>
            </Card>
        </div>
    );
};
