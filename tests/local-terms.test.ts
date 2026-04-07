import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readLocalTerms, removeLocalTerm, writeLocalTerm } from "@/lib/store/local-terms";

function createStorePath() {
  return path.join(os.tmpdir(), `glossary-terms-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

describe("local glossary terms store", () => {
  afterEach(() => {
    const filePath = process.env.LOCAL_GLOSSARY_TERMS_FILE;

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    delete process.env.LOCAL_GLOSSARY_TERMS_FILE;
  });

  it("persists terms across reads", () => {
    process.env.LOCAL_GLOSSARY_TERMS_FILE = createStorePath();

    const saved = writeLocalTerm({
      canonical: "配电箱",
      aliases: ["配店箱"],
      priority: 10,
      enabled: true
    });

    const loaded = readLocalTerms();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(saved.id);
    expect(loaded[0].canonical).toBe("配电箱");
    expect(loaded[0].aliases).toEqual(["配店箱"]);
  });

  it("removes persisted terms", () => {
    process.env.LOCAL_GLOSSARY_TERMS_FILE = createStorePath();

    const saved = writeLocalTerm({
      canonical: "灭火器",
      aliases: ["灭伙器"],
      priority: 20,
      enabled: true
    });

    expect(removeLocalTerm(saved.id)).toBe(true);
    expect(readLocalTerms()).toEqual([]);
  });
});
