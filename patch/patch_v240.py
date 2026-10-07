from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
imp="import { mountStemLabPanel } from './human-detect/stem-lab-panel.js';\n"
if imp not in t:t=imp+t
marker='// HUMANDETECT_STEM_LAB_V240'
if marker not in t:
    t += r'''

// HUMANDETECT_STEM_LAB_V240
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountStemLabPanel({
      getOriginalPath: async () => fileState.selectedFilePath || null,
      commitSource: async (buffer) => {
        if (!buffer) return null;
        fileState.cachedRenderBuffer = buffer;
        fileState.cachedRenderLufs = null;
        audioNodes.buffer = buffer;
        if (typeof updateWaveformBuffer === 'function') {
          try { updateWaveformBuffer(buffer); } catch (_) {}
        }
        window.__stemLabCurrentSource = buffer;
        return buffer;
      }
    });
    console.log('[HumanDetect] v2.4 Stem Lab mounted');
  } catch (err) {
    console.error('[HumanDetect] Stem Lab failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.4.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.4.0 Stem Lab integration applied')
