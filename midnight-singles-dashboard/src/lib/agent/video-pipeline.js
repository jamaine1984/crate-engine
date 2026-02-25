/**
 * Video Generation Pipeline
 * 
 * Priority order:
 * 1. SeedDance 2.0 (ByteDance) — best quality, 15s video from image+text
 * 2. Kling AI — good quality, reasonable pricing
 * 3. Runway Gen-3 — high quality but expensive
 * 4. Pika Labs — decent, affordable
 * 5. Image slideshow fallback — free, uses ffmpeg
 * 
 * Current: Researching SeedDance 2.0 API access
 * Fallback: Image + text overlay + music via ffmpeg
 */

const VIDEO_GENERATORS = {
  seeddance2: {
    name: 'SeedDance 2.0',
    provider: 'ByteDance',
    status: 'researching', // API not publicly available yet — checking access
    quality: 10,
    costPer15s: 'TBD',
    supports: ['image-to-video', 'text-to-video'],
    resolution: '1080x1920',
    notes: 'Best quality for short-form. Motion + camera control.',
  },
  kling: {
    name: 'Kling AI 1.6',
    provider: 'Kuaishou',
    status: 'available',
    quality: 8,
    costPer15s: '~$0.15-0.30',
    supports: ['image-to-video', 'text-to-video'],
    resolution: '1080x1920',
    apiUrl: 'https://api.klingai.com',
    notes: 'Great balance of quality and cost. Available via API.',
  },
  runway: {
    name: 'Runway Gen-3 Alpha',
    provider: 'Runway',
    status: 'available',
    quality: 9,
    costPer15s: '~$0.50-1.00',
    supports: ['image-to-video', 'text-to-video'],
    resolution: '1080x1920',
    apiUrl: 'https://api.dev.runwayml.com',
    notes: 'High quality but costly for daily volume.',
  },
  pika: {
    name: 'Pika 2.0',
    provider: 'Pika Labs',
    status: 'available',
    quality: 7,
    costPer15s: '~$0.10-0.20',
    supports: ['image-to-video', 'text-to-video'],
    resolution: '1080x1920',
    notes: 'Affordable, decent quality for social content.',
  },
  minimax: {
    name: 'MiniMax Video-01',
    provider: 'MiniMax (via Replicate)',
    status: 'available',
    quality: 8,
    costPer15s: '~$0.10',
    supports: ['image-to-video'],
    resolution: '1080x1920',
    notes: 'Available on Replicate. Good quality, very affordable.',
  },
  ffmpeg_fallback: {
    name: 'Image Slideshow (ffmpeg)',
    provider: 'Local',
    status: 'ready',
    quality: 5,
    costPer15s: 'Free',
    supports: ['image-to-video'],
    resolution: '1080x1920',
    notes: 'Free fallback: AI image + text overlay + zoom/pan + music',
  },
};

/**
 * Create a 15s video from image + text using ffmpeg (free fallback)
 */
function generateFfmpegCommand({ imagePath, outputPath, textOverlays, musicPath, duration = 15 }) {
  // Ken Burns effect (slow zoom) + text overlays + optional music
  const textFilters = textOverlays.map((text, i) => {
    const startTime = i * (duration / textOverlays.length);
    const endTime = startTime + (duration / textOverlays.length);
    return `drawtext=text='${text.replace(/'/g, "\\'")}':fontcolor=white:fontsize=48:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-200-${i * 60}:enable='between(t,${startTime},${endTime})'`;
  }).join(',');

  const zoomFilter = `zoompan=z='min(zoom+0.001,1.3)':d=${duration * 25}:s=1080x1920`;
  const filters = [zoomFilter, textFilters].filter(Boolean).join(',');

  let cmd = `ffmpeg -loop 1 -i "${imagePath}" -filter_complex "${filters}" -t ${duration} -pix_fmt yuv420p -c:v libx264 -preset fast`;

  if (musicPath) {
    cmd += ` -i "${musicPath}" -c:a aac -shortest`;
  }

  cmd += ` "${outputPath}"`;
  return cmd;
}

/**
 * Cost calculator for daily content
 */
function calculateDailyCost(generator, postsPerDay = 5) {
  const gen = VIDEO_GENERATORS[generator];
  if (!gen || gen.costPer15s === 'Free' || gen.costPer15s === 'TBD') return gen?.costPer15s || 'Unknown';

  const costStr = gen.costPer15s.replace(/[~$]/g, '');
  const costs = costStr.split('-').map(Number);
  const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

  return {
    perPost: `$${avgCost.toFixed(2)}`,
    daily: `$${(avgCost * postsPerDay).toFixed(2)}`,
    monthly: `$${(avgCost * postsPerDay * 30).toFixed(2)}`,
  };
}

module.exports = {
  VIDEO_GENERATORS,
  generateFfmpegCommand,
  calculateDailyCost,
};
