// Antigravity Models API - Fetch available models with quota info

import { antigravityTokenManager } from "@/lib/antigravity/token-manager";

// API endpoints
const LOAD_PROJECT_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';
const FETCH_MODELS_URL = 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels';
const USER_AGENT = 'antigravity/1.11.3 Darwin/arm64';

// Generate a mock project ID (fallback if loadCodeAssist fails)
function generateMockProjectId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'ag-';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Get project ID from loadCodeAssist API
async function getProjectId(accessToken: string): Promise<string> {
  try {
    const response = await fetch(LOAD_PROJECT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        metadata: {
          ideType: 'ANTIGRAVITY'
        }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.cloudaicompanionProject) {
        return data.cloudaicompanionProject;
      }
    }
  } catch (e) {
    console.warn('Failed to get project ID from loadCodeAssist:', e);
  }

  // Fallback to mock project ID
  return generateMockProjectId();
}

export async function GET(req: Request) {
  try {
    // Get optional refresh token from header
    const refreshToken = req.headers.get('x-api-key') || undefined;
    const accessToken = await antigravityTokenManager.getAccessToken(refreshToken);

    // Get project ID
    const projectId = await getProjectId(accessToken);

    // Fetch available models
    const response = await fetch(FETCH_MODELS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        project: projectId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Antigravity fetchAvailableModels failed:', response.status, errorText);
      
      // Return fallback models if API fails
      return new Response(JSON.stringify({
        models: [
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', isMultimodal: true },
          { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', isMultimodal: true },
        ],
        projectId,
        error: `API Error: ${response.status}`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    
    // Parse models from response
    // Response format: { models: { "modelName": { quotaInfo: { remainingFraction, resetTime } } } }
    const models: { id: string; name: string; isMultimodal: boolean; quotaPercent?: number; resetTime?: string }[] = [];
    
    if (data.models) {
      for (const [modelName, modelInfo] of Object.entries(data.models)) {
        // Filter for Gemini and Claude models
        if (modelName.includes('gemini') || modelName.includes('claude')) {
          const info = modelInfo as { quotaInfo?: { remainingFraction?: number; resetTime?: string } };
          models.push({
            id: modelName,
            name: formatModelName(modelName),
            isMultimodal: modelName.includes('gemini') || modelName.includes('claude'),
            quotaPercent: info.quotaInfo?.remainingFraction ? Math.round(info.quotaInfo.remainingFraction * 100) : undefined,
            resetTime: info.quotaInfo?.resetTime,
          });
        }
      }
    }

    // Sort models: Gemini 2.5 first, then 3.x, then Claude
    models.sort((a, b) => {
      const order = (id: string) => {
        if (id.includes('gemini-2.5')) return 0;
        if (id.includes('gemini-3')) return 1;
        if (id.includes('claude')) return 2;
        return 3;
      };
      return order(a.id) - order(b.id);
    });

    return new Response(JSON.stringify({
      models,
      projectId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Antigravity models error:', error);
    return new Response(JSON.stringify({ 
      error: String(error),
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', isMultimodal: true },
      ],
    }), {
      status: 200, // Return 200 with fallback models
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Format model name for display
function formatModelName(modelId: string): string {
  // Remove 'models/' prefix if present
  const id = modelId.replace('models/', '');
  
  // Apply formatting rules
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/(\d+)\.(\d+)/g, '$1.$2'); // Keep version numbers
}
