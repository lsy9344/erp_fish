#!/bin/bash
# 재현 명령. scratch(작업 폴더)는 실행 뒤 지워지므로 여기 적힌 입력만 쓴다.
# 입력의 원래 경로·sha256은 INPUTS.json. 원래 경로가 사라졌으면 이 폴더의 inputs/ 사본을 쓴다.
# (인자로 직접 넘긴 경로만 바꾼다. 스크립트 안에 박힌 경로는 INPUTS.json을 보고 직접 확인한다.)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
pick() { if [ -e "$1" ]; then printf %s "$1"; else echo "원래 경로 없음, 사본 사용: $1" >&2; printf %s "$HERE/$2"; fi; }
cd /home/noah/Desktop/project/dev_busi/erp_fish 2>/dev/null || cd "$HERE"
exec scratch-guard run --label fish-ci-all-prod-build --max-bytes 2147483648 --max-inodes 200000 -- python3 -c 'import pathlib,subprocess,tarfile,io,sys,os,time,json,hashlib
root=pathlib.Path.cwd();w=pathlib.Path(sys.argv[1]);app=w/"app";app.mkdir();(w/"out").mkdir()
tarfile.open(fileobj=io.BytesIO(subprocess.check_output(["git","archive","HEAD"]))).extractall(app,filter="data")
paths=["playwright.config.ts","scripts/playwright-full-groups.mjs","scripts/run-playwright-full.mjs","tests/e2e/global-setup.ts","tests/e2e/_helpers/chat-api-stub.ts","src/app/api/test/anthropic-stub/v1/messages/route.ts"]
hashes={}
for p in paths:
 b=(root/p).read_bytes();dest=app/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);hashes[p]=hashlib.sha256(b).hexdigest()
for p in ["node_modules","generated"]:(app/p).symlink_to(root/p,target_is_directory=True)
env=dict(os.environ,CI="true",SKIP_ENV_VALIDATION="1",AUTH_SECRET="test-auth-secret-at-least-32-characters",DATABASE_URL="postgresql://postgres:fixture-password@127.0.0.1:1/fish_ci_test")
t=time.monotonic()
with (w/"build.log").open("w") as f:r=subprocess.run(["pnpm","build"],cwd=app,env=env,stdout=f,stderr=subprocess.STDOUT)
x={"exit_code":r.returncode,"elapsed_seconds":round(time.monotonic()-t,2),"source_sha256":hashes};(w/"out/summary.json").write_text(json.dumps(x,indent=2));print(json.dumps(x),flush=True)
if r.returncode:print((w/"build.log").read_text()[-4000:]);sys.exit(r.returncode)
' '{scratch}'
