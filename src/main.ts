// Game constants
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;
const PLAYER_SPEED = 200; // pixels per second
const PLAYER_SIZE = 10;
const BORDER_WIDTH = 50;
const MINIMAP_SIZE = 150; // Size of the minimap
const MINIMAP_PADDING = 10; // Padding from the edge of the screen
const RESOURCE_SIZE = 40; // Size of resource nodes
const RESOURCE_GATHER_DISTANCE = 60; // Distance at which player can gather resources
const RESOURCE_COUNT = 50; // Number of resources to spawn

// Resource shard values and limits
const MAX_TOTAL_SHARDS = 500; // Reduced from 1000 to 500
const MAX_TIER3_RESOURCES = 2;
const MAX_TIER2_RESOURCES = 5;
const RESOURCE_SHARD_VALUES = {
  TIER1: 10,  // Common
  TIER2: 25,  // Uncommon
  TIER3: 100  // Rare
};

// Resource rarity colors based on Dota 2
const RESOURCE_COLORS = {
  // Common - bluish-gray
  COMMON: '#b0c3d9',
  // Uncommon - light blue
  UNCOMMON: '#5e98d9',
  // Rare - blue
  RARE: '#4b69ff',
};

// Game assets
const grassImage = new Image();
grassImage.src = '/assets/grass.png';

const cliffImage = new Image();
cliffImage.src = '/assets/cliff.png';

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

// Create default textures if loading fails
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

// Language manager for translations
class LanguageManager {
  private static instance: LanguageManager;
  private translations: Record<string, any> = {};
  private currentLanguage: string = 'tr';
  private onLanguageChangeCallbacks: Array<() => void> = [];

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): LanguageManager {
    if (!LanguageManager.instance) {
      LanguageManager.instance = new LanguageManager();
    }
    return LanguageManager.instance;
  }

  public async init(): Promise<void> {
    // Load saved language preference or default to English
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      this.currentLanguage = savedLanguage;
    }

    // Load translations for current language
    await this.loadTranslations(this.currentLanguage);
  }

  public async loadTranslations(language: string): Promise<void> {
    try {
      const response = await fetch(`/locales/${language}/translation.json`);
      if (!response.ok) {
        console.error(`Failed to load translations for ${language}`);
        // If failed and not English, try to fall back to English
        if (language !== 'en') {
          await this.loadTranslations('en');
        }
        return;
      }
      
      this.translations = await response.json();
      this.currentLanguage = language;
      localStorage.setItem('language', language);
      
      // Notify all subscribers about language change
      this.notifyLanguageChanged();
    } catch (error) {
      console.error('Error loading translations:', error);
      // If error and not English, try to fall back to English
      if (language !== 'en') {
        await this.loadTranslations('en');
      }
    }
  }

  public getTranslation(key: string): string {
    // Split the key by dots to navigate the nested structure
    const keys = key.split('.');
    let result = this.translations;

    // Navigate through the keys
    for (const k of keys) {
      if (result && result[k] !== undefined) {
        result = result[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key; // Return the key itself as fallback
      }
    }

    // Return the translation or the key if not found
    return typeof result === 'string' ? result : key;
  }

  public getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  public onLanguageChange(callback: () => void): void {
    this.onLanguageChangeCallbacks.push(callback);
  }

  private notifyLanguageChanged(): void {
    for (const callback of this.onLanguageChangeCallbacks) {
      callback();
    }
  }
}

// Shorthand function for getting translations
function t(key: string): string {
  return LanguageManager.getInstance().getTranslation(key);
}

// Game classes
class Vector2 {
  constructor(public x: number, public y: number) {}

  distanceTo(other: Vector2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  normalize(): Vector2 {
    const length = Math.sqrt(this.x * this.x + this.y * this.y);
    if (length === 0) return new Vector2(0, 0);
    return new Vector2(this.x / length, this.y / length);
  }

  multiply(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }
}

enum ResourceRarity {
  COMMON = 0,
  UNCOMMON = 1,
  RARE = 2
}

class Resource {
  position: Vector2;
  rarity: ResourceRarity;
  isBeingGathered: boolean = false;
  gatherProgress: number = 0;
  gatherTime: number; // Time in seconds to gather this resource
  shardValue: number;
  isGathered: boolean = false;
  refillTime: number; // Time in seconds until resource refills
  refillProgress: number = 0;
  
