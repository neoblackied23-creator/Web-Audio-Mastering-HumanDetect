from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
anchor="  installInstrumentFromZip: (zipPath) => ipcRenderer.invoke('instrument-install-zip', zipPath),"
if 'instrumentCloudCatalog:' not in pt:
    pt=pt.replace(anchor, anchor + """
  instrumentCloudCatalog: (force=false) => ipcRenderer.invoke('instrument-cloud-catalog', force),
  instrumentCloudDownload: (id) => ipcRenderer.invoke('instrument-cloud-download', id),
  instrumentCloudInstall: (id) => ipcRenderer.invoke('instrument-cloud-install', id),
  instrumentCloudRemove: (id) => ipcRenderer.invoke('instrument-cloud-remove', id),""")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if "const crypto = require('crypto');" not in mt:
    mt=mt.replace("const fs = require('fs');","const fs = require('fs');\nconst crypto = require('crypto');")
if 'HUMANDETECT_INSTRUMENT_CLOUD_V310' not in mt:
    mt += r'''

// HUMANDETECT_INSTRUMENT_CLOUD_V310
const INSTRUMENT_RELEASE_TAG='instrument-cache-v1';
const INSTRUMENT_RELEASE_BASE='https://github.com/neoblackied23-creator/Web-Audio-Mastering-HumanDetect/releases/download/'+INSTRUMENT_RELEASE_TAG;
function instrumentCloudRoot(){const p=path.join(app.getPath('userData'),'instrument_cloud_cache');fs.mkdirSync(p,{recursive:true});return p;}
function instrumentCloudManifestPath(){return path.join(instrumentCloudRoot(),'manifest.json');}
function sha256File(p){const h=crypto.createHash('sha256');h.update(fs.readFileSync(p));return h.digest('hex');}
async function fetchInstrumentCloudManifest(force=false){
  const cache=instrumentCloudManifestPath();
  if(!force && fs.existsSync(cache)){
    try{
      const age=Date.now()-fs.statSync(cache).mtimeMs;
      if(age<6*3600*1000)return JSON.parse(fs.readFileSync(cache,'utf8'));
    }catch(_){}
  }
  try{
    instrumentEmit('Cloud Catalog: fetching manifest...');
    const res=await fetch(INSTRUMENT_RELEASE_BASE+'/manifest.json',{redirect:'follow',cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const txt=await res.text();const data=JSON.parse(txt);
    fs.writeFileSync(cache,JSON.stringify(data,null,2),'utf8');
    return data;
  }catch(e){
    if(fs.existsSync(cache)){
      const data=JSON.parse(fs.readFileSync(cache,'utf8'));data._offline=true;data._warning=e.message;return data;
    }
    throw new Error('Cloud catalog unavailable: '+e.message);
  }
}
function cloudAssetState(a){
  const file=path.join(instrumentCloudRoot(),path.basename(a.file||''));
  let downloaded=false,valid=false,size=0;
  if(a.file && fs.existsSync(file)){
    downloaded=true;size=fs.statSync(file).size;
    try{valid=!a.sha256 || sha256File(file).toLowerCase()===String(a.sha256).toLowerCase();}catch(_){}
  }
  const installed=listInstrumentPacks().some(p=>p.cloudAssetId===a.id||p.id===a.id);
  return {...a,downloaded,valid,size,installed,localPath:downloaded?file:null,
    downloadUrl:a.file?INSTRUMENT_RELEASE_BASE+'/'+encodeURIComponent(path.basename(a.file)):null};
}
async function cloudCatalog(force=false){
  const m=await fetchInstrumentCloudManifest(force);
  return {success:true,offline:!!m._offline,warning:m._warning||null,assets:(m.assets||[]).map(cloudAssetState)};
}
async function downloadCloudAsset(id){
  const cat=await cloudCatalog(false),a=cat.assets.find(x=>x.id===id);
  if(!a)throw new Error('Cloud asset not found: '+id);
  if(!a.downloadUrl)throw new Error('Cloud asset has no download URL');
  const dst=path.join(instrumentCloudRoot(),path.basename(a.file));
  const tmp=dst+'.part';
  instrumentEmit('Cloud Download: '+a.name+' • 0%');
  const res=await fetch(a.downloadUrl,{redirect:'follow',cache:'no-store'});
  if(!res.ok)throw new Error('Download HTTP '+res.status);
  const total=Number(res.headers.get('content-length'))||0;
  const reader=res.body?.getReader?.();let received=0,lastPct=-1;
  if(reader){
    const fh=fs.openSync(tmp,'w');
    try{
      while(true){
        const {done,value}=await reader.read();if(done)break;
        const b=Buffer.from(value);fs.writeSync(fh,b);received+=b.length;
        const pct=total?Math.floor(received/total*100):0;
        if(pct!==lastPct && (pct%5===0||pct===100)){lastPct=pct;instrumentEmit('Cloud Download: '+a.name+' • '+(total?pct+'%':Math.round(received/1024)+' KB'));}
      }
    }finally{fs.closeSync(fh);}
  }else{
    const ab=await res.arrayBuffer();fs.writeFileSync(tmp,Buffer.from(ab));received=ab.byteLength;
  }
  const got=sha256File(tmp);
  if(a.sha256 && got.toLowerCase()!==String(a.sha256).toLowerCase()){fs.rmSync(tmp,{force:true});throw new Error('Checksum mismatch for '+a.name);}
  fs.renameSync(tmp,dst);instrumentEmit('Cloud Download: '+a.name+' • DONE');
  return cloudAssetState(a);
}
ipcMain.handle('instrument-cloud-catalog',async(e,force)=>{try{return await cloudCatalog(!!force);}catch(err){return {success:false,error:err.message,assets:[]};}});
ipcMain.handle('instrument-cloud-download',async(e,id)=>{try{const asset=await downloadCloudAsset(id);return {success:true,asset};}catch(err){return {success:false,error:err.message};}});
ipcMain.handle('instrument-cloud-install',async(e,id)=>{
  try{
    const cat=await cloudCatalog(false);let a=cat.assets.find(x=>x.id===id);if(!a)throw new Error('Cloud asset not found');
    if(!a.app_usable)return {success:false,error:'This cloud item is source/reference only and is not an installable instrument pack.'};
    if(!a.downloaded||!a.valid){a=await downloadCloudAsset(id);}
    const pack=await installPackZip(a.localPath);
    const mf=path.join(pack.dir,'instrument.json');
    const m=JSON.parse(fs.readFileSync(mf,'utf8'));m.cloudAssetId=id;fs.writeFileSync(mf,JSON.stringify(m,null,2),'utf8');
    return {success:true,pack:resolvePack(pack.dir),packs:listInstrumentPacks()};
  }catch(err){return {success:false,error:err.message};}
});
ipcMain.handle('instrument-cloud-remove',async(e,id)=>{
  try{
    const cat=await cloudCatalog(false),a=cat.assets.find(x=>x.id===id);
    if(!a)throw new Error('Cloud asset not found');
    const p=path.join(instrumentCloudRoot(),path.basename(a.file||''));if(fs.existsSync(p))fs.rmSync(p,{force:true});
    return {success:true};
  }catch(err){return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.1.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.1 Instrument Cloud backend applied')
