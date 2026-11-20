# Agent Hub — Android release guide

How the Android APK is signed, built and released. Read alongside the
Phase 1 audit (`ANDROID_AUDIT.md`) and checklist
(`ANDROID_CHECKLIST.md`) in the goal workspace
(`files/app-deployment/`).

## The one thing that must never be lost: the release keystore

Android identifies an app by **package id + signing key**. An update
installs in place only if it carries the **same signer** and a higher
`versionCode`. If the release keystore is lost, no future APK can ever
update the installed app — every employee would have to uninstall and
reinstall (this is exactly the Learning Hub's problem: its signer was a
debug key held only in a CI cache, which is why its users must uninstall
before every install).

So: **one keystore, created once, kept in two places** — an offline copy
with the named custodian (Mahadi), and a base64 copy in GitHub Secrets
for CI. The keystore file and its passwords are **never committed** to
the repo, never pasted into chat, and never emailed.

## 1. Create the keystore (Mahadi, once, on his own machine)

Needs a JDK: install **Temurin 21** from <https://adoptium.net> (the
`.msi`, default options) — `keytool` then works in Git Bash. Run in Git
Bash, in a folder only he controls:

```bash
keytool -genkeypair \
  -keystore agenthub-release.keystore \
  -alias agenthub-release \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -dname "CN=Shanta Life Insurance PLC, OU=Training and Development, O=Shanta Life Insurance PLC, L=Dhaka, ST=Dhaka, C=BD" \
  -storepass "<CHOOSE-A-STRONG-PASSWORD>" \
  -keypass "<SAME-PASSWORD>"
```

Notes:

- `-validity 9125` = 25 years. The key must outlive the app — Android
  refuses to install an update signed by an expired key.
- Store password and key password are the same value here (standard for
  a single-purpose keystore). Choose one strong password and keep it
  **separate from the file** (password manager, or written down
  somewhere other than where the file lives).
- Check it worked:
  `keytool -list -v -keystore agenthub-release.keystore -alias agenthub-release`
  — it prints the certificate, including its SHA-256 fingerprint. That
  fingerprint is public material (it identifies the key, it cannot sign
  anything) — record it in the handover so any APK's signer can be
  checked against it.

Then:

1. **Offline backup:** copy `agenthub-release.keystore` to protected
   storage (encrypted USB / secure drive — not left on the Desktop).
   This copy is the recovery path if GitHub Secrets are ever lost.
2. **GitHub Secrets:** in Git Bash,
   `base64 -w0 agenthub-release.keystore | clip` copies the base64 of
   the file. In the repo → Settings → Secrets and variables → Actions →
   New repository secret, create these four (values only — the names
   are what the workflow reads):
   - `AGENTHUB_KEYSTORE_B64` — the base64 just copied
   - `AGENTHUB_KEYSTORE_PASSWORD` — the password
   - `AGENTHUB_KEY_ALIAS` — `agenthub-release`
   - `AGENTHUB_KEY_PASSWORD` — the same password
3. Delete the working copy of the `.keystore` file from the machine it
   was made on once the offline backup + the secret are confirmed.

## 2. Get the workflow into the repo (Mahadi, once)

`.github/workflows/android.yml` is prepared locally, but the Muse
GitHub App **cannot push workflow files** (deterministic 403 — the App
lacks `workflows: write`). Two routes:

1. **Mahadi uploads it** via the github.com web UI (repo → Add file →
   Upload files, onto `main`), or
2. **Mahadi grants the App the Workflows permission** in the
   installation settings, after which the prepared file can be pushed
   normally.

Do not retry a connector push of a workflow file — it cannot succeed.

## 3. Build a release (any release operator)

1. Bump the version first: edit `android/version.properties`
   (`versionCode` +1 exactly, `versionName` per the release) and commit
   it on `main`. The version is owned by this file, never by CI.
2. GitHub → Actions → **Android release APK** → Run workflow.
3. The run: installs Node 22 + JDK 21 + Gradle 8.14.3 + Android SDK 36,
   regenerates the launcher icons, syncs the Capacitor shell, restores
   the keystore from secrets, builds the signed release APK, then
   verifies it — signature valid, signer fingerprint matches the
   keystore (never a debug key), version matches `version.properties` —
   then publishes the APK + its `.sha256` to **GitHub Releases** (a
   versioned `v<versionName>` release plus the rolling `latest`
   release — see §6) and uploads the same two files as a workflow
   artifact (90-day retention, backup only). The run summary prints
   the version, SHA-256 and the release links.
4. Distribute to the pilot group through the decided channel with the
   install instructions — the public download link is the rolling
   release (see §6), so there is nothing to re-send per version. The
   artifact is the backup; the APK can also be archived outside
   Actions (Cloudinary raw file — the decided artifact home; Supabase
   Storage cannot carry release files).

