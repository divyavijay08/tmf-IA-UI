# Team Alpha judge UI deployment

This guide describes the current production setup for the Team Alpha UI and the repeatable steps for deploying frontend changes to the workshop VM.

## Deployed address

The judge-facing application is available at:

<https://d2b9v9vzd6k5nc.cloudfront.net/team-alpha/>

The page opens directly. Judges do not need an access token in the URL. The credential used to call the live evidence adapter stays on the VM and is never sent to the browser.

## Architecture

```text
Judge browser
    |
    | HTTPS /team-alpha/
    v
Workshop CloudFront endpoint
    |
    v
Nginx on port 8081
    |
    | /team-alpha/* -> 127.0.0.1:8768/*
    v
team-alpha-ui systemd service
scripts/judge_server.py on 127.0.0.1:8768
    |                         |
    | static files            | /api/* with server-side bearer token
    v                         v
dist/                     live adapter on 127.0.0.1:8767
```

The frontend and API appear under one browser origin. This avoids browser CORS problems and prevents the adapter credential from being embedded in JavaScript, HTML, browser storage, or a URL.

## Repository and VM paths

| Item | Value |
| --- | --- |
| GitHub repository | `https://github.com/divyavijay08/tmf-IA-UI.git` |
| Branch | `main` |
| VM checkout | `/home/ec2-user/environment/tmf-IA-UI` |
| Production build | `/home/ec2-user/environment/tmf-IA-UI/dist` |
| Frontend server | `127.0.0.1:8768` |
| Live evidence adapter | `127.0.0.1:8767` |
| Adapter credential file | `/home/ec2-user/environment/assurance-ui-live/service-token` |
| Systemd service | `team-alpha-ui.service` |
| Nginx configuration | `/etc/nginx/conf.d/codeserver.conf` |

## Requirements

Before deploying, confirm:

1. The changes are committed and pushed to `main` in `divyavijay08/tmf-IA-UI`.
2. Node.js and npm are available on the development machine used to create the production bundle.
3. The VM checkout exists at `/home/ec2-user/environment/tmf-IA-UI`.
4. The live evidence adapter is running on loopback port `8767`.
5. The credential file exists and is non-empty. Do not display, copy into chat, or commit its value.
6. The VM user can run the installer with passwordless `sudo -n`.

## Prepare and publish a frontend change

Run these commands in the local repository:

```bash
cd /path/to/tmf-IA-UI
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm run build
```

The build command runs TypeScript validation and creates the production files in `dist/`.

Review the result before committing:

```bash
git diff --check
git status --short
```

`dist/` is ignored for ordinary new files, but the VM deployment intentionally uses the committed production bundle. Stage source files normally, update tracked build files, and force-add the new hashed JavaScript file:

```bash
git add src public index.html vite.config.ts package.json package-lock.json
git add -u dist
git add -f dist/assets/index-*.js
git status --short
git commit -m "Describe the UI change"
git push origin main
```

Only add files that belong to the change. The broad `git add` example can be narrowed to the exact edited paths.

## Deploy on the workshop VM

Open the workshop IDE:

<https://drgzfgdt7rb0h.cloudfront.net/?folder=%2Fhome%2Fec2-user%2Fenvironment>

In its terminal, run:

```bash
cd /home/ec2-user/environment/tmf-IA-UI
git status --short --branch
git pull --ff-only origin main
test -s /home/ec2-user/environment/assurance-ui-live/service-token
sudo -n python3 scripts/install_judge_ui.py
```

The installer performs these actions:

1. Confirms `dist/index.html` exists.
2. Confirms the adapter credential file exists.
3. Writes `/etc/systemd/system/team-alpha-ui.service`.
4. Runs the frontend server as the `ec2-user` user on `127.0.0.1:8768`.
5. Enables and starts the service with systemd.
6. Creates the Nginx `/team-alpha/` reverse-proxy route when required.
7. Validates Nginx before applying the change.
8. Restores the saved Nginx configuration if validation fails.
9. Reloads Nginx.

Expected final output:

```text
nginx: configuration file /etc/nginx/nginx.conf test is successful
Team Alpha UI installed at /team-alpha/
```

The installer is safe to run again for routine frontend updates.

## Verify the deployment

### 1. Check the service

```bash
systemctl is-active team-alpha-ui
systemctl --no-pager --full status team-alpha-ui
```

The first command must print `active`.

### 2. Check the frontend server directly

```bash
curl -s -o /dev/null -w 'UI=%{http_code}\n' http://127.0.0.1:8768/
```

Expected result:

```text
UI=200
```

### 3. Check the Nginx route without credentials

```bash
curl -s -o /dev/null -w 'PUBLIC=%{http_code}\n' http://127.0.0.1:8081/team-alpha/
```

Expected result:

```text
PUBLIC=200
```

### 4. Check the same-origin live API

```bash
curl -s http://127.0.0.1:8081/team-alpha/api/assurance | python3 -m json.tool | head -40
```

The response should be valid JSON containing current collected evidence. A `502` means the UI server is available but cannot reach the live adapter on port `8767`.

### 5. Check the public page

Open the stable URL in a private browser window:

<https://d2b9v9vzd6k5nc.cloudfront.net/team-alpha/>

Verify all of the following:

