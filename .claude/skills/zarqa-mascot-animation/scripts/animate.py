"""Animate the Zarqa mascot: Codex keyframe sheets and/or procedural motion, saved as animated WebP.

Usage (from the project root):
  # New keyframes: Codex draws all frames in ONE sprite sheet (keeps her consistent), then we slice + animate.
  python .claude/skills/zarqa-mascot-animation/scripts/animate.py sheet --name wave \
      --frame "Right hand raised beside her head, palm out." \
      --frame "Right hand tilted left, mid-wave." --frame "Right hand tilted right, mid-wave." \
      --sequence 1:300,2:160,3:160,2:160,3:160 --motion breathe

  # Re-time or re-slice an existing sheet without calling Codex again.
  python .claude/skills/zarqa-mascot-animation/scripts/animate.py assemble --name wave --sequence 1:500,2,3,2,3

  # Move an existing still (no redrawing): bob, breathe, sway, bounce, wiggle, pop.
  python .claude/skills/zarqa-mascot-animation/scripts/animate.py motion --name happy-bob \
      --image design/mascot/happy.png --motion bob

  # Video model (default Gemini Omni Flash; --provider veo-lite|seedance on fal.ai): start -> end frame on green, keyed out.
  python .claude/skills/zarqa-mascot-animation/scripts/animate.py video --name wave --from-sheet wave-keys \
      --prompt "She lifts her right hand and waves hello twice." --dry-run

Writes to mascot-output/: <name>.webp (animated, transparent), <name>.preview.gif (on white),
<name>.frames.jpg (keyframes on white, numbered), <name>.poster.png (still for reduced motion),
<name>.anim.json (settings). `sheet` also writes <name>.sheet.png/.prompt.md/.preview.jpg/.codex-log.txt.
"""
import argparse
import base64
import json
import math
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

SKILL = Path(__file__).resolve().parent.parent
MASCOT = SKILL.parent / "zarqa-mascot"
TEMPLATE = MASCOT / "assets" / "prompt-template.md"
GENERATE = MASCOT / "scripts" / "generate.py"
LAYOUT = SKILL / "assets" / "sheet-layout.md"
VIDEO_PROMPT = SKILL / "assets" / "video-prompt.md"

GRIDS = {2: (2, 1), 3: (3, 1), 4: (4, 1), 6: (3, 2), 8: (4, 2)}  # frames -> (cols, rows)
ALPHA_SOLID = 40  # alpha above this counts as drawn (ignores faint contact shadows)
LENGTHS = {"none": 1.0, "bob": 1.6, "breathe": 2.4, "sway": 2.0, "bounce": 1.0, "wiggle": 1.2, "pop": 0.6}


# ---- motion presets: phase p in [0, 1] -> (dx, dy in figure heights, rotation deg, scale x, scale y) ----

def wave(p):
    return 0.5 - 0.5 * math.cos(2 * math.pi * p)  # 0 -> 1 -> 0


def bump(p, a, b):
    return math.sin(math.pi * (p - a) / (b - a)) if a < p < b else 0.0


def bounce(p):
    squash = 0.05 * bump(p, 0, 0.14) + 0.07 * bump(p, 0.6, 0.8)  # crouch before, land after
    stretch = 0.035 * bump(p, 0.12, 0.3)
    air = (p - 0.12) / 0.5
    dy = -0.09 * 4 * air * (1 - air) if 0 < air < 1 else 0.0
    return (0, dy, 0, 1 + 0.7 * squash - 0.5 * stretch, 1 - squash + stretch)


def pop(p):
    if p >= 0.4:
        return (0, 0, 0, 1, 1)
    x = p / 0.4 - 1
    s = 1 + 2.70158 * x ** 3 + 1.70158 * x ** 2  # ease-out-back, 0 -> overshoot -> 1
    return (0, 0, 0, s, s)


MOTIONS = {
    "none": lambda p: (0, 0, 0, 1, 1),
    "bob": lambda p: (0, -0.025 * wave(p), 0, 1, 1),
    "breathe": lambda p: (0, 0, 0, 1 - 0.006 * wave(p), 1 + 0.014 * wave(p)),
    "sway": lambda p: (0, 0, 2.5 * math.sin(2 * math.pi * p), 1, 1),
    "wiggle": lambda p: (0, 0, 4 * math.sin(12 * math.pi * p) * bump(p, 0, 0.5), 1, 1),
    "bounce": bounce,
    "pop": pop,
}


