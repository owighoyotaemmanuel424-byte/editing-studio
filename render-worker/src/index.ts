import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

type Clip={start:number;end:number;transition?:"cut"|"fade"|"slide"};
type Caption={start:number;end:number;text:string};
type EditSpec={
  duration?:number;
  headline?:string;
  breaking?:boolean;
  sourceLabel?:string;
  clips?:Clip[];
  captions?:Caption[];
  audio?:{
    voiceover?:{enabled:boolean;volume:number}|null;
    music?:{enabled:boolean;volume:number}|null;
  };
};
type Job={
  renderId:string;
  editSpec:string;
  sourceVideoUrl:string;
  voiceoverUrl:string|null;
  musicUrl:string|null;
};
type ClaimResponse={job:Job|null;uploadUrl?:string};

const site=process.env.CONVEX_SITE_URL?.replace(/\/$/,"");
const secret=process.env.RENDER_WORKER_SECRET;
const pollMs=Number(process.env.POLL_INTERVAL_MS??5000);
if(!site||!secret) throw new Error("CONVEX_SITE_URL and RENDER_WORKER_SECRET are required");

async function call<T>(route:string,body?:unknown):Promise<T>{
  const response=await fetch(site+route,{
    method:"POST",
    headers:{"authorization":"Bearer "+secret,"content-type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(!response.ok) throw new Error("Convex "+route+" failed: "+response.status+" "+await response.text());
  return await response.json() as T;
}

async function download(url:string,file:string){
  const response=await fetch(url);
  if(!response.ok||!response.body) throw new Error("Media download failed: "+response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(file, bytes);
}

async function writeText(dir:string,name:string,value:string){
  await fs.writeFile(path.join(dir,name),value||" ");
}

function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n));}

async function render(job:Job,uploadUrl:string){
  const spec=JSON.parse(job.editSpec) as EditSpec;
  const clips=(spec.clips??[]).filter(c=>c.end>c.start);
  if(!clips.length) throw new Error("No clips found in edit spec");

  const dir=await fs.mkdtemp(path.join(tmpdir(),"newscut-"));
  const source=path.join(dir,"source");
  const voice=path.join(dir,"voice");
  const music=path.join(dir,"music");
  const output=path.join(dir,"output.mp4");

  try{
    await download(job.sourceVideoUrl,source);
    const hasVoice=Boolean(job.voiceoverUrl&&spec.audio?.voiceover?.enabled);
    const hasMusic=Boolean(job.musicUrl&&spec.audio?.music?.enabled);
    if(hasVoice) await download(job.voiceoverUrl!,voice);
    if(hasMusic) await download(job.musicUrl!,music);

    await writeText(dir,"headline.txt",spec.headline??"");
    await writeText(dir,"source.txt",spec.sourceLabel??"");
    await writeText(dir,"breaking.txt",spec.breaking?"BREAKING":"NEWS");

    const graph:string[]=[];
    clips.forEach((clip,i)=>{
      const duration=Math.max(.05,clip.end-clip.start);
      const fade=clip.transition==="fade";
      const fadeFilters=fade
        ? ",fade=t=in:st=0:d=0.2,fade=t=out:st="+Math.max(0,duration-0.2)+":d=0.2"
        : "";
      graph.push("[0:v]trim=start="+Math.max(0,clip.start)+":end="+Math.max(clip.start+.05,clip.end)+",setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"+fadeFilters+"[c"+i+"]");
    });
    graph.push(clips.map((_,i)=>"[c"+i+"]").join("")+"concat=n="+clips.length+":v=1:a=0[base]");
    graph.push("[base]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile="+path.join(dir,"breaking.txt")+":fontsize=48:fontcolor=white:box=1:boxcolor=red@0.9:x=48:y=48[v1]");
    graph.push("[v1]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile="+path.join(dir,"headline.txt")+":fontsize=64:fontcolor=white:box=1:boxcolor=black@0.58:boxborderw=22:x=48:y=135[v2]");
    graph.push("[v2]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile="+path.join(dir,"source.txt")+":fontsize=34:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=14:x=48:y=h-130[v3]");

    let current="[v3]";
    const captions=spec.captions??[];
    captions.forEach((caption,i)=>{
      const file=path.join(dir,"caption-"+i+".txt");
      graph.push("dummy");
    });
    for(let i=0;i<captions.length;i++){
      const caption=captions[i];
      const file=path.join(dir,"caption-"+i+".txt");
      await fs.writeFile(file,caption.text||" ");
      const next="[vc"+i+"]";
      graph.push(current+"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile="+file+":fontsize=44:fontcolor=white:box=1:boxcolor=black@0.78:boxborderw=18:x=(w-text_w)/2:y=h-360:enable='between(t,"+clamp(caption.start,0,9999)+","+Math.max(caption.end,caption.start+.1)+")'"+next);
      current=next;
    }
    graph.push(current+"format=yuv420p[vout]");

    const args=["-y","-hide_banner","-loglevel","error","-i",source];
    if(hasVoice) args.push("-i",voice);
    if(hasMusic) args.push("-i",music);

    const audioLabels:string[]=[];
    if(hasVoice){
      graph.push("[1:a]volume="+clamp(spec.audio?.voiceover?.volume??1,0,2)+"[voice]");
      audioLabels.push("[voice]");
    }
    if(hasMusic){
      const musicIndex=hasVoice?2:1;
      graph.push("["+musicIndex+":a]volume="+clamp(spec.audio?.music?.volume??.25,0,2)+"[music]");
      audioLabels.push("[music]");
    }
    if(audioLabels.length===1) graph.push(audioLabels[0]+"anull[aout]");
    if(audioLabels.length===2) graph.push(audioLabels.join("")+"amix=inputs=2:duration=longest:dropout_transition=2[aout]");

    args.push("-filter_complex",graph.filter(x=>x!=="dummy").join(";"),"-map","[vout]");
    if(audioLabels.length) args.push("-map","[aout]");
    else args.push("-an");

    const duration=clips.reduce((sum,c)=>sum+Math.max(0,c.end-c.start),0);
    args.push("-t",String(Math.max(.1,duration)),"-c:v","libx264","-preset",process.env.FFMPEG_PRESET??"veryfast","-crf",process.env.FFMPEG_CRF??"21","-r","30","-pix_fmt","yuv420p","-movflags","+faststart");
    if(audioLabels.length) args.push("-c:a","aac","-b:a","128k");
    args.push("-progress","pipe:2",output);

    await runFfmpeg(args,duration,job.renderId);
    const file=await fs.readFile(output);
    const uploaded=await fetch(uploadUrl,{method:"POST",headers:{"content-type":"video/mp4"},body:file});
    if(!uploaded.ok) throw new Error("Output upload failed: "+uploaded.status+" "+await uploaded.text());
    const data=await uploaded.json() as {storageId:string};
    await call("/render/complete",{renderId:job.renderId,outputStorageId:data.storageId});
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

async function runFfmpeg(args:string[],duration:number,renderId:string){
  const executable=process.env.FFMPEG_PATH??"ffmpeg";
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(executable,args,{stdio:["ignore","ignore","pipe"]});
    let buffer="";
    let stderr="";
    child.stderr.on("data",chunk=>{
      const text=chunk.toString();
      stderr=(stderr+text).slice(-8000);
      buffer+=text;
      const lines=buffer.split(/\r?\n/);
      buffer=lines.pop()??"";
      for(const line of lines){
        const match=line.match(/^out_time_ms=(\d+)/);
        if(match){
          const seconds=Number(match[1])/1000000;
          const progress=Math.min(99,Math.round((seconds/Math.max(duration,.1))*90)+10);
          void call("/render/progress",{renderId,progress}).catch(()=>{});
        }
      }
    });
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error("FFmpeg exited with code "+code+": "+stderr)));
  });
}

async function loop(){
  console.log("NewsCut render worker polling "+site);
  for(;;){
    try{
      const response=await call<ClaimResponse>("/render/claim");
      if(!response.job||!response.uploadUrl){
        await new Promise(r=>setTimeout(r,pollMs));
        continue;
      }
      console.log("Rendering "+response.job.renderId);
      try{
        await render(response.job,response.uploadUrl);
        console.log("Completed "+response.job.renderId);
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        console.error("Render failed "+response.job.renderId+": "+message);
        await call("/render/fail",{renderId:response.job.renderId,error:message}).catch(()=>{});
      }
    }catch(error){
      console.error("Worker polling error:",error);
      await new Promise(r=>setTimeout(r,pollMs));
    }
  }
}

void loop();
