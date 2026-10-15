from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'reperfStatus:' not in pt:
    pt=pt.replace("  clearPreviousProject: () => ipcRenderer.invoke('clear-previous-project'),",
                  "  clearPreviousProject: () => ipcRenderer.invoke('clear-previous-project'),\n  reperfStatus: () => ipcRenderer.invoke('reperf-status'),\n  setupReperfEngine: () => ipcRenderer.invoke('reperf-setup'),\n  analyzeBassNotes: (inputPath) => ipcRenderer.invoke('reperf-bass-notes', inputPath),")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_REPERF_ENGINE_V250' not in mt:
    mt += r'''

// HUMANDETECT_REPERF_ENGINE_V250
function reperfDir(){ return path.join(app.getPath('userData'),'reperformance_engine'); }
function reperfPy(){ return path.join(reperfDir(),'.venv','Scripts','python.exe'); }
function reperfScript(){ return path.join(reperfDir(),'bass_notes.py'); }
function reperfStatusSync(){
  const py=reperfPy(),dir=reperfDir();
  if(!fs.existsSync(py)) return {available:false,reason:'Re-Performance engine not installed',dir};
  try{
    const r=spawnSync(py,['-c','import numpy,onnxruntime,basic_pitch; print("ok")'],{cwd:dir,encoding:'utf8',windowsHide:true});
    return {available:r.status===0,python:py,dir,reason:r.status===0?null:(r.stderr||r.stdout||'dependencies missing').slice(-1800)};
  }catch(e){return {available:false,reason:e.message,dir,python:py};}
}
ipcMain.handle('reperf-status',async()=>reperfStatusSync());

ipcMain.handle('reperf-setup',async()=>{
  try{
    const mp=await ensureManagedPython311();
    if(!mp?.success) return {success:false,error:mp?.error||'Managed Python 3.11 setup failed'};
    const dir=reperfDir();fs.mkdirSync(dir,{recursive:true});
    const py=reperfPy();
    if(!fs.existsSync(py)){
      let r=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(r.code!==0)return {success:false,error:'Re-Performance venv failed: '+(r.err||r.out).slice(-2200)};
    }
    let r=await runProcess(py,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'ensurepip failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--upgrade','pip==24.3.1','setuptools==75.6.0','wheel==0.45.1'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'pip setup failed: '+(r.err||r.out).slice(-2200)};

    r=await runProcess(py,['-m','pip','install','--no-cache-dir',
      'numpy==1.26.4','scipy==1.11.4','librosa==0.10.2.post1','resampy==0.4.3',
      'pretty_midi==0.2.10','mir_eval==0.7','scikit-learn==1.5.2','typing_extensions',
      'onnxruntime==1.19.2'
    ],{cwd:dir});
    if(r.code!==0)return {success:false,error:'Basic Pitch dependencies failed: '+(r.err||r.out).slice(-3000)};

    r=await runProcess(py,['-m','pip','install','--no-cache-dir','--no-deps','basic-pitch==0.4.0'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'Basic Pitch install failed: '+(r.err||r.out).slice(-3000)};

    const script="import json,sys\\nfrom basic_pitch.inference import predict\\nfrom basic_pitch import ICASSP_2022_MODEL_PATH\\npath=sys.argv[1]\\n_,_,notes=predict(path,ICASSP_2022_MODEL_PATH)\\nout=[]\\nfor n in notes:\\n    try:\\n        st,en,pitch,amp,*rest=n\\n        out.append({'start':float(st),'end':float(en),'pitch':int(pitch),'amp':float(amp)})\\n    except Exception:\\n        pass\\nprint(json.dumps(out))\\n";
    fs.writeFileSync(reperfScript(),script,'utf8');
    const s=reperfStatusSync();
    return s.available?{success:true,dir:s.dir}:{success:false,error:s.reason||'Verification failed'};
  }catch(e){return {success:false,error:e.message};}
});

ipcMain.handle('reperf-bass-notes',async(event,inputPath)=>{
  try{
    if(!inputPath||!fs.existsSync(inputPath))return {success:false,error:'Bass stem not found'};
    const s=reperfStatusSync();
    if(!s.available)return {success:false,error:(s.reason||'Re-Performance engine unavailable')+'. Click Setup Re-Performance first.'};
    const r=await runProcess(s.python,[reperfScript(),inputPath],{cwd:s.dir});
    if(r.code!==0)return {success:false,error:(r.err||r.out).slice(-4000)};
    const lines=(r.out||'').trim().split(/\r?\n/).filter(Boolean);
    let data=null;
    for(let i=lines.length-1;i>=0;i--){try{data=JSON.parse(lines[i]);break}catch(_){}}
    if(!Array.isArray(data))return {success:false,error:'Basic Pitch returned no note data'};
    return {success:true,notes:data,count:data.length};
  }catch(e){return {success:false,error:e.message};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.5.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.5.0 Re-Performance backend patch applied')
