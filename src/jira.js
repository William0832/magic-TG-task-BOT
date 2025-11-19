import axios from 'axios';

class JiraService {
  constructor(baseUrl, username, apiToken) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.apiToken = apiToken;
    this.enabled = !!(baseUrl && username && apiToken);
  }

  async getTicketInfo(ticketId) {
    if (!this.enabled) {
      return null;
    }

    try {
      const url = `${this.baseUrl}/rest/api/2/issue/${ticketId}`;
      const response = await axios.get(url, {
        auth: {
          username: this.username,
          password: this.apiToken
        },
        headers: {
          'Accept': 'application/json'
        }
      });

      return {
        title: response.data.fields.summary,
        description: response.data.fields.description,
        status: response.data.fields.status?.name,
        assignee: response.data.fields.assignee?.displayName
      };
    } catch (error) {
      console.error(`Failed to fetch Jira ticket ${ticketId}:`, error.message);
      return null;
    }
  }

  async fetchTitleFromUrl(jiraUrl) {
    if (!this.enabled) {
      return null;
    }

    try {
      // Extract ticket ID from URL
      const match = jiraUrl.match(/\/browse\/([A-Z]+-\d+)/);
      if (!match) {
        return null;
      }

      const ticketId = match[1];
      const info = await this.getTicketInfo(ticketId);
      return info?.title || null;
    } catch (error) {
      console.error(`Failed to fetch title from URL ${jiraUrl}:`, error.message);
      return null;
    }
  }
}

export default JiraService;

