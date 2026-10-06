import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function authorized(request: Request) {
  const expected = process.env.RENDER_WORKER_SECRET;
  return Boolean(expected && request.headers.get("authorization") === "Bearer " + expected);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const claim = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const job = await ctx.runMutation(internal.renders.claimNext, {});
  if (!job) return json({ job: null });
  const uploadUrl = await ctx.storage.generateUploadUrl();
  return json({ job, uploadUrl });
});

const progress = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json() as { renderId?: string; progress?: number };
  if (!body.renderId || typeof body.progress !== "number") return json({ error: "renderId and progress are required" }, 400);
  await ctx.runMutation(internal.renders.setProgress, {
    id: body.renderId as never,
    progress: body.progress,
  });
  return json({ ok: true });
});

const complete = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json() as { renderId?: string; outputStorageId?: string };
  if (!body.renderId || !body.outputStorageId) return json({ error: "renderId and outputStorageId are required" }, 400);
  await ctx.runMutation(internal.renders.setReady, {
    id: body.renderId as never,
    outputStorageId: body.outputStorageId as never,
  });
  return json({ ok: true });
});

const fail = httpAction(async (ctx, request) => {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json() as { renderId?: string; error?: string };
  if (!body.renderId || !body.error) return json({ error: "renderId and error are required" }, 400);
  await ctx.runMutation(internal.renders.setFailed, {
    id: body.renderId as never,
    error: body.error.slice(0, 4000),
  });
  return json({ ok: true });
});

http.route({ path: "/render/claim", method: "POST", handler: claim });
http.route({ path: "/render/progress", method: "POST", handler: progress });
http.route({ path: "/render/complete", method: "POST", handler: complete });
http.route({ path: "/render/fail", method: "POST", handler: fail });

export default http;