## 4. Local builds (developers)

- Needs JDK 21 + Android SDK 36 + Gradle 8.14.3 installed locally (the
  Gradle wrapper jar is not committed — it is a binary; run
  `gradle wrapper --gradle-version 8.14.3` once if you want `./gradlew`).
- `npm ci && npm run android:assets && npx cap sync android`
- `gradle -p android :app:assembleDebug` — debug build, local
  validation only, **never distributed**. A release build needs the
  keystore injected from the custodian's copy via
  `AGENTHUB_KEYSTORE_PATH` (+ the three password/alias env vars) and
  the file must never be committed.

## 5. Version + update rules (the LH lessons, enforced)

- `versionCode` only ever goes up, by exactly 1 per release. A lower
  code than the installed build is refused by Android
  (`INSTALL_FAILED_VERSION_DOWNGRADE`).
- Every release APK is signed by the **same** release keystore. A
  different signer is refused (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
- The first release is `versionCode 1`, `versionName 1.0.0`. The Hub
  has no installed base (confirmed by Mahadi 2026-11-20), so release 1
  is a clean first install — no migration, nothing to outrank.
- In-place update drill (before wider rollout): bump to `versionCode`
  2, build, install over the pilot build — it must update in place
  with data intact. If it does not, stop: the signing identity or the
  version is wrong.

## 6. GitHub Releases + the web download popup

Every dispatch publishes two public releases (no GitHub login needed
to download):

- `v<versionName>` — the permanent record for that version.
- `latest` — the rolling release. Each dispatch re-uploads the APK +
  `.sha256` with `--clobber`, so the files are always the newest
  build. (The `latest` tag itself keeps pointing at the commit that
  first created it — only the assets move. The download URL serves
  the newest assets regardless.)

The downloaded file carries the app name + version (Mahadi
2026-11-21): `Agent-Hub-V-1.0.0.1.apk` — `Agent-Hub-
V-<versionName>.<versionCode>.apk`, set by the workflow's Publish
step (the `.sha256` file carries the same base name). DASHES, not
spaces: GitHub turns spaces into dots in release asset names
(verified live 2026-11-21 — the spaced name was served as
`Agent.Hub.V-1.0.0.1.apk`). Because the asset name changes with
every version, the web app does NOT link to GitHub directly: from
one constant (`ANDROID_APK_URL` in `src/data/appDownload.ts`) it
links to the Hub's own download route:

`https://shanta-life-agent-hub.vercel.app/api/download-apk`

The route (`api/download-apk.js`) asks the GitHub Releases API for
the `latest` release and redirects to its newest `.apk` asset, which
GitHub serves under its friendly stored name — so the Hub link never
changes across versions and never 404s through a version change.
`latest` holds exactly one APK: the workflow deletes the previous
version's `.apk`/`.apk.sha256` assets before uploading the new one.
If GitHub is unreachable or no release exists yet, the route sends
the user to the releases page instead of failing.

**Sequencing:** the popup's download link only downloads AFTER the
next workflow dispatch publishes the first `latest` release. Until
that run, the route lands on the releases page — so ship the popup
and run the workflow before telling users about the download.

**Popup behaviour (Mahadi 2026-11-21):** on Home, after the splash,
an Android web visitor who has not dismissed it sees a popup — "Get
the Android app", one line, a Download button (plain link to the
`latest` APK; Android Chrome downloads it directly) and a close
control. The SAME popup also appears on the login page, so visitors
are asked BEFORE they sign in, not only after. Tapping Download
also dismisses the popup. It never shows inside the native app
itself (Capacitor native-platform detection — the same check the
back button uses), never on iOS, never on desktop. Dismissal is
stored in localStorage under the versioned key
`hub-android-promo-dismissed-v1` — shared by both pages, so
dismissing on login hides it on Home too — bump the suffix to
re-show the promo for a future major release. The login page also
carries the same link (small, Android-only, hidden in the native
app) for users who dismissed the popup or never saw it.

## 7. Firebase + push notifications (FCM)

FCM is the Hub's ONLY notification surface — the Hub has NO in-app
bell, by design (Mahadi 2026-11-21). A Learning Hub / LeadFlow
notification published to the user's topic also lands in the Hub app,
and tapping it opens that module in-app.

### One Firebase project for all three apps

**"Shanta Life Apps"** — one project, all three Android apps
registered in it (Hub, Learning Hub, LeadFlow), each with its own
`google-services.json`. Mahadi creates the project in the Firebase
console. No paid service is involved: FCM is free with no message
limit, and no billing is needed for it.

### What Mahadi sets up (once)

