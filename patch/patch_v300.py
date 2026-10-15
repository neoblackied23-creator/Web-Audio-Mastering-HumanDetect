from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
imp="import { mountMasteringStation } from './human-detect/mastering-station-panel.js';\n"
if imp not in t:t=imp+t
marker='// HUMANDETECT_MASTERING_STATION_V300'
if marker not in t:
    t += r'''

// HUMANDETECT_MASTERING_STATION_V300
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountMasteringStation({
      getSource: async () => fileState.cachedRenderBuffer || audioNodes.buffer || fileState.originalBuffer || null,
      renderCustom: async (source, cfg = {}) => {
        if (!source) throw new Error('No audio source.');
        const colorCfg = {
          profile: cfg.profile || 'generic',
          style: cfg.style || 'universal',
          intensity: cfg.intensity || 'normal',
          gainMatch: false
        };
        const colored = applyAIMasteringStyle(source, colorCfg);
        const ms = getMasteringSettings(colorCfg.profile, colorCfg.style, colorCfg.intensity);
        const baseSettings = (typeof getExportSettings === 'function') ? getExportSettings() : getCurrentSettings();
        const settings = {
          ...baseSettings,
          normalizeLoudness: true,
          targetLufs: ms.targetLufs,
          truePeakLimit: true,
          truePeakCeiling: ms.truePeakCeiling,
          tapeWarmth: ['tape','vinyl'].includes(colorCfg.style),
          addPunch: colorCfg.style === 'punch',
          addAir: ['clarity','brightness','spatial'].includes(colorCfg.style),
          centerBass: true,
          eqLow: Number.isFinite(Number(cfg.eqLow)) ? Number(cfg.eqLow) : (Number(baseSettings.eqLow)||0),
          eqHigh: Number.isFinite(Number(cfg.eqHigh)) ? Number(cfg.eqHigh) : (Number(baseSettings.eqHigh)||0),
          stereoWidth: Number.isFinite(Number(cfg.stereoWidth)) ? Number(cfg.stereoWidth) : (Number(baseSettings.stereoWidth)||100)
        };
        const result = await renderToAudioBuffer(colored, settings, 'export');
        if (!result?.buffer) throw new Error('Mastering render returned no audio.');
        return {
          buffer: result.buffer,
          lufs: result.lufs ?? null,
          style: colorCfg.style,
          intensity: colorCfg.intensity,
          targetLufs: ms.targetLufs,
          truePeakCeiling: ms.truePeakCeiling
        };
      }
    });
    console.log('[HumanDetect] v3.0 Mastering Station mounted');
  } catch (err) {
    console.error('[HumanDetect] Mastering Station failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.0.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.0.0 Mastering Station integration applied')
