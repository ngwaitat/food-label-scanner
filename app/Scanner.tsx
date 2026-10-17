'use client';

import React, { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Check, Globe, Info, Search } from 'lucide-react';
import { LOCALE_COOKIE, LOCALE_OPTIONS, STRINGS, type Locale, type Status } from './i18n';
import ZoomModal from './ZoomModal';
import InfoDialog from './InfoDialog';

interface FlaggedIngredient {
  name: string;
  category: string;
  reason: string;
}

interface AnalysisResult {
  status: Status;
  summary: string;
  flaggedIngredients: FlaggedIngredient[];
}

const STATUS_STYLES: Record<Status, string> = {
  VEGAN: 'bg-green-100 text-green-800',
  OVO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  LACTO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  LACTO_OVO_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  PUNGENT_VEGETARIAN: 'bg-yellow-100 text-yellow-800',
  NON_VEGETARIAN: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-800',
};

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

export default function Scanner({ initialLocale }: ScannerProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const t = STRINGS[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
      });

      const base64Data = await readFileAsDataURL(compressedFile, t.readImageError);
      setPreview(base64Data);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, locale }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? t.genericError);
      }

      setResult(data as AnalysisResult);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t.genericError);
    } finally {
      setLoading(false);
      input.value = '';
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
          disabled={loading}
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          id="gallery-input"
          disabled={loading}
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <label
            htmlFor="camera-input"
            className={`px-6 py-3 rounded-lg font-medium text-white text-center transition ${
              loading ? 'bg-emerald-400 cursor-wait' : 'bg-emerald-600 cursor-pointer hover:bg-emerald-700'
            }`}
          >
            {loading ? t.analyzing : t.snap}
          </label>
          <label
            htmlFor="gallery-input"
            className={`px-6 py-3 rounded-lg font-medium text-white text-center transition ${
              loading ? 'bg-emerald-400 cursor-wait' : 'bg-emerald-600 cursor-pointer hover:bg-emerald-700'
            }`}
          >
            {loading ? t.analyzing : t.uploadPhoto}
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {/* Image Preview */}
      {preview && (
        <div className="relative w-full h-48 rounded-lg overflow-hidden border bg-slate-100">
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
        </div>
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
