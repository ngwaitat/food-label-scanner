import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('bench');
const SAMPLES = path.join(ROOT, 'samples');
const RESULTS = path.join(ROOT, 'results');
const BASE = process.env.BENCH_BASE ?? 'http://localhost:3100';
const RUN = process.env.BENCH_RUN ?? '';
const suffix = RUN ? `-${RUN}` : '';

const MARKERS = [
  '奶', '蛋', '豬', '猪', '肉', '魚', '鱼', '蝦', '虾', '蟹', '蒜', '洋蔥', '洋葱',
  '蔥', '葱', '韭', '明膠', '明胶', '牛', '雞', '鸡',
  'milk', 'dairy', 'egg', 'pork', 'beef', 'chicken', 'fish', 'anchovy', 'shrimp',
  'crab', 'garlic', 'onion', 'leek', 'chive', 'gelatin', 'honey', 'whey', 'butter', 'cheese',
];

function normalize(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function cer(groundTruth, actual) {
  const gt = normalize(groundTruth);
  const text = normalize(actual);
  return levenshtein(gt, text) / Math.max(gt.length, 1);
}

async function analyze(body) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { http: res.status, data, ms: Date.now() - started };
  } catch (error) {
    return {
      http: 0,
      data: { error: error instanceof Error ? error.message : String(error) },
      ms: Date.now() - started,
    };
  }
}

const labels = JSON.parse(await readFile(path.join(SAMPLES, 'labels.json'), 'utf8'));
const engines = {};
for (const name of ['tesseract', 'rapidocr']) {
  const payload = JSON.parse(await readFile(path.join(RESULTS, `${name}.json`), 'utf8'));
  engines[name] = new Map(payload.results.map((entry) => [entry.id, entry]));
}

await mkdir(RESULTS, { recursive: true });

const rows = [];
for (const label of labels) {
  const image = await readFile(path.join(SAMPLES, label.file));
  const imageBase64 = `data:image/jpeg;base64,${image.toString('base64')}`;
  const vision = await analyze({ imageBase64, locale: label.locale });
  const visionStatus = vision.http === 200 ? vision.data?.status : `HTTP_${vision.http}`;

  const groundTruth = normalize(label.text);
  const expectedMarkers = MARKERS.filter((marker) => groundTruth.includes(normalize(marker)));

  const perEngine = {};
  for (const [name, map] of Object.entries(engines)) {
    const ocr = map.get(label.id);
    const text = ocr?.text ?? '';
    if (!text.trim()) {
      perEngine[name] = {
        ...ocr,
        cer: 1,
        markerRecall: 0,
        textPath: { http: 0, status: 'NO_TEXT', ms: 0 },
      };
      continue;
    }

    const ocrNorm = normalize(text);
    const preserved = expectedMarkers.filter((marker) => ocrNorm.includes(normalize(marker)));
    const textPath = await analyze({
      locale: label.locale,
      ocrText: text,
      ocrConfidence: ocr.confidence ?? undefined,
    });

    perEngine[name] = {
      ...ocr,
      cer: cer(label.text, text),
      markers: { expected: expectedMarkers, preserved },
      markerRecall: expectedMarkers.length ? preserved.length / expectedMarkers.length : 1,
      textPath: {
        http: textPath.http,
        status: textPath.http === 200 ? textPath.data?.status : `HTTP_${textPath.http}`,
        error: textPath.http === 200 ? undefined : textPath.data?.error,
        ms: textPath.ms,
        cached: textPath.data?.cached ?? null,
      },
    };
  }

  rows.push({
    id: label.id,
    locale: label.locale,
    expected: label.expected,
    hard: label.hard,
    vision: {
      status: visionStatus,
      correct: visionStatus === label.expected,
      http: vision.http,
      ms: vision.ms,
      cached: vision.data?.cached ?? null,
      error: vision.http === 200 ? undefined : vision.data?.error,
    },
    engines: perEngine,
  });

  const parts = [`${label.id.padEnd(22)} exp=${label.expected.padEnd(24)} vision=${String(visionStatus).padEnd(24)}`];
  for (const [name, result] of Object.entries(perEngine)) {
    const status = result.textPath?.status ?? 'NO_TEXT';
    parts.push(
      `${name}: ${String(status).padEnd(24)} cer=${result.cer.toFixed(3)} conf=${
        result.confidence === null || result.confidence === undefined
          ? 'n/a'
          : result.confidence.toFixed(2)
      }`
    );
  }
  console.log(parts.join(' | '));
}

await writeFile(
  path.join(RESULTS, `report${suffix}.json`),
  JSON.stringify({ base: BASE, run: RUN || 'default', generatedAt: new Date().toISOString(), rows }, null, 2),
  'utf8'
);

const summary = {};
summary.vision = {
  correct: rows.filter((row) => row.vision.correct).length,
  total: rows.length,
  meanMs: Math.round(rows.reduce((sum, row) => sum + row.vision.ms, 0) / rows.length),
};

for (const name of Object.keys(engines)) {
  const entries = rows.map((row) => row.engines[name]).filter(Boolean);
  const attempted = entries.filter((entry) => entry.textPath?.http !== 0);
  const accepted = attempted.filter((entry) => entry.textPath?.http === 200);
  summary[name] = {
    meanCer: +(entries.reduce((sum, entry) => sum + entry.cer, 0) / Math.max(entries.length, 1)).toFixed(3),
    meanConfidence: +(
      entries.reduce((sum, entry) => sum + (entry.confidence ?? 0), 0) / Math.max(entries.length, 1)
    ).toFixed(3),
    markerRecall: +(
      entries.reduce((sum, entry) => sum + entry.markerRecall, 0) / Math.max(entries.length, 1)
    ).toFixed(3),
    ocrMeanMs: Math.round(entries.reduce((sum, entry) => sum + (entry.ms ?? 0), 0) / Math.max(entries.length, 1)),
    accepted: accepted.length,
    attempted: attempted.length,
    acceptedAccuracy: accepted.length
      ? accepted.filter((entry) => entry.textPath.status === rows.find((row) => row.engines[name] === entry)?.expected).length
      : 0,
    agreementWithVision: accepted.filter((entry) => {
      const row = rows.find((candidate) => candidate.engines[name] === entry);
      return row && entry.textPath.status === row.vision.status;
    }).length,
  };
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(summary, null, 2));

await writeFile(
  path.join(RESULTS, `summary${suffix}.json`),
  JSON.stringify(summary, null, 2),
  'utf8'
);
console.log(`\nwrote report${suffix}.json and summary${suffix}.json`);
