// Canvas and Map dimensions
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;
export const MAP_WIDTH = 3000;
export const MAP_HEIGHT = 3000;

// Player settings
export const PLAYER_SPEED = 200; // pixels per second
export const PLAYER_SIZE = 10;

// Map settings
export const BORDER_WIDTH = 50;

// UI settings
export const MINIMAP_SIZE = 120; // Size of the minimap
export const MINIMAP_PADDING = 10; // Padding from the edge of the screen

// Resource settings
export const RESOURCE_SIZE = 64; // Size of resource nodes
export const RESOURCE_GATHER_DISTANCE = 100; // Distance at which player can gather resources

// Resource limits
export const MAX_TOTAL_SHARDS = 3000; // Maximum total shards player can hold
export const MAX_TIER2_RESOURCES = 6; // Maximum number of uncommon resources
export const MAX_TIER3_RESOURCES = 3; // Maximum number of rare resources
export const MAX_TIER4_RESOURCES = 2; // Maximum number of legendary resources
export const MAX_TIER5_RESOURCES = 1; // Maximum number of mythical resources

// Resource shard values
export const RESOURCE_SHARD_VALUES = {
    COMMON: 10, 
    UNCOMMON: 25, 
    RARE: 100, 
    EPIC: 250, 
    LEGENDARY: 500, 
    MYTHICAL: 1000, 
};

// Resource rarity colors based on Dota 2
export const RESOURCE_COLORS = {
    COMMON     : "#fdfefe",
    UNCOMMON   : "#27AE60",
    RARE       : "#2471A3",
    EPIC       : "#7D3C98",
    LEGENDARY  : "#f1c40f",
    MYTHICAL   : "#D35400",
};

// Önceden tanımlanmış oyuncu renkleri
export const PLAYER_COLORS = [
  { name: 'Red', value: '#e74c3c', displayName: 'Kırmızı' },
  { name: 'Blue', value: '#3498db', displayName: 'Mavi' },
  { name: 'Green', value: '#2ecc71', displayName: 'Yeşil' },
  { name: 'Yellow', value: '#f1c40f', displayName: 'Sarı' },
  { name: 'Purple', value: '#9b59b6', displayName: 'Mor' },
  { name: 'Orange', value: '#e67e22', displayName: 'Turuncu' },
  { name: 'Teal', value: '#1abc9c', displayName: 'Turkuaz' },
  { name: 'Pink', value: '#e84393', displayName: 'Pembe' }
];

// Varsayılan oyuncu rengi (Mavi)
export const DEFAULT_PLAYER_COLOR = PLAYER_COLORS[1].value;

// Asset paths
export const ASSET_PATHS = {
    GRASS: "/assets/grass.png",
    CLIFF: "/assets/cliff.png",
    RESOURCE_T1: "/assets/resources/t1.png",
    RESOURCE_T2: "/assets/resources/t2.png",
    RESOURCE_T3: "/assets/resources/t3.png",
    RESOURCE_T4: "/assets/resources/t4.png",
    RESOURCE_T5: "/assets/resources/t5.png",
};

export const DEFAULT_MAP_ID = "f0d38487-e743-432d-9a74-65dd6b219a26"
