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
});
export type GenerateSyntheticEntryInput = z.infer<typeof GenerateSyntheticEntryInputSchema>;

const GenerateSyntheticEntryOutputSchema = z.object({
    context: z.string().describe("A short, one-sentence scenario or background for the command."),
    input: z.string().describe("The generated input command, which must start with 'ryha'."),
    output: z.string().describe("The generated output response, which must address the user as 'boss'.")
});
export type GenerateSyntheticEntryOutput = z.infer<typeof GenerateSyntheticEntryOutputSchema>;

export async function generateSyntheticEntry(input: GenerateSyntheticEntryInput): Promise<GenerateSyntheticEntryOutput> {
  return generateSyntheticEntryFlow(input);
}

const generateEntryPrompt = ai.definePrompt({
  name: 'generateEntryPrompt',
  input: {schema: GenerateSyntheticEntryInputSchema},
  output: {schema: GenerateSyntheticEntryOutputSchema},
  prompt: `You are an expert in generating humanized datasets. Based on the following Product Requirements Document, generate a single, unique, and creative dataset entry.

Product Requirements Document:
"{{{prd}}}"

Instructions for generation:
1.  Create a short, one-sentence scenario or background for the 'context' field.
2.  Create a user command for the 'input' field based on the context. This command MUST start with the word "ryha".
3.  Create a response for the 'output' field. This response MUST address the user as "boss".
4.  Ensure the entry is consistent with the PRD.
5.  Do not repeat examples. Be creative.
`,
});

const generateSyntheticEntryFlow = ai.defineFlow(
  {
    name: 'generateSyntheticEntryFlow',
    inputSchema: GenerateSyntheticEntryInputSchema,
    outputSchema: GenerateSyntheticEntryOutputSchema,
  },
  async (input) => {
    const originalApiKey = process.env.GOOGLE_API_KEY;
    try {
      if (input.apiKey) {
        process.env.GOOGLE_API_KEY = input.apiKey;
      }
      const {output} = await generateEntryPrompt(input, {
        config: {temperature: input.temperature},
      });
      return output!;
    } finally {
      process.env.GOOGLE_API_KEY = originalApiKey;
    }
  }
);
