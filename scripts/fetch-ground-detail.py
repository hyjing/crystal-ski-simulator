"""Export finer USGS bare-earth data on the existing tile's exact UTM footprint."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from io import BytesIO
import json,math,struct
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'public/data'
base=json.loads((ROOT/'crystal-dem.json').read_text());factor=4
w=(base['width']-1)*factor+1;h=(base['height']-1)*factor+1;s=base['spacing']/factor;x,y=base['originUTM']
source=base['sourceUrl'];bounds=[x-s/2,y-(h-.5)*s,x+(w-.5)*s,y+s/2]
p=dict(bbox=','.join(map(str,bounds)),bboxSR=32610,imageSR=32610,size=f'{w},{h}',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',adjustAspectRatio='false',f='image')
with urlopen(source+'/exportImage?'+urlencode(p),timeout=120) as r:im=Image.open(BytesIO(r.read()));im.load()
sx,sy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922]
values=list(im.getdata())
if im.mode!='F' or im.size!=(w,h) or abs(sx-s)>.001 or abs(sy-s)>.001 or not all(math.isfinite(v) and 0<v<5000 for v in values):raise ValueError('Invalid detailed elevation export')
(ROOT/'crystal-detail-dem.bin').write_bytes(struct.pack('<'+'f'*len(values),*values))
meta=dict(width=w,height=h,spacing=sx,originUTM=[west+sx/2,north-sy/2],epsg=32610,sourceUrl=source,verticalUnits='meters',encoding='Float32 little-endian',data='crystal-detail-dem.bin',exportSpacingIsNotSurveyResolution=True)
(ROOT/'crystal-detail-dem.json').write_text(json.dumps(meta,separators=(',',':')))
print('Saved detailed ground',w,h,sx,len(values)*4,flush=True)
