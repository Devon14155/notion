import { describe, expect, it } from "vitest";
import { imageAltFromFilename, plainTextPreview } from "./text";

describe("plainTextPreview", () => {
  it("collapses real whitespace between content blocks", () => {
    expect(plainTextPreview("<p>Alpha</p>\n\n<p>  Beta   gamma </p>")).toBe("Alpha Beta gamma");
  });

  it("does not display script or style contents in previews", () => {
    expect(plainTextPreview("<p>Safe</p><script>secret()</script><style>.x{color:red}</style> text")).toBe("Safe text");
  });

  it("decodes common HTML entities for readable previews", () => {
    expect(plainTextPreview("<p>Tea &amp; cake&nbsp;now</p>")).toBe("Tea & cake now");
  });

  it("respects the maximum preview length", () => {
    expect(plainTextPreview("<p>abcdefgh</p>", 4)).toBe("abcd");
  });
});

describe("imageAltFromFilename", () => {
  it("removes the final file extension but retains internal dots", () => {
    expect(imageAltFromFilename("anatomy.diagram.final.png")).toBe("anatomy.diagram.final");
  });

  it("limits alt text length", () => {
    expect(imageAltFromFilename("a".repeat(130) + ".jpg")).toHaveLength(120);
  });
});
