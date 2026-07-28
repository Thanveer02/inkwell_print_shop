const crypto = require("crypto");

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function secret() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random value of at least 32 characters");
  }
  return process.env.AUTH_SECRET;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function issueToken(user) {
  const payload = encode({ sub: String(user._id), role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function requireAuth(req, res, next) {
  try {
    const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !token.includes(".")) return res.status(401).json({ error: "Authentication is required" });
    const [payload, signature] = token.split(".");
    const expected = sign(payload);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(401).json({ error: "Invalid session" });
    }
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user.sub || !user.role || user.exp < Math.floor(Date.now() / 1000)) return res.status(401).json({ error: "Session expired" });
    req.user = user;
    next();
  } catch (_) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
  next();
}

module.exports = { issueToken, requireAuth, requireAdmin };
