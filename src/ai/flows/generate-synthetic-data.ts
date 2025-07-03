'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating synthetic, humanized datasets from a Product Requirements Document (PRD).
 *
 * - generateSyntheticData - An async function that takes a PRD as input and returns a synthetic dataset.
 * - GenerateSyntheticDataInput - The input type for the generateSyntheticData function, which is a PRD string.
 * - GenerateSyntheticDataOutput - The output type for the generateSyntheticData function, which is a string representing the generated dataset.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSyntheticDataInputSchema = z.object({
  prd: z.string().describe('The Product Requirements Document to use as a basis for data generation.'),
});
export type GenerateSyntheticDataInput = z.infer<typeof GenerateSyntheticDataInputSchema>;

const GenerateSyntheticDataOutputSchema = z.string().describe('The generated synthetic dataset.');
export type GenerateSyntheticDataOutput = z.infer<typeof GenerateSyntheticDataOutputSchema>;

export async function generateSyntheticData(input: GenerateSyntheticDataInput): Promise<GenerateSyntheticDataOutput> {
  return generateSyntheticDataFlow(input);
}

const analyzePrdPrompt = ai.definePrompt({
  name: 'analyzePrdPrompt',
  input: {schema: GenerateSyntheticDataInputSchema},
  output: {schema: z.object({temperature: z.number().describe('The ideal temperature for generating data from this PRD.')})},
  prompt: `You are an expert product manager. Please analyze the following Product Requirements Document and determine an ideal temperature setting for generating data based on it. Return ONLY the temperature value.

PRD: {{{prd}}}`,
});

const generateDatasetPrompt = ai.definePrompt({
  name: 'generateDatasetPrompt',
  input: {schema: GenerateSyntheticDataInputSchema},
  output: {schema: GenerateSyntheticDataOutputSchema},
  prompt: `You are an expert in generating humanized datasets. Based on the following Product Requirements Document, generate a synthetic dataset.

PRD: {{{prd}}}

Dataset:`,
  // TODO: How to resume?
});

const generateSyntheticDataFlow = ai.defineFlow(
  {
    name: 'generateSyntheticDataFlow',
    inputSchema: GenerateSyntheticDataInputSchema,
    outputSchema: GenerateSyntheticDataOutputSchema,
  },
  async input => {
    const {output: tempAnalysis} = await analyzePrdPrompt(input);
    const {output: dataset} = await generateDatasetPrompt(input, {
      config: {temperature: tempAnalysis?.temperature},
    });
    return dataset!;
  }
);
