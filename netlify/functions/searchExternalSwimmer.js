const fetch = require('node-fetch');

export const handler = async (event) => {
    const { name } = event.queryStringParameters || {};

    if (!name) {
        return {
            statusCode: 400,
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: 'Nama harus diisi' })
        };
    }

    // Menggunakan URL sesuai contoh yang Anda berikan
    // Kita tambahkan parameter ?name= agar filter dilakukan langsung oleh server pusat
    const targetUrl = `https://reactswimsulsel.vercel.app/api/getPublicData?name=${encodeURIComponent(name)}`;

    try {
        const resp = await fetch(targetUrl, { 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (!resp.ok) {
            return {
                statusCode: 502,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Server Sulawesi Selatan merespons dengan status ${resp.status}` })
            };
        }

        const result = await resp.json();
        
        // Menangani struktur { success, data } sesuai contoh Anda
        // Namun tetap berjaga-jaga jika strukturnya adalah { swimmers, events, records }
        let swimmers = [];
        let events = [];

        if (result.success && Array.isArray(result.data)) {
            // Struktur sesuai contoh Anda
            swimmers = result.data;
            // Jika dalam struktur ini tidak ada data events, kita mungkin hanya dapat data profil
            events = result.events || []; 
        } else {
            // Struktur standar R.E.A.C.T
            swimmers = result.swimmers || [];
            events = result.events || [];
        }

        // Jika pencarian dilakukan di server tujuan, kita tidak perlu filter manual lagi
        // Kecuali jika server tujuan mengembalikan semua data dan mengabaikan parameter name
        const matchedSwimmers = swimmers.filter(s => {
            if (!s.name) return false;
            return s.name.toLowerCase().includes(name.toLowerCase());
        });

        // Map data untuk mengambil "Best Times" (Catatan Waktu Terbaik)
        const finalResults = matchedSwimmers.map(swimmer => {
            const swimmerTimes = [];

            if (Array.isArray(events)) {
                events.forEach(event => {
                    const eventResults = event.results || [];
                    const swimmerResult = eventResults.find(r => r.swimmerId === swimmer.id);
                    
                    if (swimmerResult && swimmerResult.time > 0) {
                        swimmerTimes.push({
                            distance: parseInt(event.distance) || 0,
                            style: event.style,
                            gender: event.gender,
                            time: parseInt(swimmerResult.time)
                        });
                    }
                });
            }

            // Ringkas menjadi waktu terbaik per kategori
            const bestTimesMap = {};
            swimmerTimes.forEach(t => {
                const key = `${t.distance}_${t.style}_${t.gender}`;
                if (!bestTimesMap[key] || t.time < bestTimesMap[key].time) {
                    bestTimesMap[key] = t;
                }
            });

            return {
                ...swimmer,
                bestTimes: Object.values(bestTimesMap)
            };
        });

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                swimmers: finalResults,
                count: finalResults.length,
                success: true
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: error.message })
        };
    }
};
