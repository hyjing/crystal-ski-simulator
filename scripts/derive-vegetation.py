"""Locate canopy texture peaks in the georeferenced NAIP image. Not surveyed trees."""
from pathlib import Path
import json,math
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[1]/'public/data'
meta=json.loads((ROOT/'crystal-landcover.json').read_text());im=Image.open(ROOT/'crystal-aerial.jpg').convert('RGB');w,h=im.size
rgb=list(im.getdata());gray=im.convert('L');hi=list(gray.filter(ImageFilter.MaxFilter(7)).getdata());lo=list(gray.filter(ImageFilter.MinFilter(7)).getdata())
mask=bytearray(w*h);scores=bytearray(w*h)
for i,(r,g,b) in enumerate(rgb):
 lum=.2126*r+.7152*g+.0722*b;contrast=hi[i]-lo[i]
 # Dark, textured green vegetation; not a green lawn or snow / bare rock.
 eligible=g>r*.95 and g>b*1.03 and 13<g and lum<125 and contrast>18
 if eligible:mask[i]=255;scores[i]=min(255,int(40+contrast*.9+lum*.4))
score=Image.frombytes('L',(w,h),bytes(scores));peaks=list(score.filter(ImageFilter.MaxFilter(5)).getdata())
extent=meta['extent'];sx=(extent['xmax']-extent['xmin'])/w;sy=(extent['ymax']-extent['ymin'])/h
candidates=[]
for z in range(3,h-3):
 for x in range(3,w-3):
  i=z*w+x
  if scores[i] and scores[i]==peaks[i]:candidates.append((x,z,scores[i]))
candidates.sort(key=lambda p:(((p[0]*73856093)^(p[1]*19349663))&0xffffffff))
accepted=[];cells={};minimum=8.;cell=minimum
for x,z,score in candidates:
 e=extent['xmin']+(x+.5)*sx;n=extent['ymax']-(z+.5)*sy;gx=int(e//cell);gz=int(n//cell)
 if any((e-a)**2+(n-b)**2<minimum**2 for dx in [-1,0,1] for dz in [-1,0,1] for a,b in cells.get((gx+dx,gz+dz),[])):continue
 accepted.append([x,z,round(.72+(score/255)*.45,3)]);cells.setdefault((gx,gz),[]).append((e,n))
 if len(accepted)>=20000:break
Image.frombytes('L',(w,h),bytes(mask)).filter(ImageFilter.GaussianBlur(1)).save(ROOT/'crystal-canopy.png')
output=dict(source='USGS / USDA NAIP',sourceUrl=meta['sourceUrl'],image='crystal-aerial.jpg',imageSize=[w,h],extent=extent,method='RGB vegetation + local canopy-texture maxima; approximate tree centers and artistic heights, not a tree survey',minimumSpacing=minimum,pixels=accepted)
(ROOT/'crystal-vegetation.json').write_text(json.dumps(output,separators=(',',':')))
print('Saved',len(accepted),'georeferenced canopy candidates from',w,h,'pixels')
