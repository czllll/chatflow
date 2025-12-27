// Basic interface compatible with AI SDK messages
export interface CoreMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: string | Array<any>;
}

/**
 * Convert OpenAI/AI SDK messages to Gemini format.
 */
export function convertToGeminiMessages(messages: CoreMessage[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [];
  let systemInstruction: { role: string, parts: { text: string }[] } | undefined = undefined;

  for (const message of messages) {
    if (message.role === 'system') {
        const text = typeof message.content === 'string' ? message.content : '';
        // Gemini API expects a single system instruction object, we can concatenate if multiple
        if (systemInstruction) {
             systemInstruction.parts[0].text += '\n\n' + text;
        } else {
            systemInstruction = {
                role: 'user', // System instructions in REST API are passed separately, but internal object tracking
                parts: [{ text }]
            };
        }
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }]
      });
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }]
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Transform Gemini SSE stream to OpenAI Stream format.
 */
export async function* geminiToOpenAIStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      
      let dataStr = line;
      if (line.startsWith('data: ')) {
        dataStr = line.slice(6);
      }

      if (dataStr === '[DONE]') continue;

      try {
        const data = JSON.parse(dataStr);
        // data structure: { candidates: [ { content: { parts: [ { text: "..." } ] }, finishReason: "..." } ] }
        
        const candidate = data.candidates?.[0];
        if (!candidate) continue;

        const content = candidate.content?.parts?.[0]?.text || '';
        const finishReason = candidate.finishReason; // e.g., "STOP"

        if (content) {
            // Yield OpenAI chunk format
            yield {
                choices: [{
                    delta: { content },
                    finish_reason: null
                }]
            };
        }

        if (finishReason && finishReason !== 'STOP') {
             // Handle other finish reasons if needed
        }

      } catch {
        // Ignore parse errors for keep-alive or malformed lines
      }
    }
  }
}
