import { extractPullRequestLinks, generatePRAlias } from "./prUtils.js";

// Format pull request details
export const formatPullRequests = (prUrls) => {
  return prUrls.map(prUrl => {
    const alias = generatePRAlias(prUrl);
    let prNumber = alias?.prNumber || 'PR';
    let repoName = (alias?.repo || 'repo').replace('AdobeStock/', '');
    const linkText = `${prNumber} - ${repoName}`;
    return {
      link: `[${linkText}](${prUrl})`,
      executableCommand: alias?.alias || 'No command available',
    };
  });
};

// Format a ticket with optional comments and description
export const formatTicket = (ticket, comments = [], includeDescription = false) => {
  const pullRequests = extractPullRequestLinks(comments);
  const prDetails = formatPullRequests(pullRequests);

  const formattedTicket = {
    key: ticket.issueKey || ticket.key,
    summary: ticket.fields.summary,
    status: ticket.fields.status.name,
    assignee: ticket.fields.assignee?.displayName || "Unassigned",
    pullRequests: prDetails,
  };

  if (includeDescription) {
    formattedTicket.description = ticket.fields.description;
  }

  return formattedTicket;
};