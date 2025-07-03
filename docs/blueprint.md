# **App Name**: DataGenius

## Core Features:

- API Key Management: Securely store the Gemini API key in an environment variable for use in data generation. If the entered key exceeds API request limits, DataGenius prompts the user for another key.
- Automatic Temperature Selection: Analyze a Product Requirements Document (PRD) and determine an appropriate temperature value for use in data generation.
- AI-Powered Data Generation: Given a PRD, use the Gemini API to generate a synthetic, humanized dataset, automatically retrying and/or requesting new keys, up to a million data points.
- AI Tool Orchestration: Utilize Gemini's reasoning capabilities to ensure each entry in the synthetic dataset is of the highest possible quality, determining when to incorporate additional considerations in each element of the dataset.
- Automated Resume: Resume data generation from the point of interruption in case of API limits or errors with an automated retry mechanism, continuing from the last generated data point.

## Style Guidelines:

- Primary color: Vibrant Blue (#29ABE2) to reflect technological innovation and intelligence. It conveys trust and clarity, aligning with the AI data generation focus.
- Background color: Light Gray (#F5F5F5), offering a neutral, distraction-free backdrop to ensure readability and focus on generated data.
- Accent color: Electric Purple (#8E2DE2) to highlight interactive elements, such as the data generation trigger and input fields, offering a contrast to guide the user through key actions.
- Body and headline font: 'Inter' sans-serif, providing a clean, modern, and highly readable interface suitable for presenting large datasets and complex information. This choice ensures accessibility and usability.
- A clear, sectioned layout. The API key input section is clearly distinguished, as is the PRD input area and the data generation display area. A progress indicator is clearly visible.