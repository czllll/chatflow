import OpenAI from "openai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get API configuration from headers (BYOK pattern)
  const apiKey = req.headers.get("x-api-key");
  const baseUrl = req.headers.get("x-base-url") || "https://api.openai.com/v1";
  const model = req.headers.get("x-model") || "gpt-4o";

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
              controller.enqueue(encoder.encode(content));
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
