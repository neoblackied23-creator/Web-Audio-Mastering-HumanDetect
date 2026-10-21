function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function countWords(s){return (String(s||'').trim().match(/\S+/g)||[]).length;}
function heuristicGenre(text){
  const s=String(text||'').toLowerCase();
  const scores={
    'Pop':0,'Rock':0,'EDM / Dance':0,'R&B / Soul':0,'Hip-Hop / Rap':0,'Country / Folk':0,'Indie / Alternative':0,'Ballad':0
  };
  const add=(g,words,w=1)=>{for(const x of words)if(s.includes(x))scores[g]+=w;};
  add('Pop',['love','tonight','baby','heart','dance','forever','feel','you and me'],1);
  add('Rock',['fire','fight','wild','break','blood','storm','road','scream','burn'],1.2);
  add('EDM / Dance',['drop','bass','club','party','beat','move','dancefloor','neon','hands up'],1.5);
  add('R&B / Soul',['touch','slow','body','late night','desire','baby','skin','hold me','closer'],1.2);
  add('Hip-Hop / Rap',['money','city','street','grind','flow','bars','crew','real one','hustle'],1.4);
  add('Country / Folk',['road','home','truck','river','small town','whiskey','porch','fields','mama'],1.5);
  add('Indie / Alternative',['static','empty room','ghost','window','cold light','polaroid','silence','subway'],1.2);
  add('Ballad',['goodbye','tears','memory','miss you','alone','broken','remember','sorry'],1.4);
  const lines=s.split(/\r?\n/).filter(x=>x.trim());
  const avg=lines.length?lines.reduce((a,l)=>a+countWords(l),0)/lines.length:0;
  if(avg>10)scores['Hip-Hop / Rap']+=1.2;
  if(avg<7)scores['Pop']+=.6;
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const genre=ranked[0][1]>0?ranked[0][0]:'Pop';
  const subgenre={
    'Pop':'Contemporary Pop','Rock':'Alternative Rock','EDM / Dance':'Dance Pop / EDM','R&B / Soul':'Contemporary R&B',
    'Hip-Hop / Rap':'Melodic Rap','Country / Folk':'Modern Folk / Country','Indie / Alternative':'Indie Pop / Alternative','Ballad':'Pop Ballad'
  }[genre];
  const mood=s.match(/sad|tears|alone|broken|goodbye/)?'Melancholic':s.match(/dance|party|move|higher|alive/)?'Energetic':s.match(/love|closer|touch|heart/)?'Romantic':'Reflective';
  return {genre,subgenre,mood,scores};
}

