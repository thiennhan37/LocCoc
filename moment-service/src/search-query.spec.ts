import { resolveQuery } from "./search-query.js";
import { SearchMomentsDto } from "./moment.dto.js";
it("converts Vietnamese calendar phrases to UTC+7 bounds and exposes them", () => {
  const dto = Object.assign(new SearchMomentsDto(), {
    query: "biển tháng 6 năm 2025",
  });
  const q = resolveQuery(dto, new Date("2026-11-14T00:00:00Z"));
  expect(q.query).toBe("biển");
  expect(q.dateFrom).toBe("2025-05-31T17:00:00.000Z");
  expect(q.dateTo).toBe("2025-06-30T16:59:59.999Z");
});
it("handles relative dates and preserves explicit user filters", () => {
  const dto = Object.assign(new SearchMomentsDto(), { query: "ảnh hôm qua" });
  expect(resolveQuery(dto, new Date("2026-11-14T01:00:00Z")).dateFrom).toBe(
    "2026-11-12T17:00:00.000Z",
  );
  expect(resolveQuery({ ...dto, dateFrom: "2025-01-01T00:00:00Z" }).query).toBe(
    "ảnh hôm qua",
  );
});
