import { BadRequestException } from "@nestjs/common";
import type { SearchMomentsDto } from "./moment.dto.js";

// Calendar phrases have an explicit UTC+7 contract. No LLM is allowed to invent
// dates/locations or to expand access scope. Explicit UI filters take precedence.
export function resolveQuery(
  input: SearchMomentsDto,
  now = new Date(),
): SearchMomentsDto {
  const dto = { ...input, query: input.query.normalize("NFC").trim() };
  if (dto.dateFrom || dto.dateTo) return dto;
  const local = new Date(now.getTime() + 7 * 3600_000);
  const year = local.getUTCFullYear(),
    month = local.getUTCMonth(),
    day = local.getUTCDate();
  const utc = (y: number, m: number, d: number) =>
    Date.UTC(y, m, d) - 7 * 3600_000;
  let start: number | undefined,
    end: number | undefined,
    phrase = "";
  const q = dto.query.toLocaleLowerCase("vi");
  const monthYear = q.match(
    /\btháng\s+(1[0-2]|[1-9])\s*(?:năm\s+|\/)(\d{4})\b/u,
  );
  const calendarYear = q.match(/\bnăm\s+(\d{4})\b/u);
  if (monthYear) {
    const y = Number(monthYear[2]),
      m = Number(monthYear[1]) - 1;
    start = utc(y, m, 1);
    end = utc(y, m + 1, 1);
    phrase = monthYear[0];
  } else if (q.includes("hôm qua") || q.includes("hôm nay")) {
    phrase = q.includes("hôm qua") ? "hôm qua" : "hôm nay";
    start = utc(year, month, day - (phrase === "hôm qua" ? 1 : 0));
    end = start + 86400_000;
  } else if (q.includes("năm ngoái") || q.includes("năm nay")) {
    phrase = q.includes("năm ngoái") ? "năm ngoái" : "năm nay";
    const y = year - (phrase === "năm ngoái" ? 1 : 0);
    start = utc(y, 0, 1);
    end = utc(y + 1, 0, 1);
  } else if (calendarYear) {
    const y = Number(calendarYear[1]);
    start = utc(y, 0, 1);
    end = utc(y + 1, 0, 1);
    phrase = calendarYear[0];
  }
  if (start !== undefined && end !== undefined) {
    if (
      new Date(start).getUTCFullYear() < 1900 ||
      new Date(start).getUTCFullYear() > year + 1
    )
      throw new BadRequestException("Invalid calendar filter");
    dto.dateFrom = new Date(start).toISOString();
    dto.dateTo = new Date(end - 1).toISOString();
    const at = q.indexOf(phrase);
    dto.query = (
      dto.query.slice(0, at) + dto.query.slice(at + phrase.length)
    ).trim();
  }
  return dto;
}
