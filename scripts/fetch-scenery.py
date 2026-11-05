"""Fetch georeferenced USGS Rainier DEM and public-domain NAIP scenery textures."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import json, math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'public/data'
DEM='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
NAIP='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
def get(url):
    with urlopen(url,timeout=120) as r:return r.read()
# UTM bounds include the summit, Emmons / Winthrop glaciers and northeast flank.
p=dict(bbox='-121.86,46.79,-121.62,46.94',bboxSR=4326,imageSR=32610,size='513,481',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image')
im=Image.open(BytesIO(get(DEM+'/exportImage?'+urlencode(p))));im.load()
sx,sy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922]
values=list(im.getdata())
if im.mode!='F' or abs(sx-sy)>.001 or not all(math.isfinite(v) and 0<v<5000 for v in values):raise ValueError('Invalid DEM')
d=dict(width=im.width,height=im.height,spacing=sx,originUTM=[west+sx/2,north-sy/2],epsg=32610,source='USGS 3DEP Elevation ImageServer',sourceUrl=DEM,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),verticalUnits='meters',heights=[round(v,2) for v in values])
(ROOT/'rainier-dem.json').write_text(json.dumps(d,separators=(',',':')))
print('Rainier DEM',im.size,sx,flush=True)
for name in ['rainier','context']:
    grid=json.loads((ROOT/(name+'-dem.json')).read_text());x,y=grid['originUTM'];s=grid['spacing'];w,h=grid['width'],grid['height']
    bbox=[x-s/2,y-(h-.5)*s,x+(w-.5)*s,y+s/2]
    size=[2048,round(2048*h/w)]
    p=dict(bbox=','.join(map(str,bbox)),bboxSR=32610,imageSR=32610,size=','.join(map(str,size)),format='jpg',bandIds='0,1,2',interpolation='RSP_BilinearInterpolation',f='json',adjustAspectRatio='false')
    meta=json.loads(get(NAIP+'/exportImage?'+urlencode(p)))
    if 'href' not in meta:raise ValueError(meta)
    data=get(meta['href']);img=Image.open(BytesIO(data));img.load()
    if list(img.size)!=size:raise ValueError('Image size mismatch')
    (ROOT/(name+'-aerial.jpg')).write_bytes(data)
    (ROOT/(name+'-aerial.json')).write_text(json.dumps(dict(sourceUrl=NAIP,extent=meta['extent'],size=size,retrieved=d['retrieved'],description='Snow-free public-domain USGS / USDA NAIP orthoimagery; winter appearance is authored'),separators=(',',':')))
    print(name,'aerial',size,len(data),flush=True)
