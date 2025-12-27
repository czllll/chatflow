// Antigravity Auth API - Exchange OAuth code for refresh token

import { antigravityTokenManager } from "@/lib/antigravity/token-manager";

export async function POST(req: Request) {
  try {
    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Exchange the authorization code for tokens
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: antigravityTokenManager.clientId,
        client_secret: antigravityTokenManager.clientSecret,
        code,
        redirect_uri: redirect_uri || 'http://localhost',
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Antigravity token exchange failed:', errorText);
      return new Response(JSON.stringify({ error: `Token exchange failed: ${errorText}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    if (!data.refresh_token) {
      return new Response(JSON.stringify({ 
        error: 'No refresh token received. This may happen if you have previously authorized this app. Please revoke access in Google Account settings and try again.',
        access_token: data.access_token,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save the refresh token locally (optional, for development convenience)
    antigravityTokenManager.saveRefreshToken(data.refresh_token);

    return new Response(JSON.stringify({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_in: data.expires_in,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Antigravity auth error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
