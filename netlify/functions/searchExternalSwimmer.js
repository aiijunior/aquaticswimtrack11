const fetch = require('node-fetch');

export const handler = async (event) => {
    const { name } = event.queryStringParameters || {};

    if (!name) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ message: 'Nama harus diisi' })
        };
    }

    // Try multiple possible endpoints for getPublicData
    const candidates = [
        'https://reactswimsulsel.vercel.app/api/getPublicData',
        'https://reactswimsulsel.vercel.app/.netlify/functions/getPublicData',
        'https://reactswimsulsel.vercel.app/getPublicData'
    ];

    let data = null;
    let errorDetails = '';

    for (const url of candidates) {
        try {
            const resp = await fetch(url, { 
                timeout: 15000, // Increase to 15s for large DBs
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://reactswimsulsel.vercel.app/'
                }
            });
            if (resp.ok) {
                data = await resp.json();
                break; 
            } else {
                errorDetails += `${url}: ${resp.status}; `;
            }
        } catch (e) {
            errorDetails += `${url}: ${e.message}; `;
        }
    }

    if (!data) {
        return {
            statusCode: 502,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ 
                message: 'Database Sulawesi Selatan tidak merespons.',
                details: errorDetails
            })
        };
    }

    try {
        const swimmers = data.swimmers || [];
        const events = data.events || [];

        if (!Array.isArray(swimmers)) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ swimmers: [] })
            };
        }

        // Tokenize search name
        const searchTerms = name.toLowerCase().trim().split(/\s+/).filter(t => t.length >= 2);
        
        if (searchTerms.length === 0) {
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ swimmers: [] })
            };
        }

        const matchedSwimmers = swimmers.filter(s => {
            if (!s.name) return false;
            const swimmerName = s.name.toLowerCase();
            return searchTerms.every(term => swimmerName.includes(term));
        });

        const result = matchedSwimmers.map(swimmer => {
            const swimmerTimes = [];

            if (Array.isArray(events)) {
                events.forEach(event => {
                    const results = event.results || [];
                    const swimmerResult = results.find(r => r.swimmerId === swimmer.id);
                    
                    if (swimmerResult) {
                        swimmerTimes.push({
                            distance: parseInt(event.distance),
                            style: event.style,
                            gender: event.gender,
                            time: parseInt(swimmerResult.time)
                        });
                    }
                });
            }

            const timesMap = new Map();
            swimmerTimes.forEach(t => {
                const key = `${t.distance}_${t.style}_${t.gender}`;
                if (!timesMap.has(key) || t.time < timesMap.get(key).time) {
                    timesMap.set(key, t);
                }
            });

            return {
                ...swimmer,
                bestTimes: Array.from(timesMap.values())
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
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ message: error.message })
        };
    }
};
