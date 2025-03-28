import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED, RESOURCE_COLORS, RESOURCE_GATHER_DISTANCE } from "../constants/game";
import { updatePosition } from "../utils/game-utils";
import { ResourceRarity } from "../utils/types";
import { Vector2 } from "./vector2";
import { t } from "./language-manager";
import { Resource, resourceT1Image, resourceT2Image, resourceT3Image, resourceT4Image, resourceT5Image } from "./resource";
import { ref, set, get } from "firebase/database";
import { db } from "../utils/firebase";

export class Player {
  position: Vector2;
  targetPosition: Vector2 | null = null;
  isMoving = false;
  currentResource: Resource | null = null;
  isGathering = false;
  playerId: string;
  displayName: string;
  inventory: { [key in ResourceRarity]: number } = {
    [ResourceRarity.COMMON]: 0,
    [ResourceRarity.UNCOMMON]: 0,
    [ResourceRarity.RARE]: 0,
    [ResourceRarity.EPIC]: 0,
    [ResourceRarity.LEGENDARY]: 0
  };

  constructor(x: number, y: number, playerId: string) {
    this.position = new Vector2(x, y);
    this.playerId = playerId;
    // Initialize display name with player ID by default
    this.displayName = playerId.replace('player_', '');
    
    // Update player position in Firebase when created
    this.updatePlayerPositionInDB();
  }

  // Update player position in Firebase database
  updatePlayerPositionInDB() {
    if (!this.playerId) return;
    
    const playerRef = ref(db, `players/${this.playerId}`);
    set(playerRef, {
      position: {
        x: this.position.x,
        y: this.position.y
      },
      displayName: this.displayName,
      id: this.playerId, // Store the ID explicitly in the database
      lastUpdated: Date.now()
    });
  }

  // Set or update the player's display name
  setDisplayName(newName: string) {
    if (!newName || newName.trim() === '') return;
    
    this.displayName = newName.trim();
    
    // Update the display name in Firebase
    const playerRef = ref(db, `players/${this.playerId}`);
    
    // Get current data first to avoid overwriting other fields
    get(playerRef).then((snapshot) => {
      if (snapshot.exists()) {
        const currentData = snapshot.val();
        
        // Update only the display name and preserve other data
        set(playerRef, {
          ...currentData,
          displayName: this.displayName,
          id: this.playerId,
          lastUpdated: Date.now()
        });
      } else {
        // If no data exists yet, create a new entry
        set(playerRef, {
          position: {
            x: this.position.x,
            y: this.position.y
          },
          displayName: this.displayName,
          id: this.playerId,
          lastUpdated: Date.now()
        });
      }
    }).catch((error) => {
      console.error("Error updating display name:", error);
    });
    
    // Also update in localStorage for persistence
    localStorage.setItem('playerDisplayName', this.displayName);
  }

