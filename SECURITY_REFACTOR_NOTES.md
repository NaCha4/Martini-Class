# Security Refactor Notes

Date: 2026-07-05

This document records why the Firebase data flow was refactored and what changed. It is intended for future maintainers and agents reviewing this project.

## Why This Was Changed

The previous member-facing application flow allowed code-verified members to write directly to shared operational documents:

- `classSchedules/weekly`
- `eventPosts/{eventId}`

Those documents contain configuration and operational data such as open/closed state, capacity, schedules, event details, and applicant arrays. Allowing non-admin users to write these documents created several risks:

- A code-verified member could potentially alter operational fields if a request was modified outside the UI.
- Applicant arrays on shared documents were vulnerable to race conditions and lost updates during simultaneous applications.
- Firestore Security Rules could not easily validate that only one applicant was added without allowing broader document writes.
- The code and rules had drifted apart: some rules already implied individual application documents, while the UI still wrote to aggregate documents.

The refactor separates operational configuration from user submissions.

## New Data Ownership Model

Admin-owned operational documents:

- `classSchedules/weekly`
- `eventPosts/{eventId}`
- `members/{memberId}`
- `officerDepartments/{departmentId}`
- `meetingMinuteTemplates/{templateId}`
- `meetingMinutes/{minuteId}`

Member-created application documents:

- `classApplications/{studentId}`
- `eventApplications/{eventId_studentId}`

Public-created application documents:

- `membershipApplications/{applicationId}`

Admin-only review and management:

- Admins can read, approve, reject, update, or delete membership applications.
- Admins can delete class and event application documents.
- Admins can still manage legacy applicant arrays if old data exists, but new member writes should not use those arrays.

## What Changed

### Firestore Rules

`classSchedules` and `eventPosts` are now admin-write only.

Code-verified members can create or update only narrowly validated application documents:

- `classApplications/{studentId}`
- `eventApplications/{eventId_studentId}`

Public users can create membership applications only when the submitted fields match the allowed schema and the status is `pending`.

Admins retain full review access for:

- `membershipApplications`
- `classApplications`
- `eventApplications`

### Member Page

The member page no longer writes directly to `classSchedules/weekly` or `eventPosts/{eventId}`.

Instead:

- Regular class applications write to `classApplications/{studentId}`.
- Event applications write to `eventApplications/{eventId_studentId}`.
- The UI merges legacy applicant arrays with new application documents for display compatibility.

### Admin Page

The admin class and event screens now read the new application collections and merge them into the existing applicant-list UI.

Deletion behavior was updated:

- Deleting a class applicant removes the corresponding `classApplications` document when applicable.
- Deleting an event applicant removes the corresponding `eventApplications` document when applicable.
- Deleting an event post also deletes associated `eventApplications` documents.

### Membership Applications

A public membership application form was added to the join page.

A new admin membership application management screen was added. Admins can:

- Review applications
- Approve applications
- Reject applications
- Delete applications

Approving an application creates or updates a member record in `members`.

### Date Handling

`fromDateTimeLocalValue()` now returns a `Date` object instead of an ISO string. This allows Firestore to store timestamp values that can be compared safely in Security Rules.

## Compatibility Notes

Legacy applicant arrays are still read and displayed for compatibility:

- `classSchedules/weekly.days[].applicants`
- `eventPosts/{eventId}.applicants`

New member submissions should not write to those arrays.

A future approved production migration may move legacy applicants into:

- `classApplications`
- `eventApplications`

That migration must not be run without explicit user approval because it modifies production data.

## Operational Notes

This refactor only changes local repository files unless deployed separately.

To activate the new access model in production, Firestore Rules must be deployed after review:

```bash
firebase deploy --only firestore:rules --project martini-class-d4d69
```

Production deployment requires explicit user approval.

Before deploying, verify:

- Member code login still works.
- Class application creates a `classApplications/{studentId}` document.
- Event application creates an `eventApplications/{eventId_studentId}` document.
- Admin class and event screens display applicants from the new application collections.
- Membership application submission creates a pending `membershipApplications` document.
- Admin membership approval creates or updates a `members` document.

## Do Not Reintroduce

Do not reintroduce member writes to:

- `classSchedules`
- `eventPosts`

Do not broaden rules to public or member writes on operational documents to quickly fix a permission issue. Fix the client flow or add a narrowly validated application document instead.
