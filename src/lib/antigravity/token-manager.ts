// Antigravity Token Manager
// OAuth credentials for Antigravity (different from Gemini CLI)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Antigravity OAuth configuration (from Antigravity-Manager)
const ANTIGRAVITY_OAUTH_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID;
const ANTIGRAVITY_OAUTH_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET;
const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Antigravity-specific scopes
export const ANTIGRAVITY_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface AntigravityTokenFile {
  refresh_token?: string;
  access_token?: string;
}

class AntigravityTokenManager {
  private tokenCache: TokenCache | null = null;
  private readonly tokenFilePath: string;

  constructor() {
    // Store Antigravity tokens separately from Gemini tokens
    this.tokenFilePath = path.join(os.homedir(), '.antigravity', 'tokens.json');
  }

  get clientId(): string {
    if (!ANTIGRAVITY_OAUTH_CLIENT_ID) {
      throw new Error('ANTIGRAVITY_CLIENT_ID environment variable is not set');
    }
    return ANTIGRAVITY_OAUTH_CLIENT_ID;
  }

  get clientSecret(): string {
    if (!ANTIGRAVITY_OAUTH_CLIENT_SECRET) {
      throw new Error('ANTIGRAVITY_CLIENT_SECRET environment variable is not set');
    }
    return ANTIGRAVITY_OAUTH_CLIENT_SECRET;
  }

  /**
   * Get refresh token from various sources
   * Priority: User-provided > Environment Variable > Local File
   */
  private getRefreshToken(userProvidedToken?: string): string | null {
    // 1. User-provided token (via header)
    if (userProvidedToken) {
      return userProvidedToken;
    }

    // 2. Environment variable
    const envToken = process.env.ANTIGRAVITY_REFRESH_TOKEN;
    if (envToken) {
      return envToken;
    }

    // 3. Local token file
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = fs.readFileSync(this.tokenFilePath, 'utf-8');
        const tokens: AntigravityTokenFile = JSON.parse(data);
        if (tokens.refresh_token) {
          return tokens.refresh_token;
        }
      }
    } catch (e) {
      console.warn('Failed to read Antigravity token file:', e);
    }

    return null;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(userProvidedRefreshToken?: string): Promise<string> {
    // Check if cached token is still valid (with 5 min buffer)
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 300000) {
      return this.tokenCache.accessToken;
    }

    const refreshToken = this.getRefreshToken(userProvidedRefreshToken);
    if (!refreshToken) {
      throw new Error('No Antigravity refresh token available. Please authenticate via Settings.');
    }

    if (!ANTIGRAVITY_OAUTH_CLIENT_ID || !ANTIGRAVITY_OAUTH_CLIENT_SECRET) {
      throw new Error('Antigravity OAuth credentials are not configured');
    }

    // Refresh the token
    const response = await fetch(ANTIGRAVITY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH_CLIENT_ID,
        client_secret: ANTIGRAVITY_OAUTH_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Antigravity token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;

    // Cache the token
    this.tokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return accessToken;
  }

  /**
   * Save refresh token to local file
   */
  saveRefreshToken(refreshToken: string): void {
    try {
      const dir = path.dirname(this.tokenFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.tokenFilePath, JSON.stringify({ refresh_token: refreshToken }, null, 2));
    } catch (e) {
      console.error('Failed to save Antigravity refresh token:', e);
    }
  }

  /**
   * Clear cached tokens
   */
  clearCache(): void {
    this.tokenCache = null;
  }
}

// Singleton instance
export const antigravityTokenManager = new AntigravityTokenManager();
