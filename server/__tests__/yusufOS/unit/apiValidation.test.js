const {
  validateObject,
  enumValue,
  pagination,
} = require("../../../domain/yusufOS/api/validation");

describe("Yusuf OS API validation", () => {
  test("rejects unknown authority and status fields", () => {
    expect(() =>
      validateObject(
        { title: "task", status: "VERIFIED", riskLevel: "L0" },
        { allowed: ["title"], required: ["title"] }
      )
    ).toThrow("unknown fields");
  });

  test("validates enums and bounded pagination", () => {
    expect(enumValue("P1", "priority", ["P0", "P1"])).toBe("P1");
    expect(() => enumValue("VERIFIED", "priority", ["P0", "P1"]))
      .toThrow("must be one of");
    expect(pagination({ limit: "100", offset: "0" })).toEqual({
      take: 100,
      skip: 0,
    });
    expect(() => pagination({ limit: "101" })).toThrow("Pagination requires");
  });
});
