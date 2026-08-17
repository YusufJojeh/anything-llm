const { randomUUID } = require("crypto");

function yusufRequestContext(request, response, next) {
  const requestId = randomUUID();
  response.locals.yusufOS = {
    requestId,
    principal: { type: "USER", id: "local-yusuf" },
  };
  response.setHeader("x-request-id", requestId);
  next();
}

module.exports = { yusufRequestContext };
