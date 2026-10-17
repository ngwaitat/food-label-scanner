export type Locale = 'en' | 'zh-Hant' | 'zh-Hans';

export const DEFAULT_LOCALE: Locale = 'zh-Hant';

export const LOCALE_COOKIE = 'foodscanner-locale';

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'zh-Hans', label: '简体中文' },
];

export const ANALYSIS_LANGUAGE: Record<Locale, string> = {
  en: 'English',
  'zh-Hant': 'Traditional Chinese (繁體中文, Hong Kong usage)',
  'zh-Hans': 'Simplified Chinese (简体中文)',
};

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh-Hant' || value === 'zh-Hans';
}

export interface Strings {
  title: string;
  upload: string;
  analyzing: string;
  status: string;
  flagged: string;
  previewAlt: string;
  readImageError: string;
  genericError: string;
  language: string;
  statusLabels: Record<'VEGAN' | 'VEGETARIAN' | 'NON_VEGETARIAN' | 'UNKNOWN', string>;
  categoryLabels: Record<string, string>;
}

export const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Food Label Scanner',
    upload: 'Snap or Upload Label',
    analyzing: 'Analyzing...',
    status: 'Status:',
    flagged: 'Flagged Ingredients',
    previewAlt: 'Label preview',
    readImageError: 'Could not read the image',
    genericError: 'Something went wrong',
    language: 'Language',
    statusLabels: {
      VEGAN: 'Vegan',
      VEGETARIAN: 'Vegetarian',
      NON_VEGETARIAN: 'Non-vegetarian',
      UNKNOWN: 'Unknown',
    },
    categoryLabels: {
      MEAT: 'Meat',
      FISH_SEAFOOD: 'Fish & Seafood',
      DAIRY: 'Dairy',
      EGG: 'Egg',
      ADDITIVE: 'Additive',
      FIVE_PUNGENT: 'Five Pungent (五辛)',
      OTHER: 'Other',
    },
  },
  'zh-Hant': {
    title: '食品標籤掃描器',
    upload: '拍攝或上載標籤',
    analyzing: '分析中…',
    status: '狀態：',
    flagged: '需要注意的成分',
    previewAlt: '標籤預覽',
    readImageError: '無法讀取圖片',
    genericError: '發生錯誤，請再試一次',
    language: '語言',
    statusLabels: {
      VEGAN: '純素',
      VEGETARIAN: '蛋奶素',
      NON_VEGETARIAN: '非素食',
      UNKNOWN: '無法判斷',
    },
    categoryLabels: {
      MEAT: '肉類',
      FISH_SEAFOOD: '魚類及海鮮',
      DAIRY: '奶類',
      EGG: '蛋類',
      ADDITIVE: '添加劑',
      FIVE_PUNGENT: '五辛',
      OTHER: '其他',
    },
  },
  'zh-Hans': {
    title: '食品标签扫描器',
    upload: '拍摄或上传标签',
    analyzing: '分析中…',
    status: '状态：',
    flagged: '需要注意的成分',
    previewAlt: '标签预览',
    readImageError: '无法读取图片',
    genericError: '发生错误，请再试一次',
    language: '语言',
    statusLabels: {
      VEGAN: '纯素',
      VEGETARIAN: '蛋奶素',
      NON_VEGETARIAN: '非素食',
      UNKNOWN: '无法判断',
    },
    categoryLabels: {
      MEAT: '肉类',
      FISH_SEAFOOD: '鱼类及海鲜',
      DAIRY: '奶类',
      EGG: '蛋类',
      ADDITIVE: '添加剂',
      FIVE_PUNGENT: '五辛',
      OTHER: '其他',
    },
  },
};
