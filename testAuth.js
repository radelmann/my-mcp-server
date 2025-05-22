const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config(); // This must be at the top

const API_KEY = process.env.MCP_API_KEY;
const API_SECRET = process.env.MCP_API_SECRET;
const MCP_URL = process.env.MCP_TEST_URL;
// Generate timestamp
const timestamp = Date.now().toString();

// Generate HMAC signature
const hmac = crypto.createHmac("sha256", API_SECRET);
hmac.update(`${API_KEY}${timestamp}`);
const signature = hmac.digest("base64");

// Make request
axios.get(MCP_URL, {
  headers: {
    "x-api-key": API_KEY,
    "x-api-timestamp": timestamp,
    "x-api-signature": signature,
  },
}).then(response => {
  console.log("✅ Success:");
  console.log(response.data);
}).catch(err => {
  if (err.response) {
    console.error("❌ Error:", err.response.status, err.response.data);
  } else {
    console.error("❌ Request failed:", err.message);
  }
});
