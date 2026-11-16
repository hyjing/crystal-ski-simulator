"""Bake Annapurna relief from Mapzen's public Terrarium tiles (Pillow + NumPy)."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import argparse
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
    zoom, x, y = tile
    cached = CACHE / f"{zoom}-{x}-{y}.png"
    if not cached.exists():
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png"
        raw = subprocess.run(["curl", "-fsSL", "--max-time", "30", "--retry", "2", url],
                             check=True, capture_output=True).stdout
        cached.write_bytes(raw)
    pixels = np.asarray(Image.open(BytesIO(cached.read_bytes())).convert("RGB"), dtype=np.float32)
    return x, y, pixels[:, :, 0] * 256 + pixels[:, :, 1] + pixels[:, :, 2] / 256 - 32768


def sample_elevation(x, z, zoom):
    x, z = x / HORIZONTAL_SCALE, z / HORIZONTAL_SCALE
    # In Whitepeak, positive z points down the ski run and toward Annapurna.
    lon = CENTER_LON + x / (111320 * math.cos(math.radians(CENTER_LAT)))
    lat = CENTER_LAT + z / 111132
    tx = (lon + 180) / 360 * 2**zoom
    ty = (1 - np.arcsinh(np.tan(np.deg2rad(lat))) / math.pi) / 2 * 2**zoom

    x0, x1 = math.floor(tx.min()) - 1, math.floor(tx.max()) + 1
    y0, y1 = math.floor(ty.min()) - 1, math.floor(ty.max()) + 1
    tiles = [(zoom, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
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
    return elevation


def bake_relief(path):
    axis = (np.arange(SIZE) - (SIZE - 1) / 2) * SPACING
    elevation = sample_elevation(axis, axis, ZOOM)
    if not np.isfinite(elevation).all() or not 7800 < elevation.max() < 8400:
        raise ValueError("The elevation grid is invalid or misses Annapurna.")
    relief = np.round(elevation * 1.16 + 450).astype("<u2")
    relief.tofile(path / "annapurna-relief.bin")
    print(f"{relief.shape}, Whitepeak peak {relief.max()} m")


def bake_surface(path):
    # These world bounds also define the UV projection in whitepeak-relief.js.
    size = 1024
    dx, dz = 44000 / size, 30000 / size
    x = -22000 + (np.arange(size) + .5) * dx
    z = 1000 + (np.arange(size) + .5) * dz
    height = sample_elevation(x, z, 12) * 1.16 + 450
    slope_z, slope_x = np.gradient(height, dz, dx)
    normal_length = np.sqrt(1 + slope_x**2 + slope_z**2)

    # Sample the surrounding terrain at multiple radii. Positive relief marks
    # enclosed gullies and negative relief marks exposed ribs and ridge crests.
    shelter = np.zeros_like(height)
    for radius, weight in [(120, .48), (320, .33), (720, .19)]:
        pad_x, pad_z = round(radius / dx), round(radius / dz)
        padded = np.pad(height, ((pad_z, pad_z), (pad_x, pad_x)), mode="edge")
        neighbors = np.zeros_like(height)
        for ox, oz in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]:
            col = pad_x + round(ox * pad_x * (.707 if oz else 1))
            row = pad_z + round(oz * pad_z * (.707 if ox else 1))
            neighbors += padded[row:row+size, col:col+size]
        shelter += weight * (neighbors / 8 - height) / radius
    packed = np.stack((.5 - .5 * slope_x / normal_length,
                       .5 - .5 * slope_z / normal_length,
                       .5 + shelter * 2.5), axis=-1)
    image = np.round(np.clip(packed, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(image).save(path / "annapurna-surface.png", optimize=True)
    print(f"{image.shape}, Annapurna normals and landforms")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--surface-only", action="store_true")
    args = parser.parse_args()
    path = ROOT / "public" / "data" / "whitepeak"
    path.mkdir(parents=True, exist_ok=True)
    if not args.surface_only:
        bake_relief(path)
    bake_surface(path)


if __name__ == "__main__":
    main()
