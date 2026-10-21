function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function monoSample(buf,maxPoints=120000){
  const step=Math.max(1,Math.floor(buf.length/maxPoints)),out=new Float32Array(Math.ceil(buf.length/step));
  let j=0;
  for(let i=0;i<buf.length;i+=step){
    let x=0;for(let c=0;c<buf.numberOfChannels;c++)x+=buf.getChannelData(c)[i]/buf.numberOfChannels;
    out[j++]=x;
  }
  return {data:out.subarray(0,j),step,sr:buf.sampleRate};
}
function quickFFTFeatures(buf){
  const {data,step,sr}=monoSample(buf),effSr=sr/step,n=data.length;
  let rms=0,zcr=0,peak=0,prev=0,low=0,mid=0,high=0,veryHigh=0,flux=0,prevAbs=0,crest=0;
  let lp1=0,lp2=0,lp3=0;
  for(let i=0;i<n;i++){
    const x=data[i],a=Math.abs(x);rms+=x*x;peak=Math.max(peak,a);if(i&&Math.sign(x)!==Math.sign(prev))zcr++;
    lp1+=0.015*(x-lp1);lp2+=0.06*(x-lp2);lp3+=0.22*(x-lp3);
    const b0=lp1,b1=lp2-lp1,b2=lp3-lp2,b3=x-lp3;
    low+=b0*b0;mid+=b1*b1;high+=b2*b2;veryHigh+=b3*b3;
    flux+=Math.max(0,a-prevAbs);prevAbs=a;prev=x;
  }
  rms=Math.sqrt(rms/Math.max(1,n));crest=peak/Math.max(.00001,rms);
  const total=low+mid+high+veryHigh||1;
  return {rms,crest,zcr:zcr/Math.max(1,n),activity:flux/Math.max(1,n),low:low/total,mid:mid/total,high:high/total,veryHigh:veryHigh/total,effSr};
}
function onsetDensity(buf){
  const sr=buf.sampleRate,hop=Math.max(128,Math.floor(sr*.02)),win=Math.max(hop,Math.floor(sr*.04));
  let prev=0,hits=0,frames=0;
  const ch=buf.numberOfChannels;
  for(let p=0;p+win<buf.length;p+=hop){
    let e=0;
    for(let i=0;i<win;i+=4){let x=0;for(let c=0;c<ch;c++)x+=buf.getChannelData(c)[p+i]/ch;e+=x*x;}
    e=Math.sqrt(e/Math.max(1,win/4));const d=Math.max(0,e-prev);if(d>.018&&e>.025)hits++;prev=prev*.65+e*.35;frames++;
  }
  return hits/Math.max(1,buf.duration/60);
}
function instrumentScores(buf){
  const f=quickFFTFeatures(buf),opm=onsetDensity(buf),scores={};
  scores['Drums']=clamp(28+opm*.55+(f.crest-3)*5+f.veryHigh*80,0,98);
  scores['Bass']=clamp(20+f.low*190+(f.mid<.28?8:0),0,98);
  scores['Piano / Keys']=clamp(18+f.mid*80+Math.min(28,opm*.16)+(f.crest>4?12:0)-f.veryHigh*20,0,92);
  scores['Guitar']=clamp(15+f.mid*95+f.high*40+Math.min(24,opm*.18)+(f.zcr>.06?8:0),0,92);
  scores['Synth Lead']=clamp(12+f.high*85+f.veryHigh*55+(f.crest<5?12:0)+(f.zcr>.08?8:0),0,90);
  scores['Synth Pad']=clamp(12+f.mid*55+f.high*40+(opm<18?26:0)+(f.crest<4.5?16:0),0,90);
  scores['Strings']=clamp(12+f.mid*70+f.high*38+(opm<26?18:0)+(f.crest<5?12:0),0,88);
  scores['Acoustic / Organic']=clamp(10+f.mid*60+(f.veryHigh<.2?18:0)+(f.crest>4.5?14:0),0,85);
  return {scores,features:f,onsetsPerMinute:opm};
}
function packTypeFor(name){
  return ({'Drums':'drums','Bass':'bass','Piano / Keys':'keys','Guitar':'guitar','Synth Lead':'synth','Synth Pad':'pad','Strings':'strings'})[name]||null;
}
export function mountInstrumentSummaryPanel(opts={}){
  if(window.__instrumentSummaryMounted)return;window.__instrumentSummaryMounted=true;
  const style=document.createElement('style');
  style.textContent=`.is-wrap{margin:10px 0;border:1px solid #353541;background:#101015;border-radius:10px;color:#eee;font-family:system-ui;overflow:hidden}.is-head{display:flex;gap:8px;align-items:center;padding:9px 11px;border-bottom:1px solid #292933}.is-head b{font-size:12px}.is-sub{font-size:10px;opacity:.6}.is-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:9px 11px}.is-item{background:#ffffff0b;border:1px solid #ffffff12;border-radius:8px;padding:7px}.is-name{font-size:11px;font-weight:700}.is-meta{font-size:10px;opacity:.68;margin-top:2px}.is-summary{padding:0 11px 10px;font-size:11px;line-height:1.45;opacity:.82}.is-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 11px 10px}.is-btn{background:#23232b;color:#eee;border:1px solid #41414c;border-radius:7px;padding:6px 8px;font-size:10px}@media(max-width:700px){.is-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const host=document.querySelector('.audio-player')||document.body,root=document.createElement('section');root.className='is-wrap';
  root.innerHTML=`<div class="is-head"><div><b>Instrument Analysis Summary</b><div class="is-sub">automatic fast scan after audio decoding • probabilities are approximate</div></div></div><div class="is-grid" id="is-grid"><div class="is-meta">Load a song to analyze instruments.</div></div><div class="is-summary" id="is-summary"></div><div class="is-actions"><button class="is-btn" id="is-rescan">Rescan</button><button class="is-btn" id="is-manager">Open Instrument Manager</button></div>`;
  host.appendChild(root);
  const $=s=>root.querySelector(s);
  async function analyze(buf){
    if(!buf)return null;
    $('#is-summary').textContent='Analyzing instrument families…';
    await new Promise(r=>setTimeout(r,0));
    const r=instrumentScores(buf),packs=window.__instrumentManagerAPI?await window.__instrumentManagerAPI.refresh():(window.__instrumentPacks||[]);
    const ranked=Object.entries(r.scores).sort((a,b)=>b[1]-a[1]);
    const shown=ranked.filter(([,v])=>v>=40).slice(0,7);
    $('#is-grid').innerHTML=shown.map(([name,score])=>{
      const type=packTypeFor(name),pack=type?(packs||[]).find(p=>p.type===type):null;
      const band=score>=75?'high':score>=55?'medium':'low';
      return `<div class="is-item"><div class="is-name">${name} • ${score.toFixed(0)}%</div><div class="is-meta">confidence ${band}${type?' • '+(pack?'pack installed: '+(pack.name||pack.id):'pack missing'):''}</div></div>`;
    }).join('')||'<div class="is-meta">No instrument family reached the display threshold.</div>';
    const primary=shown.slice(0,4).map(x=>x[0]);
    $('#is-summary').textContent='Likely arrangement: '+(primary.length?primary.join(', '):'uncertain')+'. Transient density: '+r.onsetsPerMinute.toFixed(0)+' events/min. Re-run after Stem separation for stronger context.';
    window.__instrumentAnalysisLatest={...r,ranked,shown};
    return window.__instrumentAnalysisLatest;
  }
  $('#is-rescan').onclick=async()=>analyze(await opts.getBuffer?.());
  $('#is-manager').onclick=()=>window.__instrumentManagerAPI?.open?.();
  window.__instrumentAnalyzerAPI={analyze,getLatest:()=>window.__instrumentAnalysisLatest||null};
}
