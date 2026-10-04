from pathlib import Path
import json

root = Path('.')
app = root / 'web' / 'app.js'
text = app.read_text(encoding='utf-8')

import_line = "import { mountHumanDetectPanel } from './human-detect/human-detect-panel.js';\n"
if import_line not in text:
    text = import_line + text

marker = '// HUMANDETECT_INTEGRATION_V2'
if marker not in text:
    text += r'''

// HUMANDETECT_INTEGRATION_V2
// Local-only characteristic analysis. Scores are estimates, not proof of authorship.
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountHumanDetectPanel({
      getOriginalBuffer: async () => fileState.originalBuffer || null,
      getMasteredBuffer: async () => {
        if (!fileState.originalBuffer) return null;
        if (fileState.cachedRenderBuffer && !fileState.isRenderingCache) {
          return fileState.cachedRenderBuffer;
        }
        const settings = (typeof getExportSettings === 'function')
          ? getExportSettings()
          : getCurrentSettings();
        const result = await renderToAudioBuffer(fileState.originalBuffer, settings, 'export');
        return result && result.buffer ? result.buffer : null;
      }
    });
    console.log('[HumanDetect] panel mounted');
  } catch (err) {
    console.error('[HumanDetect] failed to mount:', err);
  }
});
'''
app.write_text(text, encoding='utf-8')

pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['name'] = 'web-audio-mastering-humandetect'
pkg['version'] = '1.4.1'
pkg.setdefault('build', {})['productName'] = 'Web Audio Mastering HumanDetect'
pkg['build']['appId'] = 'com.webaudio.mastering.humandetect'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

print('HumanDetect v1.4.1 patch applied successfully')
