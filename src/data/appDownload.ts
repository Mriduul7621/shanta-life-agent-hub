/**
 * Android app download — one home for the APK URL and the promo rules.
 *
 * The APK is published by the Android workflow to GitHub Releases
 * (see .github/workflows/android.yml): a versioned release
 * (v<versionName>) plus a rolling `latest` release. The file users
 * download carries the app name + version — "Agent Hub
 * V-1.0.0.1.apk" (Mahadi 2026-11-21) — so the asset name changes
 * with every version. The popup and the login-page link therefore do
 * NOT point at GitHub directly: they point at the Hub's own
 * /api/download-apk route, which redirects to the newest .apk asset
 * in `latest` (see api/download-apk.js). The URL never changes
 * across versions, the download is public (no GitHub login needed),
 * unlike the workflow artifact — and the link keeps working through
 * a version change, with no window where it 404s. Until the first
 * workflow dispatch publishes a `latest` release, the route sends
 * the user to the releases page instead.
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

export const ANDROID_APK_URL = 'https://shanta-life-agent-hub.vercel.app/api/download-apk';

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