  constructor(x: number, y: number, rarity: ResourceRarity) {
    this.position = new Vector2(x, y);
    this.rarity = rarity;
    
    // Set gather time based on rarity (1, 2, or 3 seconds)
    this.gatherTime = rarity + 1;
    
    // Set shard value based on rarity
    switch (rarity) {
      case ResourceRarity.COMMON:
        this.shardValue = RESOURCE_SHARD_VALUES.TIER1;
        break;
      case ResourceRarity.UNCOMMON:
        this.shardValue = RESOURCE_SHARD_VALUES.TIER2;
        break;
      case ResourceRarity.RARE:
        this.shardValue = RESOURCE_SHARD_VALUES.TIER3;
        break;
      default:
        this.shardValue = RESOURCE_SHARD_VALUES.TIER1;
    }
    
    // Set refill time equal to shard value (in seconds)
    this.refillTime = this.shardValue;
  }
  
  getColor(): string {
    switch (this.rarity) {
      case ResourceRarity.COMMON:
        return RESOURCE_COLORS.COMMON;
      case ResourceRarity.UNCOMMON:
        return RESOURCE_COLORS.UNCOMMON;
      case ResourceRarity.RARE:
        return RESOURCE_COLORS.RARE;
      default:
        return RESOURCE_COLORS.COMMON;
    }
  }
  
  startGathering(): void {
    if (this.isGathered) return; // Can't gather if already gathered
    this.isBeingGathered = true;
    this.gatherProgress = 0;
  }
  
  stopGathering(): void {
    this.isBeingGathered = false;
    this.gatherProgress = 0;
  }
  
  updateGathering(deltaTime: number): boolean {
    if (!this.isBeingGathered || this.isGathered) return false;
    
    this.gatherProgress += deltaTime;
    
    // Return true if gathering is complete
    if (this.gatherProgress >= this.gatherTime) {
      this.isBeingGathered = false;
      this.isGathered = true;
      this.gatherProgress = 0;
      return true;
    }
    
    return false;
  }
  
  updateRefill(deltaTime: number): void {
    if (!this.isGathered) return;
    
    this.refillProgress += deltaTime;
    
    // Check if resource should refill
    if (this.refillProgress >= this.refillTime) {
      this.isGathered = false;
      this.refillProgress = 0;
    }
  }
  
  // Check if player is close enough to gather this resource
  isPlayerInRange(playerPosition: Vector2): boolean {
    return this.canBeGathered() && this.position.distanceTo(playerPosition) <= RESOURCE_GATHER_DISTANCE;
  }
  
  canBeGathered(): boolean {
    return !this.isGathered && !this.isBeingGathered;
  }
  
  draw(ctx: CanvasRenderingContext2D, cameraOffset: Vector2, playerPosition: Vector2): void {
    // Convert world position to screen position
    const screenX = this.position.x - cameraOffset.x;
    const screenY = this.position.y - cameraOffset.y;
    
    // Check if resource is visible on screen
    if (
      screenX + RESOURCE_SIZE < 0 ||
      screenX - RESOURCE_SIZE > CANVAS_WIDTH ||
      screenY + RESOURCE_SIZE < 0 ||
      screenY - RESOURCE_SIZE > CANVAS_HEIGHT
    ) {
      return;
    }
    
    // Check if resource is gathered
    if (!this.isGathered) {
      // Draw resource as a square
      ctx.fillStyle = this.getColor();
      ctx.fillRect(
        screenX - RESOURCE_SIZE / 2,
        screenY - RESOURCE_SIZE / 2,
        RESOURCE_SIZE,
        RESOURCE_SIZE
      );
      
      // Draw border - yellow if player is in range to gather, black otherwise
      const isInRange = this.isPlayerInRange(playerPosition);
      ctx.strokeStyle = isInRange ? '#FFD700' : 'black';
      ctx.lineWidth = isInRange ? 3 : 2;
      ctx.strokeRect(
        screenX - RESOURCE_SIZE / 2,
        screenY - RESOURCE_SIZE / 2,
        RESOURCE_SIZE,
        RESOURCE_SIZE
      );
      
      // Draw gathering progress if being gathered
      if (this.isBeingGathered) {
        const progressPercentage = this.gatherProgress / this.gatherTime;
        
        // Draw progress bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(
          screenX - RESOURCE_SIZE / 2,
          screenY - RESOURCE_SIZE / 2 - 10,
          RESOURCE_SIZE,
          5
        );
        
        // Draw progress bar
        ctx.fillStyle = 'white';
        ctx.fillRect(
          screenX - RESOURCE_SIZE / 2,
          screenY - RESOURCE_SIZE / 2 - 10,
          RESOURCE_SIZE * progressPercentage,
          5
        );
        
        // Draw rarity level indicator
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          `Level ${this.rarity + 1}`,
          screenX,
          screenY - RESOURCE_SIZE / 2 - 15
        );
      }
    }
    
