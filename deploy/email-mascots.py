"""Build the mascot images the emails load, from the originals in design/mascot. Never redraws art.

Run with Python + Pillow: python deploy/email-mascots.py

Emails cannot layer an image behind the ticket the way the app does, so each image is trimmed to the
figure, cut off at a straight line (she stands "behind" the ticket) and saved at twice its shown width.
The names and shown widths are used by server/Zarqa.Api/Email/EmailLayout.cs.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out = root / "web" / "public" / "mascot" / "email"
out.mkdir(parents=True, exist_ok=True)

# output name: (original, share of the figure's height to keep from the top, saved width in px)
ART = {
    "key": ("email-code-key", 0.84, 360),
    "spotted": ("email-spotted", 0.66, 430),
    "legend": ("email-legend", 0.84, 360),
    "pickup-tag": ("email-pickup-tag", 0.82, 380),
    "still-looking": ("email-still-looking", 0.84, 340),
    "still-have-it": ("email-still-have-it", 0.88, 300),
    "waving": ("waving", 0.60, 340),
}

total = 0
for name, (source, keep, width) in ART.items():
    image = Image.open(root / "design" / "mascot" / f"{source}.png").convert("RGBA")
    image = image.crop(image.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox())
    image = image.crop((0, 0, image.width, round(image.height * keep)))
    image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    # 256 colours with transparency: flat cartoon art loses nothing visible and the file is a third of the size.
    image = image.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    target = out / f"{name}.png"
    image.save(target, optimize=True)
    total += target.stat().st_size
    print(f"{name}.png  {image.width}x{image.height}  {target.stat().st_size // 1024} KB")
print(f"Email mascot bytes: {total:,}")
