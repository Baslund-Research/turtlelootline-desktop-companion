# Loot Sync API Schema

## Overview

The GearSync addon collects item data from all in-game sources (loot drops, party/raid loot, quest rewards, vendor items, chat links, equipped gear, bag items). The desktop companion reads this data from `GearSyncLootDB` (account-wide SavedVariable) and syncs it to the TurtleLootLine API.

Only **new or updated items** are sent each sync. The companion tracks sync state locally.

---

## Endpoint

### `POST /api/items/bulk-sync`

Submits collected item data to populate the TurtleLootLine item database.

### Headers

```
Authorization: Bearer <sync_token>
Content-Type: application/json
```

### Request Body

```json
{
  "account": "ACCOUNT_NAME",
  "realm": "Turtle WoW",
  "syncTimestamp": 1711700000,
  "items": [
    {
      "itemId": 16922,
      "name": "Leggings of Transcendence",
      "link": "|cFFA335EE|Hitem:16922:0:0:0|h[Leggings of Transcendence]|h|r",
      "quality": 4,
      "requiredLevel": 60,
      "itemType": "Armor",
      "itemSubType": "Cloth",
      "equipSlot": "Legs",
      "bindType": "pickup",
      "armorType": "Cloth",
      "weaponType": null,
      "classes": null,
      "setName": "Vestments of Transcendence",
      "stats": {
        "armor": 104,
        "stamina": 18,
        "intellect": 30,
        "spirit": 12,
        "shadowResistance": 10
      },
      "equip": [
        "Restores 8 mana per 5 sec.",
        "Increases healing done by spells and effects by up to 44."
      ],
      "equipParsed": {
        "mp5": 8,
        "healingPower": 44
      },
      "weaponDamageMin": null,
      "weaponDamageMax": null,
      "weaponSpeed": null,
      "dps": null,
      "sources": [
        {
          "type": "loot",
          "mob": "Ragnaros",
          "zone": "Molten Core",
          "time": 1711699000,
          "looter": "Paleedk"
        },
        {
          "type": "partyloot",
          "mob": null,
          "zone": "Molten Core",
          "time": 1711699500,
          "looter": "Healbot"
        }
      ],
      "firstSeen": 1711699000,
      "lastSeen": 1711699500
    }
  ]
}
```

### Field Definitions

#### Top Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account` | string | yes | WoW account name (from WTF folder) |
| `realm` | string | yes | Realm name |
| `syncTimestamp` | number | yes | Unix timestamp of this sync |
| `items` | array | yes | Array of item objects to sync |

#### Item Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `itemId` | number | yes | Unique WoW item ID |
| `name` | string | yes | Display name |
| `link` | string | no | Full WoW item link string |
| `quality` | number | yes | 0=Poor, 1=Common, 2=Uncommon, 3=Rare, 4=Epic, 5=Legendary |
| `requiredLevel` | number | no | Minimum level to equip |
| `itemType` | string | yes | "Armor" or "Weapon" |
| `itemSubType` | string | no | "Cloth", "Leather", "Mail", "Plate", "Sword", etc. |
| `equipSlot` | string | no | Equip slot: "Head", "Chest", "MainHand", etc. |
| `bindType` | string | no | "pickup", "equip", "use", or null |
| `armorType` | string | no | "Cloth", "Leather", "Mail", "Plate", "Shield" |
| `weaponType` | string | no | "Sword", "Mace", "Staff", etc. |
| `classes` | string | no | Class restriction, e.g. "Warrior, Paladin" |
| `setName` | string | no | Item set name if part of a set |
| `stats` | object | no | Base stats (see Stats Object below) |
| `equip` | array | no | Raw equip effect text strings |
| `equipParsed` | object | no | Parsed numeric values from equip effects |
| `weaponDamageMin` | number | no | Weapon min damage |
| `weaponDamageMax` | number | no | Weapon max damage |
| `weaponSpeed` | number | no | Weapon speed |
| `dps` | number | no | Damage per second |
| `sources` | array | no | Where the item was observed (see Source Object) |
| `firstSeen` | number | no | Unix timestamp first observed |
| `lastSeen` | number | no | Unix timestamp last observed |

