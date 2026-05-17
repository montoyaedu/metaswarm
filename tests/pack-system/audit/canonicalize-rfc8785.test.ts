// RFC 8785 canonicalization — unit tests (WU6).
//
// Includes the RFC 8785 section 3.2.3 worked example as a golden vector (the
// IETF-published example, not author-invented -- plan section 3.1) plus
// focused, non-circular checks of key sorting, NFC normalization, number
// forms, and the canonicalizability guards.
//
// References: plan section 3.1; RFC 8785 sections 3.2.2.2 / 3.2.2.3 / 3.2.3.

import { describe, expect, it } from "vitest";
import { canonicalize } from "../../../src/pack-system/audit/canonicalize-rfc8785.js";
import type { JsonValue } from "../../../src/pack-system/audit/types.js";

describe("canonicalize -- RFC 8785 section 3.2.3 worked example", () => {
  it("matches the IETF-published canonical output", () => {
    // The RFC 8785 section 3.2.3 input string, code point by code point:
    //   U+20AC EURO SIGN, '$', U+000F, U+000A LINE FEED, 'A', "'", 'B',
    //   U+0022 QUOTE, U+005C BACKSLASH x2, U+0022 QUOTE, '/'.
    const rfcString = "€$\nA'B\"\\\\\"/";
    const rfcInput: JsonValue = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: rfcString,
      literals: [null, true, false],
    };
    const expected =
      '{"literals":[null,true,false],' +
      '"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
      '"string":' +
      JSON.stringify(rfcString) +
      "}";
    expect(canonicalize(rfcInput)).toBe(expected);
  });
});

describe("canonicalize -- object key sorting (RFC 8785 section 3.2.3)", () => {
  it("sorts top-level keys ascending by UTF-16 code unit", () => {
    expect(canonicalize({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("sorts nested object keys recursively", () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: 1 })).toBe(
      '{"a":1,"z":{"x":2,"y":1}}',
    );
  });

  it("sorts by UTF-16 code unit, so uppercase precedes lowercase", () => {
    expect(canonicalize({ a: 1, B: 2, A: 3 })).toBe('{"A":3,"B":2,"a":1}');
  });

  it("is independent of key insertion order", () => {
    const left = canonicalize({ one: 1, two: 2, three: 3 });
    const right = canonicalize({ three: 3, one: 1, two: 2 });
    expect(left).toBe(right);
  });

  it("preserves array element order (arrays are not sorted)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });
});

describe("canonicalize -- NFC string normalization (RFC 8785 section 3.2.2.2)", () => {
  it("normalizes a decomposed (NFD) string value to its NFC form", () => {
    // "e" + U+0301 COMBINING ACUTE ACCENT (NFD) vs precomposed U+00E9 (NFC).
    const nfd = "é";
    const nfc = "é";
    expect(canonicalize(nfd)).toBe(canonicalize(nfc));
    expect(JSON.parse(canonicalize(nfd))).toBe(nfc);
  });

  it("normalizes object keys to NFC before sorting", () => {
    expect(canonicalize({ ["é"]: 1 })).toBe(`{"é":1}`);
  });
});

describe("canonicalize -- duplicate-key rejection (RFC 8785 / I-JSON)", () => {
  it("rejects an object whose keys collide after NFC normalization", () => {
    // "cafe" + U+0301 (NFD) and "caf" + U+00E9 (NFC) are distinct JS keys
    // that both normalize to the same string -- a determinism hazard the
    // RFC forbids (the surviving value would depend on key insertion order).
    const collide: JsonValue = { ["café"]: 1, ["café"]: 2 };
    expect(() => canonicalize(collide)).toThrow(/collide after NFC/);
  });
});

describe("canonicalize -- number serialization (RFC 8785 section 3.2.2.3)", () => {
  it("serializes numbers in ECMAScript Number-to-String form", () => {
    expect(canonicalize([1e30, 4.5, 2e-3, 0.1, -0, 1e-27, 100])).toBe(
      "[1e+30,4.5,0.002,0.1,0,1e-27,100]",
    );
  });

  it("rejects NaN", () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/);
  });

  it("rejects Infinity and -Infinity", () => {
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalize(-Infinity)).toThrow(/non-finite/);
  });
});

describe("canonicalize -- string escaping (RFC 8785 section 3.2.2.2)", () => {
  it("escapes quotes and backslashes", () => {
    expect(canonicalize({ a: 'x"y\\z' })).toBe('{"a":"x\\"y\\\\z"}');
  });

  it("escapes a control character as a backslash-u00xx sequence", () => {
    expect(canonicalize({ a: "" })).toBe('{"a":"\\u0001"}');
  });
});

describe("canonicalize -- primitives and empties", () => {
  it("canonicalizes top-level primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hi")).toBe('"hi"');
  });

  it("canonicalizes an empty object and an empty array", () => {
    expect(canonicalize({})).toBe("{}");
    expect(canonicalize([])).toBe("[]");
  });
});

describe("canonicalize -- non-JSON guard", () => {
  it("rejects undefined", () => {
    expect(() => canonicalize(undefined as unknown as JsonValue)).toThrow(
      /not JSON-canonicalizable/,
    );
  });

  it("rejects a bigint", () => {
    expect(() => canonicalize(10n as unknown as JsonValue)).toThrow(
      /not JSON-canonicalizable/,
    );
  });
});
