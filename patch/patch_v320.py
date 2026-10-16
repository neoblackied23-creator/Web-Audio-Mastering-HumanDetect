from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
anchor="  instrumentCloudRemove: (id) => ipcRenderer.invoke('instrument-cloud-remove', id),"
if 'instrumentPackBuilderSelectFolder:' not in pt:
    pt=pt.replace(anchor, anchor + """
  instrumentPackBuilderSelectFolder: () => ipcRenderer.invoke('instrument-builder-select-folder'),
  instrumentPackBuilderSelectZip: () => ipcRenderer.invoke('instrument-builder-select-zip'),
  instrumentPackBuilderAnalyze: (sourcePath) => ipcRenderer.invoke('instrument-builder-analyze', sourcePath),
  instrumentPackBuilderBuild: (options) => ipcRenderer.invoke('instrument-builder-build', options),
  instrumentPackBuilderDiscard: (sessionId) => ipcRenderer.invoke('instrument-builder-discard', sessionId),""")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_PACK_BUILDER_V320' not in mt:
    mt += r'''

// HUMANDETECT_PACK_BUILDER_V320
const packBuilderSessions=new Map();
const PACK_AUDIO_EXT=new Set(['.wav','.mp3','.flac','.ogg','.m4a','.aac']);
function pbEmit(text){try{if(mainWindow)mainWindow.webContents.send('instrument-progress',{text});}catch(_){}}
function pbWalkAudio(root,maxFiles=2000){
  const out=[],stack=[root];
  while(stack.length&&out.length<maxFiles){
    const dir=stack.pop();let entries=[];
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch(_){continue;}
    for(const e of entries){
      const p=path.join(dir,e.name);
      if(e.isDirectory()){if(!e.name.startsWith('.'))stack.push(p);}
      else if(e.isFile()&&PACK_AUDIO_EXT.has(path.extname(e.name).toLowerCase()))out.push(p);
      if(out.length>=maxFiles)break;
    }
  }
  return out;
}
function pbBase(p){return path.basename(p,path.extname(p)).toLowerCase();}
function pbScoreName(name,words){
  let s=0;
  for(const w of words){
    if(name===w)s+=12;
    else if(name.includes(w))s+=3;
  }
  return s;
}
function pbMidiFromName(name){
  const m=String(name).match(/(?:^|[^a-z0-9])([a-gA-G])([#b]?)[-_ ]?(-?\d)(?:[^0-9]|$)/);
  if(!m)return null;
  const note={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()];
  let accidental=0;if(m[2]==='#')accidental=1;else if(m[2]==='b')accidental=-1;
  const oct=Number(m[3]);const midi=(oct+1)*12+note+accidental;
  return midi>=0&&midi<=127?midi:null;
}
function pbAnalyzeFiles(files){
  const drumWords={
    kick:['kick','bd','bassdrum','bass-drum'],
    snare:['snare','sd','clap','rim'],
    hat:['hihat','hi-hat','hat','hh','closedhat','closed-hat']
  };
  let drumScore=0,bassScore=0;
  const ranked={kick:[],snare:[],hat:[],bass:[]};
  for(const p of files){
    const n=pbBase(p);
    for(const k of ['kick','snare','hat']){
      const s=pbScoreName(n,drumWords[k]);if(s){ranked[k].push({path:p,score:s,name:path.basename(p)});drumScore+=s;}
    }
    let bs=pbScoreName(n,['bass','subbass','sub-bass','electricbass','bassguitar','bass-guitar']);
    const midi=pbMidiFromName(n);if(midi!==null){bs+=5;if(midi>=24&&midi<=60)bs+=4;}
    if(bs){ranked.bass.push({path:p,score:bs,name:path.basename(p),rootMidi:midi});bassScore+=bs;}
  }
  for(const k of Object.keys(ranked))ranked[k].sort((a,b)=>b.score-a.score||a.name.length-b.name.length);
  const drumKinds=['kick','snare','hat'].filter(k=>ranked[k].length).length;
  let detectedType='unknown';
  if(drumKinds>=2&&drumScore>=bassScore)detectedType='drums';
  else if(ranked.bass.length||files.length===1)detectedType='bass';
  const bass=ranked.bass[0]||files.map(p=>({path:p,name:path.basename(p),score:0,rootMidi:pbMidiFromName(pbBase(p))})).find(x=>x.rootMidi!==null)||null;
  return {
    detectedType,drumScore,bassScore,
    mapping:{kick:ranked.kick[0]?.path||null,snare:ranked.snare[0]?.path||null,hat:ranked.hat[0]?.path||null,bass:bass?.path||null,rootMidi:bass?.rootMidi??36},
    candidates:{kick:ranked.kick.slice(0,8),snare:ranked.snare.slice(0,8),hat:ranked.hat.slice(0,8),bass:ranked.bass.slice(0,12)}
  };
}
async function pbExtractZip(zipPath){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hd-pack-builder-'));
  const z=String(zipPath).replace(/'/g,"''"),d=String(tmp).replace(/'/g,"''");
  const ps="Expand-Archive -LiteralPath '"+z+"' -DestinationPath '"+d+"' -Force";
  const r=await runProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{cwd:tmp});
  if(r.code!==0){fs.rmSync(tmp,{recursive:true,force:true});throw new Error('Could not extract ZIP: '+(r.err||r.out).slice(-1800));}
  return tmp;
}
function pbSafeSource(session,p){
  if(!p)return null;
  const abs=path.resolve(String(p)),base=path.resolve(session.root)+path.sep;
  if(abs===path.resolve(session.root)||abs.startsWith(base)){
    if(fs.existsSync(abs)&&fs.statSync(abs).isFile()&&PACK_AUDIO_EXT.has(path.extname(abs).toLowerCase()))return abs;
  }
  return null;
}
function pbUniqueName(dst,name){
  const ext=path.extname(name),stem=path.basename(name,ext).replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,70)||'sample';
  let n=stem+ext.toLowerCase(),i=2;
  while(fs.existsSync(path.join(dst,n))){n=stem+'-'+i+ext.toLowerCase();i++;}
  return n;
}
ipcMain.handle('instrument-builder-select-folder',async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory']});
  return {canceled:r.canceled,path:r.filePaths?.[0]||null};
});
ipcMain.handle('instrument-builder-select-zip',async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Sample ZIP',extensions:['zip']}]});
  return {canceled:r.canceled,path:r.filePaths?.[0]||null};
});
ipcMain.handle('instrument-builder-analyze',async(e,sourcePath)=>{
  try{
    if(!sourcePath||!fs.existsSync(sourcePath))return {success:false,error:'Source path not found'};
    pbEmit('Pack Builder: scanning source...');
    let scanRoot=sourcePath,temp=false,sourceKind='folder';
    const st=fs.statSync(sourcePath);
    if(st.isFile()){
      if(path.extname(sourcePath).toLowerCase()!=='.zip')return {success:false,error:'Choose a folder or ZIP file'};
      scanRoot=await pbExtractZip(sourcePath);temp=true;sourceKind='zip';
    }else if(!st.isDirectory())return {success:false,error:'Source must be a folder or ZIP'};
    const files=pbWalkAudio(scanRoot,2000);
    if(!files.length){if(temp)fs.rmSync(scanRoot,{recursive:true,force:true});return {success:false,error:'No supported audio samples found (.wav/.mp3/.flac/.ogg/.m4a/.aac)'};}
    const analysis=pbAnalyzeFiles(files),id=crypto.randomBytes(10).toString('hex');
    const session={id,root:scanRoot,temp,sourcePath,sourceKind,files,analysis,created:Date.now()};
    packBuilderSessions.set(id,session);
    pbEmit('Pack Builder: '+files.length+' audio files found • '+analysis.detectedType);
    return {success:true,sessionId:id,sourceKind,fileCount:files.length,detectedType:analysis.detectedType,mapping:analysis.mapping,candidates:analysis.candidates,files:files.slice(0,120).map(p=>({path:p,name:path.basename(p),relative:path.relative(scanRoot,p)})),truncated:files.length>120};
  }catch(err){return {success:false,error:err.message};}
});
ipcMain.handle('instrument-builder-build',async(e,options)=>{
  try{
    const o=options||{},s=packBuilderSessions.get(String(o.sessionId||''));
    if(!s)return {success:false,error:'Pack Builder session expired. Analyze source again.'};
    const type=String(o.type||s.analysis.detectedType);
    if(!['drums','bass'].includes(type))return {success:false,error:'Choose pack type: drums or bass'};
    const name=String(o.name||'Custom Instrument Pack').trim().slice(0,80)||'Custom Instrument Pack';
    const id=sanitizePackId(o.id||name.toLowerCase());
    const dst=path.join(instrumentRoot(),id);fs.rmSync(dst,{recursive:true,force:true});fs.mkdirSync(dst,{recursive:true});
    pbEmit('Pack Builder: creating '+type+' pack...');
    let manifest={id,name,type,version:'1.0.0',license:String(o.license||'User-provided samples; rights not verified'),builtBy:'HumanDetect Pack Builder v3.2'};
    if(type==='drums'){
      const map=o.mapping||s.analysis.mapping,samples={};
      for(const k of ['kick','snare','hat']){
        const src=pbSafeSource(s,map[k]);if(!src)continue;
        const fn=pbUniqueName(dst,k+path.extname(src));fs.copyFileSync(src,path.join(dst,fn));samples[k]=fn;
      }
      if(!samples.kick||!samples.snare||!samples.hat){fs.rmSync(dst,{recursive:true,force:true});return {success:false,error:'Drum pack requires kick, snare, and hat mappings.'};}
      manifest.samples=samples;
    }else{
      const map=o.mapping||s.analysis.mapping,src=pbSafeSource(s,map.bass);
      if(!src){fs.rmSync(dst,{recursive:true,force:true});return {success:false,error:'Bass sample mapping is required.'};}
      const fn=pbUniqueName(dst,'bass'+path.extname(src));fs.copyFileSync(src,path.join(dst,fn));
      manifest.sample=fn;manifest.rootMidi=Math.max(0,Math.min(127,Number(o.rootMidi??map.rootMidi??36)||36));
    }
    fs.writeFileSync(path.join(dst,'instrument.json'),JSON.stringify(manifest,null,2),'utf8');
    const pack=resolvePack(dst);if(!pack)throw new Error('Built pack validation failed');
    pbEmit('Pack Builder: DONE • '+name);
    return {success:true,pack,packs:listInstrumentPacks()};
  }catch(err){return {success:false,error:err.message};}
});
ipcMain.handle('instrument-builder-discard',async(e,sessionId)=>{
  try{
    const id=String(sessionId||''),s=packBuilderSessions.get(id);
    if(s?.temp)fs.rmSync(s.root,{recursive:true,force:true});
    packBuilderSessions.delete(id);return {success:true};
  }catch(err){return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.2.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.2 Pack Builder backend applied')
