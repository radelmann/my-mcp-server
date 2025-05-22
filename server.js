// File: server.js
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config(); // This must be at the top

console.log("Starting MCP server...");

const app = express();
app.use(express.json());

const JIRA_API_BASE_URL = process.env.JIRA_API_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const API_KEY = process.env.MCP_API_KEY;
const API_SECRET = process.env.MCP_API_SECRET;
const MAX_AGE = 2 * 60 * 1000; // 2 minutes

const GPT_BEARER_TOKEN = process.env.GPT_BEARER_TOKEN;

app.use((req, res, next) => {
  // Option 1: Check for GPT Bearer Token
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === GPT_BEARER_TOKEN) {
      return next(); // Authenticated via static token
    } else {
      return res.status(403).json({ error: "Invalid bearer token" });
    }
  }

  // Option 2: HMAC signature (your existing flow)
  const clientKey = req.headers["x-api-key"];
  const timestamp = req.headers["x-api-timestamp"];
  const signature = req.headers["x-api-signature"];

  if (!clientKey || !timestamp || !signature) {
    return res.status(401).json({ error: "Missing authentication headers" });
  }

  if (clientKey !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const now = Date.now();
  const sent = parseInt(timestamp, 10);
  if (isNaN(sent) || Math.abs(now - sent) > MAX_AGE) {
    return res.status(403).json({ error: "Timestamp too old or invalid" });
  }

  const hmac = crypto.createHmac("sha256", API_SECRET);
  hmac.update(`${clientKey}${timestamp}`);
  const expectedSig = hmac.digest("base64");

  if (signature !== expectedSig) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  next();
});

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
      {
        headers: getAuthHeaders(),
      }
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
    res.status(500).json({ error: "Failed to fetch JIRA issue." });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});
