from pathlib import Path
import json

root = Path('.')
app = root / 'web' / 'app.js'
text = app.read_text(encoding='utf-8')

import_line = "import { mountHumanDetectPanel } from './human-detect/human-detect-panel.js';\n"
if import_line not in text:
    text = import_line + text

marker = '// HUMANDETECT_INTEGRATION_V7'
if marker not in text:
    text += r'''

// HUMANDETECT_INTEGRATION_V7
window.addEventListener('DOMContentLoaded', () => {
  try {
    const commitHumanDetectMaster = async (buffer, lufs = null) => {
      if (!buffer) return null;
      fileState.cachedRenderBuffer = buffer;
      fileState.cachedRenderLufs = lufs;
      audioNodes.buffer = buffer;
      if (typeof updateWaveformBuffer === 'function') {
        try { updateWaveformBuffer(buffer); } catch (_) {}
      }
      if (typeof updateLufsDisplay === 'function' && Number.isFinite(lufs)) {
        try { updateLufsDisplay(lufs, false); } catch (_) {}
      }
      return buffer;
    };

    mountHumanDetectPanel({
      getOriginalBuffer: async () => fileState.originalBuffer || null,
      getOriginalPath: async () => fileState.selectedFilePath || null,
      renderMaster: async (sourceOverride = null, options = {}) => {
        const sourceBuffer = sourceOverride || fileState.originalBuffer;
        if (!sourceBuffer) return null;
        const baseSettings = (typeof getExportSettings === 'function')
          ? getExportSettings()
          : getCurrentSettings();
        const settings = { ...baseSettings };
        if (options.aiFix) {
          settings.eqLow = 1;
          settings.eqLowMid = -2;
          settings.eqMid = 1;
          settings.eqHighMid = -1;
          settings.eqHigh = 2;
          settings.deharsh = true;
          settings.cleanLowEnd = true;
          settings.addPunch = true;
          settings.addAir = true;
          settings.tapeWarmth = true;
          settings.centerBass = true;
        }
        const result = await renderToAudioBuffer(sourceBuffer, settings, 'export');
        if (!result || !result.buffer) return null;
        if (options.cacheResult !== false) {
          await commitHumanDetectMaster(result.buffer, result.lufs ?? null);
        }
        return result.buffer;
      },
      commitMaster: async (buffer) => commitHumanDetectMaster(buffer, null),
      getMasteredBuffer: async () => fileState.cachedRenderBuffer || null
    });
    console.log('[HumanDetect] v1.8 panel mounted');
  } catch (err) {
    console.error('[HumanDetect] failed to mount:', err);
  }
});
'''
app.write_text(text, encoding='utf-8')

# Extend Electron preload with stem-engine IPC methods.
preload = root / 'electron' / 'preload.js'
pt = preload.read_text(encoding='utf-8')
if "stemStatus:" not in pt:
    pt = pt.replace("  resizeWindow: (width, height) => ipcRenderer.invoke('window-resize', { width, height })",
                    "  resizeWindow: (width, height) => ipcRenderer.invoke('window-resize', { width, height }),\n  stemStatus: () => ipcRenderer.invoke('stem-status'),\n  setupStemEngine: () => ipcRenderer.invoke('stem-setup'),\n  separateStems: (inputPath) => ipcRenderer.invoke('stem-separate', inputPath)")
preload.write_text(pt, encoding='utf-8')

# Add local Demucs bridge to Electron main process.
main = root / 'electron' / 'main.js'
mt = main.read_text(encoding='utf-8')
if "HUMANDETECT_STEM_ENGINE_V1" not in mt:
    mt = mt.replace("const fs = require('fs');", "const fs = require('fs');\nconst os = require('os');\nconst { spawn, spawnSync } = require('child_process');")
    mt += r'''

// HUMANDETECT_STEM_ENGINE_V1
function pythonCmd() {
  for (const cmd of ['py', 'python']) {
    try {
      const r = spawnSync(cmd, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true });
      if (r.status === 0) return cmd;
    } catch (_) {}
  }
  return null;
}
function demucsAvailable() {
  const cmd = pythonCmd();
  if (!cmd) return { available: false, python: null, reason: 'Python not found' };
  try {
    const r = spawnSync(cmd, ['-c', 'import demucs; print("ok")'], { encoding: 'utf8', windowsHide: true });
    return { available: r.status === 0, python: cmd, reason: r.status === 0 ? null : 'Demucs not installed' };
  } catch (e) { return { available: false, python: cmd, reason: e.message }; }
}
ipcMain.handle('stem-status', async () => demucsAvailable());
ipcMain.handle('stem-setup', async () => {
  const cmd = pythonCmd();
  if (!cmd) return { success: false, error: 'Python 3 is required before installing Demucs.' };
  return await new Promise((resolve) => {
    const p = spawn(cmd, ['-m', 'pip', 'install', '--upgrade', 'demucs'], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d.toString(); if (mainWindow) mainWindow.webContents.send('processing-progress', { type:'stem-setup', text:d.toString() }); });
    p.stderr.on('data', d => { err += d.toString(); if (mainWindow) mainWindow.webContents.send('processing-progress', { type:'stem-setup', text:d.toString() }); });
    p.on('close', code => resolve(code === 0 ? { success:true } : { success:false, error:(err || out).slice(-2000) }));
  });
});
ipcMain.handle('stem-separate', async (event, inputPath) => {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) return { success:false, error:'Input file not found' };
    const st = demucsAvailable();
    if (!st.available) return { success:false, error:st.reason || 'Demucs unavailable' };
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'humandetect-stems-'));
    return await new Promise((resolve) => {
      const args = ['-m', 'demucs', '-n', 'htdemucs', '--out', outDir, inputPath];
      const p = spawn(st.python, args, { windowsHide:true });
      let log = '';
      p.stdout.on('data', d => { log += d.toString(); if (mainWindow) mainWindow.webContents.send('processing-progress', { type:'stem', text:d.toString() }); });
      p.stderr.on('data', d => { log += d.toString(); if (mainWindow) mainWindow.webContents.send('processing-progress', { type:'stem', text:d.toString() }); });
      p.on('close', code => {
        if (code !== 0) return resolve({ success:false, error:log.slice(-3000), outputDir:outDir });
        const modelDir = path.join(outDir, 'htdemucs');
        if (!fs.existsSync(modelDir)) return resolve({ success:false, error:'Demucs output folder missing', outputDir:outDir });
        const folders = fs.readdirSync(modelDir, { withFileTypes:true }).filter(x => x.isDirectory());
        if (!folders.length) return resolve({ success:false, error:'Demucs stem folder missing', outputDir:outDir });
        const songDir = path.join(modelDir, folders[0].name);
        const stems = {};
        for (const name of ['vocals','drums','bass','other']) {
          const f = path.join(songDir, name + '.wav'); if (fs.existsSync(f)) stems[name] = f;
        }
        resolve({ success:true, stems, outputDir:songDir });
      });
    });
  } catch (e) { return { success:false, error:e.message }; }
});
'''
main.write_text(mt, encoding='utf-8')

pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['name'] = 'web-audio-mastering-humandetect'
pkg['version'] = '1.8.0'
pkg.setdefault('build', {})['productName'] = 'Web Audio Mastering HumanDetect'
pkg['build']['appId'] = 'com.webaudio.mastering.humandetect'
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

print('HumanDetect v1.8.0 patch applied successfully')
