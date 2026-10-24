import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { clearScans, listScans, saveScan } from '../app/lib/history.ts';

function makeScan(id, image, createdAt) {
  return {
    id,
    createdAt,
    image,
    locale: 'en',
    result: { status: 'VEGAN', summary: id, flaggedIngredients: [] },
  };
}

beforeEach(async () => {
  await clearScans();
});

test('lists scans newest first', async () => {
  await saveScan(makeScan('a', 'img-a', 1));
  await saveScan(makeScan('b', 'img-b', 2));
  await saveScan(makeScan('c', 'img-c', 3));

  const scans = await listScans();
  assert.deepEqual(
    scans.map((scan) => scan.id),
    ['c', 'b', 'a']
  );
});

test('the same image replaces the previous entry instead of duplicating', async () => {
  await saveScan(makeScan('a', 'same-image', 1));
  await saveScan(makeScan('b', 'same-image', 2));

  const scans = await listScans();
  assert.equal(scans.length, 1);
  assert.equal(scans[0].id, 'a');
  assert.equal(scans[0].result.summary, 'b');
  assert.ok(scans[0].createdAt > 1);
});

test('keeps at most 20 scans and drops the oldest', async () => {
  for (let i = 0; i < 25; i += 1) {
    await saveScan(makeScan(`scan-${i}`, `image-${i}`, i + 1));
  }

  const scans = await listScans();
  assert.equal(scans.length, 20);
  assert.equal(scans[0].id, 'scan-24');
  assert.equal(scans.at(-1).id, 'scan-5');
});

test('clears all scans', async () => {
  await saveScan(makeScan('a', 'img-a', 1));
  await clearScans();
  assert.deepEqual(await listScans(), []);
});
