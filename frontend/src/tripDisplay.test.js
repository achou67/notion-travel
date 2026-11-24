import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import {
  formatTripDate,
  formatTripTime,
  getTripDay,
  getInitialTripDate,
  getTicketStatusTone
} from "./tripDisplay.js";

test("票券狀態使用三種不同色系", () => {
  assert.equal(getTicketStatusTone("已預定"), "reserved");
  assert.equal(getTicketStatusTone("未預定"), "not-reserved");
  assert.equal(getTicketStatusTone("現場排隊"), "walk-in");
});

test("無效或缺少日期時顯示未分類", () => {
  assert.equal(formatTripDate(""), "未分類");
  assert.equal(formatTripDate("not-a-date"), "未分類");
});

test("純日期在加拿大時區不會往前偏移一天", () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "America/Vancouver";

  try {
    assert.equal(formatTripDate("2026-09-18"), "9/18（週五）");
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("依網址日期、今天、第一天的順序選擇初始行程", () => {
  const dates = ["2026-09-08", "2026-09-09"];

  assert.equal(getInitialTripDate(dates, "/2026-09-09", "2026-09-08"), "2026-09-09");
  assert.equal(getInitialTripDate(dates, "/", "2026-09-09"), "2026-09-09");
  assert.equal(getInitialTripDate(dates, "/2026-09-10", "2026-09-09"), "2026-09-08");
  assert.equal(getInitialTripDate(dates, "/", "2026-09-10"), "2026-09-08");
});

test("日本凌晨的行程在台灣仍屬於日本日期", () => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = "Asia/Taipei";
  try {
    assert.equal(getTripDay("2027-01-08T15:30:00Z"), "2027-01-09");
    assert.equal(getTripDay("2027-01-08T23:30:00+08:00"), "2027-01-09");
    assert.equal(formatTripDate("2027-01-08T15:30:00Z"), "1/9（週六）");
    assert.equal(formatTripTime({ date: "2027-01-08T19:00:00Z", dateEnd: "2027-01-08T20:30:00Z" }), "04:00–05:30");
    assert.equal(formatTripTime({ date: "2027-01-09T00:30:00+09:00", dateEnd: null }), "00:30");
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("全天、備註與先前保存的離線時間仍可顯示", () => {
  assert.equal(formatTripTime({ date: "2027-01-11", dateEnd: null, reservationTime: "白天" }), "白天");
  assert.equal(formatTripTime({ date: "2027-01-09T12:15:00Z", dateEnd: null, reservationTime: "21:15 後" }), "21:15 後");
  assert.equal(formatTripTime({ date: "2027-01-09T04:00:00+09:00", reservationTime: "04:00–05:30" }), "04:00–05:30");
});
