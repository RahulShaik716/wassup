const DEFAULT_CONFIG = {
  repository: 'OWNER/REPO',
  releaseTag: 'android-debug-latest',
  primaryAssetName: 'wassup-debug-signed.apk',
  developerAssetName: 'wassup-debug.apk',
};

const buildTitle = document.getElementById('build-title');
const buildMeta = document.getElementById('build-meta');
const primaryDownload = document.getElementById('primary-download');
const developerDownload = document.getElementById('developer-download');

function formatDate(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

async function loadSiteConfig() {
  try {
    const response = await fetch('./site-config.json', { cache: 'no-store' });

    if (!response.ok) {
      return DEFAULT_CONFIG;
    }

    const config = await response.json();
    return { ...DEFAULT_CONFIG, ...config };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function inferRepository() {
  const host = window.location.hostname;
  const pathSegment = window.location.pathname.split('/').filter(Boolean)[0];

  if (host.endsWith('.github.io') && pathSegment) {
    return `${host.replace('.github.io', '')}/${pathSegment}`;
  }

  return null;
}

function enableLink(element, href) {
  element.href = href;
  element.classList.remove('disabled');
  element.removeAttribute('aria-disabled');
}

async function loadLatestBuild() {
  const config = await loadSiteConfig();
  const repository =
    config.repository && config.repository !== DEFAULT_CONFIG.repository
      ? config.repository
      : inferRepository();

  if (!repository) {
    buildTitle.textContent = 'Configure the repository before publishing';
    buildMeta.textContent =
      'Set the GitHub repository in docs/site-config.json or deploy the site through the GitHub Pages workflow.';
    return;
  }

  const fallbackPrimaryUrl = `https://github.com/${repository}/releases/download/${config.releaseTag}/${config.primaryAssetName}`;
  const fallbackDeveloperUrl = `https://github.com/${repository}/releases/download/${config.releaseTag}/${config.developerAssetName}`;

  enableLink(primaryDownload, fallbackPrimaryUrl);
  enableLink(developerDownload, fallbackDeveloperUrl);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases/tags/${config.releaseTag}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );

    if (!response.ok) {
      throw new Error('Release lookup failed');
    }

    const release = await response.json();
    const primaryAsset = release.assets.find((asset) => asset.name === config.primaryAssetName);
    const developerAsset = release.assets.find((asset) => asset.name === config.developerAssetName);

    if (primaryAsset?.browser_download_url) {
      enableLink(primaryDownload, primaryAsset.browser_download_url);
    }

    if (developerAsset?.browser_download_url) {
      enableLink(developerDownload, developerAsset.browser_download_url);
    }

    const preferredAsset = primaryAsset || developerAsset;
    const updatedAt = preferredAsset?.updated_at || release.published_at;
    const fileSize = preferredAsset?.size ? formatSize(preferredAsset.size) : null;

    buildTitle.textContent = preferredAsset
      ? `Build published ${formatDate(updatedAt)}`
      : 'Latest build is ready';

    buildMeta.textContent = [
      `Release tag: ${config.releaseTag}`,
      fileSize ? `Size: ${fileSize}` : null,
      release.target_commitish ? `Branch: ${release.target_commitish}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  } catch {
    buildTitle.textContent = 'Latest build link is ready';
    buildMeta.textContent =
      'The direct GitHub release links are active. If metadata is unavailable, the buttons still point at the stable latest-build release assets.';
  }
}

void loadLatestBuild();
