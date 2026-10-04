import { applyHumanizeBoost } from './humanize-boost.js';
import { applyVirtualPerformance } from './virtual-performance.js';
import { analyzeAudioBuffer } from './human-detector-core.js';

export async function runAutoOptimize(source, renderCandidate, onProgress=()=>{}) {
  const variants = [
    {name:'AI Fix + Humanize Medium', build:b=>applyHumanizeBoost(b,'medium',{cleanup:true})},
    {name:'AI Fix + Humanize Strong', build:b=>applyHumanizeBoost(b,'strong',{cleanup:true})},
    {name:'AI Fix + Groove/Drums/Bass 20%', build:b=>applyVirtualPerformance(b,{strength:'medium',mix:20,humanGroove:true,drums:true,bass:true,room:false})},
    {name:'AI Fix + Groove/Drums/Bass 25% + Humanize Medium', build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'medium',mix:25,humanGroove:true,drums:true,bass:true,room:false}),'medium',{cleanup:true})},
    {name:'AI Fix + Drum/Bass Strong 30%', build:b=>applyVirtualPerformance(b,{strength:'strong',mix:30,humanGroove:true,drums:true,bass:true,room:false})},
    {name:'AI Fix + Room Light + Humanize Medium', build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'light',mix:15,humanGroove:true,drums:false,bass:true,room:true}),'medium',{cleanup:true})}
  ];
  const results=[];
  for(let i=0;i<variants.length;i++){
    const v=variants[i];
    onProgress({index:i,total:variants.length,name:v.name,stage:'processing'});
    const prepared=v.build(source);
    onProgress({index:i,total:variants.length,name:v.name,stage:'rendering'});
    const mastered=await renderCandidate(prepared,{aiFix:true,cacheResult:false});
    if(!mastered) continue;
    const report=analyzeAudioBuffer(mastered);
    results.push({name:v.name,buffer:mastered,report});
    onProgress({index:i+1,total:variants.length,name:v.name,stage:'analyzed',score:report.humanPct});
  }
  results.sort((a,b)=>b.report.humanPct-a.report.humanPct || a.report.aiPct-b.report.aiPct);
  return {best:results[0]||null,results};
}
