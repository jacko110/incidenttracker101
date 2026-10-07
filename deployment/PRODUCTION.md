# Production deployment

This package supports one Node 22 application instance with SQLite and local
attachments in a persistent Docker volume. Do not scale it to multiple replicas.
Use a fresh production database; do not publish the seeded development database.

## Before starting

1. Use a server with Docker Engine and the Compose plugin, at least 2 GB RAM,
   and enough disk for evidence, backups, and images.
2. Point your hostname's DNS records at that server. Open ports 80 and 443.
   The application port 4000 remains bound to localhost.
3. Copy `.env.example` to `.env` and set `JWT_SECRET` to the output of
   `openssl rand -hex 32`. Set `DOMAIN` to your actual hostname without a scheme.
   Protect the file: `chmod 600 .env`. Never put credentials in Git.
4. Set SMTP values if email delivery is required. Production requires encrypted
   SMTP (implicit TLS or STARTTLS) and validates server certificates.
5. Read the limits below and decide who owns backups and outage notifications.

## Start and create the first account

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
read -r -p 'Admin username: ' ADMIN_USERNAME
read -r -s -p 'Admin password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_USERNAME ADMIN_PASSWORD
docker compose exec -e ADMIN_USERNAME -e ADMIN_PASSWORD nib node create-admin.js
unset ADMIN_USERNAME ADMIN_PASSWORD
```

Sign in at `https://YOUR-DOMAIN`. Create team accounts through User management.
Production refuses startup if any active account still uses `password123`.
Passwords must contain at least 12 characters and at most 72 UTF-8 bytes.
Password resets revoke existing sessions. Keep at least one active administrator.

The Caddy profile handles certificates and redirects HTTP to HTTPS. It trusts
only the bundled proxy's fixed IP for forwarded client addresses. Change the
private subnet and the trusted IP together if they conflict with your server's
networks. If using another proxy, configure only its real address in TRUST_PROXY
and have it replace incoming forwarding headers; do not trust all addresses.
CORS is disabled by default in production; leave CORS_ORIGINS empty for this
same-origin deployment.

## Verify on the host

- `docker compose ps` shows nib healthy; check Caddy with the two compose files.
- `/api/health` is liveness; `/api/ready` verifies the database is readable.
- Sign in as each role. Check assignment, rejection, deadlines, archiving,
  restoring, playbooks, evidence downloads, and Word/CSV exports.
- Restart nib and confirm cases and attachments persist.
- Run a backup and restore drill into a separate clean deployment.
- Monitor HTTPS availability and disk space. Treat non-200 readiness as an alert.

## Backups and restore

```sh
sh deployment/backup.sh /absolute/private/backup-directory
```

The script stops nib briefly, archives the database (including SQLite WAL files)
and attachments together, then resumes nib if it was running. Schedule it on the
host; for example, run daily during your team's low activity period. Backups
contain sensitive information: encrypt off-site copies, restrict access, and set
retention according to your organization's requirements. Protect the `.env`
separately; it is not in the data archive.

Restore only a backup you trust, into a separate deployment with an empty data
volume and nib stopped:

```sh
sh deployment/restore.sh /absolute/path/to/nib-backup.tar.gz
docker compose -f compose.yaml -f compose.https.yaml up -d
```

The script refuses to overwrite an existing database or attachments. Use the
same application release initially, check `/api/ready`, then verify a saved case
and an attachment. Restoring requires the JWT secret and other configuration
from your separately protected configuration backup.

## Updates, logging, and recovery

Back up before every update. Pull the intended release and rebuild using both
Compose files. Store your previous image/release until the update is accepted.
If an update changed the database schema, restore the corresponding backup into
a fresh deployment rather than assuming an older application can read it.

`docker compose logs -f nib` emits structured request/error logs with request
IDs. It omits query strings, request bodies, and Authorization headers; configure
any external proxy or log collector similarly. Docker rotates logs. Monitor
`deadline_check_failed`, server errors, memory, disk capacity, and readiness.
Container restart policy recovers process exits; Docker healthchecks alone do
not restart an unhealthy but still-running process. Configure your monitoring
system to alert and provide an operator recovery procedure.

## Operational limits

- Login throttling is bounded in memory and resets on restart. It is for this
  single-process deployment; multi-instance operation needs a shared store.
- All active authenticated users can read cases and evidence. This is a shared
  SOC workspace, not a tenant-isolated product. Evidence downloads still support
  query-string tokens: do not log full URLs or share authenticated URLs.
- Only raster images render inline; other uploaded evidence downloads as an
  attachment. Files are not scanned for malware. If you accept untrusted evidence,
  use an isolated analysis workflow and integrate a scanner before general use.
- In-app notifications are persistent. Email is attempted after committing them,
  with failures recorded in email_log. There is no durable email retry queue;
  use in-app deadlines as the authoritative queue and monitor email failures.
- Large Word/CSV exports are built in memory. Establish practical case/evidence
  volume limits during staging capacity checks before increasing workload.
- No MFA or self-service password recovery is implemented. Limit access to your
  trusted team/network and arrange administrator recovery procedures.

## Checks completed versus host checks

Local verification covers dependencies, API behavior, authentication revocation,
security headers, body limits, reports, and browser workflows. GitHub Actions
also builds the Docker image and checks data backup/restore. A successful local
build does not verify certificates, DNS, Docker volume permissions, off-site
recovery, SMTP credentials, or your production traffic capacity. Complete those
host checks before accepting live operational data.
