"""Export named OSM blue / single-black downhill centerlines and the original green run. Uses Python standard library only."""
import argparse
import json
import xml.etree.ElementTree as ET
from urllib.request import urlopen
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

parser=argparse.ArgumentParser();parser.add_argument('--infrastructure',action='store_true');parser.add_argument('--input',type=Path,help='Previously downloaded OSM XML');args=parser.parse_args()
URL='https://api.openstreetmap.org/api/0.6/map?bbox=-121.525,46.90,-121.435,46.985'
if args.input:
    root=ET.parse(args.input).getroot()
else:
    with urlopen(URL,timeout=90) as response:
        root=ET.fromstring(response.read())
nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in root.findall('node')}
features=[]
for way in root.findall('way'):
    identity=way.attrib['id']
    tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
    if args.infrastructure:
        if tags.get('aerialway') not in ('chair_lift','gondola') and 'building' not in tags:
            continue
    elif not (tags.get('piste:type')=='downhill' and tags.get('name') and tags.get('area')!='yes' and (tags.get('piste:difficulty') in ('intermediate','advanced') or identity=='127128768')):
        continue
    coordinates=[nodes[n.attrib['ref']] for n in way.findall('nd')]
    geometry_type='Polygon' if args.infrastructure and 'building' in tags else 'LineString'
    if geometry_type=='Polygon':
        coordinates=[coordinates]
    features.append(dict(type='Feature',id=identity,properties={**tags,'osmWayId':identity,'sourceUrl':'https://www.openstreetmap.org/way/'+identity},geometry=dict(type=geometry_type,coordinates=coordinates)))
if not args.infrastructure and not {'127128250','127128246','127128768'}.issubset({f['id'] for f in features}):
    raise ValueError('Missing selected trail ways; do not overwrite the existing dataset')
data=dict(type='FeatureCollection',source='OpenStreetMap contributors',license='ODbL 1.0',licenseUrl='https://opendatacommons.org/licenses/odbl/1-0/',attributionUrl='https://www.openstreetmap.org/copyright',retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),features=features)
output=Path(__file__).resolve().parents[1]/('public/data/crystal-infrastructure.json' if args.infrastructure else 'public/data/crystal-trails.json')
temporary=output.with_suffix('.json.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2));temporary.replace(output)
print(f'Wrote {len(features)} OSM trail ways → {output}')
