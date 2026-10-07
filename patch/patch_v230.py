from pathlib import Path
import json,re

root=Path('.')

# Remove D3 renderer API exposure.
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
pt=re.sub(r"\n\s*lcrosDetectorStatus: \(\) => ipcRenderer\.invoke\('lcros-detector-status'\),?","",pt)
pt=re.sub(r"\n\s*setupLcrosDetector: \(\) => ipcRenderer\.invoke\('lcros-detector-setup'\),?","",pt)
pt=re.sub(r"\n\s*runLcrosDetector: \(inputPath\) => ipcRenderer\.invoke\('lcros-detector-run', inputPath\),?","",pt)
# repair possible missing comma before closing brace
pt=pt.replace("runOpenDetector: (inputPath) => ipcRenderer.invoke('open-detector-run', inputPath)\n});","runOpenDetector: (inputPath) => ipcRenderer.invoke('open-detector-run', inputPath)\n});")
preload.write_text(pt,encoding='utf-8')

# Remove the full D3 backend block, but keep later benchmark handlers.
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
start=mt.find('// HUMANDETECT_LCROS_DETECTOR_V211')
end=mt.find('// HUMANDETECT_HUMAN_BENCHMARK_V221')
if start!=-1:
    if end==-1:
        mt=mt[:start]
    else:
        mt=mt[:start]+mt[end:]
main.write_text(mt,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='2.3.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v2.3.0 removed D3 backend and API exposure')
