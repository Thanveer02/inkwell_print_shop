require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const Order = require("./models/Order");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000,http://localhost:5500").split(",").map((origin) => origin.trim());
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error("Origin is not allowed by CORS"));
} }));
app.use(express.json({ limit: "100kb" }));
app.use(morgan("dev"));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ── Routes ─────────────────────────────────────
app.use("/api/orders", require("./routes/orders"));
app.use("/api/auth", require("./routes/auth"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Seed Data ──────────────────────────────────
const seedOrders = [
  {
    orderId: "ORD-P3Q7X",
    time: "12:47 PM",
    customer: "Meera Iyer",
    phone: "+91 97000 44112",
    pages: 1,
    copies: 150,
    color: "color",
    sides: "single",
    files: ["wedding-invite.pdf"],
    readyBy: "Jul 26, 02:20 PM",
    price: 2400,
    status: "Pending",
  },
  {
    orderId: "ORD-J2W6E",
    time: "12:38 PM",
    customer: "Faisal Ahmed",
    phone: "+91 90000 11222",
    pages: 1,
    copies: 25,
    color: "color",
    sides: "single",
    files: ["poster-a3.pdf"],
    readyBy: "Jul 26, 02:50 PM",
    price: 250,
    status: "Printed",
  },
  {
    orderId: "ORD-K9M4Z",
    time: "12:32 PM",
    customer: "Rahul Verma",
    phone: "+91 99001 55221",
    pages: 34,
    copies: 2,
    color: "color",
    sides: "double",
    files: ["project-report.docx", "cover.png"],
    readyBy: "Jul 26, 03:50 PM",
    price: 1020,
    status: "Pending",
  },
  {
    orderId: "ORD-A1B2C",
    time: "12:08 PM",
    customer: "Ananya Rao",
    phone: "+91 98450 12233",
    pages: 2,
    copies: 6,
    color: "bw",
    sides: "single",
    files: ["resume-final.pdf"],
    readyBy: "Jul 26, 01:35 PM",
    price: 30,
    status: "In progress",
  },
  {
    orderId: "ORD-D5F0N",
    time: "11:55 AM",
    customer: "Priya Sharma",
    phone: "+91 98111 23344",
    pages: 1,
    copies: 3,
    color: "color",
    sides: "single",
    files: ["id-proof.jpg"],
    readyBy: "Jul 26, 01:10 PM",
    price: 38,
    status: "On hold",
  },
  {
    orderId: "ORD-T8U1L",
    time: "10:50 AM",
    customer: "Karthik Nair",
    phone: "+91 98800 77123",
    pages: 88,
    copies: 1,
    color: "bw",
    sides: "double",
    files: ["lecture-notes.pdf"],
    readyBy: "Jul 26, 12:20 PM",
    price: 264,
    status: "Completed",
  },
];

async function seedDatabase() {
  try {
    const count = await Order.countDocuments();
    if (count === 0) {
      await Order.insertMany(seedOrders);
      console.log("✓ Database seeded with sample orders");
    } else {
      console.log(`✓ Database already has ${count} orders, skipping seed`);
    }
  } catch (err) {
    console.error("✗ Seed error:", err.message);
  }
}

// ── Start Server ───────────────────────────────
async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`\n🖨  Inkwell Backend running on http://localhost:${PORT}`);
    console.log(`   API:    http://localhost:${PORT}/api/orders`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
}

start();
