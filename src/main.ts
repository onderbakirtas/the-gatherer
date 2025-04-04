import { invoke } from '@tauri-apps/api/core';
import { sleep } from './utils/helpers';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MAP_WIDTH,
  MAP_HEIGHT,
  PLAYER_SIZE,
  // PLAYER_SPEED,
  BORDER_WIDTH,
  MINIMAP_SIZE,
  MINIMAP_PADDING,
  RESOURCE_SIZE,
  RESOURCE_GATHER_DISTANCE,
  MAX_TIER3_RESOURCES,
  MAX_TIER2_RESOURCES,
  ASSET_PATHS,
  PLAYER_COLORS
} from './constants/game';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { db } from './utils/firebase';
import { ref, onValue, get } from 'firebase/database';
import { LanguageManager, t } from './lib/language-manager';
import { createResourceTexture } from './utils/create-resource-texture';
import { ResourceRarity } from './utils/types';
import { Vector2 } from './lib/vector2';
import { Resource } from './lib/resource';
import { cliffImage, createDefaultCliffTexture, createDefaultGrassTexture, grassImage } from './utils/game-utils';
import { Camera } from './lib/camera';
import { Player } from './lib/player';
import { getTauriVersion } from '@tauri-apps/api/app';

async function setup() {
  await sleep(3);
  await invoke('set_complete', { task: 'frontend' });
}

// Initialize titlebar controls for Tauri
(async function initializeTauriControls() {
  try {
    // Check if running in Tauri by trying to get the Tauri version
    const tauriVersion = await getTauriVersion();
    if (tauriVersion) {
      const appWindows = getCurrentWindow();

      document.getElementById('titlebar-minimize')?.addEventListener('click', () => {
        appWindows.minimize();
      });

      document.getElementById('titlebar-close')?.addEventListener('click', () => {
        appWindows.close();
      });

      document.getElementById('titlebar-move')?.addEventListener('mousedown', e => {
        if (e.buttons === 1) {
          // Primary (left) button
          appWindows.startDragging(); // Else start dragging
        }
      });
    }
  } catch (e) {
    // Not running in Tauri
    console.log('Not running in Tauri environment');
  }
})();

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Check if running in Tauri by trying to get the Tauri version
    const tauriVersion = await getTauriVersion();
    if (tauriVersion) {
      setup();
    }
  } catch (e) {
    // Not running in Tauri
    console.log('Not running in Tauri environment');
  }

  // Initialize the game regardless of environment
  new Game();
});

// Generate a unique player ID
// Check if player ID is already in localStorage
let playerId = localStorage.getItem('playerId');
let isNewPlayer = false;

if (!playerId) {
  isNewPlayer = true;
  playerId = 'player_' + Math.random().toString(36).slice(2, 9);
  localStorage.setItem('playerId', playerId);
}

// Get saved display name or create a default one
let playerDisplayName = localStorage.getItem('playerDisplayName');
if (!playerDisplayName) {
  playerDisplayName = playerId.replace('player_', '');
  localStorage.setItem('playerDisplayName', playerDisplayName);
}

// Global variable for game instance
let gameInstance: Game | null = null;

// Store players data from the database
let playersData: Record<string, any> = {};

// Store other players' data for client-side movement
interface OtherPlayerData {
  position: { x: number, y: number };
  targetPosition: { x: number, y: number } | null;
  isMoving: boolean;
  lastUpdated: number;
  color: string;
  displayName: string;
}

const otherPlayers: Record<string, OtherPlayerData> = {};

// Global değişken olarak son güncelleme zamanını tutalım
let lastFirebaseUpdateTime = 0;
const FIREBASE_UPDATE_THROTTLE = 500; // ms cinsinden minimum güncelleme aralığı

// Set up player tracking
const playerRef = ref(db, `players`);

onValue(playerRef, snapshot => {
  playersData = snapshot.val() || {};
  console.log('Players updated:', playersData);
  
  // Update other players' movement state
  Object.entries(playersData).forEach(([otherPlayerId, playerData]: [string, any]) => {
    if (otherPlayerId === playerId) return; // Skip current player
    
    // Initialize player movement state if not exists
    if (!otherPlayers[otherPlayerId]) {
      otherPlayers[otherPlayerId] = {
        position: { x: playerData.position.x, y: playerData.position.y },
        targetPosition: playerData.targetPosition,
        isMoving: playerData.isMoving || false,
        lastUpdated: Date.now(),
        color: playerData.color || '#3498db',
        displayName: playerData.displayName || otherPlayerId.substring(0, 8)
      };
    }
    
    // Update player data
    otherPlayers[otherPlayerId].targetPosition = playerData.targetPosition;
    otherPlayers[otherPlayerId].isMoving = playerData.isMoving || false;
    otherPlayers[otherPlayerId].lastUpdated = Date.now();
    otherPlayers[otherPlayerId].color = playerData.color || '#3498db';
    otherPlayers[otherPlayerId].displayName = playerData.displayName || otherPlayerId.substring(0, 8);
    
    // If player has reached destination or has no target, update position directly
    if (!playerData.isMoving || !playerData.targetPosition) {
      otherPlayers[otherPlayerId].position = { x: playerData.position.x, y: playerData.position.y };
    }
  });
  
  // Update the game UI if the game instance is available
  if (gameInstance) {
    // Çok sık yeniden çizim yapmayı önlemek için throttling uygulayalım
    const currentTime = Date.now();
    if (currentTime - lastFirebaseUpdateTime > FIREBASE_UPDATE_THROTTLE) {
      lastFirebaseUpdateTime = currentTime;
      // Force a redraw to show updated player positions
      requestAnimationFrame(() => {
        if (gameInstance) gameInstance.gameLoop();
      });
    }
  }
});

// Listen for resource changes globally to handle updates even before game initialization
const resourcesRef = ref(db, 'resources');
onValue(resourcesRef, snapshot => {
  const resourcesData = snapshot.val() || {};
  
  // Update local resources with data from the database if game instance exists
  if (gameInstance) {
    let resourcesChanged = false;
    
    Object.entries(resourcesData).forEach(([id, resourceData]: [string, any]) => {
      // Find the corresponding local resource
      if (gameInstance) {
        const localResource = gameInstance.resources.find((r: Resource) => r.resourceId === id);
        
        if (localResource) {
          // Update resource state only if there's a change
          if (localResource.isGathered !== (resourceData.isGathered || false)) {
            localResource.isGathered = resourceData.isGathered || false;
            resourcesChanged = true;
          }
          
          // Update gathering state if not being gathered by the current player
          const isBeingGatheredByOther = resourceData.isBeingGathered && 
                                        resourceData.gatheringPlayerId !== playerId;
          
          if (isBeingGatheredByOther && 
              (!localResource.isBeingGathered || 
               localResource.gatheringPlayerId !== resourceData.gatheringPlayerId)) {
            
            localResource.isBeingGathered = true;
            localResource.gatheringPlayerId = resourceData.gatheringPlayerId;
            localResource.gatheringPlayerName = resourceData.gatheringPlayerName;
            resourcesChanged = true;
          } else if (!isBeingGatheredByOther && localResource.isBeingGathered && 
                    localResource.gatheringPlayerId !== playerId) {
            // Kaynak artık toplanmıyor
            localResource.isBeingGathered = false;
            localResource.gatheringPlayerId = null;
            localResource.gatheringPlayerName = null;
            resourcesChanged = true;
          }
        }
      }
    });
    
    // Sadece değişiklik varsa yeniden çizim yap
    if (resourcesChanged) {
      // Çok sık yeniden çizim yapmayı önlemek için throttling uygulayalım
      const currentTime = Date.now();
      if (currentTime - lastFirebaseUpdateTime > FIREBASE_UPDATE_THROTTLE) {
        lastFirebaseUpdateTime = currentTime;
        // Force a redraw to show updated resource states
        requestAnimationFrame(() => {
          if (gameInstance) gameInstance.gameLoop();
        });
      }
    }
  }
});

