# MCP Server for Cursor Integration

This MCP (Model Context Protocol) server provides integration with Jira, Confluence, and diagram generation capabilities for use with the Cursor IDE.

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example configuration:
   ```bash
   cp .cursor/mcp.json.example .cursor/mcp.json
   ```
4. Update `.cursor/mcp.json` with your credentials:
   - Jira API token
   - Confluence API token
   - Base URLs for both services

5. Start the server from Cursor:
   - Open Cursor IDE
   - Go to Settings (⌘,)
   - Navigate to "Cursor Settings"
   - Under "MCP Server", click "Start Server"
   - Select this project's directory

## Available Tools

### Jira Tools

#### `get_ticket_by_key`
Fetches a Jira ticket by its key (e.g., STK-1234).
```typescript
{
  key: string  // Jira ticket key
}
```

#### `transition_ticket`
Transitions a Jira ticket to a new status.
```typescript
{
  key: string,    // Jira ticket key
  status: string  // Target status
}
```

#### `list_tickets_by_team_and_status`
Lists tickets for a specific team and status.
```typescript
{
  team: string,   // Team name (e.g., "EComm Demand")
  status: string  // Ticket status (e.g., "Code Review")
}
```

#### `add_code_reviewer`
Adds a code reviewer to one or more tickets.
```typescript
{
  keys: string[],  // Array of Jira ticket keys
  username: string // Username to add as reviewer
}
```

#### `list_tickets_by_sprint_and_team`
Lists tickets for a specific sprint and team.
```typescript
{
  sprint: string, // Sprint name (e.g., "STK Sprint 253")
  team: string    // Team name (e.g., "EComm LTV")
}
```

### Confluence Tools

#### `test_confluence_connection`
Tests the connection to Confluence.

#### `get_confluence_page`
Retrieves a Confluence page by its ID.
```typescript
{
  pageId: string,           // Confluence page ID
  format?: "markdown" | "html" | "both" // Output format (default: "markdown")
}
```

### Diagram Tools

#### `generate_diagram`
Generates a diagram using Mermaid syntax and saves it as an image.
```typescript
{
  code: string,     // Mermaid diagram code
  filename?: string // Optional filename for the diagram
}
```

#### `add_diagram_to_confluence`
Adds a Mermaid diagram to a Confluence page.
```typescript
{
  pageId: string,      // Confluence page ID
  mermaidCode: string, // Mermaid diagram code
  position?: string    // Where to add the diagram (top or bottom)
}
```

## Project Structure

```
.
├── .cursor/              # Cursor configuration
│   ├── mcp.json         # Your configuration (not in git)
│   └── mcp.json.example # Example configuration
├── diagrams/            # Generated diagrams (contents not in git)
├── services/           # Service implementations
├── utils/             # Utility functions
├── middleware/        # Middleware components
└── server.js         # Main server file
```

## Development

- Generated diagrams are stored in the `diagrams/` directory but not tracked in git
- The server uses Node.js and the MCP SDK
- All tools are registered in `server.js`

## Troubleshooting

1. If the server fails to start:
   - Check that `.cursor/mcp.json` exists and has valid credentials
   - Ensure no other MCP server is running
   - Check the Cursor console for error messages

2. If tools aren't appearing in Cursor:
   - Restart the MCP server from Cursor Settings
   - Check that the tool is properly registered in `server.js`

3. If diagram generation fails:
   - Ensure `@mermaid-js/mermaid-cli` is installed globally:
     ```bash
     npm install -g @mermaid-js/mermaid-cli
     ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is proprietary and confidential. © Adobe Systems Incorporated.