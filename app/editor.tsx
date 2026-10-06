"use client";

import {useMemo,useRef,useState} from "react";
import {useMutation} from "convex/react";
import {api} from "../convex/_generated/api";

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
  const [trimStart,setTrimStart]=useState(0);
  const [trimEnd,setTrimEnd]=useState(45);
  const [caption,setCaption]=useState("Add your caption");
  const [source,setSource]=useState("Source: Add your source");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);

  const safeEnd=Math.max(trimStart,Math.min(trimEnd,duration));
  const spec=useMemo(()=>({
    format:"9:16",
    duration,
    headline,
    breaking:template==="breaking",
    sourceLabel:source,
    clips:[{id:"main",start:trimStart,end:safeEnd}],
    captions:[{start:trimStart,end:safeEnd,text:caption}],
    lowerThird:{enabled:true,text:source}
  }),[duration,headline,template,source,trimStart,safeEnd,caption]);

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
      setTrimStart(0);
      setTrimEnd(Math.min(45,60));
    }finally{
      setBusy(false);
    }
  }

  function seek(v:number){
    setTime(v);
    if(videoRef.current) videoRef.current.currentTime=v;
  }

  function setIn(v:number){
    const next=Math.max(0,Math.min(v,safeEnd));
    setTrimStart(next);
    if(time<next) seek(next);
  }

  function setOut(v:number){
    const next=Math.max(trimStart,Math.min(v,duration));
    setTrimEnd(next);
    if(time>next) seek(next);
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
                onLoadedMetadata={e=>setDuration(Math.round(e.currentTarget.duration))}
                onTimeUpdate={e=>{
                  const current=e.currentTarget.currentTime;
                  if(current<trimStart) e.currentTarget.currentTime=trimStart;
                  if(current>safeEnd) e.currentTarget.pause();
                  setTime(Math.min(current,safeEnd));
                }}
                className="h-full w-full object-cover"/>
              :
              <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="text-4xl">＋</span><span className="text-sm font-semibold">Add your news video</span>
                <span className="text-xs text-[var(--muted)]">MP4, MOV or WebM</span>
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
          <div className="mb-3 flex justify-between text-xs"><span className="font-bold uppercase tracking-wider text-[var(--muted)]">Timeline</span><span className="text-[var(--muted)]">{time.toFixed(1)}s / {duration}s</span></div>
          <input className="w-full" type="range" min="0" max={Math.max(duration,1)} step=".1" value={Math.min(time,duration)} onChange={e=>seek(Number(e.target.value))}/>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-3"><div className="text-[10px] font-bold uppercase text-[var(--muted)]">In</div><input className="mt-1 w-full bg-transparent text-sm outline-none" type="number" min="0" max={safeEnd} step=".1" value={trimStart} onChange={e=>setIn(Number(e.target.value))}/></label>
            <label className="rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-3"><div className="text-[10px] font-bold uppercase text-[var(--muted)]">Out</div><input className="mt-1 w-full bg-transparent text-sm outline-none" type="number" min={trimStart} max={duration} step=".1" value={safeEnd} onChange={e=>setOut(Number(e.target.value))}/></label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">{[30,45,60].map(s=><button key={s} onClick={()=>{setDuration(s);setTrimEnd(Math.min(s,safeEnd));}} className={"rounded-lg border px-3 py-2 text-xs "+(duration===s?"border-white bg-white text-black":"border-[var(--line)] bg-[var(--panel2)]")}>{s}s</button>)}</div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="mb-3 text-sm font-bold">News template</div>{templates.map(([id,name])=><button key={id} onClick={()=>setTemplate(id)} className={"mb-2 w-full rounded-xl border p-3 text-left "+(template===id?"border-white bg-white text-black":"border-[var(--line)] bg-[var(--panel2)]")}><div className="text-sm font-bold">{name}</div><div className="mt-1 text-[11px] opacity-70">9:16 vertical • manual editing</div></button>)}</div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 text-sm font-bold">Headline</div>
          <input value={headline} onChange={e=>setHeadline(e.target.value)} maxLength={90} className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/>
          <div className="mt-2 text-[11px] text-[var(--muted)]">{headline.length}/90</div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 text-sm font-bold">Caption</div>
          <textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={180} rows={3} className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/>
          <div className="mt-2 text-[11px] text-[var(--muted)]">{caption.length}/180</div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="mb-3 text-sm font-bold">Source / lower third</div>
          <input value={source} onChange={e=>setSource(e.target.value)} maxLength={80} className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-3 text-sm outline-none focus:border-white"/>
        </div>

        <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black">{busy?"Uploading…":"Replace / upload video"}<input className="hidden" type="file" accept="video/*" disabled={busy} onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-xs leading-5 text-[var(--muted)]">
          <div className="mb-1 font-bold text-white">Editor status</div>
          9:16 preview, Convex storage, templates, headline, captions, source lower-third, editable IN/OUT points and persistent edit specs are active. MP4 rendering, audio tracks and multi-clip editing are next.
        </div>
      </aside>
    </section>
  </main>;
}
