from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
text=app.read_text(encoding='utf-8')
imp="import { mountCalibrationPanel } from './human-detect/calibration-panel.js';\n"
if imp not in text:
    text=imp+text

old="    currentFile = file;\n    try {\n      const nativePath = window.electronAPI?.getPathForFile?.(file);"
new="    currentFile = file;\n    window.__hdCurrentTrackName = file.name;\n    try {\n      const nativePath = window.electronAPI?.getPathForFile?.(file);"
if old in text:
    text=text.replace(old,new,1)

marker='// HUMANDETECT_CALIBRATION_V22'
if marker not in text:
    text += r'''

// HUMANDETECT_CALIBRATION_V22
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountCalibrationPanel();
    console.log('[HumanDetect] v2.2 calibration dashboard mounted');
  } catch(err){ console.error('[HumanDetect] v2.2 calibration dashboard failed:',err); }
});
'''
app.write_text(text,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.2.0'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.2 calibration patch applied')
