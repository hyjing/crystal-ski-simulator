"""Fetch public NAIP RGB imagery and derive a heuristic vegetation mask. Requires Pillow."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from datetime import datetime
from zoneinfo import ZoneInfo
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
dem=json.loads((ROOT/'public/data/crystal-dem.json').read_text())
x,y=dem['originUTM'];s=dem['spacing'];w=dem['width'];h=dem['height']
bbox=','.join(map(str,[x-s/2,y-(h-.5)*s,x+(w-.5)*s,y+s/2]))
params=dict(bbox=bbox,bboxSR=32610,imageSR=32610,size=f'{w*4},{h*4}',format='jpg',bandIds='0,1,2',interpolation='RSP_BilinearInterpolation',f='json')
with urlopen(SOURCE+'/exportImage?'+urlencode(params),timeout=90) as response:
    metadata=json.load(response)
if 'href' not in metadata:
    raise ValueError(metadata)
with urlopen(metadata['href'],timeout=90) as response:
    image_bytes=response.read()
output=ROOT/'public/data/crystal-aerial.jpg'
output.write_bytes(image_bytes)
im=Image.open(output).convert('RGB');pixels=list(im.getdata())
if im.size!=(w*4,h*4):
    raise ValueError('Unexpected image export dimensions')
values=[]
for row in range(h):
    for col in range(w):
        block=[pixels[(row*4+dz)*im.width+col*4+dx] for dz in range(4) for dx in range(4)]
        hits=sum(g>r*.95 and g>b*1.03 and .2126*r+.7152*g+.0722*b<105 and g>13 for r,g,b in block)
        values.append(round(hits/16,3))
mask=dict(width=w,height=h,values=values,source='USGS/USDA NAIP public-domain orthoimagery',sourceUrl=SOURCE,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),imageSize=list(im.size),extent=metadata['extent'],classification='Heuristic RGB vegetation likelihood; not a surveyed forest map',image='crystal-aerial.jpg')
(ROOT/'public/data/crystal-landcover.json').write_text(json.dumps(mask,separators=(',',':')))
print('Wrote georeferenced aerial image and vegetation likelihood mask')
