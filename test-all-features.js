const puppeteer = require('puppeteer');

async function testAllFeatures() {
  console.log('🧪 Testing All Audio Redaction Tool Features...\n');

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

  // ==========================================
  // Test 1: Upload Multiple Audio Files
  // ==========================================
  console.log('\n📂 Test 1: Upload Multiple Audio Files');
  const audioFile = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';
  const fileInput = await page.$('input[type="file"]');

  if (fileInput) {
    // Upload first file
    await fileInput.uploadFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Upload second file
    await fileInput.uploadFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const mediaItems = await page.$$('.cursor-move');
  test('Upload multiple audio files', mediaItems.length >= 2, `Found ${mediaItems.length} media items`);

  // ==========================================
  // Test 2: Add Files to Timeline
  // ==========================================
  console.log('\n🎬 Test 2: Add Files to Timeline');
  const timeline = await page.$('[class*="overflow-x-auto"][class*="overflow-y-auto"]');

  if (mediaItems.length >= 2 && timeline) {
    // Add first file
    const mediaBox1 = await mediaItems[0].boundingBox();
    const timelineBox = await timeline.boundingBox();

    if (mediaBox1 && timelineBox) {
      await page.mouse.move(mediaBox1.x + mediaBox1.width / 2, mediaBox1.y + mediaBox1.height / 2);
      await page.mouse.down();
      await page.mouse.move(timelineBox.x + 100, timelineBox.y + timelineBox.height / 2, { steps: 10 });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.mouse.up();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Add second file
    const mediaBox2 = await mediaItems[1].boundingBox();
    if (mediaBox2 && timelineBox) {
      await page.mouse.move(mediaBox2.x + mediaBox2.width / 2, mediaBox2.y + mediaBox2.height / 2);
      await page.mouse.down();
      await page.mouse.move(timelineBox.x + 500, timelineBox.y + timelineBox.height / 2, { steps: 10 });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.mouse.up();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const timelineItems = await page.$$('.cursor-move.transition-all');
  test('Add multiple files to timeline', timelineItems.length >= 2, `Found ${timelineItems.length} timeline items`);

  // ==========================================
  // Test 3: Play from Beginning Without Selection
  // ==========================================
  console.log('\n▶️  Test 3: Play from Beginning Without Selection');

  // Find play button in Timeline
  const playButtons = await page.$$('button');
  let timelinePlayBtn = null;

  for (const btn of playButtons) {
    const parentDiv = await btn.evaluateHandle(el => el.closest('.p-4.border-b'));
    if (parentDiv) {
      timelinePlayBtn = btn;
      break;
    }
  }

  if (timelinePlayBtn) {
    await timelinePlayBtn.click();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if something is selected now
    const selectedAfterPlay = await page.evaluate(() => {
      const selected = document.querySelector('.border-primary.bg-primary\\/10');
      return !!selected;
    });

    test('Play from beginning auto-selects first item', selectedAfterPlay, 'First item should be selected');

    // Stop playback
    await timelinePlayBtn.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // ==========================================
  // Test 4: Click Timeline Item to Load AudioEditor
  // ==========================================
  console.log('\n🎵 Test 4: Click Timeline Item to Load AudioEditor');
  if (timelineItems.length > 0) {
    await timelineItems[0].click();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  const audioEditorExists = await page.evaluate(() => {
    const waveform = document.querySelector('[class*="overflow-x-auto"][class*="overflow-y-hidden"]');
    return !!waveform;
  });
  test('AudioEditor loads when timeline item clicked', audioEditorExists);

  // ==========================================
  // Test 5: Create Muted Region
  // ==========================================
  console.log('\n🔇 Test 5: Create Muted Region');

  // Find waveform container
  const waveformContainer = await page.$('[class*="overflow-x-auto"][class*="overflow-y-hidden"]');

  if (waveformContainer) {
    const box = await waveformContainer.boundingBox();
    if (box) {
      // Draw selection
      await page.mouse.move(box.x + 100, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Click Mute Selection button
      const muteSelectionClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const muteBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Mute Selection'));
        if (muteBtn) {
          muteBtn.click();
          return true;
        }
        return false;
      });

      test('Mute Selection button clicked', muteSelectionClicked);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if muted region rendered
      const mutedRegionExists = await page.evaluate(() => {
        // Check for regions plugin overlays
        const regions = document.querySelectorAll('[data-id]');
        return regions.length > 0;
      });
      test('Muted region renders in waveform', mutedRegionExists);
    }
  }

  // ==========================================
  // Test 6: Click Redacted Region to Select
  // ==========================================
  console.log('\n👆 Test 6: Click Redacted Region to Select');

  if (waveformContainer) {
    const box = await waveformContainer.boundingBox();
    if (box) {
      // Click in the middle of the muted region
      await page.mouse.click(box.x + 200, box.y + box.height / 2);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if "Redacted:" label appears
      const redactedLabelExists = await page.evaluate(() => {
        const text = document.body.textContent;
        return text.includes('Redacted:') && text.includes('Use Tone') || text.includes('Use Silence');
      });
      test('Clicking redacted region shows edit controls', redactedLabelExists);
    }
  }

  // ==========================================
  // Test 7: Global Redaction Mode Toggle
  // ==========================================
  console.log('\n🔊 Test 7: Global Redaction Mode Toggle');

  const initialMode = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const modeBtn = buttons.find(btn =>
      btn.textContent && (btn.textContent.includes('Tone') || btn.textContent.includes('Silence'))
      && btn.closest('.p-4.border-b')
    );
    return modeBtn ? modeBtn.textContent.trim() : null;
  });

  test('Global redaction mode button exists', !!initialMode, initialMode || 'Not found');

  // Click toggle
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const modeBtn = buttons.find(btn =>
      btn.textContent && (btn.textContent.includes('Tone') || btn.textContent.includes('Silence'))
      && btn.closest('.p-4.border-b')
    );
    if (modeBtn) modeBtn.click();
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  const newMode = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const modeBtn = buttons.find(btn =>
      btn.textContent && (btn.textContent.includes('Tone') || btn.textContent.includes('Silence'))
      && btn.closest('.p-4.border-b')
    );
    return modeBtn ? modeBtn.textContent.trim() : null;
  });

  test('Global redaction mode toggles', initialMode !== newMode, `${initialMode} → ${newMode}`);

  // ==========================================
  // Test 8: Playhead Synchronization
  // ==========================================
  console.log('\n⏱️  Test 8: Playhead Synchronization');

  // Click second timeline item
  if (timelineItems.length >= 2) {
    await timelineItems[1].click();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start playback
    const playBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.querySelector('svg'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check playhead position
    const playheadPosition = await page.evaluate(() => {
      const playhead = document.querySelector('.bg-red-500.pointer-events-none');
      if (playhead) {
        return playhead.style.left;
      }
      return null;
    });

    test('Playhead displays on timeline', !!playheadPosition, playheadPosition || 'Not found');

    // Stop playback
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.querySelector('svg'));
      if (btn) btn.click();
    });
  }

  // ==========================================
  // Test 9: Zoom During Playback
  // ==========================================
  console.log('\n🔍 Test 9: Zoom During Playback');

  // Start playback again
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.querySelector('svg') && b.closest('.p-4.border-b'));
    if (btn) btn.click();
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Zoom in
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const zoomButtons = buttons.filter(btn => {
      const parent = btn.closest('div');
      return parent && parent.textContent && parent.textContent.includes('Zoom:');
    });
    if (zoomButtons.length >= 2) {
      zoomButtons[1].click(); // Zoom in button
    }
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check if playhead still updating
  const playheadStillMoving = await page.evaluate(() => {
    return new Promise(resolve => {
      const playhead = document.querySelector('.bg-red-500.pointer-events-none');
      if (!playhead) {
        resolve(false);
        return;
      }

      const initialLeft = playhead.style.left;
      setTimeout(() => {
        const newLeft = playhead.style.left;
        resolve(initialLeft !== newLeft);
      }, 500);
    });
  });

  test('Playhead continues moving after zoom', playheadStillMoving);

  // Stop playback
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.querySelector('svg') && b.closest('.p-4.border-b'));
    if (btn) btn.click();
  });

  // ==========================================
  // Test 10: Export Timeline
  // ==========================================
  console.log('\n💾 Test 10: Export Timeline');

  const exportBtnExists = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Export Timeline'));
    return !!exportBtn;
  });

  test('Export Timeline button exists', exportBtnExists);

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n✅ Passed: ${results.passed.length}`);
  results.passed.forEach(name => console.log(`   - ${name}`));

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(({ name, details }) => {
      console.log(`   - ${name}${details ? ': ' + details : ''}`);
    });
  } else {
    console.log('\n🎉 ALL TESTS PASSED!');
  }

  const successRate = Math.round((results.passed.length / (results.passed.length + results.failed.length)) * 100);
  console.log(`\n📈 Success Rate: ${successRate}%`);
  console.log('='.repeat(70));
  console.log('\n⚠️  Press Ctrl+C to close browser.\n');

  await new Promise(() => {});
}

testAllFeatures().catch(console.error);
