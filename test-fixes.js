const puppeteer = require('puppeteer');

async function testFixes() {
  console.log('🧪 Testing Auto-Select and Snap-to-Zero Fixes...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  console.log('📱 Loading application...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 1: Upload and verify auto-select
  console.log('\n📂 Test 1: Upload file and verify auto-select');
  const audioFile = '/Users/nesoni/dev/personal/audio-redaction-tool/+15202476667_audio-recording.wav';
  const fileInput = await page.$('input[type="file"]');

  if (fileInput) {
    await fileInput.uploadFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Test 2: Drag to timeline and check if it snaps to 0:00
  console.log('\n🎬 Test 2: Drag to timeline and verify snap to 0:00');
  const mediaItems = await page.$$('.cursor-move');
  const timeline = await page.$('[class*="overflow-x-auto"][class*="overflow-y-auto"]');

  let snappedToZero = false;
  if (mediaItems.length > 0 && timeline) {
    const mediaBox = await mediaItems[0].boundingBox();
    const timelineBox = await timeline.boundingBox();

    if (mediaBox && timelineBox) {
      // Drag to middle of timeline (should snap to 0:00)
      await page.mouse.move(mediaBox.x + mediaBox.width / 2, mediaBox.y + mediaBox.height / 2);
      await page.mouse.down();

      // Try to drag to the middle (should be forced to 0:00)
      await page.mouse.move(timelineBox.x + timelineBox.width / 2, timelineBox.y + timelineBox.height / 2, { steps: 10 });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if preview shows at 0:00
      const previewPosition = await page.evaluate(() => {
        const preview = document.querySelector('[style*="left"]');
        return preview ? preview.style.left : null;
      });

      console.log(`   Drag preview position: ${previewPosition}`);

      await page.mouse.up();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check actual position of timeline item
      const itemPosition = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.cursor-move.transition-all'));
        if (items.length > 0) {
          const style = window.getComputedStyle(items[0]);
          return style.left;
        }
        return null;
      });

      console.log(`   Actual timeline item position: ${itemPosition}`);
      snappedToZero = itemPosition === '0px';
    }
  }

  console.log(`   ${snappedToZero ? '✅' : '❌'} Snap to 0:00: ${snappedToZero ? 'PASS' : 'FAIL'}`);

  // Test 3: Check if item was auto-selected
  console.log('\n🎯 Test 3: Verify item auto-selected');
  const isSelected = await page.evaluate(() => {
    const selected = document.querySelector('.border-primary.bg-primary\\/10');
    return !!selected;
  });
  console.log(`   ${isSelected ? '✅' : '❌'} Auto-select: ${isSelected ? 'PASS' : 'FAIL'}`);

  // Test 4: Check if AudioEditor loaded
  console.log('\n🎵 Test 4: Verify AudioEditor loaded');
  const editorLoaded = await page.evaluate(() => {
    const waveform = document.querySelector('[class*="overflow-x-auto"][class*="overflow-y-hidden"]');
    return !!waveform;
  });
  console.log(`   ${editorLoaded ? '✅' : '❌'} AudioEditor loaded: ${editorLoaded ? 'PASS' : 'FAIL'}`);

  // Test 5: Clear selection and test play button
  console.log('\n▶️  Test 5: Clear selection, press play, verify auto-select');

  // Click empty area to deselect
  const emptyArea = await page.$('.text-muted-foreground');
  if (emptyArea) {
    await emptyArea.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Check if still selected (should be due to auto-select useEffect)
  const stillSelected = await page.evaluate(() => {
    const selected = document.querySelector('.border-primary.bg-primary\\/10');
    return !!selected;
  });
  console.log(`   Selection after clicking away: ${stillSelected ? 'Still selected (expected)' : 'Deselected'}`);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Snap to 0:00: ${snappedToZero ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Auto-select: ${isSelected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`AudioEditor loaded: ${editorLoaded ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(70));
  console.log('\n⚠️  Press Ctrl+C to close browser.\n');

  await new Promise(() => {});
}

testFixes().catch(console.error);
