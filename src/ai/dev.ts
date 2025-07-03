import { config } from 'dotenv';
config();

import '@/ai/flows/analyze-prd-temperature.ts';
import '@/ai/flows/generate-synthetic-data.ts';
import '@/ai/flows/data-quality-assurance.ts';