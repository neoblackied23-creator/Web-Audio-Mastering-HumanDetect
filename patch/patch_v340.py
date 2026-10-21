from pathlib import Path
import json

root=Path('.')

# Preload metadata IPC
preload=root/'electron'/'preload.js'
pt=preload.read_text(encoding='utf-8')
if 'audioMetadataRead:' not in pt:
    anchor='\n});'
    i=pt.rfind(anchor)
    if i<0: raise SystemExit('preload close anchor not found')
    before=pt[:i].rstrip()
    if not before.endswith(','): before += ','
    before += """
  audioMetadataRead: (filePath) => ipcRenderer.invoke('audio-metadata-read', filePath),
  audioMetadataWrite: (filePath, metadata, overwrite=false) => ipcRenderer.invoke('audio-metadata-write', { filePath, metadata, overwrite })
"""
    pt=before+pt[i:]
preload.write_text(pt,encoding='utf-8')

# Main-process metadata backend: MP3 ID3v2.3 + WAV RIFF INFO
main=root/'electron'/'main.js'
mt=main.read_text(encoding='utf-8')
if 'HUMANDETECT_METADATA_EDITOR_V340' not in mt:
    mt += r'''

// HUMANDETECT_METADATA_EDITOR_V340
function hdSynchsafeDecode(b,o=0){return ((b[o]&0x7f)<<21)|((b[o+1]&0x7f)<<14)|((b[o+2]&0x7f)<<7)|(b[o+3]&0x7f);}
function hdSynchsafeEncode(n){return Buffer.from([(n>>21)&0x7f,(n>>14)&0x7f,(n>>7)&0x7f,n&0x7f]);}
function hdDecodeText(buf){
  if(!buf||!buf.length)return '';
  const enc=buf[0],d=buf.subarray(1);
  if(enc===0)return d.toString('latin1').replace(/\0+$/,'');
  if(enc===3)return d.toString('utf8').replace(/\0+$/,'');
  if(enc===1){
    if(d.length>=2&&d[0]===0xff&&d[1]===0xfe)return d.subarray(2).toString('utf16le').replace(/\0+$/,'');
    if(d.length>=2&&d[0]===0xfe&&d[1]===0xff){
      const x=Buffer.from(d.subarray(2));for(let i=0;i+1<x.length;i+=2){const a=x[i];x[i]=x[i+1];x[i+1]=a;}return x.toString('utf16le').replace(/\0+$/,'');
    }
    return d.toString('utf16le').replace(/\0+$/,'');
  }
  return d.toString('utf8').replace(/\0+$/,'');
}
function hdMp3Read(file){
  const b=fs.readFileSync(file),m={};
  if(b.length<10||b.toString('ascii',0,3)!=='ID3')return m;
  const ver=b[3],tagSize=hdSynchsafeDecode(b,6),end=Math.min(b.length,10+tagSize);let p=10;
  const map={TIT2:'title',TPE1:'artist',TALB:'album',TYER:'year',TDRC:'year',TCON:'genre',TRCK:'track',TCOM:'composer',TCOP:'copyright'};
  while(p+10<=end){
    const id=b.toString('ascii',p,p+4);if(!/^[A-Z0-9]{4}$/.test(id))break;
    const sz=ver===4?hdSynchsafeDecode(b,p+4):b.readUInt32BE(p+4);if(!sz||p+10+sz>end)break;
    const body=b.subarray(p+10,p+10+sz);
    if(map[id])m[map[id]]=hdDecodeText(body);
    else if(id==='COMM'&&body.length>4){
      const enc=body[0],rest=body.subarray(4);
      let text='';
      if(enc===3){const z=rest.indexOf(0);text=(z>=0?rest.subarray(z+1):rest).toString('utf8').replace(/\0+$/,'');}
      else text=hdDecodeText(Buffer.concat([Buffer.from([enc]),rest]));
      m.comment=text;
    }
    p+=10+sz;
  }
  return m;
}
function hdTextFrame(id,val){
  if(val===undefined||val===null||String(val)==='')return null;
  const body=Buffer.concat([Buffer.from([3]),Buffer.from(String(val),'utf8')]),h=Buffer.alloc(10);
  h.write(id,0,4,'ascii');h.writeUInt32BE(body.length,4);return Buffer.concat([h,body]);
}
function hdCommentFrame(val){
  if(!val)return null;const body=Buffer.concat([Buffer.from([3]),Buffer.from('eng','ascii'),Buffer.from([0]),Buffer.from(String(val),'utf8')]),h=Buffer.alloc(10);
  h.write('COMM',0,4,'ascii');h.writeUInt32BE(body.length,4);return Buffer.concat([h,body]);
}
function hdMp3Write(src,dst,m){
  const b=fs.readFileSync(src);let offset=0;
  if(b.length>=10&&b.toString('ascii',0,3)==='ID3')offset=10+hdSynchsafeDecode(b,6);
  const frames=[
    hdTextFrame('TIT2',m.title),hdTextFrame('TPE1',m.artist),hdTextFrame('TALB',m.album),hdTextFrame('TYER',m.year),
    hdTextFrame('TCON',m.genre),hdTextFrame('TRCK',m.track),hdTextFrame('TCOM',m.composer),hdTextFrame('TCOP',m.copyright),hdCommentFrame(m.comment)
  ].filter(Boolean);
  const payload=Buffer.concat(frames),head=Buffer.alloc(10);head.write('ID3',0,3,'ascii');head[3]=3;head[4]=0;head[5]=0;hdSynchsafeEncode(payload.length).copy(head,6);
  const out=Buffer.concat([head,payload,b.subarray(offset)]);
  fs.writeFileSync(dst,out);
}
function hdWavChunks(b){
  if(b.length<12||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw new Error('Invalid WAV');
  const out=[];let p=12;
  while(p+8<=b.length){
    const id=b.toString('ascii',p,p+4),sz=b.readUInt32LE(p+4),end=Math.min(b.length,p+8+sz),pad=sz%2;
    out.push({id,start:p,size:sz,end:Math.min(b.length,end+pad),data:b.subarray(p+8,end)});p=end+pad;
  }
  return out;
}
function hdWavRead(file){
  const b=fs.readFileSync(file),m={},map={INAM:'title',IART:'artist',IPRD:'album',ICRD:'year',IGNR:'genre',ITRK:'track',IENG:'composer',ICOP:'copyright',ICMT:'comment'};
  for(const c of hdWavChunks(b)){
    if(c.id!=='LIST'||c.data.length<4||c.data.toString('ascii',0,4)!=='INFO')continue;
    let p=4;
    while(p+8<=c.data.length){
      const id=c.data.toString('ascii',p,p+4),sz=c.data.readUInt32LE(p+4),e=Math.min(c.data.length,p+8+sz);
      if(map[id])m[map[id]]=c.data.subarray(p+8,e).toString('utf8').replace(/\0+$/,'');
      p=e+(sz%2);
    }
  }
  return m;
}
function hdInfoSub(id,val){
  if(val===undefined||val===null||String(val)==='')return null;
  let d=Buffer.from(String(val)+'\0','utf8');const h=Buffer.alloc(8);h.write(id,0,4,'ascii');h.writeUInt32LE(d.length,4);
  if(d.length%2)d=Buffer.concat([d,Buffer.from([0])]);return Buffer.concat([h,d]);
}
function hdWavWrite(src,dst,m){
  const b=fs.readFileSync(src),kept=[];
  for(const c of hdWavChunks(b)){
    if(c.id==='LIST'&&c.data.length>=4&&c.data.toString('ascii',0,4)==='INFO')continue;
    kept.push(b.subarray(c.start,c.end));
  }
  const map=[['INAM',m.title],['IART',m.artist],['IPRD',m.album],['ICRD',m.year],['IGNR',m.genre],['ITRK',m.track],['IENG',m.composer],['ICOP',m.copyright],['ICMT',m.comment]];
  const subs=map.map(([id,v])=>hdInfoSub(id,v)).filter(Boolean);
  if(subs.length){
    const data=Buffer.concat([Buffer.from('INFO','ascii'),...subs]),h=Buffer.alloc(8);h.write('LIST',0,4,'ascii');h.writeUInt32LE(data.length,4);
    let chunk=Buffer.concat([h,data]);if(data.length%2)chunk=Buffer.concat([chunk,Buffer.from([0])]);kept.push(chunk);
  }
  const head=Buffer.alloc(12);head.write('RIFF',0,4,'ascii');head.write('WAVE',8,4,'ascii');
  let out=Buffer.concat([head,...kept]);out.writeUInt32LE(out.length-8,4);fs.writeFileSync(dst,out);
}
function hdMetadataCopyPath(src){
  const ext=path.extname(src),base=src.slice(0,-ext.length);let out=base+'_metadata'+ext,n=2;
  while(fs.existsSync(out)){out=base+'_metadata_'+n+ext;n++;}return out;
}
ipcMain.handle('audio-metadata-read',async(e,filePath)=>{
  try{
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Source file not found'};
    const ext=path.extname(filePath).toLowerCase();let metadata;
    if(ext==='.mp3')metadata=hdMp3Read(filePath);
    else if(ext==='.wav')metadata=hdWavRead(filePath);
    else return {success:false,error:'Metadata editor currently supports MP3 and WAV.'};
    return {success:true,path:filePath,metadata};
  }catch(err){return {success:false,error:err.message};}
});
ipcMain.handle('audio-metadata-write',async(e,payload)=>{
  try{
    const filePath=payload?.filePath,metadata=payload?.metadata||{},overwrite=!!payload?.overwrite;
    if(!filePath||!fs.existsSync(filePath))return {success:false,error:'Source file not found'};
    const ext=path.extname(filePath).toLowerCase();if(!['.mp3','.wav'].includes(ext))return {success:false,error:'Metadata editor currently supports MP3 and WAV.'};
    const dst=overwrite?filePath:hdMetadataCopyPath(filePath),tmp=overwrite?filePath+'.hdmeta.tmp':dst;
    if(ext==='.mp3')hdMp3Write(filePath,tmp,metadata);else hdWavWrite(filePath,tmp,metadata);
    if(overwrite){fs.renameSync(tmp,filePath);}
    return {success:true,path:dst,overwrite};
  }catch(err){try{if(payload?.filePath&&fs.existsSync(payload.filePath+'.hdmeta.tmp'))fs.rmSync(payload.filePath+'.hdmeta.tmp',{force:true});}catch(_){}return {success:false,error:err.message};}
});
'''
main.write_text(mt,encoding='utf-8')

# Adapt Editor needs the actual source path for metadata operations.
app=root/'web'/'app.js'
at=app.read_text(encoding='utf-8')
needle="""    mountAdaptEditor({
      getSource: async () =>"""
if needle in at and "getOriginalPath: async () => fileState.selectedFilePath || null" not in at:
    at=at.replace(needle,"""    mountAdaptEditor({
      getOriginalPath: async () => fileState.selectedFilePath || null,
      getSource: async () =>""")
app.write_text(at,encoding='utf-8')

pkg=root/'package.json'
j=json.loads(pkg.read_text(encoding='utf-8'))
j['version']='3.4.0'
pkg.write_text(json.dumps(j,indent=2)+'\n',encoding='utf-8')
print('HumanDetect v3.4.0 Metadata Editor backend applied')
