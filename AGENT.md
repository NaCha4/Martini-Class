# Agent Instructions

This repository is a Firebase web app. Treat development changes and production operations as separate responsibilities.

## Project Context

- The app uses Firebase client SDKs from static web pages.
- Firebase Authentication is used for email/password login.
- Firestore stores app data such as applications, schedules, attendance, inventory, settings, and admin-facing records.
- Firebase Storage may be used for uploaded assets when enabled and allowed by rules.
- The current frontend is a static HTML/CSS/JavaScript site. There is no build step.
- Public pages, member pages, and admin pages share Firebase client utilities, but they must not share write privileges.

## Current Data Ownership Model

Keep operational configuration separate from user-submitted application records.

Admin-owned operational documents:

- `classSchedules/weekly`
- `eventPosts/{eventId}`
- `members/{memberId}`
- `officerDepartments/{departmentId}`
- `meetingMinuteTemplates/{templateId}`
- `meetingMinutes/{minuteId}`
- `memberAccessCodes/{codeHash}`

Member-created application documents:

- `classApplications/{studentId}`
- `eventApplications/{eventId_studentId}`

Public-created application documents:

- `membershipApplications/{applicationId}`

Rules and client code must preserve this boundary. Code-verified members must not write shared operational documents such as `classSchedules` or `eventPosts`.

Legacy applicant arrays may still exist in:

- `classSchedules/weekly.days[].applicants`
- `eventPosts/{eventId}.applicants`

These arrays are kept only for backward-compatible display and admin cleanup. New member-facing writes must use `classApplications` and `eventApplications`.

See `SECURITY_REFACTOR_NOTES.md` for the rationale and details of the 2026-07-05 data-flow refactor.

## Key Classification

Public client configuration may appear in client-side code:

- Firebase Web config, including web apiKey, auth domain, project ID, and app ID
- App Check reCAPTCHA site key

These values do not grant admin access by themselves. Protect Firebase resources with Security Rules, App Check enforcement, authorized domains, Google Cloud API key restrictions, and quota or budget controls.

Sensitive credentials must never be committed, pasted into chat, printed in logs, or exposed in client-side code:

- Firebase service account JSON
- Private keys and Admin SDK credentials
- FCM server keys
- OAuth access tokens and refresh tokens
- Real `.env` files or production credentials

Store local-only credentials in `.secrets/` or local environment variables. Keep `.env.example` free of real secret values.

## Agent Permission Boundary

Agents act as development practitioners, not production operators.

Agents may:

- Inspect repository configuration without printing secret values
- Edit application code, docs, tests, and local rules files
- Run local validation, lint, test, and dry-run commands
- Work on feature branches by default

## Context And Token Efficiency

- Prefer targeted file inspection over broad full-repository reads.
- Use `rg` and focused line ranges before opening large files.
- Avoid re-reading unchanged files unless the current task depends on them.
- Keep progress updates and final summaries concise, but include changed files, validation, and risks when security, auth, rules, deployment, or data handling is involved.
- Do not paste large code blocks, command outputs, diffs, rules, or logs into chat unless the user explicitly asks for them.
- When several files follow the same pattern, inspect representative examples first, then verify the result with search or tests.
- Summarize repetitive findings instead of listing every identical occurrence.
- For UI tweaks, edit the smallest relevant CSS/HTML/JS surface and verify with focused checks rather than restating the whole page structure.
- Preserve these efficiency rules only when they do not conflict with safety, encoding validation, secret handling, or production-operation restrictions.

## Documentation Update Policy

- Do not update `README.md` unless the user explicitly asks for it.
- Keep implementation changes and README maintenance separate by default.
- Other agent-facing or task-specific docs may be updated when they are directly relevant to the requested work.
- When authentication, authorization, Firestore Rules, Storage Rules, or production data shape changes, update the relevant agent-facing security notes if the user asks for documentation or handoff material.

## File Encoding Safety

- Preserve existing file encodings, especially for HTML, CSS, JavaScript, Markdown, and Firebase rules files that contain Korean text.
- Treat all source files as UTF-8 unless the file clearly uses another encoding.
- Do not rewrite whole files with shell commands such as PowerShell `Get-Content` + `Set-Content` for broad text replacement when the file contains non-ASCII text.
- Prefer targeted edits with `apply_patch` for manual changes.
- If a mechanical rewrite is unavoidable, explicitly read and write with UTF-8 and verify Korean text after the change.
- After any bulk edit, scan for mojibake, replacement characters, repeated question marks, or CJK-looking garbage that appears where Korean text should be.
- Before finishing work that touches Korean text, inspect representative changed files and run a text search to confirm Korean strings are still readable.

Agents must not do the following without explicit user approval:

- Push directly to `main` or `master`
- Force push
- Create pull requests
- Deploy production changes
- Deploy Firebase rules
- Modify, delete, migrate, or bulk-update production data
- Run Admin SDK scripts that write to production
- Change IAM, Owner, Editor, service account, API key, billing, quota, domain, or deployment settings
- Weaken Security Rules to broad public read or write access
- Reopen member write access to `classSchedules` or `eventPosts`
- Run production migrations that move legacy applicant arrays into application collections

## Approval-Required Commands

Ask for approval before running production-affecting commands, including:

```bash
firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase firestore:delete
firebase firestore:bulkdelete
```

Also ask before running any Admin SDK script that writes, deletes, migrates, or bulk-updates production data.

Dry-run and read-only inspection are allowed when they do not expose secret values or modify production state.

Allowed without production deployment:

```bash
firebase deploy --only firestore:rules --dry-run --project PROJECT_ID
firebase deploy --only storage --dry-run --project PROJECT_ID
```

## Local Secrets

Expected local-only layout:

```text
.secrets/
firebase-service-account.json
```

The real file name may differ, but local credential files must remain ignored by Git.

Recommended ignore patterns:

```gitignore
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
```

## Pre-Commit And Deploy Checklist

Before committing, merging, or deploying:

- Confirm no service account JSON, private key, token, or real `.env` file is staged
- Confirm `.gitignore` protects local secret paths and credential file patterns
- Confirm Security Rules deny broad unauthenticated writes and unknown document paths
- Confirm member-facing writes target only narrowly validated application collections
- Confirm `classSchedules` and `eventPosts` remain admin-write only
- Confirm public pages do not read private applicant, student, admin-only, or internal collections
- Confirm App Check is active before enforcing it for Firestore or Storage
- Confirm migrations have dry-run output before production writes
- Confirm Firebase rules deploys and production data operations have explicit user approval

## Refactor Safety Notes

- Prefer individual application documents over array updates on shared operational documents.
- Avoid storing new applicant data in `classSchedules.days[].applicants` or `eventPosts.applicants`.
- Admin screens may merge legacy arrays with application collections for display, but member screens must not write those legacy arrays.
- Date values that Security Rules compare must be stored as Firestore timestamps. Preserve `fromDateTimeLocalValue()` returning a `Date` object unless a replacement also stores timestamps.
- Do not hide permission errors by weakening rules. Align client writes with the intended collection model instead.
