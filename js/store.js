import { api } from "./api.js";

const empty = {
  values: [],
  actions: [],
  exercises: [],
  basics: { moved: false, ate: false, slept: false, phoneFree: false, connected: false },
  checkins: [],
  settings: { speakReplies: false, voice: "alloy", notifEnabled: false, checkinEnabled: false, checkinHour: 19 },
};

export const store = {
  state: structuredClone(empty),
  meta: { authed: false, configured: {}, vapidPublicKey: null },
  _subs: [],

  setMeta(me) {
    this.meta = me;
  },

  subscribe(fn) {
    this._subs.push(fn);
  },

  notify() {
    for (const fn of this._subs) fn(this.state);
  },

  async load() {
    const data = await api.state();
    if (data && !data.error) this.state = { ...empty, ...data };
    this.notify();
  },

  async mutate(entity, op, data) {
    const res = await api.mutate(entity, op, data);
    await this.load();
    return res;
  },
};
