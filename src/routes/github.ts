import { Router, Response } from 'express';
import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';

// List user's GitHub repositories and their connection status
router.get('/repos', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const octokit = new Octokit({ auth: req.user.accessToken });

    // Fetch user's repositories (limit to 100 for simplicity)
    const { data: githubRepos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });

    // Fetch repositories already connected in our DB for this user
    const connectedRepos = await prisma.repository.findMany({
      where: { userId: req.user.id },
      select: { githubId: true, id: true, slackWebhookUrl: true },
    });

    const connectedMap = new Map(connectedRepos.map((r) => [r.githubId, r]));

    const repos = githubRepos.map((r) => {
      const conn = connectedMap.get(r.id);
      return {
        githubId: r.id,
        name: r.name,
        owner: r.owner.login,
        fullName: r.full_name,
        description: r.description,
        url: r.html_url,
        isPrivate: r.private,
        isConnected: !!conn,
        dbId: conn ? conn.id : null,
        slackWebhookUrl: conn ? conn.slackWebhookUrl : null,
      };
    });

    res.json(repos);
  } catch (error: any) {
    console.error('Error fetching GitHub repos:', error?.message);
    res.status(500).json({ error: 'Failed to fetch repositories from GitHub.' });
  }
});

// Connect a repository: Save to DB & create webhook on GitHub
router.post('/connect', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const { githubId, owner, name, slackWebhookUrl } = req.body;

  if (!githubId || !owner || !name) {
    return res.status(400).json({ error: 'Missing required parameters: githubId, owner, name' });
  }

  try {
    // Check if repository is already connected
    const existing = await prisma.repository.findUnique({
      where: { githubId: Number(githubId) },
    });

    if (existing) {
      return res.status(400).json({ error: 'Repository is already connected.' });
    }

    // Generate random secret for securing webhooks
    const webhookSecret = crypto.randomBytes(20).toString('hex');

    const octokit = new Octokit({ auth: req.user.accessToken });

    // Create webhook on GitHub
    // Build the public webhook URL (must be reachable by GitHub)
  const publicBaseUrl = process.env.BASE_URL?.replace(/\/$/, '') || `http://localhost:5001`;
  const webhookTargetUrl = `${publicBaseUrl}/api/webhooks/github`;
  console.log('Webhook URL:', webhookTargetUrl);
    console.log(`Creating webhook target URL: ${webhookTargetUrl}`);

    let webhookId: string | null = null;
    try {
      const webhookResponse = await octokit.repos.createWebhook({
        owner,
        repo: name,
        config: {
          url: webhookTargetUrl,
          content_type: 'json',
          secret: webhookSecret,
          insecure_ssl: '1', // Support HTTP / self-signed certs (e.g., localtunnel)
        },
        events: ['issues', 'pull_request', 'push'],
        active: true,
      });

      webhookId = webhookResponse.data.id?.toString() ?? null;
    } catch (webhookError: any) {
      console.error('GitHub webhook creation failed:', webhookError?.message || webhookError);
      return res.status(500).json({
        error: `Could not create GitHub webhook. Ensure you have admin access to the repository. Error: ${webhookError?.message}`,
      });
    }

    // Save repository in Database
    console.log('Creating repository in database with data:', {
      githubId: Number(githubId),
      owner,
      name,
      webhookId,
      webhookSecret,
      slackWebhookUrl: slackWebhookUrl || null,
      userId: req.user.id,
    });
    
    const newRepo = await prisma.repository.create({
      data: {
        githubId: Number(githubId),
        owner,
        name,
        webhookId,
        webhookSecret,
        slackWebhookUrl: slackWebhookUrl || null,
        userId: req.user.id, // Add userId to associate repository with user
      },
    });
    
    console.log('Repository created successfully:', newRepo);

    // Create a default rule for issues
    await prisma.rule.create({
      data: {
        repositoryId: newRepo.id,
        name: 'Default Issue Triage',
        triggerEvent: 'issues',
        conditions: JSON.stringify({ keyword: '' }), // Empty means match everything
        actions: JSON.stringify({
          comment: 'Hello! I am a bot. Thanks for opening this issue. Our team has been notified.',
          label: '',
          slack: true,
          ai: true, // Run AI Triage by default
        }),
      },
    });

    // Create initial log for the repository
    console.log('Creating initial log for repository:', newRepo.id);
    const initialLog = await prisma.botActionLog.create({
      data: {
        repositoryId: newRepo.id,
        deliveryId: 'initial-connection',
        eventType: 'system.connected',
        title: 'Repository connected to bot',
        author: 'system',
        url: `https://github.com/${owner}/${name}`,
        status: 'success',
        actionsTaken: JSON.stringify(['Repository connected to the bot']),
        errorDetails: null,
        aiSummary: null,
        aiPriority: null,
        aiSentiment: null,
      },
    });
    console.log('Initial log created:', initialLog);

    // Create logs for existing issues in the background
    setTimeout(async () => {
      try {
        // Fetch the repository with user data
        const repoWithUser = await prisma.repository.findUnique({
          where: { id: newRepo.id },
          include: { user: true }
        });
        
        if (repoWithUser) {
          // Import the function here to avoid circular dependencies
          const { createLogsForExistingIssues } = require('../webhooks');
          await createLogsForExistingIssues(repoWithUser);
        }
      } catch (error) {
        console.error('❌ Error creating logs for existing issues:', error);
      }
    }, 1000); // Small delay to ensure the repository is fully created

    res.status(201).json(newRepo);
  } catch (error: any) {
    console.error('Error connecting repo:', error);
    res.status(500).json({ error: 'Internal server error while connecting repository.' });
  }
});

// Disconnect repository: Delete webhook & remove from DB
router.delete('/disconnect/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;

  try {
    const repo = await prisma.repository.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Connected repository not found.' });
    }

    // Attempt to delete the webhook from GitHub
    if (repo.webhookId) {
      const octokit = new Octokit({ auth: req.user.accessToken });
      try {
        await octokit.repos.deleteWebhook({
          owner: repo.owner,
          repo: repo.name,
          hook_id: Number(repo.webhookId),
        });
        console.log(`Deleted GitHub webhook ${repo.webhookId} for ${repo.owner}/${repo.name}`);
      } catch (githubErr: any) {
        // If webhook was already deleted manually on GitHub, log it and proceed to remove from our DB
        console.warn(`Could not delete webhook from GitHub (might already be deleted):`, githubErr.message);
      }
    }

    // Remove from DB (cascade deletes rules and logs)
    await prisma.repository.delete({
      where: { id },
    });

    res.json({ message: 'Repository disconnected successfully.' });
  } catch (error) {
    console.error('Error disconnecting repository:', error);
    res.status(500).json({ error: 'Internal server error while disconnecting repository.' });
  }
});

// Update Slack Webhook URL for a repository
router.put('/:id/slack', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { slackWebhookUrl } = req.body;

  try {
    const repo = await prisma.repository.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Connected repository not found.' });
    }

    const updated = await prisma.repository.update({
      where: { id },
      data: { slackWebhookUrl: slackWebhookUrl || null },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error updating Slack settings.' });
  }
});

export default router;
