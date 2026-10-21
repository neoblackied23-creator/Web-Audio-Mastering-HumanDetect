function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function countWords(s){return (String(s||'').trim().match(/\S+/g)||[]).length;}
function heuristicLyricAnalysis(text){
  const t=String(text||'').trim(),lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!t)return {score:0,flags:[]};
  const lower=t.toLowerCase(),flags=[];let s=0;
  const clichés=['in the night','heart on fire','lost in time','shadows dance','neon lights','broken dreams','take me higher','feel alive','echoes of','stars align','set me free','through the rain'];
  const hits=clichés.filter(x=>lower.includes(x));if(hits.length){s+=Math.min(25,hits.length*5);flags.push('Generic/cliché phrases: '+hits.slice(0,5).join(', '));}
  const uniq=new Set(lines.map(x=>x.toLowerCase()));const rep=lines.length?1-uniq.size/lines.length:0;if(rep>.22){s+=Math.min(20,rep*55);flags.push('High exact-line repetition');}
  const generic=(lower.match(/\b(feel|heart|dream|night|love|light|fire|soul|forever|time)\b/g)||[]).length/Math.max(1,countWords(t));
  if(generic>.065){s+=15;flags.push('High generic emotional vocabulary density');}
  const lens=lines.map(x=>countWords(x)).filter(Boolean);if(lens.length>4){const avg=lens.reduce((a,b)=>a+b,0)/lens.length;const variance=lens.reduce((a,b)=>a+(b-avg)*(b-avg),0)/lens.length;if(variance<2.2){s+=14;flags.push('Very uniform line lengths');}}
  const punct=(t.match(/[,:;.!?—-]/g)||[]).length/Math.max(1,lines.length);if(punct<.25){s+=8;flags.push('Low punctuation/phrasing variation');}
  if(lines.length>=8){const starts={};for(const l of lines){const k=(l.split(/\s+/)[0]||'').toLowerCase();starts[k]=(starts[k]||0)+1;}const mx=Math.max(...Object.values(starts));if(mx/lines.length>.35){s+=10;flags.push('Many lines start with the same word');}}
  return {score:Math.max(0,Math.min(100,Math.round(s))),flags};
}

