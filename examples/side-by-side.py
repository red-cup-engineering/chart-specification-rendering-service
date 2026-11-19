#!/usr/bin/env python3
"""Review aid: puts an AI-generated PNG and our render of the same subject side by side. Not part of any score.
Usage: python3 -I examples/side-by-side.py <left.png> <right.png> <out.png> <left label> <right label>"""
import sys
from PIL import Image, ImageDraw, ImageFont

left, right, out, ll, rl = sys.argv[1:6]
W = 1280
a, b = Image.open(left).convert("RGB"), Image.open(right).convert("RGB")
a = a.resize((W, round(a.height * W / a.width)), Image.LANCZOS)
b = b.resize((W, round(b.height * W / b.width)), Image.LANCZOS)
H = max(a.height, b.height) + 56
canvas = Image.new("RGB", (2 * W + 30, H), "#222222")
font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf", 28)
draw = ImageDraw.Draw(canvas)
draw.text((10, 12), ll, fill="#ffffff", font=font)
draw.text((W + 40, 12), rl, fill="#ffffff", font=font)
canvas.paste(a, (0, 56))
canvas.paste(b, (W + 30, 56))
canvas.save(out)
