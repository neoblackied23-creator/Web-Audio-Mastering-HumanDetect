from pathlib import Path
import json
root=Path('.')
app=root/'web'/'app.js'
text=app.read_text(encoding='utf-8')
imp="import { mountEnsembleDetectorPanel } from './human-detect/ensemble-detector-panel.js';\n"
if imp not in text:
    text=imp+text
marker='// HUMANDETECT_ENSEMBLE_V21'
if marker not in text:
    text += r'''

// HUMANDETECT_ENSEMBLE_V21
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountEnsembleDetectorPanel({getOriginalPath: async()=>fileState.selectedFilePath||null});
    console.log('[HumanDetect] v2.1 ensemble panel mounted');
  } catch(err){ console.error('[HumanDetect] v2.1 ensemble panel failed:',err); }
});
'''
app.write_text(text,encoding='utf-8')

# Publish latest local detector report for the ensemble panel.
hdp=root/'web'/'human-detect'/'human-detect-panel.js'
ht=hdp.read_text(encoding='utf-8')
ht=ht.replace("original=analyzeAudioBuffer(b);render();status(`Original ${score(original)}% human-like.`);",
              "original=analyzeAudioBuffer(b);window.__localHumanDetectLatest=original;render();status(`Original ${score(original)}% human-like.`);")
