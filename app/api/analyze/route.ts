import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { ANALYSIS_LANGUAGE, DEFAULT_LOCALE, isLocale, type Locale } from '@/app/i18n';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const API_ERRORS: Record<Locale, {
  imageRequired: string;
  missingKey: string;
  invalidKey: string;
  failed: string;
}> = {
  en: {
    imageRequired: 'Image is required',
    missingKey: 'DEEPSEEK_API_KEY is not configured',
    invalidKey: 'DEEPSEEK_API_KEY is invalid or missing',
    failed: 'Failed to analyze label',
  },
  'zh-Hant': {
    imageRequired: '請提供圖片',
    missingKey: '未設定 DEEPSEEK_API_KEY',
    invalidKey: 'DEEPSEEK_API_KEY 無效或未設定',
    failed: '無法分析標籤',
  },
  'zh-Hans': {
    imageRequired: '请提供图片',
    missingKey: '未设置 DEEPSEEK_API_KEY',
    invalidKey: 'DEEPSEEK_API_KEY 无效或未设置',
    failed: '无法分析标签',
  },
};

const AnalysisSchema = z.object({
  status: z.enum([
    'VEGAN',
    'OVO_VEGETARIAN',
    'LACTO_VEGETARIAN',
    'LACTO_OVO_VEGETARIAN',
    'PUNGENT_VEGETARIAN',
    'NON_VEGETARIAN',
    'UNKNOWN',
  ]),
  summary: z.string(),
  flaggedIngredients: z.array(
    z.object({
      name: z.string(),
      category: z.enum(['MEAT', 'FISH_SEAFOOD', 'DAIRY', 'EGG', 'ADDITIVE', 'FIVE_PUNGENT', 'OTHER']),
      reason: z.string(),
    })
  ),
});

export async function POST(req: Request) {
  let locale: Locale = DEFAULT_LOCALE;

  try {
    const body = await req.json();
    const { imageBase64 } = body ?? {};

    if (isLocale(body?.locale)) {
      locale = body.locale;
    }

    if (typeof imageBase64 !== 'string' || !imageBase64) {
      return Response.json({ error: API_ERRORS[locale].imageRequired }, { status: 400 });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return Response.json({ error: API_ERRORS[locale].missingKey }, { status: 500 });
    }

    const mediaType = /^data:(image\/[\w.+-]+);base64,/.exec(imageBase64)?.[1] ?? 'image/jpeg';

    const modelName = 'deepseek-flash';
    console.log(`[analyze] using model: ${modelName}`);

    const { output } = await generateText({
      model: deepseek(modelName),
      output: Output.object({ schema: AnalysisSchema }),
      providerOptions: { deepseek: { thinking: { type: 'disabled' as const } } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this food label ingredient list and classify the product into exactly one of these categories: VEGAN (no meat, fish, seafood, dairy, egg, honey, or 五辛), OVO_VEGETARIAN (contains egg but no dairy or 五辛), LACTO_VEGETARIAN (contains dairy but no egg or 五辛), LACTO_OVO_VEGETARIAN (contains dairy and egg but no 五辛), PUNGENT_VEGETARIAN (otherwise vegan but contains 五辛), NON_VEGETARIAN (contains meat, fish, or seafood), or UNKNOWN (cannot determine). List any animal-derived ingredients or additives, and flag any ingredients belonging to the Buddhist 五辛 (five pungent vegetables: scallion/onion, garlic, leek, chive, and asafoetida) with category FIVE_PUNGENT. Write the summary and every reason in ${ANALYSIS_LANGUAGE[locale]}. Keep ingredient names as they appear on the label, and keep the category values in English as specified.`,
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

    return Response.json({ ...output, model: modelName });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message.includes('API key')
        ? API_ERRORS[locale].invalidKey
        : API_ERRORS[locale].failed;
    return Response.json({ error: message }, { status: 500 });
  }
}
