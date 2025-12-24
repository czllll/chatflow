import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

interface StorageCredentials {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Initialize S3 client for R2 - supports both env vars and request credentials
const getS3Client = (creds?: StorageCredentials) => {
  // Prefer request credentials, fall back to env vars
  const endpoint = creds?.endpoint || process.env.R2_ENDPOINT;
  const accessKeyId = creds?.accessKeyId || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = creds?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

const SESSIONS_KEY = "sessions.json";

// GET: Fetch sessions from R2
export async function GET(request: NextRequest) {
  // Get credentials from query params (base64 encoded)
  const credsParam = request.nextUrl.searchParams.get("creds");
  let creds: StorageCredentials | undefined;
  
  if (credsParam) {
    try {
      creds = JSON.parse(Buffer.from(credsParam, "base64").toString("utf-8"));
    } catch {
      // Ignore parse errors, will fall back to env vars
    }
  }

  const client = getS3Client(creds);
  const bucket = creds?.bucket || process.env.R2_BUCKET || "chatflow-sessions";

  if (!client) {
    return NextResponse.json(
      { error: "R2 storage not configured. Set credentials in Settings > Storage or use environment variables." },
      { status: 503 }
    );
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: SESSIONS_KEY,
    });

    const response = await client.send(command);
    const bodyString = await response.Body?.transformToString();

    if (!bodyString) {
      return NextResponse.json({ sessions: [] });
    }

    const data = JSON.parse(bodyString);
    return NextResponse.json(data);
  } catch (error: unknown) {
    // If file doesn't exist, return empty
    if ((error as { name?: string }).name === "NoSuchKey") {
      return NextResponse.json({ sessions: [] });
    }
    console.error("R2 GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// POST: Upload sessions to R2
export async function POST(request: Request) {
  const body = await request.json();
  const { sessions, storageConfig } = body;

  const client = getS3Client(storageConfig);
  const bucket = storageConfig?.bucket || process.env.R2_BUCKET || "chatflow-sessions";

  if (!client) {
    return NextResponse.json(
      { error: "R2 storage not configured. Set credentials in Settings > Storage or use environment variables." },
      { status: 503 }
    );
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: SESSIONS_KEY,
      Body: JSON.stringify({ sessions }),
      ContentType: "application/json",
    });

    await client.send(command);

    return NextResponse.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error("R2 POST error:", error);
    return NextResponse.json(
      { error: "Failed to upload sessions" },
      { status: 500 }
    );
  }
}
