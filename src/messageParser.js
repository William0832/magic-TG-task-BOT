class MessageParser {
  static parseJiraMessage(text) {
    // Pattern to match Jira URL: https://jira.dsteam.vip/browse/PROJ-4326
    // Supports both http and https, case-insensitive
    const jiraUrlPattern = /https?:\/\/jira\.dsteam\.vip\/browse\/([A-Z]+-\d+)/gi;
    const urlMatches = [...text.matchAll(jiraUrlPattern)];

    if (!urlMatches || urlMatches.length === 0) {
      return null;
    }

    // Use the first Jira link found
    const urlMatch = urlMatches[0];
    const ticketId = urlMatch[1];
    const jiraUrl = urlMatch[0];

    // Extract title (text after URL, before @mention or end of line)
    let title = null;
    const urlIndex = text.indexOf(jiraUrl);
    const afterUrl = text.substring(urlIndex + urlMatch[0].length).trim();
    
    // Try to extract title (text before @mention)
    const mentionPattern = /@(\w+)/;
    const mentionMatch = afterUrl.match(mentionPattern);
    
    if (mentionMatch) {
      const beforeMention = afterUrl.substring(0, mentionMatch.index).trim();
      if (beforeMention) {
        // Remove brackets and clean up
        title = beforeMention.replace(/^\[.*?\]\s*/, '').trim();
      }
    } else {
      // No mention, try to extract title from the rest of the text
      const lines = afterUrl.split('\n');
      if (lines[0]) {
        title = lines[0].replace(/^\[.*?\]\s*/, '').trim();
      }
    }

    // Extract assignee username from @mentions
    const mentions = text.match(/@(\w+)/g);
    let assigneeUsername = null;
    
    if (mentions && mentions.length > 0) {
      // Get the last @mention (usually the assignee)
      assigneeUsername = mentions[mentions.length - 1].replace('@', '');
    }

    return {
      ticketId,
      jiraUrl,
      title: title || null,
      assigneeUsername
    };
  }

  static extractTicketId(text) {
    // Extract ticket ID from text (PROJ-4326 format)
    const pattern = /([A-Z]+-\d+)/;
    const match = text.match(pattern);
    return match ? match[1] : null;
  }
}

export default MessageParser;

