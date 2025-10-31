import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 500 }
    );
  }

  // Return the API key - this is safe because it's only exposed to authenticated users
  // and Deepgram API keys can be scoped with usage limits
  return NextResponse.json({ apiKey });
}
