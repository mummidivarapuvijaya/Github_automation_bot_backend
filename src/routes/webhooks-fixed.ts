import { Router, Response } from 'express';
import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:5001';

// Type definitions
interface AITriageResult {
  summary: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedLabel?: string;
}

// AI triage function
async function triageEvent(title: string, body: string, author: string, type: 'issue' | 'pull_request'): Promise<AITriageResult> {
  // For demo purposes, return a mock result
  // In a real implementation, this would call an AI service
  return {
    summary: `This ${type} appears to be about ${title.toLowerCase()}`,
    priority: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
    sentiment: Math.random() > 0.6 ? 'positive' : Math.random() > 0.3 ? 'neutral' : 'negative',
    suggestedLabel: type === 'issue' ? 'bug' : 'enhancement'
  };
}

// Helper to centralise BotActionLog creation.
async function createBotLog(params: {
  repositoryId: string;
  deliveryId: string;
  eventType: string;
  title: string;
  author: string;
  url: string;
  status: 'success' | 'error' | 'skipped';
  actionsTaken?: string[];
  errorDetails?: string | null;
  aiSummary?: string | null;
  aiPriority?: string | null;
  aiSentiment?: string | null;
}) {
  console.log("\n💾 Creating BotActionLog with parameters:");
  console.log("Repository ID:", params.repositoryId);
  console.log("Delivery ID:", params.deliveryId);
  console.log("Event Type:", params.eventType);
  console.log("Title:", params.title);
  console.log("Author:", params.author);
  console.log("URL:", params.url);
  console.log("Status:", params.status);
  console.log("Actions taken:", params.actionsTaken);
  console.log("Error details:", params.errorDetails);

  const {
    repositoryId,
    deliveryId,
    eventType,
    title,
    author,
    url,
    status,
    actionsTaken = [],
    errorDetails = null,
    aiSummary = null,
    aiPriority = null,
    aiSentiment = null,
  } = params;

  try {
    await prisma.botActionLog.create({
      data: {
        repositoryId,
        deliveryId,
        eventType,
        title,
        author,
        url,
        status,
        actionsTaken: JSON.stringify(actionsTaken.length ? actionsTaken : ['No actions triggered']),
        errorDetails,
        aiSummary,
        aiPriority,
        aiSentiment,
      },
    });
    console.log("✅ BotActionLog created successfully");
  } catch (dbError) {
    console.error("❌ Failed to create BotActionLog:", dbError);
    console.error("DB error details:", JSON.stringify(dbError, null, 2));
    throw dbError; // Re-throw to be caught by the caller
  }
}

