"""Export the easy / intermediate / advanced routing network from downloaded Crystal OSM XML."""
from pathlib import Path
import argparse,json,xml.etree.ElementTree as ET
parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];root=ET.parse(args.input).getroot()
nodes={n.get('id'):[float(n.get('lon')),float(n.get('lat'))] for n in root.findall('node')}
ways=[]
for w in root.findall('way'):
 t={t.get('k'):t.get('v') for t in w.findall('tag')}
 if t.get('piste:type')!='downhill' or t.get('area')=='yes' or t.get('piste:difficulty') not in ('easy','intermediate','advanced'):continue
 ways.append(dict(type='Feature',id=w.get('id'),properties={**t,'osmWayId':w.get('id'),'sourceUrl':'https://www.openstreetmap.org/way/'+w.get('id')},geometry=dict(type='LineString',coordinates=[nodes[n.get('ref')] for n in w.findall('nd')]),nodeIds=[n.get('ref') for n in w.findall('nd')]))
network=dict(type='FeatureCollection',source='OpenStreetMap contributors',license='ODbL 1.0',features=ways)
(ROOT/'public/data/crystal-trail-network.json').write_text(json.dumps(network,separators=(',',':')))
print('Network ways',len(ways))
