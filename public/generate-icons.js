/**
 * Icon generation script for PWA
 * Creates required icon sizes from the source image
 * Run: node public/generate-icons.js
 */
const fs = require('fs');
const path = require('path');

// We'll use a simple approach - copy the source icon as the base sizes
// For production, you'd use sharp or canvas to resize properly
const sourceIcon = path.join(__dirname, '..', 'app_icon_source.jpg');
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// For now, copy the source as all sizes (browsers handle scaling)
const sizes = ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'];

const source = fs.readFileSync(sourceIcon);
sizes.forEach(name => {
  fs.writeFileSync(path.join(iconsDir, name), source);
  console.log(`Created ${name}`);
});

console.log('Done! Icons created in public/icons/');