#### Stats Object

All fields are optional numbers. Negative values are valid (some items have penalties).

| Field | Type | Description |
|-------|------|-------------|
| `armor` | number | Armor value |
| `stamina` | number | Stamina |
| `strength` | number | Strength |
| `agility` | number | Agility |
| `intellect` | number | Intellect |
| `spirit` | number | Spirit |
| `defense` | number | Defense |
| `attackPower` | number | Attack power |
| `fireResistance` | number | Fire resistance |
| `natureResistance` | number | Nature resistance |
| `frostResistance` | number | Frost resistance |
| `shadowResistance` | number | Shadow resistance |
| `arcaneResistance` | number | Arcane resistance |

#### equipParsed Object

Numeric values extracted from "Equip: ..." tooltip text. All optional.

| Field | Type | Description |
|-------|------|-------------|
| `spellPower` | number | Spell damage and healing |
| `healingPower` | number | Healing only bonus |
| `hitChance` | number | Hit % |
| `critChance` | number | Crit % |
| `mp5` | number | Mana per 5 seconds |
| `hp5` | number | Health per 5 seconds |
| `defenseBonus` | number | Defense skill bonus |
| `dodgeChance` | number | Dodge % |
| `parryChance` | number | Parry % |
| `blockChance` | number | Block % |
| `attackPower` | number | Attack power from equip effects |
| `rangedAttackPower` | number | Ranged attack power |

#### Source Object

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "loot", "partyloot", "quest", "chatlink", "vendor", "equipped", "bag" |
| `mob` | string/null | Mob or NPC name |
| `zone` | string/null | Zone name |
| `time` | number | Unix timestamp |
| `looter` | string/null | Player who looted |

### Response

#### Success (200)

```json
{
  "success": true,
  "received": 45,
  "created": 12,
  "updated": 33,
  "syncId": "sync_abc123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether sync completed |
| `received` | number | Total items received in request |
| `created` | number | New items added to database |
| `updated` | number | Existing items updated with new data |
| `syncId` | string | Unique sync ID for tracking |

#### Error (400/401/500)

```json
{
  "success": false,
  "error": "Invalid token",
  "code": "AUTH_INVALID"
}
```

Error codes: `AUTH_INVALID`, `AUTH_EXPIRED`, `PAYLOAD_TOO_LARGE`, `INVALID_DATA`, `SERVER_ERROR`

### Rate Limits

- Max **500 items** per request (batch larger sets into multiple calls)
- Max **1 request per 10 seconds** per account
- Max payload size: **2MB**

---

## Desktop Companion Changes

### New file: `src/loot-sync.js`

Responsibilities:
1. Read account-level `GearSync.lua` from `WTF/Account/<ACCOUNT>/SavedVariables/GearSync.lua`
2. Parse `GearSyncLootDB` table (same Lua-to-JSON parsing as existing parser)
3. Compare against local sync state to find new/updated items
4. Batch and send to `POST /api/items/bulk-sync`
5. On success, update local sync state with synced item IDs + timestamps

### Sync state tracking

Stored in `~/.turtlelootline/loot-sync-state.json`:

```json
{
  "lastSyncTimestamp": 1711700000,
  "syncedItems": {
    "16922": { "lastSeen": 1711699500, "syncedAt": 1711700000 },
    "16921": { "lastSeen": 1711698000, "syncedAt": 1711700000 }
  }
}
```

An item needs re-syncing when:
- `itemId` not in `syncedItems` (new item)
- `item.lastSeen > syncedItems[itemId].lastSeen` (updated item, new source data)

### Watcher changes

- Watch account-level `WTF/Account/*/SavedVariables/GearSync.lua` in addition to per-character files
- On change: trigger loot sync in addition to existing equipment sync

### Data flow

```
GearSyncLootDB (in-game)
  → WoW writes to WTF/Account/<ACCOUNT>/SavedVariables/GearSync.lua
  → Watcher detects change
  → loot-sync.js parses GearSyncLootDB
  → Compares with loot-sync-state.json
  → Sends new/updated items to POST /api/items/bulk-sync
  → On 200: updates loot-sync-state.json
```
