
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    if (!supabaseAdmin) {
        return { statusCode: 500, body: JSON.stringify({ success: false, message: "Database config error." }) };
    }

    try {
        const { teamData, participants } = JSON.parse(event.body);
        
        if (!teamData || !participants || participants.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Data tidak lengkap.' }) };
        }

        // 1. Process each unique swimmer from the participants list
        const uniqueSwimmersMap = new Map();
        participants.forEach(p => {
            const key = `${p.name.trim().toLowerCase()}_${p.birthYear}_${p.gender}`;
            if (!uniqueSwimmersMap.has(key)) {
                uniqueSwimmersMap.set(key, {
                    name: p.name,
                    birthYear: p.birthYear,
                    gender: p.gender === 'L' ? 'Male' : 'Female',
                    club: teamData.clubName,
                    age_group: p.ageGroup || null,
                    payment_proof: teamData.paymentProof,
                    payment_amount: teamData.paymentAmount,
                    pic_name: teamData.picName,
                    pic_phone: teamData.picPhone
                });
            }
        });

        for (const [key, swimmerData] of uniqueSwimmersMap.entries()) {
            // Check if swimmer exists
            const { data: existing, error: findError } = await supabaseAdmin
                .from('swimmers')
                .select('id')
                .ilike('name', swimmerData.name.trim())
                .eq('birth_year', swimmerData.birthYear)
                .eq('gender', swimmerData.gender)
                .limit(1);

            if (findError) throw findError;

            let swimmerId;
            if (existing && existing.length > 0) {
                swimmerId = existing[0].id;
                // Update info with PIC contact
                await supabaseAdmin.from('swimmers').update({
                    club: teamData.clubName,
                    payment_proof: teamData.paymentProof,
                    payment_amount: teamData.paymentAmount,
                    pic_name: teamData.picName,
                    pic_phone: teamData.picPhone
                }).eq('id', swimmerId);
            } else {
                const { data: created, error: createError } = await supabaseAdmin
                    .from('swimmers')
                    .insert(swimmerData)
                    .select('id')
                    .single();
                if (createError) throw createError;
                swimmerId = created.id;
            }
            uniqueSwimmersMap.get(key).realId = swimmerId;
        }

        // 2. Process all event entries
        const allEventEntries = [];
        for (const p of participants) {
            const key = `${p.name.trim().toLowerCase()}_${p.birthYear}_${p.gender}`;
            const swimmerId = uniqueSwimmersMap.get(key).realId;
            
            if (p.eventId) {
                allEventEntries.push({
                    event_id: p.eventId,
                    swimmer_id: swimmerId,
                    seed_time: p.seedTimeMs || 0
                });
            }
        }

        if (allEventEntries.length > 0) {
            const { error: entriesError } = await supabaseAdmin.from('event_entries').upsert(allEventEntries);
            if (entriesError) throw entriesError;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `Berhasil mendaftarkan ${uniqueSwimmersMap.size} atlet dan ${allEventEntries.length} nomor lomba.` }),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
