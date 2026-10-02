import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const env = process.env;
const app = express();
app.use(cors(), express.json({ limit: "3mb" }));

const Product = mongoose.model("Product", new mongoose.Schema({
  name: String, description: String, category: { type: String, default: "General" },
  price: Number, salePrice: Number, stock: { type: Number, default: 1 }, image: String,
}, { timestamps: true }));
const Order = mongoose.model("Order", new mongoose.Schema({
  orderNo: String, name: String, phone: String, city: String, address: String,
  payment: { type: String, default: "COD" }, paymentProof: String,
  items: [{ product: mongoose.Schema.Types.ObjectId, name: String, price: Number, qty: Number }],
  subtotal: Number, delivery: Number, total: Number,
  status: { type: String, default: "New" },
}, { timestamps: true }));
const Message = mongoose.model("Message", new mongoose.Schema({
  name: String, phone: String, text: String, reply: String, orderNo: String,
}, { timestamps: true }));
const Feedback = mongoose.model("Feedback", new mongoose.Schema({
  username: { type: String, trim: true, maxlength: 30 },
  name: { type: String, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, maxlength: 254 },
  comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  reply: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true }));
const CustomerState = mongoose.model("CustomerState", new mongoose.Schema({
  guestKey: { type: String, required: true, unique: true, index: true },
  cart: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, qty: { type: Number, min: 1, max: 99 } }],
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
}, { timestamps: true }));

const auth = (req, res, next) => {
  try { jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Please log in" }); }
};
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

app.get("/api/config", (_, res) => res.json({
  storeName: env.STORE_NAME || "My Store", whatsapp: env.WHATSAPP || "",
  deliveryFee: +env.DELIVERY_FEE || 0, freeAbove: +env.FREE_DELIVERY_ABOVE || 0,
}));
const validateGuestKey = (guestKey) => {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(guestKey)) throw new Error("Invalid customer session");
};
app.get("/api/customer-state/:guestKey", wrap(async (req, res) => {
  validateGuestKey(req.params.guestKey);
  const state = await CustomerState.findOne({ guestKey: req.params.guestKey })
    .populate({ path: "cart.product", select: "name price salePrice stock" })
    .populate({ path: "favorites", select: "_id" });
  if (!state) return res.json({ exists: false, cart: [], favorites: [] });
  res.json({
    exists: true,
    cart: state.cart.flatMap(({ product, qty }) => product ? [{ ...product.toObject(), qty }] : []),
    favorites: state.favorites.filter(Boolean).map((product) => String(product._id)),
  });
}));
app.put("/api/customer-state/:guestKey", wrap(async (req, res) => {
  validateGuestKey(req.params.guestKey);
  const cartInput = Array.isArray(req.body.cart) ? req.body.cart : [];
  const favoritesInput = Array.isArray(req.body.favorites) ? req.body.favorites : [];
  if (cartInput.length > 100 || favoritesInput.length > 200) throw new Error("Customer cart or favorites limit exceeded");
  const cart = cartInput.map((item) => {
    const product = String(item.product || "");
    const qty = Number(item.qty);
    if (!mongoose.isValidObjectId(product) || !Number.isInteger(qty) || qty < 1 || qty > 99)
      throw new Error("Invalid cart item or quantity");
    return { product, qty };
  });
  const favorites = [...new Set(favoritesInput.map(String))];
  if (favorites.some((product) => !mongoose.isValidObjectId(product))) throw new Error("Invalid favorite product");
  const productIds = [...new Set([...cart.map((item) => item.product), ...favorites])];
  const foundProducts = await Product.find({ _id: { $in: productIds } }).select("_id");
  if (foundProducts.length !== productIds.length) throw new Error("One or more products no longer exist");
  await CustomerState.findOneAndUpdate(
    { guestKey: req.params.guestKey },
    { $set: { cart, favorites } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ ok: true });
}));
app.get("/api/feedback", wrap(async (_, res) => {
  const entries = await Feedback.find().sort("-createdAt").limit(50).select("username name comment reply createdAt");
  res.json(entries.map((entry) => ({
    _id: entry._id,
    name: entry.name || entry.username,
    comment: entry.comment,
    reply: entry.reply,
    createdAt: entry.createdAt,
  })));
}));
app.post("/api/feedback", wrap(async (req, res) => {
  const name = String(req.body.name || req.body.username || "").trim();
  const email = String(req.body.email || "").trim();
  const comment = String(req.body.comment || "").trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || comment.length < 3)
    throw new Error("Enter your name, a valid email, and a comment of at least 3 characters");
  if (name.length > 80 || email.length > 254 || comment.length > 1000)
    throw new Error("Please keep your name, email, and comment within the stated limits");
  const entry = await Feedback.create({ name, email, comment });
  res.status(201).json({ _id: entry._id, name: entry.name, comment: entry.comment, createdAt: entry.createdAt });
}));
app.patch("/api/feedback/:id", auth, wrap(async (req, res) => {
  const reply = String(req.body.reply || "").trim();
  if (reply.length > 1000) throw new Error("Reply must be 1000 characters or fewer");
  const entry = await Feedback.findByIdAndUpdate(req.params.id, { reply }, { new: true, runValidators: true });
  if (!entry) throw new Error("Feedback not found");
  res.json({ _id: entry._id, name: entry.name || entry.username, comment: entry.comment, reply: entry.reply, createdAt: entry.createdAt });
}));
app.delete("/api/feedback/:id", auth, wrap(async (req, res) => {
  const entry = await Feedback.findByIdAndDelete(req.params.id);
  if (!entry) throw new Error("Feedback not found");
  res.json({ ok: true });
}));
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (email === env.ADMIN_EMAIL && password === env.ADMIN_PASSWORD)
    return res.json({ token: jwt.sign({ admin: true }, env.JWT_SECRET, { expiresIn: "7d" }) });
  res.status(401).json({ error: "Wrong email or password" });
});