  setTarget(x: number, y: number) {
    // Don't allow movement while gathering
    if (this.isGathering) return;

    this.targetPosition = new Vector2(x, y);
    
    // Send the target position to the database
    // Other clients will use this to show where the player is heading
    updatePosition(x, y);
    
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
      
      // Update final position in database when player stops moving
      this.updatePlayerPositionInDB();
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
    
    // Only update position in database occasionally to reduce load
    // This is mainly for players who just joined and need to see current positions
    if (Math.random() < 0.01) { // Reduced frequency (approximately every ~1.5 seconds)
      this.updatePlayerPositionInDB();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, PLAYER_SIZE, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw player display name above
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Draw text with outline for better visibility
    ctx.strokeText(this.displayName, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - PLAYER_SIZE - 5);
    ctx.fillText(this.displayName, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - PLAYER_SIZE - 5);
  }

  startGatheringResource(resource: Resource): void {
    // Stop movement when gathering
    this.isMoving = false;
    this.targetPosition = null;

    this.currentResource = resource;
    this.isGathering = true;
    resource.startGathering(this.playerId, this.displayName);
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

    const progressBarWidth = 250;
    const progressBarHeight = 20;
    const progressBarX = (CANVAS_WIDTH - progressBarWidth) / 2;
    const progressBarY = CANVAS_HEIGHT - 60;

    // Create a progress bar similar to the image
    const iconSize = 50;
    const barX = progressBarX - iconSize; // Adjust X to accommodate the icon
    const barY = progressBarY - 15;

    // Draw the icon background (square with rounded corners)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(barX, barY, iconSize, iconSize, 10);
    ctx.fill();

    // Draw the resource image with glow effect
    ctx.save();
    // Add glow effect based on resource rarity
    ctx.shadowColor = this.currentResource.getColor();
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw the resource image
    ctx.drawImage(this.currentResource.image, barX + 5, barY + 5, iconSize - 10, iconSize - 10);
    ctx.restore();

    // Draw progress bar background (dark gradient)
    const gradient = ctx.createLinearGradient(
      progressBarX,
      progressBarY,
      progressBarX + progressBarWidth,
      progressBarY
    );
    gradient.addColorStop(0, '#333');
    gradient.addColorStop(1, '#222');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(progressBarX + 5, progressBarY, progressBarWidth, progressBarHeight, 3);
    ctx.fill();

    // Draw progress
    const progressPercentage = this.currentResource.gatherProgress / this.currentResource.gatherTime;

    // Create gradient for the progress fill
    const progressGradient = ctx.createLinearGradient(
      progressBarX,
      progressBarY,
      progressBarX,
      progressBarY + progressBarHeight
    );
    progressGradient.addColorStop(0, '#4CAF50'); // Lighter green
    progressGradient.addColorStop(1, '#2E7D32'); // Darker green

    ctx.fillStyle = progressGradient;
    ctx.beginPath();
    ctx.roundRect(progressBarX + 5, progressBarY, progressBarWidth * progressPercentage, progressBarHeight, 3);
    ctx.fill();

    // Draw metallic border
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(progressBarX + 5, progressBarY, progressBarWidth, progressBarHeight, 3);
    ctx.stroke();
  }

  drawInventory(ctx: CanvasRenderingContext2D): void {
    const inventoryX = CANVAS_WIDTH - 160;
    const inventoryY = 50;

    // Draw inventory background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(inventoryX, inventoryY, 150, 150);

    // Draw inventory border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(inventoryX, inventoryY, 150, 150);

    // Draw inventory title
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(t('game.inventory'), inventoryX + 75, inventoryY + 20);

    // Draw inventory items
    ctx.textAlign = 'left';
    const iconSize = 20;

    // Common resources (T1)
    ctx.save();
    // Add glow effect
    ctx.shadowColor = RESOURCE_COLORS.COMMON;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw the resource image
    ctx.drawImage(resourceT1Image, inventoryX + 10, inventoryY + 30, iconSize, iconSize);
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillText(
      `${t('game.resources.common')}: ${this.inventory[ResourceRarity.COMMON]}`,
      inventoryX + 35,
      inventoryY + 44
    );

    // Uncommon resources (T2)
    ctx.save();
    // Add glow effect
    ctx.shadowColor = RESOURCE_COLORS.UNCOMMON;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw the resource image
    ctx.drawImage(resourceT2Image, inventoryX + 10, inventoryY + 54, iconSize, iconSize);
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillText(
      `${t('game.resources.uncommon')}: ${this.inventory[ResourceRarity.UNCOMMON]}`,
      inventoryX + 35,
      inventoryY + 68
    );

    // Rare resources (T3)
    ctx.save();
    // Add glow effect
    ctx.shadowColor = RESOURCE_COLORS.RARE;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw the resource image
    ctx.drawImage(resourceT3Image, inventoryX + 10, inventoryY + 78, iconSize, iconSize);
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillText(
      `${t('game.resources.rare')}: ${this.inventory[ResourceRarity.RARE]}`,
      inventoryX + 35,
      inventoryY + 92
    );

    // Epic resources (T4)
    ctx.save();
    // Add glow effect
    ctx.shadowColor = RESOURCE_COLORS.EPIC;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw the resource image
    ctx.drawImage(resourceT4Image, inventoryX + 10, inventoryY + 102, iconSize, iconSize);
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillText(
      `${t('game.resources.epic')}: ${this.inventory[ResourceRarity.EPIC]}`,
      inventoryX + 35,
      inventoryY + 116
    );

    // Legendary resources (T5)
    ctx.save();
    // Add glow effect
    ctx.shadowColor = RESOURCE_COLORS.LEGENDARY;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw the resource image
    ctx.drawImage(resourceT5Image, inventoryX + 10, inventoryY + 126, iconSize, iconSize);
    ctx.restore();

    ctx.fillStyle = 'white';
    ctx.fillText(
      `${t('game.resources.legendary')}: ${this.inventory[ResourceRarity.LEGENDARY]}`,
      inventoryX + 35,
      inventoryY + 140
    );
  }
}