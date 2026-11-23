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
  /** 맨 뒤에 까는 배경 그림 backdrop.webp (클라이밍 벽): 뒷머리가 벽 앞 · 몸 뒤에 오게 */
  backdrop: boolean;
  accs: readonly string[];
};

/** 작은 그림(sm/) 세로 px */
export const SPRITE_SM_H = 160;

export const SPRITE_MANIFEST = {
  "cheer": {
    "fw": 294,
    "fh": 400,
    "sw": 884,
    "smSw": 354,
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "climbing": {
    "fw": 254,
    "fh": 400,
    "sw": 764,
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
    "backdrop": true,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "hometraining": {
    "fw": 278,
    "fh": 400,
    "sw": 836,
    "smSw": 334,
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "jiujitsu": {
    "fw": 513,
    "fh": 400,
    "sw": 1539,
    "smSw": 616,
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "pilates": {
    "fw": 548,
    "fh": 400,
    "sw": 1644,
    "smSw": 658,
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "sad": {
    "fw": 263,
    "fh": 400,
    "sw": 791,
    "smSw": 316,
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  },
  "yoga": {
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
    "backdrop": false,
    "accs": [
      "headband",
      "cap",
      "glasses",
      "earphones",
      "towel",
      "wristbands",
      "chicken"
    ]
  }
} as const satisfies Record<string, SpriteMeta>;
