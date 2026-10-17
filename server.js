/**
 * EXPENSE TRACKER - single-file MERN app
 * ---------------------------------------------------------------
 * M = MongoDB (mongoose)   E = Express   N = Node   R = React
 * React is loaded from a CDN (with Babel in the browser) and served by Express,
 * so the whole project lives in this ONE file.
 *
 * SETUP
 *   1. Install Node 18+ and MongoDB (or use a MongoDB Atlas URI)
 *   2. mkdir expense-tracker && cd expense-tracker   (put this file here as server.js)
 *   3. npm init -y
 *   4. npm install express mongoose bcryptjs jsonwebtoken
 *   5. node server.js
 *   6. open http://localhost:5000
 *
 * OPTIONAL ENV VARS: PORT, MONGO_URI, JWT_SECRET
 */

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/expense_tracker";
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_in_production";

/* ============================ MONGODB MODELS ============================ */
const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      password: { type: String, required: true, minlength: 8 },
    },
    { timestamps: true }
  )
);

const Transaction = mongoose.model(
  "Transaction",
  new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      type: { type: String, enum: ["income", "expense"], required: true },
      title: { type: String, required: true, trim: true },
      category: { type: String, default: "Other" },
      amount: { type: Number, required: true, min: 0.01 },
      date: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

/* ============================ EXPRESS API ============================ */
const app = express();
app.use(express.json());

const signToken = (u) => jwt.sign({ id: u._id }, JWT_SECRET, { expiresIn: "7d" });

const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Please log in" });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ message: "Session expired, please log in again" });
  }
};

// ---- Auth ----
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields are required" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ message: "Email is already registered" });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: signToken(user), user: { name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(password || "", user.password)))
      return res.status(401).json({ message: "Incorrect email or password" });
    res.json({ token: signToken(user), user: { name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.userId).select("name email");
  if (!user) return res.status(401).json({ message: "User not found" });
  res.json({ user });
});

// ---- Transactions (income + expense) ----
app.get("/api/transactions", auth, async (req, res) => {
  const filter = { user: req.userId };
  if (req.query.type) filter.type = req.query.type;
  res.json(await Transaction.find(filter).sort({ date: -1, createdAt: -1 }));
});

