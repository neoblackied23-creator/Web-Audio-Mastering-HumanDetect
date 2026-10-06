from pathlib import Path
import json

root=Path('.')
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
old="r=await runProcess(py,['-m','pip','install','torch==2.7.1','torchaudio==2.7.1','--index-url','https://download.pytorch.org/whl/cpu'],{cwd:dir});"
new="r=await runProcess(py,['-m','pip','install','--no-cache-dir','--force-reinstall','torch==2.5.1+cpu','torchaudio==2.5.1+cpu','--index-url','https://download.pytorch.org/whl/cpu'],{cwd:dir});"
if old not in mt:
    raise SystemExit('D3 Torch install line not found')
mt=mt.replace(old,new,1)
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.1.3'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.1.3 D3 Torch compatibility patch applied')
