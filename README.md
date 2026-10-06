# NewsCut / Editing Studio

Mobile-first, template-driven news video editor built with Next.js, Convex and Vercel.

## Current editor

- 9:16 vertical preview
- Convex video/audio uploads and storage
- Multiple source clips with trim ranges, split, reorder and delete
- 30 / 45 / 60 second targets
- Breaking News / News Report / Documentary templates
- Manual headline, timed captions and lower-third/source
- Voice-over and background music with volume controls
- Cut/fade transition metadata
- Persistent edit specification
- Reactive MP4 render status and download link

The architecture intentionally starts without AI. AI can later consume the same structured edit specification.

## Rendering architecture

Heavy FFmpeg work is deliberately kept outside Vercel serverless functions:

Next.js editor -> Convex render job -> dedicated FFmpeg worker -> Convex Storage -> reactive download

The worker lives in `render-worker/` and can run as a Docker background worker on a container host. It polls Convex HTTP actions using a shared `RENDER_WORKER_SECRET`.

The worker currently trims and concatenates clips, creates a 1080x1920 H.264 MP4, burns the headline/breaking label/source and timed captions, mixes optional voice-over/music, and uploads the result to Convex Storage. Fade transitions are rendered as short clip fades; slide currently falls back to a cut.

## Local frontend

```bash
npm install
npx convex dev
npm run dev
```

Set `NEXT_PUBLIC_CONVEX_URL` in Vercel after creating the Convex deployment.

## Render worker

Deploy `render-worker/` as a long-running container/background worker and set:

- `CONVEX_SITE_URL` to the production Convex `.convex.site` URL
- `RENDER_WORKER_SECRET` to the same random secret configured in Convex
- optional `POLL_INTERVAL_MS`, `FFMPEG_PRESET`, and `FFMPEG_CRF`

Keep `RENDER_WORKER_SECRET` server-side only. Never expose it in Next.js or the browser.
