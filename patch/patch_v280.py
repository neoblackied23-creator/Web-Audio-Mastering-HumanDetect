from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
imp="import { mountSmartPipeline } from './human-detect/smart-pipeline-panel.js';\n"
if imp not in t:t=imp+t
marker='// HUMANDETECT_SMART_PIPELINE_V280'
if marker not in t:
    t += r'''

// HUMANDETECT_SMART_PIPELINE_V280
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountSmartPipeline({
      getOriginalBuffer: async () => fileState.originalBuffer || null
    });
    console.log('[HumanDetect] v2.8 Smart Pipeline mounted');
  } catch (err) {
    console.error('[HumanDetect] Smart Pipeline failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.8.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.8.0 Smart Pipeline integration applied')
