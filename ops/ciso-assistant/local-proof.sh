#!/usr/bin/env bash
# Manage only the named, isolated synthetic CPL-02 container; never production.
set -euo pipefail
proof_root=/tmp/legal-os-ciso-cpl02
proof_container=legal-os-ciso-cpl02-backend
proof_network=legal-os-ciso-cpl02-isolated
proof_volume=legal-os-ciso-cpl02-db
proof_image=ghcr.io/intuitem/ciso-assistant-community/backend:v4.1.0@sha256:3a23b82afa4c02612e8d86870d94546fb6271c56cb4cb00cf84ff06a5e1c4a28
script_root=$(cd "$(dirname "$0")" && pwd)
case "${1:-}" in
  start)
    if docker container inspect "$proof_container" >/dev/null 2>&1; then
      echo 'Proof container already exists. Use check, stop or explicit reset.' >&2
      exit 1
    fi
    python3 - "$proof_root" <<'PY'
import os,pathlib,secrets,sys
base=pathlib.Path(sys.argv[1])
base.mkdir(exist_ok=True,mode=0o700)
os.chmod(base,0o700)
(base/'db').mkdir(exist_ok=True,mode=0o700)
p=base/'runtime.env'
if not p.exists():
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('DJANGO_SECRET_KEY='+secrets.token_hex(48)+'\nLEGAL_OS_SYNTHETIC_PROOF=cpl02\n')
PY
    docker network inspect "$proof_network" >/dev/null 2>&1 || docker network create --internal --label legal-os.proof=cpl02 "$proof_network" >/dev/null
    docker volume inspect "$proof_volume" >/dev/null 2>&1 || docker volume create --label legal-os.proof=cpl02 "$proof_volume" >/dev/null
    [[ "$(docker network inspect --format '{{.Internal}} {{index .Labels "legal-os.proof"}}' "$proof_network")" == 'true cpl02' ]] || { echo 'Refusing unexpected network.' >&2; exit 1; }
    [[ "$(docker volume inspect --format '{{index .Labels "legal-os.proof"}}' "$proof_volume")" == cpl02 ]] || { echo 'Refusing unexpected volume.' >&2; exit 1; }
    docker run --rm --network none --user 0:0 --cap-drop ALL --cap-add CHOWN --cap-add FOWNER \
      --mount "type=volume,source=$proof_volume,target=/code/db" --entrypoint /bin/sh "$proof_image" \
      -c 'chmod 700 /code/db && chown 1001:1001 /code/db'
    docker run --detach --name "$proof_container" --label legal-os.proof=cpl02 \
      --platform linux/arm64 --network "$proof_network" \
      --env-file "$proof_root/runtime.env" \
      --env ALLOWED_HOSTS=127.0.0.1,localhost,backend \
      --env CISO_ASSISTANT_URL=http://127.0.0.1:18784 --env DJANGO_DEBUG=False \
      --env AUTH_TOKEN_TTL=3600 --env HOME=/tmp --env XDG_CACHE_HOME=/tmp/.cache \
      --env XDG_CONFIG_HOME=/tmp/.config --env XDG_DATA_HOME=/tmp/.local/share \
      --user 1001:1001 --read-only --cap-drop ALL --security-opt no-new-privileges:true \
      --tmpfs /tmp:rw,noexec,nosuid,nodev --memory 3g --cpus 2 \
      --mount "type=volume,source=$proof_volume,target=/code/db" \
      --entrypoint /bin/sh "$proof_image" -c \
      'python manage.py migrate --noinput && exec gunicorn --chdir ciso_assistant --bind :8000 --workers 1 --timeout 120 ciso_assistant.wsgi:application' >/dev/null
    echo 'Isolated backend started. Run local-proof.sh bridge in a separate terminal for loopback access.'
    ;;
  bridge)
    echo $$ > "$proof_root/bridge.pid"
    exec python3 "$script_root/loopback-bridge.py"
    ;;
  bootstrap)
    docker exec --interactive "$proof_container" python manage.py shell < "$script_root/bootstrap.py"
    docker cp "$proof_container:/code/db/proof-credentials.json" "$proof_root/db/proof-credentials.json"
    chmod 600 "$proof_root/db/proof-credentials.json"
    ;;
  check)
    python3 "$script_root/prove-api.py"
    ;;
  stop)
    docker stop "$proof_container" >/dev/null
    if [[ -f "$proof_root/bridge.pid" ]]; then
      proof_bridge_pid=$(cat "$proof_root/bridge.pid")
      if [[ "$(ps -p "$proof_bridge_pid" -o command=)" == *"$script_root/loopback-bridge.py"* ]]; then kill "$proof_bridge_pid"; fi
    fi
    echo 'Proof container stopped; synthetic state retained privately.'
    ;;
  reset)
    [[ "${2:-}" == --confirm-synthetic-reset ]] || { echo 'Reset requires --confirm-synthetic-reset.' >&2; exit 1; }
    [[ "$(docker inspect --format '{{ index .Config.Labels "legal-os.proof" }}' "$proof_container")" == cpl02 ]]
    docker rm --force "$proof_container" >/dev/null
    docker network rm "$proof_network" >/dev/null
    # Retain credentials, source and receipts; explicit new path required for a new dataset.
    echo 'Proof container and isolated network removed. Private credentials/receipts remain in /tmp/legal-os-ciso-cpl02; the labeled database volume is retained.'
    ;;
  *) echo 'Usage: local-proof.sh start|bridge|bootstrap|check|stop|reset --confirm-synthetic-reset' >&2; exit 2 ;;
esac
