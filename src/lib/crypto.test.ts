import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, hmacSha256Hex } from "./crypto";

beforeAll(() => {
  process.env.APP_SECRET = "test-secret-that-is-long-enough";
});

describe("encrypt/decrypt", () => {
  it("round-trips and uses a random IV", () => {
    const a = encrypt("sk_test_123");
    const b = encrypt("sk_test_123");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("sk_test_123");
  });
  it("rejects tampered ciphertext", () => {
    const [iv, tag, enc] = encrypt("secret").split(".");
    const flipped = Buffer.from(enc, "base64url");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });
});

describe("razorpay signature", () => {
  it("matches the documented order|payment HMAC scheme", () => {
    // HMAC-SHA256("order_1|pay_1", "secret")
    expect(hmacSha256Hex("secret", "order_1|pay_1")).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex("secret", "order_1|pay_1")).toBe(hmacSha256Hex("secret", "order_1|pay_1"));
  });
});
