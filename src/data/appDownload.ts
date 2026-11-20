/**
 * Android app download — one home for the APK URL and the promo rules.
 *
 * The APK is published by the Android workflow to GitHub Releases
 * (see .github/workflows/android.yml): a versioned release
 * (v<versionName>) plus a rolling `latest` release. The popup and the
 * login-page link always point at the rolling release, so the URL
 * never changes across versions — and it is public (no GitHub login
 * needed), unlike the workflow artifact. The link only works after
 * the first workflow dispatch that publishes a `latest` release.
 *
 * Promo rules (Mahadi 2026-11-21): the popup shows only to an
 * Android visitor on the WEB app who has not dismissed it. It never
 * shows inside the native app itself (detected the same way
 * src/native/backButton.ts detects the shell — Capacitor's native
 * platform check, i.e. the androidBridge/webkit bridge presence),
 * never on iOS, never on desktop. The dismissal flag is versioned
 * (…-v1) so a future major app release can re-show the promo by
 * bumping the key.
 */
import { Capacitor } from '@capacitor/core';

export const ANDROID_APK_URL =
  'https://github.com/Mriduul7621/shanta-life-agent-hub/releases/download/latest/app-release.apk';

/** Versioned dismissal flag — bump the suffix to re-show the promo. */
export const ANDROID_PROMO_DISMISSED_KEY = 'hub-android-promo-dismissed-v1';

/** True on an Android device (user-agent, with userAgentData as backup). */
export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android/i.test(navigator.userAgent)) return true;
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  return uaData?.platform === 'Android';
}

/** True when the web app runs inside the native Agent Hub app. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** The full promo gate: Android + web (not native) + not dismissed. */
export function shouldShowAndroidPromo(): boolean {
  if (isNativeApp()) return false;
  if (!isAndroidDevice()) return false;
  try {
    // If storage is unavailable we cannot record a dismissal, so do
    // not show — otherwise the popup would nag on every visit.
    if (localStorage.getItem(ANDROID_PROMO_DISMISSED_KEY) === '1') return false;
  } catch {
    return false;
  }
  return true;
}

/** Record a dismissal (close, "Not now", or tapping Download). */
export function dismissAndroidPromo(): void {
  try {
    localStorage.setItem(ANDROID_PROMO_DISMISSED_KEY, '1');
  } catch {
    /* storage unavailable — nothing to persist */
  }
}
