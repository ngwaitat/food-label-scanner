'use client';

import { STRINGS, type Locale } from './i18n';
import { STATUS_STYLES } from './statusStyles';
import type { StoredScan } from './types';

interface HistoryListProps {
  items: StoredScan[];
  locale: Locale;
  disabled?: boolean;
  onOpen: (scan: StoredScan) => void;
  onClear: () => void;
}

function formatDate(timestamp: number, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export default function HistoryList({
  items,
  locale,
  disabled = false,
  onOpen,
  onClear,
}: HistoryListProps) {
  if (items.length === 0) return null;
  const t = STRINGS[locale];

  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{t.history}</h2>
          <p className="text-[11px] text-gray-400">{t.historyNote}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-xs text-gray-500 transition hover:text-gray-700 disabled:opacity-50"
        >
          {t.clearHistory}
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((scan) => (
          <li key={scan.id}>
            <button
              type="button"
              onClick={() => onOpen(scan)}
              disabled={disabled}
              aria-label={t.viewScan}
              className="w-full overflow-hidden rounded-lg border bg-white text-left transition hover:border-emerald-400 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scan.image}
                alt={t.previewAlt}
                className="h-20 w-full bg-slate-100 object-cover"
              />
              <div className="space-y-1 p-2">
                <span
                  className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[scan.result.status]}`}
                >
                  {t.statusLabels[scan.result.status]}
                </span>
                <p className="text-[10px] text-gray-400">{formatDate(scan.createdAt, locale)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
