"""Whistler open elevation / OSM pack. Pillow + NumPy; cached public downloads.
Terrain Tiles attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md
No commercial satellite imagery or official trail-map artwork is redistributed.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json, math, subprocess, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT.parent.parent/'work/whistler-cache';CACHE.mkdir(parents=True,exist_ok=True)
def download(url,path):
 if not path.exists():
  result=subprocess.run(['curl','-fLsS','--max-time','90','--retry','1',url],capture_output=True,check=True);path.write_bytes(result.stdout)
 return path.read_bytes()
def inverse_utm(e,n):
 a=6378137.;ecc=.00669437999014;k=.9996;ep=ecc/(1-ecc);e1=(1-math.sqrt(1-ecc))/(1+math.sqrt(1-ecc));mu=n/k/(a*(1-ecc/4-3*ecc**2/64-5*ecc**3/256));p=mu+(3*e1/2-27*e1**3/32)*np.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*np.sin(4*mu)+151*e1**3/96*np.sin(6*mu)+1097*e1**4/512*np.sin(8*mu);N=a/np.sqrt(1-ecc*np.sin(p)**2);T=np.tan(p)**2;C=ep*np.cos(p)**2;R=a*(1-ecc)/(1-ecc*np.sin(p)**2)**1.5;D=(e-500000)/(N*k)
 lat=p-(N*np.tan(p)/R)*(D**2/2-(5+3*T+10*C-4*C*C-9*ep)*D**4/24+(61+90*T+298*C+45*T*T-252*ep-3*C*C)*D**6/720);lon=(-123*np.pi/180)+(D-(1+2*T+C)*D**3/6+(5-2*C+28*T-3*C*C+8*ep+24*T*T)*D**5/120)/np.cos(p);return lon*180/np.pi,lat*180/np.pi
def dem(folder,size,spacing,zoom):
 folder.mkdir(parents=True,exist_ok=True);centerE,centerN=503500,5548500;west=centerE-(size-1)*spacing/2;north=centerN+(size-1)*spacing/2;ee,nn=np.meshgrid(west+np.arange(size)*spacing,north-np.arange(size)*spacing);lon,lat=inverse_utm(ee,nn);tx=(lon+180)/360*2**zoom;ty=(1-np.arcsinh(np.tan(lat*np.pi/180))/np.pi)/2*2**zoom;x0,x1=math.floor(tx.min()),math.floor(tx.max());y0,y1=math.floor(ty.min()),math.floor(ty.max());tiles=[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]
 def get(tile):
  x,y=tile;raw=download(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png',CACHE/f'{zoom}-{x}-{y}.png');rgb=np.asarray(Image.open(BytesIO(raw)).convert('RGB'),dtype=float);return x,y,rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
 mosaic=np.empty(((y1-y0+1)*256,(x1-x0+1)*256));
 with ThreadPoolExecutor(max_workers=4) as pool:
  for x,y,h in pool.map(get,tiles):mosaic[(y-y0)*256:(y-y0+1)*256,(x-x0)*256:(x-x0+1)*256]=h
 # XYZ pixels are centers, not edges.
 u=np.clip((tx-x0)*256-.5,0,mosaic.shape[1]-1.001);v=np.clip((ty-y0)*256-.5,0,mosaic.shape[0]-1.001);ix=u.astype(int);iy=v.astype(int);fx=u-ix;fy=v-iy;heights=mosaic[iy,ix]*(1-fx)*(1-fy)+mosaic[iy,ix+1]*fx*(1-fy)+mosaic[iy+1,ix]*(1-fx)*fy+mosaic[iy+1,ix+1]*fx*fy
 if not np.isfinite(heights).all() or heights.min()<0 or heights.max()>4000:raise ValueError('Invalid terrain')
 data=dict(width=size,height=size,spacing=spacing,originUTM=[west,north],epsg=32610,source='Mapzen Terrain Tiles (Canada / global open elevation sources)',sourceUrl='https://registry.opendata.aws/terrain-tiles/',attributionUrl='https://github.com/tilezen/joerd/blob/master/docs/attribution.md',retrieved='2026-11-06',verticalUnits='meters',exportSpacingIsNotSurveyResolution=True,heights=np.round(heights,2).ravel().tolist());(folder/'dem.json').write_text(json.dumps(data,separators=(',',':')));print(folder.name,'DEM',size,round(float(heights.min())),round(float(heights.max())),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--dem-only',action='store_true',help='Download both elevation grids (default behavior)');parser.parse_args()
 dem(ROOT/'public/data/whistler/shared',641,25,12);dem(ROOT/'public/data/whistler/context',513,90,10)
