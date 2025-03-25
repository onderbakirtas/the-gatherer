const fs = require('fs');
const { createCanvas } = require('canvas');
const path = require('path');

// Ensure the assets directory exists
const assetsDir = path.join(__dirname, 'public', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create grass texture
function createGrassTexture() {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  
  // Draw a green background
  ctx.fillStyle = '#388004';
  ctx.fillRect(0, 0, 64, 64);
  
  // Add some texture details
  ctx.fillStyle = '#81C784';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 2 + Math.random() * 4;
    ctx.fillRect(x, y, size, size);
  }
  
  // Add some darker details
  ctx.fillStyle = '#388E3C';
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 1 + Math.random() * 3;
    ctx.fillRect(x, y, size, size);
  }
  
  // Save the image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'grass.png'), buffer);
  console.log('Created grass texture');
}

// Create cliff texture
function createCliffTexture() {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  
  // Draw a gray background
  ctx.fillStyle = '#757575';
  ctx.fillRect(0, 0, 64, 64);
  
  // Add some texture details
  ctx.fillStyle = '#616161';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 3 + Math.random() * 6;
    ctx.fillRect(x, y, size, size);
  }
  
  // Add some darker details
  ctx.fillStyle = '#424242';
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 2 + Math.random() * 4;
    ctx.fillRect(x, y, size, size);
  }
  
  // Save the image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, 'cliff.png'), buffer);
  console.log('Created cliff texture');
}

// Create textures
try {
  createGrassTexture();
  createCliffTexture();
  console.log('Textures created successfully');
} catch (error) {
  console.error('Error creating textures:', error);
}
