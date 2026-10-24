'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Check, Globe, Info, Loader2, Search, Share2 } from 'lucide-react';
import { LOCALE_COOKIE, LOCALE_OPTIONS, STRINGS, type Locale } from './i18n';
import HistoryList from './HistoryList';
import { buildShareCard } from './shareCard';
import { STATUS_STYLES } from './statusStyles';
import type { AnalyzeResponse, AnalysisResult, QuotaSnapshot, StoredScan } from './types';
import { useScanHistory } from './useScanHistory';
import ZoomModal from './ZoomModal';
import InfoDialog from './InfoDialog';

const CATEGORY_ORDER = ['MEAT', 'FISH_SEAFOOD', 'DAIRY', 'EGG', 'ADDITIVE', 'FIVE_PUNGENT', 'OTHER'];

interface ScannerProps {
  initialLocale: Locale;
}

function readFileAsDataURL(file: File, errorMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}

function createScanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function canShareFiles(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export default function Scanner({ initialLocale }: ScannerProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const {
    items: history,
    available: historyAvailable,
    save: saveScan,
    clear: clearHistory,
  } = useScanHistory();
  const t = STRINGS[locale];
  const exhausted = quota?.remaining === 0;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  useEffect(() => {
    if (scrollRequest === 0) return;
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollRequest]);

  useEffect(() => {
    if (!shareMessage) return;
    const timer = window.setTimeout(() => setShareMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [shareMessage]);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/quota', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as QuotaSnapshot;
      setQuota(data);
    } catch (error) {
      console.error('[quota] could not load daily usage', error);
    }
  }, []);

  useEffect(() => {
    void refreshQuota();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshQuota();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshQuota]);

  useEffect(() => {
    if (!quota) return;
    const delay = quota.resetsAt - Date.now();
    if (delay <= 0) return;

    const timer = window.setTimeout(() => void refreshQuota(), delay + 1000);
    return () => window.clearTimeout(timer);
  }, [quota, refreshQuota]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (quota && quota.remaining <= 0) {
      input.value = '';
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setShareMessage(null);

    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 1024,
        initialQuality: 0.8,
        useWebWorker: true,
      });

      const base64Data = await readFileAsDataURL(compressedFile, t.readImageError);
      setPreview(base64Data);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, locale }),
      });

      const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;

      if (data?.quota) setQuota(data.quota);

      if (!res.ok) {
        throw new Error(data?.error ?? t.genericError);
      }

      const analysis = data as AnalysisResult;
      setResult(analysis);
      void saveScan({
        id: createScanId(),
        createdAt: Date.now(),
        image: base64Data,
        locale,
        result: analysis,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t.genericError);
    } finally {
      setLoading(false);
      input.value = '';
    }
  };

  const handleOpenScan = (scan: StoredScan) => {
    if (loading) return;

    setLocale(scan.locale);
    setPreview(scan.image);
    setResult(scan.result);
    setError(null);
    setShareMessage(null);
    setMenuOpen(false);
    setInfoOpen(false);
    setViewerOpen(false);
    setScrollRequest((value) => value + 1);
  };

  const handleClearHistory = () => {
    if (window.confirm(t.confirmClearHistory)) {
      void clearHistory();
    }
  };

  const handleShare = async () => {
    if (!result || !preview || sharing) return;

    setSharing(true);
    setShareMessage(null);

    let blob: Blob | null = null;
    const text = `${t.title}\n${t.statusLabels[result.status]} — ${result.summary}\n\n${window.location.origin}`;

    try {
      blob = await buildShareCard({
        image: preview,
        logo: '/logo.jpg',
        appTitle: t.title,
        status: result.status,
        statusLabel: t.statusLabels[result.status],
        summary: result.summary,
        flaggedHeading: t.flagged,
        flagged: result.flaggedIngredients.slice(0, 3).map((item) => ({
          name: item.name,
          categoryLabel: t.categoryLabels[item.category] ?? item.category,
        })),
        origin: window.location.origin,
        viaLabel: t.shareVia,
        locale,
      });

      const file = new File([blob], 'food-label.png', { type: 'image/png' });

      if (typeof navigator.share === 'function' && canShareFiles(file)) {
        await navigator.share({ files: [file], title: t.title, text });
        return;
      }

      downloadBlob(blob, 'food-label.png');
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        console.error('[share] could not copy text', error);
      }
      setShareMessage(t.shareFallback);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;

      console.error('[share] failed', error);
      if (blob) {
        downloadBlob(blob, 'food-label.png');
        setShareMessage(t.shareFallback);
      } else {
        setShareMessage(t.shareError);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="relative max-w-md mx-auto p-4 space-y-6 font-sans">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={t.language}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className="absolute top-4 right-4 p-2 rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
      >
        <Globe className="w-5 h-5" />
      </button>

      <div className="flex justify-center items-start gap-2 pt-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" className="w-20 h-20 rounded-2xl object-cover shadow-sm" />
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label={t.info}
          className="p-2 rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <h1 className="text-2xl font-bold text-center">{t.title}</h1>

      {/* Camera / File Input */}
      <div className="flex flex-col items-center gap-4 border-2 border-dashed border-gray-300 p-6 rounded-xl">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageUpload}
          className="hidden"
          id="camera-input"
          disabled={loading || exhausted}
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="gallery-input"
          disabled={loading || exhausted}
        />
        {loading ? (
          <div className="flex items-center gap-2 text-emerald-700 font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            {t.analyzing}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <label
              htmlFor="camera-input"
              aria-disabled={exhausted}
              className={`px-6 py-3 rounded-lg font-medium text-white text-center bg-emerald-600 transition ${
                exhausted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-700'
              }`}
            >
              {t.snap}
            </label>
            <label
              htmlFor="gallery-input"
              aria-disabled={exhausted}
              className={`px-6 py-3 rounded-lg font-medium text-white text-center bg-emerald-600 transition ${
                exhausted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-700'
              }`}
            >
              {t.uploadPhoto}
            </label>
          </div>
        )}
      </div>

      {quota && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-center text-xs ${
            exhausted
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {exhausted ? t.quotaExhausted(quota.limit) : t.quotaRemaining(quota.remaining, quota.limit)}
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {/* Image Preview */}
      {preview && (
        <div ref={previewRef} className="relative w-full h-48 rounded-lg overflow-hidden border bg-slate-100">
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label={t.zoomHint}
            className="w-full h-full block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={t.previewAlt} className="w-full h-full object-cover" />
            <span className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 text-white">
              <Search className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}

      {/* Analysis Output */}
      {result && (
        <div className="space-y-4 p-4 rounded-xl border bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">{t.status}</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[result.status]}`}
            >
              {t.statusLabels[result.status]}
            </span>
          </div>

          <p className="text-sm text-gray-600">{result.summary}</p>

          {result.ingredients && result.ingredients.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-gray-500 uppercase">{t.ingredients}</h3>
              <ul className="space-y-1">
                {result.ingredients.map((item, idx) => {
                  const translation = item.translation?.trim() ?? '';
                  const showTranslation = translation !== '' && translation !== item.name.trim();
                  return (
                    <li key={idx} className="text-xs bg-white p-2 rounded border text-gray-700">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {showTranslation && (
                        <span className="block mt-0.5 text-gray-500">{translation}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {result.flaggedIngredients?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase">{t.flagged}</h3>
              {CATEGORY_ORDER.map((cat) => {
                const items = result.flaggedIngredients.filter((item) => item.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="space-y-1">
                    <h4 className="text-xs font-semibold text-gray-700">
                      {t.categoryLabels[cat] ?? cat}
                    </h4>
                    <ul className="space-y-1">
                      {items.map((item, idx) => (
                        <li key={idx} className="text-xs bg-white p-2 rounded border text-gray-700">
                          <span className="font-bold text-gray-900">{item.name}</span>
                          {locale === 'en' ? `: ${item.reason}` : `：${item.reason}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing || !preview}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Share2 className="h-4 w-4" />
              {sharing ? t.sharing : t.share}
            </button>
            {shareMessage && (
              <p className="text-center text-xs text-gray-500">{shareMessage}</p>
            )}
          </div>
        </div>
      )}

      {historyAvailable && (
        <HistoryList
          items={history}
          locale={locale}
          disabled={loading}
          onOpen={handleOpenScan}
          onClear={handleClearHistory}
        />
      )}

      {/* Language Modal */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-lg w-72 max-w-[90vw] p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t.language}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-500 mb-2">{t.language}</h2>
            <ul className="space-y-1">
              {LOCALE_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      setLocale(option.value);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                      locale === option.value
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{option.label}</span>
                    {locale === option.value && <Check className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Zoom Viewer */}
      {preview && viewerOpen && (
        <ZoomModal
          src={preview}
          alt={t.previewAlt}
          locale={locale}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Info Dialog */}
      {infoOpen && <InfoDialog locale={locale} onClose={() => setInfoOpen(false)} />}
    </main>
  );
}
