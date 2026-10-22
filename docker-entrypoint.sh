#!/bin/sh
# Fly mounts volumes owned by root: hand /data to the app user, then drop privileges.
set -e
chown -R node:node "${SITEMATE_DATA_DIR:-/data}"
exec su-exec node "$@"