# ---- sheet prompt ----

def build_prompt(a):
    n = len(a.frame)
    if n not in GRIDS:
        sys.exit(f"Use 2, 3, 4, 6 or 8 frames (got {n}). Fewer keyframes + --sequence + --motion animate best.")
    cols, rows = GRIDS[n]
    layout = LAYOUT.read_text(encoding="utf-8")
    for slot, value in {
        "{{FRAME_COUNT}}": str(n), "{{COLS}}": str(cols), "{{ROWS}}": str(rows),
        "{{ROW_NOTE}}": ", top row first, then the next row" if rows > 1 else "",
        "{{SHAPE_NOTE}}": "- Make the image landscape (3:2, about 1536x1024).",
        "{{FRAMES}}": "\n".join(f"Frame {i}: {f}" for i, f in enumerate(a.frame, 1)),
    }.items():
        layout = layout.replace(slot, value)
    prompt = TEMPLATE.read_text(encoding="utf-8")
    for slot, value in {
        "{{POSE_ACTION}}": layout.strip(),
        "{{EXPRESSION}}": f"As described for each frame. Where a frame does not say: {a.expression}",
        "{{GAZE}}": f"As described for each frame. Where a frame does not say: {a.gaze}",
        "{{PROPS}}": a.props,
        "{{FRAMING}}": f"{a.framing} The same framing in every frame.",
    }.items():
        prompt = prompt.replace(slot, value)
    if "{{" in prompt:
        sys.exit("Prompt still has unfilled {{slots}}")
    return prompt


# ---- slicing and alignment ----

def solid_mask(im):
    return im.getchannel("A").point(lambda v: 255 if v > ALPHA_SOLID else 0)


def profile(mask, axis):
    w, h = mask.size
    return list(mask.resize((w, 1) if axis == "x" else (1, h), Image.BOX).tobytes())


