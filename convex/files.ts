import {v} from "convex/values";
import {mutation} from "./_generated/server";

export const generateUploadUrl=mutation({
  args:{},
  returns:v.string(),
  handler:async(ctx)=>await ctx.storage.generateUploadUrl()
});

export const attachToProject=mutation({
  args:{projectId:v.id("projects"),storageId:v.id("_storage"),filename:v.string(),mimeType:v.string()},
  returns:v.object({id:v.id("videos"),url:v.union(v.string(),v.null())}),
  handler:async(ctx,args)=>{
    const id=await ctx.db.insert("videos",args);
    return{id,url:await ctx.storage.getUrl(args.storageId)};
  }
});

export const attachAudio=mutation({
  args:{projectId:v.id("projects"),storageId:v.id("_storage"),filename:v.string(),mimeType:v.string(),kind:v.union(v.literal("voiceover"),v.literal("music")),volume:v.number()},
  returns:v.object({id:v.id("audio"),url:v.union(v.string(),v.null())}),
  handler:async(ctx,args)=>{
    const id=await ctx.db.insert("audio",args);
    return{id,url:await ctx.storage.getUrl(args.storageId)};
  }
});