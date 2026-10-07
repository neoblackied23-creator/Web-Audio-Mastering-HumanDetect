from pathlib import Path
import json

root=Path('.')
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')

start=mt.find('// HUMANDETECT_STEM_ENGINE_V1')
end=mt.find('// HUMANDETECT_OPEN_DETECTOR_V211')
if start==-1:
    raise SystemExit('Stem engine block not found')
if end==-1 or end<start:
    raise SystemExit('Open detector marker not found after stem engine')

new_block=r'''// HUMANDETECT_STEM_ENGINE_V241
function stemEngineDir(){ return path.join(app.getPath('userData'),'demucs_engine'); }
function stemVenvPython(){ return path.join(stemEngineDir(),'.venv','Scripts','python.exe'); }
function stemEmit(text,type='stem'){
  try{ if(mainWindow) mainWindow.webContents.send('processing-progress',{type,text}); }catch(_){}
}
function stemStatusSync(){
  const py=stemVenvPython(),dir=stemEngineDir();
  if(!fs.existsSync(py)) return {available:false,reason:'Demucs environment not installed',dir};
  try{
    const r=spawnSync(py,['-c','import numpy,demucs,torch; print("ok")'],{cwd:dir,encoding:'utf8',windowsHide:true});
    return {available:r.status===0,python:py,dir,reason:r.status===0?null:(r.stderr||r.stdout||'Demucs dependencies missing').slice(-1800)};
  }catch(e){return {available:false,reason:e.message,dir,python:py};}
}
ipcMain.removeHandler?.('stem-status');
ipcMain.removeHandler?.('stem-setup');
ipcMain.removeHandler?.('stem-separate');

ipcMain.handle('stem-status', async()=>stemStatusSync());

ipcMain.handle('stem-setup', async()=>{
  try{
    stemEmit('Preparing managed Python 3.11 for Demucs...','stem-setup');
    const mp=await ensureManagedPython311();
    if(!mp?.success) return {success:false,error:mp?.error||'Managed Python 3.11 setup failed'};
    const dir=stemEngineDir(); fs.mkdirSync(dir,{recursive:true});
    const py=stemVenvPython();

    if(!fs.existsSync(py)){
      stemEmit('Creating Demucs Python 3.11 environment...','stem-setup');
      const v=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(v.code!==0) return {success:false,error:'Demucs environment creation failed: '+(v.err||v.out).slice(-2200)};
    }

    stemEmit('Updating pip/setuptools/wheel...','stem-setup');
    let r=await runProcess(py,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs ensurepip failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--upgrade','pip==24.3.1','setuptools==75.6.0','wheel==0.45.1'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs pip setup failed: '+(r.err||r.out).slice(-2200)};

    stemEmit('Installing NumPy 1.26.4...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','numpy==1.26.4'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'NumPy install failed: '+(r.err||r.out).slice(-2200)};

    stemEmit('Installing CPU PyTorch for Demucs...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','torch==2.5.1+cpu','torchaudio==2.5.1+cpu','--index-url','https://download.pytorch.org/whl/cpu'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs CPU Torch install failed: '+(r.err||r.out).slice(-2600)};

    stemEmit('Installing Demucs...','stem-setup');
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','demucs==4.0.1'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'Demucs install failed: '+(r.err||r.out).slice(-3000)};

    const s=stemStatusSync();
    if(!s.available) return {success:false,error:s.reason||'Demucs verification failed'};
    stemEmit('Demucs Python 3.11 environment ready.','stem-setup');
    return {success:true,python:s.python,dir:s.dir};
  }catch(e){return {success:false,error:e.message};}
});

ipcMain.handle('stem-separate', async(event,inputPath)=>{
  try{
    if(!inputPath||!fs.existsSync(inputPath)) return {success:false,error:'Input file not found'};
    const st=stemStatusSync();
    if(!st.available) return {success:false,error:(st.reason||'Demucs unavailable')+'. Click Install/Update Demucs first.'};
    const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'humandetect-stems-'));
    return await new Promise((resolve)=>{
      const args=['-m','demucs','-n','htdemucs','--out',outDir,inputPath];
      stemEmit('Starting Demucs separation...','stem');
      const p=spawn(st.python,args,{windowsHide:true,cwd:st.dir});
      let log='';
      p.stdout?.on('data',d=>{const s=d.toString();log+=s;stemEmit(s,'stem');});
      p.stderr?.on('data',d=>{const s=d.toString();log+=s;stemEmit(s,'stem');});
      p.on('error',e=>resolve({success:false,error:e.message,outputDir:outDir}));
      p.on('close',code=>{
        if(code!==0) return resolve({success:false,error:log.slice(-5000),outputDir:outDir});
        const modelDir=path.join(outDir,'htdemucs');
        if(!fs.existsSync(modelDir)) return resolve({success:false,error:'Demucs output folder missing',outputDir:outDir});
        const folders=fs.readdirSync(modelDir,{withFileTypes:true}).filter(x=>x.isDirectory());
        if(!folders.length) return resolve({success:false,error:'Demucs stem folder missing',outputDir:outDir});
        const songDir=path.join(modelDir,folders[0].name),stems={};
        for(const name of ['vocals','drums','bass','other']){
          const f=path.join(songDir,name+'.wav'); if(fs.existsSync(f)) stems[name]=f;
        }
        if(!Object.keys(stems).length) return resolve({success:false,error:'Demucs completed but no stems were found',outputDir:songDir});
        stemEmit('Demucs separation complete.','stem');
        resolve({success:true,stems,outputDir:songDir});
      });
    });
  }catch(e){return {success:false,error:e.message};}
});

'''
mt=mt[:start]+new_block+mt[end:]
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.4.1'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.4.1 Demucs Python 3.11 isolated environment patch applied')
