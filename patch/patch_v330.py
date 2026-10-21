from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')

imp="import { mountAdaptEditor } from './human-detect/adapt-editor-panel.js';\n"
if imp not in t:
    t=imp+t

marker='// HUMANDETECT_ADAPT_EDITOR_V330'
if marker not in t:
    t += r'''

// HUMANDETECT_ADAPT_EDITOR_V330
window.addEventListener('DOMContentLoaded', () => {
  try {
    const commitAdaptSource = async (buffer) => {
      if (!buffer) return null;
      fileState.cachedRenderBuffer = buffer;
      fileState.cachedRenderLufs = null;
      audioNodes.buffer = buffer;
      if (typeof updateWaveformBuffer === 'function') {
        try { updateWaveformBuffer(buffer); } catch (_) {}
      }
      window.__adaptEditorCurrentSource = buffer;
      return buffer;
    };
    mountAdaptEditor({
      getSource: async () =>
        window.__adaptEditorCurrentSource ||
        fileState.cachedRenderBuffer ||
        audioNodes.buffer ||
        fileState.originalBuffer ||
        null,
      commitSource: commitAdaptSource
    });
    console.log('[HumanDetect] v3.3 Adapt Editor mounted under music player');
  } catch (err) {
    console.error('[HumanDetect] Adapt Editor failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.3.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.3.0 inline Adapt Editor integration applied')