export function mountLyricLabPanel(opts={}){
  if(window.__lyricLabMounted)return;window.__lyricLabMounted=true;
  const style=document.createElement('style');
  style.textContent=`.ll-toggle{position:fixed;right:18px;bottom:342px;z-index:99996;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.ll-panel{position:fixed;right:18px;bottom:18px;width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 70px);overflow:auto;z-index:100020;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.985);color:#f4f4f4;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.ll-head{display:flex;justify-content:space-between}.ll-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.ll-card{background:#ffffff0d;border:1px solid #ffffff17;border-radius:10px;padding:10px}.ll-card textarea{width:100%;min-height:250px;resize:vertical;background:#0d0d12;color:#eee;border:1px solid #3b3b48;border-radius:8px;padding:9px;box-sizing:border-box;font:12px/1.5 ui-monospace,Consolas,monospace}.ll-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px}.ll-row input,.ll-row select{background:#1b1b22;color:#eee;border:1px solid #41414d;border-radius:7px;padding:7px}.ll-btn{background:#ffffff11;color:#eee;border:1px solid #ffffff2b;border-radius:8px;padding:8px 10px}.ll-btn.main{background:#9d6cff}.ll-status{font-size:11px;opacity:.75;line-height:1.45;margin-top:8px}.ll-score{font-size:18px;font-weight:700}.ll-close{background:none;border:0;color:#fff;font-size:18px}.ll-provider{padding:9px;background:#0003;border-radius:9px;margin-top:10px}.ll-flags{font-size:11px;line-height:1.45;max-height:100px;overflow:auto}@media(max-width:820px){.ll-panel{left:12px;right:12px;width:auto}.ll-grid{grid-template-columns:1fr}.ll-toggle{right:12px}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='ll-toggle';toggle.textContent='Lyric Lab';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='ll-panel';
  root.innerHTML=`<div class="ll-head"><div><b>Lyric Lab</b><div class="ll-status">v3.7 • transcription + lyric naturalness analysis + AI-assisted polish</div></div><button class="ll-close">×</button></div>
  <div class="ll-row"><button class="ll-btn" id="ll-check">Check Transcriber</button><button class="ll-btn" id="ll-setup">Install/Update Whisper</button><button class="ll-btn main" id="ll-extract">EXTRACT LYRICS</button><label><input id="ll-use-vocals" type="checkbox" checked> Prefer vocals stem</label><label>Language <input id="ll-lang" value="auto" style="width:62px"></label></div>
  <div class="ll-provider">
    <div class="ll-row"><label>AI Provider <select id="ll-provider"><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="claude">Claude</option><option value="openrouter">OpenRouter</option><option value="groq">Groq</option><option value="custom">MUSE/Muze / Custom OpenAI-compatible</option></select></label><label>Model <input id="ll-model" value="gemini-2.5-flash" style="width:180px"></label></div>
    <div class="ll-row"><label>API Key <input id="ll-key" type="password" placeholder="session only" style="width:250px"></label><label>Custom URL <input id="ll-url" placeholder="https://.../v1/chat/completions" style="width:290px"></label></div>
    <div class="ll-status">API key is sent only when you press an AI action and is not written into the project source.</div>
  </div>
  <div class="ll-grid">
    <div class="ll-card"><b>Extracted / Original Lyrics</b><textarea id="ll-original" placeholder="Extract from audio or paste lyrics here..."></textarea><div class="ll-row"><button class="ll-btn" id="ll-local-analyze">Analyze Style</button><button class="ll-btn" id="ll-ai-analyze">AI Review</button></div><div class="ll-score" id="ll-score">AI-style indicators: —</div><div class="ll-flags" id="ll-flags"></div></div>
    <div class="ll-card"><b>Polished / Natural Version</b><textarea id="ll-output" placeholder="Suggested rewrite appears here..."></textarea><div class="ll-row"><button class="ll-btn main" id="ll-polish">Polish / Humanize</button><button class="ll-btn" id="ll-suggest">Suggest Improvements</button><button class="ll-btn" id="ll-copy">Copy Result</button></div><div class="ll-status" id="ll-ai-note">Preserves meaning, section structure, rhyme intent, and singability unless you request larger changes.</div></div>
  </div>
  <div class="ll-status" id="ll-status">Ready. AI-style score is a writing-style heuristic, not proof of authorship.</div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),status=t=>$('#ll-status').textContent=t;
  const defaults={gemini:'gemini-2.5-flash',openai:'gpt-5-mini',claude:'claude-sonnet-4-5',openrouter:'openai/gpt-5-mini',groq:'llama-3.3-70b-versatile',custom:''};
  $('#ll-provider').onchange=()=>{$('#ll-model').value=defaults[$('#ll-provider').value]||'';};
  async function check(){const r=await window.electronAPI?.lyricTranscriberStatus?.();status(r?.available?'Whisper transcriber ready.':'Whisper transcriber not installed.');return r;}
  $('#ll-check').onclick=check;
  $('#ll-setup').onclick=async()=>{const b=$('#ll-setup');b.disabled=true;try{status('Installing faster-whisper locally…');const r=await window.electronAPI?.lyricTranscriberSetup?.();if(!r?.success)throw new Error(r?.error||'setup failed');status('Whisper transcriber ready.');}catch(e){status('Setup failed: '+e.message);}finally{b.disabled=false;}};
  $('#ll-extract').onclick=async()=>{const b=$('#ll-extract');b.disabled=true;try{
    let p=null;if($('#ll-use-vocals').checked)p=await opts.getVocalsPath?.();if(!p)p=await opts.getOriginalPath?.();if(!p)throw new Error('Load a song first');
    status('Transcribing lyrics… first model download may take time.');
    const lang=$('#ll-lang').value.trim();const r=await window.electronAPI?.lyricTranscribe?.(p,lang==='auto'?null:lang);if(!r?.success)throw new Error(r?.error||'transcription failed');
    $('#ll-original').value=r.text||'';status('Lyrics extracted • '+(r.language||'auto')+' • '+(r.segments?.length||0)+' segments.');
    $('#ll-local-analyze').click();
  }catch(e){status('Extract failed: '+e.message);}finally{b.disabled=false;}};
  $('#ll-local-analyze').onclick=()=>{const r=heuristicLyricAnalysis($('#ll-original').value);$('#ll-score').textContent='AI-style indicators: '+r.score+'/100';$('#ll-flags').innerHTML=r.flags.length?r.flags.map(x=>'• '+esc(x)).join('<br>'):'No strong repetitive/generic style flags found.';};
  function payload(action){
    return {provider:$('#ll-provider').value,model:$('#ll-model').value.trim(),apiKey:$('#ll-key').value.trim(),url:$('#ll-url').value.trim(),action,text:$('#ll-original').value};
  }
  async function ai(action){
    const p=payload(action);if(!p.text.trim())throw new Error('Lyrics are empty');if(!p.apiKey)throw new Error('Enter API key');
    const r=await window.electronAPI?.lyricAi?.(p);if(!r?.success)throw new Error(r?.error||'AI request failed');return r.text||'';
  }
  $('#ll-ai-analyze').onclick=async()=>{try{status('AI reviewing lyric style…');$('#ll-ai-note').textContent=await ai('analyze');status('AI review complete.');}catch(e){status('AI review failed: '+e.message);}};
  $('#ll-polish').onclick=async()=>{try{status('Polishing lyrics…');$('#ll-output').value=await ai('polish');status('Polished version ready. Review before using.');}catch(e){status('Polish failed: '+e.message);}};
  $('#ll-suggest').onclick=async()=>{try{status('Generating lyric suggestions…');$('#ll-output').value=await ai('suggest');status('Suggestions ready.');}catch(e){status('Suggestion failed: '+e.message);}};
  $('#ll-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#ll-output').value);status('Result copied.');}catch(e){status('Copy failed: '+e.message);}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();};$('.ll-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
}
