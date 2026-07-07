/**
 * Posta um carrossel no Facebook via Meta Graph API.
 * Uso: node --env-file=.env scripts/postar-facebook.js <pasta-carrossel>
 */

import fs   from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

// ── Validar variáveis de ambiente ─────────────────────────────────────────

const REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'META_PAGE_ACCESS_TOKEN',
  'META_PAGE_ID',
];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\n❌ Faltam variáveis no .env:\n   ${missing.join('\n   ')}`);
  console.error('\n→ Siga: marketing/automacao-meta-setup.md\n');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const META_API              = 'https://graph.facebook.com/v19.0';
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const META_PAGE_ID           = process.env.META_PAGE_ID;

// ── Argumento ─────────────────────────────────────────────────────────────

const carrosselDir = process.argv[2];
if (!carrosselDir) {
  console.error('\nUso: node --env-file=.env scripts/postar-facebook.js <pasta-carrossel>\n');
  process.exit(1);
}

const absoluteDir  = path.resolve(carrosselDir);
const instagramDir = path.join(absoluteDir, 'instagram');
const legendaPath  = path.join(absoluteDir, 'legenda.md');

// ── Helpers ───────────────────────────────────────────────────────────────

async function uploadToCloudinary(filePath) {
  const result = await cloudinary.uploader.upload(filePath, {
    public_id:     'luxvision-' + path.basename(filePath, '.png') + '-' + Date.now(),
    resource_type: 'image',
  });
  return result.secure_url;
}

async function uploadPhotoToPage(imageUrl) {
  const res  = await fetch(`${META_API}/${META_PAGE_ID}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, published: false, access_token: META_PAGE_ACCESS_TOKEN }),
  });
  const data = await res.json();
  if (!data.id) { console.error('Erro upload foto:', data); process.exit(1); }
  return data.id;
}

async function publishMultiPhotoPost(photoIds, caption) {
  const res  = await fetch(`${META_API}/${META_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message:        caption,
      attached_media: photoIds.map(id => ({ media_fbid: id })),
      access_token:   META_PAGE_ACCESS_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.id) { console.error('Erro publicar Facebook:', data); process.exit(1); }
  return data.id;
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log('\n🔍 Verificando arquivos...');

if (!fs.existsSync(legendaPath)) {
  console.error(`❌ legenda.md não encontrado em: ${absoluteDir}\n`);
  process.exit(1);
}
const caption = fs.readFileSync(legendaPath, 'utf8').trim();

const slides = fs.readdirSync(instagramDir)
  .filter(f => /^slide-\d+\.png$/.test(f))
  .sort()
  .map(f => path.join(instagramDir, f));

if (!slides.length) {
  console.error(`❌ Nenhum slide encontrado em: ${instagramDir}\n`);
  process.exit(1);
}

console.log(`   ✓ ${slides.length} slides`);
console.log(`   ✓ legenda.md`);

console.log('\n⬆️  Fazendo upload para Cloudinary...\n');
const imageUrls = [];
for (let i = 0; i < slides.length; i++) {
  const url = await uploadToCloudinary(slides[i]);
  imageUrls.push(url);
  console.log(`   ✓ slide-${String(i + 1).padStart(2, '0')}.png`);
}

console.log('\n📤 Enviando fotos pra Página...\n');
const photoIds = [];
for (let i = 0; i < imageUrls.length; i++) {
  photoIds.push(await uploadPhotoToPage(imageUrls[i]));
  console.log(`   ✓ foto ${i + 1}`);
}

console.log('\n🚀 Publicando no Facebook...');
const postId = await publishMultiPhotoPost(photoIds, caption);

console.log(`\n✅ Publicado! ID: ${postId}\n`);
