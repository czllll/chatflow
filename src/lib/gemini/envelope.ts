import { nanoid } from 'nanoid';

// --- Types ---
export interface GeminiInternalRequestEnvelope {
  project: string;
  requestId: string;
  model: string;
  userAgent: 'antigravity';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any; // The payload content
  userPromptId?: string;
}

export function buildGeminiEnvelope(
  modelId: string, 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any, 
  project?: string,
  sessionId?: string
): GeminiInternalRequestEnvelope {
  
  // Clean model ID: Ensure it starts with "models/"
  const model = modelId.startsWith('models/') ? modelId : `models/${modelId}`;

  // Generate fake project ID if not provided (similar to claude-relay)
  // Format: ag-uuid
  const resolvedProjectId = project || `ag-${nanoid(16)}`;

  // Use sessionId if available in payload
  const resolvedSessionId = sessionId || `sess-${nanoid()}`;

  // Construct request payload
  // The structure expected inside `request` is mostly the same as public API:
  // { contents: [...], generationConfig: {...}, ... }
  // We need to inject sessionId here if we want conversation continuity in internal API context mechanisms
  const requestBody = {
    ...payload,
    sessionId: resolvedSessionId
  };

  return {
    project: resolvedProjectId,
    requestId: `req-${nanoid()}`,
    model: model,
    userAgent: 'antigravity',
    request: requestBody
  };
}
