// Antigravity Adapter
// Based on Antigravity-Manager's transform_claude_request_in implementation
// Uses Gemini-style 'contents' format for ALL models

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * Detect if model is Claude-based
 */
export function isClaudeModel(model: string): boolean {
  return model.toLowerCase().includes('claude');
}

interface AntigravityPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface AntigravityContent {
  role: string;
  parts: AntigravityPart[];
}

/**
 * Convert messages to Antigravity/Gemini contents format
 * Based on Antigravity-Manager's build_contents function
 */
export function convertToAntigravityContents(messages: Message[]) {
  const contents: AntigravityContent[] = [];
  let systemText: string = '';

  for (const message of messages) {
    if (message.role === 'system') {
      // Collect system messages
      const text = typeof message.content === 'string' ? message.content : '';
      systemText = systemText ? systemText + '\n\n' + text : text;
    } else if (message.role === 'user') {
      if (typeof message.content === 'string') {
        const text = message.content;
        if (text && text !== '(no content)' && text.trim()) {
          contents.push({
            role: 'user',
            parts: [{ text: text.trim() }]
          });
        }
      } else if (Array.isArray(message.content)) {
        const parts: AntigravityPart[] = [];
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            // Handle data:image/jpeg;base64,... format
            if (part.image_url.url.startsWith('data:')) {
              const [mimePart, base64Data] = part.image_url.url.split(';base64,');
              const mimeType = mimePart.split(':')[1];
              if (mimeType && base64Data) {
                parts.push({
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                });
              }
            }
          }
        }
        if (parts.length > 0) {
          contents.push({
            role: 'user',
            parts: parts
          });
        }
      }
    } else if (message.role === 'assistant') {
      const text = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content); // Assistant messages are usually text
      
      // Antigravity uses 'model' role for assistant messages (Gemini style)
      if (text && text !== '(no content)' && text.trim()) {
        contents.push({
          role: 'model',
          parts: [{ text: text.trim() }]
        });
      }
    }
  }

  // Antigravity systemInstruction format: { role: 'user', parts: [...] }
  const systemInstruction = systemText.trim()
    ? { role: 'user', parts: [{ text: systemText.trim() }] }
    : undefined;

  return { contents, systemInstruction };
}

interface AntigravityInnerRequest {
  contents: AntigravityContent[];
  safetySettings: Array<{ category: string; threshold: string }>;
  generationConfig: {
    maxOutputTokens: number;
    temperature?: number;
  };
  systemInstruction?: { role: string; parts: { text: string }[] };
}

/**
 * Build Antigravity request body
 * Matches exactly the format from Antigravity-Manager's transform_claude_request_in
 */
export function buildAntigravityRequest(
  messages: Message[],
  model: string,
  options: {
    projectId: string;
    sessionId: string;
    requestId: string;
    temperature?: number;
    maxTokens?: number;
  }
) {
  const { contents, systemInstruction } = convertToAntigravityContents(messages);

  // Build inner request (matches Antigravity-Manager's inner_request structure)
  const innerRequest: AntigravityInnerRequest = {
    contents,
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" },
    ],
    generationConfig: {
      maxOutputTokens: options.maxTokens || 64000,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    }
  };

  if (systemInstruction) {
    innerRequest.systemInstruction = systemInstruction;
  }

  // Build final envelope (matches Antigravity-Manager's body structure)
  return {
    project: options.projectId,
    requestId: options.requestId,
    request: innerRequest,
    model: model,
    userAgent: 'antigravity/1.11.9 windows/amd64',
    requestType: 'GENERATE_CONTENT',
  };
}

/**
 * Transform Antigravity SSE stream to OpenAI-compatible format
 * Response format is Gemini-style for all models
 */
export async function* antigravityToOpenAIStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      
      let dataStr = line;
      if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      }

      if (dataStr === '[DONE]') continue;

      try {
        const data = JSON.parse(dataStr);
        
        // v1internal wraps response in 'response' field
        const responseData = data.response || data;
        
        // Antigravity always returns Gemini-style response format
        // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
        const candidate = responseData.candidates?.[0];
        if (!candidate) continue;

        const parts = candidate.content?.parts || [];
        let content = '';
        
        for (const part of parts) {
          // Skip thinking parts (thought: true)
          if (part.thought) continue;
          if (typeof part.text === 'string') {
            content += part.text;
          }
        }

        if (content) {
          yield {
            choices: [{
              delta: { content },
              finish_reason: null
            }]
          };
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
}