    // Draw refill progress if gathered
    if (this.isGathered) {
      const refillPercentage = this.refillProgress / this.refillTime;
      
      // Draw refill timer
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const timeLeft = Math.ceil(this.refillTime - this.refillProgress);
      ctx.fillText(
        `Refills in ${timeLeft}s`,
        screenX,
        screenY
      );
      
      // Draw refill progress bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(
        screenX - RESOURCE_SIZE / 2,
        screenY + 10,
        RESOURCE_SIZE,
        5
      );
      
      ctx.fillStyle = 'white';
      ctx.fillRect(
        screenX - RESOURCE_SIZE / 2,
        screenY + 10,
        RESOURCE_SIZE * refillPercentage,
        5
      );
    }
  }
  
  drawOnMinimap(ctx: CanvasRenderingContext2D, minimapX: number, minimapY: number, scaleX: number, scaleY: number): void {
    const resourceMinimapX = minimapX + this.position.x * scaleX;
    const resourceMinimapY = minimapY + this.position.y * scaleY;
    
    // Only draw on minimap if not gathered
    if (!this.isGathered) {
      // Draw a small dot for the resource
      ctx.fillStyle = this.getColor();
      ctx.beginPath();
      ctx.arc(resourceMinimapX, resourceMinimapY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Player {
  position: Vector2;
  targetPosition: Vector2 | null = null;
  isMoving = false;
  currentResource: Resource | null = null;
  isGathering = false;
  inventory: { [key in ResourceRarity]: number } = {
    [ResourceRarity.COMMON]: 0,
    [ResourceRarity.UNCOMMON]: 0,
    [ResourceRarity.RARE]: 0
  };

  constructor(x: number, y: number) {
    this.position = new Vector2(x, y);
  }

  setTarget(x: number, y: number) {
    // Don't allow movement while gathering
    if (this.isGathering) return;
    
    this.targetPosition = new Vector2(x, y);
    this.isMoving = true;
    
    // Stop gathering if player moves
    if (this.currentResource) {
      this.currentResource.stopGathering();
      this.currentResource = null;
      this.isGathering = false;
    }
  }

  update(deltaTime: number) {
    // Don't update movement if gathering
    if (this.isGathering) return;
    
    if (!this.isMoving || !this.targetPosition) return;

    const distance = this.position.distanceTo(this.targetPosition);
    
    if (distance < 5) {
      // Player has reached the target
      this.position = this.targetPosition;
      this.isMoving = false;
      this.targetPosition = null;
      return;
    }

    // Calculate direction vector
    const direction = new Vector2(
      this.targetPosition.x - this.position.x,
      this.targetPosition.y - this.position.y
    ).normalize();

    // Calculate movement distance for this frame
    const moveDistance = PLAYER_SPEED * deltaTime;
    
    // Calculate new position
    const moveVector = direction.multiply(moveDistance);
    this.position.x += moveVector.x;
    this.position.y += moveVector.y;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      PLAYER_SIZE,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  startGatheringResource(resource: Resource): void {
    // Stop movement when gathering
    this.isMoving = false;
    this.targetPosition = null;
    
    this.currentResource = resource;
    this.isGathering = true;
    resource.startGathering();
  }
  
  updateResourceGathering(deltaTime: number): void {
    if (!this.currentResource) {
      this.isGathering = false;
      return;
    }
    
    // Check if player is still in range of the resource
    const distance = this.position.distanceTo(this.currentResource.position);
    
    if (distance > RESOURCE_GATHER_DISTANCE) {
      this.currentResource.stopGathering();
      this.currentResource = null;
      this.isGathering = false;
      return;
    }
    
    // Update gathering progress
    const isComplete = this.currentResource.updateGathering(deltaTime);
    
    // If gathering is complete, add to inventory
    if (isComplete) {
      this.inventory[this.currentResource.rarity]++;
      this.currentResource = null;
      this.isGathering = false;
    }
  }
  
  drawGatheringUI(ctx: CanvasRenderingContext2D): void {
    if (!this.currentResource || !this.isGathering) return;
    
    const progressBarWidth = 300;
    const progressBarHeight = 20;
    const progressBarX = (CANVAS_WIDTH - progressBarWidth) / 2;
    const progressBarY = CANVAS_HEIGHT - 50;
    
    // Draw resource name and level
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    
    let resourceName;
    switch (this.currentResource.rarity) {
      case ResourceRarity.COMMON:
        resourceName = t("game.resources.common");
        break;
      case ResourceRarity.UNCOMMON:
        resourceName = t("game.resources.uncommon");
        break;
      case ResourceRarity.RARE:
        resourceName = t("game.resources.rare");
        break;
      default:
        resourceName = "Resource";
    }
    
    ctx.fillText(
      `[${resourceName}] ${t('game.gathering')}`,
      CANVAS_WIDTH / 2,
      progressBarY - 10
    );
    
    // Draw progress bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    
    // Draw progress bar border
    ctx.strokeStyle = this.currentResource.getColor();
    ctx.lineWidth = 2;
    ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    
    // Draw progress
    const progressPercentage = this.currentResource.gatherProgress / this.currentResource.gatherTime;
    ctx.fillStyle = this.currentResource.getColor();
    ctx.fillRect(
      progressBarX,
      progressBarY,
      progressBarWidth * progressPercentage,
      progressBarHeight
    );
    
    // Draw time remaining
    const timeRemaining = Math.max(0, this.currentResource.gatherTime - this.currentResource.gatherProgress).toFixed(1);
    ctx.fillStyle = 'white';
    ctx.fillText(
      `${timeRemaining}s`,
      CANVAS_WIDTH / 2,
      progressBarY + progressBarHeight / 2 + 5
    );
  }
  
  drawInventory(ctx: CanvasRenderingContext2D): void {
    const inventoryX = CANVAS_WIDTH - 210;
    const inventoryY = 10;
    
    // Draw inventory background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(inventoryX, inventoryY, 200, 90);
    
    // Draw inventory border
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    ctx.strokeRect(inventoryX, inventoryY, 200, 90);
    
    // Draw inventory title
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(t('game.inventory'), inventoryX + 100, inventoryY + 20);
    
    // Draw inventory items
    ctx.textAlign = 'left';
    
    // Common resources
    ctx.fillStyle = RESOURCE_COLORS.COMMON;
    ctx.fillRect(inventoryX + 10, inventoryY + 30, 15, 15);
    ctx.fillStyle = 'white';
    ctx.fillText(`${t('game.resources.common')}: ${this.inventory[ResourceRarity.COMMON]}`, inventoryX + 30, inventoryY + 42);
    
    // Uncommon resources
    ctx.fillStyle = RESOURCE_COLORS.UNCOMMON;
    ctx.fillRect(inventoryX + 10, inventoryY + 50, 15, 15);
    ctx.fillStyle = 'white';
    ctx.fillText(`${t('game.resources.uncommon')}: ${this.inventory[ResourceRarity.UNCOMMON]}`, inventoryX + 30, inventoryY + 62);
    
    // Rare resources
    ctx.fillStyle = RESOURCE_COLORS.RARE;
    ctx.fillRect(inventoryX + 10, inventoryY + 70, 15, 15);
    ctx.fillStyle = 'white';
    ctx.fillText(`${t('game.resources.rare')}: ${this.inventory[ResourceRarity.RARE]}`, inventoryX + 30, inventoryY + 82);
  }
}

class Camera {
  constructor(public position: Vector2) {}

  update(target: Vector2) {
    // Camera follows the target (player)
    this.position = target;
  }

  getOffset(): Vector2 {
    return new Vector2(
      this.position.x - CANVAS_WIDTH / 2,
      this.position.y - CANVAS_HEIGHT / 2
    );
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
    this.player = new Player(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.camera = new Camera(this.player.position);
    
    // Generate resources
    this.generateResources();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize the game
    this.init();
  }
  
  async init() {
    // Initialize language manager
    await this.languageManager.init();
    
    // Subscribe to language changes
    this.languageManager.onLanguageChange(() => {
      // Redraw UI when language changes
      this.render();
    });
    
    // Load assets
    this.loadAssets();
  }
  
  generateResources() {
    // Clear existing resources
    this.resources = [];
    
    // Track resource counts and total shards
    let totalShards = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    
    // First, add the limited higher tier resources
    
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
    
    // Fill the rest with Tier 1 resources up to MAX_TOTAL_SHARDS
    while (totalShards < MAX_TOTAL_SHARDS) {
      const x = BORDER_WIDTH + Math.random() * (MAP_WIDTH - 2 * BORDER_WIDTH);
      const y = BORDER_WIDTH + Math.random() * (MAP_HEIGHT - 2 * BORDER_WIDTH);
      
      const resource = new Resource(x, y, ResourceRarity.COMMON);
      
      // Check if adding this resource would exceed the shard limit
      if (totalShards + resource.shardValue > MAX_TOTAL_SHARDS) {
        break;
      }
      
      this.resources.push(resource);
      totalShards += resource.shardValue;
    }
    
    console.log(`Generated ${this.resources.length} resources with ${totalShards} total shards`);
    console.log(`Tier 3: ${tier3Count}, Tier 2: ${tier2Count}, Tier 1: ${this.resources.length - tier3Count - tier2Count}`);
  }
  
  loadAssets() {
    let loadedAssets = 0;
    const totalAssets = 2; // grass and cliff
    
    const onAssetLoad = () => {
      loadedAssets++;
      console.log(`Asset loaded: ${loadedAssets}/${totalAssets}`);
      if (loadedAssets === totalAssets) {
        this.assetsLoaded = true;
        console.log('All assets loaded successfully');
        // Start the game loop once assets are loaded
        requestAnimationFrame(this.gameLoop.bind(this));
      }
    };
    
    // Set up event listeners for asset loading
    this.grassTexture.onload = () => {
      console.log('Grass texture loaded');
      onAssetLoad();
    };
    
    this.cliffTexture.onload = () => {
      console.log('Cliff texture loaded');
      onAssetLoad();
    };
    
    // Handle texture loading errors
    this.grassTexture.onerror = () => {
      console.error('Failed to load grass texture, using default');
      // Create a default grass texture
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
      
      // Set the grass texture source to this canvas
      this.grassTexture.src = canvas.toDataURL();
    };
    
    this.cliffTexture.onerror = () => {
      console.error('Failed to load cliff texture, using default');
      // Create a default cliff texture
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
      
      // Set the cliff texture source to this canvas
      this.cliffTexture.src = canvas.toDataURL();
    };
    
    // Load the textures
    this.grassTexture.src = './assets/grass.png';
    this.cliffTexture.src = './assets/cliff.png';
    
    // Set a timeout to check if assets are loaded after 2 seconds
    setTimeout(() => {
      if (!this.assetsLoaded) {
        console.warn('Assets taking too long to load, starting game with defaults');
        this.assetsLoaded = true;
        requestAnimationFrame(this.gameLoop.bind(this));
      }
    }, 2000);
  }
  
  setupEventListeners() {
    // Track mouse position for cursor updates
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    this.canvas.addEventListener('mousemove', (event) => {
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.updateCursor();
    });
    
    // Mouse wheel for scrolling popup
    this.canvas.addEventListener('wheel', (event) => {
      if (this.showControlsPopup || this.showSettingsPopup) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Check if mouse is over the popup content area
        const popupX = CANVAS_WIDTH / 2 - 200;
        const popupY = CANVAS_HEIGHT / 2 - 150;
        const popupWidth = 400;
        const popupHeight = 300;
        
        if (mouseX >= popupX && mouseX <= popupX + popupWidth &&
            mouseY >= popupY && mouseY <= popupY + popupHeight) {
          // Prevent default scrolling behavior
          event.preventDefault();
          
          // Update scroll position based on wheel delta
          this.popupScrollPosition += event.deltaY * 0.5;
          
          // Clamp scroll position
          const totalContentHeight = 24 * 20; // lineHeight * number of lines
          const visibleHeight = 180; // contentHeight
          const maxScroll = Math.max(0, totalContentHeight - visibleHeight);
          
          this.popupScrollPosition = Math.max(0, Math.min(maxScroll, this.popupScrollPosition));
        }
      }
    });
    
    // Left click for gathering and UI interaction
    this.canvas.addEventListener('click', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
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
        this.showControlsPopup = false; // Close controls if open
        this.popupScrollPosition = 0; // Reset scroll position
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
        
        // Check if language buttons were clicked
        this.handleLanguageButtonClicks(clickX, clickY);
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
    this.canvas.addEventListener('contextmenu', (event) => {
      // Prevent the context menu from appearing
      event.preventDefault();
      
      const rect = this.canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
      // Convert screen coordinates to world coordinates
      const cameraOffset = this.camera.getOffset();
      const worldX = clickX + cameraOffset.x;
      const worldY = clickY + cameraOffset.y;
      
      // Check if clicked on a resource
      const clickedResource = this.findResourceAtPosition(worldX, worldY);
      
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
        
        // Store the target position for drawing the cross
        this.lastClickPosition = new Vector2(clampedX, clampedY);
        
        // Set player target to the valid position
        this.player.setTarget(clampedX, clampedY);
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
        
        // Store the target position for drawing the cross
        this.lastClickPosition = new Vector2(targetX, targetY);
        
        // Set player target to the valid position
        this.player.setTarget(targetX, targetY);
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
  
  gameLoop(timestamp: number) {
    // Calculate delta time in seconds
    const deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;
    
    // Update
    this.update(deltaTime);
    
    // Render
    this.render();
    
    // Schedule next frame
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  
  update(deltaTime: number) {
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
    this.updateCursor();
  }
  
  updateCursor() {
    // Get the mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = this.lastMouseX - rect.left;
    const mouseY = this.lastMouseY - rect.top;
    
    // Check if mouse is over UI buttons
    if (this.isPointInControlsButton(mouseX, mouseY) || this.isPointInSettingsButton(mouseX, mouseY)) {
      this.canvas.style.cursor = 'pointer';
      return;
    }
    
    // Convert to world coordinates
    const cameraOffset = this.camera.getOffset();
    const worldX = mouseX + cameraOffset.x;
    const worldY = mouseY + cameraOffset.y;
    
    // Check if mouse is over a resource
    const resourceUnderMouse = this.findResourceAtPosition(worldX, worldY);
    
    if (resourceUnderMouse && resourceUnderMouse.canBeGathered()) {
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
  
  render() {
    if (!this.assetsLoaded) {
      // Show loading screen
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      this.ctx.fillStyle = 'white';
      this.ctx.font = '24px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(t('game.ui.loading'), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      return;
    }
    
    // Clear canvas
    this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const cameraOffset = this.camera.getOffset();
    
    // Draw map
    this.drawMap(cameraOffset);
    
    // Draw resources
    this.drawResources(cameraOffset);
    
    // Draw target cross if exists
    if (this.lastClickPosition) {
      this.drawTargetCross(this.lastClickPosition, cameraOffset);
    }
    
    // Draw player
    this.player.draw(this.ctx);
    
    // Draw player inventory
    this.player.drawInventory(this.ctx);
    
    // Draw gathering UI if gathering
    this.player.drawGatheringUI(this.ctx);
    
    // Draw minimap
    this.drawMinimap();
    
    // Draw UI buttons
    this.drawControlsButton();
    this.drawSettingsButton();
    
    // Draw popups if open
    if (this.showControlsPopup) {
      this.drawControlsPopup();
    }
    
    if (this.showSettingsPopup) {
      this.drawSettingsPopup();
    }
  }
  
  isPointInControlsButton(x: number, y: number): boolean {
    const buttonX = 10;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;
    
    return x >= buttonX && x <= buttonX + buttonWidth && 
           y >= buttonY && y <= buttonY + buttonHeight;
  }
  
  isPointInSettingsButton(x: number, y: number): boolean {
    const buttonX = 120;
    const buttonY = 10;
    const buttonWidth = 100;
    const buttonHeight = 30;
    
    return x >= buttonX && x <= buttonX + buttonWidth && 
           y >= buttonY && y <= buttonY + buttonHeight;
  }
  
  isPointInControlsPopup(x: number, y: number): boolean {
    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 150;
    const popupWidth = 400;
    const popupHeight = 300;
    
    return x >= popupX && x <= popupX + popupWidth && 
           y >= popupY && y <= popupY + popupHeight;
  }
  
  isPointInSettingsPopup(x: number, y: number): boolean {
    const popupX = CANVAS_WIDTH / 2 - 200;
    const popupY = CANVAS_HEIGHT / 2 - 150;
    const popupWidth = 400;
    const popupHeight = 300;
    
    return x >= popupX && x <= popupX + popupWidth && 
           y >= popupY && y <= popupY + popupHeight;
  }
  
  handleLanguageButtonClicks(x: number, y: number): void {
    // Language buttons positions
    const buttonWidth = 80;
    const buttonHeight = 30;
    const buttonSpacing = 20;
    const startX = CANVAS_WIDTH / 2 - buttonWidth - buttonSpacing / 2;
    const startY = CANVAS_HEIGHT / 2 - 50;
    
    // Check if English button was clicked
    if (x >= startX && x <= startX + buttonWidth &&
        y >= startY && y <= startY + buttonHeight) {
      this.languageManager.loadTranslations('en');
      return;
    }
    
    // Check if Turkish button was clicked
    if (x >= startX + buttonWidth + buttonSpacing && 
        x <= startX + buttonWidth * 2 + buttonSpacing &&
        y >= startY && y <= startY + buttonHeight) {
      this.languageManager.loadTranslations('tr');
      return;
    }
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
    this.ctx.fillText(t('game.settings.title'), CANVAS_WIDTH / 2, popupY + 20);
    
    // Draw language selection
    this.ctx.font = '18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(t('game.settings.language'), CANVAS_WIDTH / 2, popupY + 70);
    
    // Draw language buttons
    const buttonWidth = 80;
    const buttonHeight = 30;
    const buttonSpacing = 20;
    const startX = CANVAS_WIDTH / 2 - buttonWidth - buttonSpacing / 2;
    const startY = CANVAS_HEIGHT / 2 - 50;
    
    // English button
    const isEnglish = this.languageManager.getCurrentLanguage() === 'en';
    this.ctx.fillStyle = isEnglish ? 'rgba(0, 100, 200, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    this.ctx.fillRect(startX, startY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(startX, startY, buttonWidth, buttonHeight);
    
    this.ctx.fillStyle = 'white';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('EN', startX + buttonWidth / 2, startY + buttonHeight / 2);
    
    // Turkish button
    const isTurkish = this.languageManager.getCurrentLanguage() === 'tr';
    this.ctx.fillStyle = isTurkish ? 'rgba(0, 100, 200, 0.8)' : 'rgba(50, 50, 50, 0.8)';
    this.ctx.fillRect(startX + buttonWidth + buttonSpacing, startY, buttonWidth, buttonHeight);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(startX + buttonWidth + buttonSpacing, startY, buttonWidth, buttonHeight);
    
    this.ctx.fillStyle = 'white';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('TR', startX + buttonWidth + buttonSpacing + buttonWidth / 2, startY + buttonHeight / 2);
    
    // Draw close instructions
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'white';
    this.ctx.fillText(t('game.settings.close'), CANVAS_WIDTH / 2, popupY + popupHeight - 30);
  }
}

// Initialize the game when the DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
