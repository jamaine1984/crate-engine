# Platform client contracts

The client uses native ESM and the existing Vite entry. `index.html` mounts `app.mjs`; no engine or character source is imported by the platform shell. `/play` remains the actual editor. All data calls use `/api/platform`, same-origin credentials, status-aware JSON responses, and no stored access token. Mutations rely on the browser Origin header and server enforcement. Data is escaped before HTML interpolation.

## Server-backed screens

| Screen | Calls |
| --- | --- |
| Home, search, free/premium catalog | GET `/catalog?q=&kind=&page=` -> `{games,total,page}` |
| Game detail | GET `/catalog/:slug` -> `{game}` |
| Game play | POST `/player/sessions` `{gameId}` -> `{session}`; root-owned `player-bridge.mjs` mounts isolated iframe |
| Session | GET `/me` -> `{user:null or user}`; user roles remain server authoritative |
| Favorites | GET `/favorites`; POST `{gameId}`; DELETE `/favorites/:id` |
| Library, history, notifications | GET corresponding endpoint -> `{items}` |
| Notifications | PATCH `/notifications/:id` |
| Rewards | GET `/wallet` -> `{balances:{points,credits,tokens},transactions}`; reward/ad controls disabled |
| Profile | PUT `/profile` `{displayName,username}` |
| Preferences | GET/PUT `/preferences` `{reducedMotion,analyticsConsent,advertisingConsent,language}` |
| Cloud projects | GET/POST `/projects`; GET/PUT/DELETE `/projects/:id`; update supplies revision |
| Waitlist | POST `/waitlist`; requires logged-in verified email; returned `{joined:true}` |
| Developer listings | GET/POST `/developer/games`; GET/PUT `/developer/games/:id` |
| Developer analytics | GET `/developer/analytics` -> `{games,earnings}` |
| Submit review | POST `/developer/games/:id/submit` `{versionId,rightsConfirmed:true}` |
| Game reports | POST `/reports` `{gameId,category,detail}` |
| Owner | GET `/owner/overview`, `/owner/games`, `/owner/players`, `/owner/creators`, `/owner/flags`, `/owner/agreements`, `/owner/audit`, `/owner/security`, `/owner/infrastructure`, `/owner/storage`, `/owner/commerce`, `/owner/ads`, `/owner/sales`, `/owner/payouts` |
| Owner mutations | PUT `/owner/flags`; POST agreements/assign; POST game review; PUT account roles/status; PUT game members; PUT thresholds |

Public game fields are normalized in `api.mjs` from server `cover`, `hero`, `priceMinor`, `genres`, `metadata.controls` to shared display aliases. Server timestamps are Unix seconds; date helper converts them. No title, rating, player count, sale, income or game activity is fabricated. Empty catalog sections remain honest launch states.

## Authentication

- JSON POST `/auth/register` with email/password/username/displayName.
- JSON POST `/auth/login`; if `{mfaRequired,challengeId}`, JSON POST `/auth/mfa/verify` with challengeId/code.
- Password/verification: POST `/auth/reset/request`, `/auth/reset/confirm`, `/auth/verification/request`, `/auth/verification/confirm`.
- Email links: `/reset-password#token=...`, `/verify-email#token=...`.
- Google navigation: `/api/platform/auth/google/start`; MFA callback supported as `/login#mfaChallenge=...`.
- Session list/revoke: GET `/auth/sessions`, DELETE `/auth/sessions/:id`; POST logout/logout-all.
- MFA enrollment and confirmation; POST `/auth/reauth` with password/optional code; DELETE `/auth/account` with confirmation `DELETE`.
- Provider absence, rate limits and server errors are displayed, without a simulated success.

## ZIP upload

POST `/developer/uploads` reserves `{gameId,platform,version,sizeBytes,fileName,releaseNotes}`. Result `upload` contains id, partBytes and parts. Client sends binary Blob parts using PUT `/developer/uploads/:id/parts/:partNumber`, then JSON POST `/complete`. A failed incomplete upload attempts POST `/abort`. The reserved file size and upload limits are checked. The resulting success is *quarantined*, not published or validated. No client scanning claim.

## Deliberate availability limits

Payments, ad rewards, payouts, marketplace selling and direct support are shown as unavailable until the corresponding actual service exists. Owner operational views without a backend show an explicit unavailable message. Public signup needs real email configuration. Avatar/bio editing is omitted because the profile API does not persist those fields. Legal text is identified as prelaunch information requiring final operating details before public launch.

## Verification

All client `.mjs` files passed `node --check` on 2026-09-27. Integrated build, UI browser capture and real account test coordination are owned by the root task. Source inspection alone is not proof of browser or signed-in production behavior.
