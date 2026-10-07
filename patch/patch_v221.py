from pathlib import Path
import json

root=Path('.')
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'setupHumanBenchmarkPack:' not in pt:
    pt=pt.replace("  readFileData: (filePath) => ipcRenderer.invoke('read-file-data', filePath),",
                  "  readFileData: (filePath) => ipcRenderer.invoke('read-file-data', filePath),\n  setupHumanBenchmarkPack: () => ipcRenderer.invoke('human-benchmark-pack-setup'),")
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_HUMAN_BENCHMARK_V221' not in mt:
    mt += r'''

// HUMANDETECT_HUMAN_BENCHMARK_V221
ipcMain.handle('human-benchmark-pack-setup', async()=>{
  try{
    const dir=path.join(app.getPath('userData'),'benchmark_samples','human_cc0_v1');
    fs.mkdirSync(dir,{recursive:true});
    const files=[
      {name:'A Good Bass for Gambling',file:'A Good Bass for Gambling.mp3',url:'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/A%20Good%20Bass%20for%20Gambling.mp3'},
      {name:'A Surprising Encounter',file:'A Surprising Encounter.mp3',url:'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/A%20Surprising%20Encounter.mp3'},
      {name:'A Waltz For Naseem',file:'A Waltz For Naseem.mp3',url:'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/A%20Waltz%20For%20Naseem.mp3'},
      {name:'Adding the Sun',file:'Adding the Sun.mp3',url:'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/Adding%20the%20Sun.mp3'},
      {name:'Adventure',file:'Adventure.mp3',url:'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/Adventure.mp3'}
    ];
    const entries=[];
    for(const item of files){
      const dest=path.join(dir,item.file);
      if(!fs.existsSync(dest)||fs.statSync(dest).size<100000){
        const r=await runProcess('curl.exe',['-L','--fail','--retry','3','--retry-delay','2','-o',dest,item.url]);
        if(r.code!==0||!fs.existsSync(dest)) return {success:false,error:'Failed downloading '+item.name+': '+(r.err||r.out).slice(-1600)};
      }
      entries.push({name:item.name,path:dest,license:'CC0-1.0',source:'SoundSafari/CC0-1.0-Music/freepd.com'});
    }
    const manifest={version:1,license:'CC0-1.0',source:'https://github.com/SoundSafari/CC0-1.0-Music',entries};
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');
    return {success:true,dir,entries};
  }catch(e){return {success:false,error:e.message};}
});
'''
main.write_text(mt,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.2.1'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.2.1 CC0 benchmark pack patch applied')
