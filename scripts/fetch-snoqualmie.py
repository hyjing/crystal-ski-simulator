"""Build per-area USGS/NAIP packs. Public data, cached downloads; requires Pillow."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo
import json, math, argparse, subprocess
from PIL import Image, ImageFilter
ROOT=Path(__file__).resolve().parents[1]/'public/data'
DEM='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
NAIP='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
AREAS={'alpental':('-121.46,47.426,-121.418,47.455','513,513'),'west':('-121.448,47.41,-121.400,47.443','513,513'),'central':('-121.44,47.392,-121.392,47.429','513,577'),'east':('-121.423,47.37,-121.38,47.408','449,577'),'context':('-121.68,47.27,-121.22,47.60','513,577')}
def request(url):
 return subprocess.run(['curl','-fsSL','--retry','1','--max-time','75',url],check=True,capture_output=True).stdout
def build(area):
 folder=ROOT/'snoqualmie'/area;folder.mkdir(parents=True,exist_ok=True);bbox,size=AREAS[area]
 if not (folder/'dem.json').exists():
  p=dict(bbox=bbox,bboxSR=4326,imageSR=32610,size=size,format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',f='image')
  im=Image.open(BytesIO(request(DEM+'/exportImage?'+urlencode(p))));im.load();w,h=im.size;sx,sy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922];v=list(im.getdata())
  if im.mode!='F' or abs(sx-sy)>.001 or not all(math.isfinite(x) and 0<x<5000 for x in v):raise ValueError('Invalid DEM')
  data=dict(width=w,height=h,spacing=sx,originUTM=[west+sx/2,north-sy/2],epsg=32610,sourceUrl=DEM,source='USGS 3DEP',verticalUnits='meters',exportSpacingIsNotSurveyResolution=True,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),heights=[round(x,2) for x in v]);(folder/'dem.json').write_text(json.dumps(data,separators=(',',':')))
 if area=='context' and (folder/'aerial.json').exists():
  print('context cached',flush=True);return
 data=json.loads((folder/'dem.json').read_text());w,h,s=data['width'],data['height'],data['spacing'];x,y=data['originUTM'];bounds=[x-s/2,y-(h-.5)*s,x+(w-.5)*s,y+s/2]
 if not (folder/'landcover.json').exists():
  p=dict(bbox=','.join(map(str,bounds)),bboxSR=32610,imageSR=32610,size='1536,1536' if area!='context' else '2048,2048',format='jpg',bandIds='0,1,2',interpolation='RSP_BilinearInterpolation',f='json',adjustAspectRatio='false');meta=json.loads(request(NAIP+'/exportImage?'+urlencode(p)))
  if 'href' not in meta:raise ValueError(meta)
  img=request(meta['href']);(folder/'aerial.jpg').write_bytes(img)
  if area=='context':
   (folder/'aerial.json').write_text(json.dumps(dict(extent=meta['extent'],source='USGS / USDA NAIP',sourceUrl=NAIP,image='aerial.jpg'),separators=(',',':')));print('context imagery saved',flush=True);return
  im=Image.open(BytesIO(img)).convert('RGB');rgb=list(im.getdata());iw,ih=im.size
  mask=bytearray(iw*ih)
  for i,(r,g,b) in enumerate(rgb):
   if g>r*.95 and g>b*1.03 and 13<g and .2126*r+.7152*g+.0722*b<125:mask[i]=255
  Image.frombytes('L',(iw,ih),bytes(mask)).filter(ImageFilter.GaussianBlur(1)).save(folder/'canopy.png')
  small=Image.frombytes('L',(iw,ih),bytes(mask)).resize((w,h),Image.Resampling.BOX)
  land=dict(width=w,height=h,values=[round(v/255,3) for v in small.getdata()],extent=meta['extent'],source='USGS / USDA NAIP',sourceUrl=NAIP,image='aerial.jpg',imageSize=[iw,ih],classification='Heuristic RGB vegetation likelihood; approximate, not surveyed tree positions')
  (folder/'landcover.json').write_text(json.dumps(land,separators=(',',':')))
  # Deterministic, separated dark-canopy candidates in georeferenced imagery.
  pixels=[];cells={};sx=(meta['extent']['xmax']-meta['extent']['xmin'])/iw;sy=(meta['extent']['ymax']-meta['extent']['ymin'])/ih
  for v in range(4,ih-4,3):
   for u in range(4,iw-4,3):
    if mask[v*iw+u]!=255 or ((u*73856093)^(v*19349663))%7>1:continue
    e=u*sx;n=v*sy;gx=int(e/10);gz=int(n/10)
    if any((e-a)**2+(n-b)**2<100 for dx in [-1,0,1] for dz in [-1,0,1] for a,b in cells.get((gx+dx,gz+dz),[])):continue
    pixels.append([u,v,round(.72+(((u*17+v*31)%100)/100)*.4,2)]);cells.setdefault((gx,gz),[]).append((e,n))
  (folder/'vegetation.json').write_text(json.dumps(dict(source='USGS / USDA NAIP',sourceUrl=NAIP,image='aerial.jpg',extent=meta['extent'],imageSize=[iw,ih],method='Heuristic separated dark-canopy candidates; no surveyed tree positions',minimumSpacing=10,pixels=pixels),separators=(',',':')))
 print(area,data['width'],data['height'],round(s,2),'m export spacing',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('areas',nargs='*',default=list(AREAS));a=p.parse_args()
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(build,a.areas or list(AREAS)))
