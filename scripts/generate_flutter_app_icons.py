from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FLUTTER_APP = ROOT / 'flutter_app'
SOURCE_DIR = FLUTTER_APP / 'branding'
SOURCE_PATH = SOURCE_DIR / 'app-icon-1024.png'

IOS_APPICON_DIR = FLUTTER_APP / 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
MACOS_APPICON_DIR = FLUTTER_APP / 'macos/Runner/Assets.xcassets/AppIcon.appiconset'
ANDROID_RES_DIR = FLUTTER_APP / 'android/app/src/main/res'
WEB_DIR = FLUTTER_APP / 'web'

SIZE = 1024
CARD_TOP = '#A53D5E'
CARD_MID = '#4A2A68'
CARD_BOTTOM = '#155B59'
CARD_EDGE = '#E8B5A7'
ICON_STROKE = '#F8FBFF'
SHADOW = '#140C23'


def hex_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip('#')
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (alpha,)


def make_linear_gradient(size: tuple[int, int], start: str, end: str, horizontal: bool = False) -> Image.Image:
    width, height = size
    base = Image.new('RGBA', size)
    draw = ImageDraw.Draw(base)
    start_rgb = hex_rgba(start)
    end_rgb = hex_rgba(end)

    steps = width if horizontal else height
    for step in range(steps):
        t = step / max(steps - 1, 1)
        color = tuple(
            round(start_rgb[channel] * (1 - t) + end_rgb[channel] * t)
            for channel in range(4)
        )
        if horizontal:
            draw.line([(step, 0), (step, height)], fill=color)
        else:
            draw.line([(0, step), (width, step)], fill=color)
    return base


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def add_glow(canvas: Image.Image, center: tuple[int, int], radius: int, color: str, alpha: int) -> None:
    glow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=hex_rgba(color, alpha))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius // 2)))


