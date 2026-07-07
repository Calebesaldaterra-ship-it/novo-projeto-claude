const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = path.join(__dirname, 'instagram');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const htmlPath = 'file:///' + path.join(__dirname, 'carrossel.html').replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle' });

  const slides = await page.$$('.slide');
  console.log(`Encontrados ${slides.length} slides.`);

  for (let i = 0; i < slides.length; i++) {
    const num = String(i + 1).padStart(2, '0');
    const outPath = path.join(outDir, `slide-${num}.png`);
    await slides[i].screenshot({ path: outPath });
    console.log(`✓ slide-${num}.png`);
  }

  await browser.close();
  console.log('\nPronto! Slides em: marketing/conteudo/carrossel-apresentacao-2026-06-05/instagram/');
})();
