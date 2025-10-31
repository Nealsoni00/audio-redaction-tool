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

  try {
    // Generate a temporary JWT token with 10-minute TTL
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl_seconds: 600, // 10 minutes - enough time for large file upload
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to generate Deepgram token:', data);
      return NextResponse.json(
        { error: 'Failed to generate authentication token' },
        { status: 500 }
      );
    }

    // Return only the temporary token, never the actual API key
    return NextResponse.json({
      token: data.access_token,
      expiresIn: data.expires_in
    });
  } catch (error) {
    console.error('Error generating Deepgram token:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication token' },
      { status: 500 }
    );
  }
}
