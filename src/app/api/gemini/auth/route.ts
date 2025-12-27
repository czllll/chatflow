const OAUTH_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(req: Request) {
  try {
    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Code is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirect_uri || 'http://localhost'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    if (!data.refresh_token) {
       // Sometimes if re-authorizing without prompt=consent, it might not return refresh token.
       // But our frontend link will force prompt=consent.
       throw new Error("No refresh token returned. Please try revoking access and authorizing again.");
    }

    return new Response(JSON.stringify({ refresh_token: data.refresh_token }), {
       headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Token Exchange Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
