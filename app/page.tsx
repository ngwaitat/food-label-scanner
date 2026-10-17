'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

interface FlaggedIngredient {
  name: string;
  category: string;
  reason: string;
}

interface AnalysisResult {
  status: 'VEGAN' | 'VEGETARIAN' | 'NON_VEGETARIAN' | 'UNKNOWN';
  summary: string;
  flaggedIngredients: FlaggedIngredient[];
}

const STATUS_LABELS: Record<AnalysisResult['status'], string> = {
  VEGAN: '純素',
  VEGETARIAN: '蛋奶素',
  NON_VEGETARIAN: '非素食',
  UNKNOWN: '無法判斷',
};

const CATEGORY_LABELS: Record<string, string> = {
  MEAT: '肉類',
  FISH_SEAFOOD: '魚類及海鮮',
  DAIRY_EGG: '奶類及蛋類',
  ADDITIVE: '添加劑',
  OTHER: '其他',
};

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('無法讀取圖片'));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      const base64Data = await readFileAsDataURL(compressedFile);
      setPreview(base64Data);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? '發生錯誤，請再試一次');
      }

      setResult(data as AnalysisResult);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '發生錯誤，請再試一次');
    } finally {
      setLoading(false);
      input.value = '';
    }
  };

  return (
    <main className="max-w-md mx-auto p-4 space-y-6 font-sans">
      <h1 className="text-2xl font-bold text-center">食品標籤掃描器</h1>

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
        <label
          htmlFor="camera-input"
          className={`px-6 py-3 rounded-lg font-medium text-white transition ${
            loading ? 'bg-emerald-400 cursor-wait' : 'bg-emerald-600 cursor-pointer hover:bg-emerald-700'
          }`}
        >
          {loading ? '分析中…' : '拍攝或上載標籤'}
        </label>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {/* Image Preview */}
      {preview && (
        <div className="relative w-full h-48 rounded-lg overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="標籤預覽" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Analysis Output */}
      {result && (
        <div className="space-y-4 p-4 rounded-xl border bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">狀態：</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                result.status === 'VEGAN'
                  ? 'bg-green-100 text-green-800'
                  : result.status === 'VEGETARIAN'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {STATUS_LABELS[result.status]}
            </span>
          </div>

          <p className="text-sm text-gray-600">{result.summary}</p>

          {result.flaggedIngredients?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase">需要注意的成分</h3>
              <ul className="space-y-1">
                {result.flaggedIngredients.map((item, idx) => (
                  <li key={idx} className="text-xs bg-white p-2 rounded border">
                    <span className="font-bold text-red-600">{item.name}</span>（{CATEGORY_LABELS[item.category] ?? item.category}）：{item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
