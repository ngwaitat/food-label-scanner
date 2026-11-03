import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, NoObjectGeneratedError, Output, type LanguageModelUsage } from 'ai';
import { AnalysisSchema, parseAnalysisText, sanitizeAnalysis, summarizeStatus, type AnalysisResult } from '@/app/lib/analysis';
import { cacheGet, cacheSet, hashKey } from '@/app/lib/cache';
import { evaluateGeo } from '@/app/lib/geo';
import { normalizeImage } from '@/app/lib/orientation';
import {
  consumeQuota,
  getQuota,
  quotaHeaders,
  refundQuota,
  resolveIdentity,
  type QuotaReservation,
} from '@/app/lib/quota';
import { ANALYSIS_LANGUAGE, DEFAULT_LOCALE, isLocale, STRINGS, type Locale } from '@/app/i18n';
import type { QuotaSnapshot } from '@/app/types';

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
const MAX_OUTPUT_TOKENS = envNumber('ANALYZE_MAX_OUTPUT_TOKENS', 2048);
const CACHE_VERSION = 'v9';

const UNREADABLE: Record<Locale, string> = {
  en: 'The ingredient list could not be read reliably. Try a closer, well-lit photo of the ingredients.',
  'zh-Hant': '未能可靠讀取成分表，請靠近並在光線充足下重拍成分表。',
  'zh-Hans': '未能可靠读取成分表，请靠近并在光线充足下重拍成分表。',
};

const API_ERRORS: Record<Locale, {
  inputRequired: string;
  missingKey: string;
  invalidKey: string;
  failed: string;
  dailyLimit: string;
}> = {
  en: {
    inputRequired: 'Image or ingredient text is required',
    missingKey: 'DEEPSEEK_API_KEY is not configured',
    invalidKey: 'DEEPSEEK_API_KEY is invalid or missing',
    failed: 'Failed to analyze label',
    dailyLimit: 'You have reached today’s scan limit. Please try again after midnight.',
  },
  'zh-Hant': {
    inputRequired: '請提供圖片或成分文字',
    missingKey: '未設定 DEEPSEEK_API_KEY',
    invalidKey: 'DEEPSEEK_API_KEY 無效或未設定',
    failed: '無法分析標籤',
    dailyLimit: '已達到今日掃描上限，請於午夜後再試。',
  },
  'zh-Hans': {
    inputRequired: '请提供图片或成分文字',
    missingKey: '未设置 DEEPSEEK_API_KEY',
    invalidKey: 'DEEPSEEK_API_KEY 无效或未设置',
    failed: '无法分析标签',
    dailyLimit: '已达到今日扫描上限，请于午夜后再试。',
  },
};

const INSTRUCTIONS = `Read the printed ingredient list on this food package and classify it for Buddhist vegetarian suitability.

Read the text literally. Choose exactly one status:
- VEGAN: no meat, fish, seafood, dairy, egg, honey, or 五辛.
- OVO_VEGETARIAN: contains egg, but no dairy or 五辛.
- LACTO_VEGETARIAN: contains dairy, but no egg or 五辛.
- LACTO_OVO_VEGETARIAN: contains both dairy and egg, but no 五辛.
- PUNGENT_VEGETARIAN: otherwise vegan, but contains 五辛.
- NON_VEGETARIAN: the printed ingredient list contains meat, fish, or seafood.
- UNKNOWN: the ingredient list cannot be read.

Transcription rules:
- Every entry in "ingredients" must be a word you can actually read on the package. Never add an ingredient from memory, from the product name, from the flavour name, from serving suggestions, or from what similar products usually contain.
- Stop transcribing at the last ingredient you can read. Never append common seasonings (garlic, onion, spring onion, salt, sugar, spices) that you cannot actually see printed.
- The photo may be rotated 90° or 180°: read the text along its printed direction instead of assuming it is upside down or vertical.
- Do not guess blurred, cut-off, or unreadable text. If you cannot read the ingredient list, return status UNKNOWN with empty "ingredients" and empty "flaggedIngredients".
- Keep "name" exactly as printed, in printed order. Do not translate inside "name"; use "translation" only when the printed script differs from the requested language.
- List at most 40 ingredients, merging duplicates. Never repeat an entry.
- Product names, flavour names (e.g. 蟹味醬, Crab-flavoured sauce, 海鮮味), serving suggestions (e.g. 蟹味春卷) and marketing claims are NOT ingredients. A word such as 蟹, crab, 魚, fish, 肉 or meat inside a product or flavour name must not make the product non-vegetarian, especially when the name contains 素, 純素, Vegetarian or Vegan, or when the package says 無蟹肉 or 不含海鮮. Judge only by the printed ingredient list.
- Flag an ingredient only if that same ingredient appears in your own "ingredients" list. Never flag a product name, flavour name, or serving suggestion.
- Flag 五辛 (scallion/onion, garlic, leek, chive, asafoetida) as FIVE_PUNGENT only when the printed list itself names one of them (蒜, 大蒜, 蒜粉, 洋蔥, 蔥, 韭, 薤, 阿魏, garlic, onion, scallion, leek, chive, asafoetida). Never assume a sauce, seasoning or stock contains 五辛.
- 胡椒, 白胡椒, 花椒, 辣椒, 薑, 姜, 白芷 and 肉桂 are seasonings but NOT 五辛; never flag them as FIVE_PUNGENT.
- 五辛 are plant-based: never describe them as non-vegetarian, meat, or animal-derived.
- If the product contains dairy or egg together with 五辛, use the matching LACTO_/OVO_/LACTO_OVO_ status and still flag the 五辛. Use PUNGENT_VEGETARIAN only when the product is otherwise vegan.
- Use only the categories provided, and keep category values in English.
- Do not invent anything that is not visible on the label, and never state that an ingredient is absent when it is listed.
- Be concise: summary at most two sentences, each reason at most one short sentence.
- If any rule conflicts with being helpful, follow the transcription rules.`;

