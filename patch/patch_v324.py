from pathlib import Path
import json

root=Path('.')
pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.2.4'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.2.4 Adapt Music selective-stem mode applied')
