export type Locale = 'en' | 'zh-Hant' | 'zh-Hans';

export type Status =
  | 'VEGAN'
  | 'OVO_VEGETARIAN'
  | 'LACTO_VEGETARIAN'
  | 'LACTO_OVO_VEGETARIAN'
  | 'PUNGENT_VEGETARIAN'
  | 'NON_VEGETARIAN'
  | 'UNKNOWN';

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
  snap: string;
  uploadPhoto: string;
  analyzing: string;
  status: string;
  flagged: string;
  ingredients: string;
  previewAlt: string;
  readImageError: string;
  genericError: string;
  regionBlocked: string;
  language: string;
  zoomHint: string;
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  close: string;
  info: string;
  history: string;
  historyNote: string;
  clearHistory: string;
  confirmClearHistory: string;
  quotaRemaining: (remaining: number, limit: number) => string;
  quotaExhausted: (limit: number) => string;
  viewScan: string;
  share: string;
  sharing: string;
  shareFallback: string;
  shareError: string;
  shareVia: string;
  followUs: string;
  statusLabels: Record<Status, string>;
  categoryLabels: Record<string, string>;
}

export const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Vegan & Vegetarian Scanner',
    upload: 'Snap or Upload Label',
    snap: 'Take Photo',
    uploadPhoto: 'Upload Photo',
    analyzing: 'Analyzing...',
    status: 'Status:',
    flagged: 'Flagged Ingredients',
    ingredients: 'Ingredients',
    previewAlt: 'Label preview',
    readImageError: 'Could not read the image',
    genericError: 'Something went wrong',
    regionBlocked: 'This service is currently only available in Hong Kong.',
    language: 'Language',
    zoomHint: 'View larger',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset zoom',
    close: 'Close',
    info: 'Info',
    history: 'Recent scans',
    historyNote: 'Saved on this device',
    clearHistory: 'Clear',
    confirmClearHistory: 'Delete all saved scans?',
    quotaRemaining: (remaining, limit) => `${remaining} of ${limit} scans left today`,
    quotaExhausted: (limit) =>
      `You have used all ${limit} scans for today. It resets after midnight.`,
    viewScan: 'View scan',
    share: 'Share',
    sharing: 'Preparing…',
    shareFallback: 'Share card downloaded and text copied',
    shareError: 'Could not prepare the share card',
    shareVia: 'via',
    followUs: 'Follow us',
    statusLabels: {
      VEGAN: 'Vegan',
      OVO_VEGETARIAN: 'Ovo-vegetarian',
      LACTO_VEGETARIAN: 'Lacto-vegetarian',
      LACTO_OVO_VEGETARIAN: 'Lacto-ovo vegetarian',
      PUNGENT_VEGETARIAN: 'Vegan (五辛)',
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
    title: '素食標籤掃描器',
    upload: '拍攝或上載標籤',
    snap: '拍照',
    uploadPhoto: '上載相片',
    analyzing: '分析中…',
    status: '狀態：',
    flagged: '需要注意的成分',
    ingredients: '成分',
    previewAlt: '標籤預覽',
    readImageError: '無法讀取圖片',
    genericError: '發生錯誤，請再試一次',
    regionBlocked: '本服務目前只供香港用戶使用。',
    language: '語言',
    zoomHint: '放大檢視',
    zoomIn: '放大',
    zoomOut: '縮小',
    zoomReset: '重設縮放',
    close: '關閉',
    info: '資訊',
    history: '最近掃描',
    historyNote: '只儲存在此裝置',
    clearHistory: '清除',
    confirmClearHistory: '確定清除所有已儲存的掃描？',
    quotaRemaining: (remaining, limit) => `今日尚餘 ${remaining} / ${limit} 次掃描`,
    quotaExhausted: (limit) => `今日 ${limit} 次掃描額度已用完，午夜後重置。`,
    viewScan: '查看掃描',
    share: '分享',
    sharing: '正在準備…',
    shareFallback: '分享圖已下載，文字已複製',
    shareError: '無法建立分享圖',
    shareVia: '來自',
    followUs: '追蹤我們',
    statusLabels: {
      VEGAN: '純素',
      OVO_VEGETARIAN: '蛋素',
      LACTO_VEGETARIAN: '奶素',
      LACTO_OVO_VEGETARIAN: '蛋奶素',
      PUNGENT_VEGETARIAN: '植物五辛素',
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
    title: '素食标签扫描器',
    upload: '拍摄或上传标签',
    snap: '拍照',
    uploadPhoto: '上传照片',
    analyzing: '分析中…',
    status: '状态：',
    flagged: '需要注意的成分',
    ingredients: '成分',
    previewAlt: '标签预览',
    readImageError: '无法读取图片',
    genericError: '发生错误，请再试一次',
    regionBlocked: '本服务目前只供香港用户使用。',
    language: '语言',
    zoomHint: '放大查看',
    zoomIn: '放大',
    zoomOut: '缩小',
    zoomReset: '重置缩放',
    close: '关闭',
    info: '信息',
    history: '最近扫描',
    historyNote: '只存储在此设备',
    clearHistory: '清除',
    confirmClearHistory: '确定清除所有已保存的扫描？',
    quotaRemaining: (remaining, limit) => `今日剩余 ${remaining} / ${limit} 次扫描`,
    quotaExhausted: (limit) => `今日 ${limit} 次扫描额度已用完，午夜后重置。`,
    viewScan: '查看扫描',
    share: '分享',
    sharing: '正在准备…',
    shareFallback: '分享图已下载，文字已复制',
    shareError: '无法创建分享图',
    shareVia: '来自',
    followUs: '关注我们',
    statusLabels: {
      VEGAN: '纯素',
      OVO_VEGETARIAN: '蛋素',
      LACTO_VEGETARIAN: '奶素',
      LACTO_OVO_VEGETARIAN: '蛋奶素',
      PUNGENT_VEGETARIAN: '植物五辛素',
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
