#!/bin/sh
# Restore to an EMPTY data volume only. Existing data is never overwritten.
set -eu
cd "$(dirname "$0")/.."
archive=${1:?Usage: sh deployment/restore.sh /absolute/path/to/backup.tar.gz}
case "$archive" in /*) ;; *) echo 'Use an absolute archive path' >&2; exit 1;; esac
[ -f "$archive" ] || { echo 'Backup not found' >&2; exit 1; }
[ -z "$(docker compose ps --status running --services nib)" ] || { echo 'Stop nib before restoring' >&2; exit 1; }
archive_dir=$(dirname "$archive")
archive_name=$(basename "$archive")
docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE --cap-add CHOWN --cap-add FOWNER --entrypoint sh --volume "$archive_dir:/backup:ro" -e "RESTORE_FILE=$archive_name" nib -c '
  set -eu
  [ -z "$(find /app/data -type f -print -quit)" ] || { echo "Data volume is not empty; restore into a fresh deployment" >&2; exit 1; }
  tar -tzf "/backup/$RESTORE_FILE" | while IFS= read -r entry; do
    case "$entry" in /*|../*|*/../*|*/..) echo "Unsafe archive entry" >&2; exit 1;; esac
  done
  tar -xzf "/backup/$RESTORE_FILE" -C /app/data
  test -f /app/data/nib.db
  chown -R node:node /app/data
'
echo 'Backup restored. Start nib and check /api/ready and a case attachment.'
