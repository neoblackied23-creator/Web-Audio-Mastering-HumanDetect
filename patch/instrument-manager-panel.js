function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
export function mountInstrumentManager(){
  if(window.__instrumentManagerMounted)return;window.__instrumentManagerMounted=true;
  const style=document.createElement('style');
  style.textContent=`.im-toggle{position:fixed;right:18px;bottom:202px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.im-panel{position:fixed;left:18px;bottom:18px;width:min(700px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100005;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.im-head{display:flex;justify-content:space-between}.im-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.im-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.im-btn.main{background:#9d6cff}.im-url{flex:1;min-width:260px;background:#11141a;color:#fff;border:1px solid #ffffff22;border-radius:8px;padding:8px}.im-list{margin-top:10px;display:grid;gap:8px}.im-item{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.im-meta{font-size:11px;opacity:.7}.im-log{margin-top:10px;max-height:120px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.im-close{background:none;border:0;color:inherit;font-size:18px}.im-status{font-size:11px;opacity:.75}@media(max-width:760px){.im-panel{left:12px;right:12px;width:auto}.im-item{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='im-toggle';toggle.textContent='Instrument Manager';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='im-panel';
  root.innerHTML=`<div class="im-head"><div><b>Instrument Manager</b><div class="im-status">v3.2 • Cloud Catalog • Pack Builder • checksum • local cache</div></div><button class="im-close">×</button></div>
  <div class="im-row"><button class="im-btn main" id="im-starter">Install Starter Packs</button><button class="im-btn" id="im-starter-extended">Install Extended Starters</button><button class="im-btn" id="im-local">Install Local ZIP</button><button class="im-btn" id="im-build-folder">Pack Builder: Folder</button><button class="im-btn" id="im-build-zip">Pack Builder: ZIP</button></div>
  <div id="im-builder" class="im-item" style="display:none;grid-template-columns:1fr">
    <div><b>Pack Builder v3.2</b><div id="im-builder-info" class="im-meta">Choose a folder or ZIP containing audio samples.</div></div>
    <div class="im-row"><label>Name <input class="im-url" id="im-builder-name" style="min-width:190px" value="Custom Instrument Pack"></label><label>Type <select id="im-builder-type"><option value="drums">Drums</option><option value="bass">Bass</option><option value="keys">Piano / Keys</option><option value="guitar">Guitar</option><option value="synth">Synth Lead</option><option value="pad">Synth Pad</option><option value="strings">Strings</option></select></label></div>
    <div class="im-row"><label style="flex:1">License / rights note <input class="im-url" id="im-builder-license" value="User-provided samples; rights not verified"></label></div>
    <div id="im-builder-drums">
      <div class="im-row"><label>Kick <select id="im-builder-kick"></select></label><label>Snare <select id="im-builder-snare"></select></label><label>Hat <select id="im-builder-hat"></select></label></div>
    </div>
    <div id="im-builder-bass" style="display:none"><div class="im-meta">Single-note sample packs are used for Bass / Keys / Guitar / Synth / Pad / Strings.</div>
      <div class="im-row"><label>Bass sample <select id="im-builder-bassfile"></select></label><label>Root MIDI <input id="im-builder-root" type="number" min="0" max="127" value="36" style="width:70px"></label></div>
    </div>
    <div class="im-row"><button class="im-btn main" id="im-builder-create">Build + Install</button><button class="im-btn" id="im-builder-cancel">Cancel</button></div>
    <div style="height:8px;background:#ffffff12;border-radius:999px;overflow:hidden"><div id="im-builder-progress" style="height:100%;width:0;background:#9d6cff;transition:width .2s"></div></div>
    <div id="im-builder-stage" class="im-status">IDLE</div>
  </div>
  <div class="im-row"><input class="im-url" id="im-url" placeholder="Direct instrument-pack ZIP URL"><button class="im-btn" id="im-download">Install URL</button></div>
  <div class="im-status">Pack format: ZIP containing <b>instrument.json</b>. Supported types: <b>drums</b> and <b>bass</b>.</div>
  <div class="im-row"><b>Cloud Catalog</b><button class="im-btn" id="im-cloud-refresh">Refresh</button><span id="im-cloud-mode" class="im-status">loading…</span></div>
  <div id="im-cloud-list" class="im-list"></div>
  <div class="im-row"><b>Installed Packs</b></div>
  <div id="im-list" class="im-list"></div>
  <div id="im-status" class="im-status">IDLE</div><div id="im-log" class="im-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#im-log').appendChild(d);$('#im-log').scrollTop=$('#im-log').scrollHeight;},status=t=>{$('#im-status').textContent=t;log(t);};
  let packs=[];let builderSession=null,builderAnalysis=null;
  function builderProgress(p,stage){
    const bar=$('#im-builder-progress');if(bar)bar.style.width=Math.max(0,Math.min(100,p))+'%';
    const s=$('#im-builder-stage');if(s)s.textContent=stage||'';
    if(stage)log('Pack Builder: '+stage);
  }
  function builderOptions(files,selected){
    return (files||[]).map(x=>'<option value="'+esc(x.path)+'" '+(x.path===selected?'selected':'')+'>'+esc(x.name||x.relative||x.path)+'</option>').join('');
  }
  function renderBuilder(a){
    builderAnalysis=a;$('#im-builder').style.display='grid';
    $('#im-builder-type').value=['drums','bass'].includes(a.detectedType)?a.detectedType:'drums';
    $('#im-builder-info').textContent=a.fileCount+' audio files • auto-detected '+a.detectedType+(a.truncated?' • list preview limited':'');
    const all=a.files||[];
    const pick=(key)=>{const ranked=a.candidates?.[key]||[];const seen=new Set();const out=[];for(const x of [...ranked,...all]){if(x?.path&&!seen.has(x.path)){seen.add(x.path);out.push(x);}}return out;};
    $('#im-builder-kick').innerHTML=builderOptions(pick('kick'),a.mapping?.kick);
    $('#im-builder-snare').innerHTML=builderOptions(pick('snare'),a.mapping?.snare);
    $('#im-builder-hat').innerHTML=builderOptions(pick('hat'),a.mapping?.hat);
    $('#im-builder-bassfile').innerHTML=builderOptions(pick('bass'),a.mapping?.bass);
    $('#im-builder-root').value=Number(a.mapping?.rootMidi??36);
    const syncType=()=>{const melodic=$('#im-builder-type').value!=='drums';$('#im-builder-drums').style.display=melodic?'none':'block';$('#im-builder-bass').style.display=melodic?'block':'none';};
    $('#im-builder-type').onchange=syncType;syncType();builderProgress(45,'ANALYZED');
  }
  async function startBuilder(kind){
    try{
      builderProgress(5,'SELECTING SOURCE');
      const p=kind==='zip'?await window.electronAPI?.instrumentPackBuilderSelectZip?.():await window.electronAPI?.instrumentPackBuilderSelectFolder?.();
      if(!p?.path){builderProgress(0,'IDLE');return;}
      builderProgress(15,'SCANNING');
      const a=await window.electronAPI?.instrumentPackBuilderAnalyze?.(p.path);
      if(!a?.success){status('ERROR: '+(a?.error||'Pack Builder analysis failed'));builderProgress(0,'ERROR');return;}
      builderSession=a.sessionId;renderBuilder(a);
    }catch(e){status('ERROR: '+e.message);builderProgress(0,'ERROR');}
  }
  async function refreshCloud(force=false){
    const r=await window.electronAPI?.instrumentCloudCatalog?.(force);
    if(!r?.success){$('#im-cloud-mode').textContent='ERROR';$('#im-cloud-list').innerHTML='<div class="im-status">'+esc(r?.error||'Cloud catalog unavailable')+'</div>';return;}
    $('#im-cloud-mode').textContent=r.offline?'offline cache':'online';
    const assets=r.assets||[];
    $('#im-cloud-list').innerHTML=assets.length?assets.map(a=>{
      const state=a.installed?'Installed':(a.downloaded&&a.valid?'Downloaded':a.downloaded?'Checksum error':'Available');
      const canInstall=!!a.app_usable;
      const primary=a.installed
        ? '<button class="im-btn" disabled>Installed</button>'
        : (a.downloaded&&a.valid
            ? (canInstall?'<button class="im-btn main" data-cinstall="'+esc(a.id)+'">Install</button>':'<button class="im-btn" disabled>Source only</button>')
            : '<button class="im-btn main" data-cdownload="'+esc(a.id)+'">Download</button>');
      const remove=a.downloaded?'<button class="im-btn" data-cremove="'+esc(a.id)+'">Remove Cache</button>':'';
      return '<div class="im-item"><div><b>'+esc(a.name||a.id)+'</b><div class="im-meta">'+esc(a.license||'license ?')+' • '+state+' • '+(a.app_usable?'Instrument Pack':'Cloud Source')+'</div></div>'+primary+remove+'</div>';
    }).join(''):'<div class="im-status">Cloud catalog is empty.</div>';
    root.querySelectorAll('[data-cdownload]').forEach(b=>b.onclick=async()=>{status('RUNNING: downloading '+b.dataset.cdownload);const r=await window.electronAPI?.instrumentCloudDownload?.(b.dataset.cdownload);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: cloud asset downloaded and checksum verified');await refreshCloud(false);});
    root.querySelectorAll('[data-cinstall]').forEach(b=>b.onclick=async()=>{status('RUNNING: installing '+b.dataset.cinstall);const r=await window.electronAPI?.instrumentCloudInstall?.(b.dataset.cinstall);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: cloud instrument installed');await refresh();await refreshCloud(false);});
    root.querySelectorAll('[data-cremove]').forEach(b=>b.onclick=async()=>{status('RUNNING: removing cloud cache '+b.dataset.cremove);const r=await window.electronAPI?.instrumentCloudRemove?.(b.dataset.cremove);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: cloud cache removed');await refreshCloud(false);});
    if(r.warning)log('Cloud catalog warning: '+r.warning);
  }
  async function refresh(){
    const r=await window.electronAPI?.instrumentManagerList?.();packs=r?.packs||[];
    window.__instrumentPacks=packs;
    const selected={};for(const typ of ['drums','bass','keys','guitar','synth','pad','strings'])selected[typ]=localStorage.getItem('hd_instrument_'+typ)||'';
    $('#im-list').innerHTML=packs.length?packs.map(p=>`<div class="im-item"><div><b>${esc(p.name||p.id)}</b><div class="im-meta">${esc(p.type)} • v${esc(p.version||'?')} • ${esc(p.license||'license not specified')}</div></div><label><input type="radio" name="im-${esc(p.type)}" data-select="${esc(p.id)}" data-type="${esc(p.type)}" ${selected[p.type]===p.id?'checked':''}> Use</label><button class="im-btn" data-remove="${esc(p.id)}">Remove</button></div>`).join(''):'<div class="im-status">No optional sample packs installed. Re-Performance will use internal synths.</div>';
    root.querySelectorAll('[data-select]').forEach(x=>x.onchange=()=>{localStorage.setItem('hd_instrument_'+x.dataset.type,x.dataset.select);window.__instrumentSelection={};for(const t of ['drums','bass','keys','guitar','synth','pad','strings'])window.__instrumentSelection[t]=localStorage.getItem('hd_instrument_'+t);status('Selected '+x.dataset.select+' for '+x.dataset.type);});
    root.querySelectorAll('[data-remove]').forEach(x=>x.onclick=async()=>{status('RUNNING: removing '+x.dataset.remove);const r=await window.electronAPI?.removeInstrumentPack?.(x.dataset.remove);if(!r?.success){status('ERROR: '+r?.error);return;}for(const t of ['drums','bass','keys','guitar','synth','pad','strings'])if(localStorage.getItem('hd_instrument_'+t)===x.dataset.remove)localStorage.removeItem('hd_instrument_'+t);status('DONE: pack removed');refresh();});
    window.__instrumentSelection={};for(const t of ['drums','bass','keys','guitar','synth','pad','strings'])window.__instrumentSelection[t]=localStorage.getItem('hd_instrument_'+t);
  }
  $('#im-build-folder').onclick=()=>startBuilder('folder');
  $('#im-build-zip').onclick=()=>startBuilder('zip');
  $('#im-builder-cancel').onclick=async()=>{
    if(builderSession)await window.electronAPI?.instrumentPackBuilderDiscard?.(builderSession);
    builderSession=null;builderAnalysis=null;$('#im-builder').style.display='none';builderProgress(0,'IDLE');
  };
  $('#im-builder-create').onclick=async()=>{
    if(!builderSession){status('ERROR: Analyze a sample source first');return;}
    const b=$('#im-builder-create');b.disabled=true;
    try{
      builderProgress(60,'BUILDING PACK');
      const type=$('#im-builder-type').value;
      const options={sessionId:builderSession,name:$('#im-builder-name').value.trim(),type,license:$('#im-builder-license').value.trim(),
        mapping:{kick:$('#im-builder-kick').value,snare:$('#im-builder-snare').value,hat:$('#im-builder-hat').value,bass:$('#im-builder-bassfile').value,rootMidi:Number($('#im-builder-root').value)||36},
        rootMidi:Number($('#im-builder-root').value)||36};
      builderProgress(80,'VALIDATING');
      const r=await window.electronAPI?.instrumentPackBuilderBuild?.(options);
      if(!r?.success){status('ERROR: '+(r?.error||'Build failed'));builderProgress(0,'ERROR');return;}
      builderProgress(100,'DONE');
      status('DONE: '+(r.pack?.name||'instrument pack')+' built + installed');
      await refresh();
    }catch(e){status('ERROR: '+e.message);builderProgress(0,'ERROR');}
    finally{b.disabled=false;}
  };
  $('#im-cloud-refresh').onclick=async()=>{status('RUNNING: refreshing cloud catalog');await refreshCloud(true);status('DONE: cloud catalog refreshed');};
  $('#im-starter').onclick=async()=>{status('RUNNING: installing starter packs');const r=await window.electronAPI?.installStarterInstruments?.();if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: starter packs installed');await refresh();};
  $('#im-starter-extended').onclick=async()=>{status('RUNNING: installing extended melodic starter packs');const r=await window.electronAPI?.installExtendedStarterInstruments?.();if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: extended melodic starter packs installed');await refresh();};
  $('#im-local').onclick=async()=>{const p=await window.electronAPI?.selectInstrumentPackZip?.();if(!p?.path)return;status('RUNNING: installing local ZIP');const r=await window.electronAPI?.installInstrumentFromZip?.(p.path);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: '+(r.pack?.name||'pack')+' installed');await refresh();};
  $('#im-download').onclick=async()=>{const url=$('#im-url').value.trim();if(!url){status('ERROR: paste a direct ZIP URL');return;}status('RUNNING: downloading instrument pack');const r=await window.electronAPI?.installInstrumentFromUrl?.(url);if(!r?.success){status('ERROR: '+r?.error);return;}status('DONE: '+(r.pack?.name||'pack')+' installed');await refresh();};
  async function ensureType(type,keywords=[]){
    await refresh();
    const existing=(packs||[]).find(p=>p.type===type);
    if(existing)return {success:true,status:'installed',pack:existing};
    const cat=await window.electronAPI?.instrumentCloudCatalog?.(false);
    if(!cat?.success)return {success:false,error:cat?.error||'Cloud catalog unavailable'};
    const kw=(keywords||[]).map(x=>String(x).toLowerCase());
    let choices=(cat.assets||[]).filter(a=>a.app_usable&&!a.installed);
    choices=choices.filter(a=>{
      const s=[a.id,a.name,a.type,a.tags,a.description].flat().filter(Boolean).join(' ').toLowerCase();
      return (!a.type||String(a.type).toLowerCase()===type)||kw.some(k=>s.includes(k));
    });
    choices.sort((a,b)=>{
      const score=x=>kw.reduce((n,k)=>n+([x.id,x.name,x.tags,x.description].flat().filter(Boolean).join(' ').toLowerCase().includes(k)?1:0),0);
      return score(b)-score(a);
    });
    const a=choices[0];
    if(!a){
      if(['keys','guitar','synth','pad','strings'].includes(type)){
        const x=await window.electronAPI?.installExtendedStarterInstruments?.();
        if(x?.success){
          await refresh();const p=(packs||[]).find(p=>p.type===type);
          if(p)return {success:true,status:'starter-fallback',pack:p};
        }
      }
      return {success:false,status:'missing',error:'No installable '+type+' pack found in cloud catalog'};
    }
    let d=a;
    if(!a.downloaded||!a.valid){
      const x=await window.electronAPI?.instrumentCloudDownload?.(a.id);if(!x?.success)return {success:false,error:x?.error||'Download failed'};d=x.asset||a;
    }
    const x=await window.electronAPI?.instrumentCloudInstall?.(a.id);if(!x?.success)return {success:false,error:x?.error||'Install failed'};
    await refresh();return {success:true,status:'downloaded',pack:x.pack||null,asset:d};
  }
  window.__instrumentManagerAPI={
    open:()=>{root.style.display='block';toggle.style.display='none';refresh();refreshCloud(false);},
    refresh:async()=>{await refresh();return packs||[];},
    list:()=>packs||[],
    ensureType,
    refreshCloud
  };
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';refresh();refreshCloud(false);};$('.im-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};refresh();refreshCloud(false);
}
