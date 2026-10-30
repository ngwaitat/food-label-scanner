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

export interface OrientedImage {
  imageBase64: string;
  rotation: number;
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

function rotateImage(image: Awaited<ReturnType<typeof loadImage>>, rotation: number): string {
  const canvas =
    rotation === 180
      ? createCanvas(image.width, image.height)
      : createCanvas(image.height, image.width);
  const ctx = canvas.getContext('2d');

  if (rotation === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(image, 0, 0);

  return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 90).toString('base64')}`;
}

// Photos shared through messaging apps often arrive rotated by 90° or 180° with
// no EXIF orientation, and the vision model then misreads the small print (and
// invents ingredients). Ask the model for the printed text direction, then bake
// the correction into the pixels so the classification call sees upright text.
export async function normalizeOrientation(
  imageBase64: string,
  model: LanguageModel,
  cacheKeyPrefix: string
): Promise<OrientedImage> {
  const cacheKey = `${cacheKeyPrefix}:orientation:${hashKey(imageBase64)}`;

  let rotation = (await cacheGet<{ rotation: number }>(cacheKey).catch(() => null))?.rotation ?? null;

  if (rotation === null) {
    let image;
    try {
      image = await loadImage(Buffer.from(stripDataUrl(imageBase64), 'base64'));
    } catch {
      return { imageBase64, rotation: 0 };
    }

    const probeScale = Math.min(1, PROBE_MAX_EDGE / Math.max(image.width, image.height));
    const probeCanvas = createCanvas(
      Math.max(1, Math.round(image.width * probeScale)),
      Math.max(1, Math.round(image.height * probeScale))
    );
    probeCanvas.getContext('2d').drawImage(image, 0, 0, probeCanvas.width, probeCanvas.height);
    const probeUrl = `data:image/jpeg;base64,${probeCanvas
      .toBuffer('image/jpeg', 75)
      .toString('base64')}`;

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
                text: 'Look at the printed text on this food package. Describe how the text is oriented in the image: "upright" if it reads normally, "clockwise90" if it is rotated 90° clockwise, "counterclockwise90" if it is rotated 90° counter-clockwise, or "upsideDown" if it is rotated 180°. Judge only the printed text.',
              },
              { type: 'file', mediaType: 'image/jpeg', data: probeUrl },
            ],
          },
        ],
      });
      rotation = CORRECTION[output.textDirection];
    } catch {
      return { imageBase64, rotation: 0 };
    }

    await cacheSet(cacheKey, { rotation });
  }

  if (!rotation) return { imageBase64, rotation: 0 };

  try {
    const image = await loadImage(Buffer.from(stripDataUrl(imageBase64), 'base64'));
    return { imageBase64: rotateImage(image, rotation), rotation };
  } catch {
    return { imageBase64, rotation: 0 };
  }
}
