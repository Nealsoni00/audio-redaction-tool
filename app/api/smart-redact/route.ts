import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

interface TranscriptSegment {
  words: TranscriptWord[];
  start: number;
  end: number;
  speaker?: number;
}

interface RedactionMatch {
  text: string;
  category: string;
  startIndex: number; // Word index in the flat word array
  endIndex: number;   // Word index in the flat word array
  start: number;      // Time in seconds
  end: number;        // Time in seconds
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { segments, selectedSubcategories } = body as {
      segments: TranscriptSegment[];
      selectedSubcategories: string[];
    };

    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { error: 'Invalid segments data' },
        { status: 400 }
      );
    }

    if (!selectedSubcategories || selectedSubcategories.length === 0) {
      return NextResponse.json(
        { error: 'No redaction categories selected' },
        { status: 400 }
      );
    }

    // Flatten all words from segments into a single array with indices
    const allWords: (TranscriptWord & { globalIndex: number })[] = [];
    let globalIndex = 0;

    for (const segment of segments) {
      for (const word of segment.words) {
        allWords.push({ ...word, globalIndex });
        globalIndex++;
      }
    }

    // Create the full transcript text with word markers for better matching
    const fullText = allWords.map(w => w.word).join(' ');

    // Also create a word map for easier lookup
    const wordMap = allWords.map((w, idx) => ({
      word: w.word.toLowerCase(),
      index: idx,
      start: w.start,
      end: w.end,
    }));

    // Create category descriptions for the prompt
    const categoryDescriptions = selectedSubcategories.map(id => {
      const categoryMap: Record<string, string> = {
        'full-names': 'full names (first and last name together)',
        'first-names': 'first names only',
        'last-names': 'last names only',
        'phone-numbers': 'phone numbers in any format',
        'email-addresses': 'email addresses',
        'physical-addresses': 'complete physical addresses',
        'street-names': 'street names and numbers',
        'city-names': 'city names',
        'state-names': 'state names',
        'zip-codes': 'zip codes and postal codes',
        'landmarks': 'landmarks and notable locations',
        'license-plates': 'license plate numbers',
        'vehicle-make-model': 'vehicle make and model',
        'vin-numbers': 'vehicle identification numbers (VIN)',
        'vehicle-colors': 'vehicle color descriptions',
        'ssn': 'social security numbers',
        'drivers-license': 'driver\'s license numbers',
        'passport-numbers': 'passport numbers',
        'credit-cards': 'credit card numbers',
        'bank-accounts': 'bank account numbers',
        'birth-dates': 'birth dates',
        'specific-dates': 'specific dates',
        'exact-times': 'exact times',
        'company-names': 'company names',
        'organization-names': 'organization names',
      };
      return categoryMap[id] || id;
    });

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are a PII detection assistant for public safety agencies. Your task is to identify sensitive information in audio transcripts that should be redacted.

Analyze the provided transcript and identify ALL instances of the following types of information:
${categoryDescriptions.map((desc, i) => `${i + 1}. ${desc}`).join('\n')}

IMPORTANT INSTRUCTIONS:
1. Return ONLY exact text as it appears in the transcript (case-sensitive)
2. Each match should be the minimal phrase containing the PII (e.g., "John Smith" not "I think John Smith said")
3. Be thorough but precise - only match clear instances
4. For multi-word phrases, include all words that are part of the PII
5. Return a JSON array with this exact structure:

{
  "matches": [
    {
      "text": "exact phrase from transcript",
      "category": "category-id"
    }
  ]
}

Return ONLY valid JSON. The text field must match exactly as it appears in the transcript.`;

    const userPrompt = `Transcript to analyze:
"${fullText}"

Selected categories to detect:
${selectedSubcategories.join(', ')}

Return the JSON array of matches:`;

    console.log('Calling OpenAI for smart redaction...');
    console.log('Categories:', selectedSubcategories);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json(
        { error: 'No response from OpenAI' },
        { status: 500 }
      );
    }

    console.log('OpenAI response:', responseText);

    // Helper function to normalize text for matching (remove punctuation, lowercase)
    const normalizeWord = (word: string): string => {
      return word.toLowerCase().replace(/[^\w\s]/g, '');
    };

    // Helper function to find ALL occurrences of text in the word array
    const findAllTextInWords = (searchText: string): Array<{ startIndex: number; endIndex: number; start: number; end: number }> => {
      const results: Array<{ startIndex: number; endIndex: number; start: number; end: number }> = [];

      // Normalize and split the search text
      const searchWords = searchText
        .split(/\s+/)
        .map(w => normalizeWord(w))
        .filter(w => w.length > 0);

      if (searchWords.length === 0) return results;

      // Search through the word array to find ALL sequences
      for (let i = 0; i <= wordMap.length - searchWords.length; i++) {
        let match = true;

        // Check if the sequence matches starting at position i
        for (let j = 0; j < searchWords.length; j++) {
          const wordToMatch = normalizeWord(wordMap[i + j].word);
          const searchWord = searchWords[j];

          if (wordToMatch !== searchWord) {
            match = false;
            break;
          }
        }

        if (match) {
          // Found a sequence
          const startIndex = i;
          const endIndex = i + searchWords.length - 1;

          results.push({
            startIndex,
            endIndex,
            start: wordMap[startIndex].start,
            end: wordMap[endIndex].end,
          });
        }
      }

      // If no matches found, log it
      if (results.length === 0) {
        console.log(`Could not find any matches for: "${searchText}"`);
        console.log(`Searched for words:`, searchWords);
      } else {
        console.log(`Found ${results.length} occurrence(s) of: "${searchText}"`);
      }

      return results;
    };

    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);

      // Handle different response formats
      let matches = [];
      if (Array.isArray(parsedResponse)) {
        matches = parsedResponse;
      } else if (parsedResponse.matches && Array.isArray(parsedResponse.matches)) {
        matches = parsedResponse.matches;
      } else if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
        matches = parsedResponse.results;
      } else {
        // Try to find any array in the response
        for (const value of Object.values(parsedResponse)) {
          if (Array.isArray(value)) {
            matches = value;
            break;
          }
        }
      }

      // Convert matches to our format with time ranges by finding ALL occurrences in the actual transcript
      const redactionMatches: RedactionMatch[] = [];

      for (const match of matches) {
        const matchText = match.text || '';
        const positions = findAllTextInWords(matchText);

        if (positions.length > 0) {
          // Create a separate detection entry for each occurrence
          for (const position of positions) {
            redactionMatches.push({
              text: matchText,
              category: match.category,
              startIndex: position.startIndex,
              endIndex: position.endIndex,
              start: position.start,
              end: position.end,
            });
          }
        } else {
          console.log(`Skipping match that couldn't be located: "${matchText}"`);
        }
      }

      console.log(`Successfully matched ${redactionMatches.length} total occurrences from ${matches.length} unique detections`);

      return NextResponse.json({
        matches: redactionMatches,
        totalMatches: redactionMatches.length,
      });
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Raw response:', responseText);
      return NextResponse.json(
        {
          error: 'Failed to parse OpenAI response',
          details: parseError instanceof Error ? parseError.message : String(parseError)
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Smart redaction error:', error);
    return NextResponse.json(
      {
        error: 'Smart redaction failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
