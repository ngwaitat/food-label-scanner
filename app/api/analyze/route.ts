import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { cacheGet, cacheSet, hashKey } from '@/app/lib/cache';
import { ANALYSIS_LANGUAGE, DEFAULT_LOCALE, isLocale, type Locale } from '@/app/i18n';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL ?? 'deepseek-flash';
const TEXT_MODEL = process.env.DEEPSEEK_TEXT_MODEL ?? VISION_MODEL;
const OCR_MIN_CHARS = envNumber('OCR_MIN_CHARS', 40);
const OCR_MIN_CONFIDENCE = envNumber('OCR_MIN_CONFIDENCE', 0.7);
const CACHE_VERSION = 'v2';

const API_ERRORS: Record<Locale, {
  inputRequired: string;
  missingKey: string;
  invalidKey: string;
  failed: string;
}> = {
  en: {
    inputRequired: 'Image or ingredient text is required',
    missingKey: 'DEEPSEEK_API_KEY is not configured',
    invalidKey: 'DEEPSEEK_API_KEY is invalid or missing',
    failed: 'Failed to analyze label',
  },
  'zh-Hant': {
    inputRequired: '請提供圖片或成分文字',
    missingKey: '未設定 DEEPSEEK_API_KEY',
    invalidKey: 'DEEPSEEK_API_KEY 無效或未設定',
    failed: '無法分析標籤',
  },
  'zh-Hans': {
    inputRequired: '请提供图片或成分文字',
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
  summary: z.string().max(500),
  ingredients: z.array(z.string().max(160)).max(100),
  flaggedIngredients: z.array(
    z.object({
      name: z.string().max(160),
      category: z.enum(['MEAT', 'FISH_SEAFOOD', 'DAIRY', 'EGG', 'ADDITIVE', 'FIVE_PUNGENT', 'OTHER']),
      reason: z.string().max(400),
    })
  ).max(60),
});

type AnalysisResult = z.infer<typeof AnalysisSchema>;

const INSTRUCTIONS = `Classify this food product for Buddhist vegetarian suitability based on its label.

Choose exactly one status:
- VEGAN: no meat, fish, seafood, dairy, egg, honey, or 五辛.
- OVO_VEGETARIAN: contains egg, but no dairy or 五辛.
- LACTO_VEGETARIAN: contains dairy, but no egg or 五辛.
- LACTO_OVO_VEGETARIAN: contains both dairy and egg, but no 五辛.
- PUNGENT_VEGETARIAN: otherwise vegan, but contains 五辛.
- NON_VEGETARIAN: contains meat, fish, or seafood.
- UNKNOWN: cannot determine.

Rules:
- List every ingredient you can read in "ingredients", in the order printed, keeping names exactly as printed.
- Flag animal-derived ingredients and additives of concern using the matching category.
- Flag 五辛 (scallion/onion, garlic, leek, chive, asafoetida) as FIVE_PUNGENT.
- 五辛 are plant-based: never describe them as non-vegetarian, meat, or animal-derived.
- If the product contains dairy or egg together with 五辛, use the matching LACTO_/OVO_/LACTO_OVO_ status and still flag the 五辛. Use PUNGENT_VEGETARIAN only when the product is otherwise vegan.
- Use only the categories provided, and keep category values in English.
- Do not invent anything that is not visible on the label, and never state that an ingredient is absent when it is listed.
- Be concise: summary at most two sentences, each reason at most one short sentence.`;

export async function POST(req: Request) {
  let locale: Locale = DEFAULT_LOCALE;

  try {
    const body = await req.json().catch(() => null);
    const { imageBase64: rawImage, ocrText: rawText } = body ?? {};

    if (isLocale(body?.locale)) {
      locale = body.locale;
    }

    const imageBase64 = typeof rawImage === 'string' ? rawImage : '';
    const ocrText = typeof rawText === 'string' ? rawText.trim() : '';
    const ocrConfidence =
      typeof body?.ocrConfidence === 'number' && Number.isFinite(body.ocrConfidence)
        ? body.ocrConfidence
        : null;

    // Text-only classification is far cheaper, but only trust OCR output that is
    // long enough and, when the caller reports confidence, above the threshold.
    // CJK characters carry more information per character, so they count twice
    // when deciding whether the extracted text is substantial enough.
    const cjkChars = (ocrText.match(/[\u3400-\u9fff]/g) ?? []).length;
    const effectiveLength = ocrText.length + cjkChars;
    const useText =
      effectiveLength >= OCR_MIN_CHARS &&
      (ocrConfidence === null || ocrConfidence >= OCR_MIN_CONFIDENCE);

    if (!useText && !imageBase64) {
      return Response.json({ error: API_ERRORS[locale].inputRequired }, { status: 400 });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return Response.json({ error: API_ERRORS[locale].missingKey }, { status: 500 });
    }

    const mediaType = /^data:(image\/[\w.+-]+);base64,/.exec(imageBase64)?.[1] ?? 'image/jpeg';
    const modelName = useText ? TEXT_MODEL : VISION_MODEL;

    const cacheKey = useText
      ? `analysis:${CACHE_VERSION}:text:${hashKey(ocrText.toLowerCase().replace(/\s+/g, ' '))}:${locale}:${modelName}`
      : `analysis:${CACHE_VERSION}:image:${hashKey(imageBase64)}:${locale}:${modelName}`;

    const cached = await cacheGet<AnalysisResult>(cacheKey);
    if (cached) {
      console.log(
        `[analyze] cache hit (${useText ? 'text' : 'vision'}, ${locale})`
      );
      return Response.json({ ...cached, model: modelName, cached: true });
    }

    const content = [
      { type: 'text' as const, text: INSTRUCTIONS },
      {
        type: 'text' as const,
        text: `Write the summary and every reason in ${ANALYSIS_LANGUAGE[locale]}. Keep ingredient names as they appear on the label.`,
      },
      useText
        ? { type: 'text' as const, text: `Ingredient text from the label:\n${ocrText.slice(0, 6000)}` }
        : { type: 'file' as const, mediaType, data: imageBase64 },
    ];

    const { output, usage } = await generateText({
      model: deepseek(modelName),
      output: Output.object({ schema: AnalysisSchema }),
      temperature: 0,
      providerOptions: { deepseek: { thinking: { type: 'disabled' as const } } },
      messages: [{ role: 'user', content }],
    });

    await cacheSet(cacheKey, output);

    console.log('[analyze] completed', {
      path: useText ? 'text' : 'vision',
      model: modelName,
      locale,
      inputTokens: usage.inputTokens ?? null,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
    });

    const debugUsage =
      process.env.ANALYZE_DEBUG === '1'
        ? {
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            },
          }
        : {};

    return Response.json({ ...output, model: modelName, cached: false, ...debugUsage });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message.includes('API key')
        ? API_ERRORS[locale].invalidKey
        : API_ERRORS[locale].failed;
    return Response.json({ error: message }, { status: 500 });
  }
}
