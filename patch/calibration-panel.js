function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v));}
function loadRows(){try{return JSON.parse(localStorage.getItem('hd_calibration_rows_v22')||'[]')}catch(_){return[]}}
function saveRows(rows){localStorage.setItem('hd_calibration_rows_v22',JSON.stringify(rows));}
function targetFor(label){return label==='human'?100:0;}
function metrics(rows){
  const usable=rows.filter(r=>Number.isFinite(r.d1)&&Number.isFinite(r.d2)&&Number.isFinite(r.d3));
  const out={count:usable.length,weights:{d1:1/3,d2:1/3,d3:1/3},mae:{d1:null,d2:null,d3:null}};
  if(!usable.length)return out;
  for(const k of ['d1','d2','d3']){
    const mae=usable.reduce((s,r)=>s+Math.abs(Number(r[k])-targetFor(r.label)),0)/usable.length;
    out.mae[k]=mae;
  }
  const raw={};
  for(const k of ['d1','d2','d3']) raw[k]=1/Math.max(5,out.mae[k]);
  const sum=raw.d1+raw.d2+raw.d3;
  out.weights={d1:raw.d1/sum,d2:raw.d2/sum,d3:raw.d3/sum};
  return out;
}
function fmt(v){return Number.isFinite(v)?v.toFixed(1)+'%':'—';}
export function mountCalibrationPanel(){
  const style=document.createElement('style');
  style.textContent=`.cal-toggle{position:fixed;left:18px;bottom:114px;z-index:99994;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.cal-panel{position:fixed;left:540px;bottom:18px;width:min(560px,calc(100vw - 36px));max-height:calc(100vh - 90px);overflow:auto;z-index:100002;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(20,21,25,.98);box-shadow:0 18px 50px #0009;color:#f2f2f2;font-family:system-ui}.cal-head{display:flex;justify-content:space-between}.cal-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:9px}.cal-btn{border:1px solid #ffffff2b;border-radius:8px;padding:8px 10px;background:#ffffff14;color:inherit;cursor:pointer}.cal-btn.main{background:#b7e1ff;color:#101318;font-weight:700}.cal-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.cal-card{background:#ffffff0f;padding:9px;border-radius:9px}.cal-card small{display:block;opacity:.65}.cal-card b{font-size:16px}.cal-list{margin-top:10px;font-size:12px}.cal-item{display:grid;grid-template-columns:1.3fr .7fr .7fr .7fr .7fr auto;gap:5px;padding:6px 0;border-bottom:1px solid #ffffff14}.cal-note{font-size:11px;opacity:.7;line-height:1.4}.cal-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:1100px){.cal-panel{left:18px}.cal-grid{grid-template-columns:1fr 1fr}.cal-item{grid-template-columns:1fr 1fr}.cal-item span:first-child{grid-column:1/-1}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='cal-toggle';toggle.textContent='Calibration';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='cal-panel';root.style.display='none';
  root.innerHTML=`<div class="cal-head"><div><b>Detector Calibration Dashboard</b><div class="cal-note">v2.2 • label known references, learn detector weights</div></div><button class="cal-close">×</button></div>
  <div class="cal-grid">
    <div class="cal-card"><small>Benchmarks</small><b id="cal-n">0</b></div>
    <div class="cal-card"><small>D1 weight</small><b id="cal-w1">33.3%</b><small id="cal-e1">MAE —</small></div>
    <div class="cal-card"><small>D2 weight</small><b id="cal-w2">33.3%</b><small id="cal-e2">MAE —</small></div>
    <div class="cal-card"><small>D3 weight</small><b id="cal-w3">33.3%</b><small id="cal-e3">MAE —</small></div>
  </div>
  <div class="cal-row">
    <button class="cal-btn main" id="cal-human">Save as Known Human</button>
    <button class="cal-btn" id="cal-ai">Save as AI Raw</button>
    <button class="cal-btn" id="cal-mastered">Save as AI Mastered</button>
    <button class="cal-btn" id="cal-clear">Clear Benchmarks</button>
  </div>
  <div class="cal-note" style="margin-top:8px">Use tracks whose origin you actually know. A mastered AI track is still labeled AI for detector calibration; mastering quality and authorship are separate questions.</div>
  <div class="cal-list" id="cal-list"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s);
  let rows=loadRows();
  function redraw(){
    const m=metrics(rows);
    $('#cal-n').textContent=String(m.count);
    for(const [k,i] of [['d1','1'],['d2','2'],['d3','3']]){
      $('#cal-w'+i).textContent=(m.weights[k]*100).toFixed(1)+'%';
      $('#cal-e'+i).textContent='MAE '+(m.mae[k]==null?'—':m.mae[k].toFixed(1));
    }
    localStorage.setItem('hd_calibration_weights_v22',JSON.stringify(m.weights));
    window.__hdCalibrationWeights=m.weights;
    $('#cal-list').innerHTML=rows.length?rows.slice().reverse().map((r,idx)=>`<div class="cal-item"><span>${r.name||'reference'}</span><span>${r.label}</span><span>D1 ${fmt(r.d1)}</span><span>D2 ${fmt(r.d2)}</span><span>D3 ${fmt(r.d3)}</span><button data-i="${rows.length-1-idx}" class="cal-btn">×</button></div>`).join(''):'<div class="cal-note">No benchmark rows yet. Run the 3-detector check on a known reference, then save its label here.</div>';
    root.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.i),1);saveRows(rows);redraw();});
  }
  function capture(label){
    const e=window.__ensembleLatest;
    if(!e||![e.d1,e.d2,e.d3].every(Number.isFinite)){alert('Run 3-DETECTOR CHECK first so D1/D2/D3 all have scores.');return;}
    const name=window.__hdCurrentTrackName||'Current track';
    rows.push({ts:Date.now(),name,label,d1:e.d1,d2:e.d2,d3:e.d3});
    saveRows(rows);redraw();
  }
  $('#cal-human').onclick=()=>capture('human');
  $('#cal-ai').onclick=()=>capture('ai_raw');
  $('#cal-mastered').onclick=()=>capture('ai_mastered');
  $('#cal-clear').onclick=()=>{if(confirm('Clear all detector calibration benchmarks?')){rows=[];saveRows(rows);redraw();}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';redraw();};
  $('.cal-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
  redraw();
  return{root,toggle,metrics:()=>metrics(rows)};
}
