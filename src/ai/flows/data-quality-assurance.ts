// Ensure this file has 'use server' directive.
'use server';

/**
 * @fileOverview A Genkit flow for ensuring data quality with AI reasoning.
 *
 * - ensureDataQualityWithReasoning - A function that enhances data quality using Gemini's reasoning.
 * - EnsureDataQualityWithReasoningInput - The input type for the ensureDataQualityWithReasoning function.
 * - EnsureDataQualityWithReasoningOutput - The return type for the ensureDataQualityWithReasoning function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnsureDataQualityWithReasoningInputSchema = z.object({
  prd: z.string().describe('The Product Requirements Document (PRD) to analyze.'),
  datasetEntry: z.string().describe('A single entry in the generated dataset.'),
});
export type EnsureDataQualityWithReasoningInput = z.infer<typeof EnsureDataQualityWithReasoningInputSchema>;

const EnsureDataQualityWithReasoningOutputSchema = z.object({
  refinedDatasetEntry: z.string().describe('The refined dataset entry, incorporating AI reasoning and considerations.'),
  reasoning: z.string().describe('Explanation of the AI reasoning applied to refine the dataset entry.'),
});
export type EnsureDataQualityWithReasoningOutput = z.infer<typeof EnsureDataQualityWithReasoningOutputSchema>;

export async function ensureDataQualityWithReasoning(input: EnsureDataQualityWithReasoningInput): Promise<EnsureDataQualityWithReasoningOutput> {
  return ensureDataQualityWithReasoningFlow(input);
}

const prompt = ai.definePrompt({
  name: 'ensureDataQualityWithReasoningPrompt',
  input: {schema: EnsureDataQualityWithReasoningInputSchema},
  output: {schema: EnsureDataQualityWithReasoningOutputSchema},
  prompt: `You are an AI data quality expert. Given a product requirements document (PRD) and a dataset entry, use your reasoning capabilities to identify potential issues, suggest improvements, and incorporate additional considerations to ensure the highest possible quality.

PRD: {{{prd}}}

Dataset Entry: {{{datasetEntry}}}

Reasoning:
1.  Analyze the PRD to understand the product requirements and goals.
2.  Evaluate the dataset entry in the context of the PRD.
3.  Identify any potential issues, inconsistencies, or areas for improvement.
4.  Suggest refinements or additional considerations to enhance the dataset entry's quality and relevance.
5. Return a refined dataset entry incorporating these refinements.

Refined Dataset Entry:`, // Ensure that there is no use of a helper function or function calls
});

const ensureDataQualityWithReasoningFlow = ai.defineFlow(
  {
    name: 'ensureDataQualityWithReasoningFlow',
    inputSchema: EnsureDataQualityWithReasoningInputSchema,
    outputSchema: EnsureDataQualityWithReasoningOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return {
      refinedDatasetEntry: output?.refinedDatasetEntry ?? 'Default Refined Entry',
      reasoning: output?.reasoning ?? 'Default Reasoning',
    };
  }
);
