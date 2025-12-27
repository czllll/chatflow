import fs from 'fs';
import path from 'path';
import os from 'os';

// Gemini CLI Code Assist OAuth Configuration
// Gemini CLI Code Assist OAuth Configuration
// Switched to Antigravity Client ID as it has more permissive Project ID checks
const OAUTH_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TOKEN_FILE_PATH = path.join(os.homedir(), '.gemini', 'tokens.json');

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

// In-memory cache for access tokens associated with refresh tokens
// Map<RefreshToken, TokenData>
const tokenCache = new Map<string, TokenData>();

export class GeminiTokenManager {
  /**
   * Get a valid access token.
   * Priority:
   * 1. Check if we have a valid cached access token in memory for this user.
   * 2. If close to expiry, refresh it using the refresh token.
   * 3. Return the access token.
   */
  async getAccessToken(userProvidedRefreshToken?: string): Promise<string> {
    const refreshToken = this.resolveRefreshToken(userProvidedRefreshToken);
    if (!refreshToken) {
      throw new Error('No Gemini refresh token found in Environment or Request.');
    }

    // 1. Check Cache
    let tokenData = tokenCache.get(refreshToken);
    
    // If not in memory cache, try to load from file (only if it matches the file's refresh token)
    if (!tokenData && !userProvidedRefreshToken) {
       // Only try loading from file if we are using the default/env workflow
       // For BYOT, we rely on the memory cache being populated or initial refresh
       const fileData = this.loadFromFile();
       if (fileData && fileData.refresh_token === refreshToken) {
         tokenData = fileData;
         tokenCache.set(refreshToken, tokenData);
       }
    }

    // 2. Validate & Refresh if needed
    // Safety buffer: 5 minutes (300000 ms)
    const now = Date.now();
    if (!tokenData || !tokenData.access_token || (tokenData.expiry_date && tokenData.expiry_date - now < 300000)) {
       // Need refresh
       console.log('[Gemini] Refreshing access token...');
       tokenData = await this.refreshAccessToken(refreshToken);
       
       // Update Cache
       tokenCache.set(refreshToken, tokenData);
       
       // Update File (only if not BYOT and in Dev mode ideally, but we'll do it if it matches file storage path)
       if (!userProvidedRefreshToken && process.env.NODE_ENV === 'development') {
          this.saveToFile(tokenData);
       }
    }

    return tokenData.access_token;
  }

  /**
   * Resolve the effective refresh token from sources.
   */
  private resolveRefreshToken(userProvided?: string): string | null {
    // 1. User/Header provided
    if (userProvided && userProvided.trim().length > 0) return userProvided.trim();

    // 2. Environment Variable
    if (process.env.GEMINI_REFRESH_TOKEN) return process.env.GEMINI_REFRESH_TOKEN;

    // 3. Local File (Dev fallback)
    const fileData = this.loadFromFile();
    if (fileData?.refresh_token) return fileData.refresh_token;

    return null;
  }

  /**
   * Exchange refresh_token for new access_token via Google OAuth2 endpoint.
   */
  private async refreshAccessToken(refreshToken: string): Promise<TokenData> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: OAUTH_CLIENT_ID,
          client_secret: OAUTH_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken, // Google might not return a new refresh token
        expiry_date: Date.now() + (data.expires_in * 1000), // expires_in is seconds
        token_type: data.token_type || 'Bearer',
        scope: data.scope
      };
    } catch (error) {
      console.error('[Gemini] Token refresh error:', error);
      throw error;
    }
  }

  // --- File Storage Helpers ---

  private loadFromFile(): TokenData | null {
    try {
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        const content = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }

  private saveToFile(data: TokenData) {
    try {
      const dir = path.dirname(TOKEN_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[Gemini] Failed to save tokens to file:', e);
    }
  }
}

export const geminiTokenManager = new GeminiTokenManager();
