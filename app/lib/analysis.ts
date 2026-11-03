import { z } from 'zod';
import type { Locale, Status } from '../i18n';

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

const ANIMAL_TERMS: { category: 'DAIRY' | 'EGG' | 'MEAT' | 'FISH_SEAFOOD'; terms: string[] }[] = [
  {
    category: 'DAIRY',
    terms: [
      '牛奶', '奶粉', '奶類', '奶类', '乳粉', '乳清', '乳糖', '芝士', '起司', '奶酪', '乳酪',
      '忌廉', '奶油', '牛油', '黃油', '黄油', '煉奶', '炼奶', '淡奶', '酪蛋白', '乳製品', '乳制品',
      '雪糕', '冰淇淋', '馬斯卡彭', '马斯卡彭', '莫扎瑞拉', '車打', '车打', '帕馬森', '帕玛森',
      'milk', 'cheese', 'cream', 'butter', 'whey', 'casein', 'lactose', 'yoghurt', 'yogurt',
      'mascarpone', 'cheddar', 'mozzarella', 'parmesan', 'ghee', 'buttermilk', 'dairy',
      'icecream',
    ],
  },
  {
    category: 'EGG',
    terms: [
      '雞蛋', '鸡蛋', '蛋黃', '蛋黄', '蛋粉', '全蛋', '蛋液', '蛋清', '蛋黃醬', '蛋黄酱',
      '皮蛋', '咸蛋', '鹹蛋', 'egg', 'albumen', 'mayonnaise',
    ],
  },
  {
    category: 'MEAT',
    terms: [
      '豬', '猪', '牛肉', '雞肉', '鸡肉', '羊肉', '鴨肉', '鸭肉', '鵝肉', '鹅肉', '火腿', '煙肉',
      '烟肉', '煙燻肉', '培根', '香腸', '香肠', '肉鬆', '肉松', '肉汁', '肉類', '肉类', '明膠',
      '明胶', '魚膠', '鱼胶', '雞精', '鸡精', '雞湯', '鸡汤', '豬骨', '猪骨', '牛骨', '雞骨',
      '鸡骨', 'pork', 'beef', 'chicken', 'lamb', 'mutton', 'duck', 'goose', 'ham', 'bacon',
      'sausage', 'gelatin', 'gelatine', 'lard', 'meat', 'broth', 'stock',
    ],
  },
  {
    category: 'FISH_SEAFOOD',
    terms: [
      '魚', '鱼', '蝦', '虾', '蟹', '蜆', '蚬', '蠔', '蚝', '貝', '贝', '魷', '鱿', '海鮮', '海鲜',
      '魚露', '鱼露', '蝦醬', '虾酱', '柴魚', '柴鱼', '鰹魚', '鲣鱼', '魚粉', '鱼粉', '魚丸', '鱼丸',
      '龍蝦', '龙虾', '扇貝', '扇贝', '蜆肉', '蚬肉', 'fish', 'shrimp', 'prawn', 'crab', 'oyster',
      'clam', 'squid', 'scallop', 'anchovy', 'seafood', 'tuna', 'salmon', 'bonito', 'sardine',
      'lobster', 'mussel', 'cuttlefish', 'octopus',
    ],
  },
];

// "Coconut milk", "soy cream", "vegetarian oyster sauce" and 素蠔油 are plant-based.
const PLANT_MARKERS = [
  '植物', '素', '椰', '豆', '燕麥', '燕麦', '杏仁', '腰果', '米', '蔬菜', '花生', '可可', 'vegan',
  'vegetarian', 'plant', 'vegetable', 'coconut', 'soy', 'oat', 'almond', 'cashew', 'rice',
  'peanut', 'nut', 'cocoa', 'nondairy', 'dairyfree', 'meatfree', 'meatless', 'eggfree',
  'gelatinfree',
];

