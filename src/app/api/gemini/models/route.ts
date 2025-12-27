import { geminiTokenManager } from "@/lib/gemini/token-manager";

// Hardcoded model list for Gemini CLI
// Based on official google-gemini/gemini-cli and claude-relay-service
// Gemini 3 requires special preview access - not included for now
const GEMINI_CLI_MODELS = [
  // Gemini 2.5 Models (Default, verified working)
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", isMultimodal: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", isMultimodal: true },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", isMultimodal: true },
  // Legacy Models  
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", isMultimodal: true },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", isMultimodal: true },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", isMultimodal: true },
];

export async function GET(req: Request) {
  try {
    // Validate that we have a working token (optional - just to give early feedback)
    const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");
    
    // If token is provided, try to validate it (will throw if invalid)
    if (apiKey) {
      try {
        await geminiTokenManager.getAccessToken(apiKey);
      } catch (e) {
        console.warn("Gemini token validation failed, but returning hardcoded list:", (e as Error).message);
        // Continue anyway - the hardcoded list is still useful
      }
    }

    // Return hardcoded model list
    const models = GEMINI_CLI_MODELS.map(m => ({
      ...m,
      object: 'model',
      created: Date.now(),
      owned_by: 'google'
    }));

    return new Response(JSON.stringify({ data: models }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Failed to process Gemini models request:", error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      data: GEMINI_CLI_MODELS // Still return models even on error
    }), {
      status: 200, // Return 200 with fallback data
      headers: { "Content-Type": "application/json" },
    });
  }
}
