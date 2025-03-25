# Translations Guide

This document explains how to add new languages to The Gatherer game.

## Adding a New Language

1. Create a new folder under `public/locales/` with the two-letter language code (ISO 639-1)
   - Example: `public/locales/fr/` for French

2. Copy the `translation.json` file from the English folder (`public/locales/en/`) to your new language folder

3. Translate all the values in the JSON file while keeping the keys unchanged

## Translation Structure

The translation file is organized in a hierarchical structure. Here are the main sections:

### Game Controls
```json
"controls": {
  "title": "Game Controls",
  "movement": "Right-click: Move to location",
  "gathering": "Left-click: Gather resources",
  "close": "Click anywhere outside this popup to close",
  "scroll": "Use mouse wheel to scroll"
}
```

### Resource Information
```json
"resources": {
  "title": "Resource Information",
  "common": "Common (Tier 1): 10 shards, refills in 10s",
  "uncommon": "Uncommon (Tier 2): 25 shards, refills in 25s",
  "rare": "Rare (Tier 3): 100 shards, refills in 100s"
}
```

### Tips
```json
"tips": {
  "title": "Tips",
  "noMovement": "You cannot move while gathering",
  "cursorChange": "Cursor changes when you can gather a resource",
  "refill": "Gathered resources will refill after some time",
  "minimap": "The minimap in the bottom left shows your position",
  "resourceLimits": "Resources are limited: max 2 Tier 3 and 5 Tier 2",
  "shardLimit": "Total shards on the map are limited to 500",
  "inventory": "Your inventory is shown in the top right corner"
}
```

### UI Elements
```json
"ui": {
  "controls": "Controls",
  "settings": "Settings"
}
```

### Settings
```json
"settings": {
  "title": "Settings",
  "language": "Language",
  "close": "Click anywhere outside this popup to close"
}
```

## Currently Supported Languages

- English (en)
- Turkish (tr)

## Testing Your Translation

After adding a new language:

1. Make sure the language code is added to the language options in the settings menu
2. Select your language in the game settings
3. Verify that all text elements display correctly
4. Check for any formatting issues or text overflow

## Contributing

If you'd like to contribute a new language or improve an existing translation, please submit a pull request with your changes.
