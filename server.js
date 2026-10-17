/**
 * EXPENSE TRACKER - Single-file MERN app
 * Works locally and supports Vercel deployment.
 *
 * Install:
 * npm install express mongoose bcryptjs jsonwebtoken
 *
 * Run locally:
 * node server.js
 *
 * Open:
 * http://localhost:5000
 *
 * Environment variables:
 * PORT, MONGO_URI, JWT_SECRET
 */

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/expense_tracker";
const JWT_SECRET =
  process.env.JWT_SECRET || "change_this_secret_in_production";

/* ============================ MONGODB MODELS ============================ */

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      password: { type: String, required: true, minlength: 8 },
    },
    { timestamps: true }
  )
);

const Transaction = mongoose.model(
  "Transaction",
  new mongoose.Schema(
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      type: {
        type: String,
        enum: ["income", "expense"],
        required: true,
      },
      title: { type: String, required: true, trim: true },
      category: { type: String, default: "Other" },
      amount: { type: Number, required: true, min: 0.01 },
      date: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

/* ============================ EXPRESS SETUP ============================ */

const app = express();

app.use(express.json({ limit: "1mb" }));

/* ============================ DATABASE CONNECTION ============================ */

let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(MONGO_URI).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

// Reset the cached promise if MongoDB disconnects.
mongoose.connection.on("disconnected", () => {
  connectionPromise = null;
});

// API requests must have a database connection.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    res.status(503).json({
      message: "Database connection failed. Please try again later.",
    });
  }
});

/* ============================ AUTHENTICATION ============================ */

const signToken = (user) =>
  jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({
      message: "Session expired, please log in again",
    });
  }
};

/* ============================ SIGNUP ============================ */

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
    });

    return res.status(201).json({
      token: signToken(user),
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    console.error("Signup error:", error.message);

    return res.status(500).json({
      message: "Unable to create account. Please try again.",
    });
  }
});

/* ============================ LOGIN ============================ */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (
      !user ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({
        message: "Incorrect email or password",
      });
    }

    return res.json({
      token: signToken(user),
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Unable to log in. Please try again.",
    });
  }
});

/* ============================ CURRENT USER ============================ */

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("name email");

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    return res.json({ user });
  } catch (error) {
    console.error("User lookup error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve user details",
    });
  }
});

/* ============================ GET TRANSACTIONS ============================ */

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const filter = { user: req.userId };

    if (req.query.type) {
      if (!["income", "expense"].includes(req.query.type)) {
        return res.status(400).json({
          message: "Invalid transaction type",
        });
      }

      filter.type = req.query.type;
    }

    const transactions = await Transaction.find(filter).sort({
      date: -1,
      createdAt: -1,
    });

    return res.json(transactions);
  } catch (error) {
    console.error("Fetch transactions error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve transactions",
    });
  }
});

/* ============================ ADD TRANSACTION ============================ */

app.post("/api/transactions", auth, async (req, res) => {
  try {
    const { type, title, category, amount, date } = req.body || {};

    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({
        message: "Invalid transaction type",
      });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        message: "Title and a valid amount are required",
      });
    }

    let transactionDate = new Date();

    if (date) {
      transactionDate = new Date(date);

      if (Number.isNaN(transactionDate.getTime())) {
        return res.status(400).json({
          message: "Invalid transaction date",
        });
      }
    }

    const transaction = await Transaction.create({
      user: req.userId,
      type,
      title: title.trim(),
      category:
        typeof category === "string" && category.trim()
          ? category.trim()
          : "Other",
      amount: Number(amount),
      date: transactionDate,
    });

    return res.status(201).json(transaction);
  } catch (error) {
    console.error("Add transaction error:", error.message);

    return res.status(500).json({
      message: "Unable to save transaction",
    });
  }
});

/* ============================ DELETE TRANSACTION ============================ */

app.delete("/api/transactions/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid transaction ID",
      });
    }

    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    return res.json({ message: "Deleted" });
  } catch (error) {
    console.error("Delete transaction error:", error.message);

    return res.status(500).json({
      message: "Unable to delete transaction",
    });
  }
});

/* ============================ UNKNOWN API ROUTES ============================ */

app.use("/api", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* ============================ REACT FRONTEND ============================ */

// Keep your original CLIENT_HTML template literal here, unchanged.
// Paste the complete CLIENT_HTML = String.raw`...` block from your
// original server.js at this location.

const CLIENT_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Expense Tracker</title>
</head>
<body>
<div id="root"></div>
<p>Your original React frontend HTML must be pasted here.</p>
</body>
</html>`;

/* ============================ SERVE FRONTEND ============================ */

app.use((req, res) => {
  res.type("html").send(CLIENT_HTML);
});

/* ============================ START SERVER / VERCEL EXPORT ============================ */

if (require.main === module) {
  connectDB()
    .then(() => {
      console.log("MongoDB connected");

      app.listen(PORT, () => {
        console.log(
          "Expense Tracker running at http://localhost:" + PORT
        );
      });
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
      process.exit(1);
    });
}

module.exports = app;