1. **Firebase console → Project settings → Your apps → Add app →
   Android**, package name `com.shantalife.agenthub`, download
   `google-services.json`. In Git Bash,
   `base64 -w0 google-services.json | clip`, then repo → Settings →
   Secrets and variables → Actions → New repository secret:
   - `AGENTHUB_GOOGLE_SERVICES_JSON_B64` — the base64 just copied
   The workflow restores it into `android/app/google-services.json`
   before every build and verifies it is for
   `com.shantalife.agenthub`. The file is gitignored — never commit
   it. (A build dispatched BEFORE the secret is set still succeeds —
   it just ships WITHOUT push. The run summary says which kind of
   build it was.)
2. **Firebase console → Project settings → Service accounts →
   Generate new private key** — download the service-account JSON.
   In Git Bash, `base64 -w0 <file>.json | clip`, then Vercel →
   shanta-life-agent-hub → Settings → Environment Variables →
   New (Production target):
   - `FIREBASE_SERVICE_ACCOUNT_B64` — the base64 just copied
   The Hub's `/api/push-subscribe` route uses it to mint a Google
   OAuth token and subscribe device tokens to topics. The JSON
   contains a private key: same handling as the Hub signing key —
   never committed, never pasted into chat.
3. Re-upload `.github/workflows/android.yml` (it carries the
   google-services restore step) and dispatch. The APK from that run
   is the first push-enabled build.

### How it works

- **Topics, no token storage.** On native sign-in (or session
  restore) the Hub subscribes the device to the topic
  `user-{employeeId}` — e.g. `user-2025019` (one place derives the
  name: `userPushTopic` in `src/native/pushRouting.ts`). The LH/LF
  servers publish each user notification to that topic with data
  `{source, title, body, route, module}`. Every subscribed app
  receives it. No FCM token is stored anywhere: the client sends its
  token to `POST /api/push-subscribe` with its Hub JWT, the route
  derives the topic from the JWT's `sub` claim (never from the
  request body — a client must never choose whose topic it joins)
  and subscribes the token through FCM's IID API, then forgets it.
- **Why a server route subscribes:** @capacitor/push-notifications
  has NO topic subscribe/unsubscribe API (verified against the 8.1.3
  sources — only permission, register/unregister, delivered
  notification and channel calls). The route is the subscription
  mechanism. Unsubscribe needs no route: sign-out / session expiry
  calls `PushNotifications.unregister()`, which deletes the FCM
  token, and FCM drops a dead token from every topic — this also
  covers expiry, where the JWT is already dead.
- **Permission:** requested once after native sign-in, only while
  undecided. Denied stays silent forever — no nagging, no bell
  fallback. Android 12 and below need no runtime permission (the
  plugin reports granted).
- **Tap routing** (`resolvePushTarget` in
  `src/native/pushRouting.ts` — same-tab, exactly like tapping the
  tile; plain module URL, no SSO fragment, because LeadFlow and
  Learning Hub are not ssoJoined):

  | data | opens |
  | --- | --- |
  | `source: 'leadflow'` | LeadFlow module (plus `route` when it is a relative path, e.g. `/workbench`) |
  | `source: 'learning'` | Learning Hub module (plus `route`) |
  | anything else / missing | Hub Home |

  A `route` that is an absolute URL, protocol-relative (`//…`), or
  carries a fragment is ignored — push data must never drive an
  open redirect.

### Verified limits (read from the 8.1.3 plugin sources)

- **Cold-start taps do not deep-link.** The plugin fires the tap
  event only from `onNewIntent` and never inspects the launch
  intent — tapping a notification while the app is killed opens Hub
  Home. Taps while the app is open or backgrounded DO deep-link.
- **Taps while a module page is showing just foreground the app.**
  The Hub's JS (and its listener) is not running on a module page —
  the bridge resets listeners on every navigation.
- **Foreground receipt shows no banner.** The FCM SDK auto-displays
  in the tray only when the app is backgrounded, and the Hub shows
  nothing in-app (no bell by design). The user sees the notification
  when they open the module.
- **No Firebase project yet = no push, not a broken app.** Without
  the secret, registration fails silently and subscribe is never
  attempted; without the service account, `/api/push-subscribe`
  answers 503 `push_not_configured` and the client stays silent.

### Testing (after the project + secrets + dispatch)

1. Install the push-enabled APK, sign in (accept the permission
   prompt when it appears).
2. Firebase console → Cloud Messaging → Send test message → Topic
   `user-{employeeId}`, notification title/body + data
   `source=leadflow`, `route=/workbench` → Send. The device shows the
   notification; tapping it opens LeadFlow in-app.
3. Sign out on the device, send another test message to the same
   topic — nothing must arrive (the token was deleted on sign-out).
