import { ref, set } from 'firebase/database';
import { ASSET_PATHS } from '../constants/game';
import { db } from './firebase';

const grassImage = new Image();
grassImage.src = ASSET_PATHS.GRASS;

const cliffImage = new Image();
cliffImage.src = ASSET_PATHS.CLIFF;

function createDefaultGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Draw a green background
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, 0, 64, 64);

  // Add some texture details
  ctx.fillStyle = '#81C784';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    const size = 2 + Math.random() * 4;
    ctx.fillRect(x, y, size, size);
  }

  // Set the grass image source to this canvas
  grassImage.src = canvas.toDataURL();
}

function createDefaultCliffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

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

  // Set the cliff image source to this canvas
  cliffImage.src = canvas.toDataURL();
}

function updatePosition(x: number, y: number) {
  let playerId = localStorage.getItem('playerId');

  if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('playerId', playerId);
  }

  // Store the target position in the database
  // This will be used by other clients to show where the player is heading
  set(ref(db, `players/${playerId}/targetPosition`), { 
    x, 
    y,
    timestamp: Date.now() 
  });
}

export { grassImage, cliffImage, createDefaultGrassTexture, createDefaultCliffTexture, updatePosition };
