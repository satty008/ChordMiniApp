# chordstack deploy

ChordMini + LiveChord on one Docker host (no dependency on any dev machine).

```bash
git clone https://github.com/satty008/ChordMiniApp.git && cd ChordMiniApp/deploy/chordstack
cp ../../.env.docker.example .env.docker      # fill in the Firebase web config, keep NEXT_PUBLIC_AUDIO_STRATEGY=ytdlp
# IMPORTANT: NEXT_PUBLIC_BASE_URL in .env.docker must be the public https URL users open
# (e.g. https://chordmini.example.org). The browser is told to use it, so localhost breaks analysis.
chmod 600 .env.docker
./fetch-weights.sh                            # BTC weights for LiveChord (sha256-verified)
docker compose up -d --build                  # no --env-file flag needed
./smoke.sh                                    # end-to-end checks, run on the same host
```

Update: `git pull && docker compose pull && docker compose up -d --build`.

- Frontend image is built by `.github/workflows/ghcr-frontend.yml` -> `ghcr.io/satty008/chordminiapp-frontend`.
- Add the public hostname under Firebase Authentication -> Authorized domains.
- Reverse proxy needs a long read timeout (analysis can take minutes) and ~200 MB body size.

## Releases and pinning

`main` is rolling: frontend `:latest`, LiveChord's `selfhost` branch and upstream's backend `:latest`. Every release has a
pin file in `releases/` that fixes all of them (images by tag or digest, LiveChord by commit):

```bash
docker compose -f docker-compose.yml -f releases/0.1.0.yml pull --ignore-buildable
docker compose -f docker-compose.yml -f releases/0.1.0.yml up -d
```

To make a host follow a release, put `COMPOSE_FILE=docker-compose.yml:releases/0.1.0.yml` in that host's `.env` (this
directory); plain `docker compose ...` then uses the pins. Rolling back means pointing `COMPOSE_FILE` at the previous
release's file.

CI publishes `ghcr.io/satty008/chordminiapp-frontend:<commit sha>` for every build, `:latest` for `main`, and `:<x.y.z>`
for every `v<x.y.z>` tag. To cut a release: merge to `main`, add `releases/<x.y.z>.yml` (frontend `:<x.y.z>`) and the
changelog entry, create `release/<x.y.z>` from `main`, and tag `v<x.y.z>`; the tag build publishes the image.

Browser check (optional, run from any machine, alone, because the backend has 2 workers):
`cd e2e && npm i playwright && npx playwright install chromium && CLICK='Run analysis' UNTIL_GONE='Detecting Beats' node probe.mjs https://HOST/analyze/VIDEOID 420 out.png`

## Changelog

Versions here track the `deploy/chordstack` stack of this fork, independent of upstream ChordMini's own tags.

### Unreleased

#### Added
- Lyrics: timing buttons (-1, -0.5, +0.5, +1 s) to line up lyrics borrowed from another recording; the offset is remembered per video.
- Lyrics: use your own lyrics - paste text or upload a `.lrc`/`.txt` file (timed lines become synced lyrics); saved in the browser per video.
- Lyrics: synced LRCLIB lyrics whose title clearly matches the video are applied automatically even when the duration differs (covers).
- `e2e/lyrics-e2e.mjs`: browser test of the lyrics features.

#### Fixed
- LRCLIB found nothing for titles like `Song | Singer | Ukulele Cover | Film | Artist`: the pieces of the title are now searched separately, with cover/format words removed, and a song named in the title outranks other songs by the same singer.
- Among same-song candidates whose duration does not match, the closer recording now ranks higher.

### 0.1.0 - 2026-11-08

First working self-hosted release: ChordMini + LiveChord + a front door, on one Docker host
(deployed on a Proxmox VM behind Nginx Proxy Manager).

#### Added
- `deploy/chordstack`: compose stack (ChordMini frontend + backend, LiveChord CPU build, `riyaaz` front door),
  `fetch-weights.sh` (sha256-verified BTC model), `smoke.sh` (API + browser-path checks), `e2e/probe.mjs` (Playwright).
- `.github/workflows/ghcr-frontend.yml`: builds `ghcr.io/satty008/chordminiapp-frontend` (`:latest` and `:<commit sha>`).
- Front door page with a one-time move of saved practice data to the renamed Music Theory app.

#### Fixed
- Self-hosted mode (`NEXT_PUBLIC_AUDIO_STRATEGY=ytdlp`) no longer hits dev-only gates; the SSRF guard allows only the
  app's own `/api/serve-local-audio` (localhost or its own public hostname).
- yt-dlp: newer binary mounted (YouTube rejects the bundled one); `--no-playlist` so radio-mix links (`list=RD...`) work.
- Server-side calls to its own routes use the in-container address, not the public hostname.
- With `NEXT_PUBLIC_DISABLE_FIREBASE_STORAGE=1` the browser sends audio straight to the analysis routes instead of
  uploading to a Firebase Storage bucket that does not exist (analysis used to retry forever).
- Firestore admin rules and the access-request address use the owner's accounts (upstream maintainer addresses removed).
- `melody-cache` answers "miss" instead of 500 when no Firestore admin credentials are configured.

#### Known limitations
- A 4-minute song takes about 2m13s on 3 vCPUs (beats and chords run in parallel). The backend has 2 gunicorn workers,
  so a second analysis queues behind the first, and reloading does not cancel abandoned work.
- Lyrics come from LRCLIB only; covers have no timing adjustment and there is no way to supply your own lyrics yet.
