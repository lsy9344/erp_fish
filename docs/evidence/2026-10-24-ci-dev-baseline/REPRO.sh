#!/bin/bash
# 재현 명령. scratch(작업 폴더)는 실행 뒤 지워지므로 여기 적힌 입력만 쓴다.
# 입력의 원래 경로·sha256은 INPUTS.json. 원래 경로가 사라졌으면 이 폴더의 inputs/ 사본을 쓴다.
# (인자로 직접 넘긴 경로만 바꾼다. 스크립트 안에 박힌 경로는 INPUTS.json을 보고 직접 확인한다.)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
pick() { if [ -e "$1" ]; then printf %s "$1"; else echo "원래 경로 없음, 사본 사용: $1" >&2; printf %s "$HERE/$2"; fi; }
cd /home/noah/Desktop/project/dev_busi/erp_fish 2>/dev/null || cd "$HERE"
exec scratch-guard run --label fish-ci-baseline-evidence --max-bytes 2147483648 --max-inodes 200000 -- cp "$(pick /home/noah/.cache/scratch-guard/kept/fish-ci-dev-baseline-20261024T141305Z-822d77/w/out/summary.json inputs/00-summary.json)" '{scratch}/summary.json'
