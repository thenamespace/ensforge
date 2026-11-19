/**
 * Avatars committed under `public/avatars`: each name's avatar record, fetched once, cropped to a
 * 256 px square webp and served from this site, so the landing page never loads them from
 * elsewhere. Names whose avatar is unset or could not be fetched are left out and render without
 * one.
 */
const names = new Set([
  "5pence.eth",
  "alisha.eth",
  "artii.eth",
  "brantly.eth",
  "cap.eth",
  "coinbase.eth",
  "coltron.eth",
  "daylight.eth",
  "dcinvestor.eth",
  "dom.eth",
  "ens.eth",
  "envoy1084.eth",
  "estmcmxci.eth",
  "gregskril.eth",
  "jefflau.eth",
  "jesse.base.eth",
  "jessepollak.eth",
  "katherine.eth",
  "khori.eth",
  "lefteris.eth",
  "luc.eth",
  "maxi.eth",
  "mely.eth",
  "nick.eth",
  "raffy.eth",
  "rainbowwallet.eth",
  "ricmoo.eth",
  "serenae.eth",
  "slobo.eth",
  "spencecoin.eth",
  "taytems.eth",
  "validator.eth",
  "vitalik.eth",
  "wallet.eth",
]);

export const avatarSrc = (name: string) => (names.has(name) ? `/avatars/${name}.webp` : undefined);
