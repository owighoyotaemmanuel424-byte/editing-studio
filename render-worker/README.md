# NewsCut Render Worker

Dedicated FFmpeg worker for NewsCut MP4 exports.

Environment:
- CONVEX_SITE_URL: production Convex .convex.site URL
- RENDER_WORKER_SECRET: same secret configured in Convex
- POLL_INTERVAL_MS: optional, default 5000
- FFMPEG_PATH: optional, default ffmpeg
- FFMPEG_PRESET: optional, default veryfast
- FFMPEG_CRF: optional, default 21

The worker polls for queued jobs, atomically claims one, downloads the source media, trims and concatenates clips, renders 1080x1920 H.264 MP4, burns headlines/captions/lower-third text, mixes optional voice-over/music, uploads the result to Convex Storage, and marks the render ready.

Clip transitions remain in the edit-spec contract. The first worker uses hard cuts and a short fade when a clip explicitly requests fade. Slide is currently treated as a cut so the renderer remains deterministic.
