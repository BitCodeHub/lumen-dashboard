const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const htmlPath = path.join(__dirname, 'lumen-factory-report.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: path.join(__dirname, 'lumen-factory-report.pdf'),
    format: 'A4',
    margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
    printBackground: true
  });
  
  await browser.close();
  console.log('PDF generated successfully!');
}

generatePDF().catch(console.error);