function genreInstrumentPlan(g){
  const genre=String(g?.genre||'Pop');
  const map={
    'Pop':{core:['Drums','Bass','Piano/Keys','Synth Pad','Electric Guitar'],supported:[{type:'drums',keywords:['pop','acoustic','live']},{type:'bass',keywords:['pop','electric','finger']},{type:'keys',keywords:['pop','piano','keys']},{type:'pad',keywords:['pop','pad','ambient']},{type:'guitar',keywords:['pop','clean','electric guitar']}],notes:[]},
    'Rock':{core:['Live Drums','Electric Bass','Electric Guitar','Acoustic Guitar'],supported:[{type:'drums',keywords:['rock','live','acoustic']},{type:'bass',keywords:['rock','electric','bass guitar']},{type:'guitar',keywords:['rock','electric guitar','acoustic guitar']}],notes:[]},
    'EDM / Dance':{core:['Electronic Drums','Sub Bass','Synth Lead','Synth Pad','FX/Risers'],supported:[{type:'drums',keywords:['edm','electronic','dance']},{type:'bass',keywords:['sub','edm','synth']},{type:'synth',keywords:['edm','lead','synth']},{type:'pad',keywords:['edm','pad','ambient']}],notes:['FX/Risers']},
    'R&B / Soul':{core:['Groove Drums','Electric Bass','Rhodes/Keys','Clean Guitar','Pad'],supported:[{type:'drums',keywords:['r&b','soul','groove']},{type:'bass',keywords:['r&b','soul','electric']},{type:'keys',keywords:['rhodes','r&b','soul']},{type:'guitar',keywords:['clean','r&b','soul']},{type:'pad',keywords:['warm','r&b','pad']}],notes:[]},
    'Hip-Hop / Rap':{core:['Hip-Hop Drums','808/Sub Bass','Keys','Texture/Pad'],supported:[{type:'drums',keywords:['hiphop','hip-hop','trap']},{type:'bass',keywords:['808','sub','trap']},{type:'keys',keywords:['hiphop','keys','piano']},{type:'pad',keywords:['texture','pad','ambient']}],notes:[]},
    'Country / Folk':{core:['Acoustic Drums','Electric/Acoustic Bass','Acoustic Guitar','Mandolin/Fiddle'],supported:[{type:'drums',keywords:['country','acoustic','live']},{type:'bass',keywords:['country','acoustic','upright']},{type:'guitar',keywords:['country','acoustic guitar','folk']},{type:'strings',keywords:['fiddle','strings','folk']}],notes:['Mandolin']},
    'Indie / Alternative':{core:['Indie Drums','Electric Bass','Electric Guitar','Lo-fi Keys/Pad'],supported:[{type:'drums',keywords:['indie','alternative','live']},{type:'bass',keywords:['indie','electric']},{type:'guitar',keywords:['indie','alternative','electric guitar']},{type:'keys',keywords:['lofi','indie','keys']},{type:'pad',keywords:['indie','pad','ambient']}],notes:[]},
    'Ballad':{core:['Soft Drums/Percussion','Warm Bass','Piano','Strings/Pad'],supported:[{type:'drums',keywords:['soft','brush','ballad']},{type:'bass',keywords:['warm','upright','soft']},{type:'keys',keywords:['piano','ballad','soft']},{type:'strings',keywords:['strings','ballad','orchestral']},{type:'pad',keywords:['soft','warm','pad']}],notes:[]}
  };
  return map[genre]||map.Pop;
}

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
  <div class="ll-row"><button class="ll-btn" id="ll-check">Check Transcriber</button><button class="ll-btn" id="ll-setup">Install/Update Whisper</button><button class="ll-btn main" id="ll-extract">EXTRACT LYRICS</button><button class="ll-btn" id="ll-paste">PASTE LYRICS</button><button class="ll-btn" id="ll-clear">Clear</button><label><input id="ll-use-vocals" type="checkbox" checked> Prefer vocals stem</label><label>Language <input id="ll-lang" value="auto" style="width:62px"></label></div>
  <div class="ll-provider">
    <div class="ll-row"><label>AI Provider <select id="ll-provider"><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="claude">Claude</option><option value="openrouter">OpenRouter</option><option value="groq">Groq</option><option value="custom">MUSE/Muze / Custom OpenAI-compatible</option></select></label><label>Model <input id="ll-model" value="gemini-2.5-flash" style="width:180px"></label></div>
    <div class="ll-row"><label>API Key <input id="ll-key" type="password" placeholder="session only" style="width:250px"></label><label>Custom URL <input id="ll-url" placeholder="https://.../v1/chat/completions" style="width:290px"></label></div>
    <div class="ll-status">API key is sent only when you press an AI action and is not written into the project source.</div>
  </div>
  <div class="ll-grid">
    <div class="ll-card"><b>Original / Pasted Lyrics</b><textarea id="ll-original" placeholder="Extract from audio, paste lyrics from Mureka/Treblo/Suno/etc., or type manually..."></textarea><div class="ll-row"><button class="ll-btn" id="ll-local-analyze">Analyze Style</button><button class="ll-btn" id="ll-ai-analyze">AI Review</button><span id="ll-source-mode" class="ll-status">Source: manual / none</span></div><div class="ll-score" id="ll-score">AI-style indicators: —</div><div class="ll-row"><b>Detected Genre:</b><span id="ll-genre">—</span><b>Subgenre:</b><span id="ll-subgenre">—</span><b>Mood:</b><span id="ll-mood">—</span></div><div class="ll-flags" id="ll-flags"></div></div>
    <div class="ll-card"><b>Polished / Natural Version</b><textarea id="ll-output" placeholder="Suggested rewrite appears here..."></textarea><div class="ll-row"><button class="ll-btn main" id="ll-polish">Polish / Humanize</button><button class="ll-btn" id="ll-suggest">Suggest Improvements</button><button class="ll-btn" id="ll-suggest-genre">Suggest by Genre</button><button class="ll-btn" id="ll-copy">Copy Result</button></div><div class="ll-status" id="ll-ai-note">Preserves meaning, section structure, rhyme intent, and singability unless you request larger changes.</div><div class="ll-row"><button class="ll-btn" id="ll-inst">Suggest Instruments</button><button class="ll-btn" id="ll-inst-manager">Open Instrument Manager</button><button class="ll-btn main" id="ll-auto-inst">Download Missing Instruments</button></div><div class="ll-flags" id="ll-inst-list">Instrument suggestions will appear here.</div></div>
  </div>
  <div class="ll-status" id="ll-status">Ready. AI-style score is a writing-style heuristic, not proof of authorship.</div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),status=t=>$('#ll-status').textContent=t;
  const defaults={gemini:'gemini-2.5-flash',openai:'gpt-5-mini',claude:'claude-sonnet-4-5',openrouter:'openai/gpt-5-mini',groq:'llama-3.3-70b-versatile',custom:''};
  $('#ll-provider').onchange=()=>{$('#ll-model').value=defaults[$('#ll-provider').value]||'';};
  async function check(){const r=await window.electronAPI?.lyricTranscriberStatus?.();status(r?.available?'Whisper transcriber ready.':'Whisper transcriber not installed.');return r;}
  $('#ll-paste').onclick=async()=>{try{
    const txt=await navigator.clipboard.readText();
    if(!txt.trim())throw new Error('Clipboard does not contain text');
    $('#ll-original').value=txt;
    $('#ll-source-mode').textContent='Source: pasted lyrics';
    status('Lyrics pasted. Ready for Analyze Style or Polish / Humanize.');
    $('#ll-local-analyze').click();
  }catch(e){status('Paste failed: '+e.message+' You can also paste directly into the Original / Pasted Lyrics box.');}};
  $('#ll-clear').onclick=()=>{
    $('#ll-original').value='';$('#ll-output').value='';$('#ll-score').textContent='AI-style indicators: —';$('#ll-flags').textContent='';$('#ll-source-mode').textContent='Source: manual / none';status('Lyric fields cleared.');
  };
  $('#ll-check').onclick=check;
  $('#ll-setup').onclick=async()=>{const b=$('#ll-setup');b.disabled=true;try{status('Installing faster-whisper locally…');const r=await window.electronAPI?.lyricTranscriberSetup?.();if(!r?.success)throw new Error(r?.error||'setup failed');status('Whisper transcriber ready.');}catch(e){status('Setup failed: '+e.message);}finally{b.disabled=false;}};
  $('#ll-extract').onclick=async()=>{const b=$('#ll-extract');b.disabled=true;try{
    let p=null;if($('#ll-use-vocals').checked)p=await opts.getVocalsPath?.();if(!p)p=await opts.getOriginalPath?.();if(!p)throw new Error('Load a song first');
    status('Transcribing lyrics… first model download may take time.');
    const lang=$('#ll-lang').value.trim();const r=await window.electronAPI?.lyricTranscribe?.(p,lang==='auto'?null:lang);if(!r?.success)throw new Error(r?.error||'transcription failed');
    $('#ll-original').value=r.text||'';$('#ll-source-mode').textContent='Source: extracted from audio';status('Lyrics extracted • '+(r.language||'auto')+' • '+(r.segments?.length||0)+' segments.');
    $('#ll-local-analyze').click();
  }catch(e){status('Extract failed: '+e.message);}finally{b.disabled=false;}};
  $('#ll-local-analyze').onclick=()=>{const txt=$('#ll-original').value,r=heuristicLyricAnalysis(txt),g=heuristicGenre(txt);$('#ll-score').textContent='AI-style indicators: '+r.score+'/100';$('#ll-genre').textContent=g.genre;$('#ll-subgenre').textContent=g.subgenre;$('#ll-mood').textContent=g.mood;$('#ll-flags').innerHTML=r.flags.length?r.flags.map(x=>'• '+esc(x)).join('<br>'):'No strong repetitive/generic style flags found.';window.__lyricGenre=g;};
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
  $('#ll-suggest-genre').onclick=async()=>{try{
    const txt=$('#ll-original').value;if(!txt.trim())throw new Error('Lyrics are empty');
    const g=window.__lyricGenre||heuristicGenre(txt);window.__lyricGenre=g;
    status('Generating genre-aware lyric improvements for '+g.genre+'…');
    const p=payload('genre_suggest');p.genre=g.genre;p.subgenre=g.subgenre;p.mood=g.mood;
    const r=await window.electronAPI?.lyricAi?.(p);if(!r?.success)throw new Error(r?.error||'AI request failed');
    $('#ll-output').value=r.text||'';status('Genre-aware suggestions ready for '+g.genre+' / '+g.subgenre+'.');
  }catch(e){status('Genre suggestion failed: '+e.message);}};
  $('#ll-inst').onclick=async()=>{try{
    const txt=$('#ll-original').value;if(!txt.trim())throw new Error('Lyrics are empty');
    const g=window.__lyricGenre||heuristicGenre(txt);window.__lyricGenre=g;
    const plan=genreInstrumentPlan(g),api=window.__instrumentManagerAPI;
    const packs=api?await api.refresh():(window.__instrumentPacks||[]);
    const installed={};for(const typ of ['drums','bass','keys','guitar','synth','pad','strings'])installed[typ]=packs.find(p=>p.type===typ);
    const lines=['Genre: '+g.genre+' / '+g.subgenre+' • '+g.mood,'Recommended arrangement: '+plan.core.join(', ')];
    for(const s of plan.supported){
      const p=installed[s.type];
      lines.push((p?'✓ ':'✗ ')+s.type.toUpperCase()+': '+(p?(p.name||p.id):'not installed'));
    }
    if(plan.notes.length)lines.push('Not yet supported by current Instrument Manager: '+plan.notes.join(', '));
    $('#ll-inst-list').innerHTML=lines.map(x=>esc(x)).join('<br>');
    status('Instrument plan ready. Missing supported packs can be downloaded with Instrument Manager.');
  }catch(e){status('Instrument suggestion failed: '+e.message);}};
  $('#ll-inst-manager').onclick=()=>{const api=window.__instrumentManagerAPI;if(api)api.open();else status('Instrument Manager is not ready.');};
  $('#ll-auto-inst').onclick=async()=>{const b=$('#ll-auto-inst');b.disabled=true;try{
    const txt=$('#ll-original').value;if(!txt.trim())throw new Error('Lyrics are empty');
    const g=window.__lyricGenre||heuristicGenre(txt),plan=genreInstrumentPlan(g),api=window.__instrumentManagerAPI;
    if(!api)throw new Error('Instrument Manager is not ready');
    status('Checking installed instrument packs for '+g.genre+'…');
    const results=[];
    for(const s of plan.supported){
      const r=await api.ensureType(s.type,s.keywords);results.push({type:s.type,...r});
      if(!r.success)results[results.length-1].error=r.error||'not available';
    }
    const packs=await api.refresh();
    const lines=['Genre: '+g.genre+' / '+g.subgenre];
    for(const x of results){
      lines.push((x.success?'✓ ':'✗ ')+x.type.toUpperCase()+': '+(x.success?(x.pack?.name||x.status):x.error));
    }
    if(plan.notes.length)lines.push('Manual/future instrument support needed: '+plan.notes.join(', '));
    $('#ll-inst-list').innerHTML=lines.map(x=>esc(x)).join('<br>');
    status('Instrument check/download finished. Newly installed instrument packs are ready for Re-Performance testing.');
  }catch(e){status('Instrument download failed: '+e.message);}finally{b.disabled=false;}};
  $('#ll-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#ll-output').value);status('Result copied.');}catch(e){status('Copy failed: '+e.message);}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();};$('.ll-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
}
