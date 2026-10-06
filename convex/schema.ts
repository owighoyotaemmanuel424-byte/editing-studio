import {defineSchema,defineTable} from "convex/server";
import {v} from "convex/values";

const assetFields={
  projectId:v.id("projects"),
  storageId:v.id("_storage"),
  filename:v.string(),
  mimeType:v.string()
};

export default defineSchema({
  projects:defineTable({
    name:v.string(),
    editSpec:v.string(),
    status:v.union(v.literal("draft"),v.literal("rendering"),v.literal("ready"),v.literal("failed"))
  }).index("by_status",["status"]),
  videos:defineTable(assetFields).index("by_project",["projectId"]),
  audio:defineTable({
    projectId:v.id("projects"),
    storageId:v.id("_storage"),
    filename:v.string(),
    mimeType:v.string(),
    kind:v.union(v.literal("voiceover"),v.literal("music")),
    volume:v.number()
  }).index("by_project",["projectId"])
});