import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';

// Rate limiting: Track last request timestamp per IP
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 10000; // 10 seconds in milliseconds
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes
const MAX_DURATION = 30 * 60; // 30 minutes in seconds

// Cleanup old entries from rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  const expiredEntries: string[] = [];

  for (const [ip, timestamp] of rateLimitMap.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW * 6) { // Remove after 1 minute of inactivity
      expiredEntries.push(ip);
    }
  }

  expiredEntries.forEach(ip => rateLimitMap.delete(ip));

  if (expiredEntries.length > 0) {
    console.log(`Cleaned up ${expiredEntries.length} expired rate limit entries`);
  }
}, 5 * 60 * 1000);

// Helper function to get audio duration from buffer
async function getAudioDuration(buffer: Buffer, mimeType: string): Promise<number> {
  try {
    // For WAV files, parse header to get duration
    if (mimeType.includes('wav') || mimeType.includes('wave')) {
      // WAV format: bytes 24-27 = sample rate, bytes 40-43 = data chunk size
      const sampleRate = buffer.readUInt32LE(24);
      const numChannels = buffer.readUInt16LE(22);
      const bitsPerSample = buffer.readUInt16LE(34);

      // Find data chunk
      let dataSize = 0;
      let offset = 36;
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);

        if (chunkId === 'data') {
          dataSize = chunkSize;
          break;
        }
        offset += 8 + chunkSize;
      }

      if (dataSize > 0 && sampleRate > 0) {
        const bytesPerSample = (bitsPerSample / 8) * numChannels;
        const duration = dataSize / (sampleRate * bytesPerSample);
        return duration;
      }
    }

    // For other formats, we can't easily determine duration without decoding
    // Return 0 to skip duration check (will rely on file size limit)
    return 0;
  } catch (error) {
    console.error('Error parsing audio duration:', error);
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const now = Date.now();
    const lastRequestTime = rateLimitMap.get(clientIp);

    if (lastRequestTime && (now - lastRequestTime) < RATE_LIMIT_WINDOW) {
      const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequestTime)) / 1000);
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Please wait ${waitTime} seconds before submitting another transcription request.`,
          retryAfter: waitTime
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(waitTime)
          }
        }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/ogg',
      'audio/webm',
      'audio/flac'
    ];

    if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(wav|mp3|m4a|ogg|webm|flac)$/i)) {
      return NextResponse.json(
        {
          error: 'Invalid file type',
          message: 'Only audio files are supported (WAV, MP3, M4A, OGG, WebM, FLAC)',
          receivedType: audioFile.type
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (audioFile.size > MAX_FILE_SIZE) {
      const sizeMB = (audioFile.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error: 'File too large',
          message: `File size (${sizeMB}MB) exceeds maximum allowed size of 30MB`,
          maxSize: '30MB',
          receivedSize: `${sizeMB}MB`
        },
        { status: 413 }
      );
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    const deepgram = createClient(apiKey);

    // Convert File to ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check duration for WAV files
    const duration = await getAudioDuration(buffer, audioFile.type);
    if (duration > 0 && duration > MAX_DURATION) {
      const durationMinutes = (duration / 60).toFixed(1);
      return NextResponse.json(
        {
          error: 'Audio too long',
          message: `Audio duration (${durationMinutes} minutes) exceeds maximum allowed duration of 30 minutes`,
          maxDuration: '30 minutes',
          receivedDuration: `${durationMinutes} minutes`
        },
        { status: 413 }
      );
    }

    // Update rate limit timestamp (only after all validations pass)
    rateLimitMap.set(clientIp, now);

    console.log('Transcribing audio file:', audioFile.name, 'Size:', buffer.length);

    // Transcribe the audio
    let result, error;
    try {
      const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        paragraphs: false,
        utterances: false,
        diarize: true, // Enable speaker diarization
        language: 'en',
      });
      result = response.result;
      error = response.error;
    } catch (err) {
      console.error('Deepgram API call failed:', err);
      return NextResponse.json({
        error: 'Transcription API call failed',
        details: err instanceof Error ? err.message : String(err),
        hint: 'Check if DEEPGRAM_API_KEY is set correctly in production environment'
      }, { status: 500 });
    }

    if (error) {
      console.error('Deepgram error:', error);
      return NextResponse.json({
        error: 'Transcription failed',
        details: error.message || String(error)
      }, { status: 500 });
    }

    if (!result) {
      console.error('No result from Deepgram');
      return NextResponse.json({ error: 'No transcription result' }, { status: 500 });
    }

    // Process the transcript into our format
    const words = result.results?.channels[0]?.alternatives[0]?.words || [];

    // Group words into segments based on speaker changes or 1-second gaps
    const segments: Array<{
      words: Array<{ word: string; start: number; end: number; confidence: number; speaker?: number }>;
      start: number;
      end: number;
      speaker?: number;
    }> = [];

    let currentSegment: typeof segments[0] | null = null;

    for (const word of words) {
      if (!word.word || word.start === undefined || word.end === undefined) continue;

      const wordData = {
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence || 0,
        speaker: word.speaker,
      };

      if (!currentSegment) {
        currentSegment = {
          words: [wordData],
          start: word.start,
          end: word.end,
          speaker: word.speaker,
        };
      } else {
        // Check if there's a speaker change OR more than 1 second gap
        const gap = word.start - currentSegment.end;
        const speakerChanged = word.speaker !== undefined &&
                               currentSegment.speaker !== undefined &&
                               word.speaker !== currentSegment.speaker;

        if (speakerChanged || gap > 1.0) {
          segments.push(currentSegment);
          currentSegment = {
            words: [wordData],
            start: word.start,
            end: word.end,
            speaker: word.speaker,
          };
        } else {
          currentSegment.words.push(wordData);
          currentSegment.end = word.end;
        }
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    const transcript = {
      segments,
      fullText: result.results?.channels[0]?.alternatives[0]?.transcript || '',
    };

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('Transcription error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
