export const EMPTY_DATE_LABEL = "未分類";

const tripTimeZone = "Asia/Tokyo";
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const tripDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: tripTimeZone, year: "numeric", month: "2-digit", day: "2-digit"
});
const tripDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: tripTimeZone, month: "numeric", day: "numeric", weekday: "short"
});
const tripTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: tripTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

function getTripInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value ?? "")) return null;
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + "+09:00";
  const instant = new Date(timestamp);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function getTripDay(value) {
  if (dateOnlyPattern.test(value ?? "")) {
    const date = new Date(value + "T00:00:00+09:00");
    return !Number.isNaN(date.getTime()) && tripDayFormatter.format(date) === value
      ? value
      : EMPTY_DATE_LABEL;
  }
  const instant = getTripInstant(value);
  return instant ? tripDayFormatter.format(instant) : EMPTY_DATE_LABEL;
}

export function formatTripDate(value) {
  const day = getTripDay(value);
  return day === EMPTY_DATE_LABEL
    ? day
    : tripDateFormatter.format(new Date(day + "T00:00:00+09:00"));
}

export function formatTripTime({ date, dateEnd, reservationTime }) {
  const label = reservationTime?.trim() ?? "";
  const start = getTripInstant(date);
  if (!start || (dateEnd === undefined && label)) return label;

  // Preserve descriptions such as 白天 and use the structured time for clock labels.
  const clockLabel = label.match(/^\d{1,2}:\d{2}(?:\s*[-–—～~]\s*\d{1,2}:\d{2})?(?:\s*(後))?$/);
  if (label && !clockLabel) return label;
  const end = getTripInstant(dateEnd);
  const time = tripTimeFormatter.format(start);
  return end ? time + "–" + tripTimeFormatter.format(end) : time + (clockLabel?.[1] ? " 後" : "");
}

export function getInitialTripDate(
  dates,
  pathname = "/",
  today = tripDayFormatter.format(new Date())
) {
  const firstDate = dates[0] || "";
  const pathDate = pathname.match(/^\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];

  if (pathname && pathname !== "/") {
    return pathDate && dates.includes(pathDate) ? pathDate : firstDate;
  }

  return dates.includes(today) ? today : firstDate;
}

export function getTicketStatusTone(status) {
  switch (status) {
    case "已預定":
      return "reserved";
    case "未預定":
      return "not-reserved";
    case "現場排隊":
      return "walk-in";
    default:
      return "unset";
  }
}
