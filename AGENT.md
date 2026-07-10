# Agent Instructions

This repository is a Firebase web app. Treat development changes and production operations as separate responsibilities.

## Project Context

- The app uses Firebase client SDKs from static web pages.
- Firebase Authentication is used for admin email/password login and member anonymous sessions.
- Firestore stores app data such as applications, schedules, attendance, inventory, settings, and admin-facing records.
- Firebase Storage may be used for uploaded assets when enabled and allowed by rules.
- The current frontend is a static HTML/CSS/JavaScript site. There is no build step.
- Public pages, member pages, and admin pages share Firebase client utilities, but they must not share write privileges.
- Shared modules and HTML entry scripts use explicit query-string cache versions. Keep shared imports on one identical URL so browser module singletons, especially the admin auth observer, are not duplicated.

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

Member session documents:

- `memberAccessSessions/{anonymousUid}`

Public-created application documents:

- `membershipApplications/{applicationId}`

Rules and client code must preserve this boundary. Code-verified members must not write shared operational documents such as `classSchedules` or `eventPosts`.

Member application permissions are intentionally create-only:

- Code-verified members may create `classApplications` and `eventApplications`.
- Members must not update or delete an existing application document.
- Admins may update or delete applications for corrections and management.
- The member UI checks for an existing document and directs the user to contact the administrators instead of overwriting `createdAt` or another applicant's record.

Member access sessions are also intentionally create-only:

- Each code login signs out any previous Firebase user and creates a fresh anonymous UID.
- The anonymous user creates one `memberAccessSessions/{uid}` document.
- `createdAt` is a server timestamp and is the authoritative start of the 24-hour session window.
- `expiresAt` remains only for compatibility with previously deployed clients or rules. Current authorization must not trust the client-computed value.
- The session owner may delete their own session during logout; admins may inspect or delete sessions.

Legacy applicant arrays may still exist in:

- `classSchedules/weekly.days[].applicants`
- `eventPosts/{eventId}.applicants`

These arrays are kept only for backward-compatible display and admin cleanup. New member-facing writes must use `classApplications` and `eventApplications`.

The following legacy paths are not used by the current frontend and remain admin-only:

- `classVotes/{studentId}`
- `classVoteState/{day}`
- `privateClasses/{classId}`
- `privateClassApplications/{applicationId}`
- `settings/voteConfig`

Do not reopen member access to these paths unless a new, reviewed data model and matching client flow are introduced.

## Current Authentication And Authorization Contract

- `watchAdminAuth()` owns one shared Firebase auth observer and fans state changes out to admin modules. Do not add one `onAuthStateChanged()` listener per admin module again.
- All admin modules must import the same versioned `firebase-client.js` URL. Different query strings create different browser module instances and defeat observer/service deduplication.
- Admin authorization currently depends on the same configured email string in `assets/js/firebase-client.js`, `firestore.rules`, and `storage.rules`. `tests/static-contracts.test.mjs` checks this consistency.
- Email-string authorization is a known limitation. Moving to an `admin` custom claim requires provisioning the claim before changing Rules; otherwise administrators can be locked out. Do not make that operational change without explicit approval.
- The shared member access code proves possession of the code, not a person's identity. Name/student-number checks in the browser are not a security boundary.
- A short numeric access code remains susceptible to online guessing because the client hashes and looks up the code. A complete fix requires a trusted server endpoint with rate limiting and server-issued identity/session claims.
- App Check is defense in depth. It does not replace Authentication, Rules validation, per-user identity binding, or rate limiting.

## Application State Contract

- `isApplicationWindowOpen()` in `assets/js/shared/common.js` is the client-side source of truth for manual/scheduled class state.
- A configured close time always closes applications at or after that time.
- When an open time exists, it takes precedence over the manual `isApplicationOpen` flag.
- Class application Rules must also require the selected `days[].isOpen == true` entry.
- Event applications require a valid recruitment window and must be rejected at or after `eventAt`.
- Admin manual class toggles clear the scheduled open/close values so the visible state and stored state cannot disagree.
- Event recruitment open time must be before close time, and close time must not be later than the event start.

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

## Known Structural Limitations

Do not describe the current static-client model as fully secure. The following risks remain unresolved:

- A shared access-code session is not bound to an individual member identity, so a code holder can impersonate another member in a crafted request.
- The member page currently reads all `members`, `classApplications`, and `eventApplications` needed for browser-side lookup and counts. This exposes more member/application data than a per-user design should.
- Capacity checks use client snapshots. Concurrent class or event submissions can exceed capacity because Rules cannot atomically count a collection.
- Legacy applicant arrays and application documents can represent the same student in different days/events until an approved production migration removes the legacy copy.
- Public membership applications remain exposed to spam or cost abuse without a trusted server-side rate limit.

