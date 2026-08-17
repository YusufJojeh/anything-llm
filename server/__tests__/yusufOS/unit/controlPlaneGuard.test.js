const {
  isLocalRequest,
  yusufControlPlaneGuard,
  MAX_CONTROL_PLANE_BODY_BYTES,
} = require("../../../domain/yusufOS/api/controlPlaneGuard");

function responseDouble() {
  return {
    locals: { yusufOS: { requestId: "request-1" } },
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("Yusuf OS fail-closed control plane", () => {
  const originalToken = process.env.YUSUF_OS_CONTROL_TOKEN;
  const originalProxy = process.env.YUSUF_OS_TRUST_LOCAL_PROXY;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.YUSUF_OS_CONTROL_TOKEN;
    else process.env.YUSUF_OS_CONTROL_TOKEN = originalToken;
    if (originalProxy === undefined)
      delete process.env.YUSUF_OS_TRUST_LOCAL_PROXY;
    else process.env.YUSUF_OS_TRUST_LOCAL_PROXY = originalProxy;
  });

  test("missing security configuration fails closed", () => {
    delete process.env.YUSUF_OS_CONTROL_TOKEN;
    const response = responseDouble();
    const next = jest.fn();
    yusufControlPlaneGuard(
      { socket: { remoteAddress: "127.0.0.1" }, headers: {} },
      response,
      next
    );
    expect(response.statusCode).toBe(503);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(next).not.toHaveBeenCalled();
  });

  test("missing bearer authentication returns a stable 401", () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = "x".repeat(32);
    const response = responseDouble();
    yusufControlPlaneGuard(
      { socket: { remoteAddress: "::1" }, headers: {} },
      response,
      jest.fn()
    );
    expect(response.statusCode).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "request-1",
    });
  });

  test("non-local sockets are blocked before authentication", () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = "x".repeat(32);
    const response = responseDouble();
    yusufControlPlaneGuard(
      {
        socket: { remoteAddress: "192.168.1.10" },
        headers: { authorization: `Bearer ${"x".repeat(32)}` },
      },
      response,
      jest.fn()
    );
    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe("LOCALHOST_REQUIRED");
  });

  test("forwarded locality is always rejected in Gate C", () => {
    process.env.YUSUF_OS_TRUST_LOCAL_PROXY = "true";
    expect(
      isLocalRequest({
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "x-forwarded-for": "127.0.0.1" },
      })
    ).toBe(false);
  });

  test("valid local authenticated request proceeds and oversized request is rejected", () => {
    process.env.YUSUF_OS_CONTROL_TOKEN = "x".repeat(32);
    const next = jest.fn();
    const response = responseDouble();
    yusufControlPlaneGuard(
      {
        socket: { remoteAddress: "::ffff:127.0.0.1" },
        headers: {
          authorization: `Bearer ${"x".repeat(32)}`,
          "content-length": "10",
        },
      },
      response,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);

    const oversized = responseDouble();
    yusufControlPlaneGuard(
      {
        socket: { remoteAddress: "127.0.0.1" },
        headers: {
          authorization: `Bearer ${"x".repeat(32)}`,
          "content-length": String(MAX_CONTROL_PLANE_BODY_BYTES + 1),
        },
      },
      oversized,
      jest.fn()
    );
    expect(oversized.statusCode).toBe(413);
    expect(oversized.body.error.code).toBe("VALIDATION_ERROR");
  });
});
