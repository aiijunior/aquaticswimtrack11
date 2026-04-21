const fetch = require('node-fetch');

export const handler = async (event) => {
    const { name } = event.queryStringParameters || {};

    if (!name) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Name parameter is required' })
        };
    }

    const EXTERNAL_URL = 'https://reactswimsulsel.vercel.app/.netlify/functions/getPublicData';

    try {
        const response = await fetch(EXTERNAL_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch from external source: ${response.statusText}`);
        }

        const data = await response.json();
        const { swimmers, events } = data;

        // Find matches for the name (case insensitive)
        const matchedSwimmers = swimmers.filter(s => 
            s.name.toLowerCase().includes(name.toLowerCase())
        );

        if (matchedSwimmers.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ swimmers: [] })
            };
        }

        // For each matched swimmer, gather their best times
        const result = matchedSwimmers.map(swimmer => {
            const swimmerTimes = [];

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

            // Keep only the best time per distance/style/gender
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
        console.error('Error searching external swimmer:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message })
        };
    }
};
