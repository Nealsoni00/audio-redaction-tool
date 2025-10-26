const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function testWaveform() {
  console.log('🚀 Testing waveform display...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  console.log('📱 Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Upload audio file
  const audioFile1 = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';

  console.log('📁 Uploading audio file...');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(audioFile1);

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Drag to timeline
  const mediaItems = await page.$$('.cursor-move');
  const timeline = await page.$('.overflow-x-auto.overflow-y-auto.p-4.bg-muted\\/30');

  if (mediaItems.length > 0 && timeline) {
    const mediaBox = await mediaItems[0].boundingBox();
    const timelineBox = await timeline.boundingBox();

    if (mediaBox && timelineBox) {
      await page.mouse.move(mediaBox.x + mediaBox.width / 2, mediaBox.y + mediaBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(timelineBox.x + 200, timelineBox.y + timelineBox.height / 2, { steps: 10 });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.mouse.up();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Click timeline item to load waveform
  const timelineItems = await page.$$('.cursor-move.transition-all');
  if (timelineItems.length > 0) {
    await timelineItems[0].click();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.screenshot({ path: 'test-screenshots/waveform-default-zoom.png', fullPage: true });
    console.log('📸 Screenshot: waveform-default-zoom.png (50px/s default)');

    // Test different zoom levels
    const waveformZoomOut = await page.$$('button:has(svg.lucide-zoom-out)');
    if (waveformZoomOut.length > 1) {
      // Click the waveform zoom out button (second set of zoom controls)
      for (let i = 0; i < 3; i++) {
        await waveformZoomOut[1].click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await page.screenshot({ path: 'test-screenshots/waveform-zoomed-out.png', fullPage: true });
      console.log('📸 Screenshot: waveform-zoomed-out.png (20px/s zoomed out)');
    }

    const waveformZoomIn = await page.$$('button:has(svg.lucide-zoom-in)');
    if (waveformZoomIn.length > 1) {
      for (let i = 0; i < 8; i++) {
        await waveformZoomIn[1].click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await page.screenshot({ path: 'test-screenshots/waveform-zoomed-in.png', fullPage: true });
      console.log('📸 Screenshot: waveform-zoomed-in.png (100px/s zoomed in)');
    }
  }

  console.log('\n✅ Waveform test completed! Check screenshots.');
  console.log('\n⚠️  Press Ctrl+C to close the browser and exit.\n');

  await new Promise(() => {});
}

testWaveform().catch(console.error);
