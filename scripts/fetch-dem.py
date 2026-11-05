"""Download and convert the public USGS elevation tile. Requires Pillow."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import argparse
import json
import math
from PIL import Image

SOURCE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
parser=argparse.ArgumentParser();parser.add_argument('--context',action='store_true');args=parser.parse_args()
params = dict(bbox='-121.51,46.91,-121.445,46.965', bboxSR=4326,
              imageSR=32610, size='257,321', format='tiff', pixelType='F32',
              interpolation='RSP_BilinearInterpolation', f='image')
if args.context:
    params.update(bbox='-121.9,46.75,-121.3,47.08',size='385,321')
with urlopen(SOURCE + '/exportImage?' + urlencode(params), timeout=90) as response:
    im = Image.open(BytesIO(response.read()))
    im.load()
if im.mode != 'F':
    raise ValueError('Expected Float32 GeoTIFF')
w, h = im.size
sx, sy, _ = im.tag_v2[33550]
_, _, _, west, north, _ = im.tag_v2[33922]
if abs(sx-sy) > 0.001:
    raise ValueError('Expected square pixels')
values = list(im.getdata())
if not all(math.isfinite(v) and 0 < v < 5000 for v in values):
    raise ValueError('Invalid or missing elevation values')
data = dict(width=w, height=h, spacing=sx,
            originUTM=[west+sx/2, north-sy/2], epsg=32610,
            source='USGS 3DEP Elevation ImageServer', sourceUrl=SOURCE,
            retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),
            verticalUnits='meters', heights=[round(v, 2) for v in values])
output = Path(__file__).resolve().parents[1] / ('public/data/context-dem.json' if args.context else 'public/data/crystal-dem.json')
output.parent.mkdir(parents=True, exist_ok=True)
temporary = output.with_suffix('.json.tmp')
temporary.write_text(json.dumps(data, separators=(',', ':')))
temporary.replace(output)
print(f'Wrote {w} × {h} elevations, spacing {sx:.3f} m → {output}')
