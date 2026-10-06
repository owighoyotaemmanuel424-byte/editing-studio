import {v} from "convex/values";
import {mutation,query} from "./_generated/server";

export const create=mutation({
  args:{projectId:v.id("projects"),editSpec:v.string()},
  returns:v.id("renders"),
  handler:async(ctx,args)=>{
    const existing=await ctx.db.query("renders").withIndex("by_project",q=>q.eq("projectId",args.projectId)).collect();
    for(const render of existing){
      if(render.status==="queued"||render.status==="processing"){
        throw new Error("A render is already in progress");
      }
    }
    const id=await ctx.db.insert("renders",{
      projectId:args.projectId,
      editSpec:args.editSpec,
      status:"queued",
      progress:0,
      outputStorageId:undefined,
      error:undefined
    });
    await ctx.db.patch(args.projectId,{status:"rendering"});
    return id;
  }
});

export const get= query({
  args:{id:v.id("renders")},
  returns:v.union(v.null(),v.object({
    _id:v.id("renders"),
    _creationTime:v.number(),
    projectId:v.id("projects"),
    editSpec:v.string(),
    status:v.union(v.literal("queued"),v.literal("processing"),v.literal("ready"),v.literal("failed")),
    progress:v.number(),
    outputStorageId:v.optional(v.id("_storage")),
    error:v.optional(v.string())
  })),
  handler:async(ctx,args)=>await ctx.db.get(args.id)
});

export const setProcessing=mutation({
  args:{id:v.id("renders")},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render) throw new Error("Render not found");
    await ctx.db.patch(args.id,{status:"processing",progress:10});
    return null;
  }
});

export const setFailed=mutation({
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

export const setReady=mutation={
  args:{id:v.id("renders"),outputStorageId:v.id("_storage")},
  returns:v.null(),
  handler:async(ctx,args)=>{
    const render=await ctx.db.get(args.id);
    if(!render) throw new Error("Render not found");
    await ctx.db.patch(args.id,{status:"ready",progress:100,outputStorageId:args.outputStorageId});
    await ctx.db.patch(render.projectId,{status:"ready"});
    return null;
  }
};