function scriptNote(locale: Locale): string {
  if (locale === 'zh-Hans') {
    return ' Printed names in Traditional Chinese are not in the selected script: convert them to Simplified Chinese in "translation".';
  }
  if (locale === 'zh-Hant') {
    return ' Printed names in Simplified Chinese are not in the selected script: convert them to Traditional Chinese in "translation".';
  }
  return '';
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  quota: QuotaSnapshot | null
): Response {
  const headers: Record<string, string> = quota
    ? quotaHeaders(quota)
    : { 'Cache-Control': 'no-store' };

  return Response.json(body, { status, headers });
}

export async function POST(req: Request) {
  const identity = resolveIdentity(req);
  const response = await handlePost(req, identity.userId);

  if (identity.setCookie) response.headers.append('Set-Cookie', identity.setCookie);

  return response;
}

async function handlePost(req: Request, userId: string): Promise<Response> {
  let locale: Locale = DEFAULT_LOCALE;
  let reservation: QuotaReservation | null = null;

  try {
    const body = await req.json().catch(() => null);
    const { imageBase64: rawImage, ocrText: rawText } = body ?? {};

    if (isLocale(body?.locale)) {
      locale = body.locale;
    }

    const geo = evaluateGeo(req);
    if (!geo.allowed) {
      return Response.json({ error: STRINGS[locale].regionBlocked }, { status: 403 });
    }

    let imageBase64 = typeof rawImage === 'string' ? rawImage : '';
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

    reservation = await consumeQuota(userId);
    if (!reservation.allowed) {
      const response = jsonResponse(
        { error: API_ERRORS[locale].dailyLimit, quota: reservation.quota },
        429,
        reservation.quota
      );
      const retryAfter = Math.max(
        1,
        Math.ceil((reservation.quota.resetsAt - Date.now()) / 1000)
      );
      response.headers.set('Retry-After', String(retryAfter));
      return response;
    }

    let mediaType = /^data:(image\/[\w.+-]+);base64,/.exec(imageBase64)?.[1] ?? 'image/jpeg';
    const modelName = useText ? TEXT_MODEL : VISION_MODEL;
    const originalImage = imageBase64;
    const originalMediaType = mediaType;

    if (!useText && imageBase64) {
      try {
        const normalized = await normalizeImage(
          imageBase64,
          deepseek(VISION_MODEL),
          `analysis:${CACHE_VERSION}`
        );
        if (normalized.changed) {
          imageBase64 = normalized.imageBase64;
          mediaType = 'image/jpeg';
        }
        console.log('[analyze] image normalized', {
          rotation: normalized.rotation,
          resized: normalized.changed,
        });
      } catch (orientationError) {
        // Normalisation is best-effort: a failure must not block the scan.
        console.warn('[analyze] image normalization failed', orientationError);
      }
    }

    const cacheKey = useText
      ? `analysis:${CACHE_VERSION}:text:${hashKey(ocrText.toLowerCase().replace(/\s+/g, ' '))}:${locale}:${modelName}`
      : `analysis:${CACHE_VERSION}:image:${hashKey(imageBase64)}:${locale}:${modelName}`;

    const cached = await cacheGet<AnalysisResult>(cacheKey);
    if (cached) {
      console.log(
        `[analyze] cache hit (${useText ? 'text' : 'vision'}, ${locale})`
      );
      return jsonResponse(
        { ...cached, model: modelName, cached: true, quota: reservation.quota },
        200,
        reservation.quota
      );
    }

    const languageNote = `Write the summary and every reason in ${ANALYSIS_LANGUAGE[locale]}. Keep each ingredient "name" exactly as it appears on the label. If a printed name is not already written in ${ANALYSIS_LANGUAGE[locale]}, add its translation in that language in the "translation" field; otherwise leave "translation" empty. Do not translate numbers, E-codes, or brand names.${scriptNote(locale)}`;

    const runModel = async (
      image: string,
      type: string
    ): Promise<{ output: AnalysisResult; usage: LanguageModelUsage | undefined; recovered: boolean }> => {
      const content = [
        { type: 'text' as const, text: INSTRUCTIONS },
        { type: 'text' as const, text: languageNote },
        useText
          ? {
              type: 'text' as const,
              text: `Ingredient text from the label:\n${ocrText.slice(0, 6000)}`,
            }
          : { type: 'file' as const, mediaType: type, data: image },
      ];

      try {
        const generated = await generateText({
          model: deepseek(modelName),
          output: Output.object({ schema: AnalysisSchema }),
          temperature: 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          providerOptions: { deepseek: { thinking: { type: 'disabled' as const } } },
          messages: [{ role: 'user', content }],
        });
        return { output: generated.output, usage: generated.usage, recovered: false };
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) throw error;

        const salvaged = error.text ? parseAnalysisText(error.text) : null;
        console.warn('[analyze] model output was not valid JSON', {
          finishReason: error.finishReason ?? null,
          salvaged: Boolean(salvaged),
        });

        return {
          output: salvaged ?? {
            status: 'UNKNOWN',
            summary: UNREADABLE[locale],
            ingredients: [],
            flaggedIngredients: [],
          },
          usage: error.usage,
          recovered: true,
        };
      }
    };

    const candidates: { image: string; type: string }[] = [
      { image: imageBase64, type: mediaType },
    ];
    if (imageBase64 !== originalImage) {
      candidates.push({ image: originalImage, type: originalMediaType });
    }

    let analysis = await runModel(candidates[0].image, candidates[0].type);

    // A bad rotation, an unnecessary rescale or plain model variance can make an
    // otherwise readable photo unreadable. Retry at most once before UNKNOWN.
    if (analysis.output.status === 'UNKNOWN' && candidates.length > 1) {
      console.log('[analyze] retrying vision scan with the original image');
      analysis = await runModel(candidates[1].image, candidates[1].type);
    } else if (analysis.output.status === 'UNKNOWN') {
      console.log('[analyze] retrying vision scan after UNKNOWN');
      analysis = await runModel(candidates[0].image, candidates[0].type);
    }

    const output = sanitizeAnalysis(analysis.output, locale);
    const usage = analysis.usage;
    const recovered = analysis.recovered;

    // Keep the summary consistent with the corrected status and flags, e.g. do
    // not keep saying 五辛 after the 薑 flag was removed.
    const signature = (flags: AnalysisResult['flaggedIngredients']) =>
      flags.map((flag) => `${flag.category}:${flag.name}`).join('|');
    const corrected =
      analysis.output.status !== output.status ||
      signature(analysis.output.flaggedIngredients) !== signature(output.flaggedIngredients) ||
      analysis.output.ingredients.length !== output.ingredients.length;

    if (corrected) {
      output.summary = summarizeStatus(output.status, locale);
      console.log('[analyze] summary corrected', {
        from: analysis.output.status,
        to: output.status,
      });
    }


    // A cached UNKNOWN would keep a blurry photo from ever being retried.
    if (output.status !== 'UNKNOWN') await cacheSet(cacheKey, output);

    console.log('[analyze] completed', {
      path: useText ? 'text' : 'vision',
      model: modelName,
      locale,
      status: output.status,
      recovered,
      inputTokens: usage?.inputTokens ?? null,
      cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    });

    const debugUsage =
      process.env.ANALYZE_DEBUG === '1'
        ? {
            usage: {
              inputTokens: usage?.inputTokens ?? 0,
              cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
            },
          }
        : {};

    return jsonResponse(
      { ...output, model: modelName, cached: false, quota: reservation.quota, ...debugUsage },
      200,
      reservation.quota
    );
  } catch (error) {
    console.error(error);

    let quota: QuotaSnapshot | null = reservation?.quota ?? null;
    if (reservation?.allowed) {
      try {
        await refundQuota(userId, reservation.dayKey);
        quota = await getQuota(userId);
      } catch (refundError) {
        console.error('[analyze] could not refund quota', refundError);
      }
    }

    const message =
      error instanceof Error && error.message.includes('API key')
        ? API_ERRORS[locale].invalidKey
        : API_ERRORS[locale].failed;
    return jsonResponse({ error: message, ...(quota ? { quota } : {}) }, 500, quota);
  }
}

