import type { Locale, Status } from './i18n';

export interface FlaggedIngredient {
  name: string;
  category: string;
  reason: string;
}

export interface IngredientItem {
  name: string;
  translation?: string;
}

export interface AnalysisResult {
  status: Status;
  summary: string;
  ingredients?: IngredientItem[];
  flaggedIngredients: FlaggedIngredient[];
  model?: string;
  cached?: boolean;
}

export interface StoredScan {
  id: string;
  createdAt: number;
  image: string;
  locale: Locale;
  result: AnalysisResult;
}