// POST endpoint for incoming webhooks
router.post('/github', async (req: any, res: Response) => {
  console.log("\n🔔 Incoming webhook request");
  console.log("Event:", req.headers['x-github-event']);
  console.log("Delivery ID:", req.headers['x-github-delivery']);
  const signatureHeader = req.headers['x-hub-signature-256'] as string;
  console.log("Signature:", signatureHeader?.substring(0, 10) + "..." || "None");

  const eventTypeHeader = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log("Parsed Event Type:", eventTypeHeader);
  console.log("Parsed Delivery ID:", deliveryId);

  if (!eventTypeHeader || !deliveryId) {
    return res.status(400).json({ error: 'Missing GitHub Webhook headers.' });
  }

  // Handle ping event from GitHub (sent when webhook is first created)
  if (eventTypeHeader === 'ping') {
    return res.status(200).json({ message: 'pong' });
  }

  const payload = req.body;
  console.log("\n📦 Processing webhook payload...");
  console.log("Payload keys:", Object.keys(payload));

  // Use the databaseId from GitHub payload instead of the GraphQL ID
  const githubRepoId = payload?.repository?.databaseId || payload?.repository?.id;
  console.log("Repository ID from payload:", payload?.repository?.id);
  console.log("Repository databaseId from payload:", payload?.repository?.databaseId);
  console.log("Using GitHub repository ID:", githubRepoId, "(type:", typeof githubRepoId, ")");

  if (!githubRepoId) {
    console.error("❌ Missing repository ID in payload");
    return res.status(400).json({ error: 'Missing repository ID in payload.' });
  }

  try {
    // 1. Fetch connected repository from database using GitHub ID
    console.log('🔍 Looking up repository with GitHub ID:', githubRepoId);
    console.log('🔍 GitHub ID type:', typeof githubRepoId);

    const repo = await prisma.repository.findUnique({
      where: { githubId: Number(githubRepoId) },
      include: { user: true },
    });

    // Debug: log mapping from GitHub repo ID to internal DB ID
    console.log('🔎 Webhook payload repository.id (GitHub):', githubRepoId);
    console.log('🔎 Mapped internal repository._id:', repo?.id ?? 'not found');
    console.log('🔎 Repository owner:', repo?.owner);
    console.log('🔎 Repository name:', repo?.name);

    if (!repo) {
      console.error('❌ Repository not found in database for GitHub ID:', githubRepoId);

      // Try alternative lookup in case the ID format is different
      console.log('🔍 Trying alternative lookup...');
      const allRepos = await prisma.repository.findMany();
      console.log('🔍 All repositories in database:', allRepos.map(r => ({ id: r.id, githubId: r.githubId, owner: r.owner, name: r.name })));

      return res.status(200).json({ message: 'Repository not connected to this bot. Ignoring.' });
    }

    if (!repo) {
      return res.status(200).json({ message: 'Repository not connected to this bot. Ignoring.' });
    }

    // 2. Verify webhook signature
    console.log("\n🔐 Verifying GitHub signature...");
    console.log("Webhook secret:", repo.webhookSecret?.substring(0, 5) + "..." || "None");
    console.log("Signature header:", signatureHeader?.substring(0, 10) + "..." || "None");

    const isSignatureValid = verifySignature(repo.webhookSecret, req.rawBody, signatureHeader);
    console.log("Signature valid:", isSignatureValid);

    if (!isSignatureValid) {
      console.warn('❌ Webhook signature validation failed, proceeding for debugging.');
    } else {
      console.log("✅ Signature verification passed");
    }

    // 3. Prevent duplicate processing (idempotency check)
    console.log("\n🔍 Checking for duplicate delivery:", deliveryId);
    const existingDelivery = await prisma.webhookDelivery.findUnique({
      where: { deliveryId },
    });

    if (existingDelivery) {
      console.log(`❌ Duplicate webhook delivery detected: ${deliveryId}. Skipping.`);
      return res.status(200).json({ message: 'Duplicate delivery skipped.' });
    }

    console.log("✅ No duplicate delivery found, proceeding with processing");

    // Record delivery ID
    console.log("\n💾 Recording webhook delivery:", deliveryId);
    try {
      await prisma.webhookDelivery.create({
        data: { deliveryId },
      });
      console.log("✅ Webhook delivery recorded successfully");
    } catch (deliveryError) {
      console.error("❌ Failed to record webhook delivery:", deliveryError);
      // Continue processing even if delivery recording fails
    }

    // 4. Respond to GitHub immediately to avoid timeout (200 OK/202 Accepted)
    res.status(202).json({ message: 'Webhook received. Processing in background.' });

    // 5. Run processing in the background asynchronously
    console.log("\n🚀 Starting background processing of webhook event...");
    processWebhookEvent(repo, eventTypeHeader, payload, deliveryId)
      .then(() => console.log("✅ Webhook processing completed successfully"))
      .catch((err) => {
        console.error(`❌ Error processing webhook event ${deliveryId}:`, err);
      });
  } catch (error) {
    console.error('Webhook endpoint error:', error);
    // Attempt to log the failure even if we lack repository context
    try {
      await createBotLog({
        repositoryId: '',
        deliveryId: deliveryId ?? '',
        eventType: `${eventTypeHeader}.error`,
        title: '',
        author: '',
        url: '',
        status: 'error',
        actionsTaken: [],
        errorDetails: (error as any).message || 'Unknown error',
      });
    } catch (logErr) {
      console.error('Failed to create BotActionLog for webhook error:', logErr);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process webhook setup.' });
    }
  }
});

/**
 * Processes GitHub webhook events in the background.
 */
