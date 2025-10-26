# Audio Redaction Tool

A comprehensive browser-based audio redaction and stitching tool built for public safety agencies. All audio processing happens in the browser using the Web Audio API - no data is uploaded to the cloud during processing.

## Features

- **Media Library**: Drag and drop audio files into your workspace
- **Timeline Editor**: Arrange multiple audio files on a visual timeline
- **Waveform Visualization**: See your audio represented visually with WaveSurfer.js
- **Audio Editing**:
  - Add breakpoints to split audio into clips
  - Delete unwanted sections
  - Mute/unmute audio clips
- **Transcript Integration**:
  - Transcribe audio using Deepgram API
  - View timestamped transcripts with 1-second gap segmentation
  - Hover over words to mute/unmute specific sections
  - Word-level redaction controls
- **State Persistence**: All changes are saved in the browser using IndexedDB
- **Playback Controls**:
  - Play/pause with spacebar
  - Synchronized playback between timeline and detail editor
  - Visual progress tracking

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Deepgram API key (for transcription features)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Deepgram API Key**:
   - Copy `.env.local.example` to `.env.local`
   - Add your Deepgram API key:
     ```
     DEEPGRAM_API_KEY=your_actual_api_key_here
     ```

3. **Get a Deepgram API Key** (if you don't have one):
   - Go to [https://console.deepgram.com/signup](https://console.deepgram.com/signup)
   - Sign up for a free account (includes $200 in free credits)
   - Navigate to "API Keys" in the console
   - Create a new API key and copy it to your `.env.local` file

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

Create a production build:

```bash
npm run build
npm start
```

## Deployment to Vercel

This application is configured for seamless deployment to Vercel with automatic deployments from your GitHub repository.

### Initial Setup

1. **Create a GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/audio-redaction-tool.git
   git push -u origin main
   ```

2. **Deploy to Vercel**:
   - Go to [https://vercel.com](https://vercel.com)
   - Sign in with your GitHub account
   - Click "New Project"
   - Import your `audio-redaction-tool` repository
   - Add your environment variable:
     - Name: `DEEPGRAM_API_KEY`
     - Value: Your Deepgram API key
   - Click "Deploy"

### Automatic Deployments

Once set up, Vercel will automatically deploy your application whenever you push to the `main` branch:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Your changes will be live in minutes!

## Usage Guide

### 1. Add Media Files

- **Drag and drop** audio files into the left Media Library pane
- Or click the "Add Media" button to browse for files
- Supported formats: Any format supported by your browser (MP3, WAV, M4A, etc.)

### 2. Add Media to Timeline

- **Drag and drop** a media file from the library onto the timeline
- Or **right-click** on a media file and select "Add to Timeline"

### 3. Edit Audio

- **Click** on a media item in the timeline to open the editor
- Use the **waveform** to visualize your audio
- Press **Space** to play/pause
- Click **"Add Breakpoint"** to split audio at the current playhead position
- Click **"Delete Clip"** to remove the current clip under the playhead

### 4. Transcribe Audio

- With a media item selected, click **"Transcribe Audio"** in the transcript section
- Wait for the transcription to complete (this sends the audio to Deepgram)
- The transcript will appear below the waveform, segmented by 1-second gaps

### 5. Word-Level Redaction

- **Hover** over any word in the transcript to see redaction controls
- **Click** on a word to mute/unmute that specific section of audio
- Muted words will appear with a strikethrough and red background
- Changes are immediately reflected in the audio playback

### 6. Timeline Playback

- Use the playback controls at the top of the timeline
- All edits made in the detail editor are reflected in the timeline
- Press **Space** anywhere to play/pause

### 7. State Persistence

- All your work is automatically saved to the browser
- Refresh the page and your media library, timeline, and edits will be restored
- No manual save required!

## Technical Architecture

### Frontend
- **Next.js 16** with App Router
- **React 19** with TypeScript
- **Tailwind CSS** + **shadcn/ui** for styling
- **WaveSurfer.js** for waveform visualization
- **Zustand** for state management
- **Dexie.js** for IndexedDB persistence

### Backend
- **Next.js API Routes** for the Deepgram transcription endpoint
- **Deepgram SDK** for audio transcription

### Browser APIs
- **Web Audio API** for all audio processing
- **IndexedDB** for persistent storage
- **File API** for handling drag and drop

## File Structure

```
audio-redaction-tool/
├── app/
│   ├── api/
│   │   └── transcribe/
│   │       └── route.ts          # Deepgram transcription endpoint
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main application page
│   └── globals.css               # Global styles
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── MediaLibrary.tsx          # Left pane - media library
│   ├── Timeline.tsx              # Middle pane - timeline view
│   ├── AudioEditor.tsx           # Bottom pane - audio editor
│   └── TranscriptView.tsx        # Transcript with word-level controls
├── lib/
│   ├── types.ts                  # TypeScript type definitions
│   ├── db.ts                     # Dexie database setup
│   ├── store.ts                  # Zustand store
│   └── utils.ts                  # Utility functions
├── .env.local                    # Environment variables (not in git)
├── .env.local.example            # Environment template
└── package.json
```

## Privacy & Security

- **All audio processing happens in the browser** - your media files never leave the user's computer
- **Transcription** is the only operation that sends data to a server (Deepgram)
- Transcripts are **not stored on the server** - they're immediately returned to the browser and stored locally
- All edits and state are stored in **IndexedDB in the user's browser**
- No analytics or tracking

## Browser Compatibility

This application requires a modern browser with support for:
- Web Audio API
- IndexedDB
- ES6+ JavaScript features

Recommended browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.
