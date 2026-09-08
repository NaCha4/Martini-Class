# Authentication access change

The proposed admin policy permits all email/password Firebase Authentication accounts. Anonymous member sessions remain excluded. The frontend checks password provider membership; Firestore and Storage require a token issued by password sign-in. The current admin login uses email/password only.

## High risk: account creation

This policy does not distinguish console-created accounts from accounts created through Firebase's public signup API. Hiding a signup form does not disable signup. Before deployment, verify that untrusted users cannot create email/password accounts or link anonymous accounts to the password provider. If that cannot be enforced, use an explicitly provisioned admin claim or allowlist instead. App Check alone is not an administrator approval mechanism.

## Credentials and operations

Firebase Web configuration and App Check site keys are public client configuration, not administrative credentials. Private keys, service account files, real environment values, and tokens must remain local, ignored by Git, and absent from logs and commits.

Production deployment, production data modifications, IAM changes, and account provisioning policy changes require explicit user approval. This local change does not perform those operations.

## Merge and deployment checklist

- Verify account creation restrictions before granting every password account admin access.
- Run both existing test files and JavaScript syntax checks.
- Compile and test Firestore and Storage rules, including anonymous denial and password-account access.
- Review the auth changes and confirm no credentials are staged.
- Obtain explicit approval before merge/push of this security-sensitive change and before production deployment.
- Deploy matching frontend and rules versions, then verify a newly created password account and an anonymous member session.
- README and AGENT.md descriptions of the previous fixed-email policy are historical until separately updated; this document describes the proposed change.

Reference: https://firebase.google.com/docs/reference/rest/auth#section-create-email-password
