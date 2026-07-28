const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      default: () => "ORD-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    time: {
      type: String,
      default: () =>
        new Date().toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
    },
    customer: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    pages: {
      type: Number,
      default: 1,
      min: 1,
    },
    copies: {
      type: Number,
      default: 1,
      min: 1,
    },
    color: {
      type: String,
      enum: ["bw", "color"],
      default: "bw",
    },
    sides: {
      type: String,
      enum: ["single", "double"],
      default: "single",
    },
    paperType: {
      type: String,
      enum: ["standard", "bond", "certificate"],
      default: "standard",
    },
    binding: {
      type: String,
      enum: ["none", "spiral"],
      default: "none",
    },
    files: {
      type: [String],
      default: ["untitled-file"],
    },
    readyBy: {
      type: String,
      default: "—",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Pending", "Printed", "In progress", "On hold", "Completed"],
      default: "Pending",
    },
    notes: {
      type: String,
      default: "",
    },
    instructions: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Index for common queries
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customer: "text", orderId: "text" });

module.exports = mongoose.model("Order", orderSchema);
