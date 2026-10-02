"""Build WebP delivery copies from the existing public PNGs; never redraw source art.

Run with Python + Pillow: python deploy/optimize-mascots.py
Original PNGs remain available for design and older clients.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / "web" / "public" / "mascot"
before = after = 0
for source in sorted(root.glob("*.png")):
    with Image.open(source) as image:
        image.thumbnail((600, 900) if source.stem in ("lookout", "phone", "full") else (300, 300), Image.Resampling.LANCZOS)
        output = source.with_suffix(".webp")
        image.save(output, "WEBP", quality=85, method=6)
    before += source.stat().st_size
    after += output.stat().st_size
print(f"Mascot delivery bytes: {before:,} -> {after:,}")
