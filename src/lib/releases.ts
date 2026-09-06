export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

export interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReleaseAsset[];
}

export interface CategorizedAssets {
  macAppleSilicon: ReleaseAsset[];
  macIntel: ReleaseAsset[];
  windows: ReleaseAsset[];
  linuxAppImage: ReleaseAsset[];
  linuxDeb: ReleaseAsset[];
  linuxRpm: ReleaseAsset[];
}

export type ReleaseResult =
  | { status: 'ok'; release: Release; assets: CategorizedAssets }
  | { status: 'no-releases' }
  | { status: 'error'; fallbackUrl: string; reason: string };

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function formatReleaseDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Denver',
  });
}

const EXCLUDE = /\.apk$|source\.(tar\.gz|zip)$/i;
const IS_MAC = /\.dmg$|-mac\.|darwin/i;
const IS_ARM64 = /arm64/i;

function preferDmg(assets: ReleaseAsset[]): ReleaseAsset[] {
  const hasDmg = assets.some((a) => /\.dmg$/i.test(a.name));
  return hasDmg ? assets.filter((a) => /\.dmg$/i.test(a.name)) : assets;
}

export function categorizeAssets(assets: ReleaseAsset[]): CategorizedAssets {
  const filtered = assets.filter((a) => !EXCLUDE.test(a.name));
  return {
    macAppleSilicon: preferDmg(filtered.filter((a) => IS_MAC.test(a.name) && IS_ARM64.test(a.name))),
    macIntel:        preferDmg(filtered.filter((a) => IS_MAC.test(a.name) && !IS_ARM64.test(a.name))),
    windows: filtered.filter((a) => /\.exe$|\.msi$|win.*\.(exe|msi|zip)$/i.test(a.name)),
    linuxAppImage: filtered.filter((a) => /\.AppImage$/i.test(a.name)),
    linuxDeb: filtered.filter((a) => /\.deb$/i.test(a.name)),
    linuxRpm: filtered.filter((a) => /\.rpm$/i.test(a.name)),
  };
}

const PLATFORM_ORDER: Array<{ key: keyof CategorizedAssets; label: string }> = [
  { key: 'macAppleSilicon', label: 'macOS (Apple Silicon)' },
  { key: 'macIntel',        label: 'macOS (Intel)' },
  { key: 'windows',         label: 'Windows' },
  { key: 'linuxAppImage',   label: 'Linux (AppImage)' },
  { key: 'linuxDeb',        label: 'Linux (.deb)' },
  { key: 'linuxRpm',        label: 'Linux (.rpm)' },
];

export interface PlatformGroup {
  label: string;
  assets: ReleaseAsset[];
}

/** Ordered, non-empty platform groups — shared by the build-time and browser renderers. */
export function groupAssetsByPlatform(assets: CategorizedAssets): PlatformGroup[] {
  return PLATFORM_ORDER
    .map(({ key, label }) => ({ label, assets: assets[key] }))
    .filter((group) => group.assets.length > 0);
}

const API_ROOT = 'https://api.github.com';
const RETRY_DELAYS_MS = [500, 1500];

function isRateLimited(res: Response): boolean {
  return (
    (res.status === 403 || res.status === 429) &&
    res.headers.get('x-ratelimit-remaining') === '0'
  );
}

function isRetryable(res: Response): boolean {
  // A spent rate limit does not recover within a build, so retrying only burns time.
  if (isRateLimited(res)) return false;
  return res.status === 408 || res.status === 429 || res.status >= 500;
}

async function describeResponse(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') detail = ` – ${body.message}`;
  } catch {
    // body was not JSON; the status code alone has to do
  }
  if (isRateLimited(res)) {
    const reset = res.headers.get('x-ratelimit-reset');
    const at = reset ? new Date(Number(reset) * 1000).toISOString() : 'an unknown time';
    return `HTTP ${res.status}: GitHub API rate limit exceeded, resets at ${at}${detail}`;
  }
  return `HTTP ${res.status}${detail}`;
}

type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; reason: string };

async function getJson<T>(url: string, headers: Record<string, string>): Promise<Fetched<T>> {
  let reason = 'the request failed';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }
    let res: Response;
    try {
      res = await fetch(url, { headers, cache: 'no-store' });
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    if (res.status === 404) return { ok: false, notFound: true };
    reason = await describeResponse(res);
    if (!isRetryable(res)) break;
  }
  return { ok: false, notFound: false, reason };
}

function toOk(release: Release): ReleaseResult {
  return { status: 'ok', release, assets: categorizeAssets(release.assets ?? []) };
}

function toError(repo: string, fallbackUrl: string, reason: string): ReleaseResult {
  // Surfaced in the build log so a broken downloads page is not baked in silently.
  console.warn(`[downloads] Could not load the latest release for ${repo}: ${reason}`);
  return { status: 'error', fallbackUrl, reason };
}

export async function fetchLatestRelease(
  repo: string,
  token?: string
): Promise<ReleaseResult> {
  const fallbackUrl = `https://github.com/${repo}/releases`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const latest = await getJson<Release>(`${API_ROOT}/repos/${repo}/releases/latest`, headers);
  if (latest.ok) return toOk(latest.data);
  if (!latest.notFound) return toError(repo, fallbackUrl, latest.reason);

  // /releases/latest 404s both when a repo has no releases at all and when every
  // release is a draft or pre-release, so fall back to the full list before
  // concluding there is nothing to download.
  const list = await getJson<Release[]>(`${API_ROOT}/repos/${repo}/releases?per_page=20`, headers);
  if (!list.ok) {
    if (list.notFound) return { status: 'no-releases' };
    return toError(repo, fallbackUrl, list.reason);
  }

  const published = (list.data ?? []).filter((release) => !release.draft);
  if (published.length === 0) return { status: 'no-releases' };

  const newest = published.reduce((a, b) =>
    new Date(b.published_at).getTime() > new Date(a.published_at).getTime() ? b : a
  );
  console.info(
    `[downloads] ${repo}: no stable release; showing ${newest.tag_name} from the release list.`
  );
  return toOk(newest);
}
