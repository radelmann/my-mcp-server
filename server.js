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

// Shared function to format pull request details
const formatPullRequests = (prUrls) => {
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

// Shared function to format a ticket
const formatTicket = (ticket, comments = [], includeDescription = false) => {
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

// Tool: Get Jira Ticket by Key
server.tool(
  "get_ticket_by_key",
  { key: z.string().describe("Jira ticket key (e.g. STK-1234)") },
  async ({ key }) => {
    const ticket = await jiraService.getTicket(key);
    const comments = ticket.raw.fields.comment.comments || [];
    const formattedTicket = formatTicket(ticket, comments, true);

    return {
      content: [
        { type: "text", text: JSON.stringify({ count: 1, tickets: [formattedTicket] }, null, 2) }
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
      let comments = [];
      try {
        comments = await jiraService.getTicketComments(issue.key);
      } catch (err) {
        console.warn(`Could not fetch comments for ${issue.key}: ${err.message}`);
      }

      return formatTicket(issue, comments);
    }));

    return {
      content: [
        { type: "text", text: JSON.stringify({ count: tickets.length, tickets }, null, 2) }
      ]
    };
  }
);

// Tool: Add Code Reviewer to Tickets
server.tool(
  "add_code_reviewer",
  {
    keys: z.array(z.string()).describe("Array of Jira ticket keys"),
    username: z.string().describe("Username to add as reviewer (e.g. adelmann)")
  },
  async ({ keys, username }) => {
    const results = await Promise.all(
      keys.map(async (key) => {
        const result = await jiraService.addCodeReviewer(key, username);
        return { key, ...result };
      })
    );

    const formatted = results.map(result => {
      const icon = result.status === 'success' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌';
      return `${icon} [${result.key}](mdc:https:/jira.corp.adobe.com/browse/${result.key}): ${result.message}`;
    }).join('\n');

    return {
      content: [
        { type: "text", text: formatted }
      ]
    };
  }
);

// Tool: List Jira Tickets by Sprint and Team
server.tool(
  "list_tickets_by_sprint_and_team",
  {
    sprint: z.string().describe("Sprint name (e.g. STK Sprint 253)"),
    team: z.string().describe("Team name (e.g. EComm LTV)")
  },
  async ({ sprint, team }) => {
    const issues = await jiraService.searchTicketsBySprintAndTeam(sprint, team);

    const tickets = await Promise.all(issues.map(async issue => {
      let comments = [];
      try {
        comments = await jiraService.getTicketComments(issue.key);
      } catch (err) {
        console.warn(`Could not fetch comments for ${issue.key}: ${err.message}`);
      }

      return formatTicket(issue, comments);
    }));

    return {
      content: [
        { type: "text", text: JSON.stringify({ count: tickets.length, tickets }, null, 2) }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
