import axios from 'axios';
import { AITriageResult } from './ai';

interface SlackNotificationParams {
  webhookUrl: string;
  repoName: string;
  eventType: string;
  title: string;
  author: string;
  url: string;
  aiResult?: AITriageResult;
  actionsTaken: string[];
}

/**
 * Sends a structured, rich Slack notification using Slack Block Kit.
 */
export async function sendSlackNotification(params: SlackNotificationParams): Promise<void> {
  const { webhookUrl, repoName, eventType, title, author, url, aiResult, actionsTaken } = params;

  if (!webhookUrl) {
    console.warn('Slack Webhook URL is empty or placeholder. Skipping Slack notification.');
    return;
  }

  // Determine priority indicator emoji
  let priorityEmoji = '⚪';
  if (aiResult) {
    if (aiResult.priority === 'High') priorityEmoji = '🔴';
    else if (aiResult.priority === 'Medium') priorityEmoji = '🟡';
    else if (aiResult.priority === 'Low') priorityEmoji = '🟢';
  }

  // Build Block Kit blocks
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🤖 GitHub Automation: ${eventType}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Repository:* \`${repoName}\`\n*Author:* ${author}\n*Action Target:* <${url}|${title}>`,
      },
    },
  ];

  // Add AI Triage section if available
  if (aiResult) {
    blocks.push({
      type: 'divider',
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🧠 AI Triage Analysis*:\n> *Summary:* ${aiResult.summary}\n> *Priority:* ${priorityEmoji} *${aiResult.priority}*\n> *Suggested Label:* \`${aiResult.suggestedLabel}\`\n> *Sentiment:* ${aiResult.sentiment}`,
      },
    });
  }

  // Add Bot Actions section if actions were executed
  if (actionsTaken.length > 0) {
    blocks.push({
      type: 'divider',
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚡ Bot Actions Executed*:\n${actionsTaken.map((action) => `• ${action}`).join('\n')}`,
      },
    });
  }

  // Send payload to Slack webhook
  try {
    await axios.post(webhookUrl, { blocks });
    console.log(`Slack notification sent for event: ${eventType}`);
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
  }
}
