from pathlib import Path
import json

root=Path('.')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'selectBenchmarkAudioFiles:' not in pt:
    pt=pt.replace("  setupHumanBenchmarkPack: () => ipcRenderer.invoke('human-benchmark-pack-setup'),",
                  "  setupHumanBenchmarkPack: () => ipcRenderer.invoke('human-benchmark-pack-setup'),\n  selectBenchmarkAudioFiles: () => ipcRenderer.invoke('benchmark-audio-files-select'),")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_MULTI_AI_BENCHMARK_V222' not in mt:
    mt += r'''

// HUMANDETECT_MULTI_AI_BENCHMARK_V222
ipcMain.handle('benchmark-audio-files-select', async()=>{
  try{
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Select AI benchmark audio files',
      properties:['openFile','multiSelections'],
      filters:[
        {name:'Audio Files',extensions:['wav','mp3','flac','m4a','aac','ogg']},
        {name:'All Files',extensions:['*']}
      ]
    });
    if(result.canceled) return {success:true,paths:[]};
    return {success:true,paths:result.filePaths||[]};
  }catch(e){return {success:false,error:e.message,paths:[]};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.2.2'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.2.2 multi-file AI benchmark patch applied')
