# chordstack deploy

ChordMini + LiveChord on one Docker host (no dependency on any dev machine).

```bash
git clone https://github.com/satty008/ChordMiniApp.git && cd ChordMiniApp/deploy/chordstack
cp ../../.env.docker.example .env.docker      # fill in the Firebase web config, keep NEXT_PUBLIC_AUDIO_STRATEGY=ytdlp
chmod 600 .env.docker
echo 'CHORDMINI_BASE_URL=https://chordmini.example.org' > .env
./fetch-weights.sh                            # BTC weights for LiveChord (sha256-verified)
docker compose up -d --build
./smoke.sh                                    # end-to-end checks, run on the same host
```

Update: `git pull && docker compose pull && docker compose up -d --build`.

- Frontend image is built by `.github/workflows/ghcr-frontend.yml` -> `ghcr.io/satty008/chordminiapp-frontend`.
- Add the public hostname under Firebase Authentication -> Authorized domains.
- Reverse proxy needs a long read timeout (analysis can take minutes) and ~200 MB body size.