Complete fixes require one or more of the following: individual Firebase Auth or school SSO, server-issued member claims, trusted Cloud Functions/API validation, aggregate count documents updated in transactions, and an approved legacy-data migration. These are architecture or production changes, not quick Rules relaxations.

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
- When authentication, authorization, Firestore Rules, Storage Rules, or production data shape changes, update this file and any present agent-facing security notes when the user asks for documentation or handoff material. Do not add references to security-note files that are absent from the repository.

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

If a dry-run reports expired or invalid Firebase credentials, report that the Rules were not remotely compiled. Do not claim validation success, attempt a real deploy, or bypass authentication. Reauthentication is a user-assisted prerequisite.

## Local Validation Workflow

There is no package manager or build step. Run the repository's direct checks from `Martini-Class/`:

```bash
node tests/common.test.mjs
node tests/static-contracts.test.mjs
```

Run syntax checks for every JavaScript module. In PowerShell:

```powershell
$files = rg --files -g '*.js' -g '*.mjs'
foreach ($file in $files) {
  node --check $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Also verify:

- Every relative HTML `src`/`href` target exists.
- Every relative JavaScript import exists after stripping its query string.
- Every static form explicitly uses `method="post"`; JavaScript-dependent sensitive submit buttons remain disabled until their handler is bound.
- `git diff --check` passes.
- Changed Korean text has no replacement characters or mojibake.
- `firestore.rules`, `storage.rules`, and CSS have balanced braces as a basic local check.
- Local pages and versioned module URLs return HTTP 200 from a simple static server.

These checks do not replace Rules compilation, Rules Emulator tests, or real-browser testing. When Firebase authentication is available, run the Rules dry-run before requesting deployment approval.

## Cache Version Coordination

- The current refactor uses `refactor-20260710` for page assets and `security-refactor-20260710` for auth-sensitive modules.
- When changing exported symbols in `firebase-client.js` or `shared/common.js`, bump the query string in every importing module and the relevant HTML entry scripts together.
- Never mix versioned and unversioned imports of `firebase-client.js` on the admin page; doing so creates separate module instances and multiple auth observers.
- Cache-version-only HTML changes are expected to touch many pages. Verify them mechanically rather than hand-checking only one page.

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

- Run `node tests/common.test.mjs` and `node tests/static-contracts.test.mjs`
- Run `node --check` for every `.js` and `.mjs` file
- Confirm no service account JSON, private key, token, or real `.env` file is staged
- Confirm `.gitignore` protects local secret paths and credential file patterns
- Confirm Security Rules deny broad unauthenticated writes and unknown document paths
- Confirm member-facing writes target only narrowly validated application collections
- Confirm member application writes are create-only and existing applications require admin correction
- Confirm `classSchedules` and `eventPosts` remain admin-write only
- Confirm member session expiry is derived from server-owned `createdAt`, not client-owned `expiresAt`
- Confirm class close time, individual day open state, event recruitment window, and event end time are enforced in both client policy and Rules
- Confirm all admin modules resolve to one identical versioned `firebase-client.js` URL
- Confirm public pages do not read private applicant, student, admin-only, or internal collections
- Confirm App Check is active before enforcing it for Firestore or Storage
- Confirm migrations have dry-run output before production writes
- Confirm Firebase rules deploys and production data operations have explicit user approval

## Refactor Safety Notes

- Prefer individual application documents over array updates on shared operational documents.
- Avoid storing new applicant data in `classSchedules.days[].applicants` or `eventPosts.applicants`.
- Admin screens may merge legacy arrays with application collections for display, but member screens must not write those legacy arrays.
- Date values that Security Rules compare must be stored as Firestore timestamps. Preserve `fromDateTimeLocalValue()` returning a `Date` object unless a replacement also stores timestamps.
- Preserve the first application `createdAt`. Do not use `{ merge: true }` from member submission code in a way that silently converts a create into an update.
- Treat a successful write followed by a failed refresh as a successful submission with a stale-view warning. Do not tell the user the write failed and encourage a duplicate retry.
- Do not add periodic full `renderMemberPage()` calls while a form may contain user input. Update time-sensitive controls narrowly or preserve draft state and focus.
- Keep code rotation and membership approval multi-document writes in Firestore batches. Avoid delete-then-create sequences that can leave zero active codes or partially approved records.
- Storage upload compensation must cover `uploadBytes`, `getDownloadURL`, and Firestore persistence. Capture `{ db, storage }` locally before asynchronous work so logout cannot replace the context mid-cleanup.
- Static forms containing credentials or personal information must use `method="post"`. If the form has no server fallback, keep its submit button disabled until JavaScript binds the handler.
- Do not hide permission errors by weakening rules. Align client writes with the intended collection model instead.