function drawPlayers(ctx: CanvasRenderingContext2D, cameraOffset: Vector2, currentPlayerId: string) {
  // Get all players from Firebase
  const playersRef = ref(db, 'players');
  onValue(playersRef, (snapshot) => {
    const players = snapshot.val();
    if (!players) return;
    
    // Current time for movement calculations
    const now = Date.now();
    
    // Loop through all players
    for (const id in players) {
      // Skip current player
      if (id === currentPlayerId) continue;
      
      const playerData = players[id];
      
      // Skip players that haven't been updated in the last 5 minutes
      const lastUpdated = playerData.lastUpdated || 0;
      if (now - lastUpdated > 5 * 60 * 1000) {
        // Remove old players from our local tracking
        if (otherPlayers[id]) {
          delete otherPlayers[id];
        }
        continue;
      }
      
      // Initialize or update player in our local tracking
      if (!otherPlayers[id]) {
        otherPlayers[id] = {
          position: { x: playerData.position.x, y: playerData.position.y },
          targetPosition: playerData.targetPosition,
          isMoving: playerData.isMoving || false,
          lastUpdated: now,
          color: playerData.color || '#3498db',
          displayName: playerData.displayName || id.substring(0, 8)
        };
      } else {
        // Update player data
        otherPlayers[id].targetPosition = playerData.targetPosition;
        otherPlayers[id].isMoving = playerData.isMoving || false;
        otherPlayers[id].lastUpdated = now;
        otherPlayers[id].color = playerData.color || '#3498db';
        otherPlayers[id].displayName = playerData.displayName || id.substring(0, 8);
        
        // If player has reached destination or has no target, update position directly
        if (!playerData.isMoving || !playerData.targetPosition) {
          otherPlayers[id].position = { x: playerData.position.x, y: playerData.position.y };
        }
      }
    }
  });
  
  // Update and draw all other players
  for (const id in otherPlayers) {
    const player = otherPlayers[id];
    
    // Update player movement on client side
    if (player.isMoving && player.targetPosition) {
      // Calculate direction to target
      const dx = player.targetPosition.x - player.position.x;
      const dy = player.targetPosition.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If player is close to target, snap to it
      if (distance < 5) {
        player.position.x = player.targetPosition.x;
        player.position.y = player.targetPosition.y;
        player.isMoving = false;
      } else {
        // Move player towards target
        const dirX = dx / distance;
        const dirY = dy / distance;
        
        // Calculate movement based on time (deltaTime approximation)
        const moveDistance = 5 * (1/60); // Assuming 60 FPS
        player.position.x += dirX * moveDistance;
        player.position.y += dirY * moveDistance;
      }
    }
    
    // Calculate screen position
    const screenX = player.position.x - cameraOffset.x;
    const screenY = player.position.y - cameraOffset.y;
    
    // Skip if player is off-screen
    if (screenX < -PLAYER_SIZE || screenX > CANVAS_WIDTH + PLAYER_SIZE ||
        screenY < -PLAYER_SIZE || screenY > CANVAS_HEIGHT + PLAYER_SIZE) {
      continue;
    }
    
    // Draw player circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, PLAYER_SIZE, 0, Math.PI * 2);
    
    // Use player's color or default
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw player name
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Draw text with outline for better visibility
    ctx.strokeText(player.displayName, screenX, screenY - PLAYER_SIZE - 5);
    ctx.fillText(player.displayName, screenX, screenY - PLAYER_SIZE - 5);
    
    // Draw target cross if player is moving
    if (player.isMoving && player.targetPosition) {
      // Draw a cross at the target position
      const targetScreenX = player.targetPosition.x - cameraOffset.x;
      const targetScreenY = player.targetPosition.y - cameraOffset.y;
      
      // Only draw if on screen
      if (targetScreenX >= 0 && targetScreenX <= CANVAS_WIDTH && 
          targetScreenY >= 0 && targetScreenY <= CANVAS_HEIGHT) {
        
        // Set cross style
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // Semi-transparent yellow
        ctx.lineWidth = 1;
        
        // Draw cross
        const crossSize = 5;
        
        // First diagonal line
        ctx.beginPath();
        ctx.moveTo(targetScreenX - crossSize, targetScreenY - crossSize);
        ctx.lineTo(targetScreenX + crossSize, targetScreenY + crossSize);
        ctx.stroke();
        
        // Second diagonal line
        ctx.beginPath();
        ctx.moveTo(targetScreenX + crossSize, targetScreenY - crossSize);
        ctx.lineTo(targetScreenX - crossSize, targetScreenY + crossSize);
        ctx.stroke();
      }
    }
  }
}

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Player;
  camera: Camera;
  lastFrameTime: number = 0;
  grassTexture: HTMLImageElement = new Image();
  cliffTexture: HTMLImageElement = new Image();
  assetsLoaded: boolean = false;
  lastClickPosition: Vector2 | null = null;
  resources: Resource[] = [];
  lastMouseX: number = 0;
  lastMouseY: number = 0;
  showControlsPopup: boolean = false;
  showSettingsPopup: boolean = false;
  popupScrollPosition: number = 0;
  languageManager: LanguageManager;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // Initialize language manager
    this.languageManager = LanguageManager.getInstance();

    // Initialize player at the center of the map
    this.player = new Player(MAP_WIDTH / 2, MAP_HEIGHT / 2, playerId || 'unknown_player');
    
    // Set player display name from localStorage if available
    const savedDisplayName = localStorage.getItem('playerDisplayName');
    if (savedDisplayName) {
      this.player.displayName = savedDisplayName;
    }
    
    this.camera = new Camera(this.player.position);

    // Set up event listeners
    this.setupEventListeners();

    // Initialize the game
    this.init();
    
    // If this is a new player, show the display name dialog after a short delay
    // to ensure the game is fully loaded
    if (isNewPlayer) {
      setTimeout(() => {
        this.showWelcomeNameDialog();
      }, 1000);
    }
    
    // Set the global game instance
    gameInstance = this;
    
    // Set up resource listener after game is initialized
    this.setupResourceListener();
  }
  
  // Set up listener for resource changes in the database
  setupResourceListener(): void {
    // This is now handled globally to ensure resources are tracked
    // even before the game is fully initialized
    console.log("Resource listener already set up globally");
  }

  init() {
    return new Promise<void>(async (resolve) => {
      // Initialize language manager first
      await this.languageManager.init();
      
      // Subscribe to language changes
      this.languageManager.onLanguageChange(() => {
        // Redraw UI when language changes
        if (this.assetsLoaded) {
          this.draw();
        }
      });
      
      // Load textures
      this.grassTexture.src = ASSET_PATHS.GRASS;
      this.cliffTexture.src = ASSET_PATHS.CLIFF;
      
      // Wait for textures to load
      let loadedCount = 0;
      const totalAssets = 2;
      
      const checkAllLoaded = () => {
        loadedCount++;
        if (loadedCount >= totalAssets) {
          this.assetsLoaded = true;
          
          // Generate resources
          this.generateResources();
          
          // Start game loop
          this.lastFrameTime = performance.now();
          requestAnimationFrame(() => this.gameLoop());
          
          resolve();
        }
      };
      
      this.grassTexture.onload = checkAllLoaded;
      this.cliffTexture.onload = checkAllLoaded;
    });
  }

  async generateResources() {
    // Clear existing resources
    this.resources = [];

    try {
      // Önce resources koleksiyonundan kaynakları almayı deneyelim
      const resourcesRef = ref(db, 'resources');
      const resourcesSnapshot = await get(resourcesRef);
      
      if (resourcesSnapshot.exists()) {
        console.log("Firebase'den kaynaklar yükleniyor...");
        const resourcesData = resourcesSnapshot.val();
        
        // Her kaynağı işle
        Object.entries(resourcesData).forEach(([ _id, resourceData]: [string, any]) => {
          if (resourceData && resourceData.position && typeof resourceData.position.x === 'number' && 
              typeof resourceData.position.y === 'number' && typeof resourceData.rarity === 'number') {
            
            // resourceId'yi newResource oluştururken kullanabiliriz
            const newResource = new Resource(
              resourceData.position.x, 
              resourceData.position.y, 
              resourceData.rarity
            );
            
            // Eğer kaynak zaten toplanmışsa veya toplanıyorsa, bu durumu ayarla
            if (resourceData.isGathered) {
              newResource.isGathered = true;
            }
            
            if (resourceData.isBeingGathered && resourceData.gatheringPlayerId !== playerId) {
              newResource.isBeingGathered = true;
              newResource.gatheringPlayerId = resourceData.gatheringPlayerId;
              newResource.gatheringPlayerName = resourceData.gatheringPlayerName;
            }
            
            this.resources.push(newResource);
          }
        });
        
        console.log(`Firebase'den ${this.resources.length} kaynak yüklendi`);
      } else {
        // Eğer resources koleksiyonu yoksa, eski maps yapısından almayı deneyelim
        console.log("Resources koleksiyonu bulunamadı, maps yapısından yüklemeyi deniyorum...");
        const mapsRef = ref(db, 'maps');
        const dbResources = await get(mapsRef);
        const mapData = dbResources.val();
        
        if (mapData && mapData.resources && mapData.resources.locations) {
          const mapResources = mapData.resources.locations;
          console.log("Map resources:", mapResources);
          
          if (Array.isArray(mapResources)) {
            mapResources.forEach((resource: { x: number; y: number; rarity: number }) => {
              if (typeof resource.x === 'number' && typeof resource.y === 'number' && typeof resource.rarity === 'number') {
                const newResource = new Resource(resource.x, resource.y, resource.rarity);
                this.resources.push(newResource);
              }
            });
          }
        }
        
        console.log(`Maps yapısından ${this.resources.length} kaynak yüklendi`);
      }
      
      // Eğer hiç kaynak yüklenemezse, varsayılan kaynakları oluştur
      if (this.resources.length === 0) {
        console.log("Hiç kaynak yüklenemedi, varsayılan kaynaklar oluşturuluyor...");
        this.generateDefaultResources();
      }
    } catch (error) {
      console.error('Kaynakları yüklerken hata oluştu:', error);
      this.generateDefaultResources();
    }
  }

  generateDefaultResources() {
    console.log('Generating default resources');

    // Track resource counts and total shards
    let totalShards = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let tier4Count = 0;
    let tier5Count = 0;

    // First, add the limited higher tier resources

    // Add Tier 5 resources (max 1)
    for (let i = 0; i < 1; i++) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);

      const resource = new Resource(x, y, ResourceRarity.LEGENDARY);
      this.resources.push(resource);

      totalShards += resource.shardValue;
      tier5Count++;
    }

    // Add Tier 4 resources (max 2)
    for (let i = 0; i < 2; i++) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);

      const resource = new Resource(x, y, ResourceRarity.EPIC);
      this.resources.push(resource);

      totalShards += resource.shardValue;
      tier4Count++;
    }

    // Add Tier 3 resources (max 2)
    for (let i = 0; i < MAX_TIER3_RESOURCES; i++) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);

      const resource = new Resource(x, y, ResourceRarity.RARE);
      this.resources.push(resource);

      totalShards += resource.shardValue;
      tier3Count++;
    }

    // Add Tier 2 resources (max 5)
    for (let i = 0; i < MAX_TIER2_RESOURCES; i++) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);

      const resource = new Resource(x, y, ResourceRarity.UNCOMMON);
      this.resources.push(resource);

      totalShards += resource.shardValue;
      tier2Count++;
    }

    // Add Tier 1 resources (max 10)
    for (let i = 0; i < 10; i++) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);

      const resource = new Resource(x, y, ResourceRarity.COMMON);
      this.resources.push(resource);

      totalShards += resource.shardValue;
    }

    console.log(`Generated ${this.resources.length} resources with ${totalShards} total shards`);
    console.log(
      `Tier 5: ${tier5Count}, Tier 4: ${tier4Count}, Tier 3: ${tier3Count}, Tier 2: ${tier2Count}, Tier 1: ${
        this.resources.length - tier5Count - tier4Count - tier3Count - tier2Count
      }`
    );
  }

  setupEventListeners() {
    // Mouse move event
    this.canvas.addEventListener('mousemove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      
      // Update cursor
      this.updateMouseCursor();
    });

    // Mouse wheel for scrolling popup
    this.canvas.addEventListener('wheel', (e) => {
      if (this.showControlsPopup || this.showSettingsPopup) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check if mouse is over the popup content area
        const popupX = CANVAS_WIDTH / 2 - 200;
        const popupY = CANVAS_HEIGHT / 2 - 150;
        const popupWidth = 400;
        const popupHeight = 300;

        if (mouseX >= popupX && mouseX <= popupX + popupWidth && mouseY >= popupY && mouseY <= popupY + popupHeight) {
          // Prevent default scrolling behavior
          e.preventDefault();

          // Update scroll position based on wheel delta
          this.popupScrollPosition += e.deltaY * 0.5;

          // Clamp scroll position
          const totalContentHeight = 24 * 20; // lineHeight * number of lines
          const visibleHeight = 180; // contentHeight
          const maxScroll = Math.max(0, totalContentHeight - visibleHeight);

          this.popupScrollPosition = Math.max(0, Math.min(maxScroll, this.popupScrollPosition));
        }
      }
    });

    // Left click for gathering and UI interaction
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check if clicked on controls button
      if (this.isPointInControlsButton(clickX, clickY)) {
        this.showControlsPopup = !this.showControlsPopup;
        this.showSettingsPopup = false; // Close settings if open
        this.popupScrollPosition = 0; // Reset scroll position
        return;
      }

      // Check if clicked on settings button
      if (this.isPointInSettingsButton(clickX, clickY)) {
        this.showSettingsPopup = !this.showSettingsPopup;
        this.showControlsPopup = false; // Close controls popup if open
        this.popupScrollPosition = 0; // Reset scroll position
        return;
      }

      // Check if clicked on language buttons in settings popup
      if (this.handleLanguageButtonClick(clickX, clickY)) {
        return;
      }

      // Check if clicked on color buttons in settings popup
      if (this.handleColorButtonClick(clickX, clickY)) {
        return;
      }

      // Check if clicked on scroll buttons in settings popup
      if (this.handleSettingsScrollButtonClick(clickX, clickY)) {
        return;
      }

      // If popup is open, check if clicked outside to close it
      if (this.showControlsPopup) {
        if (!this.isPointInControlsPopup(clickX, clickY)) {
          this.showControlsPopup = false;
        }
        return;
      }

      // If settings popup is open, check if clicked outside to close it
      if (this.showSettingsPopup) {
        if (!this.isPointInSettingsPopup(clickX, clickY)) {
          this.showSettingsPopup = false;
        }
        return;
      }

      // Convert screen coordinates to world coordinates
      const cameraOffset = this.camera.getOffset();
      const worldX = clickX + cameraOffset.x;
      const worldY = clickY + cameraOffset.y;

      // Check if clicked on a resource
      const clickedResource = this.findResourceAtPosition(worldX, worldY);

      if (clickedResource && clickedResource.canBeGathered()) {
        // Calculate distance to resource
        const distance = this.player.position.distanceTo(clickedResource.position);

        if (distance <= RESOURCE_GATHER_DISTANCE) {
          // Player is close enough to gather
          this.player.startGatheringResource(clickedResource);
        }
      }
    });

    // Right click for movement
    this.canvas.addEventListener('contextmenu', (e) => {
      // Prevent the context menu from appearing
      e.preventDefault();

      // If player is already moving, don't allow setting a new target
      if (this.player.isMoving) return;

      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert screen coordinates to world coordinates
      const cameraOffset = this.camera.getOffset();
      const worldX = clickX + cameraOffset.x;
      const worldY = clickY + cameraOffset.y;

      // Check if clicked on a resource
      const clickedResource = this.findResourceAtPosition(worldX, worldY);

      let targetSet = false;
      
      if (clickedResource) {
        // Calculate a position near the resource
        const direction = new Vector2(
          clickedResource.position.x - this.player.position.x,
          clickedResource.position.y - this.player.position.y
        ).normalize();

        // Target position is slightly before the resource
        const targetX = clickedResource.position.x - direction.x * (RESOURCE_SIZE / 2 + PLAYER_SIZE);
        const targetY = clickedResource.position.y - direction.y * (RESOURCE_SIZE / 2 + PLAYER_SIZE);

        // Clamp to playable area
        let clampedX = targetX;
        let clampedY = targetY;

        if (clampedX < BORDER_WIDTH) {
          clampedX = BORDER_WIDTH;
        } else if (clampedX > MAP_WIDTH - BORDER_WIDTH) {
          clampedX = MAP_WIDTH - BORDER_WIDTH;
        }

        if (clampedY < BORDER_WIDTH) {
          clampedY = BORDER_WIDTH;
        } else if (clampedY > MAP_HEIGHT - BORDER_WIDTH) {
          clampedY = MAP_HEIGHT - BORDER_WIDTH;
        }

        // Set player target to the valid position
        targetSet = this.player.setTarget(clampedX, clampedY);
        
        // Only store the target position for drawing the cross if movement was successful
        if (targetSet) {
          this.lastClickPosition = new Vector2(clampedX, clampedY);
        }
      } else {
        // Calculate target position - either the click position or the closest point on the border
        let targetX = worldX;
        let targetY = worldY;

        // Clamp to playable area
        if (targetX < BORDER_WIDTH) {
          targetX = BORDER_WIDTH;
        } else if (targetX > MAP_WIDTH - BORDER_WIDTH) {
          targetX = MAP_WIDTH - BORDER_WIDTH;
        }

        if (targetY < BORDER_WIDTH) {
          targetY = BORDER_WIDTH;
        } else if (targetY > MAP_HEIGHT - BORDER_WIDTH) {
          targetY = MAP_HEIGHT - BORDER_WIDTH;
        }

        // Set player target to the valid position
        targetSet = this.player.setTarget(targetX, targetY);
        
        // Only store the target position for drawing the cross if movement was successful
        if (targetSet) {
          this.lastClickPosition = new Vector2(targetX, targetY);
        }
      }
    });
  }

  findResourceAtPosition(x: number, y: number): Resource | null {
    for (const resource of this.resources) {
      // Check if click is within resource bounds
      if (
        x >= resource.position.x - RESOURCE_SIZE / 2 &&
        x <= resource.position.x + RESOURCE_SIZE / 2 &&
        y >= resource.position.y - RESOURCE_SIZE / 2 &&
        y <= resource.position.y + RESOURCE_SIZE / 2
      ) {
        return resource;
      }
    }

    return null;
  }

  gameLoop() {
    // Calculate delta time
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convert to seconds
    this.lastFrameTime = currentTime;
    
    // FPS hesapla ve göster (Debug için)
    const fps = Math.round(1 / deltaTime);
    
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update game state
    this.updateGame(deltaTime);
    
    // Draw the game
    this.draw();
    
    // FPS göster (Debug için)
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`FPS: ${fps}`, 10, CANVAS_HEIGHT - 10);
    
    // Request next frame
    requestAnimationFrame(() => this.gameLoop());
  }
  
  // Update game state
  updateGame(deltaTime: number) {
    // Update player
    this.player.update(deltaTime);

    // Update resource gathering
    this.player.updateResourceGathering(deltaTime);

    // Update resources refill
    for (const resource of this.resources) {
      resource.updateRefill(deltaTime);
    }

    // Update camera to follow player
    this.camera.update(this.player.position);

    // Update cursor based on what's under it
    this.updateMouseCursor();
  }

  // Update cursor based on what's under it
  updateMouseCursor() {
    // Check if player is already moving
    if (this.player.isMoving) {
      this.canvas.style.cursor = 'not-allowed';
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = this.lastMouseX - rect.left;
    const mouseY = this.lastMouseY - rect.top;

    // Convert to world coordinates
    const cameraOffset = this.camera.getOffset();
    const worldX = mouseX + cameraOffset.x;
    const worldY = mouseY + cameraOffset.y;

    // Check if mouse is over a resource
    const resourceUnderMouse = this.findResourceAtPosition(worldX, worldY);

    if (resourceUnderMouse && !resourceUnderMouse.isGathered) {
      // Check if player is close enough to gather
      const distance = this.player.position.distanceTo(resourceUnderMouse.position);

      if (distance <= RESOURCE_GATHER_DISTANCE) {
        // Player can gather this resource
        this.canvas.style.cursor = 'pointer';
      } else {
        // Resource is too far away
        this.canvas.style.cursor = 'default';
      }
    } else {
      // Not over a gatherable resource
      this.canvas.style.cursor = 'default';
    }
  }
  
  draw() {
    // Get camera offset for drawing
    const cameraOffset = this.camera.getOffset();
    
    // Draw the map
    this.drawMap(cameraOffset);
    
    // Draw resources
    this.drawResources(cameraOffset);
    
    // Draw other players
    drawPlayers(this.ctx, cameraOffset, this.player.playerId);
    
    // Draw the player
    this.player.draw(this.ctx);
    
    // Draw target cross if player is moving
    if (this.player.isMoving && this.player.targetPosition) {
      this.drawTargetCross(this.player.targetPosition, cameraOffset);
    } else if (this.lastClickPosition) {
      // Draw the last click position cross
      this.drawTargetCross(this.lastClickPosition, cameraOffset);
    }
    
    // Draw UI elements
    this.drawUserInterface();
    
    // Draw minimap
    this.drawMinimap();
    
    // Draw popups if needed
    if (this.showControlsPopup) {
      this.drawControlsPopup();
    }
    
    if (this.showSettingsPopup) {
      this.drawSettingsPopup();
    }
  }
  
  // Draw UI elements
  drawUserInterface() {
    // Draw player inventory
    this.player.drawInventory(this.ctx);

    // Draw gathering UI if gathering
    this.player.drawGatheringUI(this.ctx);

    // Draw UI buttons
    this.drawControlsButton();
    this.drawSettingsButton();
  }
  
  isPointInControlsButton(x: number, y: number): boolean {
    const buttonX = 10;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;

    return x >= buttonX && x <= buttonX + buttonWidth && y >= buttonY && y <= buttonY + buttonHeight;
  }

  isPointInSettingsButton(x: number, y: number): boolean {
    const buttonX = 120;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;

    return x >= buttonX && x <= buttonX + buttonWidth && y >= buttonY && y <= buttonY + buttonHeight;
  }

  isPointInControlsPopup(x: number, y: number): boolean {
    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 150;
    const popupWidth = 400;
    const popupHeight = 300;

    return x >= popupX && x <= popupX + popupWidth && y >= popupY && y <= popupY + popupHeight;
  }

  isPointInSettingsPopup(x: number, y: number): boolean {
    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 200;
    const popupWidth = 400;
    const popupHeight = 350;

    return x >= popupX && x <= popupX + popupWidth && y >= popupY && y <= popupY + popupHeight;
  }

  handleLanguageButtonClick(x: number, y: number): boolean {
    if (!this.showSettingsPopup) return false;
    
    // Buton boyutları ve konumları (drawSettingsPopup ile aynı olmalı)
    const buttonWidth = 80; 
    const buttonHeight = 30;
    const startY = CANVAS_HEIGHT / 2 - 200 + 60 - this.popupScrollPosition + 30;
    
    // İngilizce butonu kontrolü
    if (x >= CANVAS_WIDTH / 2 - buttonWidth - 20 && x <= CANVAS_WIDTH / 2 - 20 && 
        y >= startY && y <= startY + buttonHeight) {
      this.languageManager.loadTranslations('en');
      console.log("Dil İngilizce olarak değiştirildi");
      return true;
    }
    
    // Türkçe butonu kontrolü
    if (x >= CANVAS_WIDTH / 2 + 20 && x <= CANVAS_WIDTH / 2 + buttonWidth + 20 && 
        y >= startY && y <= startY + buttonHeight) {
      this.languageManager.loadTranslations('tr');
      console.log("Dil Türkçe olarak değiştirildi");
      return true;
    }
    
    return false;
  }
  
  // Renk seçimi butonlarını kontrol et
  handleColorButtonClick(x: number, y: number): boolean {
    if (!this.showSettingsPopup) return false;
    
    // Renk butonlarının boyutları ve konumları (drawSettingsPopup ile aynı olmalı)
    const buttonHeight = 30;
    const startY = CANVAS_HEIGHT / 2 - 200 + 60 - this.popupScrollPosition + 30;
    
    const colorSize = 24; // Daha küçük renk daireleri
    const colorSpacing = 12;
    const colorStartX = CANVAS_WIDTH / 2 - ((colorSize * PLAYER_COLORS.length) + (colorSpacing * (PLAYER_COLORS.length - 1))) / 2;
    const colorStartY = startY + buttonHeight + 70;
    
    // Her renk butonu için kontrol et - tek satırda yuvarlak
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const x1 = colorStartX + (i * (colorSize + colorSpacing));
      const y1 = colorStartY;
      const centerX = x1 + colorSize/2;
      const centerY = y1 + colorSize/2;
      
      // Daire içinde mi kontrol et
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      if (distance <= colorSize/2) {
        // Rengi değiştir
        this.player.setColor(PLAYER_COLORS[i].value);
        console.log(`Oyuncu rengi ${PLAYER_COLORS[i].name} olarak değiştirildi`);
        return true;
      }
    }
    
    // İsim değiştirme butonunu kontrol et
    const changeNameBtnWidth = 150;
    const changeNameBtnHeight = 30;
    const changeNameBtnX = CANVAS_WIDTH / 2 - changeNameBtnWidth / 2;
    const changeNameBtnY = startY + buttonHeight + 110;
    
    if (x >= changeNameBtnX && x <= changeNameBtnX + changeNameBtnWidth &&
        y >= changeNameBtnY && y <= changeNameBtnY + changeNameBtnHeight) {
      this.showDisplayNameDialog();
      return true;
    }
    
    return false;
  }
  
  // Scroll butonlarını kontrol et
  handleSettingsScrollButtonClick(x: number, y: number): boolean {
    if (!this.showSettingsPopup) return false;
    
    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 200;
    const popupWidth = 400;
    
    // Yukarı scroll düğmesi
    const scrollUpX = popupX + popupWidth - 30;
    const scrollUpY = popupY + 60;
    
    if (x >= scrollUpX - 15 && x <= scrollUpX + 15 && 
        y >= scrollUpY && y <= scrollUpY + 15) {
      // Yukarı scroll
      this.popupScrollPosition = Math.max(0, this.popupScrollPosition - 30);
      return true;
    }
    
    // Aşağı scroll düğmesi
    const scrollDownX = popupX + popupWidth - 30;
    const scrollDownY = popupY + popupWidth - 30;
    
    if (x >= scrollDownX - 15 && x <= scrollDownX + 15 && 
        y >= scrollDownY - 15 && y <= scrollDownY) {
      // Aşağı scroll
      this.popupScrollPosition = Math.min(200, this.popupScrollPosition + 30);
      return true;
    }
    
    return false;
  }
  
  drawControlsButton(): void {
    const buttonX = 10;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;

    // Draw button background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

    // Draw button border
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

    // Draw button text
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(t('game.ui.controls'), buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
  }

  drawSettingsButton(): void {
    const buttonX = 120;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;

    // Draw button background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

    // Draw button border
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

    // Draw button text
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(t('game.ui.settings'), buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
  }

  drawMap(cameraOffset: Vector2) {
    // Draw the cliff background (non-playable area)
    this.drawTiledBackground(cliffImage, cameraOffset);

    // Draw the grass playable area
    this.drawPlayableArea(grassImage, cameraOffset);
  }

  drawResources(cameraOffset: Vector2) {
    for (const resource of this.resources) {
      resource.draw(this.ctx, cameraOffset, this.player.position);
    }
  }

  drawTiledBackground(image: HTMLImageElement, cameraOffset: Vector2) {
    const tileSize = 96; // Increased from 64 to 96 pixels
    const overlap = 1; // Add 1 pixel overlap to eliminate grid lines

    // Calculate the visible area in tile coordinates
    const startTileX = Math.floor(cameraOffset.x / tileSize);
    const startTileY = Math.floor(cameraOffset.y / tileSize);
    const endTileX = Math.ceil((cameraOffset.x + CANVAS_WIDTH) / tileSize);
    const endTileY = Math.ceil((cameraOffset.y + CANVAS_HEIGHT) / tileSize);

    // Draw the tiles
    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        const screenX = x * tileSize - cameraOffset.x;
        const screenY = y * tileSize - cameraOffset.y;

        this.ctx.drawImage(image, screenX, screenY, tileSize + overlap, tileSize + overlap);
      }
    }
  }

  drawPlayableArea(image: HTMLImageElement, cameraOffset: Vector2) {
    // Convert world coordinates to screen coordinates
    const screenLeft = Math.max(0, BORDER_WIDTH - cameraOffset.x);
    const screenTop = Math.max(0, BORDER_WIDTH - cameraOffset.y);
    const screenRight = Math.min(CANVAS_WIDTH, MAP_WIDTH - BORDER_WIDTH - cameraOffset.x);
    const screenBottom = Math.min(CANVAS_HEIGHT, MAP_HEIGHT - BORDER_WIDTH - cameraOffset.y);

    // Calculate the width and height of the playable area
    const width = screenRight - screenLeft;
    const height = screenBottom - screenTop;

    if (width <= 0 || height <= 0) return;

    // Create a clipping region for the playable area
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(screenLeft, screenTop, width, height);
    this.ctx.clip();

    // Draw the grass tiles within the playable area
    const tileSize = 96; // Increased from 64 to 96 pixels
    const overlap = 1; // Add 1 pixel overlap to eliminate grid lines

    // Calculate the visible area in tile coordinates
    const startTileX = Math.floor((cameraOffset.x - tileSize) / tileSize);
    const startTileY = Math.floor((cameraOffset.y - tileSize) / tileSize);
    const endTileX = Math.ceil((cameraOffset.x + CANVAS_WIDTH + tileSize) / tileSize);
    const endTileY = Math.ceil((cameraOffset.y + CANVAS_HEIGHT + tileSize) / tileSize);

    // Draw the tiles
    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        const screenX = x * tileSize - cameraOffset.x;
        const screenY = y * tileSize - cameraOffset.y;

        this.ctx.drawImage(image, screenX, screenY, tileSize + overlap, tileSize + overlap);
      }
    }

    this.ctx.restore();
  }

  drawTargetCross(position: Vector2, cameraOffset: Vector2) {
    // Convert world position to screen position
    const screenX = position.x - cameraOffset.x;
    const screenY = position.y - cameraOffset.y;

    // Set cross style
    this.ctx.strokeStyle = 'yellow';
    this.ctx.lineWidth = 1;

    // Draw cross
    const crossSize = 5;

    // Draw X shape
    // First diagonal line (top-left to bottom-right)
    this.ctx.beginPath();
    this.ctx.moveTo(screenX - crossSize, screenY - crossSize);
    this.ctx.lineTo(screenX + crossSize, screenY + crossSize);
    this.ctx.stroke();

    // Second diagonal line (top-right to bottom-left)
    this.ctx.beginPath();
    this.ctx.moveTo(screenX + crossSize, screenY - crossSize);
    this.ctx.lineTo(screenX - crossSize, screenY + crossSize);
    this.ctx.stroke();
  }

  drawMinimap() {
    const minimapX = MINIMAP_PADDING;
    const minimapY = CANVAS_HEIGHT - MINIMAP_SIZE - MINIMAP_PADDING;

    // Calculate scale factors
    const scaleX = MINIMAP_SIZE / MAP_WIDTH;
    const scaleY = MINIMAP_SIZE / MAP_HEIGHT;

    // Draw minimap background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw playable area
    this.ctx.fillStyle = 'rgba(0, 100, 0, 0.5)';
    this.ctx.fillRect(
      minimapX + BORDER_WIDTH * scaleX,
      minimapY + BORDER_WIDTH * scaleY,
      (MAP_WIDTH - 2 * BORDER_WIDTH) * scaleX,
      (MAP_HEIGHT - 2 * BORDER_WIDTH) * scaleY
    );

    // Draw resources on minimap
    for (const resource of this.resources) {
      resource.drawOnMinimap(this.ctx, minimapX, minimapY, scaleX, scaleY);
    }

    // Draw player on minimap
    const playerMinimapX = minimapX + this.player.position.x * scaleX;
    const playerMinimapY = minimapY + this.player.position.y * scaleY;

    this.ctx.fillStyle = '#3498db'; // Blue color for player
    this.ctx.beginPath();
    this.ctx.arc(playerMinimapX, playerMinimapY, 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw viewport rectangle on minimap
    const viewportWidth = CANVAS_WIDTH * scaleX;
    const viewportHeight = CANVAS_HEIGHT * scaleY;
    const viewportX = minimapX + this.player.position.x * scaleX - viewportWidth / 2;
    const viewportY = minimapY + this.player.position.y * scaleY - viewportHeight / 2;

    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

    // Draw minimap border
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(minimapX, minimapY, MINIMAP_SIZE, MINIMAP_SIZE);
  }

  drawControlsPopup(): void {
    if (!this.showControlsPopup) return;

    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 150;
    const popupWidth = 400;
    const popupHeight = 300;

    // Draw semi-transparent background overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw popup background
    this.ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
    this.ctx.fillRect(popupX, popupY, popupWidth, popupHeight);

    // Draw popup border
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(popupX, popupY, popupWidth, popupHeight);

    // Draw popup title
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(t('game.controls.title'), CANVAS_WIDTH / 2, popupY + 20);

    // Set up scrollable content area
    const contentX = popupX + 30;
    const contentY = popupY + 60;
    const contentWidth = popupWidth - 80;
    const contentHeight = popupHeight - 120;

    // Draw content
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    const instructions = [
      t('game.controls.movement'),
      t('game.controls.gathering'),
      '',
      t('game.resources.title'),
      t('game.resources.common'),
      t('game.resources.uncommon'),
      t('game.resources.rare'),
      t('game.resources.epic'),
      t('game.resources.legendary'),
      '',
      t('game.tips.title'),
      t('game.tips.noMovement'),
      t('game.tips.cursorChange'),
      t('game.tips.refill'),
      t('game.tips.minimap'),
      t('game.tips.resourceLimits'),
      t('game.tips.shardLimit'),
      t('game.tips.inventory')
    ];

    let y = contentY - this.popupScrollPosition;
    const lineHeight = 25;

    // Create clipping region for scrollable content
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(contentX, contentY, contentWidth, contentHeight);
    this.ctx.clip();

    // Draw each line of instructions
    for (const line of instructions) {
      if (y >= contentY - lineHeight && y <= contentY + contentHeight) {
        if (line === '') {
          // Empty line for spacing
          y += lineHeight / 2;
        } else if (line === t('game.resources.title') || line === t('game.tips.title')) {
          // Section headers
          this.ctx.font = 'bold 14px Arial';
          this.ctx.fillText(line, contentX, y);
          this.ctx.font = '14px Arial';
          y += lineHeight;
        } else {
          // Regular lines
          this.ctx.fillText(line, contentX, y);
          y += lineHeight;
        }
      } else {
        // Skip drawing lines outside the visible area
        if (line === '') {
          y += lineHeight / 2;
        } else {
          y += lineHeight;
        }
      }
    }

    // Restore drawing context
    this.ctx.restore();

    // Draw scroll instructions
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(t('game.controls.scroll'), CANVAS_WIDTH / 2, popupY + popupHeight - 50);

    // Draw close instructions
    this.ctx.fillText(t('game.controls.close'), CANVAS_WIDTH / 2, popupY + popupHeight - 30);
  }

  drawSettingsPopup(): void {
    if (!this.showSettingsPopup) return;

    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 200;
    const popupWidth = 400;
    const popupHeight = 350;

    // Draw semi-transparent background overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw popup background
    this.ctx.fillStyle = 'rgba(50, 50, 50, 0.9)';
    this.ctx.fillRect(popupX, popupY, popupWidth, popupHeight);

    // Draw popup border
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(popupX, popupY, popupWidth, popupHeight);

    // Draw popup title
    this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(t('game.settings.title'), CANVAS_WIDTH / 2, popupY + 20);

    // Scroll düğmeleri
    const scrollUpX = popupX + popupWidth - 30;
    const scrollUpY = popupY + 60;
    const scrollDownX = popupX + popupWidth - 30;
    const scrollDownY = popupY + popupWidth - 30;
    
    // Yukarı scroll düğmesi
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.beginPath();
    this.ctx.moveTo(scrollUpX, scrollUpY + 15);
    this.ctx.lineTo(scrollUpX - 15, scrollUpY);
    this.ctx.lineTo(scrollUpX + 15, scrollUpY);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Aşağı scroll düğmesi
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.beginPath();
    this.ctx.moveTo(scrollDownX, scrollDownY - 15);
    this.ctx.lineTo(scrollDownX - 15, scrollDownY);
    this.ctx.lineTo(scrollDownX + 15, scrollDownY);
    this.ctx.closePath();
    this.ctx.fill();

    // Scroll edilebilir içerik alanı
    const contentY = popupY + 60 - this.popupScrollPosition;
    
    // İçerik alanını kırp
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(popupX + 10, popupY + 50, popupWidth - 20, popupHeight - 60);
    this.ctx.clip();

    // Draw language selection
    this.ctx.font = '18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(t('game.settings.language'), CANVAS_WIDTH / 2, contentY);

    // Draw language buttons
    const buttonWidth = 80; 
    const buttonHeight = 30;
    const startY = contentY + 30;

    // English button
    const isEnglish = this.languageManager.getCurrentLanguage() === 'en';
    this.ctx.fillStyle = isEnglish ? 'rgba(0, 100, 200, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    this.ctx.fillRect(CANVAS_WIDTH / 2 - buttonWidth - 20, startY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(CANVAS_WIDTH / 2 - buttonWidth - 20, startY, buttonWidth, buttonHeight);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('EN', CANVAS_WIDTH / 2 - 20, startY + buttonHeight / 2);

    // Turkish button
    const isTurkish = this.languageManager.getCurrentLanguage() === 'tr';
    this.ctx.fillStyle = isTurkish ? 'rgba(0, 100, 200, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    this.ctx.fillRect(CANVAS_WIDTH / 2 + 20, startY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(CANVAS_WIDTH / 2 + 20, startY, buttonWidth, buttonHeight);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('TR', CANVAS_WIDTH / 2 + 20 + buttonWidth / 2, startY + buttonHeight / 2);

    // Renk seçimi başlığı
    this.ctx.font = '18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(t('game.settings.playerColor'), CANVAS_WIDTH / 2, startY + buttonHeight + 30);

    // Renk butonlarını çiz - tek satırda yuvarlak
    const colorSize = 24; // Daha küçük renk daireleri
    const colorStartX = CANVAS_WIDTH / 2 - ((colorSize * PLAYER_COLORS.length) + (12 * (PLAYER_COLORS.length - 1))) / 2;
    const colorStartY = startY + buttonHeight + 70;

    PLAYER_COLORS.forEach((color, index) => {
      const x = colorStartX + (index * (colorSize + 12));
      const y = colorStartY;

      // Renk dairesini çiz
      this.ctx.beginPath();
      this.ctx.arc(x + colorSize/2, y + colorSize/2, colorSize/2, 0, Math.PI * 2);
      this.ctx.fillStyle = color.value;
      this.ctx.fill();
      
      // Seçili renk için çerçeve çiz
      if (this.player.color === color.value) {
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(x + colorSize/2, y + colorSize/2, colorSize/2 + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x + colorSize/2, y + colorSize/2, colorSize/2, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    });

    // Display Name Section
    this.ctx.font = '18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(t('game.settings.displayName'), CANVAS_WIDTH / 2, colorStartY + 60);

    // Draw current name
    const currentName = this.player.displayName || '';
    this.ctx.font = '16px Arial';
    this.ctx.fillStyle = '#aaaaaa';
    this.ctx.fillText(currentName, CANVAS_WIDTH / 2, colorStartY + 90);

    // Draw change name button
    const changeNameBtnWidth = 150;
    const changeNameBtnHeight = 30;
    const changeNameBtnX = CANVAS_WIDTH / 2 - changeNameBtnWidth / 2;
    const changeNameBtnY = colorStartY + 110;

    this.ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    this.ctx.fillRect(changeNameBtnX, changeNameBtnY, changeNameBtnWidth, changeNameBtnHeight);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(changeNameBtnX, changeNameBtnY, changeNameBtnWidth, changeNameBtnHeight);

    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(t('game.settings.changeName'), changeNameBtnX + changeNameBtnWidth / 2, changeNameBtnY + changeNameBtnHeight / 2);
    
    // Scroll çubuğunu çiz
    const totalContentHeight = 350; // Tahmini içerik yüksekliği
    const visibleHeight = popupHeight - 60;
    const scrollBarHeight = Math.max(50, (visibleHeight / totalContentHeight) * visibleHeight);
    const scrollBarY = popupY + 50 + (this.popupScrollPosition / totalContentHeight) * visibleHeight;
    
    this.ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
    this.ctx.fillRect(popupX + popupWidth - 15, popupY + 50, 5, visibleHeight);
    
    this.ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    this.ctx.fillRect(popupX + popupWidth - 15, scrollBarY, 5, scrollBarHeight);
    
    // Restore clipping
    this.ctx.restore();
  }
  
  // Show a dialog to change the display name
  showDisplayNameDialog(): void {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    
    // Create dialog box
    const dialog = document.createElement('div');
    dialog.style.width = '300px';
    dialog.style.padding = '20px';
    dialog.style.backgroundColor = '#333';
    dialog.style.borderRadius = '5px';
    dialog.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    
    // Create title
    const title = document.createElement('h2');
    title.textContent = t('game.settings.changeName');
    title.style.color = 'white';
    title.style.marginTop = '0';
    title.style.textAlign = 'center';
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('game.settings.enterName');
    input.value = this.player.displayName || '';
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.marginTop = '15px';
    input.style.marginBottom = '15px';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = '#444';
    input.style.color = 'white';
    input.style.border = '1px solid #555';
    input.style.borderRadius = '3px';
    input.style.fontSize = '16px';
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.textContent = t('game.settings.save');
    saveButton.style.padding = '10px 20px';
    saveButton.style.backgroundColor = '#2980b9';
    saveButton.style.color = 'white';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '3px';
    saveButton.style.cursor = 'pointer';
    saveButton.style.fontSize = '16px';
    saveButton.style.width = '100%';
    saveButton.style.marginTop = '10px';
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.backgroundColor = '#7f8c8d';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontSize = '16px';
    cancelButton.style.width = '100%';
    cancelButton.style.marginTop = '10px';
    
    // Add event listeners
    saveButton.addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) {
        this.player.setDisplayName(newName);
        document.body.removeChild(overlay);
      } else {
        // Highlight the input field if empty
        input.style.border = '2px solid #e74c3c';
        setTimeout(() => {
          input.style.border = '1px solid #555';
        }, 1000);
      }
    });
    
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    // Handle Enter key press
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveButton.click();
      }
    });
    
    // Add elements to the dialog
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);
    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    
    // Add dialog to the document
    document.body.appendChild(overlay);
    
    // Focus the input field
    setTimeout(() => {
      input.focus();
      input.select(); // Select the default text to make it easier to replace
    }, 100);
  }

  // Show a welcome dialog for new players to set their display name
  showWelcomeNameDialog(): void {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    
    // Create dialog box
    const dialog = document.createElement('div');
    dialog.style.width = '400px';
    dialog.style.padding = '20px';
    dialog.style.backgroundColor = '#333';
    dialog.style.borderRadius = '5px';
    dialog.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    
    // Create title
    const title = document.createElement('h2');
    title.textContent = t('game.settings.changeName');
    title.style.color = 'white';
    title.style.marginTop = '0';
    title.style.textAlign = 'center';
    
    // Create welcome message
    const welcomeMsg = document.createElement('p');
    welcomeMsg.textContent = t('game.settings.welcome');
    welcomeMsg.style.color = 'white';
    welcomeMsg.style.textAlign = 'center';
    welcomeMsg.style.marginBottom = '20px';
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('game.settings.enterName');
    input.value = this.player.displayName || '';
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.marginTop = '15px';
    input.style.marginBottom = '20px';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = '#444';
    input.style.color = 'white';
    input.style.border = '1px solid #555';
    input.style.borderRadius = '3px';
    input.style.fontSize = '16px';
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.textContent = t('game.settings.save');
    saveButton.style.padding = '10px 20px';
    saveButton.style.backgroundColor = '#2980b9';
    saveButton.style.color = 'white';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '3px';
    saveButton.style.cursor = 'pointer';
    saveButton.style.fontSize = '16px';
    saveButton.style.width = '100%';
    saveButton.style.marginTop = '10px';
    
    // Add event listeners
    saveButton.addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) {
        this.player.setDisplayName(newName);
        document.body.removeChild(overlay);
      } else {
        // Highlight the input field if empty
        input.style.border = '2px solid #e74c3c';
        setTimeout(() => {
          input.style.border = '1px solid #555';
        }, 1000);
      }
    });
    
    // Handle Enter key press
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveButton.click();
      }
    });
    
    // Add elements to the dialog
    dialog.appendChild(title);
    dialog.appendChild(welcomeMsg);
    dialog.appendChild(input);
    dialog.appendChild(saveButton);
    overlay.appendChild(dialog);
    
    // Add dialog to the document
    document.body.appendChild(overlay);
    
    // Focus the input field
    setTimeout(() => {
      input.focus();
      input.select(); // Select the default text to make it easier to replace
    }, 100);
  }
}

