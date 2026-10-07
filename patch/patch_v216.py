from pathlib import Path
import json

root=Path('.')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
pt=pt.replace("const { contextBridge, ipcRenderer } = require('electron');","const { contextBridge, ipcRenderer, webUtils } = require('electron');")
if "getPathForFile:" not in pt:
    pt=pt.replace("  selectFile: () => ipcRenderer.invoke('select-file'),","  selectFile: () => ipcRenderer.invoke('select-file'),\n  getPathForFile: (file) => webUtils.getPathForFile(file),")
preload.write_text(pt,encoding='utf-8')

app=root/'web'/'app.js'
at=app.read_text(encoding='utf-8')
old="    currentFile = file;\n    fileState.selectedFilePath = file.name;"
new="    currentFile = file;\n    try {\n      const nativePath = window.electronAPI?.getPathForFile?.(file);\n      fileState.selectedFilePath = nativePath || file.name;\n      console.log('[HumanDetect] native audio path:', fileState.selectedFilePath);\n    } catch (e) {\n      console.warn('[HumanDetect] could not resolve native file path:', e);\n      fileState.selectedFilePath = file.name;\n    }"
if old not in at:
    raise SystemExit('loadFile selectedFilePath assignment not found')
at=at.replace(old,new,1)
app.write_text(at,encoding='utf-8')

pkg_path=root/'package.json'
pkg=json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version']='2.1.6'
pkg_path.write_text(json.dumps(pkg,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.1.6 native input path patch applied')
