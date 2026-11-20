// 자동 생성: node scripts/gen-avatar2-manifest.mjs (public/avatar2/*/meta.json). 손으로 고치지 않는다.
export type SpriteMeta = {
  /** 한 칸 가로 · 세로 (px) */
  fw: number;
  fh: number;
  /** 띠 그림 전체 가로 (칸 수 × fw 와 1~2px 다를 수 있다) */
  sw: number;
  frames: number;
  outfits: readonly string[];
  hairs: readonly string[];
  props: boolean;
  accs: readonly string[];
};

export const SPRITE_MANIFEST = {
  "climbing": {
    "fw": 254,
    "fh": 400,
    "sw": 763,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": false,
    "accs": []
  },
  "gym": {
    "fw": 304,
    "fh": 400,
    "sw": 914,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": true,
    "accs": []
  },
  "idle": {
    "fw": 206,
    "fh": 400,
    "sw": 618,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": false,
    "accs": []
  },
  "jiujitsu": {
    "fw": 474,
    "fh": 400,
    "sw": 1423,
    "frames": 3,
    "outfits": [
      "gi"
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
    "props": false,
    "accs": []
  },
  "pilates": {
    "fw": 506,
    "fh": 400,
    "sw": 1519,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": false,
    "accs": []
  },
  "running": {
    "fw": 189,
    "fh": 400,
    "sw": 569,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": false,
    "accs": []
  },
  "sleep": {
    "fw": 554,
    "fh": 400,
    "sw": 1664,
    "frames": 3,
    "outfits": [
      "tee",
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
    "props": false,
    "accs": []
  },
  "taekwondo": {
    "fw": 227,
    "fh": 400,
    "sw": 682,
    "frames": 3,
    "outfits": [
      "dobok"
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
    "props": false,
    "accs": []
  }
} as const satisfies Record<string, SpriteMeta>;
