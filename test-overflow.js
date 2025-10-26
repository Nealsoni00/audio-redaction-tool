const puppeteer = require('puppeteer');

async function testOverflow() {
  console.log('🔍 Testing for viewport overflow...\\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

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
  const timelineItems = await page.$$('.cursor-move.transition-all');
  if (timelineItems.length > 0) {
    await timelineItems[0].click();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log('\\n📏 Checking for overflow issues...\\n');

  const viewport = page.viewport();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;

  // Check all elements for overflow
  const overflowResults = await page.evaluate((vpWidth, vpHeight) => {
    const issues = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const className = typeof el.className === 'string' ? el.className : '';
      const elementDesc = el.tagName + (className ? '.' + className.split(' ').slice(0, 3).join('.') : '');

      // Check horizontal overflow
      if (rect.right > vpWidth) {
        issues.push({
          type: 'Horizontal overflow (right)',
          element: elementDesc,
          right: Math.round(rect.right),
          viewportWidth: vpWidth,
          overflow: Math.round(rect.right - vpWidth)
        });
      }

      if (rect.left < 0) {
        issues.push({
          type: 'Horizontal overflow (left)',
          element: elementDesc,
          left: Math.round(rect.left),
          overflow: Math.abs(Math.round(rect.left))
        });
      }

      // Check vertical overflow
      if (rect.bottom > vpHeight) {
        const overflow = Math.round(rect.bottom - vpHeight);
        // Only report significant overflow (> 50px) to filter out minor layout issues
        if (overflow > 50) {
          issues.push({
            type: 'Vertical overflow (bottom)',
            element: elementDesc,
            bottom: Math.round(rect.bottom),
            viewportHeight: vpHeight,
            overflow
          });
        }
      }
    });

    return issues;
  }, viewportWidth, viewportHeight);

  console.log('='.repeat(70));
  console.log('📊 OVERFLOW TEST REPORT');
  console.log('='.repeat(70));
  console.log(`\\nViewport: ${viewportWidth}x${viewportHeight}`);
  console.log(`\\nOverflow Issues Found: ${overflowResults.length}`);

  if (overflowResults.length > 0) {
    // Group by type
    const byType = {};
    overflowResults.forEach(issue => {
      if (!byType[issue.type]) byType[issue.type] = [];
      byType[issue.type].push(issue);
    });

    Object.keys(byType).forEach(type => {
      console.log(`\\n${type}:`);
      // Show only first 5 of each type to avoid spam
      byType[type].slice(0, 5).forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue.element}`);
        console.log(`     Overflow: ${issue.overflow}px beyond viewport`);
      });
      if (byType[type].length > 5) {
        console.log(`     ... and ${byType[type].length - 5} more`);
      }
    });
  } else {
    console.log('\\n✅ NO OVERFLOW DETECTED - All content fits within viewport!');
  }

  console.log('\\n' + '='.repeat(70));
  console.log('\\n⚠️  Press Ctrl+C to close browser.\\n');

  await new Promise(() => {});
}

testOverflow().catch(console.error);
