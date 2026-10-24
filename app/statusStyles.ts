import type { Status } from './i18n';

export const STATUS_STYLES: Record<Status, string> = {
  VEGAN: 'bg-green-100 text-green-800',
  OVO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  LACTO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  LACTO_OVO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  PUNGENT_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  NON_VEGETARIAN: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-800',
};
