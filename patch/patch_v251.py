from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
imp="import { mountReperformancePanel } from './human-detect/reperformance-panel.js';\n"
if imp not in t:t=imp+t
marker='// HUMANDETECT_REPERFORMANCE_V250'
if marker not in t:
    t += r'''

// HUMANDETECT_REPERFORMANCE_V250
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountReperformancePanel({
      getOriginalBuffer: async () => fileState.originalBuffer || null,
      commitSource: async (buffer) => {
        if (!buffer) return null;
        fileState.cachedRenderBuffer = buffer;
        fileState.cachedRenderLufs = null;
        audioNodes.buffer = buffer;
        if (typeof updateWaveformBuffer === 'function') {
          try { updateWaveformBuffer(buffer); } catch (_) {}
        }
        return buffer;
      }
    });
    console.log('[HumanDetect] v2.5 Re-Performance Lab mounted');
  } catch (err) {
    console.error('[HumanDetect] Re-Performance Lab failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.5.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.5.0 Re-Performance integration applied')
