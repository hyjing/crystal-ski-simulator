"""Extract non-personal map geometry from four downloaded OSM XML files."""
import argparse,json,xml.etree.ElementTree as E
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('inputs',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();ways={};nodes={}
for source in a.inputs:
 r=E.parse(source).getroot()
 nodes.update({n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in r.findall('node')})
 for w in r.findall('way'):ways[w.get('id')]=w
features=[]
for identity,w in ways.items():
 tags={t.get('k'):t.get('v') for t in w.findall('tag')};ids=[n.get('ref') for n in w.findall('nd')]
 if not (tags.get('piste:type')=='downhill' or tags.get('aerialway')=='chair_lift' or 'building' in tags) or len(ids)<2:continue
 props={k:v for k,v in tags.items() if k in ['name','piste:type','piste:difficulty','aerialway','building','building:levels','height','area']}
 polygon='building' in props and ids[0]==ids[-1];coords=[nodes[i] for i in ids]
 features.append(dict(type='Feature',id=identity,properties=props,nodeIds=ids,geometry=dict(type='Polygon' if polygon else 'LineString',coordinates=[coords] if polygon else coords)))
a.output.write_text(json.dumps(dict(type='FeatureCollection',source='OpenStreetMap contributors',license='ODbL 1.0',attributionUrl='https://www.openstreetmap.org/copyright',features=features),separators=(',',':')))
print(len(features),'features')
