import { Router, Response } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
// Prisma removed; no database layer
import { AuthenticatedRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-token-key-for-local-dev-123!';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Dev-only bypass endpoint to sign in using the seeded mock user
// Dev-only bypass endpoint removed; authentication now relies solely on GitHub OAuth

// Step 1: Redirect to GitHub authorize page
router.get('/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GitHub Client ID is not configured.' });
  }

  // Requesting 'repo' scope to list/configure repos, and 'read:user' to read profile details
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,read:user`;
  res.redirect(githubAuthUrl);
});

// Step 2: Callback from GitHub OAuth
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;

  console.log("OAuth code:", code);

  if (!code) {
    console.error("OAuth callback error: Missing code");
    return res.redirect(`${CLIENT_URL}?error=code_missing`);
  }

  try {
    // 1. Exchange OAuth code for Access Token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const { access_token, error, error_description } = tokenResponse.data;

    console.log("Access token response:", tokenResponse.data);

    if (error) {
      console.error('GitHub token exchange error:', error_description);
      return res.redirect(`${CLIENT_URL}?error=${error}`);
    }

    // 2. Fetch User Info from GitHub API using standard user endpoint
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
        'User-Agent': 'GitHub-Automation-Bot',
      },
    });

    const githubUser = userResponse.data;

    // 3. Create JWT token without persisting user
    const token = jwt.sign(
      {
        githubId: githubUser.id.toString(), // Convert to string to match interface
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        accessToken: access_token,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend dashboard with JWT token in query
    console.log("Redirecting to:", `${CLIENT_URL}/dashboard?token=${token}`);
    res.redirect(`${CLIENT_URL}/dashboard?token=${token}`);

  } catch (error: any) {
    console.error('OAuth Callback Error:', error?.response?.data || error.message);
    console.error('Full error object:', error);
    res.redirect(`${CLIENT_URL}?error=auth_failed&details=${encodeURIComponent(error?.response?.data?.error || error.message || 'Unknown error')}`);
  }
});

// Stateless endpoint to return the current user (decoded from JWT)
router.get('/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { githubId, username, avatarUrl } = req.user;
  res.json({ githubId, username, avatarUrl });
});

export default router;
