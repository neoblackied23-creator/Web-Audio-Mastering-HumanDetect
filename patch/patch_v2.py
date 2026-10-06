from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
text=app.read_text(encoding='utf-8')
imp="import { mountExternalDetectorPanel } from './human-detect/external-detector-panel.js';\n"
if imp not in text:
    text=imp+text
marker='// HUMANDETECT_EXTERNAL_DETECTOR_V2'
if marker not in text:
    text += r'''

// HUMANDETECT_EXTERNAL_DETECTOR_V2
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountExternalDetectorPanel({
      getOriginalPath: async () => fileState.selectedFilePath || null
    });
    console.log('[HumanDetect] offline detector panel mounted');
  } catch (err) {
    console.error('[HumanDetect] offline detector panel failed:', err);
  }
});
'''
app.write_text(text,encoding='utf-8')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'openDetectorStatus:' not in pt:
    pt=pt.replace("  separateStems: (inputPath) => ipcRenderer.invoke('stem-separate', inputPath)",
                  "  separateStems: (inputPath) => ipcRenderer.invoke('stem-separate', inputPath),\n  openDetectorStatus: () => ipcRenderer.invoke('open-detector-status'),\n  setupOpenDetector: () => ipcRenderer.invoke('open-detector-setup'),\n  runOpenDetector: (inputPath) => ipcRenderer.invoke('open-detector-run', inputPath)")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_OPEN_DETECTOR_V2' not in mt:
    mt += r'''

// HUMANDETECT_OPEN_DETECTOR_V2
function openDetectorDir() {
  return path.join(app.getPath('userData'), 'audiodeepfake_public');
}
function runProcess(cmd, args, opts={}) {
  return new Promise((resolve) => {
    let out='', err='';
    const p=spawn(cmd,args,{windowsHide:true,...opts});
    p.stdout?.on('data',d=>{out+=d.toString(); if(mainWindow) mainWindow.webContents.send('processing-progress',{type:'open-detector',text:d.toString()});});
    p.stderr?.on('data',d=>{err+=d.toString(); if(mainWindow) mainWindow.webContents.send('processing-progress',{type:'open-detector',text:d.toString()});});
    p.on('error',e=>resolve({code:-1,out,err:e.message}));
    p.on('close',code=>resolve({code,out,err}));
  });
}
function detectorPython() {
  return pythonCmd();
}
function openDetectorStatusSync() {
  const py=detectorPython();
  const dir=openDetectorDir();
  if(!py) return {available:false,reason:'Python not found',dir};
  if(!fs.existsSync(path.join(dir,'inference','__init__.py'))) return {available:false,reason:'Detector repository not installed',dir,python:py};
  try {
    const r=spawnSync(py,['-c','from inference import detect; print("ok")'],{cwd:dir,encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONPATH:dir}});
    return {available:r.status===0,reason:r.status===0?null:(r.stderr||r.stdout||'Detector dependencies missing').slice(-1500),dir,python:py};
  } catch(e) { return {available:false,reason:e.message,dir,python:py}; }
}
ipcMain.handle('open-detector-status', async()=>openDetectorStatusSync());
ipcMain.handle('open-detector-setup', async()=>{
  try {
    const py=detectorPython();
    if(!py) return {success:false,error:'Python 3.10–3.12 is required.'};
    const dir=openDetectorDir();
    if(!fs.existsSync(dir)) {
      const parent=path.dirname(dir); fs.mkdirSync(parent,{recursive:true});
      const g=await runProcess('git',['clone','--depth','1','https://github.com/stbiadmin/audiodeepfake_public.git',dir]);
      if(g.code!==0) return {success:false,error:'Git clone failed: '+(g.err||g.out).slice(-1800)};
    } else {
      await runProcess('git',['pull','--ff-only'],{cwd:dir});
    }
    const up=await runProcess(py,['-m','pip','install','--upgrade','pip'],{cwd:dir});
    if(up.code!==0) return {success:false,error:'pip upgrade failed: '+(up.err||up.out).slice(-1800)};
    const inst=await runProcess(py,['-m','pip','install','-r','requirements.txt','--extra-index-url','https://download.pytorch.org/whl/cpu'],{cwd:dir});
    if(inst.code!==0) return {success:false,error:'Detector dependencies failed: '+(inst.err||inst.out).slice(-2200)};
    const s=openDetectorStatusSync();
    return s.available?{success:true,dir}:{success:false,error:s.reason||'Detector import check failed'};
  } catch(e) { return {success:false,error:e.message}; }
});
ipcMain.handle('open-detector-run', async(event,inputPath)=>{
  try {
    if(!inputPath||!fs.existsSync(inputPath)) return {success:false,error:'Input audio file not found'};
    const s=openDetectorStatusSync();
    if(!s.available) return {success:false,error:s.reason||'Detector not ready'};
    const code=`import json,sys\nfrom inference import detect\nr=detect(sys.argv[1], model='music', return_metadata=True)\nprint('__HDJSON__'+json.dumps(r, default=str))`;
    const r=await runProcess(s.python,['-c',code,inputPath],{cwd:s.dir,env:{...process.env,PYTHONPATH:s.dir}});
    if(r.code!==0) return {success:false,error:(r.err||r.out).slice(-2500)};
    const line=r.out.split(/\r?\n/).reverse().find(x=>x.startsWith('__HDJSON__'));
    if(!line) return {success:false,error:'Detector returned no JSON result. '+r.out.slice(-1200)};
    const data=JSON.parse(line.slice('__HDJSON__'.length));
    return {success:true,...data};
  } catch(e) { return {success:false,error:e.message}; }
});
'''
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.0.0'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.0.0 offline detector patch applied')
