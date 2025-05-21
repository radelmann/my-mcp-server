// File: server.js
const express = require("express");
const axios = require("axios");

require("dotenv").config(); // This must be at the top
console.log("Starting MCP server...");

const app = express();
app.use(express.json());

const JIRA_API_BASE_URL = process.env.JIRA_API_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// Helper to configure basic auth header
function getAuthHeaders() {
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    Accept: "application/json"
  };
}

// GET /ticket/:key - fetch JIRA ticket info
app.get("/ticket/:key", async (req, res) => {
  const issueKey = req.params.key;

  try {
    const response = await axios.get(
      `${JIRA_API_BASE_URL}/issue/${issueKey}?expand=names,renderedFields`,
      { headers: getAuthHeaders() }
    );

    res.status(200).json({
      issueKey,
      fields: response.data.fields,
      raw: response.data
    });
  } catch (error) {
    if (error.response) {
      console.error("JIRA API error response:");
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Request error:", error.message);
    }
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});
