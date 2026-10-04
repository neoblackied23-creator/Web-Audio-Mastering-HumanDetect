export function analyzeAudioBuffer(buffer) {
  const sr = buffer.sampleRate;
  const maxSec = Math.min(buffer.duration, 180);
  const total = Math.min(buffer.length, Math.floor(maxSec * sr));
  const step = Math.max(1, Math.floor(total / (sr * 90)));
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const mono = [];
  let sum2=0,sum4=0,zc=0,prev=L[0]||0,peak=0,lr=0,ll=0,rr=0;
  const rmsBlocks=[]; let bsum=0,bc=0;
  const bn=Math.max(8,Math.floor(sr*.05/step));
  for(let i=0;i<total;i+=step){
    const x=(L[i]+R[i])*.5; mono.push(x);
    const x2=x*x; sum2+=x2; sum4+=x2*x2; peak=Math.max(peak,Math.abs(x));
    if((x>=0)!=(prev>=0))zc++; prev=x;
    const l=L[i],r=R[i]; lr+=l*r; ll+=l*l; rr+=r*r;
    bsum+=x2; if(++bc>=bn){rmsBlocks.push(Math.sqrt(bsum/bc+1e-18));bsum=0;bc=0;}
  }
  const n=mono.length,rms=Math.sqrt(sum2/n+1e-18),crest=20*Math.log10((peak+1e-12)/(rms+1e-12));
  const kurt=(sum4/n)/Math.pow(sum2/n+1e-18,2),zcr=zc/n,corr=lr/(Math.sqrt(ll*rr)+1e-18);
  const db=rmsBlocks.map(v=>20*Math.log10(v+1e-12)).sort((a,b)=>a-b);
  const dyn=percentile(db,.9)-percentile(db,.1);
  let tv=0; for(let i=1;i<rmsBlocks.length;i++)tv+=Math.abs(rmsBlocks[i]-rmsBlocks[i-1]);
  tv=tv/Math.max(1,rmsBlocks.length-1)/(rms+1e-12);
  const N=2048,frames=64; let centroid=0,flat=0,hf=0,roll=0,flux=0,used=0,prevMag=null,fpRegularity=0,fpProminence=0;
  for(let f=0;f<frames;f++){
    const c=Math.floor((f+.5)/frames*n); if(c-N/2<0||c+N/2>=n)continue;
    const fr=new Float64Array(N); for(let j=0;j<N;j++)fr[j]=mono[c-N/2+j]*(.5-.5*Math.cos(2*Math.PI*j/(N-1)));
    const mags=fft(fr); let sum=0,w=0,ls=0,h=0;
    for(let k=1;k<mags.length;k++){const m=mags[k]+1e-12,hz=k*sr/N;sum+=m;w+=m*hz;ls+=Math.log(m);if(hz>=8000)h+=m;}
    centroid+=w/(sum+1e-18); flat+=Math.exp(ls/(mags.length-1))/(sum/(mags.length-1)+1e-18); hf+=h/(sum+1e-18);
    let a=0,t=sum*.85,ro=0; for(let k=1;k<mags.length;k++){a+=mags[k];if(a>=t){ro=k*sr/N;break;}} roll+=ro;
    if(prevMag){let fl=0,de=0;for(let k=1;k<mags.length;k++){const d=mags[k]-prevMag[k];if(d>0)fl+=d;de+=prevMag[k];}flux+=fl/(de+1e-18);} prevMag=mags;
    const fp=fakeprintFrame(mags,sr,N); fpRegularity+=fp.regularity; fpProminence+=fp.prominence; used++;
  }
  centroid/=used;flat/=used;hf/=used;roll/=used;flux/=Math.max(1,used-1);fpRegularity/=used;fpProminence/=used;
  const dspSignals={compressed:inv(dyn,6,18),transientRegular:inv(tv,.12,.5),smoothFlux:inv(flux,.08,.35),hfTexture:norm(hf,.08,.24),flatness:norm(flat,.08,.35),lowCrest:inv(crest,8,18),stereoExtreme:Math.min(1,Math.abs(corr-.45)/.55),regularKurt:inv(kurt,2.2,5.5)};
  let dsp=.18*dspSignals.compressed+.18*dspSignals.transientRegular+.16*dspSignals.smoothFlux+.13*dspSignals.hfTexture+.10*dspSignals.flatness+.10*dspSignals.lowCrest+.07*dspSignals.stereoExtreme+.08*dspSignals.regularKurt;
  dsp=.15+dsp*.7;
  const fake=clamp(.15+.52*fpRegularity+.33*fpProminence);
  let ai=.58*dsp+.42*fake; ai=.10+.80*ai;
  const aiScore=+(ai*100).toFixed(1),humanScore=+(100-aiScore).toFixed(1);
  const aiPct=Math.round(aiScore),humanPct=Math.round(humanScore);
  return {aiPct,humanPct,aiScore,humanScore,dspPct:+(dsp*100).toFixed(1),fakePct:+(fake*100).toFixed(1),verdict:aiPct>=65?'AI-like characteristics':aiPct<=35?'More human-like / naturally varied':'Mixed / inconclusive',metrics:{dynamicRangeDb:+dyn.toFixed(2),crestFactorDb:+crest.toFixed(2),transientVariation:+tv.toFixed(3),spectralCentroidHz:Math.round(centroid),rolloff85Hz:Math.round(roll),hfEnergyPct:+(hf*100).toFixed(1),spectralFlatness:+flat.toFixed(3),spectralFlux:+flux.toFixed(3),stereoCorrelation:+corr.toFixed(3),fakeprintRegularity:+fpRegularity.toFixed(3),fakeprintProminence:+fpProminence.toFixed(3),zeroCrossingRate:+zcr.toFixed(4)}};
}
export function compareReports(original, mastered){if(!original||!mastered)return null;const oh=original.humanScore??original.humanPct,mh=mastered.humanScore??mastered.humanPct;return {humanDelta:+(mh-oh).toFixed(1),aiDelta:+((mastered.aiScore??mastered.aiPct)-(original.aiScore??original.aiPct)).toFixed(1)};}
function fakeprintFrame(mags,sr,N){let vals=[];for(let k=1;k<mags.length;k++){const hz=k*sr/N;if(hz>=1000&&hz<=8000)vals.push(Math.log(mags[k]+1e-9));}if(vals.length<9)return{regularity:0,prominence:0};const smooth=vals.map((_,i)=>{let s=0,c=0;for(let j=Math.max(0,i-4);j<=Math.min(vals.length-1,i+4);j++){s+=vals[j];c++;}return s/c;});const resid=vals.map((v,i)=>Math.max(0,v-smooth[i]));const mean=resid.reduce((a,b)=>a+b,0)/resid.length;const sd=Math.sqrt(resid.reduce((a,b)=>a+(b-mean)**2,0)/resid.length+1e-12);const peaks=[];for(let i=1;i<resid.length-1;i++)if(resid[i]>resid[i-1]&&resid[i]>resid[i+1]&&resid[i]>mean+1.25*sd)peaks.push(i);if(peaks.length<3)return{regularity:0,prominence:clamp(mean/(sd+1e-9)*.15)};const gaps=[];for(let i=1;i<peaks.length;i++)gaps.push(peaks[i]-peaks[i-1]);const gm=gaps.reduce((a,b)=>a+b,0)/gaps.length,gs=Math.sqrt(gaps.reduce((a,b)=>a+(b-gm)**2,0)/gaps.length+1e-12),cv=gs/(gm+1e-9);return{regularity:clamp(1-cv),prominence:clamp(peaks.reduce((s,i)=>s+resid[i]/(sd+1e-9),0)/peaks.length/5)};}
function norm(x,a,b){return clamp((x-a)/(b-a));} function inv(x,a,b){return 1-norm(x,a,b);} function clamp(x){return Math.max(0,Math.min(1,x));} function percentile(a,p){if(!a.length)return 0;return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))];}
function fft(input){const n=input.length,re=Float64Array.from(input),im=new Float64Array(n);for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*wr-im[i+j+len/2]*wi,vi=re[i+j+len/2]*wi+im[i+j+len/2]*wr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const nw=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nw;}}}const out=new Float64Array(n/2);for(let k=0;k<n/2;k++)out[k]=Math.hypot(re[k],im[k]);return out;}