- The page opens without a query-string credential.
- The Alpha header logo and favicon load.
- The page reports `Connected · collected evidence`.
- Refresh updates the evidence read time.
- Navigation and at least one data table work.
- Browser developer tools do not show failed `/team-alpha/assets/`, `/team-alpha/brand/`, or `/team-alpha/api/` requests.

## Subpath rules for frontend code

The app is hosted below `/team-alpha/`, not at the domain root. Root-relative asset references such as `/brand/logo.png` will request the wrong location.

Use document-relative references for files from `public/`:

```tsx
const logoUrl = './brand/team-logos.png';
```

```html
<link rel="icon" href="./brand/alpha-favicon.svg">
```

Keep Vite configured with:

```ts
base: './'
```

After changing an asset reference, verify the production build at the public `/team-alpha/` URL. A correct favicon does not prove that an independently referenced header image uses the correct path.

## Cache behavior

Hashed files below `dist/assets/` are served as immutable for one year. Every build must therefore produce and deploy its new hashed asset filename together with the updated `dist/index.html`.

HTML and API responses are served with `Cache-Control: no-store`. The workshop CloudFront layer can briefly retain an earlier response. During verification, use a temporary cache-busting query only to confirm a new build:

```text
https://d2b9v9vzd6k5nc.cloudfront.net/team-alpha/?v=<commit-sha>
```

Continue sharing the clean stable URL with judges. Do not add secrets to the query string.

## Routine update checklist

For later UI-only changes, the short workflow is:

```bash
# Local machine
npm test
npm run build
git add <edited-source-files>
git add -u dist
git add -f dist/assets/index-*.js
git commit -m "Describe the UI change"
git push origin main

# Workshop VM
cd /home/ec2-user/environment/tmf-IA-UI
git pull --ff-only origin main
sudo -n python3 scripts/install_judge_ui.py
systemctl is-active team-alpha-ui
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/team-alpha/
```

Then visually verify the public page.

## Troubleshooting

### Public page returns 403

Confirm that the current installer has created an unprotected `/team-alpha/` location and that Nginx accepted the configuration:

```bash
sudo nginx -t
sudo grep -n -A8 -B2 'location /team-alpha/' /etc/nginx/conf.d/codeserver.conf
sudo systemctl reload nginx
```

The Team Alpha route must proxy to `http://127.0.0.1:8768/` and must not require a judge to provide the workshop IDE token.

### Public page returns 502 or 504

```bash
systemctl is-active team-alpha-ui
sudo journalctl -u team-alpha-ui -n 100 --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8768/
```

If the service is inactive, rerun the installer. If it repeatedly exits, inspect the journal for a missing build, credential file, occupied port, or Python error.

### UI loads but live evidence fails

Check the adapter separately:

```bash
ss -ltn | grep ':8767'
systemctl --type=service --state=running | grep -E 'assurance|alpha'
```

Do not expose port `8767` publicly. Do not put its bearer token into frontend environment variables. Browser requests must continue through `/team-alpha/api/*`.

### New UI is not visible

Confirm that the VM received the expected commit and build files:

```bash
git log -1 --oneline
grep -o 'assets/index-[^"]*\.js' dist/index.html
ls -lh dist/assets/index-*.js
```

Verify with `?v=<commit-sha>` to distinguish a cache delay from a failed deployment.

### Header logo or another public asset is broken

Look for a leading slash in the source and compiled bundle. Assets must resolve beneath `/team-alpha/`:

```bash
grep -R '/brand/' -n src index.html
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/team-alpha/brand/team-logos.png
```

The asset check must return `200`.

## Rollback

Find the last known good commit, then deploy it on the VM:

```bash
cd /home/ec2-user/environment/tmf-IA-UI
git log --oneline -10
git checkout <known-good-commit>
sudo -n python3 scripts/install_judge_ui.py
```

Verify the service and public route. After the incident is resolved, return the checkout to `main`:

```bash
git checkout main
git pull --ff-only origin main
sudo -n python3 scripts/install_judge_ui.py
```

Do not rewrite shared history or force-push `main` as part of a deployment rollback.

## Security requirements

- Never commit the adapter token, `.env` files, cookies, AWS credentials, or IDE gateway credentials.
- Never use a `VITE_` variable for a secret; Vite variables are included in browser code.
- Keep ports `8767` and `8768` bound to `127.0.0.1`.
- Keep the public entry point behind the existing CloudFront and Nginx gateway.
- Keep API POST origin checks enabled.
- Do not add arbitrary command execution to the frontend or adapter.
- Do not log bearer tokens, prompts, tool payloads, or raw model responses.
- Treat the public UI as read-only evidence access except for the explicitly configured run-execution API.

## Files that define this deployment

| File | Purpose |
| --- | --- |
| `scripts/judge_server.py` | Serves `dist/` and proxies `/api/*` with the server-side credential |
| `scripts/install_judge_ui.py` | Installs the systemd service and Nginx route |
| `vite.config.ts` | Builds assets for subpath hosting and configures local development proxying |
| `dist/index.html` | Production entry point deployed on the VM |
| `INTEGRATION.md` | Live adapter and evidence integration behavior |

When these deployment files change, run the full build and repeat all verification steps rather than using only the short update checklist.
