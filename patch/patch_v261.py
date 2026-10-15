from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
t=app.read_text(encoding='utf-8')
imp="import { mountInstrumentManager } from './human-detect/instrument-manager-panel.js';\n"
if imp not in t:t=imp+t
marker='// HUMANDETECT_INSTRUMENT_MANAGER_V260'
if marker not in t:
    t += r'''

// HUMANDETECT_INSTRUMENT_MANAGER_V260
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountInstrumentManager();
    console.log('[HumanDetect] v2.6 Instrument Manager mounted');
  } catch (err) {
    console.error('[HumanDetect] Instrument Manager failed to mount:', err);
  }
});
'''
app.write_text(t,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.6.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.6 Instrument Manager integration applied')