// Precautionary statements describe shared factory equipment, not ingredients.
// The vision model sometimes transcribes them into the ingredient list, which
// would otherwise be flagged as animal ingredients (e.g. "produced in a factory
// where crustacean, egg, fish, peanut, milk and tree nut products are also
// handled"). A plain "Contains: milk" declaration is not matched here because
// it names a real ingredient.
const PRECAUTIONARY_PATTERNS: RegExp[] = [
  /\bmay (?:also )?contain\b/i,
  /\btraces? of\b/i,
  /\bproduced in a (?:factory|facility|plant)\b/i,
  /\bmanufactured in a (?:factory|facility|plant)\b/i,
  /\balso (?:handled|processed|packed|produced)\b/i,
  /\bshared (?:equipment|facility|production)\b/i,
  /\bsame (?:factory|facility|equipment|production line)\b/i,
  /可能(?:亦)?含有?/,
  /含(?:有)?微量/,
  /廠房|厂房|生產線|生产线|工場|工场/,
];

function isPrecautionaryStatement(value: string): boolean {
  return PRECAUTIONARY_PATTERNS.some((pattern) => pattern.test(value));
}

const WARNING_ANIMAL_HINTS = [
  '蛋', '奶', '乳', '肉', '甲殼', '甲壳', '魚', '鱼', '蝦', '虾', '蟹', '貝', '贝',
  'egg', 'fish', 'milk', 'dairy', 'meat', 'shellfish', 'crustacean', 'seafood',
];

const FLAG_REASONS: Record<Locale, Record<'DAIRY' | 'EGG' | 'MEAT' | 'FISH_SEAFOOD', string>> = {
  en: {
    DAIRY: 'Dairy ingredient named on the label.',
    EGG: 'Egg ingredient named on the label.',
    MEAT: 'Meat ingredient named on the label.',
    FISH_SEAFOOD: 'Fish or seafood ingredient named on the label.',
  },
  'zh-Hant': {
    DAIRY: '標籤列明含奶類成分。',
    EGG: '標籤列明含蛋類成分。',
    MEAT: '標籤列明含肉類成分。',
    FISH_SEAFOOD: '標籤列明含魚類或海鮮成分。',
  },
  'zh-Hans': {
    DAIRY: '标签列明含奶类成分。',
    EGG: '标签列明含蛋类成分。',
    MEAT: '标签列明含肉类成分。',
    FISH_SEAFOOD: '标签列明含鱼类或海鲜成分。',
  },
};

// Used when post-processing overrides the model, so the summary cannot keep
// claiming 五辛 or an animal ingredient that was just removed.
const SUMMARY_BY_STATUS: Record<Locale, Record<Status, string>> = {
  en: {
    VEGAN: 'The ingredient list has no meat, fish, seafood, dairy, egg or 五辛, so the product is vegan.',
    OVO_VEGETARIAN: 'The ingredient list has egg but no dairy or 五辛, so the product is ovo-vegetarian.',
    LACTO_VEGETARIAN: 'The ingredient list has dairy but no egg or 五辛, so the product is lacto-vegetarian.',
    LACTO_OVO_VEGETARIAN: 'The ingredient list has dairy and egg but no 五辛, so the product is lacto-ovo vegetarian.',
    PUNGENT_VEGETARIAN: 'The ingredient list contains 五辛, so the product is vegetarian with 五辛.',
    NON_VEGETARIAN: 'The ingredient list contains meat, fish or seafood, so the product is not vegetarian.',
    UNKNOWN: 'The ingredient list could not be read reliably.',
  },
  'zh-Hant': {
    VEGAN: '配料表未見肉、魚、海鮮、奶、蛋或五辛，屬純素。',
    OVO_VEGETARIAN: '配料表含蛋但無奶或五辛，屬蛋素。',
    LACTO_VEGETARIAN: '配料表含奶類但無蛋或五辛，屬奶素。',
    LACTO_OVO_VEGETARIAN: '配料表含奶類及蛋但無五辛，屬蛋奶素。',
    PUNGENT_VEGETARIAN: '配料表含五辛，屬植物五辛素。',
    NON_VEGETARIAN: '配料表含肉類、魚或海鮮，屬非素食。',
    UNKNOWN: '未能可靠讀取成分表。',
  },
  'zh-Hans': {
    VEGAN: '配料表未见肉、鱼、海鲜、奶、蛋或五辛，属纯素。',
    OVO_VEGETARIAN: '配料表含蛋但无奶或五辛，属蛋素。',
    LACTO_VEGETARIAN: '配料表含奶类但无蛋或五辛，属奶素。',
    LACTO_OVO_VEGETARIAN: '配料表含奶类及蛋但无五辛，属蛋奶素。',
    PUNGENT_VEGETARIAN: '配料表含五辛，属植物五辛素。',
    NON_VEGETARIAN: '配料表含肉类、鱼或海鲜，属非素食。',
    UNKNOWN: '未能可靠读取成分表。',
  },
};

