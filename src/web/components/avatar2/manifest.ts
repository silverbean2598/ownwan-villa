// 자동 생성: node scripts/gen-avatar2-manifest.mjs (public/avatar2/*/meta.json). 손으로 고치지 않는다.
export type SpriteMeta = {
  /** 한 칸 가로 · 세로 (px) */
  fw: number;
  fh: number;
  /** 띠 그림 전체 가로 (칸 수 × fw 와 1~2px 다를 수 있다) */
  sw: number;
  /** sm/ 작은 그림(세로 160px) 띠 가로 */
  smSw: number;
  frames: number;
  outfits: readonly string[];
  hairs: readonly string[];
  /** 머리가 몸 그림에 들어 있다 (주짓수 · 태권도): body-<도복>-<머리>-s<피부>, 머리 층 없음 */
  fullHair: boolean;
  props: boolean;
  accs: readonly string[];
};

/** 작은 그림(sm/) 세로 px */
export const SPRITE_SM_H = 160;

export const SPRITE_MANIFEST = {
  "climbing": {
    "fw": 255,
    "fh": 400,
    "sw": 765,
    "smSw": 306,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "gym": {
    "fw": 305,
    "fh": 400,
    "sw": 916,
    "smSw": 366,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": true,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "idle": {
    "fw": 275,
    "fh": 400,
    "sw": 827,
    "smSw": 331,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "jiujitsu": {
    "fw": 483,
    "fh": 400,
    "sw": 1449,
    "smSw": 580,
    "frames": 3,
    "outfits": [
      "gi",
      "gi-short",
      "gi-long",
      "gi-bun",
      "gi-buzz",
      "gi-part",
      "gi-afro",
      "gi-pigtails",
      "gi-ponytail",
      "gi-wolf",
      "gi-beanie"
    ],
    "hairs": [],
    "fullHair": true,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "pilates": {
    "fw": 537,
    "fh": 400,
    "sw": 1613,
    "smSw": 645,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "running": {
    "fw": 237,
    "fh": 400,
    "sw": 713,
    "smSw": 285,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "sleep": {
    "fw": 628,
    "fh": 400,
    "sw": 1885,
    "smSw": 754,
    "frames": 3,
    "outfits": [
      "tee",
      "tee-coral",
      "tee-orange",
      "tee-yellow",
      "tee-mint",
      "tee-navy",
      "tee-lavender",
      "tee-charcoal",
      "tank-joggers",
      "hoodie",
      "sports-bra-leggings",
      "singlet",
      "cycling-jersey",
      "rashguard"
    ],
    "hairs": [
      "short",
      "long",
      "bun",
      "buzz",
      "part",
      "afro",
      "pigtails",
      "ponytail",
      "wolf",
      "beanie"
    ],
    "fullHair": false,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  },
  "taekwondo": {
    "fw": 262,
    "fh": 400,
    "sw": 788,
    "smSw": 315,
    "frames": 3,
    "outfits": [
      "dobok",
      "dobok-short",
      "dobok-long",
      "dobok-bun",
      "dobok-buzz",
      "dobok-part",
      "dobok-afro",
      "dobok-pigtails",
      "dobok-ponytail",
      "dobok-wolf",
      "dobok-beanie"
    ],
    "hairs": [],
    "fullHair": true,
    "props": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands"
    ]
  }
} as const satisfies Record<string, SpriteMeta>;
