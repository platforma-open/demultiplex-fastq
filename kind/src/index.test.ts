import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, it } from "vitest";
import { kind } from "./index";

const parse = (v: unknown) => kind.parseInitializationParams(v);

/** A multiplexing rules column, as `PlDropdownRef` hands it back. */
const INPUT_REF: PlRef = { __isRef: true, blockId: "b1", name: "multiplexingRules" };

describe("the envelope", () => {
  it("accepts an empty object — a block may be created with nothing pinned", () => {
    expect(parse({})).toEqual({});
  });

  it.each([undefined, null, 42, "params", [], true])("refuses %o as a params object", (v) => {
    expect(() => parse(v)).toThrow();
  });

  it("drops keys the contract does not name", () => {
    // `perProcessMemGB` is deliberately outside the contract: resource allocation belongs to the
    // machine, so a template carrying it must not seed it.
    expect(parse({ tagPattern: "^{P5}(R1:*)", perProcessMemGB: 64, tableState: {} })).toEqual({
      tagPattern: "^{P5}(R1:*)",
    });
  });
});

describe("inputRef", () => {
  it("accepts a reference", () => {
    expect(parse({ inputRef: INPUT_REF })).toEqual({ inputRef: INPUT_REF });
  });

  it.each([{ blockId: "b1", name: "rules" }, "b1/rules", 7, {}, null])("refuses %o", (v) => {
    expect(() => parse({ inputRef: v })).toThrow("'inputRef' must be");
  });
});

describe("inputBarcodeTags", () => {
  it("accepts the tag names a rules column declares", () => {
    expect(parse({ inputBarcodeTags: ["P5", "P7"] })).toEqual({ inputBarcodeTags: ["P5", "P7"] });
  });

  it("accepts an empty list — a dataset may declare no tags at all", () => {
    expect(parse({ inputBarcodeTags: [] })).toEqual({ inputBarcodeTags: [] });
  });

  it.each([["P5", 7], "P5", { 0: "P5" }, null, [null]])("refuses %o", (v) => {
    expect(() => parse({ inputBarcodeTags: v })).toThrow("'inputBarcodeTags' must be");
  });
});

describe("inputNucleotidesOnly", () => {
  it("accepts either verdict", () => {
    expect(parse({ inputNucleotidesOnly: true })).toEqual({ inputNucleotidesOnly: true });
    expect(parse({ inputNucleotidesOnly: false })).toEqual({ inputNucleotidesOnly: false });
  });

  it.each(["true", 1, null])("refuses %o", (v) => {
    expect(() => parse({ inputNucleotidesOnly: v })).toThrow("'inputNucleotidesOnly' must be");
  });
});

describe("tagPattern", () => {
  it.each([
    "^{P5}N{0:2}(R1:*)\\^N{20}(R2:*)",
    "^{P5}(R1:*)\\^{P7}(R2:*)",
    // Every intermediate state of the text field is a legal param: the pattern is validated by
    // the args lambda against the dataset's own tags, which a kind cannot see.
    "",
    "{Nonsense} and spaces",
  ])("accepts %o, which the text field can hold", (v) => {
    expect(parse({ tagPattern: v })).toEqual({ tagPattern: v });
  });

  it.each([7, null, {}, ["^{P5}(R1:*)"]])("refuses %o", (v) => {
    expect(() => parse({ tagPattern: v })).toThrow("'tagPattern' must be");
  });
});

describe("runMode", () => {
  it.each(["dry", "full"])("accepts %o", (v) => {
    expect(parse({ runMode: v })).toEqual({ runMode: v });
  });

  it.each(["preview", "DRY", "", 0, null])("refuses %o", (v) => {
    expect(() => parse({ runMode: v })).toThrow("'runMode' must be");
  });
});

describe("limitInput", () => {
  it.each([1, 1000, 100_000, 5_000_000])("accepts %o", (v) => {
    expect(parse({ limitInput: v })).toEqual({ limitInput: v });
  });

  it.each([0, -1, 0.5, Number.NaN, "100000", null])("refuses %o", (v) => {
    expect(() => parse({ limitInput: v })).toThrow("'limitInput' must be");
  });
});

describe("the input snapshot and the pattern", () => {
  it("accepts a pattern naming a tag the snapshot does not declare", () => {
    // The two are not cross-checked here on purpose. The snapshot describes the upstream column
    // and the pattern is the user's own text; whether they agree is a question about live data,
    // and the args lambda answers it with the message that names the unknown placeholder.
    const params = { inputBarcodeTags: ["P5"], tagPattern: "^{P7}(R1:*)" };
    expect(parse(params)).toEqual(params);
  });

  it("accepts a snapshot with no input reference", () => {
    // Reachable through the contract itself: a template need not set every field.
    expect(parse({ inputBarcodeTags: ["P5"], inputNucleotidesOnly: true })).toEqual({
      inputBarcodeTags: ["P5"],
      inputNucleotidesOnly: true,
    });
  });
});

describe("identity", () => {
  it("names this package and its published version", () => {
    expect(kind.name).toBe("@platforma-open/milaboratories.demultiplex-fastq.kind");
    expect(kind.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
