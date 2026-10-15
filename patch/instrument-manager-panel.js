function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
export function mountInstrumentManager(){
  if(window.__instrumentManagerMounted)return;window.__instrumentManagerMounted=true;
  const style=document.createElement('style');
  style.textContent=`.im-toggle{position:fixed;right:18px;bottom:202px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.im-panel{position:fixed;left:18px;bottom:18px;width:min(700px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100005;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.im-head{display:flex;justify-content:space-between}.im-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.im-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.im-btn.main{background:#9d6cff}.im-url{flex:1;min-width:260px;background:#11141a;color:#fff;border:1px solid #ffffff22;border-radius:8px;padding:8px}.im-list{margin-top:10px;display:grid;gap:8px}.im-item{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.im-meta{font-size:11px;opacity:.7}.im-log{margin-top:10px;max-height:120px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.im-close{background:none;border:0;color:inherit;font-size:18px}.im-status{font-size:11px;opacity:.75}@media(max-width:760px){.im-panel{left:12px;right:12px;width:auto}.im-item{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='im-toggle';toggle.textContent='Instrument Manager';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='im-panel';
  root.innerHTML=`<div class="im-head"><div><b>Instrument Manager</b><div class="im-status">v2.6 • On-demand packs • local cache • internal synth fallback</div></div><button class="im-close">×</button></div>
  <div class="im-row"><button class="im-btn main" id="im-starter">Install Starter Packs</button><button class="im-btn" id="im-local">Install Local ZIP</button></div>
  <div class="im-row"><input class="im-url" id="im-url" placeholder="Direct instrument-pack ZIP URL"><button class="im-btn" id="im-download">Install URL</button></div>
  <div class="im-status">Pack format: ZIP containing <b>instrument.json</b>. Supported types: <b>drums</b> and <b>bass</b>.</div>
  <div id="im-list" class="im-list"></div>
  <div id="im-status" class="im-status">IDLE</div><div id="im-log" class="im-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#im-log').appendChild(d);$('#im-log').scrollTop=$('#im-log').scrollHeight;},status=t=>{$('#im-status').textContent=t;log(t);};
  let packs=[];
  async function refresh(){
    const r=await window.electronAPI?.instrumentManagerList?.();packs=r?.packs||[];
    window.__instrumentPacks=packs;
    const selBass=localStorage.getItem('hd_instrument_bass')||'',selDrums=localStorage.getItem('hd_instrument_drums')||'';
    $('#im-list').innerHTML=packs.length?packs.map(p=>`<div class="im-item"><div><b>${esc(p.name||p.id)}</b><div class="im-meta">${esc(p.type)} • v${esc(p.version||'?')} • ${esc(p.license||'license not specified')}</div></div><label><input type="radio" name="im-${esc(p.type)}" data-select="${esc(p.id)}" data-type="${esc(p.type)}" ${(p.type==='bass'?selBass:selDrums)===p.id?'checked':''}> Use</label><button class="im-btn" data-remove="${esc(p.id)}">Remove</button></div>`).join(''):'<div class="im-status">No optional sample packs installed. Re-Performance will use internal synths.</div>';
    root.querySelectorAll('[data-select]').forEach(x=>x.onchange=()=>{localStorage.setItem('hd_instrument_'+x.dataset.type,x.dataset.select);window.__instrumentSelection={bass:localStorage.getItem('hd_instrument_bass'),drums:localStorage.getItem('hd_instrument_drums')};status('Selected '+x.dataset.select+' for '+x.dataset.type);});
    root.querySelectorAll('[data-remove]').forEach(x=>x.onclick=async()=>{status('RUNNING: removing '+x.dataset.remove);const r=await window.electronAPI?.removeInstrumentPack?.(x.dataset.remove);if(!r?.success){status('ERROR: '+r?.error);return;}for(const t of ['bass','drums'])if(localStorage.getItem('hd_instrument_'+t)===x.dataset.remove)localStorage.removeItem('hd_instrument_'+t);status('DONE: pack removed');refresh();});
    window.__instrumentSelection={bass:localStorage.getItem('hd_instrument_bass'),drums:localStorage.getItem('hd_instrument_drums')};
  }
  $('#im-starter').onclick=async()=>{status('RUNNING: installing starter packs');const r=await window.electronAPI?.installStarterInstruments?.();if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: starter packs installed');await refresh();};
  $('#im-local').onclick=async()=>{const p=await window.electronAPI?.selectInstrumentPackZip?.();if(!p?.path)return;status('RUNNING: installing local ZIP');const r=await window.electronAPI?.installInstrumentFromZip?.(p.path);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: '+(r.pack?.name||'pack')+' installed');await refresh();};
  $('#im-download').onclick=async()=>{const url=$('#im-url').value.trim();if(!url){status('ERROR: paste a direct ZIP URL');return;}status('RUNNING: downloading instrument pack');const r=await window.electronAPI?.installInstrumentFromUrl?.(url);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: '+(r.pack?.name||'pack')+' installed');await refresh();};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';refresh();};$('.im-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};refresh();
}
