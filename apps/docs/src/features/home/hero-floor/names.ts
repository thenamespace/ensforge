import { avatarSrc } from "../avatars";

/**
 * Names on the hero floor, as static content: the hero never calls an RPC. Each address and text
 * record was read from Ethereum mainnet; names that did not resolve were left out.
 */

export interface FloorName {
  readonly name: string;
  readonly address: string;
  readonly text?: readonly [key: string, value: string];
  /** The self-hosted avatar, when the name has one we could fetch. */
  readonly avatar: string | undefined;
}

const entry = (name: string, address: string, text?: readonly [string, string]): FloorName => ({
  name,
  address,
  ...(text ? { text } : {}),
  avatar: avatarSrc(name),
});

export const floorNames: readonly FloorName[] = [
  entry("envoy1084.eth", "0xc0d8…1FE6", ["url", "envoy1084.xyz"]),
  entry("cap.eth", "0x035e…17D3", ["url", "namespace.ninja"]),
  entry("artii.eth", "0x1D84…19f8", ["url", "app.namespace.ninja"]),
  entry("maxi.eth", "0xc9E6…e2c8", ["com.twitter", "maxidoteth"]),
  entry("nick.eth", "0xb8c2…67d5", ["url", "ens.domains"]),
  entry("vitalik.eth", "0xd8dA…6045", ["url", "vitalik.ca"]),
  entry("brantly.eth", "0x9831…6744", ["url", "ethid.org"]),
  entry("mely.eth", "0x7Ffc…2bEf", ["com.github", "mely-eth"]),
  entry("raffy.eth", "0x5105…eeee", ["url", "raffy.antistupid.com"]),
  entry("validator.eth", "0x82eB…3Dab", ["url", "validator.xyz"]),
  entry("gregskril.eth", "0x179A…9285", ["url", "gregskril.com"]),
  entry("slobo.eth", "0x5346…42CF", ["url", "fullrange.ai"]),
  entry("khori.eth", "0x9edd…b382", ["com.twitter", "KhoriWhittaker"]),
  entry("taytems.eth", "0x8e8D…3216", ["url", "taytems.xyz"]),
  entry("lefteris.eth", "0x2B88…7d12", ["url", "rotki.com"]),
  entry("matoken.eth", "0x5A38…0615", ["com.github", "makoto"]),
  entry("jesse.base.eth", "0x2211…7DA9", ["url", "jesse.xyz"]),
  entry("jefflau.eth", "0x866B…5eEE", ["com.github", "jefflau"]),
  entry("luc.eth", "0x225f…c3B5", ["url", "luc.computer"]),
  entry("ricmoo.eth", "0x5555…3dCa", ["url", "www.ricmoo.com"]),
  entry("dennison.eth", "0xba40…a4A4"),
  entry("katherine.eth", "0x82BE…0E57"),
  entry("alisha.eth", "0xA02E…297D", ["url", "alisha.xyz"]),
  entry("sassal.eth", "0x648a…FB79", ["com.twitter", "sassal0x"]),
  entry("coinbase.eth", "0x17F7…F45A", ["com.twitter", "coinbase"]),
  entry("limes.eth", "0x9650…F389", ["com.github", "gofordylan"]),
  entry("coltron.eth", "0x1D54…6359", ["com.github", "coltron-code"]),
  entry("simona.eth", "0x54Be…7Ab6", ["com.twitter", "Sim_Pop"]),
  entry("estmcmxci.eth", "0x703a…789B", ["com.github", "estmcmxci"]),
  entry("garypalmerjr.eth", "0x4D98…E5a8", ["url", "garypalmerjr.eth.limo"]),
  entry("5pence.eth", "0xe52C…d726", ["com.twitter", "5pence_eth"]),
  entry("spencecoin.eth", "0xB94B…5D88", ["com.twitter", "spencecoin"]),
  entry("griff.eth", "0x8393…0780", ["com.github", "GriffGreen"]),
  entry("superphiz.eth", "0x399e…5541", ["com.twitter", "superphiz"]),
  entry("jessepollak.eth", "0x2211…7DA9", ["url", "jesse.xyz"]),
  entry("dom.eth", "0x0b08…c32A", ["com.twitter", "domicoeth"]),
  entry("leontalbert.eth", "0x2ef2…1B1e"),
  entry("daylight.eth", "0x6860…3c26", ["url", "www.daylight.xyz"]),
  entry("serenae.eth", "0x29a8…DE70", ["url", "serenae.eth.limo"]),
  entry("rainbowwallet.eth", "0x7a3d…384f", ["url", "rainbow.me"]),
  entry("uniswap.eth", "0x1a9C…35BC", ["url", "uniswap.org"]),
  entry("ens.eth", "0xFe89…44b7", ["url", "ens.domains"]),
  entry("dwr.eth", "0xD64a…698c"),
  entry("wilsoncusack.eth", "0x2239…23e4"),
  entry("dcinvestor.eth", "0x3786…d129"),
  entry("lindajxie.eth", "0x5e34…09Ee"),
  entry("brian.base.eth", "0x5b76…a1f0"),
  entry("dwr.base.eth", "0xD702…8ff2"),
  entry("app.ens.eth", "0x2d2e…F246"),
  entry("brian.cb.id", "0xc1D9…605D"),
];
