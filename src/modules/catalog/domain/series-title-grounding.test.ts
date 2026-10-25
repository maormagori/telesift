import { describe, expect, it } from "vitest";
import { checkSeriesTitleGrounding } from "./series-title-grounding.js";

function check(observedTitle: string | null, contextTexts: (string | null)[] = [], fileName: string | null = null) {
  return checkSeriesTitleGrounding({ observedTitle, contextTexts, fileName });
}

describe("checkSeriesTitleGrounding", () => {
  it("grounds a title that appears in the caption", () => {
    expect(check("סדרה לדוגמה", ["*** סדרה לדוגמה עונה 1 פרק 8 ***"])).toEqual({
      grounded: true,
      title: "סדרה לדוגמה",
    });
  });

  it("grounds a title that appears only in the filename", () => {
    expect(check("Fauda", [null], "Fauda.S05E10.1080p.WEB-DL.x264.mkv")).toMatchObject({ grounded: true });
  });

  it("ignores punctuation and case differences between title and source", () => {
    expect(check("fauda", ["Fauda: S04E03"])).toMatchObject({ grounded: true });
  });

  it("rejects a title naming a different show than the caption", () => {
    expect(check("תוכנית אחרת", ["*** סדרה לדוגמה עונה 1 פרק 8 ***"])).toEqual({
      grounded: false,
      reason: "not_in_source",
    });
  });

  it("rejects a mangled variant of a title that is present", () => {
    expect(check("סדרה לדוגAMA", ["*** סדרה לדוגמה עונה 1 פרק 8 ***"])).toMatchObject({ grounded: false });
  });

  it("rejects a transliteration of a title that is present", () => {
    expect(check("fafada", ["פאודה עונה 2 פרק 3"])).toMatchObject({ grounded: false });
  });

  it("rejects a title made only of punctuation rather than treating it as trivially present", () => {
    expect(check(" (^)( *)?", ["סדרה לדוגמה עונה 1 פרק 8"])).toEqual({ grounded: false, reason: "no_letters" });
  });

  it("rejects a missing or blank title", () => {
    expect(check(null, ["סדרה לדוגמה"])).toEqual({ grounded: false, reason: "missing" });
    expect(check("   ", ["סדרה לדוגמה"])).toEqual({ grounded: false, reason: "missing" });
  });

  it("collapses whitespace in the returned title", () => {
    expect(check("Some   Show", ["Some Show S01E01"])).toEqual({ grounded: true, title: "Some Show" });
  });
});
