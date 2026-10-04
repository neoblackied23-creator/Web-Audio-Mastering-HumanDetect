from pathlib import Path
import json

root = Path('.')
app = root / 'web' / 'app.js'
text = app.read_text(encoding='utf-8')

import_line = "import { mountHumanDetectPanel } from './human-detect/human-detect-panel.js';\n"
if import_line not in text:
    text = import_line + text

marker = '// HUMANDETECT_INTEGRATION_V5'
if marker not in text:
    text += r'''

// HUMANDETECT_INTEGRATION_V5
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountHumanDetectPanel({
      getOriginalBuffer: async () => fileState.originalBuffer || null,
      renderMaster: async (sourceOverride = null) => {
        const sourceBuffer = sourceOverride || fileState.originalBuffer;
        if (!sourceBuffer) return null;
        const settings = (typeof getExportSettings === 'function')
          ? getExportSettings()
          : getCurrentSettings();
        const result = await renderToAudioBuffer(sourceBuffer, settings, 'export');
        if (!result || !result.buffer) return null;
        fileState.cachedRenderBuffer = result.buffer;
        fileState.cachedRenderLufs = result.lufs ?? null;
        audioNodes.buffer = result.buffer;
        if (typeof updateWaveformBuffer === 'function') {
          try { updateWaveformBuffer(result.buffer); } catch (_) {}
        }
        if (typeof updateLufsDisplay === 'function' && Number.isFinite(result.lufs)) {
          try { updateLufsDisplay(result.lufs, false); } catch (_) {}
        }
        return result.buffer;
      },
      getMasteredBuffer: async () => fileState.cachedRenderBuffer || null
    });
    console.log('[HumanDetect] v1.6 panel mounted');
  } catch (err) {
    console.error('[HumanDetect] failed to mount:', err);
  }
});
'''
app.write_text(text, encoding='utf-8')

pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['name'] = 'web-audio-mastering-humandetect'
pkg['version'] = '1.6.0'
pkg.setdefault('build', {})['productName'] = 'Web Audio Mastering HumanDetect'
pkg['build']['appId'] = 'com.webaudio.mastering.humandetect'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

print('HumanDetect v1.6.0 patch applied successfully')
