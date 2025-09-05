import { GoogleGenAI, Modality } from "@google/genai";

// Helper to format base64 images for the API
const formatImagePart = (base64String) => {
  if (!base64String) return null;
  // Expected format: "data:image/png;base64,iVBORw0KGgo..."
  const match = base64String.match(/^data:(image\/.+);base64,(.+)$/);
  if (!match) return null; // Invalid format
  
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
};

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    const API_KEY = process.env.API_KEY;

    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "AI generation is disabled. API key not configured on the server." })
        };
    }

    try {
        const { prompt, eventLogo, sponsorLogo } = JSON.parse(event.body);
        
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        const parts = [{ text: prompt }];

        const eventLogoPart = formatImagePart(eventLogo);
        if (eventLogoPart) {
            parts.push({ text: "\n\nIni adalah logo acara utama:" });
            parts.push(eventLogoPart);
        }

        const sponsorLogoPart = formatImagePart(sponsorLogo);
        if (sponsorLogoPart) {
            parts.push({ text: "\n\nIni adalah logo sponsor:" });
            parts.push(sponsorLogoPart);
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview', // "nano-banana"
          contents: { parts: parts },
          config: {
              responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        });

        const imagePart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
        
        if (!imagePart || !imagePart.inlineData) {
            const textPart = response.candidates?.[0]?.content?.parts.find(part => part.text);
            const refusalMessage = textPart?.text || "Model AI tidak mengembalikan gambar. Permintaan mungkin ditolak karena kebijakan keamanan.";
            throw new Error(refusalMessage);
        }

        const base64Image = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coverImage: `data:${mimeType};base64,${base64Image}` }),
        };

    } catch (error) {
        console.error("Error in generateCover function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message || "Terjadi kesalahan saat membuat sampul." })
        };
    }
};
