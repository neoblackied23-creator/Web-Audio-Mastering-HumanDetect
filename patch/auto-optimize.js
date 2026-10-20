import { applyHumanizeBoost } from './humanize-boost.js';
import { applyVirtualPerformance } from './virtual-performance.js';
import { analyzeAudioBuffer } from './human-detector-core.js';

export async function runAutoOptimize(source,renderCandidate,onProgress=()=>{}){
  const variants=[
    {name:'Naturalizer Medium',build:b=>applyHumanizeBoost(b,'medium',{cleanup:true})},
    {name:'Naturalizer Strong',build:b=>applyHumanizeBoost(b,'strong',{cleanup:true})},
    {name:'Naturalizer Extreme',build:b=>applyHumanizeBoost(b,'extreme',{cleanup:true})},
    {name:'Groove 25 + Naturalizer Medium',build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'medium',mix:25,humanGroove:true,drums:true,bass:true,room:false}),'medium',{cleanup:true})},
    {name:'Groove 35 + Naturalizer Strong',build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'strong',mix:35,humanGroove:true,drums:true,bass:true,room:false}),'strong',{cleanup:true})},
    {name:'Groove 42 + Naturalizer Extreme',build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'strong',mix:42,humanGroove:true,drums:true,bass:true,room:true}),'extreme',{cleanup:true})},
    {name:'Transient Natural 30',build:b=>applyVirtualPerformance(b,{strength:'medium',mix:30,humanGroove:true,drums:true,bass:false,room:true})},
    {name:'Bass/Drum Reamp 40',build:b=>applyVirtualPerformance(b,{strength:'strong',mix:40,humanGroove:true,drums:true,bass:true,room:false})},
    {name:'Room + Strong Naturalizer',build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'medium',mix:22,humanGroove:true,drums:false,bass:true,room:true}),'strong',{cleanup:true})},
    {name:'Double Naturalizer',build:b=>applyHumanizeBoost(applyHumanizeBoost(b,'medium',{cleanup:true}),'strong',{cleanup:false})},
    {name:'Groove 30 + Double Naturalizer',build:b=>applyHumanizeBoost(applyHumanizeBoost(applyVirtualPerformance(b,{strength:'strong',mix:30,humanGroove:true,drums:true,bass:true,room:true}),'medium',{cleanup:true}),'strong',{cleanup:false})},
    {name:'Performance 45 + Naturalizer Strong',build:b=>applyHumanizeBoost(applyVirtualPerformance(b,{strength:'strong',mix:45,humanGroove:true,drums:true,bass:true,room:true}),'strong',{cleanup:true})}
  ];
  const results=[];
  for(let i=0;i<variants.length;i++){
    const v=variants[i];
    onProgress({index:i,total:variants.length,name:v.name,stage:'processing'});
    const prepared=v.build(source);
    onProgress({index:i,total:variants.length,name:v.name,stage:'rendering'});
    const mastered=await renderCandidate(prepared,{aiFix:true,cacheResult:false});
    if(!mastered)continue;
    const report=analyzeAudioBuffer(mastered),score=Number(report.humanScore??report.humanPct??0);
    results.push({name:v.name,buffer:mastered,report,score});
    onProgress({index:i+1,total:variants.length,name:v.name,stage:'analyzed',score});
    if(score>=80)break;
  }
  results.sort((a,b)=>(b.score-a.score)||((a.report.aiScore??a.report.aiPct)-(b.report.aiScore??b.report.aiPct)));
  return {best:results[0]||null,results,targetReached:(results[0]?.score||0)>=80};
}
