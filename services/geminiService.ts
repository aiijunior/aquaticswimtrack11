import type { Swimmer } from '../types';

interface CommentaryResult {
  swimmer: Swimmer;
  time: number;
}

export const generateRaceCommentary = async (
  eventName: string,
  results: CommentaryResult[]
): Promise<string> => {
  try {
    const response = await fetch('/.netlify/functions/generateCommentary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventName, results }),
    });

    if (!response.ok) {
        let errorMessage = `Server error: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.commentary || errorData.message || JSON.stringify(errorData);
        } catch (e) {
            const textError = await response.text().catch(() => "Could not read error body.");
            errorMessage = textError.substring(0, 500);
        }
        throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return data.commentary;
    
  } catch (error: any) {
    console.error("Error generating commentary:", error);
    return "There was an error generating the AI commentary. Please check the console for details and ensure your Netlify functions are deployed correctly.";
  }
};

export const generateCoverImage = async (
  prompt: string,
  eventLogo: string | null,
  sponsorLogo: string | null
): Promise<string> => {
  try {
    const response = await fetch('/.netlify/functions/generateCover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, eventLogo, sponsorLogo }),
    });

    if (!response.ok) {
        let errorMessage = 'Gagal membuat sampul.';
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || JSON.stringify(errorData);
        } catch (e) {
            const textError = await response.text().catch(() => "Could not read error body.");
            errorMessage = textError.substring(0, 500);
        }
        throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return data.coverImage;
    
  } catch (error: any) {
    console.error("Error generating cover image:", error);
    throw error;
  }
};
