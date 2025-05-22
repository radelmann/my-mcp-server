const axios = require("axios");
const { extractPullRequestLinks } = require("../utils/prUtils");

class JiraService {
  constructor(baseUrl, email, apiToken) {
    this.baseUrl = baseUrl;
    this.authHeaders = this.getAuthHeaders(email, apiToken);
  }

  getAuthHeaders(email, apiToken) {
    const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      Accept: "application/json"
    };
  }

  async getTicket(key) {
    const [issueResponse, commentResponse] = await Promise.all([
      axios.get(
        `${this.baseUrl}/issue/${key}?expand=names,renderedFields`,
        { headers: this.authHeaders }
      ),
      axios.get(
        `${this.baseUrl}/issue/${key}/comment`,
        { headers: this.authHeaders }
      )
    ]);

    const comments = commentResponse.data.comments || [];
    const pullRequests = extractPullRequestLinks(comments);

    return {
      issueKey: key,
      fields: issueResponse.data.fields,
      raw: issueResponse.data,
      pullRequests
    };
  }

  async getTicketTransitions(key) {
    const response = await axios.get(
      `${this.baseUrl}/issue/${key}/transitions`,
      { headers: this.authHeaders }
    );
    return response.data.transitions;
  }

  async transitionTicket(key, transitionId) {
    await axios.post(
      `${this.baseUrl}/issue/${key}/transitions`,
      {
        transition: { id: transitionId }
      },
      { headers: this.authHeaders }
    );
  }

  async searchTickets(jql, fields = ["key", "summary", "status", "assignee"]) {
    const response = await axios.get(`${this.baseUrl}/search`, {
      headers: this.authHeaders,
      params: {
        jql,
        maxResults: 25,
        fields
      }
    });

    return response.data.issues;
  }

  async getTicketComments(key) {
    const response = await axios.get(
      `${this.baseUrl}/issue/${key}/comment`,
      { headers: this.authHeaders }
    );
    return response.data.comments || [];
  }
}

module.exports = JiraService;