app.get("/api/products", wrap(async (_, res) => res.json(await Product.find().sort("-createdAt"))));
app.post("/api/products", auth, wrap(async (req, res) => res.json(await Product.create({ ...req.body, stock: req.body.stock ?? 1 }))));
app.put("/api/products/:id", auth, wrap(async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }))));
app.delete("/api/products/:id", auth, wrap(async (req, res) => { await Product.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));

app.post("/api/orders", wrap(async (req, res) => {
  const { name, phone, city, address, payment, paymentProof, items } = req.body;
  if (!name || !phone || !city || !address || !items?.length) throw new Error("Please fill in all fields");
  if (!["COD", "Easypaisa", "JazzCash"].includes(payment)) throw new Error("Choose a valid payment method");
  if (payment !== "COD" && !paymentProof) throw new Error("A payment screenshot is required for wallet payments");
  let subtotal = 0; const lines = [];
  for (const it of items) {                       // prices are re-read from DB, never trusted from the client
    const p = await Product.findById(it.id);
    const qty = Math.max(1, +it.qty || 1);
    if (!p || p.stock < qty) throw new Error(`${p?.name || "An item"} is out of stock`);
    const price = p.salePrice || p.price;
    subtotal += price * qty; lines.push({ product: p._id, name: p.name, price, qty });
  }
  for (const l of lines) await Product.findByIdAndUpdate(l.product, { $inc: { stock: -l.qty } });
  const delivery = env.FREE_DELIVERY_ABOVE && subtotal >= +env.FREE_DELIVERY_ABOVE ? 0 : +env.DELIVERY_FEE || 0;
  const orderNo = "DD" + Date.now().toString().slice(-7);
  res.json(await Order.create({ orderNo, name, phone, city, address, payment, paymentProof, items: lines, subtotal, delivery, total: subtotal + delivery }));
}));
app.get("/api/orders/track", wrap(async (req, res) => {
  const o = await Order.findOne({ orderNo: req.query.no, phone: req.query.phone });
  if (!o) throw new Error("No order found with that number and phone");
  res.json(o);
}));
app.get("/api/orders", auth, wrap(async (_, res) => res.json(await Order.find().sort("-createdAt"))));
app.patch("/api/orders/:id", auth, wrap(async (req, res) => res.json(await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }))));

app.post("/api/messages", wrap(async (req, res) => {
  if (!req.body.text || !req.body.phone) throw new Error("Enter your phone and message");
  res.json(await Message.create({ name: req.body.name, phone: req.body.phone, text: req.body.text, orderNo: req.body.orderNo }));
}));
app.get("/api/messages/mine", wrap(async (req, res) => res.json(await Message.find({ phone: req.query.phone }).sort("createdAt"))));
app.get("/api/messages", auth, wrap(async (_, res) => res.json(await Message.find().sort("-createdAt"))));
app.patch("/api/messages/:id", auth, wrap(async (req, res) => res.json(await Message.findByIdAndUpdate(req.params.id, { reply: req.body.reply }, { new: true }))));

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/dist");
app.use(express.static(dist));
app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));

await mongoose.connect(env.MONGO_URI);
app.listen(env.PORT || 5000, () => console.log("DukaanDesk running on port", env.PORT || 5000));
