
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a single synthetic, humanized dataset entry from a Product Requirements Document (PRD).
 *
 * - generateSyntheticEntry - An async function that takes a PRD and temperature as input and returns a single synthetic data entry.
 * - GenerateSyntheticEntryInput - The input type for the generateSyntheticEntry function.
 * - GenerateSyntheticEntryOutput - The output type for the generateSyntheticEntry function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSyntheticEntryInputSchema = z.object({
  prd: z.string().describe('The Product Requirements Document to use as a basis for data generation.'),
  temperature: z.number().min(0).max(1).describe('The creativity temperature for the generation.'),
  apiKey: z.string().optional().describe('The API key to use for the request.'),
  apiKeyIndex: z.number().optional().describe('The index of the API key being used (0-4).'),
});
export type GenerateSyntheticEntryInput = z.infer<typeof GenerateSyntheticEntryInputSchema>;

const GenerateSyntheticEntryOutputSchema = z.object({
  context: z.string().describe("A short, one-sentence scenario or background for the command."),
  input: z.string().describe("The generated input command, which must start with 'ryha'."),
  output: z.string().describe("The generated output response, which must address the user as 'boss'."),
});
export type GenerateSyntheticEntryOutput = z.infer<typeof GenerateSyntheticEntryOutputSchema>;

export async function generateSyntheticEntry(
  input: GenerateSyntheticEntryInput
): Promise<GenerateSyntheticEntryOutput> {
  return generateSyntheticEntryFlow(input);
}

const generateSyntheticEntryFlow = ai.defineFlow(
  {
    name: 'generateSyntheticEntryFlow',
    inputSchema: GenerateSyntheticEntryInputSchema,
    outputSchema: GenerateSyntheticEntryOutputSchema,
  },
  async (input) => {
    const { prd, temperature, apiKey, apiKeyIndex } = input;

    if (!apiKey) {
      throw new Error('API key is required.');
    }

    if (apiKeyIndex! <= 2) { // Google Gemini
      const modelName = 'gemini-1.5-flash-latest';
      
      const prompt = `You are an expert in generating highly unique and creative humanized datasets. Your primary goal is to avoid repetition and produce novel examples every single time.

Based on the following Product Requirements Document, generate a single, unique dataset entry.

Product Requirements Document:
"${prd}"

Instructions for generation:
1.  Create a short, one-sentence scenario or background for the 'context' field. This scenario must be imaginative and distinct from common examples.
2.  Create a user command for the 'input' field based on the context. This command MUST start with the word "ryha".
3.  Create a response for the 'output' field. This response MUST address the user as "boss".
4.  Ensure the entry is consistent with the PRD.
5.  **Crucially, ensure the generated entry is completely unique and not a variation of a common theme. Be extremely creative.**

Return ONLY the raw JSON object.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: temperature,
                responseMimeType: 'application/json',
            }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
          throw new Error('Invalid response structure from Google AI API');
      }
      const content = data.candidates[0].content.parts[0].text;
      const parsedJson = JSON.parse(content);

      return GenerateSyntheticEntryOutputSchema.parse(parsedJson);

    } else { // OpenRouter
      let modelName: string;
      if (apiKeyIndex === 3) { // Key 4
        modelName = 'google/gemini-2.0-flash-exp:free';
      } else { // Key 5 (apiKeyIndex === 4)
        modelName = 'deepseek/deepseek-r1-distill-llama-70b:free';
      }

      const systemPrompt = `You are an expert in generating highly unique and creative humanized datasets. Your primary goal is to avoid repetition and produce novel examples every single time. You will be given a Product Requirements Document and your task is to generate a single, unique dataset entry in JSON format with "context", "input", and "output" fields.`;
      const userPrompt = `Product Requirements Document: "${prd}"

      Instructions for generation:
      1.  Create a short, one-sentence scenario or background for the 'context' field. This scenario must be imaginative and distinct from common examples.
      2.  Create a user command for the 'input' field based on the context. This command MUST start with the word "ryha".
      3.  Create a response for the 'output' field. This response MUST address the user as "boss".
      4.  Ensure the entry is consistent with the PRD.
      5.  **Crucially, ensure the generated entry is completely unique and not a variation of a common theme. Be extremely creative.**

      Return ONLY the raw JSON object.`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:9002', // Required by some OpenRouter models
            'X-Title': 'DataGenius' // Required by some OpenRouter models
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: temperature,
            response_format: { "type": "json_object" }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsedJson = JSON.parse(content);

    return GenerateSyntheticEntryOutputSchema.parse(parsedJson);
    }
  }
);
