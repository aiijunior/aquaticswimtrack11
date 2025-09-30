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
        
        // 1. Find or create the swimmer and find existing registrations
        const { data: existingSwimmers, error: searchError } = await supabaseAdmin
            .from('swimmers')
            .select('id, name, birth_year, gender, club, age_group')
            .ilike('name', swimmerData.name.trim())
            .ilike('club', swimmerData.club.trim())
            .eq('birth_year', swimmerData.birthYear)
            .eq('gender', swimmerData.gender);
            
        if (searchError) throw searchError;
        
        let swimmer;
        let previouslyRegisteredEvents = [];

        if (existingSwimmers && existingSwimmers.length > 0) {
            swimmer = existingSwimmers[0];

            // Fetch previously registered events
            const { data: existingEntries, error: entriesFetchError } = await supabaseAdmin
                .from('event_entries')
                .select('event_id')
                .eq('swimmer_id', swimmer.id);
                
            if (entriesFetchError) throw entriesFetchError;
            
            if (existingEntries && existingEntries.length > 0) {
                const eventIds = existingEntries.map(e => e.event_id);
                const { data: eventsData, error: eventsFetchError } = await supabaseAdmin
                    .from('events')
                    .select('id, distance, style, gender, relay_legs, category')
                    .in('id', eventIds);
                    
                if (eventsFetchError) throw eventsFetchError;
                
                previouslyRegisteredEvents = eventsData || [];
            }
        } else {
            const { data: newSwimmer, error: addError } = await supabaseAdmin
                .from('swimmers')
                .insert({
                    name: swimmerData.name,
                    birth_year: swimmerData.birthYear,
                    gender: swimmerData.gender,
                    club: swimmerData.club,
                    age_group: swimmerData.ageGroup
                })
                .select('id, name, birth_year, gender, club, age_group')
                .single();
            if (addError) throw addError;
            swimmer = newSwimmer;
        }

        // 2. Insert new event entries
        const entriesToInsert = registrations.map(reg => ({
            event_id: reg.eventId,
            swimmer_id: swimmer.id,
            seed_time: reg.seedTime
        }));
        
        if (entriesToInsert.length > 0) {
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
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true, 
                message: 'Pendaftaran berhasil diterima.', 
                swimmer,
                previouslyRegisteredEvents
            }),
        };

    } catch (error) {
        console.error("Error in submitRegistration function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: `Terjadi kesalahan server: ${error.message}`, swimmer: null })
        };
    }
};