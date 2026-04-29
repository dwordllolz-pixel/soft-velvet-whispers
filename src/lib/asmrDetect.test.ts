import { describe, it, expect } from "vitest";
import { detectAndStripAsmrSounds } from "./asmrDetect";

describe("detectAndStripAsmrSounds", () => {
  it("detects repeated tap onomatopoeia", () => {
    const r = detectAndStripAsmrSounds("Listen closely... tap... tap... tap...");
    expect(r.triggeredSoundIds).toContain("tap");
    expect(r.cleanText).not.toMatch(/tap/i);
  });

  it("detects tap-tap hyphenated form", () => {
    const r = detectAndStripAsmrSounds("Hear that? tap-tap-tap on the glass.");
    expect(r.triggeredSoundIds).toContain("tap");
  });

  it("detects click-clack", () => {
    const r = detectAndStripAsmrSounds("The keys go click-clack as I type.");
    expect(r.triggeredSoundIds).toContain("click");
    expect(r.cleanText).not.toMatch(/click[-\s]?clack/i);
  });

  it("detects repeated scratch", () => {
    const r = detectAndStripAsmrSounds("scratch... scratch... scratch... right behind your ear.");
    expect(r.triggeredSoundIds).toContain("scratch");
  });

  it("does NOT trigger on bare narrative words (conservative scope)", () => {
    const r = detectAndStripAsmrSounds("He was tapping his foot impatiently.");
    expect(r.triggeredSoundIds).toHaveLength(0);
    expect(r.cleanText).toBe("He was tapping his foot impatiently.");
  });

  it("returns empty result for empty input", () => {
    expect(detectAndStripAsmrSounds("")).toEqual({ cleanText: "", triggeredSoundIds: [] });
  });

  it("can detect multiple distinct sounds in one message", () => {
    const r = detectAndStripAsmrSounds("tap... tap... tap... and then click-clack.");
    expect(r.triggeredSoundIds).toEqual(expect.arrayContaining(["tap", "click"]));
  });

  it("preserves surrounding text after stripping", () => {
    const r = detectAndStripAsmrSounds("Relax now. tap... tap... tap... drift away.");
    expect(r.cleanText).toMatch(/Relax now/);
    expect(r.cleanText).toMatch(/drift away/);
  });
});
