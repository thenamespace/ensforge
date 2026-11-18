import brantly from "../../../public/avatars/brantly.eth.webp?inline";
import envoy from "../../../public/avatars/envoy1084.eth.webp?inline";
import gregskril from "../../../public/avatars/gregskril.eth.webp?inline";
import jefflau from "../../../public/avatars/jefflau.eth.webp?inline";
import luc from "../../../public/avatars/luc.eth.webp?inline";
import nick from "../../../public/avatars/nick.eth.webp?inline";
import raffy from "../../../public/avatars/raffy.eth.webp?inline";
import vitalik from "../../../public/avatars/vitalik.eth.webp?inline";
import { Canvas } from "./frame";
import { accents, BG, COS, INK, iso, MUTED, OG, SIN } from "./primitives";

/**
 * The home image, after the landing hero: the headline centred over a faint isometric floor, with
 * flat name plates lying on its cells. Names, addresses and avatars are the hero's own (read from
 * mainnet once, avatars self-hosted), inlined so the image never loads them at render time.
 */

const CELL = 64;
/** A plate covers three cells along u and one along v, inset from the cell edges. */
const PLATE = { w: 3 * CELL - 8, h: CELL - 8 } as const;
const sky = "#b6dbeb";

/**
 * Eight plates in a ring around the headline, snapped to whole cells and point-symmetric about the
 * centre (the plates are parallelograms, so a mirror image would not sit on the grid). Cell (i, j)
 * puts a plate's centre at (600 + (i − j + 1)·55.4, 315 + (i + j + 2)·32).
 */
const plates = [
  {
    i: -7,
    j: -1,
    name: "vitalik.eth",
    address: "0xd8dA…6045",
    avatar: vitalik,
    accent: accents.contracts,
  },
  { i: -4, j: -4, name: "nick.eth", address: "0xb8c2…67d5", avatar: nick, accent: accents.sdk },
  {
    i: -1,
    j: -7,
    name: "brantly.eth",
    address: "0x9831…6744",
    avatar: brantly,
    accent: accents.hca,
  },
  { i: -6, j: 3, name: "raffy.eth", address: "0x5105…eeee", avatar: raffy, accent: sky },
  { i: 3, j: -4, name: "luc.eth", address: "0x225f…c3B5", avatar: luc, accent: accents.react },
  {
    i: -2,
    j: 6,
    name: "jefflau.eth",
    address: "0x866B…5eEE",
    avatar: jefflau,
    accent: accents.hca,
  },
  {
    i: 1,
    j: 3,
    name: "envoy1084.eth",
    address: "0xc0d8…1FE6",
    avatar: envoy,
    accent: accents.sdk,
  },
  {
    i: 4,
    j: 0,
    name: "gregskril.eth",
    address: "0x179A…9285",
    avatar: gregskril,
    accent: accents.contracts,
  },
] as const;

/** An accent laid over the background at `amount`, as an opaque colour, so the floor stays hidden. */
const tint = (accent: string, amount: number) => {
  const channel = (index: number) => {
    const from = Number.parseInt(BG.slice(index, index + 2), 16);
    const to = Number.parseInt(accent.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${channel(1)}${channel(3)}${channel(5)}`;
};

/** The floor's grid lines, every CELL along u and v, long enough to cross the canvas. */
function Floor() {
  const reach = 14 * CELL;
  const at = iso(OG.width / 2, OG.height / 2);
  const lines: string[] = [];

  for (let k = -14; k <= 14; k++) {
    lines.push(`M${at(k * CELL, -reach, 0).join(" ")}L${at(k * CELL, reach, 0).join(" ")}`);
    lines.push(`M${at(-reach, k * CELL, 0).join(" ")}L${at(reach, k * CELL, 0).join(" ")}`);
  }
  const d = lines.join("");

  return (
    <svg
      width={OG.width}
      height={OG.height}
      viewBox={`0 0 ${OG.width} ${OG.height}`}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <path d={d} stroke={INK} strokeOpacity={0.07} strokeWidth={1} fill="none" />
    </svg>
  );
}

function Plate({ plate }: { plate: (typeof plates)[number] }) {
  return (
    <div
      style={{
        position: "absolute",
        left: plate.i * CELL + 4,
        top: plate.j * CELL + 4,
        width: PLATE.w,
        height: PLATE.h,
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingLeft: 14,
        backgroundColor: tint(plate.accent, 0.1),
        border: `1px solid ${plate.accent}66`,
        borderLeft: `3px solid ${plate.accent}`,
        borderBottom: `2px solid ${plate.accent}`,
      }}
    >
      <img src={plate.avatar} width={30} height={30} style={{ borderRadius: 9999 }} alt="" />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: INK }}>{plate.name}</span>
        <span style={{ fontSize: 12, color: plate.accent }}>{plate.address}</span>
      </div>
    </div>
  );
}

export function HomeImage() {
  return (
    <Canvas>
      <Floor />
      {/* The plane's origin sits at the canvas centre; plates are laid out in plane units. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          display: "flex",
          fontFamily: "JetBrains Mono",
          transformOrigin: "0 0",
          transform: `matrix(${COS}, ${SIN}, ${-COS}, ${SIN}, ${OG.width / 2}, ${OG.height / 2})`,
        }}
      >
        {plates.map((plate) => (
          <Plate key={plate.name} plate={plate} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: OG.width,
          height: OG.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: 76,
            fontWeight: 500,
            lineHeight: 1.06,
            letterSpacing: -76 * 0.035,
            color: INK,
          }}
        >
          <span>The toolkit for</span>
          <span>building on ENS.</span>
        </div>
        <div style={{ fontSize: 26, color: MUTED }}>
          Reads, writes and registration for every name.
        </div>
      </div>
    </Canvas>
  );
}
