import { GoogleGenAI } from "@google/genai";

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    const API_KEY = process.env.API_KEY;

    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ commentary: "AI commentary is disabled. API key not configured on the server." })
        };
    }

    try {
        const { eventName, results } = JSON.parse(event.body);
        
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const sortedResults = [...results].sort((a, b) => a.time - b.time);
        const resultsText = sortedResults
            .map((r, index) => `${index + 1}. ${r.swimmer.name} - ${(r.time / 1000).toFixed(2)}s`)
            .join('\n');

        const prompt = `
            You are an enthusiastic and dramatic swimming race commentator.
            The event is the ${eventName}.
            Based on the following final results, generate a short, exciting, play-by-play style commentary for the race.
            Build up the excitement and announce the winner clearly and with fanfare at the end. Keep it to 3-4 sentences.

            Results:
            ${resultsText}
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commentary: response.text }),
        };

    } catch (error) {
        console.error("Error in generateCommentary function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ commentary: "There was an error generating the AI commentary. Please check the function logs." })
        };
    }
};
