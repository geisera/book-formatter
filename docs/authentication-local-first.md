# Architecture decision: required authentication with local-first manuscripts

**Status:** Approved product requirement; implementation pending  
**Date:** October 31, 2026  
**Controlling references:** [PRD v1.2](PRD.md), AUTH-001–AUTH-008; [README](../README.md)

## Decision

Book Formatter is a web application. Every author must authenticate before entering the author workspace or using manuscript management, editing, previews, and export. Guest authoring is no longer part of the intended product. Authentication is **not** synonymous with cloud manuscript storage: books and associated assets are created and edited locally (Dexie/IndexedDB and approved browser storage), with optional, separately consented cloud sync.

Public marketing, registration, sign-in, verification and recovery routes can remain anonymous. Authenticated application routes and server endpoints must validate identity and permissions through server-enforced controls; a client-side hide/show guard alone is insufficient. Hosted API endpoints must not allow users to bypass authentication by direct requests.

## Offline identity and session continuity

Initial sign-in, verification, recovery and new-device session establishment require an internet connection to the identity provider. Once authenticated online, a cached application can support offline local authoring under a **bounded, explicitly specified offline authorization window**. Its duration and method of validation are not yet chosen; do not claim permanent offline access, instantaneous detection of remote revocation, or secure identity validation from a username merely saved in IndexedDB. When that window expires, access to the author workspace must require online reauthentication, subject to a separate documented recovery/export pathway.

Avoid storing passwords, long-lived bearer refresh credentials or server secrets in manuscript data. Select and threat-model an appropriate session pattern before implementation. Authentication and account verification must not cause manuscript bytes to be uploaded automatically.

## Local data ownership and shared-device boundaries

Associate each local project with a verified account identity and prevent an account switch from displaying or modifying another account's project list. Browser storage is not automatically encrypted; separating records by account ID is a UI/data-isolation control, not cryptographic protection from someone with access to the device/browser profile. Preserve complete local backup and restore, explicit deletion, and a documented path for recovering author-owned files if an account is inaccessible. Sign-out invalidates access; it must not silently delete manuscripts.

**Server-side security** (when applicable): least privilege, route/API authorization, private objects, per-user policies/RLS, session and CSRF controls, and auditable privileged actions. **Local processing:** ProseMirror editing, file import, EPUB and PDF workers run on the user's device and require no server rendering. Remote synchronization/backups are opt-in.

## Implementation and acceptance plan

1. Select identity provider and session/cookie strategy; define offline session expiry, revocation assumptions, and portable-data recovery policy.
2. Add authenticated public/private route separation and server-protected APIs; ship registration, sign-in, verification, recovery and sign-out.
3. Associate IndexedDB projects with the authenticated account; design account switching and local-data access safeguards.
4. Preserve work after connectivity loss within the authorized offline interval. Handle expired authorization without deleting data.
5. Add tests for anonymous route denial, unauthenticated direct API calls, cross-account isolation, sign-out, expiry, offline continuation, recovery and no unsolicited manuscript transmission.
6. Update deployment, onboarding, support and privacy documentation after implementation and complete security review.

## Boundaries and non-goals

This decision does not add cloud sync, mandatory manuscript upload, server-side PDF generation, billing or provider lock-in. Identity provider selection and offline authorization lifetime remain open engineering decisions. **No authentication capability is claimed implemented solely because this architecture decision is documented.**
