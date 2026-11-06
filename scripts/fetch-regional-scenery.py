"""Georegistered regional scenery: finer 3DEP + newly exported NAIP tiles, not upscaling."""
from pathlib import Path
from urllib.parse import urlencode
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
import json,math,subprocess,argparse
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]/'public/data'
DEM='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
NAIP='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
def get(url):return subprocess.run(['curl','-fsSL','--retry','2','--max-time','60',url],check=True,capture_output=True).stdout
# Bounds refer to existing background DEM pixel centers and align with its coarse mesh cells.
REGIONS={'crystal':('context-dem.json',(440,160,696,400)), 'snoqualmie':('snoqualmie/context/dem.json',(192,160,448,448))}
def build(name):
 source,indices=REGIONS[name];base=json.loads((ROOT/source).read_text());step=4 if base['width']>700 else 2;x0,z0,x1,z1=indices
 if any(v%step for v in indices):raise ValueError('Region must align with background cells')
 folder=ROOT/'scenery'/name;folder.mkdir(parents=True,exist_ok=True);s=base['spacing']/2;x=base['originUTM'][0]+x0*base['spacing'];y=base['originUTM'][1]-z0*base['spacing'];w=(x1-x0)*2+1;h=(z1-z0)*2+1
 extent=dict(xmin=x-s/2,ymin=y-(h-.5)*s,xmax=x+(w-.5)*s,ymax=y+s/2,spatialReference={'wkid':32610});stamp=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat()
 if not (folder/'dem.json').exists():
  p=dict(bbox=','.join(str(extent[k]) for k in ['xmin','ymin','xmax','ymax']),bboxSR=32610,imageSR=32610,size=f'{w},{h}',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',adjustAspectRatio='false',f='json')
  response=json.loads(get(DEM+'/exportImage?'+urlencode(p)))
  if 'href' not in response:raise ValueError(response)
  im=Image.open(BytesIO(get(response['href'])));im.load();sx,sy,_=im.tag_v2[33550];_,_,_,west,north,_=im.tag_v2[33922];values=list(im.getdata())
  if im.mode!='F' or im.size!=(w,h) or abs(sx-s)>.001 or abs(sy-s)>.001 or abs(west+s/2-x)>.1 or abs(north-s/2-y)>.1 or not all(math.isfinite(v) and 0<v<5000 for v in values):raise ValueError('Invalid / misregistered region DEM')
  meta=dict(width=w,height=h,spacing=s,originUTM=[x,y],epsg=32610,verticalUnits='meters',source='USGS 3DEP',sourceUrl=DEM,retrieved=stamp,exportSpacingIsNotSurveyResolution=True,background=source,backgroundPixelBounds=dict(x0=x0,z0=z0,x1=x1,z1=z1,step=step),transitionMeters=600,heights=[round(v,2) for v in values]);(folder/'dem.json').write_text(json.dumps(meta,separators=(',',':')))
 if not (folder/'aerial.json').exists():
  width=round(3072*w/max(w,h)/2)*2;height=round(3072*h/max(w,h)/2)*2;image=Image.new('RGB',(width,height));exports=[]
  for row in range(2):
   for col in range(2):
    e=dict(xmin=extent['xmin']+(extent['xmax']-extent['xmin'])*col/2,xmax=extent['xmin']+(extent['xmax']-extent['xmin'])*(col+1)/2,ymax=extent['ymax']-(extent['ymax']-extent['ymin'])*row/2,ymin=extent['ymax']-(extent['ymax']-extent['ymin'])*(row+1)/2)
    p=dict(bbox=','.join(str(e[k]) for k in ['xmin','ymin','xmax','ymax']),bboxSR=32610,imageSR=32610,size=f'{width//2},{height//2}',format='jpg',compressionQuality=95,bandIds='0,1,2',adjustAspectRatio='false',interpolation='RSP_BilinearInterpolation',f='json');meta=json.loads(get(NAIP+'/exportImage?'+urlencode(p)))
    if 'href' not in meta:raise ValueError(meta)
    tile=Image.open(BytesIO(get(meta['href'])));tile.load()
    if tile.size!=(width//2,height//2) or any(abs(meta['extent'][k]-e[k])>.1 for k in e):raise ValueError('Misregistered imagery tile')
    image.paste(tile,(col*width//2,row*height//2));exports.append(e);print(name,'imagery tile',row,col,flush=True)
  image.save(folder/'aerial.jpg',quality=90,subsampling=0)
  metadata=dict(extent=extent,size=[width,height],source='USGS / USDA NAIP',sourceUrl=NAIP,retrieved=stamp,tileExtents=exports,metersPerPixel=[(extent['xmax']-extent['xmin'])/width,(extent['ymax']-extent['ymin'])/height],description='New regional orthoimagery exports; not resized background imagery. Seasonal winter cover is authored; survey detail varies.');(folder/'aerial.json').write_text(json.dumps(metadata,separators=(',',':')))
 print(name,w,h,round(s,2),'m DEM',json.loads((folder/'aerial.json').read_text())['size'],flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('region',choices=REGIONS);build(p.parse_args().region)
