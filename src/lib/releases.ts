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
  | { status: 'error'; fallbackUrl: string };

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

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers, cache: 'no-store' }
    );
    if (res.status === 404) return { status: 'no-releases' };
    if (!res.ok) return { status: 'error', fallbackUrl };
    const release: Release = await res.json();
    return { status: 'ok', release, assets: categorizeAssets(release.assets) };
  } catch {
    return { status: 'error', fallbackUrl };
  }
}
