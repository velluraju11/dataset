'use server';

/**
 * @fileOverview This file defines a Genkit flow to analyze a Product Requirements Document (PRD)
 * and determine an appropriate temperature value for dataset generation.
 *
 * - analyzePRDForTemperature - The main function to analyze the PRD and determine the temperature.
 * - AnalyzePRDForTemperatureInput - The input type for the analyzePRDForTemperature function.
 * - AnalyzePRDForTemperatureOutput - The output type for the analyzePRDForTemperature function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzePRDForTemperatureInputSchema = z.object({
  prd: z.string().describe('The Product Requirements Document (PRD) to analyze.'),
});
export type AnalyzePRDForTemperatureInput = z.infer<typeof AnalyzePRDForTemperatureInputSchema>;

const AnalyzePRDForTemperatureOutputSchema = z.object({
  temperature: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'The suggested temperature value (0-1) for generating a dataset based on the PRD.'
    ),
  reasoning: z
    .string()
    .describe(
      'The reasoning behind the selected temperature value, explaining how it aligns with the PRD.'
    ),
});
export type AnalyzePRDForTemperatureOutput = z.infer<typeof AnalyzePRDForTemperatureOutputSchema>;

export async function analyzePRDForTemperature(
  input: AnalyzePRDForTemperatureInput
): Promise<AnalyzePRDForTemperatureOutput> {
  return analyzePRDForTemperatureFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzePRDForTemperaturePrompt',
  input: {schema: AnalyzePRDForTemperatureInputSchema},
  output: {schema: AnalyzePRDForTemperatureOutputSchema},
  prompt: `You are an expert in analyzing Product Requirements Documents (PRDs) and determining the optimal temperature value for generating high-quality, relevant datasets.

  Given the following PRD, analyze its complexity, required creativity, and potential for diverse data points.
  Based on this analysis, determine an appropriate temperature value between 0 and 1.

  A lower temperature (e.g., 0.2) is suitable for PRDs that require precise, factual data with minimal variation.
  A higher temperature (e.g., 0.8) is suitable for PRDs that benefit from creative, diverse, and exploratory data generation.

  PRD: {{{prd}}}

  Return the temperature value and a brief explanation of your reasoning.
  Ensure your reasoning clearly justifies the chosen temperature based on the PRD's characteristics.
`,
});

const analyzePRDForTemperatureFlow = ai.defineFlow(
  {
    name: 'analyzePRDForTemperatureFlow',
    inputSchema: AnalyzePRDForTemperatureInputSchema,
    outputSchema: AnalyzePRDForTemperatureOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
