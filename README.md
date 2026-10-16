# e3d-cast

The hosted service behind **[cast.e3d.ai](https://cast.e3d.ai)**: paste audio or a transcript, get a finished video, and pay per job by card or in E3D. This repo holds the web UI, the small Node server that serves it, the render-queue worker, and the deployment assets.

Cast is one of FutCo's live products. Use it at [cast.e3d.ai](https://cast.e3d.ai); read this repo to see how it is put together.

## What is here

| Path | What it is |
|---|---|
| `src/ui/` | The static web app: job form, pricing, gallery, agent docs, legal pages |
| `src/server/` | Node server that serves the UI and proxies `/ui-api/*` to the E3D API |
| `src/worker/` | Daemon that polls the job queue and dispatches render work |
| `deploy/nginx/` | Nginx site template for `cast.e3d.ai` |
| `ecosystem.config.js` | PM2 definitions for `cast-ui` and `cast-worker` |
| `scripts/` | UI build and deployment smoke test |
| `docs/` | Deployment notes and the original hosted-Cast spec |

## How it fits together

- **Rendering** is done by [e3d-pod2vid](https://github.com/spacepacket1/e3d-pod2vid), the audio-to-video pipeline. The worker hands it a manifest and collects the result.
- **Payments, the job queue, and the public `/api/cast/*` routes** live in the E3D platform API, which is private. This repo calls it over HTTP using `SPACEPACKET_API_URL` and a service bearer token.
- **Planning** for a video can come from [e3d-creative](https://github.com/spacepacket1/e3d-creative), which packages a transcript for Cast.

Because the platform API is not public, this repo does not run end to end on its own. You can build the UI, run the tests, and read how the worker and server work; a full local render needs the pod2vid pipeline and access to an E3D API.

## Develop

Requires Node 20 or later.

```bash
git clone https://github.com/spacepacket1/e3d-cast.git
cd e3d-cast
cp .env.example .env     # fill in the values you need
npm run build            # bundle the UI into dist/
npm test                 # node --test
npm run dev              # UI and API proxy on CAST_UI_PORT
npm run worker           # queue worker (needs the pod2vid pipeline)
```

Configuration lives in `.env`; `.env.example` lists every variable. See [docs/deployment.md](docs/deployment.md) for the production layout, PM2 and Nginx setup, and rollback notes.

## License

[MIT](LICENSE) © 2026 FutCo LLC. Part of the [FutCo](https://futco.ai/projects) open-source ecosystem.
