from pathlib import Path
import json

root=Path('.')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'fingerprintInspect:' not in pt:
    anchor='\n});'
    i=pt.rfind(anchor)
    if i<0: raise SystemExit('preload close anchor not found')
    before=pt[:i].rstrip()
    if not before.endswith(','): before += ','
    before += """
  fingerprintInspect: (filePath) => ipcRenderer.invoke('fingerprint-inspect', filePath)
"""
    pt=before+pt[i:]
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_FINGERPRINT_INSPECTOR_V360' not in mt:
    mt += r'''

// HUMANDETECT_FINGERPRINT_INSPECTOR_V360
ipcMain.handle('fingerprint-inspect',async(e,filePath)=>{
  try{
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Source file not found'};
    const st=fs.statSync(filePath);
    const h=crypto.createHash('sha256');
    const fd=fs.openSync(filePath,'r'),buf=Buffer.alloc(1024*1024);
    try{
      let pos=0;
      while(pos<st.size){
        const n=fs.readSync(fd,buf,0,Math.min(buf.length,st.size-pos),pos);
        if(!n)break;h.update(buf.subarray(0,n));pos+=n;
      }
    }finally{fs.closeSync(fd);}
    const provenance=typeof scanMusicProvenance==='function'?scanMusicProvenance(filePath):{strong_source:null,matches:[]};
    return {success:true,sha256:h.digest('hex'),size:st.size,ext:path.extname(filePath).toLowerCase(),provenance};
  }catch(err){return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

# Safety guard: do not rewrite metadata when explicit provenance evidence is present.
if 'PROVENANCE_PRESERVE_GUARD_V360' not in mt:
    old="""    const filePath=payload?.filePath,metadata=payload?.metadata||{},overwrite=!!payload?.overwrite;
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Source file not found'};"""
    new="""    const filePath=payload?.filePath,metadata=payload?.metadata||{},overwrite=!!payload?.overwrite;
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Source file not found'};
    // PROVENANCE_PRESERVE_GUARD_V360
    if(typeof scanMusicProvenance==='function'){
      const prov=scanMusicProvenance(filePath);
      if(prov?.strong_source||prov?.matches?.length){
        return {success:false,error:'Provenance/source evidence detected. HumanDetect will not rewrite metadata on this file because doing so could remove or alter provenance. Save descriptive metadata in a separate workflow that preserves signed provenance.'};
      }
    }"""
    if old in mt: mt=mt.replace(old,new)
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.6.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.6.0 Fingerprint Inspector applied')
