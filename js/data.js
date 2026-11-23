/**
 * GOD WARS: ASGARD ROYALE — COMPLETE APEX LEGENDS SYSTEM DATA
 * - 6 Playable Mythological Gods (Loki, Thor, Hades, Zeus, Hela, Valkyrie)
 * - 6 Divine Custom Firearms (P90, Kriss Vector, M4A1, Uzi, AK-47, Magnum) with Fire Modes & 4 Attachment Slots
 * - 4 Weapon Attachment Categories (Barrel Stabilizer, Extended Rune Mag, Holographic Optic, Divine Hop-Up)
 * - 3 Divine Bombs (Ragnarok Solar Bomb, Apollo Flashbang, Yggdrasil Arc Star)
 * - 4 Apex Healing Items (Shield Cell, Shield Battery, Ambrosia Medkit, Phoenix Nectar)
 * - Game Modes: Trios Squad Royale (with 2 Allied AI God Squadmates!), Solos Free-For-All (16P), Firing Range
 */

window.GODWARS_DATA = {
  MATCH_CONFIG: {
    totalPlayers: 16,
    islandRadius: 240,
    dropshipHeight: 118,
    dropshipSpeed: 34,
    carePackageInterval: 38,
    ringPhases: [
      { round: 1, waitTime: 38, shrinkTime: 30, targetRadius: 175, damagePerSec: 3 },
      { round: 2, waitTime: 30, shrinkTime: 25, targetRadius: 110, damagePerSec: 7 },
      { round: 3, waitTime: 24, shrinkTime: 22, targetRadius: 55,  damagePerSec: 14 },
      { round: 4, waitTime: 18, shrinkTime: 20, targetRadius: 12,  damagePerSec: 22 }
    ]
  },

  EVO_TIERS: {
    1: { level: 1, name: 'LV1 WHITE RUNE',  maxShield: 50,  cells: 2, color: '#e2e8f0', hex: 0xe2e8f0, nextThreshold: 120 },
    2: { level: 2, name: 'LV2 BLUE RUNE',   maxShield: 75,  cells: 3, color: '#38bdf8', hex: 0x38bdf8, nextThreshold: 280 },
    3: { level: 3, name: 'LV3 PURPLE RUNE', maxShield: 100, cells: 4, color: '#a855f7', hex: 0xa855f7, nextThreshold: 500 },
    4: { level: 4, name: 'LV4 GOLD RUNE',   maxShield: 100, cells: 4, color: '#fbbf24', hex: 0xfbbf24, nextThreshold: 750, selfRevive: true },
    5: { level: 5, name: 'LV5 MYTHIC RED', maxShield: 125, cells: 5, color: '#f43f5e', hex: 0xf43f5e, nextThreshold: null, selfRevive: true }
  },

  ATTACHMENTS: {
    barrel: {
      name: 'Barrel Stabilizer',
      tiers: {
        0: { level: 0, name: 'No Barrel', color: '#475569', recoilMult: 1.0, spreadMult: 1.0 },
        1: { level: 1, name: 'Lv1 Bronze Stabilizer', color: '#e2e8f0', recoilMult: 0.85, spreadMult: 0.9 },
        2: { level: 2, name: 'Lv2 Bifrost Stabilizer', color: '#38bdf8', recoilMult: 0.72, spreadMult: 0.8 },
        3: { level: 3, name: 'Lv3 Valkyrie Stabilizer', color: '#a855f7', recoilMult: 0.58, spreadMult: 0.7 },
        4: { level: 4, name: 'Lv4 Gold Flash Suppressor', color: '#fbbf24', recoilMult: 0.42, spreadMult: 0.55 }
      }
    },
    mag: {
      name: 'Extended Rune Mag',
      tiers: {
        0: { level: 0, name: 'Standard Mag', color: '#475569', capMult: 1.0, reloadMult: 1.0 },
        1: { level: 1, name: 'Lv1 Extended Mag', color: '#e2e8f0', capMult: 1.15, reloadMult: 0.94 },
        2: { level: 2, name: 'Lv2 Blue Rune Mag', color: '#38bdf8', capMult: 1.25, reloadMult: 0.88 },
        3: { level: 3, name: 'Lv3 Purple Rune Mag', color: '#a855f7', capMult: 1.38, reloadMult: 0.80 },
        4: { level: 4, name: 'Lv4 Gold Auto-Loader Mag', color: '#fbbf24', capMult: 1.5, reloadMult: 0.72, autoReloadHolstered: true }
      }
    },
    optic: {
      name: 'Rune Optic Sight',
      tiers: {
        0: { level: 0, name: '1x Iron Rune Sight', color: '#475569', zoomMult: 1.0, label: '1X RUNE' },
        1: { level: 1, name: '1x Heimdall Holo', color: '#e2e8f0', zoomMult: 0.92, label: '1X HOLO' },
        2: { level: 2, name: '2x Odin Sight', color: '#38bdf8', zoomMult: 0.78, label: '2X ODIN' },
        3: { level: 3, name: '3x Valkyrie Scope', color: '#a855f7', zoomMult: 0.68, label: '3X SCOPE' },
        4: { level: 4, name: '1x-2x Gold Seer Sight', color: '#fbbf24', zoomMult: 0.74, label: '1-2X SEER', threatHighlight: true }
      }
    },
    hopup: {
      name: 'Divine Hop-Up',
      tiers: {
        0: { level: 0, name: 'No Hop-Up', color: '#475569', dmgMult: 1.0, rpmMult: 1.0 },
        1: { level: 1, name: 'Lv1 Quickdraw Stock', color: '#e2e8f0', dmgMult: 1.04, rpmMult: 1.03 },
        2: { level: 2, name: 'Lv2 Shieldbreaker Runes', color: '#38bdf8', dmgMult: 1.10, rpmMult: 1.05 },
        3: { level: 3, name: 'Lv3 Forge-Point Rounds', color: '#a855f7', dmgMult: 1.16, rpmMult: 1.08 },
        4: { level: 4, name: 'Lv4 Mythic Overcharger', color: '#fbbf24', dmgMult: 1.24, rpmMult: 1.14 }
      }
    }
  },

  HEAL_ITEMS: {
    shield_cell: {
      id: 'shield_cell',
      name: 'Bifrost Shield Cell',
      shortName: 'SHIELD CELL',
      castTime: 1.2,
      shieldRestore: 25,
      hpRestore: 0,
      color: '#38bdf8',
      icon: '🔹'
    },
    shield_battery: {
      id: 'shield_battery',
      name: 'Asgard Shield Battery',
      shortName: 'SHIELD BATTERY',
      castTime: 2.1,
      shieldRestore: 999,
      hpRestore: 0,
      color: '#0284c7',
      icon: '⚡'
    },
    medkit: {
      id: 'medkit',
      name: 'Ambrosia Medkit',
      shortName: 'MEDKIT',
      castTime: 2.4,
      shieldRestore: 0,
      hpRestore: 999,
      color: '#10b981',
      icon: '➕'
    },
    phoenix_kit: {
      id: 'phoenix_kit',
      name: 'Idunn Golden Nectar',
      shortName: 'NECTAR KIT',
      castTime: 3.4,
      shieldRestore: 999,
      hpRestore: 999,
      color: '#a855f7',
      icon: '🔥'
    }
  },

  HEROES: {
    loki: {
      id: 'loki',
      name: 'LOKI',
      title: 'God of Mischief & Illusions',
      role: 'Skirmisher / Recon',
      classIcon: '🎭',
      pantheon: 'Norse • Asgard',
      color: '#10b981',
      accentColor: '#fbbf24',
      hexColor: 0x10b981,
      hexAccent: 0xfbbf24,
      speedMult: 1.08,
      maxHp: 100,
      quote: '"Trust your eyes? In Asgard, that is your first mistake."',
      meleeName: 'Jötunheim Frost Daggers',
      finisherName: 'Illusion Backstab Execution',
      passiveName: 'Shadow Trickster',
      passiveDesc: '+15% slide speed & silent footsteps. Highlights nearby enemies within 25m when aiming.',
      tacticalName: 'Phantom Decoy & Cloak',
      tacticalDesc: 'Spawns a holographic Loki clone that sprints forward drawing enemy fire while granting 3.5s phase stealth & +30% speed.',
      tacticalCooldown: 14,
      ultimateName: 'Ragnarok Mirror Realm',
      ultimateDesc: 'Summons 5 armed illusion clones around you, disorienting nearby foes and boosting weapon critical damage by +35% for 10s.',
      ultimateChargeTime: 65,
      defaultWeapons: ['p90', 'uzi'],
      lore: 'Armed with frost-forged daggers and prism illusions, Loki turns every skirmish in Asgard into a deadly guessing game.'
    },
    thor: {
      id: 'thor',
      name: 'THOR',
      title: 'God of Thunder',
      role: 'Assault / Vanguard',
      classIcon: '⚡',
      pantheon: 'Norse • Asgard',
      color: '#38bdf8',
      accentColor: '#f59e0b',
      hexColor: 0x38bdf8,
      hexAccent: 0xf59e0b,
      speedMult: 1.0,
      maxHp: 110,
      quote: '"Bring me the storm! Mjölnir hungers for battle."',
      meleeName: 'Mjölnir Thunder Crusher',
      finisherName: 'Mjölnir Sky Verdict',
      passiveName: 'Mjölnir Static Core',
      passiveDesc: 'Sprinting builds Thunder Charge. Fully charged shots trigger chain lightning for +14 bonus arc damage.',
      tacticalName: 'Mjölnir Arc Bolt',
      tacticalDesc: 'Hurls a bolt of Asgardian lightning that chains between enemies in an 11m radius for 38 shield/HP damage and slows them.',
      tacticalCooldown: 13,
      ultimateName: 'Bifrost Sky Slam',
      ultimateDesc: 'Leaps high into the storm clouds and crashes down with Mjölnir, dealing up to 90 AoE thunder damage and knocking enemies back.',
      ultimateChargeTime: 70,
      defaultWeapons: ['m4a1', 'magnum'],
      lore: 'Wielding the tempest of the Nine Realms, Thor shatters enemy fortifications from the sky.'
    },
    hades: {
      id: 'hades',
      name: 'HADES',
      title: 'Lord of the Underworld',
      role: 'Support / Controller',
      classIcon: '💀',
      pantheon: 'Greek • Guest of Asgard',
      color: '#a855f7',
      accentColor: '#ef4444',
      hexColor: 0xa855f7,
      hexAccent: 0xef4444,
      speedMult: 1.0,
      maxHp: 105,
      quote: '"Valhalla or Tartarus—all souls eventually bow to me."',
      meleeName: 'Bident of Tartarus',
      finisherName: 'Soul Harvest Reaping',
      passiveName: 'Soul Siphon',
      passiveDesc: 'Every elimination immediately restores 45 Rune Armor and 30 Health from fallen souls.',
      tacticalName: 'Stygian Wave',
      tacticalDesc: 'Unleashes a dark spectral surge forward that deals 35 damage to enemies and heals Hades for 100% of damage dealt.',
      tacticalCooldown: 15,
      ultimateName: 'Domain of Tartarus',
      ultimateDesc: 'Deploys a 14m Underworld Soul Dome for 11s that drains enemy shields (14/s) while rapidly regenerating your own armor.',
      ultimateChargeTime: 75,
      defaultWeapons: ['ak47', 'kriss'],
      lore: 'Every soul spilled on Asgard’s golden soil only strengthens the Sovereign of Tartarus.'
    },
    zeus: {
      id: 'zeus',
      name: 'ZEUS',
      title: 'King of Olympus',
      role: 'Assault / Artillery',
      classIcon: '👑',
      pantheon: 'Greek • Guest of Asgard',
      color: '#facc15',
      accentColor: '#fef08a',
      hexColor: 0xfacc15,
      hexAccent: 0x38bdf8,
      speedMult: 1.02,
      maxHp: 105,
      quote: '"The skies of Asgard now answer to the King of Olympus."',
      meleeName: 'Olympian Thunderbolt Fist',
      finisherName: 'Judgment of Olympus',
      passiveName: 'Olympian Overcharge',
      passiveDesc: '+20% faster weapon reload speed and golden thunder rounds that deal +15% extra damage to Rune Shields.',
      tacticalName: 'Aegis Thunder Wall',
      tacticalDesc: 'Deploys a golden one-way energy barrier in front of you that blocks incoming fire and amps your bullets by +20%.',
      tacticalCooldown: 16,
      ultimateName: 'Wrath of Olympus',
      ultimateDesc: 'Calls down an orbital barrage of 6 sky-piercing lightning pillars on the targeted zone, dealing massive area damage.',
      ultimateChargeTime: 80,
      defaultWeapons: ['m4a1', 'ak47'],
      lore: 'When Zeus points his bolt across the clouds of Asgard, the heavens themselves obey.'
    },
    hela: {
      id: 'hela',
      name: 'HELA',
      title: 'Goddess of Death',
      role: 'Assault / Executioner',
      classIcon: '🗡️',
      pantheon: 'Norse • Helheim',
      color: '#14b8a6',
      accentColor: '#0f172a',
      hexColor: 0x14b8a6,
      hexAccent: 0x22c55e,
      speedMult: 1.06,
      maxHp: 100,
      quote: '"Kneel before the rightful Queen of Asgard."',
      meleeName: 'Obsidian Necroblade',
      finisherName: 'Helheim Skewering',
      passiveName: 'Death Seeker Vision',
      passiveDesc: 'Damaged enemies below 60 HP glow bright emerald-crimson and take +15% execution damage.',
      tacticalName: 'Necrosword Volley',
      tacticalDesc: 'Launches 3 fan-shaped obsidian Necroswords that pierce cover/armor for 32 damage each plus bleed.',
      tacticalCooldown: 12,
      ultimateName: 'Empress of Helheim',
      ultimateDesc: 'Ascends in dark armor for 10s: grants +75 temporary Death Shield, infinite magazine ammo, and +25% fire rate.',
      ultimateChargeTime: 65,
      defaultWeapons: ['kriss', 'magnum'],
      lore: 'Banished to the roots of Yggdrasil, Hela returns to claim Asgard and every warrior upon it.'
    },
    valkyrie: {
      id: 'valkyrie',
      name: 'VALKYRIE',
      title: 'Winged Chooser of the Slain',
      role: 'Skirmisher / Aerial',
      classIcon: '🪽',
      pantheon: 'Norse • Valhalla',
      color: '#f97316',
      accentColor: '#fde047',
      hexColor: 0xf97316,
      hexAccent: 0xfde047,
      speedMult: 1.05,
      maxHp: 100,
      quote: '"The skies belong to the Valkyries. Nowhere to run, nowhere to hide."',
      meleeName: 'Dragonfang Spear Thrust',
      finisherName: 'Wings of Valhalla Strike',
      passiveName: 'VTOL Einherjar Wings',
      passiveDesc: 'Hold or double-tap JUMP in mid-air to ignite golden Valkyrie jetpack wings for high-ground repositioning.',
      tacticalName: 'Celestial Spear Swarm',
      tacticalDesc: 'Fires a salvo of 6 homing micro-lances that rain down on target area, dealing explosive damage and stunning aim.',
      tacticalCooldown: 14,
      ultimateName: 'Skyward Ascension',
      ultimateDesc: 'Blasts 90m straight into the sky and engages aerial skydive mode while scanning all living enemies on your HUD!',
      ultimateChargeTime: 70,
      defaultWeapons: ['p90', 'm4a1'],
      lore: 'Soaring above the golden spires of Valhalla, Valkyrie rules the skies of Asgard.'
    }
  },

  WEAPONS: {
    p90: {
      id: 'p90',
      baseName: 'P90',
      divineName: 'HEIMDALL PDW',
      ammoType: 'LIGHT RUNE',
      category: 'Divine Submachine Gun',
      desc: 'Bullpup P90 infused with a glowing rainbow-cyan Bifrost crystal top magazine. Massive 50-round capacity with laser hipfire.',
      damage: 14,
      headshotMult: 1.6,
      rpm: 860,
      magSize: 50,
      reserveAmmo: 250,
      reloadTime: 2.1,
      range: 130,
      spread: 0.017,
      adsSpread: 0.0045,
      adsFov: 58,
      recoilPitch: 0.0075,
      recoilYaw: 0.0055,
      // P1-2: Apex Learnable Recoil Pattern (Pitch, Yaw per consecutive shot)
      recoilPattern: [
        [0.008, 0.001], [0.008, 0.002], [0.009, 0.003], [0.009, 0.002], [0.008, -0.002],
        [0.007, -0.004], [0.007, -0.003], [0.006, 0.002], [0.006, 0.004], [0.005, 0.001]
      ],
      color: '#38bdf8',
      hexColor: 0x38bdf8,
      hexSecondary: 0xfbbf24,
      auto: true,
      modes: ['AUTO', 'BURST']
    },
    kriss: {
      id: 'kriss',
      baseName: 'KRISS VECTOR',
      divineName: 'FENRIR FANG',
      ammoType: 'LIGHT RUNE',
      category: 'Mythic Hyper-SMG',
      desc: 'Kriss Vector engineered with Fenrir’s Super-V recoil mitigation and crimson rune fangs. Blistering 1050 RPM close-range shredder.',
      damage: 13,
      headshotMult: 1.55,
      rpm: 1050,
      magSize: 32,
      reserveAmmo: 224,
      reloadTime: 1.75,
      range: 105,
      spread: 0.019,
      adsSpread: 0.0055,
      adsFov: 60,
      recoilPitch: 0.006,
      recoilYaw: 0.0045,
      recoilPattern: [
        [0.009, -0.001], [0.010, -0.002], [0.010, -0.002], [0.009, 0.001], [0.008, 0.003],
        [0.008, 0.003], [0.007, -0.002], [0.006, -0.003], [0.006, 0.001], [0.005, 0.002]
      ],
      color: '#f43f5e',
      hexColor: 0xf43f5e,
      hexSecondary: 0x1e293b,
      auto: true,
      modes: ['AUTO', 'SINGLE']
    },
    m4a1: {
      id: 'm4a1',
      baseName: 'M4A1',
      divineName: 'ODIN CARBINE',
      ammoType: 'ENERGY RUNE',
      category: 'Divine Assault Rifle',
      desc: 'Tactical M4A1 forged in gold-titanium with Valkyrie wing guards and an Asgardian rune holographic sight. Pinpoint mid-to-long range precision.',
      damage: 19,
      headshotMult: 1.85,
      rpm: 690,
      magSize: 32,
      reserveAmmo: 192,
      reloadTime: 2.0,
      range: 200,
      spread: 0.014,
      adsSpread: 0.0022,
      adsFov: 50,
      recoilPitch: 0.010,
      recoilYaw: 0.0038,
      // R-301 style steady vertical-right-left learnable pattern
      recoilPattern: [
        [0.011, 0.001], [0.011, 0.002], [0.010, 0.003], [0.010, 0.003], [0.009, 0.001],
        [0.008, -0.003], [0.008, -0.004], [0.007, -0.003], [0.007, 0.002], [0.006, 0.002]
      ],
      color: '#fbbf24',
      hexColor: 0xfbbf24,
      hexSecondary: 0xf8fafc,
      auto: true,
      modes: ['AUTO', 'SINGLE']
    },
    uzi: {
      id: 'uzi',
      baseName: 'UZI',
      divineName: 'ZEPHYR MICRO',
      ammoType: 'LIGHT RUNE',
      category: 'Speedster Micro-SMG',
      desc: 'Ultra-compact Micro-Uzi adorned with winged golden Hermes stabilizers. Instant draw speed and lethal accuracy while sliding or flying.',
      damage: 13,
      headshotMult: 1.5,
      rpm: 960,
      magSize: 36,
      reserveAmmo: 216,
      reloadTime: 1.45,
      range: 95,
      spread: 0.015,
      adsSpread: 0.006,
      adsFov: 62,
      recoilPitch: 0.0068,
      recoilYaw: 0.0065,
      color: '#2dd4bf',
      hexColor: 0x2dd4bf,
      hexSecondary: 0xfacc15,
      auto: true,
      modes: ['AUTO']
    },
    ak47: {
      id: 'ak47',
      baseName: 'AK-47',
      divineName: 'SURTR WRATH',
      ammoType: 'HEAVY MAGMA',
      category: 'Volcanic Heavy Rifle',
      desc: 'Heavy AK-47 infused with the eternal magma of Surtr. Fires incendiary rune rounds that hit like a truck and sear through Rune Shields.',
      damage: 25,
      headshotMult: 1.9,
      rpm: 560,
      magSize: 30,
      reserveAmmo: 180,
      reloadTime: 2.25,
      range: 210,
      spread: 0.019,
      adsSpread: 0.0035,
      adsFov: 52,
      recoilPitch: 0.015,
      recoilYaw: 0.006,
      // Flatline / AK-47 heavy up-left-right zigzag pattern
      recoilPattern: [
        [0.016, -0.004], [0.016, -0.006], [0.015, -0.005], [0.014, 0.004], [0.013, 0.007],
        [0.013, 0.006], [0.012, -0.005], [0.011, -0.006], [0.010, 0.004], [0.010, 0.005]
      ],
      color: '#f97316',
      hexColor: 0xf97316,
      hexSecondary: 0x7c2d12,
      auto: true,
      modes: ['AUTO', 'SINGLE']
    },
    magnum: {
      id: 'magnum',
      baseName: 'MAGNUM .50',
      divineName: 'GUNGNIR CANNON',
      ammoType: 'SNIPER .50',
      category: 'Mythic Heavy Handcannon',
      desc: 'Revolving heavy Magnum sculpted from Odin’s spear Gungnir. High-skill handcannon with devastating 46 body / 96 headshot damage.',
      damage: 46,
      headshotMult: 2.1,
      rpm: 175,
      magSize: 8,
      reserveAmmo: 72,
      reloadTime: 1.8,
      range: 220,
      spread: 0.008,
      adsSpread: 0.0008,
      adsFov: 50,
      recoilPitch: 0.038,
      recoilYaw: 0.004,
      color: '#e879f9',
      hexColor: 0xe879f9,
      hexSecondary: 0xfacc15,
      auto: false,
      modes: ['SINGLE']
    }
  },

  GRENADES: {
    solar_bomb: {
      id: 'solar_bomb',
      name: 'Ragnarok Solar Bomb',
      shortName: 'SOLAR BOMB',
      baseType: 'Divine Frag Bomb',
      color: '#f97316',
      hexColor: 0xf97316,
      damage: 95,
      radius: 13,
      fuseTime: 2.3,
      icon: '💥',
      desc: 'Detonates in a miniature Asgardian supernova, dealing up to 95 blast damage and launching enemies.'
    },
    apollo_flash: {
      id: 'apollo_flash',
      name: 'Apollo Celestial Flashbang',
      shortName: 'GOD FLASH',
      baseType: 'Divine Flashbang',
      color: '#fef08a',
      hexColor: 0xfef08a,
      damage: 20,
      radius: 16,
      fuseTime: 1.5,
      icon: '⚡',
      desc: 'Erupts with blinding solar radiance that whites out enemy vision and scrambles AI targeting for 4.5s.'
    },
    yggdrasil_arc: {
      id: 'yggdrasil_arc',
      name: 'Yggdrasil Arc Rune',
      shortName: 'ARC RUNE',
      baseType: 'Sticky Lightning Bomb',
      color: '#38bdf8',
      hexColor: 0x38bdf8,
      damage: 75,
      radius: 11,
      fuseTime: 1.9,
      icon: '✦',
      desc: 'Sticks to surfaces or armor and detonates in an EMP lightning field that shatters Rune Shields.'
    }
  },

  POIS: [
    {
      id: 'valhalla',
      name: 'VALHALLA CITADEL',
      x: 0,
      z: 0,
      radius: 45,
      tier: 'MYTHIC LOOT',
      color: '#fbbf24',
      desc: 'The Golden Hall of Odin at the center of Asgard. Two-story Royal Palaces, Skybridges, Champion Banners & Replicator.'
    },
    {
      id: 'bifrost',
      name: 'BIFROST OBSERVATORY',
      x: 0,
      z: 135,
      radius: 38,
      tier: 'HIGH LOOT',
      color: '#38bdf8',
      desc: 'Elevated Rainbow Bridge, 2-story Heimdall Observatory, Rooftop Survey Beacon & Spinning Bifrost Stargate.'
    },
    {
      id: 'forge',
      name: 'MJÖLNIR DWARVEN FORGE',
      x: -115,
      z: 35,
      radius: 38,
      tier: 'HIGH LOOT',
      color: '#f97316',
      desc: 'Twin 2-story Smelting Foundries connected by Skybridge over a Molten Lava Canal, Forge Hammer & Replicator.'
    },
    {
      id: 'yggdrasil',
      name: 'YGGDRASIL SANCTUARY',
      x: 115,
      z: 30,
      radius: 40,
      tier: 'HIGH LOOT',
      color: '#10b981',
      desc: 'Colossal World Tree with wrap-around Treehouse Bastion Deck, Ramps, and 2 Sanctuary Shrines.'
    },
    {
      id: 'helheim',
      name: 'HELHEIM CRYPTS',
      x: -85,
      z: -105,
      radius: 36,
      tier: 'MID-HIGH LOOT',
      color: '#14b8a6',
      desc: '2-Story Obsidian Keep of Hel flanked by East & West Crypt Bunkers and glowing Soul Monoliths.'
    },
    {
      id: 'skydocks',
      name: 'VALKYRIE SKY DOCKS',
      x: 90,
      z: -100,
      radius: 38,
      tier: 'HIGH LOOT',
      color: '#e879f9',
      desc: 'Twin Aircraft Hangars, elevated Helipad Flight Deck with docked Golden Sky-Skiff, and Replicator.'
    }
  ],

  ZIPLINES: [
    { id: 'zip_bifrost',  name: 'Valhalla ⇄ Bifrost Bridge',   start: [0, 6.5, 34],    end: [0, 6.5, 118] },
    { id: 'zip_forge',    name: 'Valhalla ⇄ Mjölnir Forge',    start: [-24, 6.5, 8],   end: [-92, 6.5, 32] },
    { id: 'zip_ygg',      name: 'Valhalla ⇄ Yggdrasil Tree',   start: [24, 6.5, 8],    end: [94, 6.5, 28] },
    { id: 'zip_helheim',  name: 'Valhalla ⇄ Helheim Crypts',   start: [-20, 6.5, -28], end: [-68, 6.5, -88] },
    { id: 'zip_skydocks', name: 'Valhalla ⇄ Valkyrie Docks',   start: [20, 6.5, -28],  end: [72, 6.5, -86] },
    { id: 'zip_north',    name: 'Helheim ⇄ Valkyrie Docks',    start: [-62, 6.0, -102], end: [66, 6.5, -98] }
  ],

  BOT_NAMES: [
    'ODIN_Allfather', 'FREYJA_Valkyr', 'BALDUR_Light', 'HEIMDALL_Watch',
    'ARES_WarGod', 'ATHENA_Aegis', 'APOLLO_Sun', 'ARTEMIS_Hunt',
    'FENRIR_Alpha', 'TYR_Justice', 'HERMES_Swift', 'NEMESIS_Veng',
    'ANUBIS_Soul', 'SURTR_Flame', 'SKADI_Frost'
  ],

  // BATCH 1: Apex 4-Way Tactical Ping Types & Squadmate Replies
  PING_TYPES: {
    enemy:  { id: 'enemy',  label: 'ENEMY SPOTTED',  icon: '⚠️', color: '#f43f5e', allyReply: 'Copy that! Engaging hostile!' },
    go:     { id: 'go',     label: 'MOVING HERE',    icon: '📍', color: '#38bdf8', allyReply: 'Roger, rotating to your ping!' },
    defend: { id: 'defend', label: 'DEFENDING AREA', icon: '🛡️', color: '#10b981', allyReply: 'Holding this perimeter with you!' },
    loot:   { id: 'loot',   label: 'LOOT OVER HERE', icon: '📦', color: '#fbbf24', allyReply: 'Dibs! On my way for that gear!' }
  },

  // BATCH 2: Apex Legend Upgrade Perks (Evo Lv2 Blue & Lv3 Purple)
  LEGEND_PERKS: {
    loki: {
      2: [
        { id: 'loki_cloak', name: 'SHADOW STEP', desc: '+2.5s Phase Cloak duration on Tactical', effect: { cloakBonus: 2.5 } },
        { id: 'loki_cd',    name: 'TRICKSTER COOLDOWN', desc: '-25% Tactical Cooldown', effect: { tacCdMult: 0.75 } }
      ],
      3: [
        { id: 'loki_speed', name: 'PHANTOM SPRINT', desc: '+12% Base Movement Speed', effect: { speedBonus: 0.12 } },
        { id: 'loki_ult',   name: 'ILLUSION MASTER', desc: '+35% Faster Ultimate Charge', effect: { ultChargeBonus: 0.35 } }
      ]
    },
    thor: {
      2: [
        { id: 'thor_cd',    name: 'STORMCALLER', desc: '-25% Mjölnir Arc Bolt Cooldown', effect: { tacCdMult: 0.75 } },
        { id: 'thor_slide', name: 'THUNDER SLIDE', desc: '+22% Slide Boost Velocity', effect: { slideBoostBonus: 0.22 } }
      ],
      3: [
        { id: 'thor_siphon', name: 'ALLFATHER AEGIS', desc: 'Restore +30 Rune Armor on Knock/Kill', effect: { shieldOnKill: 30 } },
        { id: 'thor_dmg',    name: 'OVERCHARGED RUNES', desc: '+10% Weapon Damage vs Shields', effect: { dmgMult: 1.10 } }
      ]
    },
    hades: {
      2: [
        { id: 'hades_cd',   name: 'SOUL HARVEST', desc: '-25% Stygian Wave Cooldown', effect: { tacCdMult: 0.75 } },
        { id: 'hades_siph', name: 'UNDERWORLD LEECH', desc: 'Restore +35 Shield on Kill', effect: { shieldOnKill: 35 } }
      ],
      3: [
        { id: 'hades_ult',  name: 'ABYSSAL SURGE', desc: '+35% Faster Ultimate Charge', effect: { ultChargeBonus: 0.35 } },
        { id: 'hades_spd',  name: 'WRAITH STRIDE', desc: '+12% Movement Speed', effect: { speedBonus: 0.12 } }
      ]
    },
    zeus: {
      2: [
        { id: 'zeus_cd',    name: 'AEGIS FORTIFY', desc: '-25% Thunder Wall Cooldown', effect: { tacCdMult: 0.75 } },
        { id: 'zeus_dmg',   name: 'OLYMPUS BOLT', desc: '+10% Weapon Damage', effect: { dmgMult: 1.10 } }
      ],
      3: [
        { id: 'zeus_ult',   name: 'SKY KING WRATH', desc: '+35% Faster Orbital Storm Charge', effect: { ultChargeBonus: 0.35 } },
        { id: 'zeus_siph',  name: 'DIVINE RECHARGE', desc: 'Restore +30 Shield on Kill', effect: { shieldOnKill: 30 } }
      ]
    },
    hela: {
      2: [
        { id: 'hela_cd',    name: 'BLADE STORM', desc: '-25% Necrosword Volley Cooldown', effect: { tacCdMult: 0.75 } },
        { id: 'hela_dmg',   name: 'EXECUTIONER', desc: '+10% Weapon Damage', effect: { dmgMult: 1.10 } }
      ],
      3: [
        { id: 'hela_siph',  name: 'HELHEIM FEAST', desc: 'Restore +40 Shield on Kill', effect: { shieldOnKill: 40 } },
        { id: 'hela_spd',   name: 'DEATH WALK', desc: '+12% Movement Speed', effect: { speedBonus: 0.12 } }
      ]
    },
    valkyrie: {
      2: [
        { id: 'valk_fuel',  name: 'AFTERBURNER', desc: '+45% Faster Jetpack Fuel Regen', effect: { jetpackFuelBonus: 0.45 } },
        { id: 'valk_cd',    name: 'SPEAR SALVO', desc: '-25% Celestial Swarm Cooldown', effect: { tacCdMult: 0.75 } }
      ],
      3: [
        { id: 'valk_slide', name: 'AERODYNAMIC GLIDE', desc: '+22% Slide Boost Velocity', effect: { slideBoostBonus: 0.22 } },
        { id: 'valk_ult',   name: 'SKYWARD READY', desc: '+35% Faster Ultimate Charge', effect: { ultChargeBonus: 0.35 } }
      ]
    }
  },

  // BATCH 8: God Holo-Sprays & Quips
  HOLO_SPRAYS: {
    loki:     { icon: '🐍', text: 'BOW TO THE GOD OF MISCHIEF', color: '#10b981', quip: '"You were shooting my decoy the whole time!"' },
    thor:     { icon: '⚡', text: 'WORTHY OF MJÖLNIR',          color: '#38bdf8', quip: '"Bring me another challenger!"' },
    hades:    { icon: '💀', text: 'YOUR SOUL IS MINE',          color: '#a855f7', quip: '"The Underworld claims all champions."' },
    zeus:     { icon: '🌩️', text: 'KNEEL BEFORE OLYMPUS',       color: '#facc15', quip: '"Witness the true thunder of the skies!"' },
    hela:     { icon: '⚔️', text: 'KNEEL TO THE QUEEN OF HEL',  color: '#14b8a6', quip: '"Asgard falls before my blades."' },
    valkyrie: { icon: '🪽', text: 'THE SKIES BELONG TO ME',     color: '#f97316', quip: '"Fox-3 away. Clear skies ahead!"' }
  },

  // BATCH 10: Lobby Armory Weapon Skins (applied to 3D viewmodel & lobby!)
  WEAPON_SKINS: {
    divine_default: { id: 'divine_default', name: 'ASGARD DEFAULT',   color: '#fbbf24', hex: null,     emissive: null },
    molten_ragnarok:{ id: 'molten_ragnarok',name: 'MOLTEN RAGNAROK',  color: '#f97316', hex: 0x7c2d12, emissive: 0xf97316 },
    frost_jotunheim:{ id: 'frost_jotunheim',name: 'FROST JOTUNHEIM',  color: '#38bdf8', hex: 0x0c4a6e, emissive: 0x38bdf8 },
    royal_gold:     { id: 'royal_gold',     name: 'ALLFATHER GOLD',   color: '#fde047', hex: 0xd97706, emissive: 0xfde047 }
  }
};