export function summarizeStatus(status: Status, locale: Locale): string {
  return SUMMARY_BY_STATUS[locale][status];
}

function isMistakenPungent(flag: FlaggedIngredient): boolean {
  if (flag.category !== 'FIVE_PUNGENT') return false;  const name = normalizeIngredient(flag.name);
  return NOT_PUNGENT.some((term) => name.includes(normalizeIngredient(term)));
}

function isPlantBased(name: string): boolean {
  return PLANT_MARKERS.some((marker) => name.includes(normalizeIngredient(marker)));
}

function mentionsAnimalIngredient(value: string): boolean {
  const name = normalizeIngredient(value);
  // Warning statements list categories ("egg", "魚類"), so bare category words
  // count here even though they are too broad for ingredient matching.
  return (
    ANIMAL_TERMS.some(({ terms }) =>
      terms.some((term) => name.includes(normalizeIngredient(term)))
    ) ||
    WARNING_ANIMAL_HINTS.some((hint) => name.includes(normalizeIngredient(hint)))
  );
}

// The model reads the list but occasionally forgets to flag an obvious dairy,
// egg, meat or seafood entry (e.g. "Mascarpone Cheese"). Recover those flags
// deterministically so the status cannot contradict the transcribed list.
function addMissingAnimalFlags(
  ingredients: AnalysisResult['ingredients'],
  existing: FlaggedIngredient[],
  locale: Locale
): FlaggedIngredient[] {
  const present = new Set(existing.map((flag) => normalizeIngredient(flag.name)));
  const added = [...existing];

  for (const item of ingredients) {
    const name = normalizeIngredient(item.name);
    if (!name || present.has(name)) continue;

    const plant = isPlantBased(name);
    for (const { category, terms } of ANIMAL_TERMS) {
      if (plant) continue;
      if (!terms.some((term) => name.includes(normalizeIngredient(term)))) continue;
      added.push({ name: item.name, category, reason: FLAG_REASONS[locale][category] });
      present.add(name);
      break;
    }
  }

  return added;
}

// The model sometimes invents ingredients (and flags to match) when the print is
// small or blurred, e.g. adding 蒜/洋蔥 to a list that does not contain them.
// Drop any flag that the transcribed list itself does not support, deduplicate,
// and keep the status consistent with the flags that survive.
export function sanitizeAnalysis(result: AnalysisResult, locale: Locale): AnalysisResult {
  const seen = new Set<string>();
  const ingredients: AnalysisResult['ingredients'] = [];
  let droppedAnimalWarning = false;
  for (const item of result.ingredients) {
    if (isPrecautionaryStatement(item.name)) {
      if (mentionsAnimalIngredient(item.name)) droppedAnimalWarning = true;
      continue;
    }
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

  const allFlags = addMissingAnimalFlags(ingredients, flagged, locale);

  let status = result.status;
  const animal = allFlags.some(
    (flag) => flag.category === 'MEAT' || flag.category === 'FISH_SEAFOOD'
  );

  if (animal) {
    status = 'NON_VEGETARIAN';
  } else if (status === 'NON_VEGETARIAN') {
    // Keep an unexplained NON_VEGETARIAN as a conservative warning. Override it
    // only when a removed precautionary statement named an animal product, since
    // that statement can be the sole reason the model saw fish, egg or dairy.
    if (droppedAnimalWarning) {
      status = allFlags.length > 0 ? statusFromFlags(allFlags) : 'VEGAN';
    }
  } else if (allFlags.length > 0) {
    status = statusFromFlags(allFlags);
  } else if (status === 'PUNGENT_VEGETARIAN') {
    status = 'VEGAN';
  }

  return { ...result, status, ingredients, flaggedIngredients: allFlags };
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
