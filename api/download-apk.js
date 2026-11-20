/**
 * GET /api/download-apk — redirect to the newest Agent Hub Android APK.
 *
 * The APK file users download carries the app name + version
 * (Mahadi 2026-11-21): "Agent-Hub-V-1.0.0.1.apk" — that's
 * versionName.versionCode, with dashes (GitHub turns spaces into dots
 * in release asset names — see the workflow's Publish step). Because
 * the asset name changes with every version, the Hub's popup and
 * login link do NOT point at GitHub directly — they point here, and
 * this route asks the GitHub Releases API for the `latest` release,
 * picks its newest .apk asset, and redirects to that asset's
 * browser_download_url, which serves the file under its friendly
 * stored name. The Hub link therefore never changes when the version
 * does, and there is no window where a new version breaks the link:
 * before a dispatch the route serves the current release, after it
 * the new one.
 *
 * HEAD is answered like GET (redirect headers, no body) — some
 * download managers probe with HEAD before fetching.
 *
 * Rate limits: the GitHub API allows 60 unauthenticated
 * requests/hour per IP, and Vercel egress IPs are shared — so the
 * resolved URL is cached in memory for 10 minutes per instance.
 * (The repo is public, so no token is needed or used.)
 *
 * Failure mode: if GitHub is unreachable, the release has no APK
 * yet, or the API limit is hit, the route redirects to the releases
 * page instead of failing — the user taps the APK there (same file,
 * same friendly name). Never a dead end, never a 404.
 */
export const config = { maxDuration: 30 };

const REPO = 'Mriduul7621/shanta-life-agent-hub';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

// 10-minute in-memory cache (per instance) — see the header note.
let cached = { url: null, at: 0 };
const CACHE_MS = 10 * 60 * 1000;

/** The browser_download_url of the newest .apk asset in `latest`. */
async function newestApkUrl() {
  if (cached.url && Date.now() - cached.at < CACHE_MS) return cached.url;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'shanta-life-agent-hub' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const release = await res.json();
  const apks = (release.assets || []).filter((a) => typeof a.name === 'string' && a.name.endsWith('.apk'));
  if (!apks.length) throw new Error('no APK asset in latest release');
  // `latest` should hold exactly one APK (the workflow deletes the
  // previous version's assets first) — newest-first is belt and
  // braces in case a stale one survives.
  apks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const url = apks[0].browser_download_url;
  cached = { url, at: Date.now() };
  return url;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  try {
    const url = await newestApkUrl();
    res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
    return res.end();
  } catch (err) {
    console.error('download-apk redirect failed:', err.message);
    res.writeHead(302, { Location: RELEASES_PAGE, 'Cache-Control': 'no-store' });
    return res.end();
  }
}
