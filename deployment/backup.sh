#!/bin/sh
# Stop the writer and archive SQLite plus attachments as one consistent snapshot.
set -eu
umask 077
cd "$(dirname "$0")/.."
backup_dir=${1:?Usage: sh deployment/backup.sh /absolute/backup-directory}
case "$backup_dir" in /*) ;; *) echo 'Use an absolute backup directory' >&2; exit 1;; esac
mkdir -p "$backup_dir"
backup_file="nib-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
[ ! -e "$backup_dir/$backup_file" ] || { echo 'Backup filename already exists' >&2; exit 1; }
# Host creates the private file, so it retains host ownership after container tar.
partial_file=".$backup_file.partial"
(set -C; : > "$backup_dir/$partial_file")
was_running=$(docker compose ps --status running --services nib)
resume() { if [ "$was_running" = nib ]; then docker compose start nib; fi; }
trap resume EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose stop nib
docker compose run --rm --no-deps --user root --cap-add DAC_OVERRIDE --entrypoint tar --volume "$backup_dir:/backup" nib -czf "/backup/$partial_file" -C /app/data .
chmod 600 "$backup_dir/$partial_file"
mv "$backup_dir/$partial_file" "$backup_dir/$backup_file"
echo "Backup created: $backup_dir/$backup_file"
