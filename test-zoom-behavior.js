const puppeteer = require('puppeteer');

async function testZoomBehavior() {
  console.log('🔍 Testing Zoom Behavior...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  const results = {
    passed: [],
    failed: [],
  };

  const test = (name, condition, details = '') => {
    if (condition) {
      results.passed.push(name);
      console.log(`✅ ${name}`);
    } else {
      results.failed.push({ name, details });
      console.log(`❌ ${name}${details ? ': ' + details : ''}`);
    }
  };

  console.log('📱 Loading application...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Upload audio file
  console.log('\n📂 Uploading audio file...');
  const audioFile = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';
  const fileInput = await page.$('input[type="file"]');

  if (fileInput) {
    await fileInput.uploadFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Drag to timeline
  console.log('\n🎬 Adding to timeline...');
  const mediaItems = await page.$$('.cursor-move');
  const timeline = await page.$('[class*="overflow-x-auto"][class*="overflow-y-auto"]');

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

  // Click timeline item to load AudioEditor
  console.log('\n🎵 Loading AudioEditor...');
  const timelineItems = await page.$$('.cursor-move.transition-all');
  if (timelineItems.length > 0) {
    await timelineItems[0].click();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Test 1: Check initial waveform zoom value
  console.log('\n🔬 Testing waveform zoom...');
  const initialZoom = await page.evaluate(() => {
    const zoomDisplay = Array.from(document.querySelectorAll('span')).find(
      el => el.textContent && el.textContent.includes('px/s')
    );
    return zoomDisplay ? zoomDisplay.textContent.trim() : null;
  });
  test('Initial waveform zoom display exists', !!initialZoom, initialZoom || 'No zoom display found');

  // Test 2: Click zoom in button for waveform
  console.log('\n  Clicking waveform zoom in...');
  const waveformZoomInBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const zoomSection = Array.from(document.querySelectorAll('div')).find(
      el => el.textContent && el.textContent.includes('Waveform Zoom')
    );

    if (zoomSection) {
      const zoomButtons = Array.from(zoomSection.querySelectorAll('button'));
      // Second button should be zoom in (after zoom out)
      if (zoomButtons.length >= 2) {
        zoomButtons[1].click();
        return true;
      }
    }
    return false;
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check if zoom value changed
  const newZoom = await page.evaluate(() => {
    const zoomDisplay = Array.from(document.querySelectorAll('span')).find(
      el => el.textContent && el.textContent.includes('px/s')
    );
    return zoomDisplay ? zoomDisplay.textContent.trim() : null;
  });

  test('Waveform zoom changed after zoom in', newZoom !== initialZoom, `${initialZoom} → ${newZoom}`);

  // Test 3: Check for console errors after zoom
  console.log('\n  Checking for console errors after zoom...');
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', error => {
    if (!error.message?.includes('AbortError')) {
      consoleErrors.push(error.message);
    }
  });

  // Zoom out a few times
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const zoomSection = Array.from(document.querySelectorAll('div')).find(
        el => el.textContent && el.textContent.includes('Waveform Zoom')
      );

      if (zoomSection) {
        const zoomButtons = Array.from(zoomSection.querySelectorAll('button'));
        // First button should be zoom out
        if (zoomButtons.length >= 1) {
          zoomButtons[0].click();
        }
      }
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
  test('No console errors after multiple zooms', consoleErrors.length === 0,
    consoleErrors.length > 0 ? `Found ${consoleErrors.length} errors` : '');

  // Test 4: Test timeline zoom
  console.log('\n🔬 Testing timeline zoom...');

  // Find timeline zoom buttons
  const timelineZoomTest = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const zoomLabel = spans.find(el => el.textContent === 'Zoom:');

    if (zoomLabel) {
      // Find the zoom value display (should be nearby)
      const parent = zoomLabel.closest('div');
      if (parent) {
        const valueSpan = Array.from(parent.querySelectorAll('span')).find(
          el => el.textContent && el.textContent.includes('px/s') && el !== zoomLabel
        );
        return valueSpan ? valueSpan.textContent.trim() : null;
      }
    }
    return null;
  });

  test('Timeline zoom display exists', !!timelineZoomTest, timelineZoomTest || 'No timeline zoom found');

  // Click timeline zoom in
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const zoomLabel = spans.find(el => el.textContent === 'Zoom:');

    if (zoomLabel) {
      const parent = zoomLabel.closest('div');
      if (parent) {
        const buttons = Array.from(parent.querySelectorAll('button'));
        // Second button should be zoom in
        if (buttons.length >= 2) {
          buttons[1].click();
        }
      }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  const newTimelineZoom = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const zoomLabel = spans.find(el => el.textContent === 'Zoom:');

    if (zoomLabel) {
      const parent = zoomLabel.closest('div');
      if (parent) {
        const valueSpan = Array.from(parent.querySelectorAll('span')).find(
          el => el.textContent && el.textContent.includes('px/s') && el !== zoomLabel
        );
        return valueSpan ? valueSpan.textContent.trim() : null;
      }
    }
    return null;
  });

  test('Timeline zoom changed after zoom in', newTimelineZoom !== timelineZoomTest,
    `${timelineZoomTest} → ${newTimelineZoom}`);

  // Test 5: Test Cmd+Scroll zoom on waveform
  console.log('\n  Testing Cmd+Scroll zoom on waveform...');
  const waveformContainer = await page.$('div[style*="min-width"]');
  if (waveformContainer) {
    const box = await waveformContainer.boundingBox();
    if (box) {
      // Scroll with Cmd key (zoom in)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

      // Simulate Cmd+Scroll (Meta key on Mac, Ctrl on Windows)
      await page.keyboard.down('Meta');
      await page.mouse.wheel({ deltaY: -100 }); // Negative = zoom in
      await page.keyboard.up('Meta');

      await new Promise(resolve => setTimeout(resolve, 500));

      const scrollZoom = await page.evaluate(() => {
        const zoomDisplay = Array.from(document.querySelectorAll('span')).find(
          el => el.textContent && el.textContent.includes('px/s')
        );
        return zoomDisplay ? zoomDisplay.textContent.trim() : null;
      });

      test('Cmd+Scroll zoom works', scrollZoom !== newZoom, `Changed to ${scrollZoom}`);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 ZOOM TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n✅ Passed: ${results.passed.length}`);
  results.passed.forEach(name => console.log(`   - ${name}`));

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(({ name, details }) => {
      console.log(`   - ${name}${details ? ': ' + details : ''}`);
    });
  } else {
    console.log('\n🎉 ALL ZOOM TESTS PASSED!');
  }

  console.log(`\n📈 Success Rate: ${Math.round((results.passed.length / (results.passed.length + results.failed.length)) * 100)}%`);
  console.log('\n' + '='.repeat(70));
  console.log('\n⚠️  Press Ctrl+C to close browser.\n');

  await new Promise(() => {});
}

testZoomBehavior().catch(console.error);
