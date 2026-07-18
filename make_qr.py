# -*- coding: utf-8 -*-
"""Generate a styled QR card PNG for the B2 Words app URL (pure PIL rendering)."""
from reportlab.graphics.barcode.qr import QrCodeWidget
from PIL import Image, ImageDraw, ImageFont

URL = 'https://ronas220.github.io/b2-words/'
FONT = r'C:\Users\user\AppData\Roaming\kimi-desktop\daimon-share\daimon\runtime\python\fonts\NotoSansSC-Bold.ttf'
OUT = r'C:\Users\user\Documents\kimi\workspace\b2-words-app\b2-words-qr.png'

# 1. QR matrix
qw = QrCodeWidget(URL, barLevel='H')
qw.qr.make()
n = qw.qr.getModuleCount()
quiet = 4
total = n + 2 * quiet
qs = 760  # qr block pixels
cell = qs // total
qs_exact = cell * total
qr_img = Image.new('RGB', (qs_exact, qs_exact), 'white')
qd = ImageDraw.Draw(qr_img)
for r in range(n):
    for c in range(n):
        if qw.qr.isDark(r, c):
            x0, y0 = (c + quiet) * cell, (r + quiet) * cell
            qd.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=(17, 24, 39))

# 2. Card: 1200 x 1500, diagonal indigo->violet gradient
W, H = 1200, 1500
c1, c2 = (79, 70, 229), (124, 58, 237)
card = Image.new('RGB', (W, H))
px = card.load()
for y in range(H):
    ty = y / H
    for x in range(0, W, 4):
        t = (x / W + ty) / 2
        col = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
        for dx in range(4):
            if x + dx < W:
                px[x + dx, y] = col

dr = ImageDraw.Draw(card)

# white rounded panel
mx, my = 110, 130
pw, ph = W - 2 * mx, H - 2 * my
dr.rounded_rectangle([mx, my, mx + pw, my + ph], radius=48, fill='white')

qx, qy = mx + (pw - qs_exact) // 2, my + 120
card.paste(qr_img, (qx, qy))

def center_text(y, text, size, color):
    f = ImageFont.truetype(FONT, size)
    tw = dr.textlength(text, font=f)
    dr.text(((W - tw) / 2, y), text, font=f, fill=color)

base = qy + qs_exact
center_text(base + 70, 'B2 Words', 84, (31, 41, 55))
center_text(base + 185, 'Тренажёр английских слов', 44, (75, 85, 99))
center_text(base + 280, 'Наведи камеру телефона', 40, (99, 102, 241))
center_text(base + 350, 'ronas220.github.io/b2-words', 34, (148, 163, 184))

card.save(OUT)
print('saved', OUT, card.size, '| qr modules:', n)
