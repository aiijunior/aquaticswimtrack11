
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.commentary || `Server error: ${response.statusText}`);
    }

    return data.commentary;
  } catch (error) {
    console.error("Error generating commentary:", error);
    return "There was an error generating the AI commentary. Please check the console for details.";
  }
};
