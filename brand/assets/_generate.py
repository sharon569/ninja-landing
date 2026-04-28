"""
NINJA brand asset generator.
Creates animated GIFs and PNGs for use in emails and brand materials.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

# ============================================================
# CORE: Draw shuriken on transparent canvas
# ============================================================

def draw_shuriken(size: int, bg_color=(255, 255, 255, 0)):
    """Draw the NINJA shuriken centered on a square canvas."""
    img = Image.new("RGBA", (size, size), bg_color)
    draw = ImageDraw.Draw(img)

    cx = cy = size / 2
    outer_r = size * 0.42
    inner_r = size * 0.165

    # 8 vertices alternating outer/inner — 4-pointed throwing star
    points = []
    for i in range(8):
        angle = -math.pi / 2 + i * math.pi / 4
        r = outer_r if i % 2 == 0 else inner_r
        points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))

    # Solid red fill
    draw.polygon(points, fill=(255, 42, 60))

    # Slight inner darker accent for depth (smaller polygon, deep red)
    inner_pts = []
    for i in range(8):
        angle = -math.pi / 2 + i * math.pi / 4
        r = (outer_r * 0.85) if i % 2 == 0 else (inner_r * 0.7)
        inner_pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    draw.polygon(inner_pts, fill=(180, 0, 27))

    # Re-draw outer outline (gold)
    draw.polygon(points, outline=(255, 209, 102), width=max(2, int(size * 0.012)))

    # Center disc — dark with gold ring
    rd = size * 0.075
    draw.ellipse(
        (cx - rd, cy - rd, cx + rd, cy + rd),
        fill=(10, 10, 10),
        outline=(255, 209, 102),
        width=max(1, int(size * 0.008)),
    )
    # Tiny gold pupil
    rd2 = size * 0.025
    draw.ellipse(
        (cx - rd2, cy - rd2, cx + rd2, cy + rd2),
        fill=(255, 209, 102),
    )

    return img


# ============================================================
# GIF #1 — Spinning shuriken on white (for email signature)
# ============================================================

def build_spinning_gif(out_path: str, size: int = 80, frames: int = 24, duration_ms: int = 50, bg=(255, 255, 255)):
    super_size = size * 4  # render bigger then downscale for smooth edges
    base = draw_shuriken(super_size, bg_color=(0, 0, 0, 0))

    gif_frames = []
    for i in range(frames):
        angle = i * (360 / frames)
        rotated = base.rotate(angle, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
        # Composite onto opaque background
        canvas = Image.new("RGBA", rotated.size, bg + (255,))
        canvas.paste(rotated, (0, 0), rotated)
        # Downscale w/ Lanczos for smooth edges
        small = canvas.resize((size, size), Image.LANCZOS)
        # Convert to P mode (palette) for GIF
        p = small.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=128)
        gif_frames.append(p)

    gif_frames[0].save(
        out_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"[ok] {out_path} - {frames} frames @ {duration_ms}ms = {frames*duration_ms}ms loop")


# ============================================================
# GIF #2 — Spinning shuriken on dark (for dark backgrounds)
# ============================================================

def build_spinning_dark(out_path: str, size: int = 80, frames: int = 24, duration_ms: int = 50):
    build_spinning_gif(out_path, size, frames, duration_ms, bg=(8, 9, 12))


# ============================================================
# PNG #1 — Static shuriken (transparent, large)
# ============================================================

def build_static_png(out_path: str, size: int = 1024):
    img = draw_shuriken(size, bg_color=(0, 0, 0, 0))
    img.save(out_path, "PNG", optimize=True)
    print(f"[ok] {out_path} - {size}x{size} transparent PNG")


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    import os
    HERE = os.path.dirname(__file__)

    # Animated GIFs
    build_spinning_gif(os.path.join(HERE, "shuriken-spin.gif"), size=80, frames=24, duration_ms=50)
    build_spinning_gif(os.path.join(HERE, "shuriken-spin-large.gif"), size=160, frames=30, duration_ms=40)
    build_spinning_dark(os.path.join(HERE, "shuriken-spin-dark.gif"), size=80, frames=24, duration_ms=50)

    # Static PNGs
    build_static_png(os.path.join(HERE, "shuriken-mark-1024.png"), size=1024)
    build_static_png(os.path.join(HERE, "shuriken-mark-512.png"), size=512)
    build_static_png(os.path.join(HERE, "shuriken-mark-256.png"), size=256)

    print("\nAll assets generated successfully.")
