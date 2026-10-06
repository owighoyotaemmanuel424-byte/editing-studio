import {v} from "convex/values";
import {mutation,query,internalMutation} from "./_generated/server";

const status=v.union(v.literal("queued"),v.literal("processing"),v.literal("ready"),v.literal("failed"));

export const create=mutation({
  args:{projectId:v.id("projects"),editSpec:v.string()},
  returns:v.id("renders"),
  handler:async(ctx,args)=>{
    const existing=await ctx.db.query("renders").withIndex("by_project",q=>q.eq("projectId",args.projectId)).take(20);
    if(existing.some(render=>render.status==="queued"||render.status==="processing")) throw new Error("A render is already in progress");
    const id=await ctx.db.insert("renders",{projectId:args.projectId,editSpec:args.editSpec,status:"queued",progress:0});
    await ctx.db.patch(args.projectId,{status:"rendering"});
    return id;
  }
});

export const get=query({
  args:{id:v.id("renders")},
  returns:v.union(v.null(),v.object({
    _id:v.id("renders"),_creationTime:v.number(),projectId:v.id("projects"),editSpec:v.string(),
    status,progress:v.number(),outputStorageId:v.optional(v.id("_storage")),error:v.optional(v.string())
  })),
  handler:async(ctx,args)=>await ctx.db.get(args.id)
});

export const claimNext=internalMutation({
  args:{},
  returns:v.union(v.null(),v.object({
    renderId:v.id("renders"),
    editSpec:v.string(),
    sourceVideoUrl:v.string(),
    voiceoverUrl:v.union(v.string(),v.null()),
    musicUrl:v.union(v.string(),v.null())
  })),
  handler:async(ctx)=>{
    const render=await ctx.db.query("renders").withIndex("by_status",q=>q.eq("status","queued")).order("asc").take(1).then(rows=>rows[0]);
    if(!render) return null;
    const video=await ctx.db.query("videos").withIndex("by_project",q=>q.eq("projectId",render.projectId)).order("asc").take(1).then(rows=>rows[0]);
    if(!video) {
      await ctx.db.patch(render._id,{status:"failed",progress:0,error:"No source video is attached to this project"});
      await ctx.db.patch(render.projectId,{status:"failed"});
      return null;
    }
    const audio=await ctx.db.query("audio").withIndex("by_project",q=>q.eq("projectId",render.projectId)).order("desc").take(10);
    const voice=audio.find(item=>item.kind==="voiceover");
    const music=audio.find(item=>item.kind==="music");
    const sourceVideoUrl=await ctx.storage.getUrl(video.storageId);
    if(!sourceVideoUrl) throw new Error("Source video is no longer available");
    await ctx.db.patch(render._id,{status:"processing",progress:10,error:undefined});
    return{
      renderId:render._id,
      editSpec:render.editSpec,
      sourceVideoUrl,
      voiceoverUrl:voice?await ctx.storage.getUrl(voice.storageId):null,
      musicUrl:music?await ctx.storage.getUrl(music.storageId):null
    };
  }
});

export const setProgress=internalMutation({
  args:{id:v.id("renders"),progress:v.number()},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render) throw new Error("Render not found");
    if(render.status==="ready"||render.status==="failed") return null;
    await ctx.db.patch(args.id,{progress:Math.max(10,Math.min(99,args.progress)),status:"processing"});
    return null;
  }
});

export const setFailed=internalMutation({
  args:{id:v.id("renders"),error:v.string()},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render) throw new Error("Render not found");
    await ctx.db.patch(args.id,{status:"failed",progress:0,error:args.error});
    await ctx.db.patch(render.projectId,{status:"failed"});
    return null;
  }
});

export const setReady=internalMutation({
  args:{id:v.id("renders"),outputStorageId:v.id("_storage")},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render) throw new Error("Render not found");
    await ctx.db.patch(args.id,{status:"ready",progress:100,outputStorageId:args.outputStorageId,error:undefined});
    await ctx.db.patch(render.projectId,{status:"ready"});
    return null;
  }
});

export const outputUrl=query({
  args:{id:v.id("renders")},
  returns:v.union(v.null(),v.string()),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render?.outputStorageId) return null;
    return await ctx.storage.getUrl(render.outputStorageId);
  }
});