hdp.write_text(ht,encoding='utf-8')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'lcrosDetectorStatus:' not in pt:
    pt=pt.replace("  runOpenDetector: (inputPath) => ipcRenderer.invoke('open-detector-run', inputPath)",
                  "  runOpenDetector: (inputPath) => ipcRenderer.invoke('open-detector-run', inputPath),\n  lcrosDetectorStatus: () => ipcRenderer.invoke('lcros-detector-status'),\n  setupLcrosDetector: () => ipcRenderer.invoke('lcros-detector-setup'),\n  runLcrosDetector: (inputPath) => ipcRenderer.invoke('lcros-detector-run', inputPath)")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_LCROS_DETECTOR_V21' not in mt:
    mt += r'''

// HUMANDETECT_LCROS_DETECTOR_V21
function lcrosDir(){ return path.join(app.getPath('userData'),'lcros_ai_music_detector'); }
function lcrosVenvPython(){ return path.join(lcrosDir(),'.venv','Scripts','python.exe'); }
function lcrosStatusSync(){
  const dir=lcrosDir(), py=lcrosVenvPython();
  const model=path.join(dir,'models_and_scaler.pkl');
  const ckpt=path.join(dir,'music_audioset_epoch_15_esc_90.14.pt');
  if(!fs.existsSync(py)) return {available:false,reason:'Detector 3 environment not installed',dir};
  if(!fs.existsSync(model)||!fs.existsSync(ckpt)) return {available:false,reason:'Detector 3 model files missing',dir,python:py};
  try{
    const r=spawnSync(py,['-c','import laion_clap,hiclass,sklearn,numpy; print("ok")'],{encoding:'utf8',windowsHide:true});
    return {available:r.status===0,reason:r.status===0?null:(r.stderr||r.stdout||'import failed').slice(-1500),dir,python:py};
  }catch(e){ return {available:false,reason:e.message,dir,python:py}; }
}
ipcMain.handle('lcros-detector-status',async()=>lcrosStatusSync());
ipcMain.handle('lcros-detector-setup',async()=>{
  try{
    const basePy=pythonCmd(); if(!basePy) return {success:false,error:'Python 3.10–3.12 is required.'};
    const dir=lcrosDir(); fs.mkdirSync(dir,{recursive:true});
    const py=lcrosVenvPython();
    if(!fs.existsSync(py)){
      const v=await runProcess(basePy,['-m','venv','.venv'],{cwd:dir});
      if(v.code!==0) return {success:false,error:'Could not create Detector 3 environment: '+(v.err||v.out).slice(-1800)};
    }
    let r=await runProcess(py,['-m','pip','install','--upgrade','pip','setuptools','wheel'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'pip setup failed: '+(r.err||r.out).slice(-1800)};
    r=await runProcess(py,['-m','pip','install','torch','torchaudio','--index-url','https://download.pytorch.org/whl/cpu'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'CPU Torch install failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','laion_clap==1.1.7','hiclass==4.11.0','scikit-learn==1.1.2','numpy==1.23.5','soundfile==0.12.1','huggingface-hub==0.36.0'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Detector 3 dependencies failed: '+(r.err||r.out).slice(-2400)};
    const dl=`from huggingface_hub import hf_hub_download\nimport shutil,os\nd='${'${'}DIR${'}'}'`;
    const code=[
      'from huggingface_hub import hf_hub_download',
      'import shutil,os',
      `d=r'''${dir.replace(/\\/g,'\\\\')}'''`,
      `a=hf_hub_download(repo_id='lcros/ai-music-detection',filename='models_and_scaler.pkl')`,
      `b=hf_hub_download(repo_id='lukewys/laion_clap',filename='music_audioset_epoch_15_esc_90.14.pt')`,
      `shutil.copy2(a,os.path.join(d,'models_and_scaler.pkl'))`,
      `shutil.copy2(b,os.path.join(d,'music_audioset_epoch_15_esc_90.14.pt'))`,
      `print('downloaded')`
    ].join('\n');
    r=await runProcess(py,['-c',code],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Detector 3 model download failed: '+(r.err||r.out).slice(-2400)};
    const s=lcrosStatusSync(); return s.available?{success:true,dir}:{success:false,error:s.reason||'Detector 3 readiness check failed'};
  }catch(e){ return {success:false,error:e.message}; }
});
ipcMain.handle('lcros-detector-run',async(event,inputPath)=>{
  try{
    if(!inputPath||!fs.existsSync(inputPath)) return {success:false,error:'Input audio file not found'};
    const s=lcrosStatusSync(); if(!s.available) return {success:false,error:s.reason||'Detector 3 not ready'};
    const modelPath=path.join(s.dir,'models_and_scaler.pkl');
    const ckptPath=path.join(s.dir,'music_audioset_epoch_15_esc_90.14.pt');
    const code=[
      'import sys,json,pickle,numpy as np',
      'import laion_clap',
      'audio,model_path,ckpt=sys.argv[1:4]',
      "m=laion_clap.CLAP_Module(enable_fusion=False,amodel='HTSAT-base')",
      'm.load_ckpt(ckpt)',
      'emb=m.get_audio_embedding_from_filelist(x=[audio],use_tensor=False)',
      'X=np.asarray(emb)',
      'X=X.reshape(1,-1) if X.ndim==1 else X',
      "art=pickle.load(open(model_path,'rb'))",
      "Xs=art['scaler'].transform(X)",
      'votes=[]; children=[]',
      "for name,clf in art['models'].items():",
      ' p=clf.predict(Xs)',
      ' parent=str(p[0][0] if getattr(p,"ndim",1)>1 else p[0])',
      ' child=str(p[0][1] if getattr(p,"ndim",1)>1 and len(p[0])>1 else "")',
      ' votes.append(parent); children.append(child)',
      "ai=sum(1 for x in votes if x.lower()=='ai')",
      'n=len(votes)',
      "label='AI' if ai>n/2 else 'nonAI'",
      'conf=max(ai,n-ai)/n if n else 0.0',
      "print('__HDJSON__'+json.dumps({'label':label,'confidence':conf,'ai_votes':ai,'total_votes':n,'votes':votes,'children':children,'model':'lcros-clap-hierarchical'}))"
    ].join('\n');
    const r=await runProcess(s.python,['-c',code,inputPath,modelPath,ckptPath],{cwd:s.dir});
    if(r.code!==0) return {success:false,error:(r.err||r.out).slice(-3000)};
    const line=r.out.split(/\r?\n/).reverse().find(x=>x.startsWith('__HDJSON__'));
    if(!line) return {success:false,error:'Detector 3 returned no JSON. '+r.out.slice(-1600)};
    return {success:true,...JSON.parse(line.slice('__HDJSON__'.length))};
  }catch(e){ return {success:false,error:e.message}; }
});
'''
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.1.0'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.1.0 ensemble detector patch applied')
