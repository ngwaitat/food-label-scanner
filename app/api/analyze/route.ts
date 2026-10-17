import { createGoogle } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const google = createGoogle({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const AnalysisSchema = z.object({
  status: z.enum(['VEGAN', 'VEGETARIAN', 'NON_VEGETARIAN', 'UNKNOWN']),
  summary: z.string(),
  flaggedIngredients: z.array(
    z.object({
      name: z.string(),
      category: z.enum(['MEAT', 'FISH_SEAFOOD', 'DAIRY_EGG', 'ADDITIVE', 'OTHER']),
      reason: z.string(),
    })
  ),
});

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    if (typeof imageBase64 !== 'string' || !imageBase64) {
      return Response.json({ error: 'Image is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const mediaType = /^data:(image\/[\w.+-]+);base64,/.exec(imageBase64)?.[1] ?? 'image/jpeg';

    const { output } = await generateText({
      model: google('gemini-3.8-flash'),
      output: Output.object({ schema: AnalysisSchema }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this food label ingredient list. Classify the product (VEGAN, VEGETARIAN, or NON_VEGETARIAN) and list any animal-derived ingredients or additives.',
            },
            {
              type: 'file',
              mediaType,
              data: imageBase64,
            },
          ],
        },
      ],
    });

    return Response.json(output);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message.includes('API key')
        ? 'GEMINI_API_KEY is invalid or missing'
        : 'Failed to analyze label';
    return Response.json({ error: message }, { status: 500 });
  }
}
