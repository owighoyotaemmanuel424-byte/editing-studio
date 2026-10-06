"use client";

import {useMemo,useRef,useState} from "react";
import {useMutation} from "convex/react";
import {api} from "../convex/_generated/api";

type Clip={id:string;start:number;end:number};

const templates=[["breaking","Breaking News"],["report","News Report"],["documentary","Documentary"]];

export default function Editor(){
  const videoRef=useRef<HTMLVideoElement>(null);
  const createProject=useMutation(api.projects.create);
  const updateSpec=useMutation(api.projects.updateSpec);
  const uploadUrl=useMutation(api.files.generateUploadUrl);
  const attach=useMutation(api.files.attachToProject);

  const [projectId,setProjectId]=useState<string|null>(null);
  const [videoUrl,setVideoUrl]=useState<string|null>(null);
  const [headline,setHeadline]=useState("Major Development Reported");
  const [template,setTemplate]=useState("breaking");
  const [duration,setDuration]=useState(45);
  const [time,setTime]=useState(0);
  const [sourceDuration,setSourceDuration]=useState(45);
  const [clips,setClips]=useState<Clip[]>([{id:"clip-1",start:0,end:45}]);
  const [caption,setCaption]=useState("Add your caption");
  const [source,setSource]=useState("Source: Add your source");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);

  const totalDuration=useMemo(()=>clips.reduce((sum,c)=>sum+Math.max(0,c.end-c.start),0),[clips]);
  const activeClip=useMemo(()=>{
    let cursor=0;
    for(const clip of clips){
      const length=clip.end-clip.start;
      if(time<=cursor+length) return {clip,offset:Math.max(0,time-cursor)};
      cursor+=length;
    }
    return clips[clips.length-1]?{clip:clips[clips.length-1],offset:Math.max(0,clips[clips.length-1].end-clips[clips.length-1].start)}:null;
  },[clips,time]);

  const spec=useMemo(()=>({
    format:"9:16",
    duration:Math.round(totalDuration*10)/10,
    headline,
    breaking:template==="breaking",
    sourceLabel:source,
    clips,
    captions:[{start:0,end:totalDuration,text:caption}],
    lowerThird:{enabled:true,text:source}
  }),[totalDuration,headline,template,source,clips,caption]);

  function projectToSource(projectTime:number){
    let cursor=0;
    for(const clip of clips){
      const length=clip.end-clip.start;
      if(projectTime<=cursor+length) return clip.start+Math.max(0,projectTime-cursor);
      cursor+=length;
    }
    const last=clips[clips.length-1];
    return last?.end??0;
  }

  function seek(v:number){
    const next=Math.max(0,Math.min(v,totalDuration));
    setTime(next);
    if(videoRef.current) videoRef.current.currentTime=projectToSource(next);
  }

  function splitAtPlayhead(){
    if(!clips.length) return;
    let cursor=0;
    const index=clips.findIndex(c=>{
      const length=c.end-c.start;
      const hit=time>=cursor && time<=cursor+length;
      if(!hit) cursor+=length;
      return hit;
    });
    if(index<0) return;
    const clip=clips[index];
    const local=time-cursor;
    const cut=Math.max(clip.start+0.1,Math.min(clip.end-0.1,clip.start+local));
    if(cut<=clip.start||cut>=clip.end) return;
    const next=[...clips.slice(0,index),{id:clip.id+"-a",start:clip.start,end:cut},{id:clip.id+"-b",start:cut,end:clip.end},...clips.slice(index+1)];
    setClips(next);
  }

  function deleteClip(index:number){
    if(clips.length===1) return;
    const next=clips.filter((_,i)=>i!==index);
    setClips(next);
    setTime(Math.min(time,next.reduce((s,c)=>s+c.end-c.start,0)));
  }

  function moveClip(index:number,direction:-1|1){
    const target=index+direction;
    if(target<0||target>=clips.length) return;
    const next=[...clips];
    [next[index],next[target]]=[next[target],next[index]];
    setClips(next);
  }

  async function saveSpec(){
    if(!projectId) return;
    setSaved(false);
    await updateSpec({id:projectId,editSpec:JSON.stringify(spec)});
    setSaved(true);
  }

  async function upload(file:File){
    setBusy(true);
    try{
      const url=await uploadUrl();
      const r=await fetch(url,{method:"POST",headers:{"Content-Type":file.type},body:file});
      if(!r.ok) throw new Error("Upload failed");
      const data=await r.json();
      const id=projectId??await createProject({name:file.name.replace(/\.[^.]+$/,""),editSpec:JSON.stringify(spec)});
      setProjectId(id);
      const attached=await attach({projectId:id,storageId:data.storageId,filename:file.name,mimeType:file.type});
      setVideoUrl(attached.url);
    }finally{setBusy(false)}
  }

  return <main className="min-h-screen bg-[var(--bg)]">
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div><div className="text-sm font-bold">NewsCut</div><div className="text-[11px] text-[var(--muted)]">Mobile news video editor</div></div>
        <div className="flex items-center gap-2">
          {saved&&<span className="hidden text-[11px] text-[var(--muted)] sm:inline">Saved</span>}
          <button onClick={saveSpec} disabled={!projectId} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Save edit</button>
          <button onClick={()=>createProject({name:headline||"Untitled News Edit",editSpec:JSON.stringify(spec)}).then(setProjectId)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-xs font-bold">New</button>
        </div>
      </div>
    </header>

    <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-[var(--line)] bg-black p-3">
          <div className="relative aspect-[9/16] w-full max-w-[330px] overflow-hidden rounded-2xl bg-[#15171b]">
            {videoUrl?
              <video ref={videoRef} src={videoUrl} controls playsInline
                onLoadedMetadata={e=>{
                  const d=Math.max(1,e.currentTarget.duration);
                  setSourceDuration(d);
                  setClips(prev=>prev.length===1&&prev[0].start===0?[{...prev[0],end:d}]:prev);
                  setDuration(Math.min(60,Math.round(d)));
                }}
                onTimeUpdate={e=>{
                  if(!activeClip) return;
                  const sourceTime=e.currentTarget.currentTime;
                  const projectTime=clips.reduce((cursor,c)=>{
                    if(c.id===activeClip.clip.id) return cursor+Math.max(0,sourceTime-c.start);
                    return cursor+(c.end-c.start);
                  },0);
                  if(sourceTime>=activeClip.clip.end-0.03){
                    const next=projectTime+0.05;
                    if(next<totalDuration) seek(next);
                    else e.currentTarget.pause();
                  } else setTime(Math.min(projectTime,totalDuration));
                }}
                className="h-full w-full object-cover"/>
              :
              <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="text-4xl">＋</span><span className="text-sm font-semibold">Add your news video</span><span className="text-xs text-[var(--muted)]">MP4, MOV or WebM</span>
                <input className="hidden" type="file" accept="video/*" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/>
              </label>
            }
            <div className="pointer-events-none absolute left-3 right-3 top-3">
              <div className="inline-flex rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-black tracking-wider">{template==="breaking"?"BREAKING":"NEWS"}</div>
              <div className="mt-2 max-w-[90%] text-lg font-black leading-tight drop-shadow-lg">{headline}</div>
            </div>
            <div className="pointer-events-none absolute bottom-16 left-3 right-3 rounded-lg bg-black/75 px-3 py-2 text-[11px] font-semibold">{caption}</div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-black/70 px-3 py-2 text-[9px]">{source}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Timeline</div><div className="text-[11px] text-[var(--muted)]">{time.toFixed(1)}s / {totalDuration.toFixed(1)}s</div></div><button onClick={splitAtPlayhead} disabled={!videoUrl||totalDuration<0.2} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold disabled:opacity-40">Split at playhead</button></div>
          <input className="w-full" type="range" min="0" max={Math.max(totalDuration,1)} step=".1" value={Math.min(time,totalDuration)} onChange={e=>seek(Number(e.target.value))}/>
          <div className="mt-3 grid gap-2">
            {clips.map((clip,index)=>{
              const length=clip.end-clip.start;
              return <div key={clip.id} className={"rounded-xl border p-3 "+(activeClip?.clip.id===clip.id?"border-white bg-[var(--panel2)]":"border-[var(--line)] bg-[var(--panel2)]")}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={()=>seek(clips.slice(0,index).reduce((s,c)=>s+c.end-c.start,0))} className="min-w-0 flex-1 text-left"><div className="text-xs font-bold">Clip {index+1}</div><div className="text-[10px] text-[var(--muted)]">{clip.start.toFixed(1)}s → {clip.end.toFixed(1)}s • {length.toFixed(1)}s</div></button>
                  <div className="flex gap-1"><button onClick={()=>moveClip(index,-1)} disabled={index===0} className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] disabled:opacity-30">←</button><button onClick={()=>moveClip(index,1)} disabled={index===clips.length-1} className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] disabled:opacity-30">→</button><button onClick={()=>deleteClip(index)} disabled={clips.length===1} className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] disabled:opacity-30">×</button></div>
                </div>
              </div>
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">{[30,45,60].map(s=><button key={s} onClick={()=>setDuration(s)} className={"rounded-lg border px-3 py-2 text-xs "+(duration===s?"border-white bg-white text-black":"border-[var(--line)] bg-[var(--panel2)]")}>{s}s target</button>)}</div>
          <div className="mt-2 text-[10px] text-[var(--muted)]">Source: {sourceDuration.toFixed(1)}s • {clips.length} clip{clips.length===1?"":"s"}</div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="mb-3 text-sm font-bold">News template</div>{templates.map(([id,name])=><button key={id} onClick={()=>setTemplate(id)} className={"mb-2 w-full rounded-xl border p-3 text-left "+(template===id?"border-white bg-white text-black":"border-[var(--line)] bg-[var(--panel2)]")}><div className="text-sm font-bold">{name}</div><div className="mt-1 text-[11px] opacity-70">9:16 vertical • manual editing</div></button>)}</div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="mb-3 text-sm font-bold">Headline</div><input value={headline} onChange={e=>setHeadline(e.target.value)} maxLength={90} className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/><div className="mt-2 text-[11px] text-[var(--muted)]">{headline.length}/90</div></div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="mb-3 text-sm font-bold">Caption</div><textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={180} rows={3} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/><div className="mt-2 text-[11px] text-[var(--muted)]">{caption.length}/180</div></div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="mb-3 text-sm font-bold">Source / lower third</div><input value={source} onChange={e=>setSource(e.target.value)} maxLength={80} className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/></div>
        <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black">{busy?"Uploading…":"Replace / upload video"}<input className="hidden" type="file" accept="video/*" disabled={busy} onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-xs leading-5 text-[var(--muted)]"><div className="mb-1 font-bold text-white">Editor status</div>Multi-clip timeline, split, reorder, delete, 9:16 preview, headlines, captions, lower-thirds and persistent Convex edit specs are active. Audio tracks, transitions and MP4 rendering are next.</div>
      </aside>
    </section>
  </main>;
}
