
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
