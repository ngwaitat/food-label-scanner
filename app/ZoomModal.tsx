'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { STRINGS, type Locale } from './i18n';

interface ZoomModalProps {
  src: string;
  alt: string;
  locale: Locale;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export default function ZoomModal({ src, alt, locale, onClose }: ZoomModalProps) {
  const t = STRINGS[locale];
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; pos: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const map = pointersRef.current;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (map.size === 2) {
      const [p1, p2] = Array.from(map.values());
      pinchRef.current = { dist: Math.hypot(p2.x - p1.x, p2.y - p1.y), scale };
      dragRef.current = null;
    } else if (map.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, pos };
      pinchRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = pointersRef.current;
    if (!map.has(e.pointerId)) return;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (map.size === 2 && pinchRef.current) {
      const [p1, p2] = Array.from(map.values());
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (pinchRef.current.dist > 0) {
        setScale(clampScale(pinchRef.current.scale * (dist / pinchRef.current.dist)));
      }
    } else if (map.size === 1 && dragRef.current) {
      setPos({
        x: dragRef.current.pos.x + (e.clientX - dragRef.current.startX),
        y: dragRef.current.pos.y + (e.clientY - dragRef.current.startY),
      });
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const map = pointersRef.current;
    map.delete(e.pointerId);

    if (map.size === 1) {
      const remaining = Array.from(map.values())[0];
      dragRef.current = { startX: remaining.x, startY: remaining.y, pos };
      pinchRef.current = null;
    } else if (map.size === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setScale((prev) => clampScale(e.deltaY < 0 ? prev * 1.15 : prev / 1.15));
  };

  const handleDoubleClick = () => {
    if (scale > MIN_SCALE) {
      reset();
    } else {
      setScale(2);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full select-none"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        />
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setScale((prev) => clampScale(prev / 1.25))}
          aria-label={t.zoomOut}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label={t.zoomReset}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setScale((prev) => clampScale(prev * 1.25))}
          aria-label={t.zoomIn}
          className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
