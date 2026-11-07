"""
Remove the white card-background fringes left in the concept-art PNG pack.

Reads   art/symbols-original/<id>.png   (the untouched pack)
Writes  public/assets/symbols/<id>.png        (cleaned, same filenames)
        public/assets/symbols/blur/<id>.png   (vertical motion-blur copy for spinning reels)

Method: keep only large solid connected regions of the artwork (drops
speckled halo and the straight crop lines), then peel off up to two rings of
pale, low-saturation edge pixels and feather the new edge by one pixel.

    python3 scripts/clean-symbols.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC = Path("art/symbols-original")
DST = Path("public/assets/symbols")


def clean(img: Image.Image) -> Image.Image:
    a = np.array(img.convert("RGBA")).astype(np.int32)
    rgb, al = a[..., :3], a[..., 3]
    solid = al > 200
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= max(300, sizes.max() * 0.04)]
    keep = np.isin(lab, keep_ids)
    keep = ndimage.binary_fill_holes(keep)
    sat = rgb.max(-1) - rgb.min(-1)
    pale = (sat < 38) & (rgb.min(-1) > 120)
    for _ in range(2):
        edge = keep & ~ndimage.binary_erosion(keep)
        keep &= ~(edge & pale)
    keep = ndimage.binary_opening(keep, iterations=1) | (keep & ndimage.binary_erosion(keep))
    mask = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    m = np.array(mask).astype(np.int32)
    out = a.copy()
    out[..., 3] = np.minimum(al, m)
    out[out[..., 3] == 0] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def motion_blur(img: Image.Image, length: int = 15) -> Image.Image:
    """Vertical motion blur on premultiplied alpha so edges don't go dark."""
    a = np.array(img).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    k = np.ones(length, np.float32) / length
    out = ndimage.convolve1d(a, k, axis=0, mode="constant")
    rgb = np.where(out[..., 3:4] > 1e-4, out[..., :3] / np.maximum(out[..., 3:4], 1e-4), 0)
    res = np.concatenate([rgb, out[..., 3:4]], -1)
    return Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), "RGBA")


def main():
    files = sorted(SRC.glob("*.png"))
    if not files:
        sys.exit(f"No PNGs in {SRC}")
    (DST / "blur").mkdir(parents=True, exist_ok=True)
    for f in files:
        c = clean(Image.open(f))
        c.save(DST / f.name, optimize=True)
        motion_blur(c).resize((128, 128), Image.LANCZOS).save(DST / "blur" / f.name, optimize=True)
        print("cleaned", f.name)


if __name__ == "__main__":
    main()
