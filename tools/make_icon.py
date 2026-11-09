"""Draws the app icon (original artwork): a plate ring with a leaf on green. Usage: python make_icon.py out.png"""
import sys
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGB", (S, S), (27, 116, 75))
d = ImageDraw.Draw(img)
# soft lighter circle background
d.ellipse((90, 90, S - 90, S - 90), fill=(36, 138, 91))
# plate ring
d.ellipse((210, 210, S - 210, S - 210), outline=(255, 255, 255), width=56)
# progress arc (like a calorie ring), warm accent
d.arc((210, 210, S - 210, S - 210), start=-90, end=150, fill=(255, 214, 102), width=56)
# leaf in the middle
leaf = Image.new("L", (S, S), 0)
ld = ImageDraw.Draw(leaf)
ld.ellipse((390, 330, 640, 700), fill=255)
leaf = leaf.rotate(-35, center=(S / 2, S / 2), resample=Image.BICUBIC)
img.paste((255, 255, 255), mask=leaf)
d = ImageDraw.Draw(img)
d.line((420, 640, 610, 400), fill=(27, 116, 75), width=18)
img.save(sys.argv[1])
