from pathlib import Path
import json

root=Path('.')
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
old="r=await runProcess(py,['-m','pip','install','laion_clap==1.1.7','hiclass==4.11.0','scikit-learn==1.1.2','numpy==1.23.5','soundfile==0.12.1','huggingface-hub==0.36.0'],{cwd:dir});"
new="r=await runProcess(py,['-m','pip','install','--no-cache-dir','--only-binary=:all:','numpy==1.26.4','scikit-learn==1.3.2','soundfile==0.12.1'],{cwd:dir});\n    if(r.code!==0) return {success:false,error:'D3 numeric dependencies failed: '+(r.err||r.out).slice(-2400)};\n    r=await runProcess(py,['-m','pip','install','--no-cache-dir','laion_clap==1.1.7','hiclass==4.11.0','huggingface-hub==0.36.0'],{cwd:dir});"
if old not in mt:
    raise SystemExit('D3 dependency install line not found')
mt=mt.replace(old,new,1)
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.1.4'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.1.4 D3 sklearn wheel compatibility patch applied')
