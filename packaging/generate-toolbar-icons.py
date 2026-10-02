"""Generate high-contrast Notepad++ toolbar resources from the approved logo.

Requires Python 3 and Pillow. The source SVG remains the vector master. Toolbar
icons deliberately use a full-bleed coral tile, enlarged M, and simplified node
mark because the original white app tile disappears in a crowded light toolbar.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_DIR = ROOT / "native" / "resources"
SOURCE = RESOURCE_DIR / "icon-source.svg"
EXPECTED_SHA256 = "81fd04cb574353c6167199f8159a830e4781712eef46b822371ed3be2e063757"
SIZES = (16, 24, 32, 48)
SCALE = 4


def validate_source() -> str:
    source = SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    observed = hashlib.sha256(source.encode("utf-8")).hexdigest()
    if observed != EXPECTED_SHA256:
        raise RuntimeError(
            f"Unexpected icon-source.svg SHA-256 {observed}; review the approved source before regenerating"
        )
    if 'viewBox="0 0 512 512"' not in source or ">M</text>" not in source:
        raise RuntimeError("The approved SVG geometry is not recognized")
    return source


def color(source: str, pattern: str) -> str:
    match = re.search(pattern, source)
    if match is None:
        raise RuntimeError(f"Could not read logo color with pattern: {pattern}")
    return match.group(1)


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        Path("C:/Windows/Fonts/seguisb.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise RuntimeError("Segoe UI Semibold/Bold or Arial Bold is required to generate the toolbar icon")


def render(source: str, size: int, dark_mode: bool, opaque_background: bool = False) -> Image.Image:
    canvas_size = size * SCALE
    background = (240, 240, 240, 255) if opaque_background else (0, 0, 0, 0)
    image = Image.new("RGBA", (canvas_size, canvas_size), background)
    draw = ImageDraw.Draw(image)
    factor = canvas_size / 512

    # Keep the approved coral and dark mark, but invert their visual weight for
    # toolbar scale: a saturated tile is much easier to locate than a white tile.
    source_mark = color(source, r'<text[^>]+fill="(#[0-9A-Fa-f]{6})"')
    source_coral = color(source, r'<path[^>]+stroke="(#[0-9A-Fa-f]{6})"')
    tile = "#FF686D" if dark_mode else "#E0444E"
    border = "#FFFFFF" if dark_mode else source_mark
    xy = tuple(round(value * factor) for value in (14, 14, 498, 498))
    radius = round(112 * factor)
    draw.rounded_rectangle(xy, radius=radius, fill=tile, outline=border, width=max(SCALE, round(12 * factor)))

    logo_font = font(round(250 * factor))
    draw.text((round(62 * factor), round(88 * factor)), "M", font=logo_font, fill="#FFFFFF")

    width = max(SCALE, round(28 * factor))
    points = [(round(310 * factor), round(342 * factor)),
              (round(402 * factor), round(342 * factor)),
              (round(402 * factor), round(426 * factor))]
    draw.line(points, fill=source_mark, width=width, joint="curve")
    radius_node = round(29 * factor)
    for x, y in points:
        draw.ellipse((x - radius_node, y - radius_node, x + radius_node, y + radius_node), fill=source_mark)

    # The coral source color is intentionally retained as provenance even though
    # the toolbar tile uses darker/lighter accessibility variants.
    if source_coral.upper() != "#FF5A5F":
        raise RuntimeError(f"Unexpected approved-logo coral color: {source_coral}")

    return image.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(source: str, path: Path, dark_mode: bool) -> None:
    images = [render(source, size, dark_mode) for size in SIZES]
    largest = images[-1]
    largest.save(path, format="ICO", append_images=images[:-1], sizes=[(size, size) for size in SIZES])


def main() -> None:
    source = validate_source()
    save_ico(source, RESOURCE_DIR / "toolbar-light.ico", dark_mode=False)
    save_ico(source, RESOURCE_DIR / "toolbar-dark.ico", dark_mode=True)
    render(source, 16, dark_mode=False, opaque_background=True).convert("RGB").save(
        RESOURCE_DIR / "toolbar-legacy.bmp", format="BMP"
    )
    print("Generated toolbar-light.ico, toolbar-dark.ico, and toolbar-legacy.bmp")


if __name__ == "__main__":
    main()
