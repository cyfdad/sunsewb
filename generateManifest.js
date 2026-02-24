const fs = require('fs');
const path = require('path');

const IMAGE_DIR = './assets/images/Koishi';
const OUTPUT_FILE = path.join(IMAGE_DIR, 'manifest.json');

const THRESHOLDS = {
  small: 750 * 1024,
  medium: 1500 * 1024,
};

function generateManifest() {
  const files = fs.readdirSync(IMAGE_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

  const groups = {
    small: [],
    medium: [],
    large: []
  };

  files.forEach(filename => {
    const filepath = path.join(IMAGE_DIR, filename);
    const stats = fs.statSync(filepath);
    const size = stats.size;

    if (size < THRESHOLDS.small) {
      groups.small.push({ file: filename, size });
    } else if (size < THRESHOLDS.medium) {
      groups.medium.push({ file: filename, size });
    } else {
      groups.large.push({ file: filename, size });
    }
  });

  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => a.size - b.size);
    groups[key] = groups[key].map(item => item.file);
  });

  const manifest = {
    generated: new Date().toISOString(),
    stats: {
      small: groups.small.length,
      medium: groups.medium.length,
      large: groups.large.length,
      total: files.length
    },
    groups
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log('Manifest generated:', OUTPUT_FILE);
  console.log(`Small: ${groups.small.length},Medium: ${groups.medium.length},Large: ${groups.large.length}`);
}

generateManifest();