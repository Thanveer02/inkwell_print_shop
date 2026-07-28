const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✓ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`✗ MongoDB connection error: ${err.message}`);
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    console.error(`MongoDB runtime error: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });
};

module.exports = connectDB;
