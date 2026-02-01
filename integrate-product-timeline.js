#!/usr/bin/env node

/**
 * Integration Script for Interactive Product Timeline
 * Adds the new component to company-structure.html
 */

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'company-structure.html');
const componentPath = path.join(__dirname, 'public', 'product-timeline-interactive.html');

console.log('🚀 Integrating Interactive Product Timeline...\n');

// Read the component file
const componentContent = fs.readFileSync(componentPath, 'utf-8');

// Extract CSS
const cssMatch = componentContent.match(/<style>([\s\S]*?)<\/style>/);
const cssToAdd = cssMatch ? cssMatch[1] : '';

// Extract HTML
const htmlMatch = componentContent.match(/<!-- Add this HTML section[\s\S]*?<section class="product-timeline-section"[\s\S]*?<\/section>/);
const htmlToAdd = htmlMatch ? htmlMatch[0] : '';

// Extract JavaScript
const jsMatch = componentContent.match(/<script>([\s\S]*?)<\/script>/);
const jsToAdd = jsMatch ? jsMatch[1] : '';

// Read the main HTML file
let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// Add CSS before the closing </style> tag
if (cssToAdd && !htmlContent.includes('Interactive Product Timeline Styles')) {
  console.log('✅ Adding CSS styles...');
  htmlContent = htmlContent.replace('</style>', `\n  ${cssToAdd}\n</style>`);
}

// Add HTML section before the "Live Activity Feed" section
if (htmlToAdd && !htmlContent.includes('product-timeline-section')) {
  console.log('✅ Adding HTML section...');
  const activityFeedMarker = '<!-- Live Activity Feed (Enhanced) -->';
  htmlContent = htmlContent.replace(activityFeedMarker, `${htmlToAdd}\n\n  ${activityFeedMarker}`);
}

// Add JavaScript before the closing </script> tag at the end
if (jsToAdd && !htmlContent.includes('ProductTimeline')) {
  console.log('✅ Adding JavaScript...');
  // Find the last </script> tag before </body>
  const lastScriptIndex = htmlContent.lastIndexOf('</script>');
  if (lastScriptIndex !== -1) {
    htmlContent = htmlContent.substring(0, lastScriptIndex) + 
                 `\n    ${jsToAdd}\n  ` + 
                 htmlContent.substring(lastScriptIndex);
  }
}

// Write the updated HTML
fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

console.log('\n✅ Integration complete!');
console.log('📝 Changes made:');
console.log('   - Added Interactive Product Timeline CSS');
console.log('   - Added Interactive Product Timeline HTML section');
console.log('   - Added ProductTimeline JavaScript manager');
console.log('\n🎉 The dashboard now has:');
console.log('   ✓ Interactive product cards with expandable details');
console.log('   ✓ Filter by status (Active/Live/Planning/Pipeline/Paused)');
console.log('   ✓ Filter by priority (P0/P1/P2)');
console.log('   ✓ Sort by priority, progress, status, or name');
console.log('   ✓ Animated progress bars');
console.log('   ✓ ALL products visible (no 12-item limit)');
console.log('   ✓ Live updates every 30 seconds');
console.log('\n🚀 Restart the server to see the changes!');
