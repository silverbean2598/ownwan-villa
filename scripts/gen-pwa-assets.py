"""앱처럼 쓰기(PWA)용 그림 만들기: 마스커블 아이콘 · 바로가기 아이콘 · 아이폰 시작 화면.

    python3 scripts/gen-pwa-assets.py

public/icon-512.png(캐릭터 얼굴 앱 아이콘)에서 만든다. 아이콘을 바꾸면 다시 돌린다.
시작 화면 <link> 줄은 끝에 출력되니 index.html 과 맞는지 확인한다.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
ICON = Image.open(PUB / "icon-512.png").convert("RGB")
BG = ICON.getpixel((0, 0))  # 아이콘 바탕색 (모서리 픽셀)
INK = (91, 70, 64)  # 캐릭터 외곽선과 같은 갈색 잉크


def maskable():
    """얼굴(머리 bbox 중심 y≈225)을 한가운데 두고 87% 로 줄인다.
    머리 끝까지 반지름 ≈170px < 안전 영역(지름 80%) 반지름 205px. 몸은 아래 가장자리까지 이어진다."""
    s = 0.87
    size = round(512 * s)
    small = ICON.resize((size, size), Image.LANCZOS)
    out = Image.new("RGB", (512, 512), BG)
    out.paste(small, ((512 - size) // 2, max(round(256 - 225 * s), 512 - size)))  # 몸이 아래 끝까지 닿게
    out.save(PUB / "icon-maskable-512.png", optimize=True)


def shortcut(name, draw_glyph):
    """바로가기 아이콘 96x96: 아이콘 바탕색 둥근 네모 + 갈색 그림 (4배로 그리고 줄여 매끈하게)"""
    k = 4
    im = Image.new("RGBA", (96 * k, 96 * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, 96 * k - 1, 96 * k - 1), radius=22 * k, fill=BG + (255,))
    draw_glyph(d, k)
    im.resize((96, 96), Image.LANCZOS).save(PUB / name, optimize=True)


def glyph_check(d, k):
    # 동그라미 안 체크 표시 (오늘 운동 인증)
    d.ellipse((22 * k, 22 * k, 74 * k, 74 * k), outline=INK, width=6 * k, fill=(255, 255, 255, 255))
    d.line([(35 * k, 49 * k), (45 * k, 59 * k), (62 * k, 40 * k)], fill=INK, width=7 * k, joint="curve")


def glyph_villa(d, k):
    # 지붕 + 창문 네 개 + 문 (아파트)
    d.polygon([(48 * k, 18 * k), (78 * k, 40 * k), (18 * k, 40 * k)], fill=INK)
    d.rectangle((24 * k, 38 * k, 72 * k, 78 * k), fill=(255, 255, 255, 255), outline=INK, width=5 * k)
    for x in (32, 54):
        for y in (45, 58):
            d.rectangle((x * k, y * k, (x + 10) * k, (y + 8) * k), fill=(255, 227, 160, 255), outline=INK, width=2 * k)
    d.rectangle((44 * k, 66 * k, 52 * k, 78 * k), fill=INK)


# 아이폰 시작 화면: (화면 폭 pt, 높이 pt, 배율). 흔한 기기만 (나머지 기기는 흰 화면으로 시작한다)
SPLASH = [
    (440, 956, 3),  # 16 Pro Max · 17 Pro Max
    (402, 874, 3),  # 16 Pro · 17 · 17 Pro
    (430, 932, 3),  # 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
    (393, 852, 3),  # 14 Pro · 15 · 15 Pro · 16
    (390, 844, 3),  # 12 · 13 · 14
    (375, 667, 2),  # SE 2 · SE 3 · 8
]


def splash():
    (PUB / "splash").mkdir(exist_ok=True)
    links = []
    for w, h, r in SPLASH:
        W, H = w * r, h * r
        out = Image.new("RGB", (W, H), (255, 255, 255))
        side = 112 * r  # 아이콘 112pt (둥근 모서리)
        icon = ICON.resize((side, side), Image.LANCZOS)
        mask = Image.new("L", (side, side), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=round(side * 0.225), fill=255)
        out.paste(icon, ((W - side) // 2, (H - side) // 2 - 24 * r), mask)
        name = f"splash/apple-splash-{W}x{H}.png"
        # 흰 바탕이 대부분이라 색을 줄여도 티가 나지 않는다 (파일을 작게)
        out.quantize(colors=96, method=Image.MEDIANCUT).save(PUB / name, optimize=True)
        links.append(
            f'<link rel="apple-touch-startup-image" href="/{name}" media="(device-width: {w}px) and (device-height: {h}px)'
            f' and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)" />'
        )
    return links


if __name__ == "__main__":
    maskable()
    shortcut("shortcut-certify-96.png", glyph_check)
    shortcut("shortcut-villa-96.png", glyph_villa)
    print("\n".join(splash()))
