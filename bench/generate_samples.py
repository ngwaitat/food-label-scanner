"""Generate photo-like food label samples for OCR benchmarking.

These are synthetic: they exercise the pipeline and give a reproducible baseline,
but they are not a substitute for real packaging photos. Drop real JPG/PNG files
into bench/samples and add entries to samples/labels.json to extend the set.

Usage: python bench/generate_samples.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "samples"

FONT_ZH = "C:/Windows/Fonts/msjh.ttc"
FONT_EN = "C:/Windows/Fonts/arial.ttf"

SAMPLES = [
    {
        "id": "01-vegan-zh",
        "locale": "zh-Hant",
        "expected": "VEGAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "棕櫚油", "鹽", "大豆卵磷脂"],
            }
        ],
    },
    {
        "id": "02-lacto-zh",
        "locale": "zh-Hant",
        "expected": "LACTO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "奶類固體", "棕櫚油", "鹽", "乳化劑"],
            }
        ],
    },
    {
        "id": "03-ovo-zh",
        "locale": "zh-Hant",
        "expected": "OVO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "蛋粉", "棕櫚油", "鹽"],
            }
        ],
    },
    {
        "id": "04-lacto-ovo-zh",
        "locale": "zh-Hant",
        "expected": "LACTO_OVO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "奶粉", "蛋黃粉", "棕櫚油", "鹽"],
            }
        ],
    },
    {
        "id": "05-pungent-zh",
        "locale": "zh-Hant",
        "expected": "PUNGENT_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "大蒜粉", "洋蔥粉", "棕櫚油", "鹽"],
            }
        ],
    },
    {
        "id": "06-nonveg-zh",
        "locale": "zh-Hant",
        "expected": "NON_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "豬肉", "糖", "小麥粉", "魚粉", "鹽", "醬油"],
            }
        ],
    },
    {
        "id": "07-vegan-en",
        "locale": "en",
        "expected": "VEGAN",
        "hard": False,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Palm oil", "Salt", "Soy lecithin"],
            }
        ],
    },
    {
        "id": "08-lacto-en",
        "locale": "en",
        "expected": "LACTO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Milk powder", "Palm oil", "Salt"],
            }
        ],
    },
    {
        "id": "09-ovo-en",
        "locale": "en",
        "expected": "OVO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Egg white powder", "Palm oil", "Salt"],
            }
        ],
    },
    {
        "id": "10-nonveg-en",
        "locale": "en",
        "expected": "NON_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Anchovy", "Sugar", "Wheat flour", "Salt", "Soy sauce"],
            }
        ],
    },
    {
        "id": "11-pungent-en",
        "locale": "en",
        "expected": "PUNGENT_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Garlic powder", "Onion powder", "Salt"],
            }
        ],
    },
    {
        "id": "12-bilingual-lacto",
        "locale": "zh-Hant",
        "expected": "LACTO_VEGETARIAN",
        "hard": False,
        "blocks": [
            {
                "header": "成分 INGREDIENTS",
                "sep": "、",
                "ingredients": ["水", "糖", "小麥粉", "奶類固體", "棕櫚油", "鹽"],
            },
            {
                "header": "",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Milk solids", "Palm oil", "Salt"],
            },
        ],
    },
    {
        "id": "13-hard-nonveg-zh",
        "locale": "zh-Hant",
        "expected": "NON_VEGETARIAN",
        "hard": True,
        "blocks": [
            {
                "header": "成分",
                "sep": "、",
                "ingredients": ["水", "魚粉", "糖", "小麥粉", "豬肉", "鹽", "醬油"],
            }
        ],
    },
    {
        "id": "14-hard-vegan-en",
        "locale": "en",
        "expected": "VEGAN",
        "hard": True,
        "blocks": [
            {
                "header": "INGREDIENTS",
                "sep": ", ",
                "ingredients": ["Water", "Sugar", "Wheat flour", "Palm oil", "Salt", "Soy lecithin"],
            }
        ],
    },
]


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    last_space = -1
    for ch in text:
        candidate = current + ch
        if draw.textlength(candidate, font=font) > max_width and current:
            if last_space > 0 and " " in current:
                lines.append(current[:last_space])
                current = current[last_space + 1 :] + ch
            else:
                lines.append(current)
                current = ch
            last_space = current.rfind(" ")
        else:
            current = candidate
            if ch == " ":
                last_space = len(current) - 1
    if current:
        lines.append(current)
    return lines


def render(sample: dict) -> Image.Image:
    width, height = 1000, 780
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    header_font = ImageFont.truetype(FONT_ZH, 38)
    body_zh = ImageFont.truetype(FONT_ZH, 30)
    body_en = ImageFont.truetype(FONT_EN, 26)

    y = 48
    for block in sample["blocks"]:
        is_zh = any("\u4e00" <= ch <= "\u9fff" for ch in "".join(block["ingredients"]))
        body_font = body_zh if is_zh else body_en
        if block["header"]:
            draw.text((52, y), block["header"], font=header_font, fill=(20, 20, 20))
            y += 58
        body = block["sep"].join(block["ingredients"])
        for line in wrap(draw, body, body_font, width - 104):
            draw.text((52, y), line, font=body_font, fill=(25, 25, 25))
            y += 46
        y += 22
    return image


def perspective_coeffs(src: list[tuple[float, float]], dst: list[tuple[float, float]]) -> np.ndarray:
    matrix = []
    values = []
    for (x, y), (u, v) in zip(src, dst):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return np.linalg.solve(np.array(matrix, dtype=float), np.array(values, dtype=float))


def make_photo(image: Image.Image, seed: int, hard: bool) -> Image.Image:
    rng = np.random.default_rng(seed)
    width, height = image.size

    pad = 90
    backdrop = Image.new("RGB", (width + pad * 2, height + pad * 2))
    bg_color = tuple(int(c) for c in rng.integers(95, 165, 3))
    backdrop.paste(bg_color, (0, 0, backdrop.width, backdrop.height))
    backdrop.paste(image, (pad, pad))

    w, h = backdrop.size
    jitter = 70 if hard else 26
    dst = [
        (rng.normal(0, jitter), rng.normal(0, jitter)),
        (w + rng.normal(0, jitter), rng.normal(0, jitter)),
        (w + rng.normal(0, jitter), h + rng.normal(0, jitter)),
        (rng.normal(0, jitter), h + rng.normal(0, jitter)),
    ]
    coeffs = perspective_coeffs([(0, 0), (w, 0), (w, h), (0, h)], dst)
    warped = backdrop.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    angle = float(rng.normal(0, 10 if hard else 3.5))
    warped = warped.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=bg_color)

    arr = np.asarray(warped).astype(np.float32)
    gradient = np.linspace(0.62 if hard else 0.82, 1.0, arr.shape[1], dtype=np.float32)[None, :, None]
    shadow = np.linspace(1.0, 0.72 if hard else 0.9, arr.shape[0], dtype=np.float32)[:, None, None]
    arr = arr * gradient * shadow

    if hard:
        glare = Image.new("L", (w, h), 0)
        gdraw = ImageDraw.Draw(glare)
        cx, cy = int(rng.integers(w // 3, 2 * w // 3)), int(rng.integers(h // 4, h // 2))
        rx, ry = int(w * 0.28), int(h * 0.18)
        gdraw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=110)
        glare = glare.filter(ImageFilter.GaussianBlur(60))
        glare_arr = np.asarray(glare).astype(np.float32)[:, :, None] / 255.0
        arr = arr + (255.0 - arr) * glare_arr

    arr = np.clip(arr, 0, 255)
    arr += rng.normal(0, 5.5 if hard else 2.5, arr.shape)
    photo = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    photo = photo.filter(ImageFilter.GaussianBlur(1.6 if hard else 0.7))
    return photo


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    labels = []
    for index, sample in enumerate(SAMPLES):
        ground_truth = "\n".join(
            "\n".join(
                part
                for part in (block["header"], block["sep"].join(block["ingredients"]))
                if part
            )
            for block in sample["blocks"]
        )
        image = render(sample)
        photo = make_photo(image, seed=1000 + index, hard=sample["hard"])
        filename = f"{sample['id']}.jpg"
        photo.save(OUT / filename, quality=58 if sample["hard"] else 74, optimize=True)
        labels.append(
            {
                "id": sample["id"],
                "file": filename,
                "locale": sample["locale"],
                "expected": sample["expected"],
                "text": ground_truth,
                "hard": sample["hard"],
            }
        )
        print(f"wrote {filename} ({photo.width}x{photo.height})")

    (OUT / "labels.json").write_text(
        json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n{len(labels)} samples in {OUT}")


if __name__ == "__main__":
    random.seed(0)
    main()
