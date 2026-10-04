from pathlib import Path
import json

root = Path('.')
app = root / 'web' / 'app.js'
text = app.read_text(encoding='utf-8')

import_line = "import { mountHumanDetectPanel } from './human-detect/human-detect-panel.js';\n"
if import_line not in text:
    text = import_line + text

marker = '// HUMANDETECT_INTEGRATION_V6'
if marker not in text:
    text += r'''

// HUMANDETECT_INTEGRATION_V6
window.addEventListener('DOMContentLoaded', () => {
  try {
    const commitHumanDetectMaster = async (buffer, lufs = null) => {
      if (!buffer) return null;
      fileState.cachedRenderBuffer = buffer;
      fileState.cachedRenderLufs = lufs;
      audioNodes.buffer = buffer;
      if (typeof updateWaveformBuffer === 'function') {
        try { updateWaveformBuffer(buffer); } catch (_) {}
      }
      if (typeof updateLufsDisplay === 'function' && Number.isFinite(lufs)) {
        try { updateLufsDisplay(lufs, false); } catch (_) {}
      }
      return buffer;
    };

    mountHumanDetectPanel({
      getOriginalBuffer: async () => fileState.originalBuffer || null,
      renderMaster: async (sourceOverride = null, options = {}) => {
        const sourceBuffer = sourceOverride || fileState.originalBuffer;
        if (!sourceBuffer) return null;
        const baseSettings = (typeof getExportSettings === 'function')
          ? getExportSettings()
          : getCurrentSettings();
        const settings = { ...baseSettings };
        if (options.aiFix) {
          settings.eqLow = 1;
          settings.eqLowMid = -2;
          settings.eqMid = 1;
          settings.eqHighMid = -1;
          settings.eqHigh = 2;
          settings.deharsh = true;
          settings.cleanLowEnd = true;
          settings.addPunch = true;
          settings.addAir = true;
          settings.tapeWarmth = true;
          settings.centerBass = true;
        }
        const result = await renderToAudioBuffer(sourceBuffer, settings, 'export');
        if (!result || !result.buffer) return null;
        if (options.cacheResult !== false) {
          await commitHumanDetectMaster(result.buffer, result.lufs ?? null);
        }
        return result.buffer;
      },
      commitMaster: async (buffer) => commitHumanDetectMaster(buffer, null),
      getMasteredBuffer: async () => fileState.cachedRenderBuffer || null
    });
    console.log('[HumanDetect] v1.7 panel mounted');
  } catch (err) {
    console.error('[HumanDetect] failed to mount:', err);
  }
});
'''
app.write_text(text, encoding='utf-8')

pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['name'] = 'web-audio-mastering-humandetect'
pkg['version'] = '1.7.0'
pkg.setdefault('build', {})['productName'] = 'Web Audio Mastering HumanDetect'
pkg['build']['appId'] = 'com.webaudio.mastering.humandetect'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

print('HumanDetect v1.7.0 patch applied successfully')
