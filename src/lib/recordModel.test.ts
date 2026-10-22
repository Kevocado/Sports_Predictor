
import { foldGameBuckets } from "./recordModel";

describe("foldGameBuckets", () => {
  it("turns home-side buckets into pick confidence: an away-leaning pick is right when the home side did not win", () => {
    const folded = foldGameBuckets([
      { lo: 0, hi: 0.25, n: 4, hit_rate: 0.25 },      // home chance <25%: the away pick (75%+) was right 3 of 4
      { lo: 0.25, hi: 0.5, n: 10, hit_rate: 0.4 },    // home chance 25-50%: the away pick (50-75%) was right 6 of 10
      { lo: 0.5, hi: 0.75, n: 20, hit_rate: 0.6 },    // home pick 50-75%: right 12 of 20
      { lo: 0.75, hi: 1, n: 6, hit_rate: 0.8333 },    // home pick 75%+: right 5 of 6
    ]);
    expect(folded).toEqual([
      { bucket: "50-75%", n: 30, correct: 18 },       // 6 + 12
      { bucket: "75-100%", n: 10, correct: 8 },       // 3 + 5
    ]);
  });

  it("leaves out empty buckets and says nothing for no data", () => {
    expect(foldGameBuckets([{ lo: 0.5, hi: 0.75, n: 0, hit_rate: null }])).toEqual([]);
  });
});

import { toRecordModel } from "./recordModel";
import type { TrackRecord } from "../types";

describe("toRecordModel reads the buckets where the API puts them", () => {
  const home = (hit: number) => ({ lo: 0.5, hi: 0.75, n: 20, mean_prob: 0.6, hit_rate: hit });
  const cal = { n_buckets: 4, winner: [home(0.6)], spread: [home(0.5)], total: [] };
  const record = (extra: object) => ({ games: { n_resolved: 0, ...extra }, player_props: { anytime_td: { confidence_buckets: [] } } }) as unknown as TrackRecord;

  it("builds the game series from the TOP-LEVEL calibration of the response", () => {
    const model = toRecordModel({ ...record({}), calibration: cal } as TrackRecord);
    expect(model.calibration!.map((s) => s.key)).toEqual(["moneyline", "ats"]);        // total has no buckets: no series
    expect(model.calibration![0].buckets).toEqual([{ bucket: "50-75%", n: 20, correct: 12 }]);
  });

  it("still accepts the older shape nested under games", () => {
    const model = toRecordModel(record({ calibration: cal }));
    expect(model.calibration!.map((s) => s.key)).toEqual(["moneyline", "ats"]);
  });

  it("has no game series when the API sends none", () => {
    expect(toRecordModel(record({})).calibration).toEqual([]);
  });
});
