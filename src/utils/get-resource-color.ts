import { RESOURCE_COLORS } from "../constants/game";
import { ResourceRarity } from "./types";

export function getResourceColor(rarity: ResourceRarity): string {
  switch (rarity) {
    case ResourceRarity.COMMON:
      return RESOURCE_COLORS.COMMON;
    case ResourceRarity.UNCOMMON:
      return RESOURCE_COLORS.UNCOMMON;
    case ResourceRarity.RARE:
      return RESOURCE_COLORS.RARE;
    case ResourceRarity.EPIC:
      return RESOURCE_COLORS.EPIC;
    case ResourceRarity.LEGENDARY:
      return RESOURCE_COLORS.LEGENDARY;
    default:
      return RESOURCE_COLORS.COMMON;
  }
}
