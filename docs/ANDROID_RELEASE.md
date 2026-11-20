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
   and uploads the APK + its `.sha256` as an artifact (90-day
   retention). The run summary prints the version and SHA-256.
4. Download the artifact, archive the APK outside Actions (Cloudinary
   raw file — the decided artifact home; Supabase Storage cannot carry
   release files), and distribute to the pilot group through the
   decided channel with the install instructions.

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
