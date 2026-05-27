# Installing on another admin's machine

This tool is a folder of static files &mdash; no backend, no database, no
install. Anyone with the folder + a domain-joined Windows machine can run it.

**Production location (dev environment):** https://summer.mmgapts.com

---

## Option 0 &mdash; The dev environment (already wired up)

`main` auto-deploys to the company dev box via GitHub Actions. The flow mirrors
`flh-founders`:

- Docker image &mdash; `Dockerfile` (nginx serving the static folder)
- nginx config &mdash; `nginx.conf` (gzip, security headers, departments.csv = no-cache)
- Compose stack &mdash; `docker-compose.dev.yml`, routed by Traefik to
  `summer.mmgapts.com`
- Workflows &mdash; `.github/workflows/update-dev.yml` (auto on push to `main`),
  `deploy-dev.yml` (manual full deploy)

**One-time setup on the repo:** the workflows need these GitHub Secrets
(same names flh-founders uses): `DEV_HOST`, `DEV_USER`, `DEV_SSH_KEY`,
`DEV_PORT`. If this repo is on a personal account rather than the org, copy
the secrets across once.

**One-time setup on the dev host:** the `arc-runner-dind` runner deploys to
`/srv/docker/stacks/dev-apps/adaudit/`. Traefik picks up the route from the
Docker labels automatically &mdash; no DNS work as long as `*.mmgapts.com` already
resolves to the dev box.

**To enable AD auto-load of departments on the dev URL:**

```bash
# on the dev host
cd /srv/docker/stacks/dev-apps/adaudit
touch departments.csv

# uncomment the `volumes:` block in docker-compose.dev.yml
docker compose -f docker-compose.dev.yml up -d --no-deps adaudit-web

# set up a job that scps the AD-generated CSV onto this host, e.g.
# from a domain-joined Windows server running Update-Departments.ps1 weekly.
```

---

## Option 1 &mdash; Copy to their machine (simplest)

1. Copy the entire `C:\git\adaudit-tool\` folder to the target machine. A USB
   stick, OneDrive, a network share, or `xcopy` all work. Suggested target:
   `C:\Tools\adaudit-tool\`.
2. Make a desktop shortcut to `index.html`:
   ```powershell
   $desktop = [Environment]::GetFolderPath('Desktop')
   $ws = New-Object -ComObject WScript.Shell
   $lnk = $ws.CreateShortcut((Join-Path $desktop 'ADAudit Work Hours.lnk'))
   $lnk.TargetPath = 'C:\Tools\adaudit-tool\index.html'
   $lnk.WorkingDirectory = 'C:\Tools\adaudit-tool'
   $lnk.Save()
   ```
3. **First-run department sync:** right-click `Update-Departments.ps1` &rarr;
   *Run with PowerShell*. It writes `departments.csv` next to itself.
4. Double-click the desktop shortcut. Drag the AD-generated `departments.csv`
   onto the drop zone once (stored in that user's browser localStorage).

That's the whole install. Updates: copy the same folder again, replacing the
old one.

---

## Option 2 &mdash; Serve from a network share

If multiple admins should all see the same departments mapping without each
needing their own CSV import:

1. Copy the folder to a UNC path everyone reads, e.g.
   `\\fileserver\tools\adaudit-tool\`.
2. Schedule `Update-Departments.ps1` on the file server so the
   `departments.csv` next to it stays current.
3. Each admin opens `\\fileserver\tools\adaudit-tool\index.html` directly
   (file:// from a share works the same as a local file).

Heads-up: with `file://`, the auto-load of `departments.csv` is blocked by the
browser. Each user still needs to drag the CSV onto the app once (it's stored
in their localStorage). If you want true zero-touch, use Option 3.

---

## Option 3 &mdash; Internal web host (zero-touch for admins)

For a "open the URL, you're done" experience:

1. Pick a Windows server you control (anything that can run IIS or a static
   file server &mdash; the FLH intranet box would work).
2. Copy the folder to that server's web root, e.g. `C:\inetpub\wwwroot\adaudit\`.
3. Configure IIS (or `npx serve`) to serve the folder on a chosen port/host.
   Example with IIS: add a new Application under Default Web Site pointing at
   that folder. Or run as a service:
   ```powershell
   # one-time install of a tiny Node-based serve as a service
   npm install -g serve
   nssm install adaudit-tool "node" "C:\path\to\serve" "-l" "8080" "C:\inetpub\wwwroot\adaudit"
   nssm start adaudit-tool
   ```
4. Schedule `Update-Departments.ps1` on the same server to write
   `departments.csv` into the served folder. The app auto-loads it on each
   page load.
5. Send admins the URL, e.g. `http://flh-intranet:8080`.

---

## Updating the app later

The whole app is `index.html` + `app.js` + `styles.css` + `vendor/xlsx.full.min.js`.
Replace those four files with the new versions. Don't overwrite `departments.csv`
or your end users' browser localStorage will be replaced too.

---

## Requirements

- Windows 10/11 (or Server 2016+). Domain-joined for `Update-Departments.ps1`.
- A modern browser &mdash; Chrome, Edge, Firefox.
- No npm/Node install required on the consumer machine. The dev port via
  `npx -y serve` is only needed if you want the auto-load behavior at runtime.

## Security notes

- All parsing happens in the browser. No data leaves the user's machine
  *unless* you host the app on a network server &mdash; in which case the static
  files (and the AD-generated `departments.csv` if you place it next to
  `index.html`) are downloaded by each client.
- The xlsx and the departments CSV both contain employee data. Don't commit
  them to git, don't put them on public hosting. The bundled `.gitignore`
  already excludes both.
- `Update-Departments.ps1` only queries AD (read-only) and writes one local
  file. No changes are made to AD.
