/**
 * Gear Focus — BiS Lists (Midnight Season 1, Patch 12.0.5)
 *
 * Keys in BIS_LISTS match active_spec.name from the Blizzard character profile API.
 * Keys within each spec match the slot.type field from the Equipment API.
 *
 * ilvl / itemId are null until items appear on Wowhead.
 * OFF_HAND: null means the spec uses a 2H weapon (slot not tracked).
 */

const BIS_LISTS = {

  // ── Shadow Priest ────────────────────────────────────────────────
  Shadow: {
    HEAD: {
      name: "Blind Oath's Winged Crest",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Lightblinded Vanguard (Mythic)",
      sourceType: "raid",
      tier: true, tierLabel: "S1 Tier (4pc bonus)",
    },
    NECK: {
      name: "Eternal Voidsong Chain",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Crown of the Cosmos (Mythic)",
      sourceType: "raid",
    },
    SHOULDER: {
      name: "Blind Oath's Seraphguards",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Fallen-King Salhadaar (Mythic)",
      sourceType: "raid",
      tier: true, tierLabel: "S1 Tier",
    },
    BACK: {
      name: "Draconic Nullcape",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Vaelgor and Ezzorak (Mythic)",
      sourceType: "raid",
    },
    CHEST: {
      name: "Blind Oath's Raiment",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Dreamrift — Chimaerus (Mythic)",
      sourceType: "raid",
      tier: true, tierLabel: "S1 Tier",
    },
    WRIST: {
      name: "Martyr's Bindings",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "Crafted — Tailoring (with Arcanoweave Lining embellishment)",
      sourceType: "crafted",
    },
    HANDS: {
      name: "Vilehex Bonds",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "Maisara Caverns (Mythic+)",
      sourceType: "mythicplus",
    },
    WAIST: {
      name: "Arcanoweave Cord",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "Crafted — Tailoring",
      sourceType: "crafted",
    },
    LEGS: {
      name: "Blind Oath's Leggings",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Vaelgor and Ezzorak (Mythic)",
      sourceType: "raid",
      tier: true, tierLabel: "S1 Tier",
    },
    FEET: {
      name: "Lightbinder Treads",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "Skyreach (Mythic+)",
      sourceType: "mythicplus",
    },
    FINGER_1: {
      name: "Omission of Light",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Voidspire — Nexus-Point Xenas (Mythic)",
      sourceType: "raid",
      note: "Sim both ring slots — swap order based on what drops first",
    },
    FINGER_2: {
      name: "Eye of Midnight",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "March on Quel'Danas — Midnight Falls (Mythic)",
      sourceType: "raid",
    },
    TRINKET_1: {
      name: "Gaze of the Alnseer",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Dreamrift — Chimaerus (Mythic)",
      sourceType: "raid",
      note: "Best-in-slot trinket for Shadow Priest",
    },
    TRINKET_2: {
      name: "Shadow of the Empyrean Requiem",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "March on Quel'Danas — Midnight Falls (Mythic)",
      sourceType: "raid",
    },
    MAIN_HAND: {
      name: "Belo'melorn, the Shattered Talon",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "March on Quel'Danas — Belo'ren (Mythic)",
      sourceType: "raid",
      note: "1H — pair with Off Hand below. Alt: Brazier of the Dissonant Dirge (2H) from Midnight Falls.",
    },
    OFF_HAND: {
      name: "Tome of Alnscorned Regret",
      itemId: null, ilvl: null, heroIlvl: null,
      source: "The Dreamrift — Chimaerus (Mythic)",
      sourceType: "raid",
      note: "Pairs with Belo'melorn. Skip if using the 2H staff alternative.",
    },
  },

  // ── Survival Hunter ──────────────────────────────────────────────
  // Fill in from: wowhead.com/guide/classes/hunter/survival/bis-gear
  // Paste item names + sources here and I'll wire them up.
  Survival: {
    HEAD:      { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    NECK:      { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    SHOULDER:  { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    BACK:      { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    CHEST:     { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    WRIST:     { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    HANDS:     { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    WAIST:     { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    LEGS:      { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    FEET:      { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    FINGER_1:  { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    FINGER_2:  { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    TRINKET_1: { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    TRINKET_2: { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    MAIN_HAND: { name: null, itemId: null, ilvl: null, heroIlvl: null, source: null, sourceType: null },
    OFF_HAND:  null, // Survival Hunter uses a 2H polearm — no off-hand slot
  },

};

// Default fallback — used when a spec has no BiS list yet
const BIS_LIST = BIS_LISTS.Shadow;

// Current-season raids — only these are shown in the Raid Progress widget.
// Update each tier/season alongside the BiS list above.
const CURRENT_RAID_NAMES = [
  'The Voidspire',
  'The Dreamrift',
  "March on Quel'Danas",
];

// ── Slot display metadata (spec-agnostic) ────────────────────────
const SLOT_META = {
  HEAD:      { label: "Head",        icon: "🪖" },
  NECK:      { label: "Neck",        icon: "📿" },
  SHOULDER:  { label: "Shoulders",   icon: "🫸" },
  BACK:      { label: "Cloak",       icon: "🧥" },
  CHEST:     { label: "Chest",       icon: "👘" },
  WRIST:     { label: "Wrists",      icon: "🔗" },
  HANDS:     { label: "Hands",       icon: "🧤" },
  WAIST:     { label: "Waist",       icon: "🎗" },
  LEGS:      { label: "Legs",        icon: "👖" },
  FEET:      { label: "Feet",        icon: "👟" },
  FINGER_1:  { label: "Ring 1",      icon: "💍" },
  FINGER_2:  { label: "Ring 2",      icon: "💍" },
  TRINKET_1: { label: "Trinket 1",   icon: "🔮" },
  TRINKET_2: { label: "Trinket 2",   icon: "🔮" },
  MAIN_HAND: { label: "Main Hand",   icon: "⚔" },
  OFF_HAND:  { label: "Off Hand",    icon: "📖" },
};
