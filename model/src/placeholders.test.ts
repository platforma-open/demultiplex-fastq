import { describe, expect, it } from "vitest";
import { parsePlaceholders } from "./index";

describe("parsePlaceholders", () => {
  it("lists each tag once, in order of first appearance", () => {
    expect(parsePlaceholders("^{P5}{UMI}(R1:*)\\^(R2:*)")).toEqual({ used: ["P5", "UMI"] });
  });

  it("allows the same tag once on each mate", () => {
    expect(parsePlaceholders("^{BC}(R1:*)\\^{BC}(R2:*)")).toEqual({ used: ["BC"] });
  });

  it("rejects a tag repeated on the same mate", () => {
    expect(parsePlaceholders("^{BC}{BC}(R1:*)\\^(R2:*)")).toEqual({
      used: ["BC"],
      duplicate: "BC",
    });
    expect(parsePlaceholders("^(R1:*)\\^{BC}N{BC}(R2:*)")).toEqual({
      used: ["BC"],
      duplicate: "BC",
    });
  });
});
