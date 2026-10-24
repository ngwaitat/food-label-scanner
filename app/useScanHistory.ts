'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearScans, listScans, saveScan } from './lib/history';
import type { StoredScan } from './types';

export function useScanHistory() {
  const [items, setItems] = useState<StoredScan[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setItems(await listScans());
      setAvailable(true);
    } catch (error) {
      console.error('[history] could not load scans', error);
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (scan: StoredScan) => {
      try {
        await saveScan(scan);
        await refresh();
      } catch (error) {
        console.error('[history] could not save scan', error);
      }
    },
    [refresh]
  );

  const clear = useCallback(async () => {
    try {
      await clearScans();
      setItems([]);
    } catch (error) {
      console.error('[history] could not clear scans', error);
    }
  }, []);

  return { items, available, save, clear };
}