def split(prof, k, what, warnings):
    """Cut a 1-D alpha profile into k parts at the empty gap nearest each expected boundary."""
    length, runs, i = len(prof), [], 0
    while i < length:
        j = i
        while j < length and prof[j] == 0:
            j += 1
        if j > i and i > 0 and j < length:
            runs.append((i, j))
        i = max(j, i + 1)
    bounds = [0]
    for m in range(1, k):
        e = m * length / k
        near = [r for r in runs if abs((r[0] + r[1]) / 2 - e) < length / (2 * k) and (r[0] + r[1]) // 2 > bounds[-1]]
        if near:
            r = max(near, key=lambda r: (r[1] - r[0]) - 0.5 * abs((r[0] + r[1]) / 2 - e))
            bounds.append((r[0] + r[1]) // 2)
        else:
            bounds.append(round(e))
            warnings.append(f"no empty gap for {what} boundary {m}; cut at the even split (figures may touch)")
    return bounds + [length]


def keyframe(cell, anchor, warnings, label):
    """Crop a cell to the drawn figure; return (premultiplied image, anchor x, anchor y)."""
    box = solid_mask(cell).getbbox()
    if not box:
        sys.exit(f"{label} is empty")
    x0, y0, x1, y1 = box
    cut = y1 >= cell.height - 2  # art cropped at the bottom edge (bust framing)
    crop = cell.crop(box)
    if anchor == "cell":
        ax, ay = cell.width / 2 - x0, cell.height - y0
    else:  # feet: bottom of the figure, horizontally at the centre of mass of its lowest 12%
        band = solid_mask(crop).crop((0, int(crop.height * 0.88), crop.width, crop.height))
        weights = profile(band, "x")
        total = sum(weights)
        ax = sum(i * w for i, w in enumerate(weights)) / total if total else crop.width / 2
        ay = crop.height
    return {"img": crop.convert("RGBa"), "ax": round(ax), "ay": round(ay), "h": y1 - y0, "label": label, "cut": cut}


def load_sheet(path, count, anchor, warnings):
    if count not in GRIDS:
        sys.exit(f"--count must be one of {sorted(GRIDS)}")
    cols, rows = GRIDS[count]
    sheet = Image.open(path).convert("RGBA")
    mask = solid_mask(sheet)
    frames = []
    ys = split(profile(mask, "y"), rows, "row", warnings)
    for r in range(rows):
        band = mask.crop((0, ys[r], sheet.width, ys[r + 1]))
        xs = split(profile(band, "x"), cols, f"row {r + 1} column", warnings)
        for c in range(cols):
            cell = sheet.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
            frames.append(keyframe(cell, anchor, warnings, f"frame {len(frames) + 1}"))
    return frames


# ---- rendering ----

def render(src, P, size, t, H):
    dx, dy, rot, sx, sy = t
    if min(sx, sy) < 0.02:
        return Image.new("RGBa", size)
    if (dx, dy, rot, sx, sy) == (0, 0, 0, 1, 1):
        out = Image.new("RGBa", size)
        out.paste(src["img"], (P[0] - src["ax"], P[1] - src["ay"]))
        return out
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    px, py = P[0] + dx * H, P[1] + dy * H
    coeffs = (c / sx, s / sx, src["ax"] - (c * px + s * py) / sx,
              -s / sy, c / sy, src["ay"] - (-s * px + c * py) / sy)
    return src["img"].transform(size, Image.AFFINE, coeffs, resample=Image.BICUBIC)


def parse_sequence(text, count, hold, pingpong):
    if text:
        seq = []
        for part in text.split(","):
            idx, _, ms = part.strip().partition(":")
            i = int(idx)
            if not 1 <= i <= count:
                sys.exit(f"--sequence frame {i} out of range 1..{count}")
            seq.append((i - 1, int(ms) if ms else hold))
        return seq
    order = list(range(count)) + (list(range(count - 2, 0, -1)) if pingpong else [])
    return [(i, hold) for i in order]


def timeline(seq, motion, cycles, fps, once, length_ms):
    """Return [(frame index, transform, ms)] with identical neighbours merged."""
    fn = MOTIONS[motion]
    if motion == "none":
        steps = [(i, fn(0), ms) for i, ms in seq]
    else:
        total = sum(ms for _, ms in seq) if length_ms is None else length_ms
        n = max(2, round(total / 1000 * fps))
        steps = []
        for k in range(n + 1 if once else n):
            t = min(k * total / n, total - 1e-6)
            acc = 0
            for i, ms in seq:
                acc += ms
                if t < acc:
                    break
            p = 1.0 if once and k == n else (k / n * cycles) % 1.0
            steps.append((i, tuple(round(v, 5) for v in fn(p)), total / n))
    merged = []
    for i, t, ms in steps:
        if merged and merged[-1][0] == i and merged[-1][1] == t:
            merged[-1][2] += ms
        else:
            merged.append([i, t, ms])
    return merged


def assemble(frames, a, warnings, extra):
    seq = parse_sequence(a.sequence, len(frames), a.hold, a.pingpong)
    once = a.once or a.motion == "pop"
    length_ms = None
    if len(frames) == 1 and a.motion != "none":
        length_ms = (a.length or LENGTHS[a.motion]) * 1000
    steps = timeline(seq, a.motion, a.cycles, a.fps, once, length_ms)

    heights = [f["h"] for f in frames]
    H = statistics.median(heights)
    for f in frames if len(frames) <= 8 else []:  # video frames change height on purpose
        if abs(f["h"] - H) / H > 0.12 and a.motion != "pop":
            warnings.append(f"{f['label']} is {f['h'] / H - 1:+.0%} the median height: scale drift or a raised arm?")

    # Render on a roomy canvas, then crop every frame to the union of what was drawn.
    m = round(0.35 * H)
    left = max(f["ax"] for f in frames) + m
    up = max(f["ay"] for f in frames) + m
    size = (left + max(f["img"].width - f["ax"] for f in frames) + m,
            up + max(f["img"].height - f["ay"] for f in frames) + m)
    P = (left, up)
    rendered = [render(frames[i], P, size, t, H) for i, t, _ in steps]
    poster = render(frames[seq[0][0]], P, size, MOTIONS["none"](0), H)
    boxes = [im.getchannel(3).getbbox() for im in rendered + [poster]]
    boxes = [b for b in boxes if b]
    pad = round(0.02 * H)
    crop = (max(0, min(b[0] for b in boxes) - pad), max(0, min(b[1] for b in boxes) - pad),
            min(size[0], max(b[2] for b in boxes) + pad), min(size[1], max(b[3] for b in boxes) + pad))
    scale = min(1.0, a.size / max(crop[2] - crop[0], crop[3] - crop[1]))
    out_size = (round((crop[2] - crop[0]) * scale), round((crop[3] - crop[1]) * scale))

    def finish(im):
        im = im.crop(crop)
        if scale < 1:
            im = im.resize(out_size, Image.LANCZOS)
        return im.convert("RGBA")

    out = [finish(im) for im in rendered]
    durations, carry = [], 0.0  # integer ms that still add up to the true loop length
    for _, _, ms in steps:
        carry += ms
        durations.append(max(20, round(carry - sum(durations))))

    out_dir = Path(a.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    base = out_dir / a.name
    webp, gif = base.with_suffix(".webp"), Path(f"{base}.preview.gif")
    out[0].save(webp, save_all=True, append_images=out[1:], duration=durations,
                loop=1 if once else 0, quality=a.quality, method=4)
    on_white = [Image.alpha_composite(Image.new("RGBA", im.size, "white"), im).convert("RGB") for im in out]
    on_white[0].save(gif, save_all=True, append_images=on_white[1:], duration=durations,
                     loop=1 if once else 0, disposal=1)
    finish(poster).save(f"{base}.poster.png")
    contact(frames, f"{base}.frames.jpg")
    if a.motion != "none":
        pivot = ((P[0] - crop[0]) * scale / out_size[0], (P[1] - crop[1]) * scale / out_size[1])
        motion_css(a, once, sum(durations), pivot, H * scale, out_size, f"{base}.motion.css")
    settings = {k: v for k, v in vars(a).items() if k not in ("cmd", "out_dir")}
    settings.update(extra, keyframes=len(frames), output_frames=len(out), loop_ms=sum(durations),
                    size=list(out_size), warnings=warnings)
    Path(f"{base}.anim.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")

    print(f"Saved {webp}  {out_size[0]}x{out_size[1]}, {len(out)} frames, {sum(durations)} ms"
          f" {'once' if once else 'loop'}, {webp.stat().st_size // 1024} KB")
    print(f"Preview on white: {gif}\nKeyframes: {base}.frames.jpg\nPoster (reduced motion): {base}.poster.png")
    for w in warnings:
        print(f"WARNING: {w}")


def motion_css(a, once, loop_ms, pivot, H, size, path):
    """The same motion as CSS keyframes for the poster image: a few KB instead of a frame-by-frame WebP."""
    fn, cls, lines = MOTIONS[a.motion], f"zarqa-{a.name}", []
    for k in range(25):
        dx, dy, rot, sx, sy = fn(1.0 if once and k == 24 else (k / 24 * a.cycles) % 1.0)
        lines.append(f"  {k / 24:.2%} {{ transform: translate({dx * H / size[0]:.3%}, {dy * H / size[1]:.3%})"
                     f" rotate({rot:.3f}deg) scale({sx:.4f}, {sy:.4f}); }}")
    Path(path).write_text(
        f"/* {a.name}: {a.motion} on {a.name}.poster.png. transform-origin is her feet. */\n"
        f".{cls} {{\n  transform-origin: {pivot[0]:.2%} {pivot[1]:.2%};\n"
        f"  animation: {cls} {loop_ms}ms linear {'1 both' if once else 'infinite'};\n}}\n"
        f"@keyframes {cls} {{\n" + "\n".join(lines) + "\n}\n"
        f"@media (prefers-reduced-motion: reduce) {{\n  .{cls} {{ animation: none; }}\n}}\n",
        encoding="utf-8")
    print(f"CSS motion for the poster: {path}")


def contact(frames, path):
    """Numbered keyframes side by side on white, aligned on their anchors, for judging identity."""
    if len(frames) > 8:  # a video: show 8 evenly spaced frames, numbered by their position in the clip
        frames = [dict(frames[round(k * (len(frames) - 1) / 7)], n=round(k * (len(frames) - 1) / 7) + 1)
                  for k in range(8)]
    up = max(f["ay"] for f in frames)
    down = max(f["img"].height - f["ay"] for f in frames)
    cw = max(f["img"].width for f in frames) + 40
    sheet = Image.new("RGB", (cw * len(frames), up + down + 70), "white")
    draw = ImageDraw.Draw(sheet)
    for n, f in enumerate(frames):
        im = f["img"].convert("RGBA")
        sheet.paste(im, (n * cw + 20, 20 + up - f["ay"]), im)
        draw.text((n * cw + cw // 2, up + down + 45), str(f.get("n", n + 1)), fill="black", anchor="mm", font_size=28)
        if n:
            draw.line([(n * cw, 0), (n * cw, sheet.height)], fill=(220, 220, 220))
    sheet.thumbnail((2400, 1200))
    sheet.save(path, quality=90)


# ---- video: start/end frames on green -> video model -> keyed frames ----

ASPECTS = {"9:16": (720, 1280), "3:4": (720, 960), "1:1": (720, 720)}
GREEN = (0, 255, 0)
KEY_LO, KEY_HI = 40, 160  # green excess (G - max(R, B)) where keying starts / is fully transparent


def on_green(frames, aspect):
    """Place the start/end figures identically (same scale, feet on one spot) on a flat green canvas."""
    if aspect == "auto":
        fig = max(f["img"].width for f in frames) / max(f["h"] for f in frames)
        aspect = min(ASPECTS, key=lambda k: abs(ASPECTS[k][0] / ASPECTS[k][1] - fig * 1.3))
    cw, ch = ASPECTS[aspect]
    cut = any(f["cut"] for f in frames)  # bust art: keep its cut edge on the bottom of the video
    feet_y = ch if cut else round(ch * 0.93)
    s = min(min(0.47 * cw / max(f["ax"], f["img"].width - f["ax"]) for f in frames),
            min((0.84 if cut else 0.78) * ch / f["ay"] for f in frames))
    out = []
    for f in frames:
        img = f["img"].resize((round(f["img"].width * s), round(f["img"].height * s)), Image.LANCZOS)
        layer = Image.new("RGBa", (cw, ch))
        layer.paste(img, (round(cw / 2 - f["ax"] * s), round(feet_y - f["ay"] * s)))
        canvas = Image.new("RGBA", (cw, ch), GREEN + (255,))
        canvas.alpha_composite(layer.convert("RGBA"))
        out.append(canvas.convert("RGB"))
    return out, aspect, cut


def key_green(rgb):
    """Green screen -> alpha, with despill (green never brighter than red or blue: her palette has no green)."""
    r, g, b = rgb.split()
    rb = ImageChops.lighter(r, b)
    excess = ImageChops.subtract(g, rb)
    alpha = excess.point(lambda v: 255 if v <= KEY_LO else 0 if v >= KEY_HI
                         else round(255 * (KEY_HI - v) / (KEY_HI - KEY_LO)))
    alpha = alpha.point(lambda v: 0 if v < 20 else v)  # compression speckle in the background
    return Image.merge("RGBA", (r, ImageChops.darker(g, rb), b, alpha))


def env_key(name):
    if os.environ.get(name):
        return os.environ[name]
    env = SKILL.parents[2] / "benchmark" / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            if k.strip() == name and v.strip():
                return v.strip().strip('"')
    sys.exit(f"{name} is not set. Add it to benchmark/.env yourself (never paste it in chat).")


PROVIDERS = {  # name -> (key variable, default model, aspect ratios it accepts)
    "omni": ("GEMINI_API_KEY", "gemini-omni-1.1-flash", ["9:16"]),
    "veo-lite": ("FAL_KEY", "fal-ai/veo3.1/lite/first-last-frame-to-video", ["9:16"]),
    "seedance": ("FAL_KEY", "bytedance/seedance-2.0/image-to-video", list(ASPECTS)),
}


def http(method, url, headers, body=None, timeout=60):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url.split('?')[0]} -> {e.code}: {e.read()[:800].decode(errors='replace')}")


def b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode()


def run_fal(a, model, start_png, end_png, prompt):
    auth = {"Authorization": f"Key {env_key('FAL_KEY')}"}

    def uri(p):
        return "data:image/png;base64," + b64(p)
    if a.provider == "veo-lite":
        body = {"prompt": prompt, "first_frame_url": uri(start_png), "last_frame_url": uri(end_png),
                "aspect_ratio": a.aspect_used, "duration": f"{a.duration}s", "resolution": a.resolution,
                "generate_audio": False}
    else:
        body = {"prompt": prompt, "image_url": uri(start_png), "end_image_url": uri(end_png),
                "resolution": a.resolution, "duration": str(a.duration), "aspect_ratio": a.aspect_used,
                "generate_audio": False}
    job = http("POST", f"https://queue.fal.run/{model}", auth, body)
    print(f"Submitted to fal.ai {model} (request {job['request_id']}); waiting...", flush=True)
    deadline, last = time.time() + 20 * 60, None
    while True:
        st = http("GET", job["status_url"], auth)
        if st.get("status") != last:
            last = st.get("status")
            print(f"  {last}", flush=True)
        if last == "COMPLETED":
            break
        if time.time() > deadline:
            sys.exit(f"Timed out; the request may still finish: {job['response_url']}")
        time.sleep(5)
    result = http("GET", job["response_url"], auth)
    return result, lambda clip: urllib.request.urlretrieve(result["video"]["url"], clip)


def find_video(node):
    """The output part holding the mp4 (inline base64 `data` or a `uri`), wherever it sits."""
    if isinstance(node, dict):
        if (node.get("data") or node.get("uri")) and (
                "video" in str(node.get("mime_type", "")) or node.get("type") in ("model_output", "video")):
            return node
        node = list(node.values())
    if isinstance(node, list):
        for v in node:
            hit = find_video(v)
            if hit:
                return hit
    return None


def run_omni(a, model, start_png, end_png, prompt):
    auth = {"x-goog-api-key": env_key("GEMINI_API_KEY")}
    body = {"model": model, "store": False,
            "input": [{"type": "image", "data": b64(start_png), "mime_type": "image/png"},
                      {"type": "image", "data": b64(end_png), "mime_type": "image/png"},
                      {"type": "text", "text": prompt}],
            "response_format": {"type": "video", "aspect_ratio": a.aspect_used, "resolution": a.resolution}}
    print(f"Sent to Gemini {model}; waiting (can take a few minutes)...", flush=True)
    result = http("POST", "https://generativelanguage.googleapis.com/v1beta/interactions", auth, body, timeout=900)
    video = find_video(result)

    def save(clip):
        if not video:
            sys.exit(f"No video in the response (status {result.get('status')}); see the saved response JSON.")
        if video.get("data"):
            Path(clip).write_bytes(base64.b64decode(video["data"]))
        else:
            req = urllib.request.Request(video["uri"], headers=auth)
            with urllib.request.urlopen(req, timeout=300) as r:
                Path(clip).write_bytes(r.read())
    return result, save


def strip_data(node):
    """Response JSON without the base64 video, for the record."""
    if isinstance(node, dict):
        return {k: ("<base64 omitted>" if k == "data" and isinstance(v, str) and len(v) > 200 else strip_data(v))
                for k, v in node.items()}
    return [strip_data(v) for v in node] if isinstance(node, list) else node


def run_video(a, base, start_png, end_png, prompt):
    model = a.model or PROVIDERS[a.provider][1]
    result, save = (run_omni if a.provider == "omni" else run_fal)(a, model, start_png, end_png, prompt)
    Path(f"{base}.video.json").write_text(json.dumps(strip_data(result), indent=2), encoding="utf-8")
    clip = base.with_suffix(".mp4")
    save(clip)
    print(f"Video: {clip}")
    return clip


def video_frames(clip, fps, warnings):
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found (winget install ffmpeg)")
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(clip), "-vf", f"fps={fps}",
                            str(Path(tmp) / "%04d.png")], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"ffmpeg failed: {r.stderr[:500]}")
        paths = sorted(Path(tmp).glob("*.png"))
        frames = [keyframe(key_green(Image.open(p).convert("RGB")), "cell", warnings, f"video frame {i}")
                  for i, p in enumerate(paths, 1)]
    return frames


def video(a, warnings):
    out_dir = Path(a.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    base = out_dir / a.name
    a.anchor, a.sequence, a.hold = "cell", None, round(1000 / a.fps)
    clip = Path(a.video) if a.video else None
    if not clip:
        if a.from_sheet:
            meta = json.loads((out_dir / f"{a.from_sheet}.anim.json").read_text(encoding="utf-8"))
            keys = load_sheet(out_dir / f"{a.from_sheet}.sheet.png", meta["count"], "feet", warnings)
            keys = [keys[0], keys[-1]]
        elif a.start:
            keys = [keyframe(Image.open(p).convert("RGBA"), "feet", warnings, p) for p in [a.start] + ([a.end] if a.end else [])]
        else:
            sys.exit("Give --start (and usually --end), --from-sheet NAME, or --video CLIP")
        if len(keys) == 1:  # no end frame: end where it started, so the clip loops
            keys.append(keys[0])
        allowed = PROVIDERS[a.provider][2]
        if a.aspect not in ("auto", *allowed):
            sys.exit(f"{a.provider} only takes aspect {', '.join(allowed)}")
        aspect = allowed[0] if a.aspect == "auto" and len(allowed) == 1 else a.aspect
        greens, a.aspect_used, cut = on_green(keys, aspect)
        start_png, end_png = f"{base}.start.png", f"{base}.end.png"
        greens[0].save(start_png)
        greens[1].save(end_png)
        prompt = VIDEO_PROMPT.read_text(encoding="utf-8")
        for slot, value in {
            "{{FRAME_NOTE}}": "first frame, ending exactly on the last frame",
            "{{MOTION}}": a.prompt,
            "{{CUT_NOTE}}": ", cropped at the bottom edge exactly as in the frames" if cut else "",
            "{{DURATION}}": str(a.duration),
        }.items():
            prompt = prompt.replace(slot, value)
        Path(f"{base}.video-prompt.md").write_text(prompt, encoding="utf-8")
        print(f"Start/end on green: {start_png}, {end_png} ({a.aspect_used})\nPrompt: {base}.video-prompt.md")
        if a.dry_run:
            return
        clip = run_video(a, base, start_png, end_png, prompt)
    frames = video_frames(clip, a.fps, warnings)
    assemble(frames, a, warnings, {"video": str(clip)})


# ---- commands ----

def add_assembly(p):
    p.add_argument("--name", required=True, help="short kebab-case file name")
    p.add_argument("--sequence", help='frame order with optional ms, e.g. "1:2000,2:120" (default: each frame once)')
    p.add_argument("--hold", type=int, default=150, help="ms per frame when --sequence gives none")
    p.add_argument("--pingpong", action="store_true", help="play 1..n then back (ignored with --sequence)")
    p.add_argument("--motion", choices=MOTIONS, default="none")
    p.add_argument("--cycles", type=int, default=1, help="motion cycles per loop")
    p.add_argument("--length", type=float, help="seconds, for motion on a single image")
    p.add_argument("--fps", type=int, default=24, help="sampling rate when --motion is on")
    p.add_argument("--once", action="store_true", help="play once instead of looping (pop always does)")
    p.add_argument("--anchor", choices=["feet", "cell"], default="feet",
                   help="feet: pin her feet to one spot; cell: keep each figure where it sits in its cell (jumps)")
    p.add_argument("--size", type=int, default=640, help="max output width/height in px")
    p.add_argument("--quality", type=int, default=80, help="WebP quality (lower = smaller file)")
    p.add_argument("--out-dir", default="mascot-output")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sh = sub.add_parser("sheet", help="Codex draws keyframes in one sprite sheet, then assemble")
    add_assembly(sh)
    sh.add_argument("--frame", action="append", required=True, help="one per keyframe, in order")
    sh.add_argument("--expression", default="Warm, friendly smile.")
    sh.add_argument("--gaze", default="Looking at the viewer.")
    sh.add_argument("--props", default="None.")
    sh.add_argument("--framing", default="Full body.")
    sh.add_argument("--prompt-file", help="use an already-filled sheet prompt (approved exceptions)")
    sh.add_argument("--prompt-only", action="store_true", help="write the prompt and stop")
    asm = sub.add_parser("assemble", help="slice an existing sheet, or align frame files, then animate")
    add_assembly(asm)
    asm.add_argument("--sheet", help="sheet PNG (default mascot-output/<name>.sheet.png)")
    asm.add_argument("--count", type=int, help="frames in the sheet (default: from <name>.anim.json)")
    asm.add_argument("--frame-files", nargs="+", help="separate transparent PNGs instead of a sheet")
    sd = sub.add_parser("video", aliases=["seedance"],
                        help="a video model animates from a start frame to an end frame; green is keyed out")
    add_assembly(sd)
    sd.set_defaults(fps=12)
    sd.add_argument("--prompt", help="the motion only, e.g. 'She waves her right hand twice, then lowers it.'")
    sd.add_argument("--start", help="transparent PNG of the first frame")
    sd.add_argument("--end", help="transparent PNG of the last frame (default: same as --start, so it loops)")
    sd.add_argument("--from-sheet", help="use frames 1 and last of mascot-output/<NAME>.sheet.png")
    sd.add_argument("--video", help="re-key an existing clip instead of calling a model (free)")
    sd.add_argument("--provider", default="omni", choices=PROVIDERS,
                    help="omni: Gemini Omni Flash (GEMINI_API_KEY); veo-lite, seedance: fal.ai (FAL_KEY)")
    sd.add_argument("--model", help="override the provider's model id")
    sd.add_argument("--duration", type=int, default=4, help="seconds (veo-lite: 4, 6 or 8; omni: asked in the prompt)")
    sd.add_argument("--resolution", default="720p", choices=["360p", "480p", "720p", "1080p"])
    sd.add_argument("--aspect", default="auto", choices=["auto", *ASPECTS])
    sd.add_argument("--dry-run", action="store_true", help="write the green frames and prompt, don't call the model")
    mo = sub.add_parser("motion", help="animate one existing transparent PNG without redrawing it")
    add_assembly(mo)
    mo.add_argument("--image", required=True)
    a = ap.parse_args()

    warnings = []
    out_dir = Path(a.out_dir).resolve()
    if a.cmd == "sheet":
        out_dir.mkdir(parents=True, exist_ok=True)
        prompt_path = out_dir / f"{a.name}.sheet.prompt.md"
        prompt = Path(a.prompt_file).read_text(encoding="utf-8") if a.prompt_file else build_prompt(a)
        prompt_path.write_text(prompt, encoding="utf-8")
        print(f"Prompt: {prompt_path}")
        if a.prompt_only:
            return
        r = subprocess.run([sys.executable, str(GENERATE), "--name", f"{a.name}.sheet", "--pose", "-",
                            "--prompt-file", str(prompt_path), "--out-dir", str(out_dir)])
        if r.returncode != 0:
            sys.exit("Sheet generation failed; see the codex log above.")
        frames = load_sheet(out_dir / f"{a.name}.sheet.png", len(a.frame), a.anchor, warnings)
        assemble(frames, a, warnings, {"count": len(a.frame)})
    elif a.cmd == "assemble":
        if a.frame_files:
            frames = [keyframe(Image.open(f).convert("RGBA"), a.anchor, warnings, f"frame {i}")
                      for i, f in enumerate(a.frame_files, 1)]
            assemble(frames, a, warnings, {})
            return
        count = a.count
        meta = out_dir / f"{a.name}.anim.json"
        if count is None and meta.exists():
            old = json.loads(meta.read_text(encoding="utf-8"))
            count = old.get("count") or len(old.get("frame") or [])
        if not count:
            sys.exit("Pass --count (frames in the sheet)")
        frames = load_sheet(a.sheet or out_dir / f"{a.name}.sheet.png", count, a.anchor, warnings)
        assemble(frames, a, warnings, {"count": count})
    elif a.cmd in ("video", "seedance"):
        if a.cmd == "seedance" and a.provider == "omni":
            a.provider = "seedance"
        if not a.video and not a.prompt:
            sys.exit("video needs --prompt describing the motion")
        video(a, warnings)
    else:
        if a.motion == "none":
            sys.exit("motion needs --motion (bob, breathe, sway, bounce, wiggle or pop)")
        frames = [keyframe(Image.open(a.image).convert("RGBA"), a.anchor, warnings, "image")]
        assemble(frames, a, warnings, {})


if __name__ == "__main__":
    main()
