import { describe, it, expect } from "vitest";
import { dueReports } from "./scheduler.js";

describe("dueReports", () => {
  it("fires weekly on Monday for the prior week", () => {
    // 2026-06-08 is a Monday
    const due = dueReports(new Date("2026-06-08T13:00:00Z"), "UTC", () => false);
    const weekly = due.find(d => d.periodType === "weekly")!;
    expect(weekly).toBeTruthy();
    expect(weekly.periodStart).toBe("2026-06-01T00:00:00.000Z");
  });
  it("fires monthly on the 1st for the prior month", () => {
    const due = dueReports(new Date("2026-06-01T13:00:00Z"), "UTC", () => false);
    const monthly = due.find(d => d.periodType === "monthly")!;
    expect(monthly).toBeTruthy();
    expect(monthly.periodStart).toBe("2026-05-01T00:00:00.000Z");
  });
  it("does not fire weekly midweek", () => {
    const due = dueReports(new Date("2026-06-10T13:00:00Z"), "UTC", () => false);
    expect(due.find(d => d.periodType === "weekly")).toBeUndefined();
  });
  it("skips a report already sent", () => {
    const due = dueReports(new Date("2026-06-08T13:00:00Z"), "UTC", () => true);
    expect(due.find(d => d.periodType === "weekly")).toBeUndefined();
  });
});