def draw_cube_icon(canvas: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    offset_x = 512
    offset_y = 500
    size = 352
    half = size // 2
    quarter = size // 4

    top = (offset_x, offset_y - half)
    left = (offset_x - half, offset_y - quarter)
    right = (offset_x + half, offset_y - quarter)
    center = (offset_x, offset_y)
    lower_left = (offset_x - half, offset_y + quarter)
    lower_right = (offset_x + half, offset_y + quarter)
    bottom = (offset_x, offset_y + half)

    stroke = 22
    joint = 'curve'
    color = hex_rgba(ICON_STROKE, 255)

    draw.line([top, right, center, left, top], fill=color, width=stroke, joint=joint)
    draw.line([left, lower_left, bottom, lower_right, right], fill=color, width=stroke, joint=joint)
    draw.line([top, top], fill=color, width=stroke, joint=joint)
    draw.line([top, center], fill=color, width=stroke, joint=joint)
    draw.line([left, center], fill=color, width=stroke, joint=joint)
    draw.line([right, center], fill=color, width=stroke, joint=joint)
    draw.line([center, bottom], fill=color, width=stroke, joint=joint)

    cap = round(stroke * 0.72)
    for x, y in [top, left, right, center, lower_left, lower_right, bottom]:
        draw.ellipse((x - cap, y - cap, x + cap, y + cap), fill=color)


def draw_icon() -> Image.Image:
    base = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

    card_shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    card_shadow_draw = ImageDraw.Draw(card_shadow)
    card_shadow_draw.rounded_rectangle((148, 154, 876, 882), radius=204, fill=hex_rgba(SHADOW, 98))
    base.alpha_composite(card_shadow.filter(ImageFilter.GaussianBlur(34)))

    card = make_linear_gradient((728, 728), CARD_TOP, CARD_BOTTOM)
    card_mid = make_linear_gradient((728, 728), CARD_MID, CARD_BOTTOM, horizontal=True)
    card = Image.blend(card, card_mid, 0.58)
    card_mask = rounded_mask((728, 728), 204)
    base.paste(card, (148, 148), card_mask)

    sheen = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sheen_draw = ImageDraw.Draw(sheen)
    sheen_draw.ellipse((210, 154, 700, 436), fill=hex_rgba('#FFD4C3', 34))
    sheen_draw.ellipse((404, 488, 868, 884), fill=hex_rgba('#67D7C7', 26))
    sheen_draw.ellipse((132, 238, 470, 704), fill=hex_rgba('#F25D73', 20))
    sheen_draw.ellipse((430, 144, 860, 484), fill=hex_rgba('#B07CFF', 20))
    base.alpha_composite(sheen.filter(ImageFilter.GaussianBlur(34)))

    ambient = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ambient_draw = ImageDraw.Draw(ambient)
    ambient_draw.ellipse((166, 130, 874, 878), fill=hex_rgba('#692B74', 22))
    ambient_draw.ellipse((212, 286, 890, 930), fill=hex_rgba('#0EA38C', 14))
    base.alpha_composite(ambient.filter(ImageFilter.GaussianBlur(46)))

    card_outline = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    card_outline_draw = ImageDraw.Draw(card_outline)
    card_outline_draw.rounded_rectangle(
        (148, 148, 876, 876),
        radius=204,
        outline=hex_rgba(CARD_EDGE, 86),
        width=4,
    )
    base.alpha_composite(card_outline)

    icon_shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw_cube_icon(icon_shadow)
    ambient_shadow = icon_shadow.filter(ImageFilter.GaussianBlur(18))
    ambient_tint = Image.new('RGBA', (SIZE, SIZE), hex_rgba('#120D20', 90))
    ambient_tint.putalpha(ambient_shadow.split()[-1])
    base.alpha_composite(ambient_tint)

    glow_shadow = icon_shadow.filter(ImageFilter.GaussianBlur(8))
    glow_tint = Image.new('RGBA', (SIZE, SIZE), hex_rgba('#7EDACC', 34))
    glow_tint.putalpha(glow_shadow.split()[-1])
    base.alpha_composite(glow_tint)

    draw_cube_icon(base)

    return base


def parse_apple_appicon_entries(contents_path: Path) -> dict[str, int]:
    data = json.loads(contents_path.read_text())
    output: dict[str, int] = {}
    for item in data['images']:
        filename = item.get('filename')
        if not filename:
            continue
        size_text = item['size'].split('x')[0]
        scale = int(item['scale'].rstrip('x'))
        pixels = round(float(size_text) * scale)
        output[filename] = pixels
    return output


def export_square(image: Image.Image, path: Path, size: int) -> None:
    resized = image.resize((size, size), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(path)


def main() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    master = draw_icon()
    master.save(SOURCE_PATH)

    android_sizes = {
        'mipmap-mdpi/ic_launcher.png': 48,
        'mipmap-hdpi/ic_launcher.png': 72,
        'mipmap-xhdpi/ic_launcher.png': 96,
        'mipmap-xxhdpi/ic_launcher.png': 144,
        'mipmap-xxxhdpi/ic_launcher.png': 192,
    }
    for relative_path, size in android_sizes.items():
        export_square(master, ANDROID_RES_DIR / relative_path, size)

    for filename, size in parse_apple_appicon_entries(IOS_APPICON_DIR / 'Contents.json').items():
        export_square(master, IOS_APPICON_DIR / filename, size)

    for filename, size in parse_apple_appicon_entries(MACOS_APPICON_DIR / 'Contents.json').items():
        export_square(master, MACOS_APPICON_DIR / filename, size)

    export_square(master, WEB_DIR / 'favicon.png', 64)
    export_square(master, WEB_DIR / 'icons/Icon-192.png', 192)
    export_square(master, WEB_DIR / 'icons/Icon-512.png', 512)
    export_square(master, WEB_DIR / 'icons/Icon-maskable-192.png', 192)
    export_square(master, WEB_DIR / 'icons/Icon-maskable-512.png', 512)

    print(f'Generated app icon assets from {SOURCE_PATH.relative_to(ROOT)}')


if __name__ == '__main__':
    main()