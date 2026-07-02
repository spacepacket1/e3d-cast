# Cast Deployment

This phase covers the production deployment assets for `cast.e3d.ai`: PM2 process definitions, Nginx site config, smoke verification, and rollback notes.

## Production shape

- `cast-ui` runs the Node UI/static server on `127.0.0.1:3200`
- `cast-worker` polls the job queue and dispatches render work
- Nginx terminates TLS for `cast.e3d.ai`
- Nginx proxies `/api/cast/*`, `/api/payments/*`, `/openapi/*`, `/llms.txt`, and `/.well-known/agent-capabilities.json` to the Spacepacket API on `127.0.0.1:3000`
- Nginx proxies `/` to the UI server on `127.0.0.1:3200`

## Files added for deployment

- PM2 app definitions: [ecosystem.config.js](/home/ubuntu/e3d-cast/ecosystem.config.js)
- Nginx template: [deploy/nginx/cast.e3d.ai.conf](/home/ubuntu/e3d-cast/deploy/nginx/cast.e3d.ai.conf)
- Smoke test runner: [scripts/smoke-deploy.js](/home/ubuntu/e3d-cast/scripts/smoke-deploy.js)

## Expected environment

Minimum production values:

```bash
CAST_PUBLIC_BASE_URL=https://cast.e3d.ai
CAST_STORAGE_DIR=/var/lib/e3d-pod2vid
CAST_GET_E3D_URL=https://e3d.ai/token
CAST_UI_PORT=3200
SPACEPACKET_API_URL=http://127.0.0.1:3000
SPACEPACKET_SERVICE_BEARER_TOKEN=...
```

The rest of the render/payment environment remains in `.env` or the PM2 environment as established by earlier phases.

## Deploy steps

1. Build the UI: `npm run build`
2. Ensure the production `.env` contains the required service values
3. Start or reload PM2:
   - `pm2 start ecosystem.config.js --only cast-ui,cast-worker`
   - `pm2 save`
4. Install the Nginx site template:
   - copy `deploy/nginx/cast.e3d.ai.conf` into `/etc/nginx/sites-available/`
   - symlink it into `/etc/nginx/sites-enabled/`
   - test and reload: `nginx -t && systemctl reload nginx`
5. Confirm TLS cert paths match the host

## Verification

Local repo verification:

```bash
npm test
npm run build
```

Production smoke verification:

```bash
npm run smoke:deploy
```

Optional paid dry-run submission check:

```bash
CREDIT_KEY=... npm run smoke:deploy
```

What the smoke runner checks:

- HTTPS UI home is reachable
- the production UI exposes the `Get E3D` path
- `/ui-api/config` resolves `https://e3d.ai/token`
- `/api/cast/health` returns `{"status":"healthy"}`
- `/api/cast/capabilities` is reachable
- `/openapi/e3d-cast.yaml` is reachable through the production proxy
- `/llms.txt` is reachable through the production proxy
- `/.well-known/agent-capabilities.json` is reachable and points back to the production OpenAPI URL
- with a credit key present, a transcript-based paid dry-run can be submitted end to end

Post-deploy operator checks:

- open `https://cast.e3d.ai` in a browser and confirm the workspace loads over HTTPS without mixed-content warnings
- submit a paid dry-run from the production UI once a valid credit key is available
- confirm the top-right `Get E3D` button opens `https://e3d.ai/token`
- confirm uploads larger than the service limit fail at the application layer, not at Nginx below `500m`

## Upload and proxy notes

- Nginx `client_max_body_size` is set to `500m` to match the deployment requirement
- proxy timeouts are set to `1200s` to avoid cutting off slow artifact or upload operations
- API proxying is kept explicit rather than broad so the UI remains isolated from the backend routes

## Rollback

If the deployment regresses:

1. Restore the last known-good PM2 release or checkout for this repo
2. Rebuild the UI if the previous release requires it
3. Reload PM2: `pm2 reload ecosystem.config.js --only cast-ui,cast-worker`
4. Restore the previous Nginx site file if this phase changed it
5. Reload Nginx: `nginx -t && systemctl reload nginx`
6. Re-run `npm run smoke:deploy` and confirm `/api/cast/health`

If the UI is bad but the API is healthy, the fastest rollback is usually to restore the previous repo release and reload only `cast-ui`.
