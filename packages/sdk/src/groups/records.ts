import {
  clearAvatar,
  clearRecords,
  getAbi,
  getAddress,
  getAddresses,
  getAvatar,
  getContentHash,
  getData,
  getInterface,
  getName,
  getPubkey,
  getRecords,
  getText,
  getTexts,
  setAbi,
  setAddress,
  setAddresses,
  setAvatar,
  setContentHash,
  setData,
  setInterface,
  setName,
  setPubkey,
  setRecords,
  setText,
  setTexts,
  type EnsforgeConfig,
} from "@ensforge/core";

import {
  bindAction,
  type BoundAction,
  type BoundGetRecordsAction,
} from "../internal/bind-action.js";

export interface RecordsActions {
  readonly clearAvatar: BoundAction<typeof clearAvatar>;
  readonly clearRecords: BoundAction<typeof clearRecords>;
  readonly getAbi: BoundAction<typeof getAbi>;
  readonly getAddress: BoundAction<typeof getAddress>;
  readonly getAddresses: BoundAction<typeof getAddresses>;
  readonly getAvatar: BoundAction<typeof getAvatar>;
  readonly getContentHash: BoundAction<typeof getContentHash>;
  readonly getData: BoundAction<typeof getData>;
  readonly getInterface: BoundAction<typeof getInterface>;
  readonly getName: BoundAction<typeof getName>;
  readonly getPubkey: BoundAction<typeof getPubkey>;
  readonly getRecords: BoundGetRecordsAction;
  readonly getText: BoundAction<typeof getText>;
  readonly getTexts: BoundAction<typeof getTexts>;
  readonly setAbi: BoundAction<typeof setAbi>;
  readonly setAddress: BoundAction<typeof setAddress>;
  readonly setAddresses: BoundAction<typeof setAddresses>;
  readonly setAvatar: BoundAction<typeof setAvatar>;
  readonly setContentHash: BoundAction<typeof setContentHash>;
  readonly setData: BoundAction<typeof setData>;
  readonly setInterface: BoundAction<typeof setInterface>;
  readonly setName: BoundAction<typeof setName>;
  readonly setPubkey: BoundAction<typeof setPubkey>;
  readonly setRecords: BoundAction<typeof setRecords>;
  readonly setText: BoundAction<typeof setText>;
  readonly setTexts: BoundAction<typeof setTexts>;
}

export const makeRecordsActions = (config: EnsforgeConfig): RecordsActions =>
  Object.freeze({
    clearAvatar: bindAction(config, clearAvatar),
    clearRecords: bindAction(config, clearRecords),
    getAbi: bindAction(config, getAbi),
    getAddress: bindAction(config, getAddress),
    getAddresses: bindAction(config, getAddresses),
    getAvatar: bindAction(config, getAvatar),
    getContentHash: bindAction(config, getContentHash),
    getData: bindAction(config, getData),
    getInterface: bindAction(config, getInterface),
    getName: bindAction(config, getName),
    getPubkey: bindAction(config, getPubkey),
    getRecords: bindAction(config, getRecords),
    getText: bindAction(config, getText),
    getTexts: bindAction(config, getTexts),
    setAbi: bindAction(config, setAbi),
    setAddress: bindAction(config, setAddress),
    setAddresses: bindAction(config, setAddresses),
    setAvatar: bindAction(config, setAvatar),
    setContentHash: bindAction(config, setContentHash),
    setData: bindAction(config, setData),
    setInterface: bindAction(config, setInterface),
    setName: bindAction(config, setName),
    setPubkey: bindAction(config, setPubkey),
    setRecords: bindAction(config, setRecords),
    setText: bindAction(config, setText),
    setTexts: bindAction(config, setTexts),
  });
