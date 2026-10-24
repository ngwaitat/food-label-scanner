import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

const ROOT = path.resolve('bench');
const SAMPLES = path.join(ROOT, 'samples');
const RESULTS = path.join(ROOT, 'results');

const labels = JSON.parse(await readFile(path.join(SAMPLES, 'labels.json'), 'utf8'));
await mkdir(path.join(RESULTS, 'tessdata'), { recursive: true });

const worker = await createWorker(['chi_tra', 'chi_sim', 'eng'], 1, {
  cachePath: path.join(RESULTS, 'tessdata'),
  logger: () => {},
});

const results = [];
for (const label of labels) {
  const started = Date.now();
  try {
    const { data } = await worker.recognize(path.join(SAMPLES, label.file));
    const text = (data.text ?? '').trim();
    const confidence = typeof data.confidence === 'number' ? data.confidence / 100 : null;
    results.push({
      id: label.id,
      file: label.file,
      text,
      confidence,
      ms: Date.now() - started,
    });
    console.log(`${label.id}: ${text.length} chars, conf=${confidence?.toFixed(3)} (${Date.now() - started}ms)`);
  } catch (error) {
    results.push({
      id: label.id,
      file: label.file,
      text: '',
      confidence: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`${label.id}: failed`, error);
  }
}

await worker.terminate();
await writeFile(
  path.join(RESULTS, 'tesseract.json'),
  JSON.stringify({ engine: 'tesseract', langs: ['chi_tra', 'chi_sim', 'eng'], results }, null, 2),
  'utf8'
);
console.log(`\nwrote ${path.join(RESULTS, 'tesseract.json')}`);
