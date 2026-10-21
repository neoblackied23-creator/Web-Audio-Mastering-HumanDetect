from pathlib import Path
import json

root=Path('.')

preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'lyricTranscriberStatus:' not in pt:
    anchor='\n});'
    i=pt.rfind(anchor)
    if i<0: raise SystemExit('preload close anchor not found')
    before=pt[:i].rstrip()
    if not before.endswith(','): before += ','
    before += """
  lyricTranscriberStatus: () => ipcRenderer.invoke('lyric-transcriber-status'),
  lyricTranscriberSetup: () => ipcRenderer.invoke('lyric-transcriber-setup'),
  lyricTranscribe: (filePath, language=null) => ipcRenderer.invoke('lyric-transcribe', { filePath, language }),
  lyricAi: (payload) => ipcRenderer.invoke('lyric-ai', payload)
"""
    pt=before+pt[i:]
preload.write_text(pt,encoding='utf-8')

main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_LYRIC_LAB_V370' not in mt:
    mt += r'''

// HUMANDETECT_LYRIC_LAB_V370
function lyricLabDir(){const p=path.join(app.getPath('userData'),'lyric_lab');fs.mkdirSync(p,{recursive:true});return p;}
function lyricPy(){return path.join(lyricLabDir(),'.venv','Scripts','python.exe');}
function lyricScript(){return path.join(lyricLabDir(),'transcribe.py');}
function ensureLyricScript(){
  const code=[
    'import sys,json',
    'from faster_whisper import WhisperModel',
    'path=sys.argv[1]',
    'lang=None if len(sys.argv)<3 or sys.argv[2] in ("","auto","null") else sys.argv[2]',
    'model=WhisperModel("small", device="cpu", compute_type="int8")',
    'segments,info=model.transcribe(path, language=lang, vad_filter=True, beam_size=5)',
    'rows=[]',
    'for s in segments:',
    '    rows.append({"start":float(s.start),"end":float(s.end),"text":s.text.strip()})',
    'text="\\n".join(r["text"] for r in rows if r["text"])',
    'print(json.dumps({"text":text,"segments":rows,"language":getattr(info,"language",None),"language_probability":float(getattr(info,"language_probability",0.0) or 0.0)},ensure_ascii=False))'
  ].join('\n')+'\n';
  fs.mkdirSync(lyricLabDir(),{recursive:true});fs.writeFileSync(lyricScript(),code,'utf8');return lyricScript();
}
function lyricStatusSync(){
  const py=lyricPy();try{ensureLyricScript();}catch(_){}
  if(!fs.existsSync(py))return {available:false,reason:'Whisper environment not installed'};
  try{
    const r=spawnSync(py,['-c','import faster_whisper; print("ok")'],{cwd:lyricLabDir(),encoding:'utf8',windowsHide:true});
    return {available:r.status===0,python:py,reason:r.status===0?null:(r.stderr||r.stdout||'dependencies missing').slice(-1800)};
  }catch(e){return {available:false,reason:e.message};}
}
ipcMain.handle('lyric-transcriber-status',async()=>lyricStatusSync());
ipcMain.handle('lyric-transcriber-setup',async()=>{
  try{
    const mp=await ensureManagedPython311();
    if(!mp?.success)return {success:false,error:mp?.error||'Managed Python 3.11 setup failed'};
    const dir=lyricLabDir(),py=lyricPy();fs.mkdirSync(dir,{recursive:true});
    if(!fs.existsSync(py)){
      const r=await runProcess(mp.python,['-m','venv','.venv'],{cwd:dir});
      if(r.code!==0)return {success:false,error:'Lyric venv failed: '+(r.err||r.out).slice(-2200)};
    }
    let r=await runProcess(py,['-m','ensurepip','--upgrade'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'ensurepip failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--upgrade','pip','setuptools','wheel'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'pip setup failed: '+(r.err||r.out).slice(-2200)};
    r=await runProcess(py,['-m','pip','install','--no-cache-dir','faster-whisper==1.1.1'],{cwd:dir});
    if(r.code!==0)return {success:false,error:'faster-whisper install failed: '+(r.err||r.out).slice(-4000)};
    ensureLyricScript();
    const s=lyricStatusSync();
    return s.available?{success:true,...s}:{success:false,error:s.reason||'Whisper verification failed'};
  }catch(e){return {success:false,error:e.message};}
});
ipcMain.handle('lyric-transcribe',async(e,payload)=>{
  try{
    const filePath=payload?.filePath,language=payload?.language;
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Audio file not found'};
    const s=lyricStatusSync();if(!s.available)return {success:false,error:(s.reason||'Whisper unavailable')+'. Click Install/Update Whisper first.'};
    ensureLyricScript();
    const args=[lyricScript(),filePath,String(language||'auto')];
    const r=await runProcess(s.python,args,{cwd:s.dir||lyricLabDir()});
    if(r.code!==0)return {success:false,error:(r.err||r.out).slice(-5000)};
    const lines=(r.out||'').trim().split(/\r?\n/).filter(Boolean);let data=null;
    for(let i=lines.length-1;i>=0;i--){try{data=JSON.parse(lines[i]);break}catch(_){}}
    if(!data)return {success:false,error:'Whisper returned no JSON result'};
    return {success:true,...data};
  }catch(err){return {success:false,error:err.message};}
});
function lyricSystemPrompt(action){
  const common='You are a professional lyric editor. Never claim that a detector can be defeated. Improve naturalness, specificity, narrative coherence, emotional detail, singability, and phrasing while preserving the user intent. Avoid generic AI-like cliches, excessive symmetry, repetitive line openings, and filler. Preserve section labels such as [Verse], [Chorus], [Bridge] when present.';
  if(action==='analyze')return common+' Analyze the lyrics. Identify concrete issues and give concise, practical edits. Do not rewrite the whole lyric unless useful.';
  if(action==='suggest')return common+' Give a prioritized improvement plan, then provide 6-12 replacement line suggestions for the weakest lines.';
  if(action==='genre_suggest')return common+' Tailor every suggestion to the supplied genre, subgenre, and mood. Improve vocabulary, imagery, cadence, rhyme density, hook strength, and section dynamics so the lyric feels native to that genre rather than generic.';
  return common+' Rewrite the lyrics into a polished, human-sounding version. Preserve meaning, perspective, core hook, rhyme intent, and approximate line lengths. Return only the revised lyrics unless a tiny note is necessary.';
}
async function lyricAiRequest(p){
  const provider=String(p.provider||''),model=String(p.model||''),key=String(p.apiKey||''),url=String(p.url||''),text=String(p.text||''),action=String(p.action||'polish'),genre=String(p.genre||''),subgenre=String(p.subgenre||''),mood=String(p.mood||'');
  if(!key)throw new Error('API key is required');if(!text.trim())throw new Error('Lyrics are empty');
  const system=lyricSystemPrompt(action),user=(action==='genre_suggest'?('TARGET GENRE: '+genre+'\nSUBGENRE: '+subgenre+'\nMOOD: '+mood+'\n\n'):'')+'LYRICS:\n'+text;
  if(provider==='gemini'){
    const m=encodeURIComponent(model||'gemini-2.5-flash');
    const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+encodeURIComponent(key);
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}]})});
    const j=await res.json();if(!res.ok)throw new Error(j?.error?.message||('Gemini HTTP '+res.status));
    return j?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('\n')||'';
  }
  if(provider==='claude'){
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:model||'claude-sonnet-4-5',max_tokens:5000,system,messages:[{role:'user',content:user}]})});
    const j=await res.json();if(!res.ok)throw new Error(j?.error?.message||('Claude HTTP '+res.status));
    return (j?.content||[]).map(x=>x.text||'').join('\n');
  }
  let endpoint='https://api.openai.com/v1/chat/completions',headers={'Content-Type':'application/json','Authorization':'Bearer '+key};
  if(provider==='openrouter'){endpoint='https://openrouter.ai/api/v1/chat/completions';headers['HTTP-Referer']='https://github.com/neoblackied23-creator/Web-Audio-Mastering-HumanDetect';headers['X-Title']='HumanDetect Lyric Lab';}
  else if(provider==='groq')endpoint='https://api.groq.com/openai/v1/chat/completions';
  else if(provider==='custom'){if(!/^https?:\/\//i.test(url))throw new Error('Custom provider requires a full http/https chat-completions URL');endpoint=url;}
  const body={model:model||'gpt-5-mini',messages:[{role:'system',content:system},{role:'user',content:user}],temperature:action==='analyze'?.35:.75};
  const res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)});const j=await res.json();
  if(!res.ok)throw new Error(j?.error?.message||('Provider HTTP '+res.status));
  return j?.choices?.[0]?.message?.content||'';
}
ipcMain.handle('lyric-ai',async(e,payload)=>{
  try{const text=await lyricAiRequest(payload||{});return {success:true,text};}
  catch(err){return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

app=root/'web'/'app.js'
at=app.read_text(encoding='utf-8')
imp="import { mountLyricLabPanel } from './human-detect/lyric-lab-panel.js';\n"
if imp not in at: at=imp+at
marker='// HUMANDETECT_LYRIC_LAB_PANEL_V370'
if marker not in at:
    at += r'''

// HUMANDETECT_LYRIC_LAB_PANEL_V370
window.addEventListener('DOMContentLoaded', () => {
  try {
    mountLyricLabPanel({
      getOriginalPath: async () => fileState.selectedFilePath || null,
      getVocalsPath: async () => window.__stemLabStemPaths?.vocals || null
    });
    console.log('[HumanDetect] v3.7 Lyric Lab mounted');
  } catch (err) {
    console.error('[HumanDetect] Lyric Lab failed to mount:', err);
  }
});
'''
app.write_text(at,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.7.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.7.0 Lyric Lab applied')
