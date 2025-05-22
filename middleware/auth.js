const crypto = require("crypto");

const API_KEY = process.env.MCP_API_KEY;
const API_SECRET = process.env.MCP_API_SECRET;
const GPT_BEARER_TOKEN = process.env.GPT_BEARER_TOKEN;
const MAX_AGE = 2 * 60 * 1000; // 2 minutes

function authMiddleware(req, res, next) {
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

  // Option 2: HMAC signature
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
}

module.exports = authMiddleware;