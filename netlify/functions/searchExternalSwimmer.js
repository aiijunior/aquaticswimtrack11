const fetch = require('node-fetch');

export const handler = async (event) => {
    const { name } = event.queryStringParameters || {};

    if (!name) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Name parameter is required' })
        };
    }

    // Try both Vercel and Netlify paths since the target host is on Vercel
    const candidates = [
        'https://reactswimsulsel.vercel.app/api/getPublicData',
        'https://reactswimsulsel.vercel.app/.netlify/functions/getPublicData'
    ];

    let data = null;
    let lastError = null;

    for (const url of candidates) {
        try {
            const resp = await fetch(url, { timeout: 5000 });
            if (resp.ok) {
                data = await resp.json();
                break; 
            }
        } catch (e) {
            lastError = e;
        }
    }

    if (!data) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Tidak dapat terhubung ke database Sulawesi Selatan. URL tidak valid atau server tujuan sedang sibuk.' })
        };
    }

    try {
        const { swimmers, events } = data;

        if (!swimmers || !Array.isArray(swimmers)) {
            return {
                statusCode: 200,
                body: JSON.stringify({ swimmers: [] })
            };
        }

        // Search with normalized names (remove extra spaces, case insensitive)
        const searchTerms = name.toLowerCase().trim().split(/\s+/);
        
        const matchedSwimmers = swimmers.filter(s => {
            if (!s.name) return false;
            const swimmerName = s.name.toLowerCase();
            // Swimmer name must contain ALL search terms for better accuracy
            return searchTerms.every(term => swimmerName.includes(term));
        });

        if (matchedSwimmers.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ swimmers: [] })
            };
        }

        const result = matchedSwimmers.map(swimmer => {
            const swimmerTimes = [];

            if (events && Array.isArray(events)) {
                events.forEach(event => {
                    const results = event.results || [];
                    const swimmerResult = results.find(r => r.swimmerId === swimmer.id);
                    
                    if (swimmerResult) {
                        swimmerTimes.push({
                            distance: event.distance,
                            style: event.style,
                            gender: event.gender,
                            time: swimmerResult.time
                        });
                    }
                });
            }

            const bestTimes = {};
            swimmerTimes.forEach(t => {
                const key = `${t.distance}_${t.style}_${t.gender}`;
                if (!bestTimes[key] || t.time < bestTimes[key].time) {
                    bestTimes[key] = t;
                }
            });

            return {
                ...swimmer,
                bestTimes: Object.values(bestTimes)
            };
        });

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ swimmers: result })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message })
        };
    }
};
