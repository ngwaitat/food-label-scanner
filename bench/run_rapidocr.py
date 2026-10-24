"""Run RapidOCR (PaddleOCR PP-OCR models on ONNX Runtime) over bench/samples.

Usage: python bench/run_rapidocr.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parent
SAMPLES = ROOT / "samples"
RESULTS = ROOT / "results"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    RESULTS.mkdir(parents=True, exist_ok=True)
    labels = json.loads((SAMPLES / "labels.json").read_text(encoding="utf-8"))
    engine = RapidOCR()

    results = []
    for label in labels:
        started = time.perf_counter()
        try:
            raw, _ = engine(str(SAMPLES / label["file"]))
            entries = raw or []
            text = "\n".join(str(entry[1]) for entry in entries)
            weights = [len(str(entry[1])) for entry in entries]
            scores = [float(entry[2]) for entry in entries]
            total = sum(weights)
            confidence = (
                sum(score * weight for score, weight in zip(scores, weights)) / total
                if total
                else None
            )
            ms = int((time.perf_counter() - started) * 1000)
            results.append(
                {
                    "id": label["id"],
                    "file": label["file"],
                    "text": text.strip(),
                    "confidence": confidence,
                    "ms": ms,
                }
            )
            print(f"{label['id']}: {len(text)} chars, conf={confidence:.3f} ({ms}ms)")
        except Exception as error:  # noqa: BLE001 - benchmark should continue
            ms = int((time.perf_counter() - started) * 1000)
            results.append(
                {
                    "id": label["id"],
                    "file": label["file"],
                    "text": "",
                    "confidence": None,
                    "ms": ms,
                    "error": str(error),
                }
            )
            print(f"{label['id']}: failed {error}")

    payload = {"engine": "rapidocr", "model": "PP-OCR (onnxruntime)", "results": results}
    (RESULTS / "rapidocr.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nwrote {RESULTS / 'rapidocr.json'}")


if __name__ == "__main__":
    main()
