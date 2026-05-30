Security And Operations Policy
This repository is a Firebase web app. Treat development changes and production operations as separate responsibilities.

Key Classification
Public client configuration may appear in client code:

Firebase Web config, including web apiKey, auth domain, project ID, and app ID
App Check reCAPTCHA site key
These values do not grant admin access by themselves. Protect Firebase resources with Security Rules, App Check enforcement, authorized domains, Google Cloud API key restrictions, and quota or budget controls.

Sensitive credentials must never be committed, pasted into chat, printed in logs, or exposed in client-side code:

Firebase service account JSON
Private keys and Admin SDK credentials
FCM server keys
OAuth access tokens and refresh tokens
Real .env files or production credentials
Store local-only credentials in .secrets/ or local environment variables. Keep .env.example free of real secret values.

Codex Permission Boundary
Codex acts as a development practitioner, not a production operator.

Codex may:

Inspect repository configuration without printing secret values
Edit application code, docs, tests, and local rules files
Run local validation, lint, test, and dry-run commands
Work on feature branches by default
Codex must not do the following without explicit user approval:

Push directly to main or master
Force push
Create pull requests
Deploy production changes
Deploy Firebase rules
Modify, delete, migrate, or bulk-update production data
Run Admin SDK scripts that write to production
Change IAM, Owner, Editor, service account, API key, billing, quota, domain, or deployment settings
Weaken Security Rules to broad public read or write access
Approval-Required Commands
Ask for approval before running production-affecting commands, including:

firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase firestore:delete
firebase firestore:bulkdelete

Also ask before running any Admin SDK script that writes, deletes, migrates, or bulk-updates production data.

Dry-run and read-only inspection are allowed when they do not expose secret values or modify production state.

Local Secrets
Expected local-only layout:

.secrets/
firebase-service-account.json

The real file name may differ, but local credential files must remain ignored by Git.

Recommended ignore patterns:

.env
.env.*
!.env.example
.secrets/
firebase-service-account*.json
*.service-account.json
serviceAccount.json
service-account.json
firebase-adminsdk.json
*.pem
*.key
*.p12
*.pfx
*-private-key.json

Pre-Commit And Deploy Checklist
Before committing, merging, or deploying:

Confirm no service account JSON, private key, token, or real .env file is staged
Confirm .gitignore protects local secret paths and credential file patterns
Confirm Security Rules deny broad unauthenticated writes and unknown document paths
Confirm public pages do not read private applicant, student, admin-only, or internal collections
Confirm App Check is active before enforcing it for Firestore or Storage
Confirm migrations have dry-run output before production writes
Confirm Firebase rules deploys and production data operations have explicit user approval