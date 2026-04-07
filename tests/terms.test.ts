import { describe, expect, it } from "vitest";

import { applyDictionary } from "@/lib/pipeline/terms";

describe("applyDictionary", () => {
  it("replaces aliases with canonical terms by priority", () => {
    const result = applyDictionary("现场发现配店箱和灭伙器摆放不规范", [
      {
        id: "1",
        canonical: "配电箱",
        aliases: ["配店箱"],
        priority: 1,
        enabled: true,
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "2",
        canonical: "灭火器",
        aliases: ["灭伙器"],
        priority: 2,
        enabled: true,
        createdAt: "",
        updatedAt: ""
      }
    ]);

    expect(result.text).toContain("配电箱");
    expect(result.text).toContain("灭火器");
    expect(result.hitCount).toBeGreaterThan(0);
  });
});