// Resource images
const resourceT1Image = new Image();
resourceT1Image.src = ASSET_PATHS.RESOURCE_T1;

const resourceT2Image = new Image();
resourceT2Image.src = ASSET_PATHS.RESOURCE_T2;

const resourceT3Image = new Image();
resourceT3Image.src = ASSET_PATHS.RESOURCE_T3;

const resourceT4Image = new Image();
resourceT4Image.src = ASSET_PATHS.RESOURCE_T4;

const resourceT5Image = new Image();
resourceT5Image.src = ASSET_PATHS.RESOURCE_T5;

// Add error handlers for images
grassImage.onerror = () => {
  console.error('Failed to load grass texture');
  // Create a default grass texture
  createDefaultGrassTexture();
};

cliffImage.onerror = () => {
  console.error('Failed to load cliff texture');
  // Create a default cliff texture
  createDefaultCliffTexture();
};

resourceT1Image.onerror = () => {
  console.error('Failed to load resource T1 texture');
  createResourceTexture('#F7DC6F', '#F2C464', resourceT1Image);
};

resourceT2Image.onerror = () => {
  console.error('Failed to load resource T2 texture');
  createResourceTexture('#3498db', '#2E4053', resourceT2Image);
};

resourceT3Image.onerror = () => {
  console.error('Failed to load resource T3 texture');
  createResourceTexture('#9b59b6', '#7A288A', resourceT3Image);
};

resourceT4Image.onerror = () => {
  console.error('Failed to load resource T4 texture');
  createResourceTexture('#FFC107', '#FF9900', resourceT4Image);
};

resourceT5Image.onerror = () => {
  console.error('Failed to load resource T5 texture');
  createResourceTexture('#E74C3C', '#C0392B', resourceT5Image);
};
