/**
 * FILE: netlify/functions/getPublicData.js
 * 
 * PETUNJUK:
 * 1. Salin file ini ke folder 'netlify/functions' di proyek Netlify Anda.
 * 2. Pastikan Anda sudah menginstal @supabase/supabase-js di proyek Netlify Anda (npm install @supabase/supabase-js).
 * 3. Tambahkan variable berikut di Environment Variables Netlify:
 *    - SUPABASE_URL: (Gunakan URL Supabase dari aplikasi ini)
 *    - SUPABASE_ANON_KEY: (Gunakan Anon Key Supabase dari aplikasi ini)
 */

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Aktifkan CORS agar bisa dipanggil dari frontend mana saja
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTION',
    'Content-Type': 'application/json'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Supabase credentials are missing.' })
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { name, id, club } = event.queryStringParameters || {};

  try {
    // Query data atlet dan hasil lombanya
    let query = supabase
      .from('swimmers')
      .select('*, results:event_results(*, event:events(*))');

    if (id) {
      query = query.eq('id', id);
    } else if (name) {
      query = query.ilike('name', `%${name}%`);
    }
    
    if (club) {
      query = query.ilike('club', `%${club}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Format data agar lebih "bersih" untuk aplikasi pendaftaran
    const formattedData = (data || []).map(swimmer => {
      const pbs = {};
      swimmer.results?.forEach(r => {
        const key = `${r.event?.distance}-${r.event?.style}`;
        if (!pbs[key] || r.time < pbs[key].time) {
          pbs[key] = {
            distance: r.event?.distance,
            style: r.event?.style,
            time: r.time
          };
        }
      });

      return {
        id: swimmer.id,
        name: swimmer.name,
        club: swimmer.club,
        year: swimmer.birth_year,
        gender: swimmer.gender,
        personal_bests: Object.values(pbs)
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        count: formattedData.length,
        data: formattedData 
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
