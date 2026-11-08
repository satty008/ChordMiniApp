#!/usr/bin/env bash
# Smoke tests for chordstack. Runs ON burrow, talks only to localhost.
FE=http://localhost:3100; LC=http://localhost:8800
pass=0; fail=0
t() { # name, command-that-returns-0-on-pass
  if eval "$2" >/tmp/smoke.out 2>&1; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1"; sed 's/^/        /' /tmp/smoke.out | head -5; fail=$((fail+1)); fi
}
BE=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' chordmini-backend)
VID=${1:-PQZ6h49kBIc}; URL="https://www.youtube.com/watch?v=$VID"
if [ -z "$SKIP_CM" ]; then
echo "== ChordMini"
t "frontend /api/health healthy"      "curl -sf $FE/api/health | grep -q healthy"
t "backend /health via frontend net"  "docker exec chordmini-frontend curl -sf http://chordmini-backend:8080/health | grep -q healthy"
t "/api/config has firebase project"  "curl -sf $FE/api/config | grep -q chordmini-de"
t "/api/config leaks no secrets"      "! curl -sf $FE/api/config | grep -qiE 'private_key|service_account|api_secret'"
t "ytdlp extract (YouTube metadata)"  "curl -sf -m90 -X POST $FE/api/ytdlp/extract -H 'content-type: application/json' -d '{\"url\":\"$URL\"}' | grep -q '\"success\":true'"
t "ytdlp download audio"              "curl -sf -m300 -X POST $FE/api/ytdlp/download -H 'content-type: application/json' -d '{\"url\":\"$URL\",\"videoId\":\"$VID\",\"format\":\"mp3\"}' | tee /tmp/dl.json | grep -q '\"success\":true'"
FN=$(python3 -c "import json;d=json.load(open('/tmp/dl.json'));print(d.get('filename') or d.get('data',{}).get('filename',''))" 2>/dev/null)
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$FN")
rm -f /tmp/a.mp3
t "serve-local-audio streams file" "curl -g -sf -m60 -o /tmp/a.mp3 \"$FE/api/serve-local-audio?filename=$ENC\" && [ \$(stat -c%s /tmp/a.mp3) -gt 100000 ]"
t "backend chords: chord-cnn-lstm"    "curl -sf -m400 -X POST http://$BE:8080/api/recognize-chords -F file=@/tmp/a.mp3 -F chord_model=chord-cnn-lstm | grep -q '\"chords\"'"
t "backend chords: btc-sl"            "curl -sf -m400 -X POST http://$BE:8080/api/recognize-chords -F file=@/tmp/a.mp3 -F detector=btc-sl | grep -q '\"chords\"'"
t "backend beats: beat-transformer"   "curl -sf -m400 -X POST http://$BE:8080/api/detect-beats -F file=@/tmp/a.mp3 -F model=beat-transformer | grep -q 'beats'"
t "SSRF: other localhost path blocked" "[ \$(curl -s -o /dev/null -w %{http_code} '$FE/api/proxy-audio?url=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fhealth') -ge 400 ]"
t "SSRF: private IP blocked"           "[ \$(curl -s -o /dev/null -w %{http_code} '$FE/api/proxy-audio?url=http%3A%2F%2F192.168.1.1%2F') -ge 400 ]"
t "melody-cache miss is 200 not 500"  "[ \$(curl -s -o /dev/null -w %{http_code} '$FE/api/melody-cache?videoId=$VID') = 200 ]"
fi
echo "== LiveChord"
t "livechord up"                      "curl -sf -o /dev/null $LC/"
t "upload w/o X-Anon-Id rejected"     "[ \$(curl -s -o /dev/null -w %{http_code} -X POST $LC/api/process/upload -F file=@/tmp/a.mp3\;type=audio/mpeg) -ge 400 ]"
cat > /tmp/lc_job.py <<'EOF'
import json,sys,time,urllib.request as u
H={"X-Anon-Id":"smoketest01"}; B="http://localhost:8800/api/process"
boundary="xxBOUNDARYxx"; data=open("/tmp/a.mp3","rb").read()
body=(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").encode()+data+f"\r\n--{boundary}--\r\n".encode()
r=u.Request(B+"/upload",body,{**H,"Content-Type":"multipart/form-data; boundary="+boundary})
job=json.load(u.urlopen(r,timeout=60))["job_id"]
for _ in range(120):
    st=json.load(u.urlopen(u.Request(B+"/status/"+job,headers=H),timeout=30))
    if st["status"]=="done": break
    if st["status"] in ("error","failed") or st.get("error"): sys.exit("job failed: %s"%st)
    time.sleep(5)
else: sys.exit("timeout")
res=json.load(u.urlopen(u.Request(B+"/result/"+job,headers=H),timeout=30))
print(res["key"], [c["chord"] for c in res["chords"][:6]])
assert len(res["chords"])>5
EOF
t "livechord upload + BTC chords (async job)" "python3 /tmp/lc_job.py"
echo "== Isolation / ops"
t "no refs to the dev PC in compose"  "! grep -qE '192\.168\.178|satty008-pc|host.docker.internal' ~/repos/chordstack/docker-compose.yml"
t "containers restart=unless-stopped" "[ \$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' chordmini-frontend chordmini-backend livechord | sort -u | tr -d '\n') = unless-stopped ]"
t "no bind mounts outside stack dir"  "! docker inspect -f '{{range .Mounts}}{{.Source}}{{\"\\n\"}}{{end}}' chordmini-frontend chordmini-backend livechord | grep -vE '^$|chordstack|/var/lib/docker/volumes'"
echo "== $pass passed, $fail failed"
