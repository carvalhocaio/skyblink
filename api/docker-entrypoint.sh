#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$SKYBLINK_CACHE_DIR" "$SKYBLINK_OUTPUT_DIR"
    chown "$APP_USER:$APP_USER" "$SKYBLINK_CACHE_DIR" "$SKYBLINK_OUTPUT_DIR"
    export HOME="/home/$APP_USER"
    exec setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups "$@"
fi

exec "$@"
