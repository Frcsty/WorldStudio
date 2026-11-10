#!/bin/sh
set -eu
APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -z "${WORLD_STUDIO_WORKSPACE:-}" ] && [ -f "$APP_DIR/workspace/setups/setup.schema.json" ]; then
    export WORLD_STUDIO_WORKSPACE="$APP_DIR/workspace"
fi
cd "$APP_DIR"
exec "$APP_DIR/World Studio" "$@"
