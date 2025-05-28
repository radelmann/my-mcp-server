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

  async addCodeReviewer(key, username) {
    try {
      // First, get current reviewers to avoid duplicates
      const ticket = await this.getTicket(key);
      const currentReviewers = ticket.raw.fields.customfield_19601 || [];

      // Check if user is already a reviewer
      if (currentReviewers.some(reviewer => reviewer.name === username)) {
        return { status: 'skipped', message: 'Already a reviewer' };
      }

      // Add the new reviewer
      await axios.put(
        `${this.baseUrl}/issue/${key}`,
        {
          fields: {
            customfield_19601: [...currentReviewers, { name: username }]
          }
        },
        { headers: this.authHeaders }
      );

      return { status: 'success', message: 'Added as reviewer' };
    } catch (error) {
      return {
        status: 'error',
        message: error.response?.data?.errorMessages?.[0] || error.message
      };
    }
  }

  async searchTicketsBySprintAndTeam(sprintName, teamName, fields = ["key", "summary", "status", "assignee"]) {
    const jql = `sprint = "${sprintName}" AND Team = "${teamName}" ORDER BY updated DESC`;
    return this.searchTickets(jql, fields);
  }
}

module.exports = JiraService;