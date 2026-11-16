"""Bake Annapurna relief from Mapzen's public Terrarium tiles (Pillow + NumPy)."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import math
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / "whitepeak-terrarium"
CACHE.mkdir(exist_ok=True)
ZOOM = 11
SIZE = 641
SPACING = 96
CENTER_LAT = 28.276
CENTER_LON = 83.926
HORIZONTAL_SCALE = .73


def tile_elevation(tile):
    x, y = tile
    cached = CACHE / f"{ZOOM}-{x}-{y}.png"
    if not cached.exists():
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png"
        raw = subprocess.run(["curl", "-fsSL", "--max-time", "30", "--retry", "2", url],
                             check=True, capture_output=True).stdout
        cached.write_bytes(raw)
    pixels = np.asarray(Image.open(BytesIO(cached.read_bytes())).convert("RGB"), dtype=np.float32)
    return x, y, pixels[:, :, 0] * 256 + pixels[:, :, 1] + pixels[:, :, 2] / 256 - 32768


def main():
    axis = (np.arange(SIZE) - (SIZE - 1) / 2) * SPACING / HORIZONTAL_SCALE
    # In Whitepeak, positive z points down the ski run and toward Annapurna.
    lon = CENTER_LON + axis / (111320 * math.cos(math.radians(CENTER_LAT)))
    lat = CENTER_LAT + axis / 111132
    tx = (lon + 180) / 360 * 2**ZOOM
    ty = (1 - np.arcsinh(np.tan(np.deg2rad(lat))) / math.pi) / 2 * 2**ZOOM

    x0, x1 = math.floor(tx.min()) - 1, math.floor(tx.max()) + 1
    y0, y1 = math.floor(ty.min()) - 1, math.floor(ty.max()) + 1
    tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    mosaic = np.empty(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float32)
    with ThreadPoolExecutor(max_workers=8) as pool:
        for x, y, heights in pool.map(tile_elevation, tiles):
            row, col = (y - y0) * 256, (x - x0) * 256
            mosaic[row:row + 256, col:col + 256] = heights

    u, v = np.meshgrid((tx - x0) * 256 - .5, (ty - y0) * 256 - .5)
    ix, iy = u.astype(int), v.astype(int)
    fx, fy = u - ix, v - iy
    elevation = ((1 - fy) * ((1 - fx) * mosaic[iy, ix] + fx * mosaic[iy, ix + 1])
                 + fy * ((1 - fx) * mosaic[iy + 1, ix] + fx * mosaic[iy + 1, ix + 1]))
    if not np.isfinite(elevation).all() or not 7800 < elevation.max() < 8400:
        raise ValueError("The elevation grid is invalid or misses Annapurna.")
    relief = np.round(elevation * 1.16 + 450).astype("<u2")
    path = ROOT / "public" / "data" / "whitepeak" / "annapurna-relief.bin"
    path.parent.mkdir(parents=True, exist_ok=True)
    relief.tofile(path)
    print(f"{len(tiles)} tiles, {relief.shape}, Whitepeak peak {relief.max()} m")


if __name__ == "__main__":
    main()
