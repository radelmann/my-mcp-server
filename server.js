// File: server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

import JiraService from "./services/jiraService.js";
import { normalizeStatus } from "./utils/statusUtils.js";
import { extractPullRequestLinks, generatePRAlias } from "./utils/prUtils.js";

console.log("Starting MCP Jira SDK server...");

const jiraService = new JiraService(
  process.env.JIRA_API_BASE_URL,
  process.env.JIRA_EMAIL,
  process.env.JIRA_API_TOKEN
);

const server = new McpServer({
  name: "Jira MCP Server",
  version: "1.0.0"
});

// Tool: Get Jira Ticket by Key
server.tool(
  "get_ticket_by_key",
  { key: z.string().describe("Jira ticket key (e.g. STK-1234)") },
  async ({ key }) => {
    const ticket = await jiraService.getTicket(key);
    const comments = ticket.raw.fields.comment.comments || [];
    const pullRequests = extractPullRequestLinks(comments);

    const prDetails = pullRequests.map(prUrl => {
      const alias = generatePRAlias(prUrl);
      let prNumber = alias?.prNumber || 'PR';
      let repoName = (alias?.repo || 'repo').replace('AdobeStock/', '');
      const linkText = `${prNumber} - ${repoName}`;
      return {
        url: prUrl,
        alias: alias?.alias || 'No alias available',
        executableCommand: alias?.alias || 'No command available',
        hyperlink: `[${linkText}](${prUrl})`
      };
    });

    const formattedOutput = `📋 [${ticket.issueKey}](https://jira.corp.adobe.com/browse/${ticket.issueKey}): ${ticket.fields.summary}
👤 Assignee: ${ticket.fields.assignee?.displayName || "Unassigned"}
🔄 Status: ${ticket.fields.status.name}
🔗 Pull Requests:\n${prDetails.map(pr => `      - ${pr.hyperlink}\n         💻 Review PR:\n         \u0060\u0060\u0060bash\n${pr.executableCommand}\n\u0060\u0060\u0060`).join('\n')}`;

    return {
      content: [
        { type: "text", text: formattedOutput },
        { type: "text", text: JSON.stringify(ticket, null, 2) }
      ]
    };
  }
);

// Tool: Transition Jira Ticket
server.tool(
  "transition_ticket",
  {
    key: z.string().describe("Jira ticket key"),
    status: z.string().describe("Target status")
  },
  async ({ key, status }) => {
    const normalizedStatus = normalizeStatus(status);
    const transitions = await jiraService.getTicketTransitions(key);
    const match = transitions.find(t => t.name.toLowerCase() === normalizedStatus.toLowerCase());

    if (!match) {
      throw new Error(`Status '${status}' not valid. Options: ${transitions.map(t => t.name).join(", ")}`);
    }

    await jiraService.transitionTicket(key, match.id);
    return {
      content: [{ type: "text", text: `✅ Ticket ${key} transitioned to ${match.name}` }]
    };
  }
);

// Tool: List Jira Tickets by Team and Status
server.tool(
  "list_tickets_by_team_and_status",
  {
    team: z.string().describe("Team name (e.g. EComm Demand)"),
    status: z.string().describe("Ticket status (e.g. Code Review)")
  },
  async ({ team, status }) => {
    const jql = `project = STOCK AND status = "${normalizeStatus(status)}" AND Team = "${team}" ORDER BY updated DESC`;
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
        let repoName = (alias?.repo || 'repo').replace('AdobeStock/', '');
        const linkText = `${prNumber} - ${repoName}`;
        return {
          url: prUrl,
          alias: alias?.alias || 'No alias available',
          executableCommand: alias?.alias || 'No command available',
          hyperlink: `[${linkText}](${prUrl})`
        };
      });

      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName || "Unassigned",
        pullRequests: prDetails,
        formattedOutput: `📋 [${issue.key}](https://jira.corp.adobe.com/browse/${issue.key}): ${issue.fields.summary}
👤 Assignee: ${issue.fields.assignee?.displayName || "Unassigned"}
🔄 Status: ${issue.fields.status.name}
🔗 Pull Requests:${prDetails.length ? '\n' + prDetails.map(pr => `      - ${pr.hyperlink}\n         💻 Review PR:\n         \u0060\u0060\u0060bash\n${pr.executableCommand}\n\u0060\u0060\u0060`).join('\n') : '\n      No pull requests yet'}`
      };
    }));

    return {
      content: [
        { type: "text", text: `Found ${tickets.length} tickets in ${status} for ${team}:\n\n${tickets.map(t => t.formattedOutput).join('\n\n')}` },
        { type: "text", text: JSON.stringify({ count: tickets.length, tickets }, null, 2) }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
