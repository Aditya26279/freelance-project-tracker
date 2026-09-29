import { describe, expect, it } from "vitest";
import {
  computeTotals,
  formatHours,
  minutesToHours,
  parseAmount,
  parseDuration,
  parseMoney,
  parseTaxPercent,
} from "./money";

describe("parseAmount", () => {
  it("rejects negatives and garbage, defaults empty", () => {
    expect(parseAmount("-5")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("12.5")).toBe(1250);
  });
  it("rejects absurdly large amounts", () => {
    expect(parseMoney("99999999999999")).toBeNaN();
    expect(parseMoney("-")).toBeNaN();
  });
});

describe("parseTaxPercent", () => {
  it("clamps to 0–100%", () => {
    expect(parseTaxPercent("18")).toBe(1800);
    expect(parseTaxPercent("7.25")).toBe(725);
    expect(parseTaxPercent("")).toBe(0);
    expect(parseTaxPercent("-1")).toBeNaN();
    expect(parseTaxPercent("101")).toBeNaN();
    expect(parseTaxPercent("1e9")).toBeNaN();
  });
});

describe("parseDuration", () => {
  it("accepts hours and h:mm within 1 min – 24 h", () => {
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("0:05")).toBe(5);
    expect(parseDuration("24")).toBe(1440);
  });
  it("rejects invalid, zero, negative and oversized", () => {
    expect(parseDuration("1:75")).toBeNaN();
    expect(parseDuration("-1")).toBeNaN();
    expect(parseDuration("0")).toBeNaN();
    expect(parseDuration("25")).toBeNaN();
    expect(parseDuration("abc")).toBeNaN();
  });
});

describe("parseMoney", () => {
  it("parses plain and formatted amounts to minor units", () => {
    expect(parseMoney("1250")).toBe(125000);
    expect(parseMoney("1,250.5")).toBe(125050);
    expect(parseMoney("$99.99")).toBe(9999);
    expect(parseMoney("0.1")).toBe(10);
  });
  it("rejects garbage and >2 decimals", () => {
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("1.234")).toBeNaN();
    expect(parseMoney("")).toBeNaN();
  });
});

describe("computeTotals", () => {
  it("sums lines and applies tax in basis points", () => {
    const t = computeTotals(
      [
        { quantity: 1, unitAmount: 100000 },
        { quantity: 2.5, unitAmount: 5000 },
      ],
      1800,
    );
    expect(t.subtotal).toBe(112500);
    expect(t.tax).toBe(20250);
    expect(t.total).toBe(132750);
  });
  it("rounds fractional quantities to whole minor units", () => {
    expect(computeTotals([{ quantity: 1.33, unitAmount: 7500 }], 0).total).toBe(9975);
  });
});

describe("time helpers", () => {
  it("formats and converts minutes", () => {
    expect(formatHours(125)).toBe("2h 05m");
    expect(minutesToHours(80)).toBe(1.33);
  });
});
