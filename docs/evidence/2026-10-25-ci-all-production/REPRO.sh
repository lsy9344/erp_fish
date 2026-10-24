#!/bin/bash
# 재현 명령. scratch(작업 폴더)는 실행 뒤 지워지므로 여기 적힌 입력만 쓴다.
# 입력의 원래 경로·sha256은 INPUTS.json. 원래 경로가 사라졌으면 이 폴더의 inputs/ 사본을 쓴다.
# (인자로 직접 넘긴 경로만 바꾼다. 스크립트 안에 박힌 경로는 INPUTS.json을 보고 직접 확인한다.)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
pick() { if [ -e "$1" ]; then printf %s "$1"; else echo "원래 경로 없음, 사본 사용: $1" >&2; printf %s "$HERE/$2"; fi; }
cd /home/noah/Desktop/project/dev_busi/erp_fish 2>/dev/null || cd "$HERE"
exec scratch-guard run --label fish-ci-all-production --max-bytes 2147483648 --max-inodes 200000 -- python3 -c 'import os,sys,subprocess,tarfile,io,json,time,pathlib,shutil,hashlib
root=pathlib.Path.cwd(); w=pathlib.Path(sys.argv[1]); app=w/"app"; app.mkdir(); out=w/"out";out.mkdir()
paths=["playwright.config.ts","scripts/playwright-full-groups.mjs","scripts/run-playwright-full.mjs","tests/e2e/global-setup.ts","tests/e2e/_helpers/chat-api-stub.ts","src/app/api/test/anthropic-stub/v1/messages/route.ts"]
snapshot={p:(root/p).read_bytes() for p in paths}
tarfile.open(fileobj=io.BytesIO(subprocess.check_output(["git","archive","HEAD"]))).extractall(app,filter="data")
for name in ["node_modules","generated"]: (app/name).symlink_to(root/name,target_is_directory=True)
subprocess.run(["gh","run","download","40102660700","--name","playwright-build-814009d702cefb0ca2bb8567fc6953e03988afb9","--dir",str(w/"build")],check=True)
binary=w/"build/playwright-build.tgz"
tarfile.open(binary).extractall(app,filter="data")
name="fish-ci-all-production-"+str(os.getpid()); result={"build_workflow":40102660700,"build_commit":"814009d702cefb0ca2bb8567fc6953e03988afb9","build_sha256":hashlib.sha256(binary.read_bytes()).hexdigest(),"source_sha256":{p:hashlib.sha256(b).hexdigest() for p,b in snapshot.items()},"stages":[]}
try:
 subprocess.run(["docker","run","-d","--name",name,"-e","POSTGRES_PASSWORD=fixture-password","-e","POSTGRES_DB=fish_ci_test","-p","127.0.0.1::5432","postgres:16-alpine"],check=True,stdout=subprocess.DEVNULL)
 port=subprocess.check_output(["docker","inspect","--format",'"'"'{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'"'"',name],text=True).strip()
 for i in range(40):
  if subprocess.run(["docker","exec",name,"pg_isready","-U","postgres"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(0.5)
 url=f"postgresql://postgres:fixture-password@127.0.0.1:{port}/fish_ci_test"
 env=dict(os.environ,CI="true",PORT="3223",DATABASE_URL=url,PLAYWRIGHT_DATABASE_URL=url,AUTH_SECRET="test-auth-secret-at-least-32-characters",SKIP_ENV_VALIDATION="1",AUTH_TRUST_HOST="true",ENABLE_LABOR_EXPORT="true",PW_SERVER_MODE="production",PLAYWRIGHT_JSON_OUTPUT_NAME=str(w/"results.json"))
 stages=[("missing-provider-fixture",["node","scripts/run-playwright-clean.mjs","tests/e2e/chat-widget.spec.ts","--grep","본사 화면에서 원형 아이콘으로","--retries=0","--reporter=line,json"]),("group1-production",["node","scripts/run-playwright-full.mjs","--group","1","--reporter=line,json"])]
 for label,args in stages:
  if label=="group1-production":
   for p,b in snapshot.items():dest=app/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
  started=time.monotonic()
  with (w/(label+".log")).open("w") as log:p=subprocess.run(["/usr/bin/time","-v","-o",str(w/(label+".time")),*args],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT)
  report=json.loads((w/"results.json").read_text()) if (w/"results.json").exists() else {}
  stage={"label":label,"exit_code":p.returncode,"elapsed_seconds":round(time.monotonic()-started,2),"stats":report.get("stats"),"resource_usage":(w/(label+".time")).read_text()}
  result["stages"].append(stage);print(json.dumps(stage,ensure_ascii=False),flush=True)
  if label=="missing-provider-fixture":
   assert p.returncode!=0 and report.get("stats",{}).get("unexpected")==1 and "스텁 답변" in json.dumps(report,ensure_ascii=False), "Baseline did not reproduce the missing fixture symptom"
  else: assert p.returncode==0,"Production group 1 failed"
 (out/"summary.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
finally:
 subprocess.run(["docker","rm","-f",name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
' '{scratch}'
