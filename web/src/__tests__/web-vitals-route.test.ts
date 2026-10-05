// Route keys for real-user metrics (#445). If ids leak into the key, every record gets its own
// row group and no page ever accumulates enough samples to read a p75 from.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { vitalsRoute } from "../lib/web-vitals-route.ts";

describe("vitalsRoute", () => {
  it("keeps plain routes", () => {
    assert.equal(vitalsRoute("/tasks"), "/tasks");
    assert.equal(vitalsRoute("/"), "/");
  });
  it("collapses uuids, numeric ids and long tokens", () => {
    assert.equal(vitalsRoute("/backlog/6f0aa4bb-b824-4c2f-ab6b-83aa8e5bcb50"), "/backlog/:id");
    assert.equal(vitalsRoute("/library/42"), "/library/:id");
    assert.equal(vitalsRoute("/share/library/Zx8kP2qLmN4vR7tY9wB1cD3"), "/share/library/:id");
  });
  it("drops the query string and trailing slash", () => {
    assert.equal(vitalsRoute("/tasks/?list=none"), "/tasks");
  });
});
