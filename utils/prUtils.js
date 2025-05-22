function extractPullRequestLinks(comments) {
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

module.exports = {
  extractPullRequestLinks
};