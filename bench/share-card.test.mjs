import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildShareCard } from '../app/shareCard.ts';

const RESULTS = path.resolve('bench/results');
await mkdir(RESULTS, { recursive: true });

class MockImage {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.width = 0;
    this.height = 0;
    this.native = null;
  }

  set src(value) {
    const dataMatch = /^data:([^;]+);base64,(.*)$/s.exec(value);
    const source = dataMatch ? Buffer.from(dataMatch[2], 'base64') : value;
    loadImage(source)
      .then((image) => {
        this.native = image;
        this.width = image.width;
        this.height = image.height;
        this.onload?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.Image = MockImage;
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unexpected element: ${tag}`);

    const canvas = createCanvas(1080, 1350);
    const originalGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = (type) => {
      const ctx = originalGetContext(type);
      const originalDrawImage = ctx.drawImage.bind(ctx);
      ctx.drawImage = (image, ...args) =>
        originalDrawImage(image?.native ?? image, ...args);
      return ctx;
    };
    canvas.toBlob = (callback) =>
      callback(new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }));
    return canvas;
  },
};

const imageData = `data:image/jpeg;base64,${(
  await readFile('bench/samples/02-lacto-zh.jpg')
).toString('base64')}`;
const logoData = `data:image/jpeg;base64,${(
  await readFile('public/logo.jpg')
).toString('base64')}`;

const cards = [
  {
    name: 'share-en.png',
    input: {
      image: imageData,
      logo: logoData,
      appTitle: 'Vegan & Vegetarian Scanner',
      status: 'LACTO_VEGETARIAN',
      statusLabel: 'Lacto-vegetarian',
      summary:
        'Contains dairy solids but no egg or five pungent vegetables, so it is lacto-vegetarian. No meat, fish, or seafood is present.',
      flaggedHeading: 'Flagged Ingredients',
      flagged: [
        { name: '奶類固體', categoryLabel: 'Dairy' },
        { name: '人工香料', categoryLabel: 'Additive' },
        { name: '乳化劑', categoryLabel: 'Additive' },
      ],
      origin: 'https://food-label-scanner.vercel.app',
      viaLabel: 'via',
      locale: 'en',
    },
  },
  {
    name: 'share-zh.png',
    input: {
      image: imageData,
      logo: logoData,
      appTitle: '素食標籤掃描器',
      status: 'LACTO_VEGETARIAN',
      statusLabel: '奶素',
      summary: '此產品含奶類固體，屬奶素食。未見肉類、魚類、海鮮、蛋或五辛。',
      flaggedHeading: '需要注意的成分',
      flagged: [
        { name: '奶類固體', categoryLabel: '奶類' },
        { name: '人工香料', categoryLabel: '添加劑' },
        { name: '乳化劑', categoryLabel: '添加劑' },
      ],
      origin: 'https://food-label-scanner.vercel.app',
      viaLabel: '來自',
      locale: 'zh-Hant',
    },
  },
];

for (const { name, input } of cards) {
  const blob = await buildShareCard(input);
  const buffer = Buffer.from(await blob.arrayBuffer());
  await writeFile(path.join(RESULTS, name), buffer);
  console.log(`${name}: ${buffer.length} bytes`);
}
