"""Fill the mascot prompt template and generate the image with the Codex CLI.

Usage (from the project root):
  python .claude/skills/zarqa-mascot/scripts/generate.py --name airpods-handover \
      --pose "Holding up an AirPods box with both hands, as if handing it over." \
      --expression "Warm, friendly smile." --gaze "Looking at the viewer." \
      --props "A small white AirPods box, simple cartoon style." --framing "Full body."

Writes to mascot-output/: <name>.prompt.md, <name>.png, <name>.preview.jpg (on white),
<name>.codex-log.txt. Prints a transparency report at the end.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL / "assets" / "prompt-template.md"
SHEET = SKILL / "assets" / "character-sheet.png"

INSTRUCTION = (
    "Use your image generation tool to generate ONE image from the prompt below. "
    "The attached image is the canonical character sheet referenced by the prompt. "
    "The image must have a real transparent background (alpha channel). "
    "After generating, copy the image file to {out} (copy it from wherever the image tool "
    "saved it), then reply with only the saved path. Do not edit any other files.\n\n"
)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True, help="short kebab-case file name")
    p.add_argument("--pose", required=True)
    p.add_argument("--expression", default="Warm, friendly smile.")
    p.add_argument("--gaze", default="Looking at the viewer.")
    p.add_argument("--props", default="None.")
    p.add_argument("--framing", default="Full body.")
    p.add_argument("--out-dir", default="mascot-output")
    p.add_argument("--prompt-file", help="use an already-filled prompt instead of the template")
    a = p.parse_args()

    if not SHEET.exists():
        sys.exit(f"Missing character sheet: {SHEET}")
    out_dir = Path(a.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    png = out_dir / f"{a.name}.png"
    prompt_path = out_dir / f"{a.name}.prompt.md"

    if a.prompt_file:
        prompt = Path(a.prompt_file).read_text(encoding="utf-8")
    else:
        prompt = TEMPLATE.read_text(encoding="utf-8")
        for slot, value in {
            "{{POSE_ACTION}}": a.pose, "{{EXPRESSION}}": a.expression, "{{GAZE}}": a.gaze,
            "{{PROPS}}": a.props, "{{FRAMING}}": a.framing,
        }.items():
            prompt = prompt.replace(slot, value)
    if "{{" in prompt:
        sys.exit("Prompt still has unfilled {{slots}}")
    prompt_path.write_text(prompt, encoding="utf-8")

    codex = shutil.which("codex")
    if not codex:
        sys.exit("codex CLI not found (npm i -g @openai/codex)")
    png.unlink(missing_ok=True)
    full = INSTRUCTION.format(out=png.as_posix()) + prompt
    log = out_dir / f"{a.name}.codex-log.txt"
    with open(log, "w", encoding="utf-8") as f:
        r = subprocess.run(
            [codex, "exec", "--skip-git-repo-check", "-s", "workspace-write",
             "--add-dir", str(out_dir), "-i", str(SHEET), "-"],
            input=full, text=True, encoding="utf-8", stdout=f, stderr=subprocess.STDOUT,
        )
    if r.returncode != 0 or not png.exists():
        sys.exit(f"Codex did not produce {png} (exit {r.returncode}); see {log}")

    report(png, out_dir / f"{a.name}.preview.jpg")


def report(png, preview):
    try:
        from PIL import Image
    except ImportError:
        print(f"Saved {png} (install Pillow to check transparency)")
        return
    im = Image.open(png)
    print(f"Saved {png}  {im.size[0]}x{im.size[1]} {im.mode}")
    if "A" not in im.mode:
        print("TRANSPARENCY: NONE - image has no alpha channel (not a real cutout)")
        return
    h = im.getchannel("A").histogram()
    n = sum(h)
    clear, partial = sum(h[:5]) / n, sum(h[5:250]) / n
    ok = clear > 0.2 and partial < 0.05
    print(f"TRANSPARENCY: {'OK' if ok else 'SUSPECT'} - {clear:.0%} clear, {partial:.1%} semi-transparent")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert("RGBA"))
    bg.convert("RGB").save(preview, quality=90)
    print(f"Preview on white: {preview}")


if __name__ == "__main__":
    main()
