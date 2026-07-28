const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

// ──────────────────────────────────────────────
// GET /api/orders/stats — Dashboard statistics
// ──────────────────────────────────────────────
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, inProgress, onHold, revenueResult] = await Promise.all([
      Order.countDocuments({ status: "Pending" }),
      Order.countDocuments({ status: "In progress" }),
      Order.countDocuments({ status: "On hold" }),
      Order.aggregate([
        { $match: { createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$price" } } },
      ]),
    ]);

    const revenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    res.json({ pending, inProgress, onHold, revenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/orders — List all orders
// Supports: ?status=Pending&search=ananya&limit=6
// ──────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { status, search, limit } = req.query;
    const filter = req.user.role === "admin" ? {} : { owner: req.user.sub };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { customer: { $regex: search, $options: "i" } },
        { orderId: { $regex: search, $options: "i" } },
      ];
    }

    let query = Order.find(filter).sort({ createdAt: -1 });

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const orders = await query;
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/orders/:id — Get single order
// ──────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (req.user.role !== "admin" && String(order.owner) !== req.user.sub) return res.status(403).json({ error: "Access denied" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/orders — Create a new order
// ──────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const allowed = ["customer", "phone", "pages", "copies", "color", "sides", "paperType", "binding", "files", "readyBy", "notes", "instructions"];
    const data = Object.fromEntries(allowed.filter((key) => key in req.body).map((key) => [key, req.body[key]]));
    const pages = Math.max(1, Math.min(10000, Number(data.pages) || 1));
    const copies = Math.max(1, Math.min(1000, Number(data.copies) || 1));
    const rate = data.paperType === "certificate" ? 20 : data.paperType === "bond" ? 5 : data.color === "color" ? 5 : data.sides === "double" ? 1.3 : 1;
    const price = Math.round((pages * copies * rate + (data.binding === "spiral" ? (pages < 100 ? 25 : 30) * copies : 0)) * 100) / 100;
    const order = await Order.create({ ...data, pages, copies, price, owner: req.user.sub });
    res.status(201).json(order);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PATCH /api/orders/:id — Update an order
// ──────────────────────────────────────────────
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body.status === "string") updates.status = req.body.status;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.id },
      updates,
      { new: true, runValidators: true }
    );
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (err) {
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/orders/:id — Delete an order
// ──────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({ orderId: req.params.id });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json({ message: "Order deleted", orderId: order.orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
