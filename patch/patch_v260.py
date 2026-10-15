from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'instrumentManagerList:' not in pt:
    pt=pt.replace("  analyzeBassNotes: (inputPath) => ipcRenderer.invoke('reperf-bass-notes', inputPath),",
                  "  analyzeBassNotes: (inputPath) => ipcRenderer.invoke('reperf-bass-notes', inputPath),\n  instrumentManagerList: () => ipcRenderer.invoke('instrument-list'),\n  installStarterInstruments: () => ipcRenderer.invoke('instrument-install-starter'),\n  installInstrumentFromUrl: (url) => ipcRenderer.invoke('instrument-install-url', url),\n  removeInstrumentPack: (id) => ipcRenderer.invoke('instrument-remove', id),\n  selectInstrumentPackZip: () => ipcRenderer.invoke('instrument-select-zip'),\n  installInstrumentFromZip: (zipPath) => ipcRenderer.invoke('instrument-install-zip', zipPath),")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_INSTRUMENT_MANAGER_V260' not in mt:
    mt += r'''

// HUMANDETECT_INSTRUMENT_MANAGER_V260
function instrumentRoot(){ const p=path.join(app.getPath('userData'),'instrument_packs'); fs.mkdirSync(p,{recursive:true}); return p; }
function sanitizePackId(s){ return String(s||'pack').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'pack'; }
function instrumentEmit(text){ try{ if(mainWindow) mainWindow.webContents.send('instrument-progress',{text}); }catch(_){} }
function resolvePack(dir){
  const mf=path.join(dir,'instrument.json'); if(!fs.existsSync(mf)) return null;
  const m=JSON.parse(fs.readFileSync(mf,'utf8')); const out={...m,dir};
  if(m.samples&&typeof m.samples==='object'){ out.samplePaths={}; for(const [k,v] of Object.entries(m.samples)){ const p=path.resolve(dir,String(v)); if(p.startsWith(path.resolve(dir))&&fs.existsSync(p)) out.samplePaths[k]=p; } }
  if(m.sample){ const p=path.resolve(dir,String(m.sample)); if(p.startsWith(path.resolve(dir))&&fs.existsSync(p)) out.samplePath=p; }
  return out;
}
function listInstrumentPacks(){
  const root=instrumentRoot(),out=[];
  for(const e of fs.readdirSync(root,{withFileTypes:true})){ if(e.isDirectory()){ try{ const p=resolvePack(path.join(root,e.name)); if(p) out.push(p); }catch(_){} } }
  return out;
}
function writeMonoWav(file,samples,sr=48000){
  const n=samples.length,buf=Buffer.alloc(44+n*2);
  buf.write('RIFF',0);buf.writeUInt32LE(36+n*2,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(sr,24);buf.writeUInt32LE(sr*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,samples[i]||0));buf.writeInt16LE(Math.round(x*(x<0?32768:32767)),44+i*2);}
  fs.writeFileSync(file,buf);
}
function prng(i){ const x=Math.sin((i+1)*12.9898)*43758.5453; return (x-Math.floor(x))*2-1; }
function installStarterPacks(){
  const root=instrumentRoot();
  const drumDir=path.join(root,'humandetect-starter-drums'),bassDir=path.join(root,'humandetect-starter-bass');
  fs.mkdirSync(drumDir,{recursive:true});fs.mkdirSync(bassDir,{recursive:true});
  const sr=48000;
  const kick=new Float32Array(Math.floor(sr*.5)); for(let i=0;i<kick.length;i++){const t=i/sr,f=110-72*Math.min(1,t/.28);kick[i]=Math.sin(2*Math.PI*f*t)*Math.exp(-t*16)*.9;}
  const snare=new Float32Array(Math.floor(sr*.35)); for(let i=0;i<snare.length;i++){const t=i/sr;snare[i]=(prng(i)*.78+Math.sin(2*Math.PI*185*t)*.22)*Math.exp(-t*19)*.7;}
  const hat=new Float32Array(Math.floor(sr*.18)); for(let i=0;i<hat.length;i++){const t=i/sr;hat[i]=(prng(i)-.65*prng(Math.max(0,i-1)))*Math.exp(-t*46)*.45;}
  writeMonoWav(path.join(drumDir,'kick.wav'),kick,sr);writeMonoWav(path.join(drumDir,'snare.wav'),snare,sr);writeMonoWav(path.join(drumDir,'hat.wav'),hat,sr);
  fs.writeFileSync(path.join(drumDir,'instrument.json'),JSON.stringify({id:'humandetect-starter-drums',name:'HumanDetect Starter Drums',type:'drums',version:'1.0.0',license:'Procedural starter pack',samples:{kick:'kick.wav',snare:'snare.wav',hat:'hat.wav'}},null,2));

  const bass=new Float32Array(Math.floor(sr*2.5)); const f=65.406;
  for(let i=0;i<bass.length;i++){const t=i/sr,env=Math.min(1,t/.02)*Math.exp(-t*.72);bass[i]=(Math.sin(2*Math.PI*f*t)+.26*Math.sin(2*Math.PI*f*2*t)+.08*Math.sin(2*Math.PI*f*3*t))*env*.52;}
  writeMonoWav(path.join(bassDir,'bass-c2.wav'),bass,sr);
  fs.writeFileSync(path.join(bassDir,'instrument.json'),JSON.stringify({id:'humandetect-starter-bass',name:'HumanDetect Starter Bass',type:'bass',version:'1.0.0',license:'Procedural starter pack',rootMidi:36,sample:'bass-c2.wav'},null,2));
  return listInstrumentPacks();
}
async function installPackZip(zipPath){
  if(!zipPath||!fs.existsSync(zipPath)) throw new Error('ZIP file not found');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hd-instrument-'));
  const z=String(zipPath).replace(/'/g,"''"),d=String(tmp).replace(/'/g,"''");
  const ps="Expand-Archive -LiteralPath '"+z+"' -DestinationPath '"+d+"' -Force";
  const r=await runProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{cwd:tmp});
  if(r.code!==0) throw new Error('Could not extract instrument ZIP: '+(r.err||r.out).slice(-2200));
  let mf=null; const walk=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name==='instrument.json')return p;if(e.isDirectory()){const x=walk(p);if(x)return x;}}return null;}; mf=walk(tmp);
  if(!mf) throw new Error('instrument.json not found in ZIP');
  const manifest=JSON.parse(fs.readFileSync(mf,'utf8')),id=sanitizePackId(manifest.id||manifest.name),src=path.dirname(mf),dst=path.join(instrumentRoot(),id);
  fs.rmSync(dst,{recursive:true,force:true});fs.cpSync(src,dst,{recursive:true});fs.rmSync(tmp,{recursive:true,force:true});
  const pack=resolvePack(dst);if(!pack)throw new Error('Installed pack is invalid');return pack;
}
ipcMain.handle('instrument-list',async()=>({success:true,packs:listInstrumentPacks()}));
ipcMain.handle('instrument-install-starter',async()=>{try{instrumentEmit('Generating starter instrument packs...');return {success:true,packs:installStarterPacks()};}catch(e){return {success:false,error:e.message};}});
ipcMain.handle('instrument-select-zip',async()=>{const r=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Instrument Pack ZIP',extensions:['zip']}]});return {canceled:r.canceled,path:r.filePaths?.[0]||null};});
ipcMain.handle('instrument-install-zip',async(e,zipPath)=>{try{instrumentEmit('Installing local instrument pack...');const pack=await installPackZip(zipPath);return {success:true,pack,packs:listInstrumentPacks()};}catch(err){return {success:false,error:err.message};}});
ipcMain.handle('instrument-install-url',async(e,url)=>{
  try{
    if(!/^https?:\/\//i.test(String(url||''))) return {success:false,error:'Use an http/https direct ZIP URL'};
    const tmp=path.join(os.tmpdir(),'hd-instrument-'+Date.now()+'.zip');instrumentEmit('Downloading instrument pack...');
    const res=await fetch(url,{redirect:'follow'});if(!res.ok)throw new Error('Download failed HTTP '+res.status);
    const ab=await res.arrayBuffer();fs.writeFileSync(tmp,Buffer.from(ab));instrumentEmit('Download complete. Installing pack...');
    const pack=await installPackZip(tmp);try{fs.unlinkSync(tmp)}catch(_){}
    return {success:true,pack,packs:listInstrumentPacks()};
  }catch(err){return {success:false,error:err.message};}
});
ipcMain.handle('instrument-remove',async(e,id)=>{try{const dir=path.join(instrumentRoot(),sanitizePackId(id));fs.rmSync(dir,{recursive:true,force:true});return {success:true,packs:listInstrumentPacks()};}catch(err){return {success:false,error:err.message};}});
'''
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.6.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.6 Instrument Manager backend applied')
