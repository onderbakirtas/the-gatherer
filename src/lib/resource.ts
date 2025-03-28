import {
  RESOURCE_SHARD_VALUES,
  RESOURCE_GATHER_DISTANCE,
  RESOURCE_SIZE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  ASSET_PATHS
} from '../constants/game';
import { getResourceColor } from '../utils/get-resource-color';
import { ResourceRarity } from '../utils/types';
import { Vector2 } from './vector2';
import { ref, set, get } from 'firebase/database';
import { db } from '../utils/firebase';

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
  image: HTMLImageElement;
  resourceId: string; // Unique ID for the resource
  gatheringPlayerId: string | null = null; // ID of the player gathering this resource
  gatheringPlayerName: string | null = null; // Name of the player gathering this resource

  constructor(x: number, y: number, rarity: ResourceRarity) {
    this.position = new Vector2(x, y);
    this.rarity = rarity;

    // Set gather time based on rarity (1, 2, or 3 seconds)
    this.gatherTime = rarity + 1;
    
    // Generate a unique ID for the resource based on position and rarity
    this.resourceId = `resource_${x}_${y}_${rarity}`;

    // Assign the appropriate image based on rarity
    switch (rarity) {
      case ResourceRarity.COMMON:
        this.image = resourceT1Image;
        this.shardValue = RESOURCE_SHARD_VALUES.COMMON;
        break;
      case ResourceRarity.UNCOMMON:
        this.image = resourceT2Image;
        this.shardValue = RESOURCE_SHARD_VALUES.UNCOMMON;
        break;
      case ResourceRarity.RARE:
        this.image = resourceT3Image;
        this.shardValue = RESOURCE_SHARD_VALUES.RARE;
        break;
      case ResourceRarity.EPIC:
        this.image = resourceT4Image;
        this.shardValue = RESOURCE_SHARD_VALUES.EPIC;
        break;
      case ResourceRarity.LEGENDARY:
        this.image = resourceT5Image;
        this.shardValue = RESOURCE_SHARD_VALUES.LEGENDARY;
        break;
      default:
        this.image = resourceT1Image;
        this.shardValue = RESOURCE_SHARD_VALUES.COMMON;
    }

    // Set refill time equal to shard value (in seconds)
    this.refillTime = this.shardValue;
  }

  getColor(): string {
    return getResourceColor(this.rarity);
  }

  startGathering(playerId: string, playerName: string): void {
    if (this.isGathered) return; // Can't gather if already gathered
    
    // Check if resource is already being gathered in the database
    this.checkGatheringStateInDB(playerId, playerName).then(isAvailable => {
      if (!isAvailable) return; // Resource is being gathered by someone else
      
      this.isBeingGathered = true;
      this.gatherProgress = 0;
      this.gatheringPlayerId = playerId;
      this.gatheringPlayerName = playerName;
      
      // Update gathering state in the database
      this.updateGatheringStateInDB();
    });
  }

  stopGathering(): void {
    if (!this.isBeingGathered) return;
    
    this.isBeingGathered = false;
    this.gatherProgress = 0;
    
    // Only clear the database entry if this player is the one gathering
    if (this.gatheringPlayerId) {
      // Clear gathering state in the database
      this.clearGatheringStateInDB();
      this.gatheringPlayerId = null;
      this.gatheringPlayerName = null;
    }
  }

  updateGathering(deltaTime: number): boolean {
    if (!this.isBeingGathered || this.isGathered) return false;

    this.gatherProgress += deltaTime;

    // Return true if gathering is complete
    if (this.gatherProgress >= this.gatherTime) {
      this.isBeingGathered = false;
      this.isGathered = true;
      this.gatheringPlayerId = null;
      this.gatheringPlayerName = null;
      
      // Clear gathering state and update gathered state in the database
      this.clearGatheringStateInDB();
      this.updateGatheredStateInDB();
      
      // Start refill timer
      this.refillProgress = 0;
      
      return true;
    }
    
    return false;
  }
  
  // Check if the resource is available for gathering in the database
  async checkGatheringStateInDB(playerId: string, playerName: string): Promise<boolean> {
    try {
      const resourceRef = ref(db, `resources/${this.resourceId}`);
      const snapshot = await get(resourceRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // If resource is being gathered by someone else
        if (data.isBeingGathered && data.gatheringPlayerId !== playerId) {
          // Store the gathering player info for display
          this.gatheringPlayerId = data.gatheringPlayerId;
          this.gatheringPlayerName = data.gatheringPlayerName || playerName || 'Another player';
          console.log(`Resource is being gathered by ${this.gatheringPlayerName}`);
          return false;
        }
        
        // If resource is gathered (not available)
        if (data.isGathered) {
          this.isGathered = true;
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error("Error checking resource gathering state:", error);
      return true; // Allow gathering on error to prevent blocking
    }
  }
  
  // Update the gathering state in the database
  updateGatheringStateInDB(): void {
    if (!this.gatheringPlayerId) return;
    
    const resourceRef = ref(db, `resources/${this.resourceId}`);
    set(resourceRef, {
      position: {
        x: this.position.x,
        y: this.position.y
      },
      rarity: this.rarity,
      isBeingGathered: true,
      isGathered: this.isGathered,
      gatheringPlayerId: this.gatheringPlayerId,
      gatheringPlayerName: this.gatheringPlayerName,
      lastUpdated: Date.now()
    });
  }
  
  // Clear the gathering state in the database
  clearGatheringStateInDB(): void {
    const resourceRef = ref(db, `resources/${this.resourceId}`);
    set(resourceRef, {
      position: {
        x: this.position.x,
        y: this.position.y
      },
      rarity: this.rarity,
      isBeingGathered: false,
      isGathered: this.isGathered,
      gatheringPlayerId: null,
      gatheringPlayerName: null,
      lastUpdated: Date.now()
    });
  }
  
  // Update the gathered state in the database
  updateGatheredStateInDB(): void {
    const resourceRef = ref(db, `resources/${this.resourceId}`);
    set(resourceRef, {
      position: {
        x: this.position.x,
        y: this.position.y
      },
      rarity: this.rarity,
      isBeingGathered: false,
      isGathered: true,
      gatheringPlayerId: null,
      gatheringPlayerName: null,
      lastUpdated: Date.now()
    });
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
      // Save the current context state
      ctx.save();

      // Add glow effect based on resource rarity
      const isInRange = this.isPlayerInRange(playerPosition);
      const glowColor = this.getColor();
      const glowIntensity = isInRange ? 20 : 10; // More intense glow when in range

      // Apply shadow for glow effect
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowIntensity;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw the resource image
      ctx.drawImage(this.image, screenX - RESOURCE_SIZE / 2, screenY - RESOURCE_SIZE / 2, RESOURCE_SIZE, RESOURCE_SIZE);

      // Restore the context state
      ctx.restore();

      // Draw gathering progress if being gathered
      if (this.isBeingGathered) {
        const progressPercentage = this.gatherProgress / this.gatherTime;

        // Draw progress bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(screenX - RESOURCE_SIZE / 2, screenY + RESOURCE_SIZE / 2 + 5, RESOURCE_SIZE, 5);

        // Draw progress bar
        ctx.fillStyle = this.getColor();
        ctx.fillRect(
          screenX - RESOURCE_SIZE / 2,
          screenY + RESOURCE_SIZE / 2 + 5,
          RESOURCE_SIZE * progressPercentage,
          5
        );
      }
    }

    // Draw refill progress if gathered
    if (this.isGathered) {
      ctx.save();

      // Draw semi-transparent image
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.image, screenX - RESOURCE_SIZE / 2, screenY - RESOURCE_SIZE / 2, RESOURCE_SIZE, RESOURCE_SIZE);

      // Reset alpha
      ctx.globalAlpha = 1.0;

      // Draw refill timer
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const timeLeft = Math.ceil(this.refillTime - this.refillProgress);
      ctx.fillText(timeLeft.toString(), screenX, screenY);

      ctx.restore();
    }

    // Draw warning message if being gathered by another player
    this.drawGatheringWarning(ctx, cameraOffset);
  }

  // Draw a warning message when the resource is being gathered by another player
  drawGatheringWarning(ctx: CanvasRenderingContext2D, cameraOffset: Vector2): void {
    if (!this.gatheringPlayerId || !this.gatheringPlayerName) return;
    
    // Calculate screen position
    const screenX = this.position.x - cameraOffset.x;
    const screenY = this.position.y - cameraOffset.y;
    
    // Only draw if on screen
    if (screenX < -RESOURCE_SIZE || screenX > CANVAS_WIDTH + RESOURCE_SIZE || 
        screenY < -RESOURCE_SIZE || screenY > CANVAS_HEIGHT + RESOURCE_SIZE) {
      return;
    }
    
    // Draw red warning text
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(screenX - 100, screenY - 60, 200, 30);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX - 100, screenY - 60, 200, 30);
    
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'red';
    ctx.fillText(`${this.gatheringPlayerName} is gathering`, screenX, screenY - 45);
    ctx.restore();
  }

  drawOnMinimap(
    ctx: CanvasRenderingContext2D,
    minimapX: number,
    minimapY: number,
    scaleX: number,
    scaleY: number
  ): void {
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

export { Resource, resourceT1Image, resourceT2Image, resourceT3Image, resourceT4Image, resourceT5Image };
