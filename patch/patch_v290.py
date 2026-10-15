from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
marker='// HUMANDETECT_MASTERING_API_V290'
if marker not in t:
    t += r'''

// HUMANDETECT_MASTERING_API_V290
window.addEventListener('DOMContentLoaded', () => {
  try {
    const profileMap = {
      Clean: { style:'clarity', intensity:'light' },
      Warm: { style:'tape', intensity:'normal' },
      Punchy: { style:'punch', intensity:'normal' },
      Electronic: { style:'spatial', intensity:'normal' }
    };
    const peakOf = (buf) => {
      let p=0;
      for(let c=0;c<buf.numberOfChannels;c++){
        const d=buf.getChannelData(c);
        for(let i=0;i<d.length;i++) p=Math.max(p,Math.abs(d[i]));
      }
      return p;
    };
    const rmsDb = (buf) => {
      let s=0,n=0;
      for(let c=0;c<buf.numberOfChannels;c++){
        const d=buf.getChannelData(c);
        for(let i=0;i<d.length;i++){s+=d[i]*d[i];n++;}
      }
      const r=Math.sqrt(s/Math.max(1,n));
      return 20*Math.log10(Math.max(1e-9,r));
    };
    const commit = async (buffer,lufs=null) => {
      fileState.cachedRenderBuffer = buffer;
      fileState.cachedRenderLufs = Number.isFinite(lufs) ? lufs : null;
      audioNodes.buffer = buffer;
      if (typeof updateWaveformBuffer === 'function') {
        try { updateWaveformBuffer(buffer); } catch (_) {}
      }
      if (typeof updateLufsDisplay === 'function' && Number.isFinite(lufs)) {
        try { updateLufsDisplay(lufs, false); } catch (_) {}
      }
      window.__masteredCurrentSource = buffer;
      return buffer;
    };
    window.__masteringAPI = {
      autoSettings(profileName='Clean'){
        const m=profileMap[profileName]||profileMap.Clean;
        return {profile:'generic',style:m.style,intensity:m.intensity,gainMatch:false};
      },
      async applyAuto(buffer,profileName='Clean',commitResult=true){
        if(!buffer) throw new Error('No source buffer for mastering.');
        const cfg=this.autoSettings(profileName);
        const colored=applyAIMasteringStyle(buffer,cfg);
        const ms=getMasteringSettings(cfg.profile,cfg.style,cfg.intensity);
        const baseSettings=(typeof getExportSettings==='function')?getExportSettings():getCurrentSettings();
        const settings={...baseSettings,
          normalizeLoudness:true,
          targetLufs:ms.targetLufs,
          truePeakLimit:true,
          truePeakCeiling:ms.truePeakCeiling,
          tapeWarmth:true,
          centerBass:true
        };
        if(profileName==='Clean'){
          settings.deharsh=true;settings.cleanLowEnd=true;settings.addAir=true;
        }else if(profileName==='Warm'){
          settings.tapeWarmth=true;settings.eqHigh=-1;settings.eqLowMid=-1;
        }else if(profileName==='Punchy'){
          settings.addPunch=true;settings.compressorAmount=Math.max(Number(settings.compressorAmount)||0,55);
        }else if(profileName==='Electronic'){
          settings.addAir=true;settings.centerBass=true;settings.stereoWidth=Math.max(Number(settings.stereoWidth)||100,108);
        }
        const beforePeak=peakOf(buffer),beforeRms=rmsDb(buffer);
        const result=await renderToAudioBuffer(colored,settings,'export');
        if(!result?.buffer) throw new Error('Mastering render returned no audio.');
        const out={buffer:result.buffer,lufs:result.lufs??null,style:cfg.style,intensity:cfg.intensity,targetLufs:ms.targetLufs,truePeakCeiling:ms.truePeakCeiling,beforePeak,afterPeak:peakOf(result.buffer),beforeRms,afterRms:rmsDb(result.buffer)};
        if(commitResult) await commit(out.buffer,out.lufs);
        window.__masteringLatest=out;
        return out;
      },
      commit
    };
    console.log('[HumanDetect] v2.9 mastering API ready');
  } catch (err) {
    console.error('[HumanDetect] v2.9 mastering API failed:',err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.9.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.9 mastering API applied')
