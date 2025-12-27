import OpenAI from "openai";
import { geminiTokenManager } from "@/lib/gemini/token-manager";
import { convertToGeminiMessages, geminiToOpenAIStream } from "@/lib/gemini/adapter";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get API configuration from headers (BYOK pattern)
  const apiKey = req.headers.get("x-api-key");
  const baseUrl = req.headers.get("x-base-url") || "https://api.openai.com/v1";
  const model = req.headers.get("x-model") || "gpt-4o";

  // --- Gemini CLI Support ---
  if (baseUrl === 'gemini-cli' || baseUrl.endsWith('/api/gemini') || model.startsWith('gemini-cli')) {
    try {
      // 1. Resolve Token (Header > Env > File)
      // The frontend might pass the refresh token in 'x-api-key' for simplicity in the UI settings
      const userProvidedToken = apiKey; 
      const accessToken = await geminiTokenManager.getAccessToken(userProvidedToken || undefined);

      // 2. Prepare Payload using Antigravity envelope format
      const { contents, systemInstruction } = convertToGeminiMessages(messages);
      
      // The cloudcode-pa API requires specific envelope fields
      const targetModel = model === 'gemini-cli' ? 'gemini-2.5-flash' : model.replace('gemini-cli/', '');
      
      // Generate required IDs for the request
      // Generate required IDs for the request
      // Use 'google-cloud-shell' as a generic project ID which is usually available/allowlisted for personal accounts
      const projectId = `google-cloud-shell`;
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      
      // Complete envelope format required by cloudcode-pa.googleapis.com/v1internal
      const envelopePayload = {
        project: projectId,
        requestId: requestId,
        model: targetModel,
        userAgent: 'chatflow/1.0.0',
        request: {
          contents,
          ...(systemInstruction && { systemInstruction }),
          sessionId: sessionId,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          }
        }
      };
      
      // 3. Request Code Assist API (used by official Gemini CLI)
      // The URL must include ?alt=sse for server-sent events streaming
      const apiUrl = `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'chatflow/1.0.0',
        },
        body: JSON.stringify(envelopePayload)
      });

      if (!response.ok) {
         const errText = await response.text();
         throw new Error(`Gemini API Error: ${response.status} ${errText}`);
      }

      // 4. Stream Response
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
             // geminiToOpenAIStream yields objects { choices: [...] }
             for await (const chunk of geminiToOpenAIStream(response)) {
                // OpenAI stream format expected by AI SDK: Just the text content usually for this simple route, 
                // OR full data chunks. 
                // Looking at the existing code: it extracts `chunk.choices[0]?.delta?.content` and sends RAW TEXT.
                // So we should do the same.
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                   try {
                     controller.enqueue(encoder.encode(content));
                   } catch {
                     // Controller might be closed if client disconnected
                     break; 
                   }
                }
             }
          } catch (e) {
             console.error("Gemini Stream Error:", e);
             controller.error(e);
          } finally {
             controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });

    } catch (error) {
      console.error("Gemini CLI Adapter Error:", error);
      return new Response(`Error: ${(error as Error).message}`, { status: 500 });
    }
  }

  // --- Antigravity Support ---
  if (baseUrl.endsWith('/api/antigravity')) {
    try {
      const { antigravityTokenManager } = await import("@/lib/antigravity/token-manager");
      const { buildAntigravityRequest, antigravityToOpenAIStream } = await import("@/lib/antigravity/adapter");
      
      // 1. Get Access Token
      const userProvidedToken = apiKey;
      const accessToken = await antigravityTokenManager.getAccessToken(userProvidedToken || undefined);

      const targetModel = model.replace('antigravity/', '');
      
      // Generate required IDs for the request
      const projectId = `ag-${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      
      // 2. Build request using the appropriate format (Claude or Gemini)
      const envelopePayload = buildAntigravityRequest(messages, targetModel, {
        projectId,
        sessionId,
        requestId,
        temperature: 0.7,
        maxTokens: 8192,
      });
      
      // 3. Request Antigravity API (production endpoint as used by Antigravity-Manager)
      const apiUrl = `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'antigravity/1.11.3 Darwin/arm64',
        },
        body: JSON.stringify(envelopePayload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Antigravity API Error: ${response.status} ${errText}`);
      }

      // 4. Stream Response (using adapter that handles both formats)
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of antigravityToOpenAIStream(response)) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                try {
                  controller.enqueue(encoder.encode(content));
                } catch {
                  break;
                }
              }
            }
          } catch (e) {
            console.error("Antigravity Stream Error:", e);
            controller.error(e);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });

    } catch (error) {
      console.error("Antigravity Adapter Error:", error);
      return new Response(`Error: ${(error as Error).message}`, { status: 500 });
    }
  }
  // --------------------------

  if (!apiKey) {
    return new Response("API key is required", { status: 401 });
  }

  // Detect provider and configure headers accordingly
  const isOpenRouter = baseUrl.includes("openrouter.ai");

  try {
    // Create OpenAI client directly
    const openai = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: isOpenRouter
        ? {
            "HTTP-Referer": "https://chatflow.app",
            "X-Title": "ChatFlow",
          }
        : undefined,
    });

    const response = await openai.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    // Create a readable stream from the OpenAI stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              try {
                controller.enqueue(encoder.encode(content));
              } catch {
                 // Controller might be closed if client disconnected
                 break;
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      `Error: ${(error as Error).message}`,
      { status: 500 }
    );
  }
}
