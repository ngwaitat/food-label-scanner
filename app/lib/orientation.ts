import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import { cacheGet, cacheSet, hashKey } from './cache';

const RotationSchema = z.object({
  textDirection: z.enum(['upright', 'clockwise90', 'counterclockwise90', 'upsideDown']),
});

// Correction to apply (clockwise degrees) for the direction the text is printed in.
const CORRECTION: Record<z.infer<typeof RotationSchema>['textDirection'], number> = {
  upright: 0,
  clockwise90: 270,
  counterclockwise90: 90,
  upsideDown: 180,
};

const PROBE_MAX_EDGE = 768;
// The vision model reads dense label print best at this size. Phone photos that
// arrive smaller lose detail, so upscale them (at most 2x).
const TARGET_LONG_EDGE = 1600;
const MAX_UPSCALE = 2;

export interface NormalizedImage {
  imageBase64: string;
  rotation: number;
  changed: boolean;
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

function render(
  image: Awaited<ReturnType<typeof loadImage>>,
  rotation: number,
  scale: number
): string {
  const rotatedWidth = rotation === 90 || rotation === 270 ? image.height : image.width;
  const rotatedHeight = rotation === 90 || rotation === 270 ? image.width : image.height;
  const canvas = createCanvas(
    Math.max(1, Math.round(rotatedWidth * scale)),
    Math.max(1, Math.round(rotatedHeight * scale))
  );
  const ctx = canvas.getContext('2d');

  if (rotation === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (rotation === 270) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0);

  return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 90).toString('base64')}`;
}

async function detectRotation(
  image: Awaited<ReturnType<typeof loadImage>>,
  model: LanguageModel,
  cacheKey: string
): Promise<number> {
  const cached = await cacheGet<{ rotation: number }>(cacheKey).catch(() => null);
  if (cached) return cached.rotation;

  const probeScale = Math.min(1, PROBE_MAX_EDGE / Math.max(image.width, image.height));
  const probeCanvas = createCanvas(
    Math.max(1, Math.round(image.width * probeScale)),
    Math.max(1, Math.round(image.height * probeScale))
  );
  probeCanvas.getContext('2d').drawImage(image, 0, 0, probeCanvas.width, probeCanvas.height);
  const probeUrl = `data:image/jpeg;base64,${probeCanvas
    .toBuffer('image/jpeg', 75)
    .toString('base64')}`;

  let rotation = 0;
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: RotationSchema }),
      temperature: 0,
      maxOutputTokens: 64,
      providerOptions: { deepseek: { thinking: { type: 'disabled' as const } } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Look at the main product label where the ingredients are printed. Describe how that text is oriented in the image: "upright" if it reads normally, "clockwise90" if it is rotated 90° clockwise, "counterclockwise90" if it is rotated 90° counter-clockwise, or "upsideDown" if it is rotated 180°. Ignore barcodes, logos and small vertical side text.',
            },
            { type: 'file', mediaType: 'image/jpeg', data: probeUrl },
          ],
        },
      ],
    });
    rotation = CORRECTION[output.textDirection];
  } catch {
    return 0;
  }

  await cacheSet(cacheKey, { rotation });
  return rotation;
}

// Photos shared through messaging apps often arrive rotated by 90° or 180° with
// no EXIF orientation, and the vision model then misreads the small print (and
// invents ingredients). Normalise the pixels to upright, 1600px input instead.
export async function normalizeImage(
  imageBase64: string,
  model: LanguageModel,
  cacheKeyPrefix: string
): Promise<NormalizedImage> {
  let image;
  try {
    image = await loadImage(Buffer.from(stripDataUrl(imageBase64), 'base64'));
  } catch {
    return { imageBase64, rotation: 0, changed: false };
  }

  const rotation = await detectRotation(
    image,
    model,
    `${cacheKeyPrefix}:orientation:${hashKey(imageBase64)}`
  );

  const rotatedWidth = rotation === 90 || rotation === 270 ? image.height : image.width;
  const rotatedHeight = rotation === 90 || rotation === 270 ? image.width : image.height;
  const longEdge = Math.max(rotatedWidth, rotatedHeight);
  const scale = Math.min(TARGET_LONG_EDGE / Math.max(longEdge, 1), MAX_UPSCALE);

  const unchanged = rotation === 0 && Math.abs(longEdge - TARGET_LONG_EDGE) <= 1;
  if (unchanged) return { imageBase64, rotation: 0, changed: false };

  try {
    return { imageBase64: render(image, rotation, scale), rotation, changed: true };
  } catch {
    return { imageBase64, rotation: 0, changed: false };
  }
}
