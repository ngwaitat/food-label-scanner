import { z } from 'zod';

export const AnalysisSchema = z.object({
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
  ingredients: z
    .array(
      z.object({
        name: z.string().max(160),
        translation: z.string().max(160).optional(),
      })
    )
    .max(100),
  flaggedIngredients: z
    .array(
      z.object({
        name: z.string().max(160),
        category: z.enum([
          'MEAT',
          'FISH_SEAFOOD',
          'DAIRY',
          'EGG',
          'ADDITIVE',
          'FIVE_PUNGENT',
          'OTHER',
        ]),
        reason: z.string().max(400),
      })
    )
    .max(60),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;
export type FlaggedIngredient = AnalysisResult['flaggedIngredients'][number];

export const MAX_INGREDIENTS = 40;

export function normalizeIngredient(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function statusFromFlags(
  flags: FlaggedIngredient[]
): Exclude<AnalysisResult['status'], 'UNKNOWN'> {
  const categories = new Set(flags.map((flag) => flag.category));
  if (categories.has('MEAT') || categories.has('FISH_SEAFOOD')) return 'NON_VEGETARIAN';

  const dairy = categories.has('DAIRY');
  const egg = categories.has('EGG');
  if (dairy && egg) return 'LACTO_OVO_VEGETARIAN';
  if (dairy) return 'LACTO_VEGETARIAN';
  if (egg) return 'OVO_VEGETARIAN';
  if (categories.has('FIVE_PUNGENT')) return 'PUNGENT_VEGETARIAN';
  return 'VEGAN';
}

// Seasonings that are commonly mistaken for 五辛 but are not.
const NOT_PUNGENT = [
  '胡椒', '白胡椒', '花椒', '辣椒', '薑', '姜', '白芷', '肉桂', '咖哩', '咖喱', '丁香', '八角',
  '茴香', 'pepper', 'chili', 'chilli', 'ginger', 'angelica', 'cinnamon', 'cumin', 'fennel',
  'anise', 'turmeric',
];

function isMistakenPungent(flag: FlaggedIngredient): boolean {
  if (flag.category !== 'FIVE_PUNGENT') return false;
  const name = normalizeIngredient(flag.name);
  return NOT_PUNGENT.some((term) => name.includes(normalizeIngredient(term)));
}

// The model sometimes invents ingredients (and flags to match) when the print is
// small or blurred, e.g. adding 蒜/洋蔥 to a list that does not contain them.
// Drop any flag that the transcribed list itself does not support, deduplicate,
// and keep the status consistent with the flags that survive.
export function sanitizeAnalysis(result: AnalysisResult): AnalysisResult {
  const seen = new Set<string>();
  const ingredients: AnalysisResult['ingredients'] = [];
  for (const item of result.ingredients) {
    const key = normalizeIngredient(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ingredients.push(item);
    if (ingredients.length >= MAX_INGREDIENTS) break;
  }

  const listText = ingredients.map((item) => normalizeIngredient(item.name)).join('|');
  const flagged: FlaggedIngredient[] = [];
  const seenFlags = new Set<string>();
  for (const flag of result.flaggedIngredients) {
    const key = normalizeIngredient(flag.name);
    if (!key || seenFlags.has(key)) continue;
    if (!listText.includes(key)) continue;
    if (isMistakenPungent(flag)) continue;
    seenFlags.add(key);
    flagged.push(flag);
  }

  if (!ingredients.length || result.status === 'UNKNOWN') {
    return { ...result, ingredients, status: 'UNKNOWN', flaggedIngredients: [] };
  }

  let status = result.status;
  const categories = new Set(flagged.map((flag) => flag.category));
  const animal = categories.has('MEAT') || categories.has('FISH_SEAFOOD');

  if (animal && status !== 'NON_VEGETARIAN') {
    status = 'NON_VEGETARIAN';
  } else if (status === 'NON_VEGETARIAN' && !animal) {
    status = statusFromFlags(flagged);
  } else if (status === 'VEGAN' && flagged.length > 0) {
    status = statusFromFlags(flagged);
  } else if (status === 'PUNGENT_VEGETARIAN' && !categories.has('FIVE_PUNGENT')) {
    status = statusFromFlags(flagged);
  } else if (
    (status === 'LACTO_VEGETARIAN' ||
      status === 'OVO_VEGETARIAN' ||
      status === 'LACTO_OVO_VEGETARIAN') &&
    !categories.has('DAIRY') &&
    !categories.has('EGG')
  ) {
    status = statusFromFlags(flagged);
  }

  return { ...result, status, ingredients, flaggedIngredients: flagged };
}

function closeBrackets(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') stack.pop();
  }

  if (inString) return null;

  let repaired = text;
  while (stack.length > 0) {
    repaired += stack.pop() === '{' ? '}' : ']';
  }
  return repaired;
}

// Long ingredient lists occasionally send the model into a repetition loop that
// hits the output limit and truncates the JSON. Salvage the part that is valid
// instead of failing the whole scan.
export function parseAnalysisText(text: string): AnalysisResult | null {
  const candidates = [text];
  const lastObject = text.lastIndexOf('}');
  if (lastObject > 0) candidates.push(text.slice(0, lastObject + 1));

  for (const candidate of candidates) {
    const closed = closeBrackets(candidate);
    if (!closed) continue;
    try {
      const parsed = AnalysisSchema.safeParse(JSON.parse(closed));
      if (parsed.success) return parsed.data;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
