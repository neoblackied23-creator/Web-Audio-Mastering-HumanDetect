from pathlib import Path
import json

root=Path('.')
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')

old=r'''async function ensureManagedPython311(){
  const py=managedPythonExe(); if(fs.existsSync(py)) return {success:true,python:py};
  const dir=managedPythonDir(); fs.mkdirSync(dir,{recursive:true});
  const installer=path.join(app.getPath('temp'),'python-3.11.9-amd64.exe');
  const ps=`$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '${installer.replace(/'/g,"''")}'`;
  let r=await runProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps]);
  if(r.code!==0) return {success:false,error:'Python 3.11 download failed: '+(r.err||r.out).slice(-1800)};
  r=await runProcess(installer,['/quiet','InstallAllUsers=0','Include_launcher=0','Include_test=0','Include_doc=0','PrependPath=0','Include_pip=1','Include_dev=1',`TargetDir=${dir}`]);
  if(r.code!==0||!fs.existsSync(py)) return {success:false,error:'Python 3.11 portable install failed: '+(r.err||r.out).slice(-1800)};
  try{fs.unlinkSync(installer);}catch(_){}
  return {success:true,python:py};
}'''
new=r'''let managedPythonSetupPromise=null;
async function ensureManagedPython311(){
  const py=managedPythonExe();
  if(fs.existsSync(py)){
    try{
      const t=spawnSync(py,['-c','import sys; print(sys.version)'],{encoding:'utf8',windowsHide:true});
      if(t.status===0) return {success:true,python:py};
    }catch(_){}
    try{fs.rmSync(managedPythonDir(),{recursive:true,force:true});}catch(_){}
  }
  if(managedPythonSetupPromise) return managedPythonSetupPromise;
  managedPythonSetupPromise=(async()=>{
    const dir=managedPythonDir(); fs.mkdirSync(dir,{recursive:true});
    const installer=path.join(app.getPath('temp'),`python-3.11.9-${process.pid}-${Date.now()}.exe`);
    try{
      let r=await runProcess('curl.exe',['-L','--fail','--retry','3','--retry-delay','2','-o',installer,'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe']);
      if(r.code!==0||!fs.existsSync(installer)) return {success:false,error:'Python 3.11 download failed: '+(r.err||r.out).slice(-1800)};
      r=await runProcess(installer,['/quiet','InstallAllUsers=0','Include_launcher=0','Include_test=0','Include_doc=0','PrependPath=0','Include_pip=1','Include_dev=1',`TargetDir=${dir}`]);
      if(r.code!==0||!fs.existsSync(py)) return {success:false,error:'Python 3.11 install failed: '+(r.err||r.out).slice(-1800)};
      const t=spawnSync(py,['-c','import sys; print(sys.version)'],{encoding:'utf8',windowsHide:true});
      if(t.status!==0) return {success:false,error:'Python 3.11 verification failed: '+(t.stderr||t.stdout||'unknown').slice(-1200)};
      return {success:true,python:py};
    } finally {
      try{if(fs.existsSync(installer))fs.unlinkSync(installer);}catch(_){}
    }
  })();
  try{return await managedPythonSetupPromise;}finally{managedPythonSetupPromise=null;}
}'''
if old not in mt:
    raise SystemExit('ensureManagedPython311 block not found')
mt=mt.replace(old,new,1)

old_d2=r'''    const vpy=openDetectorPython();
    if(!fs.existsSync(vpy)){
      const v=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(v.code!==0) return {success:false,error:'D2 environment creation failed: '+(v.err||v.out).slice(-1800)};
    }
    let r=await runProcess(vpy,['-m','pip','install','--upgrade','pip','setuptools','wheel'],{cwd:dir});'''
new_d2=r'''    const vpy=openDetectorPython();
    const venvDir=path.join(dir,'.venv');
    if(fs.existsSync(venvDir)){
      try{fs.rmSync(venvDir,{recursive:true,force:true});}catch(e){return {success:false,error:'Could not reset D2 environment: '+e.message};}
    }
    const v=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
    if(v.code!==0) return {success:false,error:'D2 environment creation failed: '+(v.err||v.out).slice(-1800)};
    let r=await runProcess(vpy,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'D2 ensurepip failed: '+(r.err||r.out).slice(-1800)};
    r=await runProcess(vpy,['-m','pip','install','--upgrade','pip==24.3.1','setuptools==75.6.0','wheel==0.45.1'],{cwd:dir});'''
if old_d2 not in mt:
    raise SystemExit('D2 venv block not found')
mt=mt.replace(old_d2,new_d2,1)

old_d3=r'''    const dir=lcrosDir(); fs.mkdirSync(dir,{recursive:true});
    const py=lcrosVenvPython();
    if(!fs.existsSync(py)){
      const v=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(v.code!==0) return {success:false,error:'Could not create Detector 3 environment: '+(v.err||v.out).slice(-1800)};
    }
    let r=await runProcess(py,['-m','pip','install','--upgrade','pip','setuptools','wheel'],{cwd:dir});'''
new_d3=r'''    const dir=lcrosDir(); fs.mkdirSync(dir,{recursive:true});
    const py=lcrosVenvPython();
    const venvDir=path.join(dir,'.venv');
    if(fs.existsSync(venvDir)){
      try{fs.rmSync(venvDir,{recursive:true,force:true});}catch(e){return {success:false,error:'Could not reset D3 environment: '+e.message};}
    }
    const v=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
    if(v.code!==0) return {success:false,error:'Could not create Detector 3 environment: '+(v.err||v.out).slice(-1800)};
    let r=await runProcess(py,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0) return {success:false,error:'D3 ensurepip failed: '+(r.err||r.out).slice(-1800)};
    r=await runProcess(py,['-m','pip','install','--upgrade','pip==24.3.1','setuptools==75.6.0','wheel==0.45.1'],{cwd:dir});'''
if old_d3 not in mt:
    raise SystemExit('D3 venv block not found')
mt=mt.replace(old_d3,new_d3,1)

main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.1.2'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.1.2 setup recovery patch applied')
