"""Rebuild lossless-font and responsive background assets from checked-in originals.

Requires Pillow, fonttools and brotli. Run from the repository root.
"""
from pathlib import Path
from PIL import Image, ImageOps
from fontTools.ttLib import TTFont

assets = Path(__file__).resolve().parents[1] / "public" / "assets"
with Image.open(assets / "background.png") as source:
    source = ImageOps.exif_transpose(source).convert("RGB")
    for name, width in [("background.webp", 1920), ("background-mobile.webp", 900)]:
        image = source.copy()
        image.thumbnail((width, width * 2), Image.Resampling.LANCZOS)
        image.save(assets / name, "WEBP", quality=86, method=6)
        print(f"{name}: {(assets / name).stat().st_size:,} bytes")

for source in sorted((assets / "fonts").glob("*.otf")):
    with TTFont(source) as font:
        glyphs = font.getGlyphOrder()
        font.flavor = "woff2"
        target = source.with_suffix(".woff2")
        font.save(target)
    with TTFont(target) as result:
        assert result.getGlyphOrder() == glyphs, "Font conversion must preserve all glyphs"
    print(f"{target.name}: {target.stat().st_size:,} bytes; {len(glyphs):,} glyphs preserved")
