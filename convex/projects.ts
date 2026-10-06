import {v} from "convex/values";
import {mutation,query} from "./_generated/server";

export const create=mutation({
  args:{name:v.string(),editSpec:v.string()},
  returns:v.id("projects"),
  handler:async(ctx,args)=>await ctx.db.insert("projects",{name:args.name,editSpec:args.editSpec,status:"draft"})
});

export const updateSpec=mutation({
  args:{id:v.id("projects"),editSpec:v.string()},
  returns:v.null(),
  handler:async(ctx,args)=>{
    await ctx.db.patch(args.id,{editSpec:args.editSpec,status:"draft"});
    return null;
  }
});

export const get=query({
  args:{id:v.id("projects")},
  returns:v.union(v.null(),v.object({_id:v.id("projects"),_creationTime:v.number(),name:v.string(),editSpec:v.string(),status:v.union(v.literal("draft"),v.literal("rendering"),v.literal("ready"),v.literal("failed"))})),
  handler:async(ctx,args)=>await ctx.db.get(args.id)
});
