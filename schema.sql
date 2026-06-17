-- R.E.A.C.T Full Database Schema
-- Version: 1.2.5
-- Description: Complete schema including Competition Info, Swimmers, Events, Results, and Records.

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

-- MIGRATION SUPPORT: Ensure columns exist for older databases
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS fee_per_event integer DEFAULT 0;
ALTER TABLE public.competition_info ADD COLUMN IF NOT EXISTS age_groups text;

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

-- MIGRATION SUPPORT: Ensure columns exist for older databases
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
    checked_in BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (event_id, swimmer_id)
);

-- MIGRATION SUPPORT: Ensure columns exist for older databases
ALTER TABLE public.event_entries ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;

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

-- 10. Robust Policies (Consolidated)
DO $$ BEGIN
    -- Drop existing policies to ensure clean state
    DROP POLICY IF EXISTS "Public read access" ON public.competition_info;
    DROP POLICY IF EXISTS "Public read access" ON public.swimmers;
    DROP POLICY IF EXISTS "Public read access" ON public.events;
    DROP POLICY IF EXISTS "Public read access" ON public.event_entries;
    DROP POLICY IF EXISTS "Public read access" ON public.event_results;
    DROP POLICY IF EXISTS "Public read access" ON public.records;
    DROP POLICY IF EXISTS "Public read access" ON public.registration_logs;
    DROP POLICY IF EXISTS "Admin full access" ON public.competition_info;
    DROP POLICY IF EXISTS "Admin full access" ON public.swimmers;
    DROP POLICY IF EXISTS "Admin full access" ON public.events;
    DROP POLICY IF EXISTS "Admin full access" ON public.event_entries;
    DROP POLICY IF EXISTS "Admin full access" ON public.event_results;
    DROP POLICY IF EXISTS "Admin full access" ON public.records;
    DROP POLICY IF EXISTS "Admin full access" ON public.registration_logs;
    DROP POLICY IF EXISTS "Admin read users" ON public.users;

    -- 10a. Public Read & Insert (Allow registration without login if needed, though Netlify is primary)
    CREATE POLICY "Public read access" ON public.competition_info FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public read access" ON public.swimmers FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public insert" ON public.swimmers FOR INSERT TO anon, authenticated WITH CHECK (true);
    
    CREATE POLICY "Public read access" ON public.events FOR SELECT TO anon, authenticated USING (true);
    
    CREATE POLICY "Public read access" ON public.event_entries FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public insert" ON public.event_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
    
    CREATE POLICY "Public read access" ON public.event_results FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public read access" ON public.records FOR SELECT TO anon, authenticated USING (true);
    
    CREATE POLICY "Public read access" ON public.registration_logs FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public insert" ON public.registration_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

    -- 10b. Admin Full Access (Only authenticated users can modify data)
    CREATE POLICY "Admin full access" ON public.competition_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.swimmers FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.events FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.event_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.event_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.records FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin full access" ON public.registration_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Admin read users" ON public.users FOR SELECT TO authenticated USING (true);
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

-- 14. Table for Registration Logs (Transaction History)
CREATE TABLE IF NOT EXISTS public.registration_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_type text NOT NULL, -- 'INDIVIDUAL' or 'COLLECTIVE'
    registrant_name text NOT NULL, -- Swimmer name or Club name
    amount integer NOT NULL DEFAULT 0,
    proof text,
    details jsonb, -- { swimmers: [...], events: [...] }
    created_at timestamp with time zone DEFAULT now()
);

-- Setup RLS for registration_logs
ALTER TABLE public.registration_logs ENABLE ROW LEVEL SECURITY;

-- 15. Explicit Grants for Supabase Data API (Rollout May 30, 2026)
-- This ensures that tables are accessible via supabase-js and REST API.

-- competition_info
GRANT SELECT ON public.competition_info TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_info TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_info TO service_role;

-- swimmers
GRANT SELECT ON public.swimmers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swimmers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swimmers TO service_role;

-- events
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO service_role;

-- event_entries
GRANT SELECT ON public.event_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_entries TO service_role;

-- event_results
GRANT SELECT ON public.event_results TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_results TO service_role;

-- records
GRANT SELECT ON public.records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO service_role;

-- registration_logs
GRANT SELECT ON public.registration_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_logs TO service_role;

-- users (Limited access)
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
