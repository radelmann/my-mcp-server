// File: server.js
const express = require("express");
require("dotenv").config();

console.log("Starting MCP server...");

const app = express();
app.use(express.json());

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Import middleware and services
const authMiddleware = require("./middleware/auth");
const JiraService = require("./services/jiraService");
const { normalizeStatus } = require("./utils/statusUtils");
const { extractPullRequestLinks, generatePRAlias } = require("./utils/prUtils");

// Initialize JIRA service
const jiraService = new JiraService(
  process.env.JIRA_API_BASE_URL,
  process.env.JIRA_EMAIL,
  process.env.JIRA_API_TOKEN
);

// Apply auth middleware
app.use(authMiddleware);

// GET /ticket/:key - fetch JIRA ticket info
app.get("/ticket/:key", async (req, res) => {
  const issueKey = req.params.key;

  try {
    const ticket = await jiraService.getTicket(issueKey);
    // Extract PR links from comments
    const comments = ticket.raw.fields.comment.comments || [];
    const pullRequests = extractPullRequestLinks(comments);
    const prDetails = pullRequests.map(prUrl => {
      const alias = generatePRAlias(prUrl);
      let prNumber = alias?.prNumber || 'PR';
      let repoName = alias?.repo || 'repo';
      repoName = repoName.replace('AdobeStock/', '');
      let linkText = `${prNumber} - ${repoName}`;
      return {
        url: prUrl,
        alias: alias?.alias || 'No alias available',
        executableCommand: `\`\`\`bash\n${alias?.alias}\n\`\`\``,
        hyperlink: `[${linkText}](${prUrl})`
      };
    });
    // Add formattedOutput to the response
    ticket.formattedOutput = `📋 ${ticket.issueKey}: ${ticket.fields.summary}
   👤 Assignee: ${ticket.fields.assignee?.displayName || "Unassigned"}
   🔄 Status: ${ticket.fields.status.name}
   🔗 Pull Requests:\n${prDetails.map(pr => `      - ${pr.hyperlink}\n         💻 Review PR:\n         ${pr.executableCommand}`).join('\n')}`;
    res.status(200).json(ticket);
  } catch (error) {
    if (error.response) {
      console.error("JIRA API error:", error.response.status, error.response.data);
    } else {
      console.error("Request error:", error.message);
    }
    res.status(500).json({ error: "Failed to fetch JIRA issue." });
  }
});

// POST /ticket/:key/transition - move Jira ticket to new status
app.post("/ticket/:key/transition", async (req, res) => {
  const issueKey = req.params.key;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Missing 'status' in request body" });
  }

  try {
    const normalizedStatus = normalizeStatus(status);
    const transitions = await jiraService.getTicketTransitions(issueKey);
    const matching = transitions.find(t =>
      t.name.toLowerCase() === normalizedStatus.toLowerCase()
    );

    if (!matching) {
      return res.status(400).json({
        error: `Status '${status}' not found in available transitions`,
        availableStatuses: transitions.map(t => t.name),
      });
    }

    await jiraService.transitionTicket(issueKey, matching.id);

    res.status(200).json({
      issueKey,
      transitionedTo: matching.name
    });
  } catch (error) {
    if (error.response) {
      console.error("JIRA API error:", error.response.status, error.response.data);
    } else {
      console.error("Request error:", error.message);
    }
    res.status(500).json({ error: "Failed to update ticket status." });
  }
});

// GET /tickets - fetch tickets by team and status
app.get("/tickets", async (req, res) => {
  const { team, status } = req.query;

  if (!team || !status) {
    return res.status(400).json({ error: "Both 'team' and 'status' parameters are required" });
  }

  const jql = `project = STOCK AND status = "${normalizeStatus(status)}" AND Team = "${team}" ORDER BY updated DESC`;

  try {
    const issues = await jiraService.searchTickets(jql);

    const tickets = await Promise.all(issues.map(async issue => {
      let pullRequests = [];

      try {
        const comments = await jiraService.getTicketComments(issue.key);
        pullRequests = extractPullRequestLinks(comments);
      } catch (err) {
        console.warn(`Could not fetch comments for ${issue.key}: ${err.message}`);
      }

      const prDetails = pullRequests.map(prUrl => {
        const alias = generatePRAlias(prUrl);
        let prNumber = alias?.prNumber || 'PR';
        let repoName = alias?.repo || 'repo';
        repoName = repoName.replace('AdobeStock/', '');
        let linkText = `${prNumber} - ${repoName}`;
        return {
          url: prUrl,
          alias: alias?.alias || 'No alias available',
          executableCommand: `\`\`\`bash\n${alias?.alias}\n\`\`\``,
          hyperlink: `[${linkText}](${prUrl})`
        };
      });

      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        pullRequests: prDetails,
        formattedOutput: `📋 ${issue.key}: ${issue.fields.summary}
   👤 Assignee: ${issue.fields.assignee?.displayName || "Unassigned"}
   🔄 Status: ${issue.fields.status.name}
   🔗 Pull Requests:\n${prDetails.map(pr => `      - ${pr.hyperlink}\n         💻 Review PR:\n         ${pr.executableCommand}`).join('\n')}`
      };
    }));

    const formattedResponse = {
      count: tickets.length,
      tickets,
      formattedSummary: `Found ${tickets.length} tickets in ${status} for ${team}:\n\n${tickets.map(t => t.formattedOutput).join('\n\n')}`
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error("Error fetching tickets:", error.message);
    res.status(500).json({ error: "Failed to fetch Jira tickets" });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});
