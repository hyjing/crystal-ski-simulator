"""Retrieve 4096px NAIP exports on the existing DEM footprints. No fabricated geography."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from PIL import Image
import json,subprocess
root=Path(__file__).resolve().parents[1]/'public/data'
source='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer'
def get(url):
    # macOS system curl uses the configured system trust store.
    return subprocess.run(['/usr/bin/curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','55',url],check=True,capture_output=True).stdout
for name in ['rainier','context']:
    old=json.loads((root/f'{name}-aerial.json').read_text());e=old['extent'];size=[4096,round(4096*old['size'][1]/old['size'][0])]
    image=Image.new('RGB',tuple(size));exports=[]
    for row in range(2):
        for col in range(2):
            xmin=e['xmin']+(e['xmax']-e['xmin'])*col/2;xmax=e['xmin']+(e['xmax']-e['xmin'])*(col+1)/2
            ymax=e['ymax']-(e['ymax']-e['ymin'])*row/2;ymin=e['ymax']-(e['ymax']-e['ymin'])*(row+1)/2
            tileSize=[size[0]//2,size[1]//2]
            params=dict(bbox=','.join(map(str,[xmin,ymin,xmax,ymax])),bboxSR=32610,imageSR=32610,size=','.join(map(str,tileSize)),format='jpg',compressionQuality=96,bandIds='0,1,2',interpolation='RSP_BilinearInterpolation',adjustAspectRatio='false',f='json')
            metadata=json.loads(get(source+'/exportImage?'+urlencode(params)))
            if 'href' not in metadata:raise ValueError(metadata)
            tile=Image.open(BytesIO(get(metadata['href'])));tile.load()
            if list(tile.size)!=tileSize:raise ValueError(tile.size)
            for key,value in zip(['xmin','ymin','xmax','ymax'],[xmin,ymin,xmax,ymax]):
                if abs(metadata['extent'][key]-value)>.1:raise ValueError('Misregistered export')
            image.paste(tile,(col*tileSize[0],row*tileSize[1]));exports.append(metadata['extent'])
            print(name,'tile',row,col,flush=True)
    image.save(root/f'{name}-aerial.jpg',quality=88,subsampling=2)
    data=(root/f'{name}-aerial.jpg').read_bytes();metadata['extent']=e
    old.update(tileExtents=exports,extent=metadata['extent'],size=size,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),description='Public-domain USGS / USDA NAIP orthophotography, 4096px export on exact DEM footprint; native survey detail may vary; winter snow is authored')
    (root/f'{name}-aerial.json').write_text(json.dumps(old,separators=(',',':')))
    print(name,size,len(data),flush=True)
