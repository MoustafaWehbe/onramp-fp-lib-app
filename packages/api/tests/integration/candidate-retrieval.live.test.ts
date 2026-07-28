import { fetchSubjectWorks } from "../../src/lib/open-library";

// Live smoke test for the Open Library integration. Opt-in only: it makes a real
// outbound network request, so by default it is a no-op and is NOT part of the
// normal test run. Enable it explicitly, e.g.:
//   OL_LIVE=1 npx jest candidate-retrieval.live
//
// (It's an env-gated no-op rather than `describe.skip` because an all-skipped file
// would never run the shared Jest teardown, leaking the Redis handle and hanging.)
describe("[live] Open Library subjects fetch", () => {
  it("fetches works for a real subject (opt-in via OL_LIVE=1)", async () => {
    if (process.env.OL_LIVE !== "1") return; // no network in the normal run

    const works = await fetchSubjectWorks("science_fiction");
    expect(works.length).toBeGreaterThan(0);
    expect(works[0]).toHaveProperty("title");
    expect(works[0]!.key).toMatch(/^\/works\/OL/);
  });
});
