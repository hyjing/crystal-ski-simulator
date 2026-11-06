"""Download modest OSM API map tiles, retaining only public resort geometry.
Raw XML (including OSM edit metadata) stays outside the repository.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,subprocess,xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT.parent.parent/'work/whistler-cache';CACHE.mkdir(parents=True,exist_ok=True)
boxes=[(-123.04+i*.055,50.0+j*.04,-123.04+(i+1)*.055,50.0+(j+1)*.04) for i in range(4) for j in range(3)]
def get(item):
 i,bbox=item;p=CACHE/f'osm-map-{i}.xml'
 if not p.exists():
  r=subprocess.run(['curl','-fLsS','--max-time','60','--retry','1','https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(f'{x:.5f}' for x in bbox)],capture_output=True,check=True);p.write_bytes(r.stdout)
 print('OSM tile',i,flush=True);return E.parse(p).getroot()
nodes={};ways={}
with ThreadPoolExecutor(max_workers=3) as pool:
 for root in pool.map(get,enumerate(boxes)):
  nodes.update({n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in root.findall('node')})
  for w in root.findall('way'):ways[w.get('id')]=w
features=[]
for identity,w in ways.items():
 tags={t.get('k'):t.get('v') for t in w.findall('tag')};ids=[n.get('ref') for n in w.findall('nd')]
 if not(tags.get('piste:type')=='downhill' or tags.get('aerialway') or tags.get('building') or tags.get('landuse')=='forest' or tags.get('natural') in ['wood','water','glacier']) or len(ids)<2 or not all(i in nodes for i in ids):continue
 props={k:v for k,v in tags.items() if k in ['name','piste:type','piste:difficulty','aerialway','building','building:levels','height','area','landuse','natural']};poly=ids[0]==ids[-1] and (props.get('building') or props.get('landuse') or props.get('natural') or props.get('area')=='yes');coords=[nodes[i] for i in ids]
 features.append(dict(type='Feature',id=identity,properties=props,nodeIds=ids,geometry=dict(type='Polygon' if poly else 'LineString',coordinates=[coords] if poly else coords)))
folder=ROOT/'public/data/whistler/shared';folder.mkdir(parents=True,exist_ok=True);(folder/'source-osm.json').write_text(json.dumps(dict(type='FeatureCollection',source='OpenStreetMap contributors',license='ODbL 1.0',attributionUrl='https://www.openstreetmap.org/copyright',features=features),separators=(',',':')));print('features',len(features),flush=True)
