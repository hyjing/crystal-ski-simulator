"""Create an explicitly non-photographic OSM landcover reference and tree candidates."""
from pathlib import Path
import json,math
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]/'public/data/whistler';source=json.loads((ROOT/'shared/source-osm.json').read_text())
def utm(lon,lat):
 p=lat*math.pi/180;dl=(lon+123)*math.pi/180;e=.00669437999014;ep=e/(1-e);N=6378137/math.sqrt(1-e*math.sin(p)**2);T=math.tan(p)**2;C=ep*math.cos(p)**2;A=math.cos(p)*dl;M=6378137*((1-e/4-3*e**2/64-5*e**3/256)*p-(3*e/8+3*e**2/32+45*e**3/1024)*math.sin(2*p)+(15*e**2/256+45*e**3/1024)*math.sin(4*p)-35*e**3/3072*math.sin(6*p));return 500000+.9996*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120),.9996*(M+N*math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep)*A**6/720))
for name in ['shared','context']:
 folder=ROOT/name;d=json.loads((folder/'dem.json').read_text());w,h,s=d['width'],d['height'],d['spacing'];west,north=d['originUTM'];size=1024;extent=dict(xmin=west-s/2,xmax=west+(w-.5)*s,ymin=north-(h-.5)*s,ymax=north+s/2,spatialReference={'wkid':32610});canopy=Image.new('L',(size,size));draw=ImageDraw.Draw(canopy);image=Image.new('RGB',(size,size),'#a6aca4');paint=ImageDraw.Draw(image)
 for f in source['features']:
  if f['geometry']['type']!='Polygon':continue
  prop=f['properties'];kind=prop.get('natural') or prop.get('landuse');color={'wood':'#567463','forest':'#567463','water':'#7fabb4','glacier':'#e6eeed'}.get(kind)
  if not color:continue
  pts=[((e-extent['xmin'])/(extent['xmax']-extent['xmin'])*size,(extent['ymax']-n)/(extent['ymax']-extent['ymin'])*size) for e,n in map(lambda ll:utm(*ll),f['geometry']['coordinates'][0])];paint.polygon(pts,fill=color)
  if kind in ['wood','forest']:draw.polygon(pts,fill=255)
 canopy=canopy.filter(ImageFilter.GaussianBlur(.7));canopy.save(folder/'canopy.png');image.save(folder/'aerial.jpg',quality=90)
 if name=='context':continue
 values=np.asarray(canopy.resize((w,h),Image.Resampling.BOX))/255.;meta=dict(width=w,height=h,values=np.round(values,3).ravel().tolist(),extent=extent,source='OpenStreetMap landcover polygons; authored reference map, not satellite imagery',sourceUrl='https://www.openstreetmap.org/copyright',image='aerial.jpg',imageSize=[size,size],classification='Mapped forest/wood polygons; heuristic tree candidates, not surveyed individual trees');(folder/'landcover.json').write_text(json.dumps(meta,separators=(',',':')))
 mask=np.asarray(canopy);pixels=[]
 for v in range(2,size-2,2):
  for u in range(2,size-2,2):
   if mask[v,u]>180 and ((u*73856093)^(v*19349663))%5==0:pixels.append([u,v,round(.75+((u*17+v*31)%40)/100,2)])
 (folder/'vegetation.json').write_text(json.dumps(dict(source=meta['source'],sourceUrl=meta['sourceUrl'],extent=extent,imageSize=[size,size],image='aerial.jpg',minimumSpacing=25,method='Deterministic candidates inside mapped OSM forest polygons',pixels=pixels),separators=(',',':')));print('forest candidates',len(pixels))
