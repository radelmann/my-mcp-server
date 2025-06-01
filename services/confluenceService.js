import { ConfluenceClient } from 'confluence.js';
import TurndownService from 'turndown';

export default class ConfluenceService {
  constructor(host, username, apiToken) {
    this.host = host;
    this.username = username;
    this.apiToken = apiToken;

    // Initialize Confluence client
    this.client = new ConfluenceClient({
      host,
      apiPrefix: '/rest',
      authentication: {
        personalAccessToken: this.apiToken
      }
    });

    // Configure Turndown for HTML to Markdown conversion
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '_'
    });

    // Add custom rules for Confluence-specific elements
    this.turndownService.addRule('confluencePanel', {
      filter: node => {
        return node.classList && node.classList.contains('panel');
      },
      replacement: (content, node) => {
        const panelType = node.classList.contains('note') ? 'Note' :
                         node.classList.contains('warning') ? 'Warning' :
                         node.classList.contains('info') ? 'Info' : 'Panel';
        return `\n> **${panelType}**\n> ${content.split('\n').join('\n> ')}\n`;
      }
    });

    // Handle Confluence code blocks
    this.turndownService.addRule('confluenceCode', {
      filter: node => {
        return node.classList &&
               (node.classList.contains('code-block') ||
                node.classList.contains('syntaxhighlighter'));
      },
      replacement: (content, node) => {
        const language = node.getAttribute('data-language') || '';
        return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
      }
    });
  }

  /**
   * Tests the connection to Confluence
   * @returns {Promise<Object>} Connection test results
   */
  async testConnection() {
    try {
      // Use a simple API call to verify connection
      const spaces = await this.client.space.getSpaces({ limit: 1 });

      return {
        success: true,
        message: 'Successfully connected to Confluence',
        spaces: spaces.results.length,
        serverInfo: {
          url: this.host,
          username: this.username
        }
      };
    } catch (error) {
      console.error('Connection error:', error);

      // Extract status code if available
      let statusCode;
      if (error && typeof error === 'object' && 'response' in error) {
        statusCode = error.response?.status;
      }

      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
        error: error.message,
        statusCode,
        serverInfo: {
          url: this.host,
          username: this.username
        }
      };
    }
  }

  /**
   * Fetches a Confluence page by ID
   * @param {string} pageId - The Confluence page ID
   * @returns {Promise<Object>} The page content and metadata
   */
  async getPage(pageId) {
    try {
      // Get the page content with all necessary expansions
      const page = await this.client.content.getContentById({
        id: pageId,
        expand: ['body.storage', 'version', 'space', 'metadata.labels']
      });

      // Convert HTML content to Markdown
      const htmlContent = page.body.storage.value;
      const markdownContent = this.turndownService.turndown(htmlContent);

      return {
        id: page.id,
        title: page.title,
        version: page.version.number,
        space: {
          key: page.space.key,
          name: page.space.name
        },
        labels: page.metadata?.labels?.results || [],
        lastUpdated: page.version.when,
        updatedBy: page.version.by,
        htmlContent,
        markdownContent
      };
    } catch (error) {
      console.error('Error fetching page:', error);
      throw new Error(`Failed to fetch page: ${error.message}`);
    }
  }

  /**
   * Updates a Confluence page with new content
   * @param {string} pageId - The Confluence page ID
   * @param {string} content - The HTML content to update
   * @param {Object} options - Additional options
   * @param {boolean} [options.minorEdit=false] - Whether this is a minor edit
   * @returns {Promise<Object>} The updated page data
   */
  async updatePage(pageId, content, options = {}) {
    try {
      // First get the current page to get its version and other metadata
      const currentPage = await this.getPage(pageId);
      const nextVersion = currentPage.version + 1;

      const url = `${this.host}/rest/api/content/${pageId}`;

      const payload = {
        id: pageId,
        type: "page",
        title: currentPage.title,
        space: {
          key: currentPage.space.key
        },
        version: {
          number: nextVersion,
          minorEdit: options.minorEdit || false
        },
        body: {
          storage: {
            value: content,
            representation: "storage"
          }
        }
      };

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();

      return {
        id: result.id,
        title: result.title,
        version: result.version.number,
        space: {
          key: result.space.key,
          name: result.space.name
        },
        lastUpdated: result.version.when,
        updatedBy: result.version.by
      };
    } catch (error) {
      console.error('Error updating page:', error);
      throw new Error(`Failed to update page: ${error.message}`);
    }
  }
}