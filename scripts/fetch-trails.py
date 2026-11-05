"""Export the selected OSM downhill ways. Uses Python standard library only."""
import json
import xml.etree.ElementTree as ET
from urllib.request import urlopen
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

URL='https://api.openstreetmap.org/api/0.6/map?bbox=-121.515,46.915,-121.455,46.96'
IDS={'127128250','127128246','127128768'}
with urlopen(URL,timeout=90) as response:
    root=ET.fromstring(response.read())
nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in root.findall('node')}
features=[]
for way in root.findall('way'):
    identity=way.attrib['id']
    if identity not in IDS:
        continue
    tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
    coordinates=[nodes[n.attrib['ref']] for n in way.findall('nd')]
    features.append(dict(type='Feature',id=identity,properties={**tags,'osmWayId':identity,'sourceUrl':'https://www.openstreetmap.org/way/'+identity},geometry=dict(type='LineString',coordinates=coordinates)))
if len(features)!=len(IDS):
    raise ValueError('Missing selected trail ways; do not overwrite the existing dataset')
data=dict(type='FeatureCollection',source='OpenStreetMap contributors',license='ODbL 1.0',licenseUrl='https://opendatacommons.org/licenses/odbl/1-0/',attributionUrl='https://www.openstreetmap.org/copyright',retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),features=features)
output=Path(__file__).resolve().parents[1]/'public/data/crystal-trails.json'
temporary=output.with_suffix('.json.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2));temporary.replace(output)
print(f'Wrote {len(features)} OSM trail ways → {output}')
