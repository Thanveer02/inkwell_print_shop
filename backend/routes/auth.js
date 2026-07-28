const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { issueToken } = require("../middleware/auth");
const loginAttempts = new Map();

function loginRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + 15 * 60 * 1000;
  }
  if (entry.count >= 10) return res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
  entry.count += 1;
  loginAttempts.set(key, entry);
  res.on("finish", () => { if (res.statusCode < 400) loginAttempts.delete(key); });
  next();
}

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (err, derivedKey) => err ? reject(err) : resolve(`scrypt:${salt}:${derivedKey.toString("hex")}`));
});

async function verifyPassword(password, stored) {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, salt, expected] = stored.split(":");
  const actual = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone = "" } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!String(name || "").trim() || !cleanEmail || typeof password !== "string") return res.status(400).json({ error: "Name, email, and password are required" });
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address" });
    if (password.length < 12) return res.status(400).json({ error: "Password must be at least 12 characters" });
    if (await User.exists({ email: cleanEmail })) return res.status(409).json({ error: "Email is already registered" });
    const user = await User.create({ name: String(name).trim(), email: cleanEmail, password: await hashPassword(password), phone: String(phone).trim(), role: "customer" });
    return res.status(201).json({ message: "Registration successful", user: publicUser(user), token: issueToken(user) });
  } catch (err) {
    return res.status(500).json({ error: "Unable to create account" });
  }
});

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    if (!email || typeof password !== "string") return res.status(400).json({ error: "Email and password are required" });
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await verifyPassword(password, user.password))) return res.status(401).json({ error: "Invalid email or password" });
    return res.json({ message: "Login successful", user: publicUser(user), token: issueToken(user) });
  } catch (_) {
    return res.status(500).json({ error: "Unable to sign in" });
  }
});

module.exports = router;
