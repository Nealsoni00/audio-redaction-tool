const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function testApp() {
  console.log('🚀 Starting browser test...\n');

  // Launch browser with visible window
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Navigate to app
  console.log('📱 Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  console.log('✅ Page loaded successfully\n');

  // Take initial screenshot
  await page.screenshot({ path: 'test-screenshots/01-initial-load.png', fullPage: true });
  console.log('📸 Screenshot: 01-initial-load.png');

  // Wait a bit for IndexedDB to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check audio files exist
  const audioFile1 = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';
  const audioFile2 = '/Users/nesoni/dev/personal/audio-redaction-tool/+18479228298_audio-recording.wav';

  if (!fs.existsSync(audioFile1)) {
    console.error(`❌ Audio file not found: ${audioFile1}`);
    await browser.close();
    return;
  }

  if (!fs.existsSync(audioFile2)) {
    console.error(`❌ Audio file not found: ${audioFile2}`);
    await browser.close();
    return;
  }

  console.log('\n📁 Uploading audio files...');

  // Upload first audio file
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(audioFile1, audioFile2);

  // Wait for files to be processed
  console.log('⏳ Waiting for files to be processed...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await page.screenshot({ path: 'test-screenshots/02-files-uploaded.png', fullPage: true });
  console.log('📸 Screenshot: 02-files-uploaded.png');

  // Get media items from the library
  const mediaItems = await page.$$('.cursor-move');
  console.log(`✅ Found ${mediaItems.length} media items in library\n`);

  if (mediaItems.length > 0) {
    console.log('🎯 Testing drag and drop to timeline...');

    // Get the timeline element
    const timeline = await page.$('.overflow-x-auto.overflow-y-auto.p-4.bg-muted\\/30');

    if (timeline) {
      // Get bounding boxes
      const mediaBox = await mediaItems[0].boundingBox();
      const timelineBox = await timeline.boundingBox();

      if (mediaBox && timelineBox) {
        // Drag from media to timeline
        await page.mouse.move(mediaBox.x + mediaBox.width / 2, mediaBox.y + mediaBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(timelineBox.x + 200, timelineBox.y + timelineBox.height / 2, { steps: 10 });
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.mouse.up();

        console.log('✅ Dragged first file to timeline');
        await new Promise(resolve => setTimeout(resolve, 1000));

        await page.screenshot({ path: 'test-screenshots/03-first-file-on-timeline.png', fullPage: true });
        console.log('📸 Screenshot: 03-first-file-on-timeline.png');
      }
    }

    // Add second file
    if (mediaItems.length > 1) {
      const mediaBox2 = await mediaItems[1].boundingBox();
      const timelineBox = await timeline.boundingBox();

      if (mediaBox2 && timelineBox) {
        await page.mouse.move(mediaBox2.x + mediaBox2.width / 2, mediaBox2.y + mediaBox2.height / 2);
        await page.mouse.down();
        await page.mouse.move(timelineBox.x + 400, timelineBox.y + timelineBox.height / 2, { steps: 10 });
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.mouse.up();

        console.log('✅ Dragged second file to timeline');
        await new Promise(resolve => setTimeout(resolve, 1000));

        await page.screenshot({ path: 'test-screenshots/04-both-files-on-timeline.png', fullPage: true });
        console.log('📸 Screenshot: 04-both-files-on-timeline.png');
      }
    }

    // Click on first timeline item to select it
    console.log('\n🎯 Selecting timeline item...');
    const timelineItems = await page.$$('.cursor-move.transition-all');
    if (timelineItems.length > 0) {
      await timelineItems[0].click();
      await new Promise(resolve => setTimeout(resolve, 1000));

      await page.screenshot({ path: 'test-screenshots/05-timeline-item-selected.png', fullPage: true });
      console.log('📸 Screenshot: 05-timeline-item-selected.png');
      console.log('✅ Timeline item selected - AudioEditor should be visible');
    }

    // Test zoom controls
    console.log('\n🔍 Testing zoom controls...');
    const zoomOutButton = await page.$('button:has(svg.lucide-zoom-out)');
    if (zoomOutButton) {
      for (let i = 0; i < 3; i++) {
        await zoomOutButton.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      console.log('✅ Zoomed out 3 times');

      await page.screenshot({ path: 'test-screenshots/06-zoomed-out.png', fullPage: true });
      console.log('📸 Screenshot: 06-zoomed-out.png');
    }

    const zoomInButton = await page.$('button:has(svg.lucide-zoom-in)');
    if (zoomInButton) {
      for (let i = 0; i < 5; i++) {
        await zoomInButton.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      console.log('✅ Zoomed in 5 times');

      await page.screenshot({ path: 'test-screenshots/07-zoomed-in.png', fullPage: true });
      console.log('📸 Screenshot: 07-zoomed-in.png');
    }
  }

  console.log('\n✅ Test completed! Browser will remain open for manual inspection.');
  console.log('📁 Screenshots saved to test-screenshots/');
  console.log('\n⚠️  Press Ctrl+C to close the browser and exit.\n');

  // Keep browser open for manual inspection
  await new Promise(() => {});
}

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

testApp().catch(console.error);
