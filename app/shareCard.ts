import type { Locale, Status } from './i18n';

const WIDTH = 1080;
const HEIGHT = 1350;
const PADDING = 64;
const CONTENT_WIDTH = WIDTH - PADDING * 2;
const FONT =
  'system-ui, -apple-system, "Segoe UI", "PingFang HK", "Microsoft JhengHei", sans-serif';

const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  VEGAN: { bg: '#dcfce7', fg: '#166534' },
  OVO_VEGETARIAN: { bg: '#fef9c3', fg: '#854d0e' },
  LACTO_VEGETARIAN: { bg: '#fef9c3', fg: '#854d0e' },
  LACTO_OVO_VEGETARIAN: { bg: '#fef9c3', fg: '#854d0e' },
  PUNGENT_VEGETARIAN: { bg: '#fef9c3', fg: '#854d0e' },
  NON_VEGETARIAN: { bg: '#fee2e2', fg: '#991b1b' },
  UNKNOWN: { bg: '#f3f4f6', fg: '#374151' },
};

export interface ShareCardFlaggedItem {
  name: string;
  categoryLabel: string;
}

export interface ShareCardInput {
  image: string;
  logo?: string;
  appTitle: string;
  status: Status;
  statusLabel: string;
  summary: string;
  flaggedHeading: string;
  flagged: ShareCardFlaggedItem[];
  origin: string;
  viaLabel: string;
  locale: Locale;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

type WordSegmenter = { segment(input: string): Iterable<{ segment: string }> };
type SegmenterConstructor = new (
  locales?: string,
  options?: { granularity: 'word' }
) => WordSegmenter;

function textSegments(text: string, locale: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!Segmenter) return Array.from(text);
  try {
    return Array.from(
      new Segmenter(locale, { granularity: 'word' }).segment(text),
      (part) => part.segment
    );
  } catch {
    return Array.from(text);
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  locale: string
): string[] {
  const lines: string[] = [];
  const closingPunctuation = new Set([
    '。', '，', '、', '；', '：', '！', '？', '）', '」', '』', '】', '》', '〉', '…',
    '.', ',', ';', ':', '!', '?', ')', ']', '}',
  ]);
  let line = '';

  for (const segment of textSegments(text, locale)) {
    if (!line && !segment.trim()) continue;

    const candidate = line + segment;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line && closingPunctuation.has(segment.trim())) {
      line += segment;
      continue;
    }

    if (line.trim()) {
      lines.push(line.trimEnd());
      line = '';
    }

    if (ctx.measureText(segment).width <= maxWidth) {
      line = segment;
      continue;
    }

    for (const char of Array.from(segment)) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }

  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the share image'));
    }, 'image/png');
  });
}

export async function buildShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');

  const [labelImage, logo] = await Promise.all([
    loadImage(input.image),
    input.logo ? loadImage(input.logo).catch(() => null) : Promise.resolve(null),
  ]);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, WIDTH, 12);

  let titleX = PADDING;
  if (logo) {
    ctx.save();
    roundedRect(ctx, PADDING, 56, 88, 88, 20);
    ctx.clip();
    ctx.drawImage(logo, PADDING, 56, 88, 88);
    ctx.restore();
    titleX = PADDING + 88 + 24;
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 40px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(
    ellipsize(ctx, input.appTitle, WIDTH - PADDING - titleX),
    titleX,
    100
  );

  ctx.fillStyle = '#f1f5f9';
  roundedRect(ctx, PADDING, 180, CONTENT_WIDTH, 580, 24);
  ctx.fill();

  ctx.save();
  roundedRect(ctx, PADDING, 180, CONTENT_WIDTH, 580, 24);
  ctx.clip();
  drawContain(ctx, labelImage, PADDING, 180, CONTENT_WIDTH, 580);
  ctx.restore();

  const colors = STATUS_COLORS[input.status];
  ctx.font = `700 34px ${FONT}`;
  const pillText = ellipsize(ctx, input.statusLabel, CONTENT_WIDTH - 56);
  const pillWidth = Math.min(ctx.measureText(pillText).width + 56, CONTENT_WIDTH);
  ctx.fillStyle = colors.bg;
  roundedRect(ctx, PADDING, 792, pillWidth, 64, 32);
  ctx.fill();
  ctx.fillStyle = colors.fg;
  ctx.fillText(pillText, PADDING + 28, 792 + 32);

  ctx.fillStyle = '#334155';
  ctx.font = `400 32px ${FONT}`;
  ctx.textBaseline = 'top';
  const allSummaryLines = wrapText(ctx, input.summary, CONTENT_WIDTH, input.locale);
  const summaryLines =
    allSummaryLines.length > 3
      ? [
          ...allSummaryLines.slice(0, 2),
          ellipsize(ctx, allSummaryLines.slice(2).join(' '), CONTENT_WIDTH),
        ]
      : allSummaryLines;

  let y = 890;
  for (const line of summaryLines) {
    ctx.fillText(line, PADDING, y);
    y += 44;
  }

  if (input.flagged.length > 0) {
    y = Math.max(y + 24, 1040);
    ctx.fillStyle = '#64748b';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(input.flaggedHeading.toUpperCase(), PADDING, y);
    y += 40;

    ctx.fillStyle = '#334155';
    ctx.font = `400 28px ${FONT}`;
    for (const item of input.flagged.slice(0, 3)) {
      if (y > 1190) break;
      const line = ellipsize(ctx, `• ${item.name} — ${item.categoryLabel}`, CONTENT_WIDTH);
      ctx.fillText(line, PADDING, y);
      y += 40;
    }
  }

  const footerTop = 1210;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, footerTop, WIDTH, HEIGHT - footerTop);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, footerTop);
  ctx.lineTo(WIDTH - PADDING, footerTop);
  ctx.stroke();

  let host = input.origin;
  try {
    host = new URL(input.origin).host;
  } catch {
    host = input.origin;
  }

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#64748b';
  ctx.font = `400 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(host, WIDTH - PADDING, footerTop + 60);
  const hostWidth = ctx.measureText(host).width;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(
    ellipsize(ctx, `${input.viaLabel} ${input.appTitle}`, CONTENT_WIDTH - hostWidth - 40),
    PADDING,
    footerTop + 60
  );

  return canvasToBlob(canvas);
}
