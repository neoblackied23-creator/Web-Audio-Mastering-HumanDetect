from pathlib import Path
import json
root=Path('.')
pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.8.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.8.0 genre-aware Instrument Manager integration applied')
