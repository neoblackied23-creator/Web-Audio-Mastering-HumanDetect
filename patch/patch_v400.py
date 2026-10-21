from pathlib import Path
import json

root=Path('.')
app=root/'web'/'app.js'
at=app.read_text(encoding='utf-8')

imp="import { mountInstrumentSummaryPanel } from './human-detect/instrument-summary-panel.js';\n"
if imp not in at:
    at=imp+at

hook="""    fileState.originalBuffer = decodedBuffer;

    // Clear cached render buffer"""
if hook in at and "HUMANDETECT_AUTO_INSTRUMENT_SCAN_V400" not in at:
    repl="""    fileState.originalBuffer = decodedBuffer;

    // HUMANDETECT_AUTO_INSTRUMENT_SCAN_V400
    // Re-use the already-decoded AudioBuffer. This is intentionally asynchronous
    // so it does not block the normal loading/mastering flow.
    Promise.resolve().then(async () => {
      try {
        if (window.__instrumentAnalyzerAPI?.analyze) {
          await window.__instrumentAnalyzerAPI.analyze(decodedBuffer);
        }
      } catch (err) {
        console.warn('[HumanDetect] automatic instrument scan failed:', err);
      }
    });

    // Clear cached render buffer"""
    at=at.replace(hook,repl)

marker='// HUMANDETECT_INSTRUMENT_SUMMARY_PANEL_V400'
if marker not in at:
    at += r'''

// HUMANDETECT_INSTRUMENT_SUMMARY_PANEL_V400
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountInstrumentSummaryPanel({
      getBuffer: async () => fileState.originalBuffer || null
    });
    console.log('[HumanDetect] v4.0 Instrument Analysis Summary mounted');
  } catch (err) {
    console.error('[HumanDetect] Instrument Analysis Summary failed to mount:', err);
  }
});
'''
app.write_text(at,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='4.0.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v4.0.0 automatic Instrument Analysis Summary applied')
