import { analyzeAudioBuffer } from './human-detector-core.js';
function loadRows(){try{return JSON.parse(localStorage.getItem('hd_calibration_rows_v22')||'[]')}catch(_){return[]}}
function saveRows(rows){localStorage.setItem('hd_calibration_rows_v22',JSON.stringify(rows));}
function isHuman(r){return r.label==='human'}
function isAI(r){return r.label==='ai_raw'||r.label==='ai_mastered'}
function balancedMetrics(rows,key){
  const data=rows.filter(r=>Number.isFinite(r[key])&&(isHuman(r)||isAI(r)));
  const hs=data.filter(isHuman), as=data.filter(isAI);
  if(!hs.length||!as.length)return {threshold:null,balancedAccuracy:null,humanRecall:null,aiRecall:null,falseHuman:null,falseAI:null,gap:null,hMean:null,aMean:null};
  const vals=[...new Set(data.map(r=>Number(r[key])).sort((a,b)=>a-b))];
  const cand=[0,...vals.map((v,i)=>i<vals.length-1?(v+vals[i+1])/2:v),100];
  let best=null;
  for(const t of cand){
    const hr=hs.filter(r=>r[key]>=t).length/hs.length;
    const ar=as.filter(r=>r[key]<t).length/as.length;
    const ba=(hr+ar)/2;
    const cur={threshold:t,balancedAccuracy:ba,humanRecall:hr,aiRecall:ar};
    if(!best||ba>best.balancedAccuracy||(ba===best.balancedAccuracy&&Math.abs(t-50)<Math.abs(best.threshold-50)))best=cur;
  }
  const hMean=hs.reduce((s,r)=>s+r[key],0)/hs.length,aMean=as.reduce((s,r)=>s+r[key],0)/as.length;
  return {...best,falseHuman:1-best.aiRecall,falseAI:1-best.humanRecall,gap:hMean-aMean,hMean,aMean};
}
function metrics(rows){
  const d1=balancedMetrics(rows,'d1'),d2=balancedMetrics(rows,'d2');
  const q1=Math.max(.01,(d1.balancedAccuracy??.5)-.5),q2=Math.max(.01,(d2.balancedAccuracy??.5)-.5);
  const s=q1+q2;
  const out={count:rows.filter(r=>Number.isFinite(r.d1)&&Number.isFinite(r.d2)&&(isHuman(r)||isAI(r))).length,d1,d2,weights:{d1:q1/s,d2:q2/s},thresholds:{d1:d1.threshold??50,d2:d2.threshold??60}};
  localStorage.setItem('hd_calibration_v23',JSON.stringify(out)); window.__hdCalibrationV23=out; return out;
}
function fmt(v,d=1){return Number.isFinite(v)?v.toFixed(d):'—'}
function humanProbFromExternal(r){if(!r)return null;const c=Math.max(0,Math.min(1,Number(r.confidence)||0)),l=String(r.label||'').toLowerCase();if(['real','human','nonai'].includes(l))return c*100;if(['fake','ai'].includes(l))return(1-c)*100;return null}
async function localScoreForPath(path){
  const bytes=await window.electronAPI?.readFileData?.(path); if(!bytes)throw new Error('Could not read audio.');
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const ab=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);const audio=await ctx.decodeAudioData(ab);const r=analyzeAudioBuffer(audio);return Number(r.humanScore??r.humanPct);}finally{try{await ctx.close()}catch(_){}}
}
export function mountCalibrationPanel(){
  const style=document.createElement('style');
  style.textContent=`.cal-toggle{position:fixed;left:18px;bottom:114px;z-index:99994;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.cal-panel{position:fixed;left:540px;bottom:18px;width:min(620px,calc(100vw - 36px));max-height:calc(100vh - 90px);overflow:auto;z-index:100002;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(20,21,25,.98);box-shadow:0 18px 50px #0009;color:#f2f2f2;font-family:system-ui}.cal-head{display:flex;justify-content:space-between}.cal-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:9px}.cal-btn{border:1px solid #ffffff2b;border-radius:8px;padding:8px 10px;background:#ffffff14;color:inherit;cursor:pointer}.cal-btn.main{background:#b7e1ff;color:#101318;font-weight:700}.cal-btn:disabled{opacity:.45;cursor:not-allowed}.cal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.cal-card{background:#ffffff0f;padding:9px;border-radius:9px}.cal-card small{display:block;opacity:.65}.cal-card b{font-size:16px}.cal-list{margin-top:10px;font-size:12px}.cal-item{display:grid;grid-template-columns:1.5fr .8fr .8fr .8fr auto;gap:5px;padding:6px 0;border-bottom:1px solid #ffffff14}.cal-note{font-size:11px;opacity:.72;line-height:1.4}.cal-close{background:none;border:0;color:inherit;font-size:18px}.cal-progress{margin-top:10px;padding:9px;border:1px solid #ffffff22;border-radius:8px;background:#ffffff08;font-size:12px}.cal-log{margin-top:8px;max-height:140px;overflow:auto;background:#0004;border:1px solid #ffffff16;border-radius:7px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.cal-log .err{color:#ff9b9b}.cal-log .ok{color:#86e3a5}@media(max-width:1100px){.cal-panel{left:18px}.cal-grid{grid-template-columns:1fr}.cal-item{grid-template-columns:1fr 1fr}.cal-item span:first-child{grid-column:1/-1}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='cal-toggle';toggle.textContent='Calibration';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='cal-panel';root.style.display='none';
  root.innerHTML=`<div class="cal-head"><div><b>Detector Calibration Dashboard</b><div class="cal-note">v2.3 • D1 Fast + D2 Deep • threshold-based calibration</div></div><button class="cal-close">×</button></div>
  <div class="cal-grid">
    <div class="cal-card"><small>Benchmarks</small><b id="cal-n">0</b><small id="cal-balance">Need Human + AI</small></div>
    <div class="cal-card"><small>D1 Fast</small><b id="cal-d1">Threshold —</b><small id="cal-d1m">Balanced accuracy —</small></div>
    <div class="cal-card"><small>D2 Deep</small><b id="cal-d2">Threshold —</b><small id="cal-d2m">Balanced accuracy —</small></div>
  </div>
  <div class="cal-row"><button class="cal-btn main" id="cal-human">Save Current as Known Human</button><button class="cal-btn" id="cal-ai">Save Current as AI Raw</button><button class="cal-btn" id="cal-mastered">Save Current as AI Mastered</button><button class="cal-btn" id="cal-clear">Clear Benchmarks</button><button class="cal-btn" id="cal-clear-project">Clear Previous Project</button></div>
  <div class="cal-row"><button class="cal-btn main" id="cal-ai-files">Select AI Raw Files</button><button class="cal-btn" id="cal-mastered-files">Select AI Mastered Files</button><span class="cal-note" id="cal-ai-status">No AI batch running.</span></div>
  <div class="cal-row"><button class="cal-btn main" id="cal-download-human">Download 5 CC0 Human References</button><button class="cal-btn" id="cal-run-human">Run Human Pack</button><span class="cal-note" id="cal-pack-status">Human pack not checked.</span></div>
  <div class="cal-progress"><b>Benchmark Job Status</b><span id="cal-job-status">IDLE</span><div id="cal-progress-text" class="cal-note">No active job.</div><div id="cal-log" class="cal-log"></div></div>
  <div class="cal-note" style="margin-top:8px">Calibration now measures Human-vs-AI separation. AI-mastered files are still labeled AI for authorship calibration.</div>
  <div class="cal-list" id="cal-list"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s); let rows=loadRows(),activeJob=null;
  const buttons=()=>['#cal-ai-files','#cal-mastered-files','#cal-download-human','#cal-run-human'].map(s=>$(s)).filter(Boolean);
  const stamp=()=>new Date().toLocaleTimeString();
  function log(msg,type='info'){const e=document.createElement('div');e.className=type==='error'?'err':type==='ok'?'ok':'';e.textContent='['+stamp()+'] '+msg;$('#cal-log').appendChild(e);$('#cal-log').scrollTop=$('#cal-log').scrollHeight}
  function progress(msg){$('#cal-progress-text').textContent=msg}
  function setJob(name){activeJob=name;buttons().forEach(b=>b.disabled=true);$('#cal-job-status').textContent='RUNNING: '+name;progress('Starting '+name+'…');log('START '+name)}
  function clearJob(state='IDLE'){const name=activeJob;activeJob=null;buttons().forEach(b=>b.disabled=false);$('#cal-job-status').textContent=state;if(name)log(state+' '+name,state==='DONE'?'ok':'info')}
  function busy(){return activeJob?('Another benchmark is still running: '+activeJob):null}
  function redraw(){
    const m=metrics(rows),human=rows.filter(isHuman).length,ai=rows.filter(isAI).length;
    $('#cal-n').textContent=String(m.count);$('#cal-balance').textContent=`Human ${human} • AI ${ai}`;
    $('#cal-d1').textContent='Threshold '+fmt(m.d1.threshold)+'%';$('#cal-d1m').textContent=`BA ${Number.isFinite(m.d1.balancedAccuracy)?(m.d1.balancedAccuracy*100).toFixed(0)+'%':'—'} • gap ${fmt(m.d1.gap)} • weight ${(m.weights.d1*100).toFixed(0)}%`;
    $('#cal-d2').textContent='Threshold '+fmt(m.d2.threshold)+'%';$('#cal-d2m').textContent=`BA ${Number.isFinite(m.d2.balancedAccuracy)?(m.d2.balancedAccuracy*100).toFixed(0)+'%':'—'} • gap ${fmt(m.d2.gap)} • weight ${(m.weights.d2*100).toFixed(0)}%`;
    $('#cal-list').innerHTML=rows.length?rows.slice().reverse().map((r,idx)=>`<div class="cal-item"><span>${r.name||'reference'}</span><span>${r.label}</span><span>D1 ${fmt(r.d1)}%</span><span>D2 ${fmt(r.d2)}%</span><button data-i="${rows.length-1-idx}" class="cal-btn">×</button></div>`).join(''):'<div class="cal-note">No benchmarks yet.</div>';
    root.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.i),1);saveRows(rows);redraw()});
  }
  function capture(label){const e=window.__ensembleLatest;if(!e||![e.d1,e.d2].every(Number.isFinite)){alert('Run Deep Check first so D1 and D2 have scores.');return}rows.push({ts:Date.now(),name:window.__hdCurrentTrackName||'Current track',label,d1:e.d1,d2:e.d2});saveRows(rows);redraw()}
  async function runSelectedFiles(label){
    if(activeJob){$('#cal-ai-status').textContent=busy();return}
    const picker=await window.electronAPI?.selectBenchmarkAudioFiles?.(),paths=picker?.paths||[];if(!paths.length)return;
    setJob(label==='ai_raw'?'AI Raw batch':'AI Mastered batch');
    try{for(let i=0;i<paths.length;i++){const path=paths[i],name=path.split(/[/\\]/).pop()||'AI reference';progress(`File ${i+1}/${paths.length} • D1 • ${name}`);log(`File ${i+1}/${paths.length} D1 ${name}`);const d1=await localScoreForPath(path);progress(`File ${i+1}/${paths.length} • D2 • ${name}`);log(`File ${i+1}/${paths.length} D2 ${name}`);const r2=await window.electronAPI?.runOpenDetector?.(path);const d2=r2?.success?humanProbFromExternal(r2):null;if([d1,d2].every(Number.isFinite)){rows.push({ts:Date.now(),name,label,d1,d2,source:'manual-ai-batch'});saveRows(rows);redraw()}}$('#cal-ai-status').textContent=`AI batch complete: ${paths.length} file(s).`;progress('Complete');clearJob('DONE')}catch(e){$('#cal-ai-status').textContent='ERROR: '+e.message;progress('ERROR: '+e.message);log(e.message,'error');clearJob('ERROR')}}
  $('#cal-human').onclick=()=>capture('human');$('#cal-ai').onclick=()=>capture('ai_raw');$('#cal-mastered').onclick=()=>capture('ai_mastered');$('#cal-ai-files').onclick=()=>runSelectedFiles('ai_raw');$('#cal-mastered-files').onclick=()=>runSelectedFiles('ai_mastered');
  $('#cal-clear').onclick=()=>{if(confirm('Clear all calibration benchmarks?')){rows=[];saveRows(rows);redraw()}};
  $('#cal-clear-project').onclick=async()=>{
    if(activeJob){progress('Cannot clear project while '+activeJob+' is running.');return;}
    if(!confirm('Clear previous project data and caches? D2 detector engine will be kept. The app will reload afterward.'))return;
    setJob('Clear Previous Project');
    try{
      progress('Clearing renderer project state…');log('Clearing calibration/local project state');
      const keys=[];
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith('hd_')||k.startsWith('humanDetect')||k.startsWith('mastering_')))keys.push(k);}
      keys.forEach(k=>localStorage.removeItem(k));
      sessionStorage.clear();
      rows=[];
      saveRows(rows);
      progress('Clearing Electron project cache…');log('Requesting main-process cache cleanup');
      const r=await window.electronAPI?.clearPreviousProject?.();
      if(!r?.success)throw new Error(r?.error||'Project cleanup failed');
      log('Project cleanup complete','ok');progress('DONE • Previous project cleared. Reloading…');clearJob('DONE');
      setTimeout(()=>location.reload(),700);
    }catch(e){log('ERROR '+e.message,'error');progress('ERROR: '+e.message);clearJob('ERROR');}
  };
  $('#cal-download-human').onclick=async()=>{if(activeJob){$('#cal-pack-status').textContent=busy();return}setJob('Human pack download');try{progress('Downloading 5 CC0 human references…');const r=await window.electronAPI?.setupHumanBenchmarkPack?.();if(!r?.success)throw new Error(r?.error||'Download failed');window.__hdHumanBenchmarkPack=r.entries||[];$('#cal-pack-status').textContent=`${(r.entries||[]).length} human references ready.`;progress('Human references ready');clearJob('DONE')}catch(e){$('#cal-pack-status').textContent='ERROR: '+e.message;log(e.message,'error');clearJob('ERROR')}};
  $('#cal-run-human').onclick=async()=>{if(activeJob){$('#cal-pack-status').textContent=busy();return}setJob('Human Pack');try{let entries=window.__hdHumanBenchmarkPack;if(!entries?.length){const r=await window.electronAPI?.setupHumanBenchmarkPack?.();if(!r?.success)throw new Error(r?.error||'Pack unavailable');entries=r.entries||[];window.__hdHumanBenchmarkPack=entries}rows=rows.filter(x=>x.source!=='cc0-human-pack-v1');saveRows(rows);redraw();for(let i=0;i<entries.length;i++){const e=entries[i];progress(`Human ${i+1}/${entries.length} • D1 • ${e.name}`);log(`Human ${i+1}/${entries.length} D1 ${e.name}`);const d1=await localScoreForPath(e.path);progress(`Human ${i+1}/${entries.length} • D2 • ${e.name}`);log(`Human ${i+1}/${entries.length} D2 ${e.name}`);const r2=await window.electronAPI?.runOpenDetector?.(e.path);const d2=r2?.success?humanProbFromExternal(r2):null;if([d1,d2].every(Number.isFinite)){rows.push({ts:Date.now(),name:e.name,label:'human',d1,d2,source:'cc0-human-pack-v1',license:'CC0-1.0'});saveRows(rows);redraw()}}$('#cal-pack-status').textContent=`Human pack complete: ${entries.length}/${entries.length} scored.`;progress('Human pack complete');clearJob('DONE')}catch(e){$('#cal-pack-status').textContent='ERROR: '+e.message;log(e.message,'error');clearJob('ERROR')}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';redraw()};$('.cal-close').onclick=()=>{root.style.display='none';toggle.style.display='block'};redraw();return{root,toggle,metrics:()=>metrics(rows)};
}
