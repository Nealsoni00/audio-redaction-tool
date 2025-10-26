const puppeteer = require('puppeteer');

async function checkConsoleErrors() {
  console.log('🔍 Checking for console errors...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  const errors = [];
  const warnings = [];

  // Listen to console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();

    if (type === 'error') {
      errors.push(text);
      console.log('❌ ERROR:', text);
    } else if (type === 'warning') {
      warnings.push(text);
      console.log('⚠️  WARNING:', text);
    }
  });

  // Listen to page errors
  page.on('pageerror', error => {
    // Ignore AbortError from WaveSurfer - it's expected during cleanup
    if (error.message?.includes('AbortError')) {
      return;
    }
    errors.push(error.message);
    console.log('❌ PAGE ERROR:', error.message);
  });

  console.log('📱 Loading application...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Upload files
  const audioFile = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

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

  // Click timeline item
  const timelineItems = await page.$$('.cursor-move.transition-all');
  if (timelineItems.length > 0) {
    await timelineItems[0].click();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Wait a bit more for any delayed errors
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n' + '='.repeat(60));
  console.log('📊 CONSOLE ERROR REPORT');
  console.log('='.repeat(60));
  console.log(`\n❌ Errors: ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach((err, i) => {
      console.log(`\n${i + 1}. ${err}`);
    });
  }

  console.log(`\n⚠️  Warnings: ${warnings.length}`);
  if (warnings.length > 0) {
    warnings.forEach((warn, i) => {
      console.log(`\n${i + 1}. ${warn}`);
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ NO CONSOLE ERRORS OR WARNINGS!');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n⚠️  Press Ctrl+C to close browser.\n');

  await new Promise(() => {});
}

checkConsoleErrors().catch(console.error);
