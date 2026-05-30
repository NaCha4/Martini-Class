# Security And Operations Policy

This repository is a static Firebase web app. Treat development changes and production operations as separate responsibilities.

## Key Classification

Public client configuration:
- Firebase Web config in `assets/js/firebase.js`
- App Check reCAPTCHA site key in `assets/js/firebase.js`

These values can be present in client code. They do not grant admin access by themselves, but they must be protected with Firebase Security Rules, App Check, authorized domains, and Google Cloud API key restrictions.

Sensitive credentials:
- Firebase service account JSON
- Admin SDK private keys
- FCM server keys
- OAuth refresh/access tokens
- Any `.env` file containing real credentials

Sensitive credentials must stay outside Git. Store local service account files under `.secrets/`, keep them ignored, and rotate them immediately if they are exposed.

## Codex Permission Boundary

Codex may:
- Inspect repository configuration without printing secret values.
- Edit application code, docs, tests, and local rules files on a feature branch.
- Run local validation commands.
- Commit or push feature branches when the changes are non-operational and low risk.

Codex must not do the following without explicit user approval:
- Push directly to `main` or `master`.
- Force push.
- Deploy production changes.
- Modify or delete production Firestore, Storage, or Realtime Database data.
- Change IAM, Owner, Editor, or service account permissions.
- Create, delete, rotate, or replace API keys or service account keys.
- Change billing, quota, domain, or production deployment settings.
- Weaken Security Rules to public write or broad public read access.

## Required Approval Before Execution

Ask for approval before running commands that affect production state, including:

```powershell
firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase firestore:delete
firebase firestore:bulkdelete
```

Also ask before running any Admin SDK script that writes, deletes, migrates, or bulk-updates production data.

## Local Secrets

Expected local-only layout:

```text
.secrets/
  firebase-service-account.json
```

The real file name can differ, but it must remain ignored by Git.

## Review Checklist

Before merging or deploying:
- Confirm `git status` has no secret files staged.
- Confirm Security Rules do not allow broad unauthenticated writes.
- Confirm App Check is active before enforcing it for Firestore or Storage.
- Confirm migrations have dry-run output before production writes.
- Confirm production deploys are approved by the project owner.
