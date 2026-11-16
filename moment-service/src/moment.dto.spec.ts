import { validateSync } from "class-validator";
import { CreateMomentDto, SearchMomentsDto } from "./moment.dto.js";

it.each(["2026-01-01", "2026-01-01T10:00:00"])(
  "rejects ambiguous timezone-free dates: %s",
  (date) => {
    expect(
      validateSync(
        Object.assign(new SearchMomentsDto(), { query: "ảnh", dateFrom: date }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(Object.assign(new CreateMomentDto(), { capturedAt: date }))
        .length,
    ).toBeGreaterThan(0);
  },
);
it("accepts explicit UTC and offset dates consistently across query/indexing", () => {
  expect(
    validateSync(
      Object.assign(new SearchMomentsDto(), {
        query: "ảnh",
        dateFrom: "2026-01-01T00:00:00Z",
        dateTo: "2026-01-31T23:59:59+07:00",
      }),
    ),
  ).toEqual([]);
});
