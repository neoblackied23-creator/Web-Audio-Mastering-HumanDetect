from pathlib import Path
import json

root=Path('.')
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')

old_status="""const r=spawnSync(py,['-c','import numpy,demucs,torch; print("ok")'],{cwd:dir,encoding:'utf8',windowsHide:true});"""
new_status="""const r=spawnSync(py,['-c','import numpy,demucs,torch,torchaudio,soundfile; b=torchaudio.list_audio_backends(); assert "soundfile" in b, "soundfile backend missing"; print("ok",b)'],{cwd:dir,encoding:'utf8',windowsHide:true});"""
if old_status in mt:
    mt=mt.replace(old_status,new_status)

old_demucs="""    stemEmit('Installing Demucs...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','demucs==4.0.1'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs install failed: '+(r.err||r.out).slice(-3000)};

    const s=stemStatusSync();"""
new_demucs="""    stemEmit('Installing Demucs...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','demucs==4.0.1'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs install failed: '+(r.err||r.out).slice(-3000)};

    stemEmit('Installing WAV backend for Torchaudio...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','soundfile==0.12.1'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'SoundFile backend install failed: '+(r.err||r.out).slice(-2600)};

    stemEmit('Verifying Torchaudio WAV save backend...','stem-setup');
    const verifyCode=[
      'import os,tempfile,torch,torchaudio,soundfile',
      'p=os.path.join(tempfile.gettempdir(),"humandetect_torchaudio_test.wav")',
      'torchaudio.save(p,torch.zeros(2,4800),48000)',
      'assert os.path.exists(p) and os.path.getsize(p)>44',
      'os.remove(p)',
      'print("wav-backend-ok",torchaudio.list_audio_backends())'
    ].join(';');
    r=await runProcess(py,['-c',verifyCode],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Torchaudio WAV backend verification failed: '+(r.err||r.out).slice(-2600)};

    const s=stemStatusSync();"""
if old_demucs not in mt:
    raise SystemExit('Demucs install block not found for v3.2.1 patch')
mt=mt.replace(old_demucs,new_demucs)
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.2.1'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.2.1 Demucs WAV backend hotfix applied')
