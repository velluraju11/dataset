'use server';

/**
 * @fileOverview This file defines a Genkit flow for modifying a dataset entry based on user instructions.
 *
 * - modifyDatasetEntry - An async function that takes an instruction and a dataset entry and returns the modified entry.
 * - ModifyDatasetEntryInput - The input type for the modifyDatasetEntry function.
 * - ModifyDatasetEntryOutput - The output type for the modifyDatasetEntry function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DataEntrySchema = z.object({
  id: z.number(),
  context: z.string(),
  input: z.string(),
  output: z.string(),
});

const ModifyDatasetEntryInputSchema = z.object({
  instruction: z.string().describe('The user instruction for how to modify the dataset entry.'),
  entry: DataEntrySchema.describe('The dataset entry to modify.'),
  apiKey: z.string().optional().describe('The API key to use for the request.'),
  apiKeyIndex: z.number().optional().describe('The index of the API key being used (0-4).'),
});
export type ModifyDatasetEntryInput = z.infer<typeof ModifyDatasetEntryInputSchema>;

const ModifyDatasetEntryOutputSchema = DataEntrySchema;
export type ModifyDatasetEntryOutput = z.infer<typeof ModifyDatasetEntryOutputSchema>;

export async function modifyDatasetEntry(input: ModifyDatasetEntryInput): Promise<ModifyDatasetEntryOutput> {
  return modifyDatasetEntryFlow(input);
}

const modifyEntryPrompt = ai.definePrompt({
  name: 'modifyEntryPrompt',
  input: {schema: ModifyDatasetEntryInputSchema},
  output: {schema: ModifyDatasetEntryOutputSchema},
  prompt: `You are an AI assistant that modifies dataset entries. You will be given a dataset entry with an 'id', 'context', 'input', and 'output'. You will also be given an instruction.

Your task is to modify the 'context', 'input', and/or 'output' fields of the entry according to the instruction.
- You MUST maintain the original 'id'.
- The modified 'input' must still start with 'ryha'.
- The modified 'output' must still address the user as 'boss'.

Original Entry:
- ID: {{{entry.id}}}
- Context: {{{entry.context}}}
- Input: {{{entry.input}}}
- Output: {{{entry.output}}}

Modification Instruction:
"{{{instruction}}}"

Return only the JSON for the modified entry.
`,
});

const modifyDatasetEntryFlow = ai.defineFlow(
  {
    name: 'modifyDatasetEntryFlow',
    inputSchema: ModifyDatasetEntryInputSchema,
    outputSchema: ModifyDatasetEntryOutputSchema,
  },
  async (input) => {
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    const model = 'googleai/gemini-1.5-flash-latest';

    try {
      if (input.apiKey) {
        process.env.GOOGLE_API_KEY = input.apiKey;
      }

      const {output} = await modifyEntryPrompt(input, {
        model,
      });
      return output!;
    } finally {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }
  }
);