app.post("/api/transactions", auth, async (req, res) => {
  try {
    const { type, title, category, amount, date } = req.body;
    if (!["income", "expense"].includes(type)) return res.status(400).json({ message: "Invalid type" });
    if (!title || !(Number(amount) > 0)) return res.status(400).json({ message: "Title and a valid amount are required" });
    const tx = await Transaction.create({
      user: req.userId, type, title, category: category || "Other",
      amount: Number(amount), date: date ? new Date(date) : new Date(),
    });
    res.status(201).json(tx);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/transactions/:id", auth, async (req, res) => {
  const tx = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!tx) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

app.use("/api", (req, res) => res.status(404).json({ message: "Route not found" }));

/* ============================ REACT FRONTEND ============================ */
// NOTE: the client code below lives inside a template literal, so it must not
// contain backticks or the dollar-brace sequence. Strings are concatenated instead.
const CLIENT_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Expense Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.7/babel.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  :root{--p:#8b5cf6;--p-dark:#5b2bd9;--p-soft:#f5f0ff;--bg:#fafafa;--card:#fff;--text:#111;--muted:#8a8a99;
        --red:#f5293b;--red-soft:#fff0f1;--green:#12b76a;--green-soft:#ecfdf3;--orange:#ff6a00;--line:#ececf2}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Poppins',system-ui,sans-serif;background:var(--bg);color:var(--text)}
  button{font-family:inherit;cursor:pointer}
  input,select{font-family:inherit;font-size:14px}
  .topbar{height:94px;display:flex;align-items:center;padding:0 40px;background:#fff;border-bottom:1px solid var(--line);font-size:24px;font-weight:500}
  .shell{display:flex;min-height:calc(100vh - 94px)}
  .side{width:380px;padding:48px 40px;background:#fff;border-right:1px solid var(--line);flex-shrink:0}
  .avatar{width:72px;height:72px;border-radius:50%;background:#f1f1f4;display:grid;place-items:center;font-size:26px;margin:0 auto 12px;color:var(--p-dark);font-weight:500;text-transform:uppercase}
  .uname{text-align:center;font-weight:500;font-size:18px;margin-bottom:36px}
  .nav{display:flex;align-items:center;gap:18px;width:100%;padding:16px 20px;margin-bottom:6px;border:0;border-radius:12px;background:none;font-size:17px;color:var(--text);text-align:left}
  .nav:hover{background:var(--p-soft)}
  .nav.on{background:var(--p);color:#fff}
  .main{flex:1;padding:30px;display:flex;flex-direction:column;gap:30px;min-width:0}
  .card{background:var(--card);border-radius:22px;padding:34px;box-shadow:0 4px 24px rgba(30,20,70,.05)}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .head h2{font-size:22px;font-weight:500}
  .head p{color:var(--muted);font-size:14px;margin-top:4px}
  .btn{display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border-radius:10px;border:1px solid #eadcff;background:var(--p-soft);color:#9a1ff0;font-weight:500;font-size:15px}
  .btn.grey{background:#f6f6f8;border-color:#f0f0f3;color:#333}
  .btn.solid{background:var(--p);color:#fff;border:0;width:100%;justify-content:center;padding:16px;font-size:16px}
  .btn.solid:hover{background:var(--p-dark)}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .stat{display:flex;align-items:center;gap:22px;padding:30px}
  .dot{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:26px;color:#fff;flex-shrink:0}
  .stat small{color:var(--muted);font-size:15px;display:block}
  .stat b{font-size:28px;font-weight:500}
  .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
  .list{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 40px}
  .row{display:flex;align-items:center;gap:16px;padding:14px 0}
  .ico{width:52px;height:52px;border-radius:50%;background:#f1f1f4;display:grid;place-items:center;font-size:22px;flex-shrink:0}
  .row .t{flex:1;min-width:0}
  .row .t b{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .row .t small{color:var(--muted);font-size:13px}
  .del{border:0;background:none;font-size:18px;opacity:.5}.del:hover{opacity:1}
  .tag{padding:8px 14px;border-radius:8px;font-weight:500;font-size:14px;white-space:nowrap}
  .tag.out{background:var(--red-soft);color:var(--red)}
  .tag.in{background:var(--green-soft);color:var(--green)}
  .empty{color:var(--muted);padding:30px 0;text-align:center}
  .chartbox{height:320px;position:relative}
  .modal{position:fixed;inset:0;background:rgba(20,10,50,.4);display:grid;place-items:center;padding:20px;z-index:10}
  .modal form{background:#fff;border-radius:20px;padding:32px;width:100%;max-width:440px}
  .modal h3{font-weight:500;margin-bottom:18px;font-size:20px}
  label{display:block;font-size:14px;margin:14px 0 6px}
  .in{width:100%;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#f1f4fb;outline:none}
  .in:focus{border-color:var(--p);background:#fff}
  .err{background:var(--red-soft);color:var(--red);padding:10px 14px;border-radius:8px;font-size:14px;margin-top:14px}
  .acts{display:flex;gap:12px;margin-top:22px}
  .acts .btn{flex:1;justify-content:center}
  /* auth */
  .auth{display:grid;grid-template-columns:1fr 1fr;min-height:100vh}
  .auth .form{padding:64px 72px;max-width:850px}
  .auth h1{font-size:30px;font-weight:600;margin-top:140px}
  .auth .sub{color:#444;margin:6px 0 30px}
  .auth a{color:var(--p);cursor:pointer;text-decoration:underline}
  .promo{background:linear-gradient(160deg,#a21cf9 0%,#8b5cf6 60%,#f1eaff 60%);position:relative;display:grid;place-items:center;padding:40px}
  .promo .pc{background:#fff;border-radius:18px;padding:22px 26px;width:min(440px,100%);box-shadow:0 10px 40px rgba(60,20,120,.2)}
  .promo .pc small{color:var(--muted)}
  .promo .pc b{display:block;font-size:30px;font-weight:500}
  @media(max-width:1100px){.side{width:240px;padding:30px 16px}.stats,.grid2,.list{grid-template-columns:1fr}}
  @media(max-width:760px){.shell{flex-direction:column}.side{width:100%;border:0}.auth{grid-template-columns:1fr}.promo{display:none}.auth .form{padding:36px 24px}.auth h1{margin-top:60px}.topbar{padding:0 20px;height:70px}}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef } = React;

/* ---------- helpers ---------- */
async function api(path, method, body) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("/api" + path, { method: method || "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || "Something went wrong"); e.status = res.status; throw e; }
  return data;
}
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const short = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const sum = (list) => list.reduce((a, t) => a + t.amount, 0);
const EXPENSE_CATS = { Food: "🍽️", Rent: "🏠", Shopping: "🛍️", Trip: "✈️", Bills: "💡", Health: "💊", Other: "📦" };
const INCOME_CATS = { Salary: "💼", Tuition: "🎓", Freelance: "💻", Gift: "🎁", Investment: "📈", Other: "📦" };
const icon = (t) => (t.type === "income" ? INCOME_CATS : EXPENSE_CATS)[t.category] || "📦";
const PURPLE = "#8b5cf6", RED = "#f5293b", ORANGE = "#ff6a00";
const PALETTE = ["#8b5cf6", "#f5293b", "#ff6a00", "#12b76a", "#06b6d4", "#eab308", "#ec4899"];

function downloadCSV(list, name) {
  const rows = [["Title", "Category", "Type", "Amount", "Date"]].concat(
    list.map((t) => [t.title, t.category, t.type, t.amount, new Date(t.date).toISOString().slice(0, 10)])
  );
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name + ".csv";
  a.click();
}

/* ---------- chart wrapper (Chart.js) ---------- */
function ChartView({ type, data, options }) {
  const ref = useRef(null);
  useEffect(() => {
    const chart = new Chart(ref.current, {
      type, data,
      options: Object.assign({ responsive: true, maintainAspectRatio: false }, options || {}),
    });
    return () => chart.destroy();
  }, [type, JSON.stringify(data)]);
  return <div className="chartbox"><canvas ref={ref}></canvas></div>;
}

/* ---------- chart builders ---------- */
function LineExpense({ expenses }) {
  const sorted = expenses.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sorted.length) return <div className="empty">Add an expense to see your spending trend.</div>;
  return <ChartView type="line" data={{
    labels: sorted.map((t) => short(t.date)),
    datasets: [{ label: "Expense", data: sorted.map((t) => t.amount), borderColor: PURPLE, borderWidth: 3, tension: 0.4,
      fill: true, backgroundColor: "rgba(139,92,246,.15)", pointBackgroundColor: PURPLE, pointRadius: 4 }],
  }} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />;
}

function BarIncome({ income }) {
  const sorted = income.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sorted.length) return <div className="empty">Add income to see your earnings.</div>;
  return <ChartView type="bar" data={{
    labels: sorted.map((t) => short(t.date)),
    datasets: [{ label: "Income", data: sorted.map((t) => t.amount), backgroundColor: PURPLE, borderRadius: 10 }],
  }} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />;
}

function BarMonthly({ txs }) {
  if (!txs.length) return <div className="empty">No data yet.</div>;
  const map = {};
  txs.forEach((t) => {
    const d = new Date(t.date);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    map[key] = map[key] || { income: 0, expense: 0 };
    map[key][t.type] += t.amount;
  });
  const keys = Object.keys(map).sort();
  const label = (k) => new Date(k + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return <ChartView type="bar" data={{
    labels: keys.map(label),
    datasets: [
      { label: "Income", data: keys.map((k) => map[k].income), backgroundColor: PURPLE, borderRadius: 8 },
      { label: "Expense", data: keys.map((k) => map[k].expense), backgroundColor: "#d9c8ff", borderRadius: 8 },
    ],
  }} options={{ scales: { y: { beginAtZero: true } } }} />;
}

function PieCategory({ expenses }) {
  if (!expenses.length) return <div className="empty">No expenses yet.</div>;
  const map = {};
  expenses.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const labels = Object.keys(map);
  return <ChartView type="pie" data={{
    labels, datasets: [{ data: labels.map((l) => map[l]), backgroundColor: PALETTE, borderWidth: 2, borderColor: "#fff" }],
  }} options={{ plugins: { legend: { position: "bottom" } } }} />;
}

function Histogram({ expenses }) {
  if (expenses.length < 2) return <div className="empty">Add at least two expenses to see the distribution.</div>;
  const amounts = expenses.map((t) => t.amount);
  const min = Math.min.apply(null, amounts), max = Math.max.apply(null, amounts);
  const bins = 5, size = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  amounts.forEach((a) => { counts[Math.min(bins - 1, Math.floor((a - min) / size))]++; });
  const labels = counts.map((_, i) => "$" + Math.round(min + i * size) + "–" + Math.round(min + (i + 1) * size));
  return <ChartView type="bar" data={{
    labels, datasets: [{ label: "Number of expenses", data: counts, backgroundColor: ORANGE, barPercentage: 1, categoryPercentage: 1, borderColor: "#fff", borderWidth: 2 }],
  }} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} />;
}

function Doughnut({ balance, income, expense }) {
  if (!income && !expense) return <div className="empty">No data yet.</div>;
  return <ChartView type="doughnut" data={{
    labels: ["Total Balance", "Total Expenses", "Total Income"],
    datasets: [{ data: [Math.max(balance, 0), expense, income], backgroundColor: [PURPLE, RED, ORANGE], borderWidth: 0 }],
  }} options={{ cutout: "70%", plugins: { legend: { position: "bottom" } } }} />;
}

/* ---------- shared UI ---------- */
function TxList({ list, onDelete }) {
  if (!list.length) return <div className="empty">Nothing here yet. Use the add button to create your first entry.</div>;
  return (
    <div className="list">
      {list.map((t) => (
        <div className="row" key={t._id}>
          <div className="ico">{icon(t)}</div>
          <div className="t"><b>{t.title}</b><small>{fmtDate(t.date)}</small></div>
          {onDelete && <button className="del" title="Delete" onClick={() => onDelete(t._id)}>🗑️</button>}
          <span className={"tag " + (t.type === "income" ? "in" : "out")}>
            {(t.type === "income" ? "+ " : "- ") + money(t.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AddModal({ type, onClose, onSaved }) {
  const cats = type === "income" ? INCOME_CATS : EXPENSE_CATS;
  const [f, setF] = useState({ title: "", amount: "", category: Object.keys(cats)[0], date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    try { await api("/transactions", "POST", Object.assign({ type }, f)); onSaved(); }
    catch (ex) { setErr(ex.message); }
  };
  return (
    <div className="modal" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>{type === "income" ? "Add income" : "Add expense"}</h3>
        <label>Title</label>
        <input className="in" required value={f.title} onChange={set("title")} placeholder={type === "income" ? "e.g. Tuition" : "e.g. Groceries"} />
        <label>Amount ($)</label>
        <input className="in" required type="number" min="0.01" step="0.01" value={f.amount} onChange={set("amount")} placeholder="0.00" />
        <label>Category</label>
        <select className="in" value={f.category} onChange={set("category")}>
          {Object.keys(cats).map((c) => <option key={c}>{c}</option>)}
        </select>
        <label>Date</label>
        <input className="in" required type="date" value={f.date} onChange={set("date")} />
        {err && <div className="err">{err}</div>}
        <div className="acts">
          <button type="button" className="btn grey" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn">Save {type}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- auth page ---------- */
function Auth({ mode, go, onAuth }) {
  const signup = mode === "signup";
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const data = await api(signup ? "/auth/signup" : "/auth/login", "POST", f);
      localStorage.setItem("token", data.token);
      onAuth(data.user);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  return (
    <div className="auth">
      <form className="form" onSubmit={submit}>
        <div style={{ fontSize: 24, fontWeight: 500 }}>Expense Tracker</div>
        <h1>{signup ? "Create an account" : "Welcome Back"}</h1>
        <p className="sub">{signup ? "Sign up to start tracking your money" : "Please enter details to log in"}</p>
        {signup && (<><label>Full Name</label><input className="in" required value={f.name} onChange={set("name")} placeholder="John Doe" /></>)}
        <label>Email Address</label>
        <input className="in" required type="email" value={f.email} onChange={set("email")} placeholder="john@example.com" />
        <label>Password</label>
        <div style={{ position: "relative" }}>
          <input className="in" required minLength={8} type={show ? "text" : "password"} value={f.password} onChange={set("password")} placeholder="Min 8 char" />
          <span onClick={() => setShow(!show)} style={{ position: "absolute", right: 16, top: 13, cursor: "pointer" }}>{show ? "🙈" : "👁️"}</span>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn solid" style={{ marginTop: 28 }} disabled={busy}>{busy ? "Please wait…" : signup ? "SIGN UP" : "LOGIN"}</button>
        <p style={{ marginTop: 18 }}>
          {signup ? "Already have an account? " : "Don't have an account? "}
          <a onClick={() => go(signup ? "login" : "signup")}>{signup ? "Login" : "SignUp"}</a>
        </p>
      </form>
      <div className="promo">
        <div className="pc"><small>Track Your Income &amp; Expenses</small><b>$430,000</b></div>
      </div>
    </div>
  );
}

/* ---------- app pages ---------- */
function Dashboard({ txs, go }) {
  const income = txs.filter((t) => t.type === "income");
  const expenses = txs.filter((t) => t.type === "expense");
  const tIn = sum(income), tEx = sum(expenses), bal = tIn - tEx;
  return (
    <>
      <div className="stats">
        <div className="card stat"><div className="dot" style={{ background: PURPLE }}>💳</div><div><small>Total Balance</small><b>{money(bal)}</b></div></div>
        <div className="card stat"><div className="dot" style={{ background: ORANGE }}>👛</div><div><small>Total Income</small><b>{money(tIn)}</b></div></div>
        <div className="card stat"><div className="dot" style={{ background: RED }}>💸</div><div><small>Total Expense</small><b>{money(tEx)}</b></div></div>
      </div>
      <div className="grid2">
        <div className="card">
          <div className="head"><h2>Recent Transactions</h2><button className="btn grey" onClick={() => go("expense")}>See All →</button></div>
          <div style={{ gridTemplateColumns: "1fr" }} className="list"><TxList list={txs.slice(0, 5)} /></div>
        </div>
        <div className="card"><div className="head"><h2>Financial Overview</h2></div><Doughnut balance={bal} income={tIn} expense={tEx} /></div>
      </div>
      <div className="grid2">
        <div className="card"><div className="head"><div><h2>Income vs Expense</h2><p>Bar chart by month</p></div></div><BarMonthly txs={txs} /></div>
        <div className="card"><div className="head"><div><h2>Expenses by Category</h2><p>Pie chart</p></div></div><PieCategory expenses={expenses} /></div>
      </div>
      <div className="grid2">
        <div className="card"><div className="head"><div><h2>Spending Trend</h2><p>Line graph over time</p></div></div><LineExpense expenses={expenses} /></div>
        <div className="card"><div className="head"><div><h2>Expense Distribution</h2><p>Histogram of expense sizes</p></div></div><Histogram expenses={expenses} /></div>
      </div>
    </>
  );
}

function TypePage({ type, txs, refresh }) {
  const [adding, setAdding] = useState(false);
  const list = txs.filter((t) => t.type === type);
  const isIn = type === "income";
  const remove = async (id) => { if (confirm("Delete this entry?")) { await api("/transactions/" + id, "DELETE"); refresh(); } };
  return (
    <>
      <div className="card">
        <div className="head">
          <div>
            <h2>{isIn ? "Income Overview" : "Expense Overview"}</h2>
            <p>{isIn ? "Track your earnings over time and analyze your income trends." : "Track your spending trends over time and gain insights into where your money goes."}</p>
          </div>
          <button className="btn" onClick={() => setAdding(true)}>＋ {isIn ? "Add Income" : "Add Expense"}</button>
        </div>
        {isIn ? <BarIncome income={list} /> : <LineExpense expenses={list} />}
      </div>
      <div className="card">
        <div className="head">
          <h2>{isIn ? "Income Sources" : "All Expenses"}</h2>
          <button className="btn grey" onClick={() => downloadCSV(list, type)}>⬇ Download</button>
        </div>
        <TxList list={list} onDelete={remove} />
      </div>
      {adding && <AddModal type={type} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </>
  );
}

function Shell({ user, page, go, logout }) {
  const [txs, setTxs] = useState([]);
  const refresh = () => api("/transactions").then(setTxs).catch((e) => { if (e.status === 401) logout(); });
  useEffect(() => { refresh(); }, []);
  const nav = [["dashboard", "▦", "Dashboard"], ["income", "👛", "Income"], ["expense", "💸", "Expense"]];
  return (
    <>
      <div className="topbar">Expense Tracker</div>
      <div className="shell">
        <aside className="side">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div className="uname">{user.name}</div>
          {nav.map((n) => (
            <button key={n[0]} className={"nav" + (page === n[0] ? " on" : "")} onClick={() => go(n[0])}><span>{n[1]}</span>{n[2]}</button>
          ))}
          <button className="nav" onClick={logout}><span>↪</span>Logout</button>
        </aside>
        <main className="main">
          {page === "dashboard" && <Dashboard txs={txs} go={go} />}
          {page === "income" && <TypePage type="income" txs={txs} refresh={refresh} />}
          {page === "expense" && <TypePage type="expense" txs={txs} refresh={refresh} />}
        </main>
      </div>
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const readHash = () => window.location.hash.replace("#", "") || "login";
  const [page, setPage] = useState(readHash());
  const go = (p) => { window.location.hash = p; setPage(p); };
  useEffect(() => {
    window.addEventListener("hashchange", () => setPage(readHash()));
    if (!localStorage.getItem("token")) { setReady(true); return; }
    api("/auth/me").then((d) => setUser(d.user)).catch(() => localStorage.removeItem("token")).finally(() => setReady(true));
  }, []);
  const logout = () => { localStorage.removeItem("token"); setUser(null); go("login"); };
  if (!ready) return null;
  if (!user) {
    const mode = page === "signup" ? "signup" : "login";
    return <Auth mode={mode} go={go} onAuth={(u) => { setUser(u); go("dashboard"); }} />;
  }
  const appPage = ["dashboard", "income", "expense"].includes(page) ? page : "dashboard";
  return <Shell user={user} page={appPage} go={go} logout={logout} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>`;

app.use((req, res) => res.type("html").send(CLIENT_HTML));

/* ============================ START ============================ */
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log("Expense Tracker running at http://localhost:" + PORT));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });