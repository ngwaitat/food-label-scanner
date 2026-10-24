import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('bench');
const SAMPLES = path.join(ROOT, 'samples-1024');
const RESULTS = path.join(ROOT, 'results');
const BASE = process.env.BENCH_BASE ?? 'http://localhost:3100';

const RATES = {
  inputMiss: Number(process.env.DS_INPUT_MISS ?? 0.15),
  inputHit: Number(process.env.DS_INPUT_HIT ?? 0.003),
  output: Number(process.env.DS_OUTPUT ?? 0.6),
};

const labels = JSON.parse(await readFile(path.join(ROOT, 'samples', 'labels.json'), 'utf8'));
const rapid = JSON.parse(await readFile(path.join(RESULTS, 'rapidocr.json'), 'utf8'));
const rapidById = new Map(rapid.results.map((entry) => [entry.id, entry]));

async function call(body) {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { http: res.status, data };
}

function costOf(usage) {
  if (!usage) return 0;
  const miss = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  return (
    (miss * RATES.inputMiss +
      usage.cachedInputTokens * RATES.inputHit +
      usage.outputTokens * RATES.output) /
    1e6
  );
}

const rows = [];
for (const label of labels) {
  const image = await readFile(path.join(SAMPLES, label.file));
  const imageBase64 = `data:image/jpeg;base64,${image.toString('base64')}`;
  const ocr = rapidById.get(label.id);

  const vision = await call({ imageBase64, locale: label.locale });
  const text = await call({
    locale: label.locale,
    ocrText: ocr?.text ?? '',
    ocrConfidence: 1,
  });

  if (vision.http !== 200 || text.http !== 200) {
    console.error(`${label.id}: vision=${vision.http} text=${text.http}`, text.data?.error ?? '');
    continue;
  }

  rows.push({
    id: label.id,
    expected: label.expected,
    ocrChars: (ocr?.text ?? '').length,
    vision: { usage: vision.data.usage, status: vision.data.status, cached: vision.data.cached },
    text: { usage: text.data.usage, status: text.data.status, cached: text.data.cached },
  });
  console.log(
    `${label.id.padEnd(22)} vision in=${vision.data.usage.inputTokens} (cached ${vision.data.usage.cachedInputTokens}) out=${vision.data.usage.outputTokens} | text in=${text.data.usage.inputTokens} (cached ${text.data.usage.cachedInputTokens}) out=${text.data.usage.outputTokens}`
  );
}

function summarize(pathKey) {
  const entries = rows.map((row) => row[pathKey]);
  const n = entries.length;
  const usage = entries.map((entry) => entry.usage);
  const mean = (key) => usage.reduce((sum, item) => sum + item[key], 0) / Math.max(n, 1);
  return {
    n,
    inputTokens: +mean('inputTokens').toFixed(0),
    cachedInputTokens: +mean('cachedInputTokens').toFixed(0),
    outputTokens: +mean('outputTokens').toFixed(0),
    costPerScan: +(usage.reduce((sum, item) => sum + costOf(item), 0) / Math.max(n, 1)).toFixed(6),
    totalCost: +usage.reduce((sum, item) => sum + costOf(item), 0).toFixed(6),
    correct: entries.filter((entry, i) => entry.status === rows[i].expected).length,
    meanOcrChars: +(rows.reduce((sum, row) => sum + row.ocrChars, 0) / Math.max(n, 1)).toFixed(0),
  };
}

const visionSummary = summarize('vision');
const textSummary = summarize('text');
const ratio = visionSummary.costPerScan / textSummary.costPerScan;

const report = { ratesPerMillion: RATES, vision: visionSummary, text: textSummary, ratio, rows };
await writeFile(path.join(RESULTS, 'price.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('\n=== Per-scan averages ===');
console.log(JSON.stringify({ vision: visionSummary, text: textSummary, priceRatio: +ratio.toFixed(2) }, null, 2));
console.log(`\nwrote ${path.join(RESULTS, 'price.json')}`);
