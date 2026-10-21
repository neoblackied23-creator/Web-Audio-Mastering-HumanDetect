function pct(v){return Number.isFinite(Number(v))?(Number(v)*100).toFixed(1)+'%':'—';}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

export function mountMusicClassifierPanel(opts={}){
  if(window.__musicClassifierMounted)return;window.__musicClassifierMounted=true;
  const style=document.createElement('style');
  style.textContent=`.mc-toggle{position:fixed;right:18px;bottom:294px;z-index:99996;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.mc-panel{position:fixed;right:18px;bottom:18px;width:min(620px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100010;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.mc-head{display:flex;justify-content:space-between}.mc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.mc-card{background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.mc-card small{display:block;opacity:.65}.mc-card b{font-size:18px}.mc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.mc-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.mc-btn.main{background:#9d6cff}.mc-status{font-size:11px;opacity:.78;line-height:1.45;margin-top:10px}.mc-source{margin-top:10px;padding:10px;border-radius:10px;background:#9d6cff16;border:1px solid #9d6cff44}.mc-source strong{font-size:22px;display:block}.mc-evidence{margin-top:8px;font:11px/1.45 ui-monospace,Consolas,monospace;background:#0004;padding:8px;border-radius:8px;max-height:120px;overflow:auto}.mc-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:760px){.mc-panel{left:12px;right:12px;width:auto}.mc-grid{grid-template-columns:1fr}.mc-toggle{right:12px}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='mc-toggle';toggle.textContent='Music Classifier';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='mc-panel';
  root.innerHTML=`<div class="mc-head"><div><b>Music Source Classifier</b><div class="mc-status">v3.5 • Treblo classifier + provenance/source evidence + existing AI detectors</div></div><button class="mc-close">×</button></div>
  <div class="mc-grid">
    <div class="mc-card"><small>Treblo official classifier</small><b id="mc-treblo">—</b><small id="mc-treblo-meta">not run</small></div>
    <div class="mc-card"><small>General AI evidence</small><b id="mc-ai">—</b><small id="mc-ai-meta">uses existing local detectors when available</small></div>
    <div class="mc-card"><small>Provenance footprint</small><b id="mc-prov">—</b><small id="mc-prov-meta">metadata/container strings</small></div>
  </div>
  <div class="mc-source"><small>BEST-SUPPORTED SOURCE</small><strong id="mc-source">—</strong><div id="mc-source-note" class="mc-status">No analysis yet.</div></div>
  <div class="mc-row"><span>Treblo engine:</span><b id="mc-state">checking…</b><button class="mc-btn" id="mc-check">Check</button><button class="mc-btn" id="mc-setup">Install / Update Treblo Classifier</button></div>
  <div class="mc-row"><button class="mc-btn main" id="mc-run">CLASSIFY ORIGINAL FILE</button></div>
  <div class="mc-evidence" id="mc-evidence">No evidence.</div>
  <div class="mc-status" id="mc-status">Important: only Treblo has a direct source-specific model here. Suno/Mureka labels require explicit provenance evidence; otherwise the app reports Unknown AI rather than guessing.</div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s);
  const status=t=>$('#mc-status').textContent=t;
  async function check(){
    try{
      const r=await window.electronAPI?.musicClassifierStatus?.();
      $('#mc-state').textContent=r?.trebloAvailable?'ready':'not installed';
      return r;
    }catch(e){$('#mc-state').textContent='error';status(e.message);return null;}
  }
  function localAiEvidence(){
    const e=window.__ensembleFinal;
    if(e&&Number.isFinite(Number(e.ai)))return {ai:Number(e.ai),label:e.verdict,source:'D1+D2 ensemble'};
    const d=window.__localHumanDetectLatest;
    if(d){
      const h=Number(d.humanScore??d.humanPct);
      if(Number.isFinite(h))return {ai:100-h,label:h>=50?'more human-like':'more AI-like',source:'D1 local'};
    }
    return null;
  }
  function chooseSource(r,local){
    const p=r?.provenance||{};
    if(p.strong_source)return {name:p.strong_source.toUpperCase(),note:'Explicit file/container provenance evidence found.'};
    const tp=Number(r?.treblo?.treblo_probability);
    if(Number.isFinite(tp)&&tp>=.6)return {name:'TREBLO',note:'Treblo source-specific classifier returned '+pct(tp)+'.'};
    if(local&&local.ai>=65)return {name:'UNKNOWN AI',note:'AI-like evidence is present, but no reliable Suno/Mureka/Treblo source attribution was found.'};
    if(Number.isFinite(tp)&&tp<.4)return {name:'NOT TREBLO',note:'Treblo classifier is negative; exact source remains unverified.'};
    return {name:'UNVERIFIED',note:'Insufficient evidence for source attribution.'};
  }
  $('#mc-check').onclick=check;
  $('#mc-setup').onclick=async()=>{const b=$('#mc-setup');b.disabled=true;try{
    status('Installing Treblo classifier locally. First setup is large because it includes PyTorch; first analysis also downloads the Treblo checkpoint.');
    const r=await window.electronAPI?.musicClassifierSetup?.();if(!r?.success)throw new Error(r?.error||'setup failed');
    status('Treblo classifier ready.');await check();
  }catch(e){status('Setup failed: '+e.message);}finally{b.disabled=false;}};
  $('#mc-run').onclick=async()=>{const b=$('#mc-run');b.disabled=true;try{
    const path=await opts.getOriginalPath?.();if(!path)throw new Error('Load an original audio file first.');
    status('Classifying source… Treblo model can take time on CPU.');
    const r=await window.electronAPI?.musicClassifierRun?.(path);if(!r?.success)throw new Error(r?.error||'classification failed');
    const tr=r.treblo||{};$('#mc-treblo').textContent=Number.isFinite(Number(tr.treblo_probability))?pct(tr.treblo_probability):'unavailable';
    $('#mc-treblo-meta').textContent=tr.label?tr.label+' • '+(tr.confidence||'')+' • '+(tr.chunks??'—')+' chunks':(r.trebloError||'not run');
    const local=localAiEvidence();
    $('#mc-ai').textContent=local?local.ai.toFixed(1)+'% AI-like':'—';
    $('#mc-ai-meta').textContent=local?local.source+' • '+local.label:'Run Fast/Deep Check for ensemble evidence';
    const p=r.provenance||{};
    $('#mc-prov').textContent=p.strong_source?p.strong_source.toUpperCase():(p.matches?.length?'FOUND':'NONE');
    $('#mc-prov-meta').textContent=(p.matches?.length||0)+' footprint match(es)';
    const best=chooseSource(r,local);$('#mc-source').textContent=best.name;$('#mc-source-note').textContent=best.note;
    $('#mc-evidence').innerHTML=(p.matches?.length?p.matches.map(x=>esc(x)).join('<br>'):'No explicit Suno / Mureka / Treblo provenance strings found.');
    window.__musicClassifierLatest={...r,localAI:local,bestSource:best};
    status('Done. Source attribution is evidence-based; the app does not invent a Mureka/Suno label when no specific model or provenance supports it.');
  }catch(e){status('Classification failed: '+e.message);}finally{b.disabled=false;}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();};
  $('.mc-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
  check();
}
