export function extractPullRequestLinks(comments) {
  const prRegex = /(https?:\/\/[^\s]*\/pull\/\d+)/gi;
  const links = [];

  for (const comment of comments) {
    const matches = comment.body.match(prRegex);
    if (matches) {
      links.push(...matches);
    }
  }

  return links;
}

function getRepoPath(repo) {
  const repoPaths = {
    'AdobeStock/client-lib-js': '~/dev/client-lib-js',
    'AdobeStock/stock-web': '~/dev/stock-web',
    'AdobeStock/stock-landing-web-service': '~/dev/stock-landing-web-service',
    'AdobeStock/stock-legal-terms': '~/dev/stock-legal-terms',
    'AdobeStock/stock-search-app': '~/dev/stock-search-app'
  };
  return repoPaths[repo] || `~/dev/${repo.split('/')[1]}`;
}

export function generatePRAlias(prUrl) {
  const match = prUrl.match(/git\.corp\.adobe\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
  if (!match) {
    return null;
  }

  const [_, org, repo, prNumber] = match;
  const repoPath = getRepoPath(`${org}/${repo}`);
  return {
    repo: `${org}/${repo}`,
    prNumber: prNumber,
    alias: `cd ${repoPath} && git.code.review ${prNumber}`
  };
}
