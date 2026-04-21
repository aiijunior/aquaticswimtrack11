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

    // Try multiple possible endpoints for public data
    const candidates = [
        'https://reactswimsulsel.vercel.app/api/getPublicData',
        'https://reactswimsulsel.vercel.app/.netlify/functions/getPublicData',
        'https://reactswimsulsel.vercel.app/api/getPublicData.js'
    ];

    let data = null;
    let errorDetails = [];

    for (const url of candidates) {
        try {
            const resp = await fetch(url, { 
                timeout: 12000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (resp.ok) {
                const text = await resp.text();
                try {
                    data = JSON.parse(text);
                    console.log(`Successfully fetched data from ${url}`);
                    break; 
                } catch (parseError) {
                    errorDetails.push(`${url}: Response is not valid JSON`);
                }
            } else {
                errorDetails.push(`${url}: Status ${resp.status} ${resp.statusText}`);
            }
        } catch (e) {
            errorDetails.push(`${url}: ${e.message}`);
        }
    }

    if (!data) {
        return {
            statusCode: 502,
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                message: 'Gagal terhubung ke database Sulawesi Selatan.',
                errors: errorDetails
            })
        };
    }

    try {
        // Handle different possible response structures
        const swimmers = data.swimmers || data.data?.swimmers || [];
        const events = data.events || data.data?.events || [];

        if (!Array.isArray(swimmers) || swimmers.length === 0) {
            return {
                statusCode: 200,
                headers: { 
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    swimmers: [], 
                    debug: `Berhasil terhubung, tapi menemukan 0 data atlet di database pusat. (Total event: ${events.length || 0})` 
                })
            };
        }

        // Search with normalized names
        const cleanName = name.toLowerCase().trim();
        const searchTerms = cleanName.split(/\s+/).filter(t => t.length >= 2);
        
        if (searchTerms.length === 0) {
            // If search is too short, just return empty
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ swimmers: [] })
            };
        }

        const matchedSwimmers = swimmers.filter(s => {
            if (!s.name) return false;
            const swimmerName = s.name.toLowerCase();
            
            // Try different matching strategies
            // 1. Exact match (highly unlikely)
            if (swimmerName === cleanName) return true;
            
            // 2. All terms present (The current strategy)
            const allTermsMatch = searchTerms.every(term => swimmerName.includes(term));
            if (allTermsMatch) return true;

            // 3. If it's a long name, maybe just a significant part matches?
            // (Only if we have very few matches, but let's stick to strict for now to avoid junk)
            
            return false;
        });

        // Gather best times
        const result = matchedSwimmers.map(swimmer => {
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
                            time: parseInt(swimmerResult.time),
                            eventName: `${event.distance}m ${event.style}`
                        });
                    }
                });
            }

            // Keep only best time per category
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
                swimmers: result,
                count: result.length,
                totalInDb: swimmers.length
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: error.message })
        };
    }
};
