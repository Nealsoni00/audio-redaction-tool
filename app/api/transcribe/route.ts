import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
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

    console.log('Transcribing audio file:', audioFile.name, 'Size:', buffer.length);

    // Transcribe the audio
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: 'nova-2',
      smart_format: true,
      punctuate: true,
      paragraphs: false,
      utterances: false,
      diarize: false,
      language: 'en',
    });

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

    // Group words into segments based on 1-second gaps
    const segments: Array<{
      words: Array<{ word: string; start: number; end: number; confidence: number }>;
      start: number;
      end: number;
    }> = [];

    let currentSegment: typeof segments[0] | null = null;

    for (const word of words) {
      if (!word.word || word.start === undefined || word.end === undefined) continue;

      const wordData = {
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence || 0,
      };

      if (!currentSegment) {
        currentSegment = {
          words: [wordData],
          start: word.start,
          end: word.end,
        };
      } else {
        // Check if there's more than 1 second gap
        const gap = word.start - currentSegment.end;
        if (gap > 1.0) {
          segments.push(currentSegment);
          currentSegment = {
            words: [wordData],
            start: word.start,
            end: word.end,
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
