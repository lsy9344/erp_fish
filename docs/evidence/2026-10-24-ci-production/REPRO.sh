#!/bin/bash
# 재현 명령. scratch(작업 폴더)는 실행 뒤 지워지므로 여기 적힌 입력만 쓴다.
# 입력의 원래 경로·sha256은 INPUTS.json. 원래 경로가 사라졌으면 이 폴더의 inputs/ 사본을 쓴다.
# (인자로 직접 넘긴 경로만 바꾼다. 스크립트 안에 박힌 경로는 INPUTS.json을 보고 직접 확인한다.)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
pick() { if [ -e "$1" ]; then printf %s "$1"; else echo "원래 경로 없음, 사본 사용: $1" >&2; printf %s "$HERE/$2"; fi; }
cd /home/noah/Desktop/project/dev_busi/erp_fish 2>/dev/null || cd "$HERE"
exec scratch-guard run --label fish-ci-production --max-bytes 2147483648 --max-inodes 200000 -- python3 -c 'import os,sys,subprocess,tarfile,io,json,time,pathlib,shutil
root=pathlib.Path.cwd(); w=pathlib.Path(sys.argv[1]); app=w/"app"; app.mkdir(); out=w/"out"; out.mkdir()
tarfile.open(fileobj=io.BytesIO(subprocess.check_output(["git","archive","HEAD"]))).extractall(app,filter="data")
paths=["playwright.config.ts","package.json","scripts/playwright-full-groups.mjs","scripts/run-playwright-full.mjs","tests/e2e/_helpers/hq-reports.ts"]
paths += [str(p.relative_to(root)) for p in (root/"tests/e2e").glob("hq-reports*.spec.ts")]
for name in paths:
 dest=app/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,dest)
for name in ["node_modules","generated"]: (app/name).symlink_to(root/name,target_is_directory=True)
name="fish-ci-production-"+str(os.getpid()); result={"mode":"production"}
try:
 subprocess.run(["docker","run","-d","--name",name,"-e","POSTGRES_PASSWORD=fixture-password","-e","POSTGRES_DB=fish_ci_test","-p","127.0.0.1::5432","postgres:16-alpine"],check=True,stdout=subprocess.DEVNULL)
 port=subprocess.check_output(["docker","inspect","--format",'"'"'{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'"'"',name],text=True).strip()
 for i in range(40):
  if subprocess.run(["docker","exec",name,"pg_isready","-U","postgres"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(0.5)
 url=f"postgresql://postgres:fixture-password@127.0.0.1:{port}/fish_ci_test"
 env=dict(os.environ,CI="true",PORT="3220",DATABASE_URL=url,PLAYWRIGHT_DATABASE_URL=url,AUTH_SECRET="test-auth-secret-at-least-32-characters",SKIP_ENV_VALIDATION="1",AUTH_TRUST_HOST="true",ENABLE_LABOR_EXPORT="true",PLAYWRIGHT_JSON_OUTPUT_NAME=str(w/"results.json"))
 started=time.monotonic()
 with (w/"build.log").open("w") as log:p=subprocess.run(["pnpm","build"],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT)
 result["build_seconds"]=round(time.monotonic()-started,2);result["build_exit_code"]=p.returncode
 if p.returncode: print((w/"build.log").read_text()[-5000:]);sys.exit(p.returncode)
 stages=[("targeted",["node","scripts/run-playwright-clean.mjs","tests/e2e/hq-ledger-edit.spec.ts","tests/e2e/hq-reports.spec.ts","--grep","지점장 direct URL|본사는 마감 버튼으로|본사는 리포트에 들어와","--reporter=line,json","--trace=on"]),("group2",["node","scripts/run-playwright-full.mjs","--group","2","--reporter=line,json"])]
 env["PW_SERVER_MODE"]="production"
 result["stages"]=[]
 for label,args in stages:
  started=time.monotonic()
  with (w/(label+".log")).open("w") as log:p=subprocess.run(["/usr/bin/time","-v","-o",str(w/(label+".time")),*args],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT)
  stage={"label":label,"command":args,"exit_code":p.returncode,"elapsed_seconds":round(time.monotonic()-started,2),"resource_usage":(w/(label+".time")).read_text()}
  if (w/"results.json").exists():
   report=json.loads((w/"results.json").read_text());stage["stats"]=report.get("stats");stage["errors"]=[e.get("message","")[:300] for e in report.get("errors",[])]
  result["stages"].append(stage);print(json.dumps(stage,ensure_ascii=False),flush=True)
  if p.returncode:break
 (out/"summary.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
finally:
 subprocess.run(["docker","rm","-f",name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
' '{scratch}'
