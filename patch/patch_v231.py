from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'clearPreviousProject:' not in pt:
    pt=pt.replace("  selectBenchmarkAudioFiles: () => ipcRenderer.invoke('benchmark-audio-files-select'),",
                  "  selectBenchmarkAudioFiles: () => ipcRenderer.invoke('benchmark-audio-files-select'),\n  clearPreviousProject: () => ipcRenderer.invoke('clear-previous-project'),")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_CLEAR_PREVIOUS_PROJECT_V231' not in mt:
    mt += r'''

// HUMANDETECT_CLEAR_PREVIOUS_PROJECT_V231
ipcMain.handle('clear-previous-project', async()=>{
  try{
    const userData=app.getPath('userData');
    const keepNames=new Set(['audiodeepfake_public','python311']);
    const removeNames=[
      'benchmark_samples',
      'Cache',
      'Code Cache',
      'GPUCache',
      'DawnCache',
      'blob_storage',
      'Session Storage',
      'Local Storage'
    ];
    for(const name of removeNames){
      const p=path.join(userData,name);
      try{ if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true}); }catch(_){}
    }
    // Remove obsolete D3/lcros assets from old builds.
    for(const name of ['lcros_ai_music_detector','lcros_detector','laion_clap']){
      const p=path.join(userData,name);
      try{ if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true}); }catch(_){}
    }
    try{
      const ses=mainWindow?.webContents?.session;
      if(ses){
        await ses.clearCache();
        await ses.clearStorageData({
          storages:['localstorage','sessionstorage','indexdb','cachestorage','serviceworkers']
        });
      }
    }catch(_){}
    return {success:true,userData,kept:Array.from(keepNames)};
  }catch(e){return {success:false,error:e.message};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.3.1'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.3.1 clear previous project patch applied')
