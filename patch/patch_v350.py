from pathlib import Path
import json

root=Path('.')

# Preload bridge
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'musicClassifierStatus:' not in pt:
    anchor='\n});'
    i=pt.rfind(anchor)
    if i<0: raise SystemExit('preload close anchor not found')
    before=pt[:i].rstrip()
    if not before.endswith(','): before += ','
    before += """
  musicClassifierStatus: () => ipcRenderer.invoke('music-classifier-status'),
  musicClassifierSetup: () => ipcRenderer.invoke('music-classifier-setup'),
  musicClassifierRun: (filePath) => ipcRenderer.invoke('music-classifier-run', filePath)
"""
    pt=before+pt[i:]
preload.write_text(pt,encoding='utf-8')

# Main-process backend
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_MUSIC_CLASSIFIER_V350' not in mt:
    mt += r'''

// HUMANDETECT_MUSIC_CLASSIFIER_V350
function musicClassifierDir(){const p=path.join(app.getPath('userData'),'music_classifier');fs.mkdirSync(p,{recursive:true});return p;}
function musicClassifierPy(){return path.join(musicClassifierDir(),'.venv','Scripts','python.exe');}
function musicClassifierStatusSync(){
  const py=musicClassifierPy();
  if(!fs.existsSync(py))return {trebloAvailable:false,reason:'Treblo classifier environment not installed'};
  try{
    const r=spawnSync(py,['-c','import treblo_classifier; print("ok")'],{cwd:musicClassifierDir(),encoding:'utf8',windowsHide:true});
    return {trebloAvailable:r.status===0,python:py,reason:r.status===0?null:(r.stderr||r.stdout||'import failed').slice(-1800)};
  }catch(e){return {trebloAvailable:false,python:py,reason:e.message};}
}
function scanMusicProvenance(filePath){
  const st=fs.statSync(filePath),max=8*1024*1024,parts=[];
  const fd=fs.openSync(filePath,'r');
  try{
    const n1=Math.min(max,st.size),b1=Buffer.alloc(n1);fs.readSync(fd,b1,0,n1,0);parts.push(b1);
    if(st.size>max){
      const n2=Math.min(max,st.size),b2=Buffer.alloc(n2);fs.readSync(fd,b2,0,n2,Math.max(0,st.size-n2));parts.push(b2);
    }
  }finally{fs.closeSync(fd);}
  const txt=Buffer.concat(parts).toString('latin1').toLowerCase();
  const defs=[
    {source:'Suno',tokens:['suno.ai','suno.com','suno_','suno-','contentcredentials:suno']},
    {source:'Mureka',tokens:['mureka.ai','mureka.com','mureka_','mureka-']},
    {source:'Treblo',tokens:['treblo.com','treblo.ai','trebloapp','treblo_','treblo-']},
    {source:'Udio',tokens:['udio.com','udio.ai','udio_','udio-']},
    {source:'MusicGen',tokens:['musicgen','audiocraft']},
    {source:'Stable Audio',tokens:['stableaudio','stable audio']}
  ];
  const matches=[];const hits={};
  for(const d of defs){
    hits[d.source]=[];
    for(const token of d.tokens){
      if(txt.includes(token)){hits[d.source].push(token);matches.push(d.source+': '+token);}
    }
  }
  let strong_source=null;
  for(const s of ['Suno','Mureka','Treblo','Udio']){
    if(hits[s]?.length){strong_source=s;break;}
  }
  return {strong_source,matches,hits,bytes_scanned:parts.reduce((a,b)=>a+b.length,0),file_size:st.size};
}
function parseJsonTail(s){
  const text=String(s||'').trim();
  for(let i=text.lastIndexOf('{');i>=0;i=text.lastIndexOf('{',i-1)){
    try{return JSON.parse(text.slice(i));}catch(_){}
  }
  try{return JSON.parse(text);}catch(_){return null;}
}
ipcMain.handle('music-classifier-status',async()=>musicClassifierStatusSync());
ipcMain.handle('music-classifier-setup',async()=>{
  try{
    const mp=await ensureManagedPython311();
    if(!mp?.success)return {success:false,error:mp?.error||'Managed Python 3.11 setup failed'};
    const dir=musicClassifierDir(),py=musicClassifierPy();fs.mkdirSync(dir,{recursive:true});
    if(!fs.existsSync(py)){
      const r=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(r.code!==0)return {success:false,error:'Classifier venv failed: '+(r.err||r.out).slice(-2200)};
    }
    let r=await runProcess(py,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'ensurepip failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--upgrade','pip','setuptools','wheel'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'pip setup failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--upgrade','git+https://github.com/Sonauto/treblo-classifier.git'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'Treblo classifier install failed: '+(r.err||r.out).slice(-4000)};
    const s=musicClassifierStatusSync();
    return s.trebloAvailable?{success:true,...s}:{success:false,error:s.reason||'Treblo verification failed'};
  }catch(e){return {success:false,error:e.message};}
});
ipcMain.handle('music-classifier-run',async(e,filePath)=>{
  try{
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Audio file not found'};
    const provenance=scanMusicProvenance(filePath);
    const s=musicClassifierStatusSync();
    let treblo=null,trebloError=null;
    if(s.trebloAvailable){
      const r=await runProcess(s.python,['-m','treblo_classifier.cli','--json','--device','cpu',filePath],{cwd:musicClassifierDir()});
      const data=parseJsonTail(r.out);
      if(r.code===0&&data?.results?.length)treblo=data.results[0];
      else trebloError=(r.err||r.out||'Treblo classifier returned no result').slice(-3000);
    }else{
      trebloError=s.reason||'Treblo classifier not installed';
    }
    return {success:true,provenance,treblo,trebloError,notes:{
      treblo:'Direct source-specific classifier from Sonauto/Treblo.',
      suno:'Source label only when explicit provenance is present; general AI detectors are not source attribution.',
      mureka:'No verified open-source Mureka-specific audio classifier was found in the supplied/reviewed GitHub references.'
    }};
  }catch(err){return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

# Renderer integration
app=root/'web'/'app.js'
at=app.read_text(encoding='utf-8')
imp="import { mountMusicClassifierPanel } from './human-detect/music-classifier-panel.js';\n"
if imp not in at:
    at=imp+at
marker='// HUMANDETECT_MUSIC_CLASSIFIER_PANEL_V350'
if marker not in at:
    at += r'''

// HUMANDETECT_MUSIC_CLASSIFIER_PANEL_V350
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountMusicClassifierPanel({
      getOriginalPath: async () => fileState.selectedFilePath || null
    });
    console.log('[HumanDetect] v3.5 Music Source Classifier mounted');
  } catch (err) {
    console.error('[HumanDetect] Music Source Classifier failed to mount:', err);
  }
});
'''
app.write_text(at,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.5.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.5.0 Music Source Classifier applied')
