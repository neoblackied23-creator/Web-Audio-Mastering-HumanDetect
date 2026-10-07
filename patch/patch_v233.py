from pathlib import Path
import json
p=Path('package.json')
j=json.loads(p.read_text(encoding='utf-8'))
j['version']='2.3.3'
p.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.3.3 left-anchored calibration layout')
