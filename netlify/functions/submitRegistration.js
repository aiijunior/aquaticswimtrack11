import { createClient } from '@supabase/supabase-js';

// These must be set as environment variables in your Netlify deployment settings.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;

// Initialize the admin client only if the credentials are provided
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    if (!supabaseAdmin) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                success: false, 
                message: "Konfigurasi database di server bermasalah. Hubungi administrator.",
                swimmer: null
            }) 
        };
    }

    try {
        const { swimmerData, registrations } = JSON.parse(event.body);
        
        if (!swimmerData || !registrations || !swimmerData.name || !swimmerData.club) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Data pendaftaran tidak valid.', swimmer: null }) };
        }
        
        // 1. Find or create the swimmer using the admin client to bypass RLS
        const { data: existingSwimmers, error: searchError } = await supabaseAdmin
            .from('swimmers')
            .select('id, name, birth_year, gender, club')
            .ilike('name', swimmerData.name.trim())
            .ilike('club', swimmerData.club.trim())
            .eq('birth_year', swimmerData.birthYear)
            .eq('gender', swimmerData.gender);
            
        if (searchError) throw searchError;
        
        let swimmer;
        if (existingSwimmers && existingSwimmers.length > 0) {
            swimmer = existingSwimmers[0];
        } else {
            const { data: newSwimmer, error: addError } = await supabaseAdmin
                .from('swimmers')
                .insert({
                    name: swimmerData.name,
                    birth_year: swimmerData.birthYear,
                    gender: swimmerData.gender,
                    club: swimmerData.club
                })
                .select('id, name, birth_year, gender, club')
                .single();
            if (addError) throw addError;
            swimmer = newSwimmer;
        }

        // 2. Insert event entries, also bypassing RLS
        const entriesToInsert = registrations.map(reg => ({
            event_id: reg.eventId,
            swimmer_id: swimmer.id,
            seed_time: reg.seedTime
        }));
        
        const { error: entriesError } = await supabaseAdmin.from('event_entries').upsert(entriesToInsert);
        
        if (entriesError) {
             if (entriesError.message.includes('duplicate key value violates unique constraint')) {
                 return { 
                    statusCode: 409, 
                    body: JSON.stringify({ success: false, message: 'Gagal: Salah satu pendaftaran duplikat. Perenang mungkin sudah terdaftar di nomor lomba tersebut.', swimmer: null }) 
                };
            }
            throw entriesError;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, message: 'Pendaftaran berhasil diterima.', swimmer }),
        };

    } catch (error) {
        console.error("Error in submitRegistration function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Terjadi kesalahan server: ${error.message}`, swimmer: null })
        };
    }
};
