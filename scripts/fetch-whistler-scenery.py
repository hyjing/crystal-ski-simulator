"""Registered Whistler region DEM + EOxCloudless 2016 game textures (CC BY 4.0).
Bounded, cached WMS exports, reprojected into the game's existing UTM grid.
This bundles derived game textures, not a standalone raw-tile GIS dataset.
"""
from pathlib import Path
from io import BytesIO
from urllib.parse import urlencode
from datetime import datetime
from zoneinfo import ZoneInfo
import importlib.util,json,subprocess,math
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'public/data'
spec=importlib.util.spec_from_file_location('whistler_source',ROOT/'scripts/fetch-whistler.py');source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
CACHE=source.CACHE/'scenery';CACHE.mkdir(parents=True,exist_ok=True)
WMS='https://tiles.maps.eox.at/wms';ATTR='EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)'
folder=DATA/'scenery/whistler';folder.mkdir(parents=True,exist_ok=True)
if not (folder/'dem.json').exists():source.dem(folder,705,45,12)
d=json.loads((folder/'dem.json').read_text());d.update(background='whistler/context/dem.json',backgroundPixelBounds=dict(x0=80,z0=80,x1=432,z1=432,step=2),transitionMeters=720,renderStep=2);(folder/'dem.json').write_text(json.dumps(d,separators=(',',':')))
def merc(e,n):
 lon,lat=source.inverse_utm(e,n);return lon*np.pi/180*6378137,np.log(np.tan(np.pi/4+lat*np.pi/360))*6378137
def photo(grid_path,output,size):
 meta_path=output.with_suffix('.json')
 if output.exists() and meta_path.exists():print('cached',output,flush=True);return
 g=json.loads(grid_path.read_text());w,h,s=g['width'],g['height'],g['spacing'];x,y=g['originUTM'];e=dict(xmin=x-s/2,xmax=x+(w-.5)*s,ymin=y-(h-.5)*s,ymax=y+s/2,spatialReference={'wkid':32610})
 xx,yy=merc(np.array([e['xmin'],e['xmax'],e['xmin'],e['xmax']]),np.array([e['ymin'],e['ymin'],e['ymax'],e['ymax']]));bounds=[float(xx.min()),float(yy.min()),float(xx.max()),float(yy.max())]
 # Fetch four modest exports serially; keep raw exports outside the repository.
 image=Image.new('RGB',(size,size));tile_size=size//2
 for row in range(2):
  for col in range(2):
   box=[bounds[0]+(bounds[2]-bounds[0])*col/2,bounds[3]-(bounds[3]-bounds[1])*(row+1)/2,bounds[0]+(bounds[2]-bounds[0])*(col+1)/2,bounds[3]-(bounds[3]-bounds[1])*row/2]
   url=WMS+'?'+urlencode(dict(SERVICE='WMS',REQUEST='GetMap',VERSION='1.1.1',LAYERS='s2cloudless_3857',STYLES='',SRS='EPSG:3857',BBOX=','.join(map(str,box)),WIDTH=tile_size,HEIGHT=tile_size,FORMAT='image/jpeg'))
   cache=CACHE/f'{output.parent.name}-{output.stem}-{row}-{col}-{size}.jpg'
   if not cache.exists():cache.write_bytes(subprocess.run(['curl','-fsSL','--max-time','75','--retry','1',url],capture_output=True,check=True).stdout)
   tile=Image.open(BytesIO(cache.read_bytes())).convert('RGB');tile.load()
   if tile.size!=(tile_size,tile_size):raise ValueError('Unexpected EOX export dimensions')
   image.paste(tile,(col*tile_size,row*tile_size));print(output.parent.name,output.stem,'EOX tile',row,col,flush=True)
 pixels=np.asarray(image,dtype=np.float32);out=np.zeros((size,size,3),dtype=np.uint8)
 ee=e['xmin']+(np.arange(size)+.5)/size*(e['xmax']-e['xmin'])
 for row in range(0,size,96):
  nn=e['ymax']-(np.arange(row,min(row+96,size))+.5)/size*(e['ymax']-e['ymin']);E,N=np.meshgrid(ee,nn);X,Y=merc(E,N);u=np.clip((X-bounds[0])/(bounds[2]-bounds[0])*size-.5,0,size-1.001);v=np.clip((bounds[3]-Y)/(bounds[3]-bounds[1])*size-.5,0,size-1.001);ix=u.astype(int);iy=v.astype(int);fx=(u-ix)[...,None];fy=(v-iy)[...,None]
  out[row:row+len(nn)]=(pixels[iy,ix]*(1-fx)*(1-fy)+pixels[iy,ix+1]*fx*(1-fy)+pixels[iy+1,ix]*(1-fx)*fy+pixels[iy+1,ix+1]*fx*fy).astype(np.uint8)
 if out.std()<12:raise ValueError('Flat / missing satellite export')
 Image.fromarray(out).save(output,quality=89,subsampling=0)
 meta=dict(extent=e,size=[size,size],source='EOxCloudless 2016 / modified Copernicus Sentinel data',sourceUrl='https://cloudless.eox.at',service=WMS,layer='s2cloudless_3857',license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/',attribution=ATTR,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),metersPerPixel=[(e['xmax']-e['xmin'])/size,(e['ymax']-e['ymin'])/size],description='Derived game texture reprojected from the 2016 satellite mosaic into EPSG:32610; winter cover is authored in the renderer; imagery is not live or surveyed winter conditions.')
 meta_path.write_text(json.dumps(meta,separators=(',',':')));print('saved',output,size,output.stat().st_size,flush=True)
photo(DATA/'whistler/shared/dem.json',DATA/'whistler/shared/satellite.jpg',2048)
photo(folder/'dem.json',folder/'aerial.jpg',3072)
photo(DATA/'whistler/context/dem.json',DATA/'whistler/context/satellite.jpg',2048)
