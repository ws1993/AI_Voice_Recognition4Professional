import { describe, expect, it } from "vitest";

import { parseClauseUpload } from "@/lib/parsers/clauses";

describe("parseClauseUpload", () => {
  it("parses csv clauses", async () => {
    const csv = "clauseCode,title,content,category,keywords\nA-1,电气安全,配电箱应上锁,电气,配电箱;上锁";
    const file = new File([csv], "clauses.csv", { type: "text/csv" });
    const parsed = await parseClauseUpload(file);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].clauseCode).toBe("A-1");
    expect(parsed[0].keywords).toContain("上锁");
  });
});
