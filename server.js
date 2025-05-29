// File: server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

import { JiraService } from "./services/jiraService.js";
import ConfluenceService from "./services/confluenceService.js";
import { normalizeStatus } from "./utils/statusUtils.js";
import { extractPullRequestLinks, generatePRAlias } from "./utils/prUtils.js";
import { formatTicket } from "./utils/formatUtils.js";

console.log("Starting MCP Server with Jira and Confluence support...");

const jiraService = new JiraService(
  process.env.JIRA_API_BASE_URL,
  process.env.JIRA_EMAIL,
  process.env.JIRA_API_TOKEN
);

const confluenceService = new ConfluenceService(
  process.env.CONFLUENCE_BASE_URL,
  process.env.CONFLUENCE_USERNAME,
  process.env.CONFLUENCE_API_TOKEN
);

const server = new McpServer({
  name: "Adobe Tools MCP Server",
  version: "1.0.0"
});

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

// Tool: Test Confluence Connection
server.tool(
  "test_confluence_connection",
  {},
  async () => {
    try {
      const result = await confluenceService.testConnection();

      if (result.success) {
        return {
          content: [
            { type: "text", text: "✅ " + result.message + "\n" },
            { type: "text", text: `Server: ${result.serverInfo.url}\n` },
            { type: "text", text: `Username: ${result.serverInfo.username}\n` },
            { type: "text", text: `Available spaces: ${result.spaces}` }
          ]
        };
      } else {
        return {
          content: [
            { type: "text", text: "❌ " + result.message + "\n" },
            { type: "text", text: `Server: ${result.serverInfo.url}\n` },
            { type: "text", text: `Username: ${result.serverInfo.username}\n` },
            { type: "text", text: `Error details: ${result.error}` }
          ]
        };
      }
    } catch (error) {
      return {
        content: [
          { type: "text", text: `❌ Unexpected error: ${error.message}` }
        ]
      };
    }
  }
);

// Tool: Get Confluence Page
server.tool(
  "get_confluence_page",
  {
    pageId: z.string().describe("Confluence page ID"),
    format: z.enum(['markdown', 'html', 'both']).default('markdown')
      .describe("Output format (markdown, html, or both)")
  },
  async ({ pageId, format }) => {
    try {
      const page = await confluenceService.getPage(pageId);
      const content = format === 'markdown' ? page.markdownContent :
                     format === 'html' ? page.htmlContent :
                     { markdown: page.markdownContent, html: page.htmlContent };

      return {
        content: [
          { type: "text", text: JSON.stringify({
            id: page.id,
            title: page.title,
            version: page.version,
            space: page.space,
            content: content
          }, null, 2) }
        ]
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error fetching page: ${error.message}` }
        ]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