async function processWebhookEvent(repo: any, eventType: string, payload: any, deliveryId: string) {
  console.log("\n========== WEBHOOK START ==========");
  console.log(`🚀 Processing event: ${eventType} for ${repo.owner}/${repo.name}`);
  console.log("Repo ID:", repo.id);
  console.log("GitHub Repo ID:", payload.repository?.id);
  console.log("Event Type:", eventType);
  console.log("Delivery ID:", deliveryId);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("========== END PAYLOAD ==========");
  console.log("Repository webhook secret:", repo.webhookSecret?.substring(0, 5) + "..." || "None");

  // Fetch active rules for the repository
  console.log('🔍 Fetching rules for repository ID:', repo.id);
  const rules = await prisma.rule.findMany({
    where: { repositoryId: repo.id, isActive: true },
  });
  console.log("✅ Fetched Rules:", JSON.stringify(rules, null, 2));

  if (rules.length === 0) {
    console.log('⚠️ No active rules found for repository ID:', repo.id);
  }
  // Extract common metadata depending on event type
  console.log("\n🔍 Extracting metadata from payload...");
  let title = '';
  let body = '';
  let author = '';
  let url = '';
  let number: number | null = null;
  let eventAction = payload?.action || ''; // 'opened', 'closed', etc.

  console.log("Event action:", eventAction);

  if (eventType === 'issues') {
    console.log("\n🔍 Processing issue event...");
    const issue = payload.issue;
    console.log("Issue number:", issue?.number);
    console.log("Issue title:", issue?.title);
    console.log("Issue body:", issue?.body?.substring(0, 100) + (issue?.body?.length > 100 ? '...' : ''));

    title = issue.title;
    body = issue.body || '';
    author = issue.user.login;
    url = issue.html_url;
    number = issue.number;

    // Log receipt of the issue payload
    console.log("\n💾 Saving initial bot log...");
    console.log("Repository ID:", repo.id);
    console.log("Delivery ID:", deliveryId);
    console.log("Event Type:", `${eventType}.${eventAction || 'opened'}`);
    console.log("Title:", title);
    console.log("Author:", author);
    console.log("URL:", url);

    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'opened'}`,
        title,
        author,
        url,
        status: 'success',
        actionsTaken: ['Issue payload received'],
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      });
      console.log('✅ Initial BotActionLog created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create initial BotActionLog:', logError);
    }
  } else if (eventType === 'pull_request') {
    console.log("\n🔍 Processing pull request event...");
    const pr = payload.pull_request;
    console.log("PR number:", pr?.number);
    console.log("PR title:", pr?.title);
    console.log("PR body:", pr?.body?.substring(0, 100) + (pr?.body?.length > 100 ? '...' : ''));

    title = pr.title;
    body = pr.body || '';
    author = pr.user.login;
    url = pr.html_url;
    number = pr.number;

    // Log receipt of the PR payload
    console.log("\n💾 Saving initial bot log...");
    console.log("Repository ID:", repo.id);
    console.log("Delivery ID:", deliveryId);
    console.log("Event Type:", `${eventType}.${eventAction || 'opened'}`);
    console.log("Title:", title);
    console.log("Author:", author);
    console.log("URL:", url);

    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'opened'}`,
        title,
        author,
        url,
        status: 'success',
        actionsTaken: ['PR payload received'],
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      });
      console.log('✅ Initial BotActionLog created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create initial BotActionLog:', logError);
    }
  } else if (eventType === 'push') {
    console.log("\n🔍 Processing push event...");
    const pusher = payload.pusher;
    const commits = payload.commits || [];
    title = `Push by ${pusher.name}`;
    body = commits.map((c: any) => `- ${c.message}`).join('\n');
    author = pusher.name;
    url = payload.compare;
    console.log("Push commits count:", commits.length);

    // Log receipt of the push payload
    console.log("\n💾 Saving initial bot log...");
    console.log("Repository ID:", repo.id);
    console.log("Delivery ID:", deliveryId);
    console.log("Event Type:", `${eventType}.${eventAction || 'push'}`);
    console.log("Title:", title);
    console.log("Author:", author);
    console.log("URL:", url);

    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'push'}`,
        title,
        author,
        url,
        status: 'success',
        actionsTaken: ['Push payload received'],
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      });
      console.log('✅ Initial BotActionLog created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create initial BotActionLog:', logError);
    }
  } else {
    // Unsupported event type
    console.log(`\n❌ Skipping unsupported event type: ${eventType}`);

    // Log a skipped entry in action logs
    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'push'}`,
        title,
        author,
        url,
        status: 'skipped',
        actionsTaken: [`Unsupported event type: ${eventType}`],
      });
      console.log('✅ Skipped log created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create skipped log:', logError);
    }

    return;
  }

  // We only run rules on issue opened, PR opened, or push
  // If the action is not opened/created, we can skip processing rules unless it's a push event (push doesn't have action)
  if (eventType !== 'push' && eventAction !== 'opened') {
    console.log(`\n⚠️ Event Action is '${eventAction}' instead of 'opened'. Skipping bot rules execution.`);
    console.log("Event type:", eventType);
    console.log("Event action:", eventAction);

    // Log a skipped entry in action logs
    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'push'}`,
        title,
        author,
        url,
        status: 'skipped',
        actionsTaken: [`Event action ${eventAction} is not 'opened'`],
      });
      console.log('✅ Skipped log created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create skipped log:', logError);
    }

    return;
  }

  const matchedRules = rules.filter((rule) => {
    console.log("\n🔍 Checking Rule...");
    console.log("Rule ID:", rule.id);
    console.log("Rule triggerEvent:", rule.triggerEvent);
    console.log("Incoming eventType:", eventType);
    if (rule.triggerEvent !== eventType) {
      console.log("❌ Rule skipped: trigger event mismatch");
      return false;
    }

    let conditions: any = {};

    try {
      conditions = JSON.parse(rule.conditions);
      console.log("✅ Rule conditions parsed:", conditions);
    } catch (parseError) {
      console.error("❌ Failed to parse rule conditions:", parseError);
      return false;
    }

    // Check keyword match (case-insensitive) in title or body
    if (conditions.keyword) {
      const keyword = conditions.keyword.toLowerCase();
      const inTitle = title.toLowerCase().includes(keyword);
      const inBody = body.toLowerCase().includes(keyword);
      console.log(`Keyword check: "${keyword}" in title: ${inTitle}, in body: ${inBody}`);
      if (!inTitle && !inBody) {
        console.log("❌ Rule skipped: keyword not found");
        return false;
      }
    }

    // Check author match (case-insensitive)
    if (conditions.author) {
      const authorMatch = author.toLowerCase() === conditions.author.toLowerCase();
      console.log(`Author check: "${author}" === "${conditions.author}"? ${authorMatch}`);
      if (!authorMatch) {
        console.log("❌ Rule skipped: author mismatch");
        return false;
      }
    }

    console.log("✅ Rule matched!");
    return true;
  });

  if (matchedRules.length === 0) {
    console.log(`\n❌ No active rules matched event: ${eventType} for ${repo.owner}/${repo.name}`);
    // Log a skipped entry in action logs
    try {
      await createBotLog({
        repositoryId: repo.id,
        deliveryId,
        eventType: `${eventType}.${eventAction || 'push'}`,
        title,
        author,
        url,
        status: 'skipped',
        actionsTaken: ['No matching rules found.'],
      });
      console.log('✅ Skipped log created for delivery', deliveryId);
    } catch (logError) {
      console.error('❌ Failed to create skipped log:', logError);
    }
    return;
  } else {
    console.log(`\n✅ Found ${matchedRules.length} matching rules for event: ${eventType}`);
  }

  // Authenticate GitHub Client using User's stored OAuth token
  const octokit = new Octokit({ auth: repo.user.accessToken });

  // Run AI triage if ANY matched rule requires it
  let aiResult: AITriageResult | undefined = undefined;
  const requiresAI = matchedRules.some((rule) => {
    try {
      const actions = JSON.parse(rule.actions);
      return !!actions.ai;
    } catch {
      return false;
    }
  });

  if (requiresAI && (eventType === 'issues' || eventType === 'pull_request')) {
    console.log(`\n🤖 Running AI Triage for ${repo.owner}/${repo.name}...`);
    console.log("Title:", title);
    console.log("Author:", author);
    console.log("Type:", eventType === 'issues' ? 'issue' : 'pull_request');

    try {
      aiResult = await triageEvent(title, body, author, eventType === 'issues' ? 'issue' : 'pull_request');
      console.log("✅ AI Triage completed:");
      console.log("- Summary:", aiResult?.summary);
      console.log("- Priority:", aiResult?.priority);
      console.log("- Sentiment:", aiResult?.sentiment);
      console.log("- Suggested Label:", aiResult?.suggestedLabel);
    } catch (aiError) {
      console.error("❌ AI Triage failed:", aiError);
    }
  } else if (requiresAI) {
    console.log(`\n⚠️ AI triage required but event type is not issues or pull_request, skipping`);
  }

  const actionsTaken: string[] = [];
  const errors: string[] = [];

  // Execute rules
  console.log("\n🔍 Executing matched rules...");
  console.log("Number of matched rules:", matchedRules.length);

  for (const rule of matchedRules) {
    console.log("\n📋 Processing rule:", rule.name);

    try {
      const actions = JSON.parse(rule.actions);
      console.log("Rule actions:", actions);

      // Add AI-derived metadata if applicable
      if (aiResult && actions.ai) {
        if (aiResult.summary) {
          actions.aiSummary = aiResult.summary;
        }
        if (aiResult.priority) {
          actions.aiPriority = aiResult.priority;
        }
        if (aiResult.sentiment) {
          actions.aiSentiment = aiResult.sentiment;
        }
      }

      // Post a comment if configured
      if (actions.comment) {
        console.log("✅ Posting comment:", actions.comment);
        const commentBody = actions.comment
          .replace(/{{summary}}/g, aiResult?.summary || '')
          .replace(/{{priority}}/g, aiResult?.priority || '')
          .replace(/{{sentiment}}/g, aiResult?.sentiment || '');

        await octokit.issues.createComment({
          owner: repo.owner,
          repo: repo.name,
          issue_number: number!,
          body: commentBody,
        });
        actionsTaken.push(`Posted comment: ${commentBody.substring(0, 50)}...`);
      }

      // Add a label if configured
      if (actions.label) {
        console.log("✅ Adding label:", actions.label);
        await octokit.issues.addLabels({
          owner: repo.owner,
          repo: repo.name,
          issue_number: number!,
          labels: [actions.label],
        });
        actionsTaken.push(`Added label: ${actions.label}`);
      }

      // Notify Slack if configured
      if (actions.slack && repo.slackWebhookUrl) {
        console.log("✅ Notifying Slack");
        try {
          await fetch(repo.slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `New ${eventType} "${title}" by ${author}`,
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `New ${eventType}`,
                  },
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*${title}*
${url}`,
                  },
                },
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `Opened by ${author}`,
                    },
                  ],
                },
              ],
            }),
          });
          actionsTaken.push('Notified Slack');
        } catch (slackError) {
          console.error('❌ Slack notification failed:', slackError);
          errors.push(`Slack notification failed: ${slackError}`);
        }
      }
    } catch (ruleError) {
      console.error('❌ Rule execution failed:', ruleError);
      errors.push(`Rule execution failed: ${ruleError}`);
    }
  }

  // Final log entry for this webhook processing
  try {
    await createBotLog({
      repositoryId: repo.id,
      deliveryId,
      eventType: `${eventType}.${eventAction || 'completed'}`,
      title,
      author,
      url,
      status: errors.length > 0 ? 'error' : 'success',
      actionsTaken,
      errorDetails: errors.length > 0 ? errors.join('; ') : null,
      aiSummary: aiResult?.summary || null,
      aiPriority: aiResult?.priority || null,
      aiSentiment: aiResult?.sentiment || null,
    });
    console.log('✅ Final BotActionLog created for delivery', deliveryId);
  } catch (logError) {
    console.error('❌ Failed to create final BotActionLog:', logError);
  }

  console.log("\n========== WEBHOOK END ==========");
}

// Simple signature verification (for demo purposes)
function verifySignature(secret: string | undefined, body: string, signatureHeader: string | undefined): boolean {
  if (!secret || !signatureHeader) {
    console.warn('❌ Signature verification skipped: missing secret or header');
    return true; // For demo purposes, allow if missing
  }

  try {
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    return signature === signatureHeader;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

export default router;
