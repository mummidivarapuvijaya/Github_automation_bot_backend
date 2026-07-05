import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API client
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey && apiKey !== '' ? new GoogleGenerativeAI(apiKey) : null;

export interface AITriageResult {
  summary: string;
  priority: 'Low' | 'Medium' | 'High';
  suggestedLabel: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

/**
 * Runs the issue or PR through Gemini LLM to auto-summarize, triage by priority, and suggest a label.
 */
export async function triageEvent(
  title: string,
  body: string,
  author: string,
  type: 'issue' | 'pull_request'
): Promise<AITriageResult> {
  const fallbackResult: AITriageResult = {
    summary: `${type === 'issue' ? 'Issue' : 'Pull Request'} titled "${title}" was opened by ${author}.`,
    priority: 'Medium',
    suggestedLabel: type === 'issue' ? 'bug' : 'enhancement',
    sentiment: 'Neutral',
  };

  if (!genAI) {
    console.warn('Gemini API key is not configured or is placeholder. Using fallback triage.');
    return fallbackResult;
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `
You are a technical GitHub Bot designed to auto-triage issues and pull requests.
Analyze the following ${type === 'issue' ? 'issue' : 'pull request'} and provide structural metadata.

Details:
- Title: ${title}
- Author: ${author}
- Description: ${body || 'No description provided.'}

Return a JSON object matching this schema:
{
  "summary": "Concise 1-2 sentence summary of the main point or request",
  "priority": "Low" | "Medium" | "High",
  "suggestedLabel": "bug" | "enhancement" | "documentation" | "question" | "security" | "chore",
  "sentiment": "Positive" | "Neutral" | "Negative"
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Clean up response if it has markdown wrappers (shouldn't happen with responseMimeType: 'application/json', but just in case)
    const jsonString = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonString) as AITriageResult;

    // Validate fields and return
    return {
      summary: parsed.summary || fallbackResult.summary,
      priority: ['Low', 'Medium', 'High'].includes(parsed.priority) ? parsed.priority : 'Medium',
      suggestedLabel: parsed.suggestedLabel || fallbackResult.suggestedLabel,
      sentiment: ['Positive', 'Neutral', 'Negative'].includes(parsed.sentiment) ? parsed.sentiment : 'Neutral',
    };
  } catch (error) {
    console.error('Error during Gemini AI Triage:', error);
    return fallbackResult;
  }
}
