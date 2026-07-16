// for referer policy, we can't use it in renderer
import axios from 'axios';
const RELEASE_URL = 'https://api.github.com/repos/nutea/Flick/releases';

interface GitHubRelease {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
}

export const getLatestVersion = async (
  isCheckBetaUpdate = false
): Promise<string> => {
  try {
    const { data } = await axios.get<GitHubRelease[]>(RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      timeout: 5000,
    });
    const release = data.find(
      (item) =>
        !item.draft &&
        (isCheckBetaUpdate ||
          (!item.prerelease && !item.tag_name.includes('beta')))
    );
    return release?.tag_name.replace(/^v/, '') ?? '';
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? `${error.response?.status ?? error.code ?? 'request failed'}`
      : error instanceof Error
        ? error.message
        : 'unknown error';
    console.warn(`[update] Unable to check releases: ${message}`);
    return '';
  }
};
