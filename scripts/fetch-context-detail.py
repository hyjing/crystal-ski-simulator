"""Sample 3DEP more finely on the exact footprint of the existing context imagery."""
from pathlib import Path
from urllib.parse import urlencode
from io import BytesIO
from PIL import Image
from datetime import datetime
from zoneinfo import ZoneInfo
import json,math,subprocess
root=Path(__file__).resolve().parents[1]/'public/data';e=json.loads((root/'context-aerial.json').read_text())['extent']
source='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
p=dict(bbox=','.join(str(e[k]) for k in ['xmin','ymin','xmax','ymax']),bboxSR=32610,imageSR=32610,size='770,642',format='tiff',pixelType='F32',interpolation='RSP_BilinearInterpolation',adjustAspectRatio='false',f='image')
data=subprocess.run(['/usr/bin/curl','--fail','--location','--silent','--show-error','--retry','2','--retry-all-errors','--max-time','45',source+'/exportImage?'+urlencode(p)],stdout=subprocess.PIPE,check=True).stdout
image=Image.open(BytesIO(data));image.load();sx,sy,_=image.tag_v2[33550];_,_,_,west,north,_=image.tag_v2[33922];values=list(image.getdata())
if image.mode!='F' or image.size!=(770,642) or abs(sx-sy)>.001 or not all(math.isfinite(v) and 0<v<5000 for v in values):raise ValueError('Invalid DEM')
grid=dict(width=image.width,height=image.height,spacing=sx,originUTM=[west+sx/2,north-sy/2],epsg=32610,source='USGS 3DEP Elevation ImageServer',sourceUrl=source,retrieved=datetime.now(ZoneInfo('America/Los_Angeles')).date().isoformat(),verticalUnits='meters',exportSpacingIsNotSurveyResolution=True,heights=[round(v,2) for v in values])
(root/'context-dem.json').write_text(json.dumps(grid,separators=(',',':')));print(image.size,sx,len(data))
