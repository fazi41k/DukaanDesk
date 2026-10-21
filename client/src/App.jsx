import React, { useEffect, useMemo, useState } from "react";

const api = async (url, opts = {}, token) => {
  const r = await fetch("/api" + url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: "Bearer " + token }),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
};

const pkr = (n) => "Rs " + Number(n || 0).toLocaleString();
const getCustomerKey = () => {
  let key = localStorage.getItem("dd_customer_key");
  if (!key) {
    key = window.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("dd_customer_key", key);
  }
  return key;
};
const readLocalList = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
};
const STATUSES = ["New", "Confirmed", "Packed", "Shipped", "Delivered", "Returned"];
const BENEFITS = [
  { icon: "🚚", title: "Fast delivery", text: "Same-day dispatch for in-city orders and reliable nationwide shipping." },
  { icon: "🛡️", title: "Trusted quality", text: "Only carefully checked products so customers order with confidence." },
  { icon: "💬", title: "Real support", text: "Fast replies on WhatsApp and message tracking for every order." },
];
export default function App() {
  const [view, setView] = useState(() => (
    window.location.pathname.replace(/\/+$/, "") === "/seller" ? "admin" : "shop"
  ));
  const [cfg, setCfg] = useState({ storeName: "Store", deliveryFee: 0, freeAbove: 0, whatsapp: "" });
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dd_cart") || "[]"); } catch { return []; }
  });
  const [favorites, setFavorites] = useState(() => readLocalList("dd_favorites"));
  const [customerKey] = useState(getCustomerKey);
  const [customerStateReady, setCustomerStateReady] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("dd_token") || "");

  useEffect(() => {
    api("/config").then((c) => {
      setCfg(c);
      document.title = c.storeName;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCustomerState = async () => {
      try {
        const saved = await api(`/customer-state/${encodeURIComponent(customerKey)}`);
        if (cancelled) return;
        if (saved.exists) {
          setCart(saved.cart);
          setFavorites(saved.favorites);
        } else {
          const legacyCart = readLocalList("dd_cart").map((item) => ({ product: item._id, qty: item.qty }));
          const legacyFavorites = readLocalList("dd_favorites");
          await api(`/customer-state/${encodeURIComponent(customerKey)}`, {
            method: "PUT",
            body: { cart: legacyCart, favorites: legacyFavorites },
          });
        }
      } catch (error) {
        console.error("Could not load saved customer cart and favorites:", error);
      } finally {
        if (!cancelled) setCustomerStateReady(true);
      }
    };
    loadCustomerState();
    return () => { cancelled = true; };
  }, [customerKey]);

  useEffect(() => {
    if (!customerStateReady) return undefined;
    localStorage.setItem("dd_cart", JSON.stringify(cart));
    localStorage.setItem("dd_favorites", JSON.stringify(favorites));
    const timer = window.setTimeout(() => {
      api(`/customer-state/${encodeURIComponent(customerKey)}`, {
        method: "PUT",
        body: {
          cart: cart.map((item) => ({ product: item._id, qty: item.qty })),
          favorites,
        },
      }).catch((error) => console.error("Could not save customer cart and favorites:", error));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [cart, favorites, customerKey, customerStateReady]);

  const add = (p) => {
    setCart((c) => {
      const found = c.find((i) => i._id === p._id);
      return found
        ? c.map((i) => (i._id === p._id ? { ...i, qty: i.qty + 1 } : i))
        : [...c, { ...p, qty: 1 }];
    });
    setView("cart");
  };

  const count = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <>
      {view !== "admin" && (
        <>
          <header>
            <div className="bar">
              <div className="brand-lockup">
                <h1>{cfg.storeName}</h1>
                <span>Jewellery, Accessories and many more</span>
              </div>
              <button className="home-nav" onClick={() => setView("shop")}>Home</button>
              <button className="ghost light" onClick={() => setView("track")}>Track order</button>
              <button className="ghost light" onClick={() => setView("help")}>Ask us</button>
              <button className="ghost light" onClick={() => setView("cart")}>Cart ({count})</button>
            </div>
          </header>

        </>
      )}

      <main>
        {view === "shop" && <Shop cfg={cfg} add={add} favorites={favorites} setFavorites={setFavorites} />}
        {view === "cart" && <Cart cfg={cfg} cart={cart} setCart={setCart} />}
        {view === "track" && <Track />}
        {view === "help" && <Help />}
        {view === "feedback" && <Feedback />}
        {view === "privacy" && <InfoPage type="privacy" />}
        {view === "terms" && <InfoPage type="terms" />}
        {view === "admin" && <Admin token={token} setToken={(t) => { localStorage.setItem("dd_token", t); setToken(t); }} />}
      </main>

      {view !== "admin" && (
        <>
          <Footer navigate={setView} storeName={cfg.storeName} />
          {cfg.whatsapp && (
            <a className="wa" href={`https://wa.me/${cfg.whatsapp}`} target="_blank" rel="noreferrer">
              Chat on WhatsApp
            </a>
          )}
        </>
      )}
    </>
  );
}

function Footer({ navigate, storeName }) {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <strong>{storeName}</strong>
          <span>Everyday essentials, thoughtfully delivered.</span>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <button onClick={() => navigate("shop")}>Home</button>
          <button onClick={() => navigate("track")}>Track order</button>
          <button onClick={() => navigate("help")}>Contact</button>
          <button onClick={() => navigate("feedback")}>Customer feedback</button>
          <button onClick={() => navigate("privacy")}>Privacy</button>
          <button onClick={() => navigate("terms")}>Terms</button>
        </nav>
      </div>
      <div className="footer-bottom">© 2026 {storeName}. All rights reserved.</div>
    </footer>
  );
}

function Feedback() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", comment: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/feedback")
      .then(setEntries)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      const entry = await api("/feedback", { method: "POST", body: form });
      setEntries((current) => [entry, ...current]);
      setForm({ name: "", email: "", comment: "" });
      setSuccess("Thanks for sharing your feedback.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="feedback-page">
      <div className="feedback-heading">
        <span className="eyebrow soft">Customer voices</span>
        <h2>Feedback from our customers</h2>
        <p className="muted">Share your experience or read comments submitted by other customers.</p>
      </div>
      <div className="feedback-layout">
        <form className="panel form feedback-form" onSubmit={submit}>
          <h3>Leave feedback</h3>
          <label className="field-label">Name
            <input required maxLength={80} autoComplete="name" placeholder="Enter your name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field-label">Email address
            <input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label className="field-label">Your comment
            <textarea required minLength={3} maxLength={1000} rows={5} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
          </label>
          <small className="muted">Your email is kept private and is not shown with your comment.</small>
          {error && <span className="err" role="alert">{error}</span>}
          {success && <span className="ok" role="status">{success}</span>}
          <button type="submit">Submit feedback</button>
        </form>

        <div className="feedback-list" aria-live="polite">
          <h3>Recent feedback</h3>
          {loading && <p className="muted">Loading feedback...</p>}
          {!loading && entries.length === 0 && <p className="muted">No feedback yet. Be the first to share your experience.</p>}
          {entries.map((entry) => (
            <article className="feedback-entry" key={entry._id}>
              <div className="feedback-entry-meta">
                <strong>{entry.name || entry.username}</strong>
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString()}</time>
              </div>
              <p>{entry.comment}</p>
              {entry.reply && <p className="feedback-reply"><strong>Seller reply:</strong> {entry.reply}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function InfoPage({ type }) {
  const isPrivacy = type === "privacy";
  return (
    <article className="panel info-page">
      <h2>{isPrivacy ? "Privacy" : "Terms of service"}</h2>
      {isPrivacy ? (
        <>
          <h3>Information we collect</h3>
          <p>When you place an order, we use your name, phone number, address, and order details to process delivery and provide support. Feedback submissions include your name, email, and comment.</p>
          <h3>How information is used</h3>
          <p>Order details are used to fulfill and track orders. Feedback email addresses are kept private and are not displayed publicly. Customer comments may be shown on this site.</p>
          <h3>Payment information</h3>
          <p>Wallet payment screenshots are submitted for payment verification. Do not include passwords, PINs, or one-time verification codes in screenshots or messages.</p>
          <h3>Questions</h3>
          <p>Contact the store through the Ask us page for privacy questions or requests.</p>
        </>
      ) : (
        <>
          <h3>Orders and availability</h3>
          <p>Orders are subject to product availability. An order reference is provided after checkout for status tracking.</p>
          <h3>Payments</h3>
          <p>Cash on delivery and the wallet options shown at checkout are available. Wallet orders require a payment screenshot and are fulfilled after the seller verifies payment.</p>
          <h3>Delivery and support</h3>
          <p>Delivery charges and any free-delivery threshold are shown before placing an order. Contact the store through Ask us for order assistance.</p>
          <h3>Feedback</h3>
          <p>Please submit respectful, relevant comments. Feedback may be displayed publicly with your username; your email address is not displayed.</p>
        </>
      )}
    </article>
  );
}

function Shop({ cfg, add, favorites, setFavorites }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("featured");
  const [quickView, setQuickView] = useState(null);
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api("/products");
        setItems(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleFavorite = (id) => {
    setFavorites((curr) => (curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]));
  };

  const cats = useMemo(() => [...new Set(items.map((p) => p.category).filter(Boolean))], [items]);
  const filteredProducts = useMemo(() => {
    const filtered = items.filter((p) => {
      const matchesCat = !cat || p.category === cat;
      const matchesText = p.name.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase());
      return matchesCat && matchesText;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "low":
        sortingUtils(sorted, "low");
        break;
      case "high":
        sortingUtils(sorted, "high");
        break;
      case "new":
        sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
      default:
        sorted.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0));
        break;
    }
    return sorted;
  }, [items, q, cat, sort]);

  const featured = items.slice(0, 3);

  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Fresh finds • trusted quality</span>
          <h2>Everyday finds,<span className="hero-title-accent">with a little extra charm.</span></h2>
          <p>
            Discover trending essentials, quick local delivery, and great savings on items you use every day.
            {cfg.freeAbove ? ` Free delivery starts above ${pkr(cfg.freeAbove)}.` : ""}
          </p>
          <div className="hero-cta">
            <button onClick={() => window.scrollTo({ top: 540, behavior: "smooth" })}>Shop now</button>
            <button className="ghost light" onClick={() => window.scrollTo({ top: 1000, behavior: "smooth" })}>How it works</button>
          </div>
          <div className="hero-stats">
            <div><strong>10k+</strong><span>happy shoppers</span></div>
            <div><strong>2 hrs</strong><span>local dispatch</span></div>
            <div><strong>4.9/5</strong><span>average rating</span></div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="product-spotlight">
            <div className="image-box">
              <img
                src="/featured-bracelet.png"
                alt="Tulip bracelet"
                loading="lazy"
              />
            </div>
            <div className="spotlight-meta">
              <div>
                <strong>Tulip bracelet</strong>
                <div className="small muted">Hot pick</div>
              </div>
              <span>{pkr(1049)}</span>
            </div>
          </div>

          <div className="featured-summary">
            <div className="featured-label-row">
              <span>Featured item</span>
              <strong>{pkr(1049)}</strong>
            </div>
            <div className="featured-price-meta">
              <span className="feature-old">{pkr(1349)}</span>
              <span className="delivery-chip">Delivery: {pkr(200)}</span>
            </div>
            <div className="promo-line">
              <span className="pill">Free shipping</span>
              <small>Orders above {pkr(cfg.freeAbove || 3000)}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="benefits-grid">
        {BENEFITS.map((item) => (
          <article key={item.title} className="benefit-card">
            <span>{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="shop-toolbar">
        <div className="toolbar-head">
          <div>
            <span className="eyebrow soft">Best picks</span>
            <h3>Shop our latest essentials</h3>
          </div>
          <div className="toolbar-controls">
            <input
              placeholder="Search products"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search products"
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="new">Newest</option>
            </select>
          </div>
        </div>

        <div className="category-pills">
          <button className={`pill ${!cat ? "active" : ""}`} onClick={() => setCat("")}>All</button>
          {cats.map((c) => (
            <button key={c} className={`pill ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </section>

      {loading ? <div className="skeleton" /> : null}

      {!loading && !filteredProducts.length && (
        <div className="panel empty-state">
          <h3>Nothing matched your search.</h3>
          <p className="muted">Try a different keyword or category to discover more products.</p>
        </div>
      )}

      <div className="grid">
        {filteredProducts.map((p) => {
          const isFavorite = favorites.includes(p._id);
          return (
            <article className="card product-card" key={p._id}>
              <div className="image-wrap">
                {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="ph">No photo</div>}
                <button
                  className={`favorite-btn ${isFavorite ? "active" : ""}`}
                  onClick={() => toggleFavorite(p._id)}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFavorite ? "♥" : "♡"}
                </button>
              </div>
              <div className="in">
                <div className="product-meta-top">
                  <strong>{p.name}</strong>
                  <span className="small muted">{p.category || "General"}</span>
                </div>
                <span className="product-desc muted">{p.description}</span>
                <div className="price-row">
                  <span className="price">{pkr(p.salePrice || p.price)}</span>
                  {p.salePrice ? <span className="old">{pkr(p.price)}</span> : null}
                </div>
                <div className="status-row">
                  {p.stock < 1 ? <span className="tag danger">Sold out</span> : p.stock < 5 ? <span className="tag danger">Only {p.stock} left</span> : <span className="tag success">In stock</span>}
                </div>
                <div className="product-actions">
                  <button className="ghost" onClick={() => setQuickView(p)}>Quick view</button>
                  <button disabled={p.stock < 1} onClick={() => add(p)}>Add</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {quickView && (
        <div className="modal-backdrop" onClick={() => setQuickView(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setQuickView(null)} aria-label="Close">×</button>
            <div className="modal-image-wrap">
              {quickView.image ? <img src={quickView.image} alt={quickView.name} /> : <div className="ph">No photo</div>}
            </div>
            <div className="modal-body">
              <span className="eyebrow soft">Featured item</span>
              <h3>{quickView.name}</h3>
              <div className="price-row">
                <span className="price">{pkr(quickView.salePrice || quickView.price)}</span>
                {quickView.salePrice ? <span className="old">{pkr(quickView.price)}</span> : null}
              </div>
              <p className="muted">{quickView.description}</p>
              <div className="status-row">
                {quickView.stock < 1 ? <span className="tag danger">Sold out</span> : <span className="tag success">Ready to ship</span>}
                <span className="tag">{quickView.category || "General"}</span>
              </div>
              <div className="row">
                <button onClick={() => { add(quickView); setQuickView(null); }}>Add to cart</button>
                <button className="ghost" onClick={() => setQuickView(null)}>Continue shopping</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Cart({ cfg, cart, setCart }) {
  const [f, setF] = useState({ name: "", phone: "", city: "", address: "", payment: "COD" });
  const [paymentProof, setPaymentProof] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [copiedOrderNo, setCopiedOrderNo] = useState(false);

  const sub = cart.reduce((sum, item) => sum + (item.salePrice || item.price) * item.qty, 0);
  const delivery = cfg.freeAbove && sub >= cfg.freeAbove ? 0 : cfg.deliveryFee;

  const updateQty = (id, delta) => {
    setCart((items) =>
      items.flatMap((item) => {
        if (item._id !== id) return [item];
        const nextQty = item.qty + delta;
        return nextQty > 0 ? [{ ...item, qty: nextQty }] : [];
      })
    );
  };

  const setField = (key) => (e) => setF({ ...f, [key]: e.target.value });

  if (done) {
    return (
      <div className="panel order-status-box">
        <h2>Order placed successfully</h2>
        <div className="order-reference">
          <div>
            <span className="muted">Order ID</span>
            <strong>{done.orderNo}</strong>
          </div>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(done.orderNo).then(() => setCopiedOrderNo(true)).catch(() => setCopiedOrderNo(false))}>
            {copiedOrderNo ? "Copied" : "Copy ID"}
          </button>
        </div>
        <p className="muted">To check status, open <strong>Track order</strong> and enter this ID with the phone number you provided at checkout.</p>
        <div className="status-progress">
          {STATUSES.map((status, index) => (
            <span key={status} className={`step ${index === 0 ? "active" : ""}`}>
              {status}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!cart.length) {
    return <div className="panel"><h2>Your cart is empty</h2><p className="muted">Add a few essentials from the shop to get started.</p></div>;
  }

  const place = async () => {
    try {
      setErr("");
      if (f.payment !== "COD" && !paymentProof) {
        setErr("Upload your payment screenshot before placing this order.");
        return;
      }
      const payload = await api("/orders", {
        method: "POST",
        body: { ...f, paymentProof, items: cart.map((item) => ({ id: item._id, qty: item.qty })) },
      });
      setDone(payload);
      setCart([]);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="row cart-layout">
      <div className="panel cart-panel">
        <h2>Your cart</h2>
        {cart.map((item) => (
          <div className="cart-item" key={item._id}>
            <div>
              <strong>{item.name}</strong>
              <p>{pkr(item.salePrice || item.price)} each</p>
            </div>
            <div className="qty-wrap">
              <button className="ghost" onClick={() => updateQty(item._id, -1)}>-</button>
              <span>{item.qty}</span>
              <button className="ghost" onClick={() => updateQty(item._id, 1)}>+</button>
            </div>
            <div className="cart-amount">
              <strong>{pkr((item.salePrice || item.price) * item.qty)}</strong>
              <button className="ghost danger-text" onClick={() => setCart((current) => current.filter((x) => x._id !== item._id))}>Remove</button>
            </div>
          </div>
        ))}
        <div className="totals" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Items</span><strong>{pkr(sub)}</strong></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Delivery</span><strong>{delivery ? pkr(delivery) : "Free"}</strong></div>
          <div className="row grand-total" style={{ justifyContent: "space-between" }}><span>Total</span><strong>{pkr(sub + delivery)}</strong></div>
        </div>
      </div>

      <div className="panel form cart-panel">
        <h2>Delivery details</h2>
        <input placeholder="Full name" value={f.name} onChange={setField("name")} />
        <label className="field-label">Phone number
          <input type="tel" autoComplete="tel" placeholder="03XXXXXXXXX" value={f.phone} onChange={setField("phone")} />
        </label>
        <input placeholder="City" value={f.city} onChange={setField("city")} />
        <textarea placeholder="Full address" value={f.address} onChange={setField("address")} />
        <select value={f.payment} onChange={setField("payment")}>
          <option value="COD">Cash on delivery</option>
          <option value="Easypaisa">Easypaisa</option>
          <option value="JazzCash">JazzCash</option>
        </select>
        {f.payment !== "COD" && (
          <div className="payment-instructions">
            <strong>Send payment via {f.payment}</strong>
            <span>Account name: Muhammad Fayyaz</span>
            <span>Account number: 03185223686</span>
            <span>Pay {pkr(sub + delivery)} and upload the payment screenshot below.</span>
            <label className="field-label">Payment screenshot (required)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith("image/")) {
                    setErr("Choose an image file for the payment screenshot.");
                    return;
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    setErr("Payment screenshot must be 2 MB or smaller.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => { setPaymentProof(reader.result); setErr(""); };
                  reader.onerror = () => setErr("Could not read the screenshot. Try another image.");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {paymentProof && <img className="payment-proof-preview" src={paymentProof} alt="Payment screenshot preview" />}
            <small>Payment will be verified by the seller before fulfillment.</small>
          </div>
        )}
        {err && <span className="err">{err}</span>}
        <button onClick={place}>Place order</button>
      </div>
    </div>
  );
}

function Track() {
  const [no, setNo] = useState("");
  const [phone, setPhone] = useState("");
  const [o, setO] = useState(null);
  const [err, setErr] = useState("");

  const go = async () => {
    try {
      setErr("");
      setO(await api(`/orders/track?no=${encodeURIComponent(no)}&phone=${encodeURIComponent(phone)}`));
    } catch (e) {
      setO(null);
      setErr(e.message);
    }
  };

  return (
    <div className="panel form">
      <h2>Track your order</h2>
      <label className="field-label">Order ID
        <input placeholder="e.g. DD1234567" value={no} onChange={(e) => setNo(e.target.value)} />
      </label>
      <label className="field-label">Phone number
        <input type="tel" autoComplete="tel" placeholder="Enter the phone number used at checkout" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <button onClick={go}>Find order</button>
      {err && <span className="err">{err}</span>}
      {o && (
        <div className="order-status-box">
          <p>Status: <strong>{o.status}</strong></p>
          <p>Total: {pkr(o.total)}</p>
          <div className="status-progress">
            {STATUSES.map((status) => (
              <span key={status} className={`step ${status === o.status ? "active" : ""}`}>
                {status}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Help() {
  const [f, setF] = useState({ name: "", phone: "", text: "", orderNo: "" });
  const [msgs, setMsgs] = useState([]);
  const [err, setErr] = useState("");

  const load = (phone) => api("/messages/mine?phone=" + encodeURIComponent(phone)).then(setMsgs).catch(() => {});

  const send = async () => {
    try {
      setErr("");
      await api("/messages", { method: "POST", body: f });
      setF({ ...f, text: "" });
      load(f.phone);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="panel form">
      <h2>Ask the seller</h2>
      <input placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input placeholder="Your phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} onBlur={() => f.phone && load(f.phone)} />
      <input placeholder="Order number (optional)" value={f.orderNo} onChange={(e) => setF({ ...f, orderNo: e.target.value })} />
      <textarea placeholder="Your question" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      {err && <span className="err">{err}</span>}
      <button onClick={send}>Send question</button>
      {msgs.map((m) => (
        <p key={m._id}>
          <strong>You:</strong> {m.text}
          <br />
          {m.reply ? <span className="ok">Seller: {m.reply}</span> : <span className="muted">Waiting for a reply</span>}
        </p>
      ))}
    </div>
  );
}

function Admin({ token, setToken }) {
  const [tab, setTab] = useState("orders");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const empty = { name: "", description: "", category: "", price: "", salePrice: "", stock: "1", image: "" };
  const [p, setP] = useState(empty);
  const [productError, setProductError] = useState("");

  const A = (u, o) => api(u, o, token);
  const load = () =>
    Promise.all([A("/orders"), api("/products"), A("/messages"), A("/feedback")])
      .then(([o, pr, m, fb]) => { setOrders(o); setProducts(pr); setMsgs(m); setFeedback(fb); })
      .catch(() => setToken(""));

  useEffect(() => {
    if (token) load();
  }, [token]);

  if (!token) {
    return (
      <div className="panel form">
        <h2>Seller login</h2>
        <input placeholder="Email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
        <input type="password" placeholder="Password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
        {err && <span className="err">{err}</span>}
        <button onClick={() => api("/login", { method: "POST", body: login }).then((d) => setToken(d.token)).catch((e) => setErr(e.message))}>Log in</button>
      </div>
    );
  }

  const today = orders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString());

  const save = async () => {
    if (!p.name.trim() || !p.price || Number(p.stock) < 0) {
      setProductError("Enter a product name, a price, and a valid stock quantity.");
      return;
    }
    try {
      const body = { ...p, price: +p.price, salePrice: +p.salePrice || undefined, stock: Number(p.stock) || 0 };
      await A(p._id ? "/products/" + p._id : "/products", { method: p._id ? "PUT" : "POST", body });
      setP(empty);
      setProductError("");
      load();
    } catch (error) {
      setProductError(error.message);
    }
  };

  const uploadProductImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProductError("Choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProductError("Image must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setP((current) => ({ ...current, image: reader.result }));
      setProductError("");
    };
    reader.onerror = () => setProductError("Could not read this image. Try another file.");
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="panel row noprint">
        <strong>Today: {today.length} orders, {pkr(today.reduce((sum, order) => sum + order.total, 0))}</strong>
        <span>Pending: {orders.filter((o) => o.status === "New").length}</span>
        <button className="ghost" onClick={() => setToken("")}>Log out</button>
      </div>

      <div className="tabs">
        {["orders", "products", "messages", "feedback"].map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="panel scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment proof</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id}>
                  <td>
                    {o.orderNo}
                    <br />
                    <small>{new Date(o.createdAt).toLocaleDateString()}</small>
                  </td>
                  <td>
                    {o.name}<br />
                    {o.phone}<br />
                    {o.city}, {o.address}<br />
                    <small>{o.payment}</small>
                  </td>
                  <td>{o.items.map((item) => `${item.name} × ${item.qty}`).join(", ")}</td>
                  <td>{pkr(o.total)}</td>
                  <td>
                    {o.paymentProof ? (
                      <a href={o.paymentProof} target="_blank" rel="noreferrer">
                        <img className="seller-proof-thumb" src={o.paymentProof} alt={`Payment proof for ${o.orderNo}`} />
                      </a>
                    ) : <span className="muted">Not provided</span>}
                  </td>
                  <td>
                    <select value={o.status} onChange={(e) => A("/orders/" + o._id, { method: "PATCH", body: { status: e.target.value } }).then(load)}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><button className="ghost" onClick={() => window.print()}>Print</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "products" && (
        <>
          <div className="panel form">
            <h2>{p._id ? "Edit product" : "Add product"}</h2>
            <label className="field-label">Product name
              <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Product name" />
            </label>
            <label className="field-label">Description
              <textarea value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} placeholder="Write a product description" rows={4} />
            </label>
            <label className="field-label">Category
              <input value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} placeholder="Category" />
            </label>
            <div className="form-grid">
              <label className="field-label">Price (PKR)
                <input type="number" min="0" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} placeholder="Price" />
              </label>
              <label className="field-label">Sale price (optional)
                <input type="number" min="0" value={p.salePrice} onChange={(e) => setP({ ...p, salePrice: e.target.value })} placeholder="Sale price" />
              </label>
              <label className="field-label">Available stock
                <input type="number" min="0" value={p.stock} onChange={(e) => setP({ ...p, stock: e.target.value })} placeholder="Quantity" />
              </label>
            </div>
            <label className="field-label">Product photo
              <input type="file" accept="image/*" onChange={(e) => uploadProductImage(e.target.files?.[0])} />
            </label>
            <label className="field-label">Or use an image URL
              <input value={p.image?.startsWith("data:") ? "" : p.image} onChange={(e) => setP({ ...p, image: e.target.value })} placeholder="https://..." />
            </label>
            {p.image && <img className="product-image-preview" src={p.image} alt="Product preview" />}
            {productError && <span className="err">{productError}</span>}
            <button onClick={save}>Save product</button>
          </div>

          <div className="panel scroll">
            <table>
              <tbody>
                {products.map((x) => (
                  <tr key={x._id}>
                    <td>{x.name}</td>
                    <td>{pkr(x.salePrice || x.price)}</td>
                    <td>Stock {x.stock}</td>
                    <td>
                      <button className="ghost" onClick={() => { setP(x); window.scrollTo(0, 0); }}>Edit</button>
                      <button className="danger" onClick={() => confirm("Delete " + x.name + "?") && A("/products/" + x._id, { method: "DELETE" }).then(load)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "messages" && msgs.map((m) => <Reply key={m._id} m={m} A={A} load={load} />)}
      {tab === "feedback" && (
        <div className="feedback-admin-list">
          {feedback.length ? feedback.map((entry) => (
            <AdminFeedbackEntry key={entry._id} entry={entry} A={A} load={load} />
          )) : <div className="panel muted">No feedback has been submitted yet.</div>}
        </div>
      )}
    </>
  );
}

function AdminFeedbackEntry({ entry, A, load }) {
  const [reply, setReply] = useState(entry.reply || "");
  const [error, setError] = useState("");

  const saveReply = async (event) => {
    event.preventDefault();
    try {
      setError("");
      await A("/feedback/" + entry._id, { method: "PATCH", body: { reply } });
      window.alert("Reply submitted successfully.");
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteEntry = async () => {
    if (!confirm("Delete this feedback?")) return;
    try {
      await A("/feedback/" + entry._id, { method: "DELETE" });
      load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <article className="panel feedback-admin-entry">
      <div className="feedback-entry-meta">
        <strong>{entry.name || entry.username}</strong>
        <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString()}</time>
      </div>
      <p>{entry.comment}</p>
      <form className="feedback-admin-reply" onSubmit={saveReply}>
        <label className="field-label">Reply as seller
          <textarea rows={3} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply" />
        </label>
        {error && <span className="err" role="alert">{error}</span>}
        <div className="row">
          <button type="submit">Save reply</button>
          <button className="danger" type="button" onClick={deleteEntry}>Delete feedback</button>
        </div>
      </form>
    </article>
  );
}

function Reply({ m, A, load }) {
  const [r, setR] = useState(m.reply || "");

  return (
    <div className="panel">
      <strong>{m.name || "Customer"} · {m.phone}</strong>
      {m.orderNo && <span className="muted"> · Order {m.orderNo}</span>}
      <p>{m.text}</p>
      <div className="row">
        <input style={{ flex: 1 }} placeholder="Type a reply" value={r} onChange={(e) => setR(e.target.value)} />
        <button onClick={() => A("/messages/" + m._id, { method: "PATCH", body: { reply: r } }).then(load)}>Send reply</button>
      </div>
    </div>
  );
}

function sortingUtils(list, mode) {
  list.sort((a, b) => {
    const first = a.salePrice || a.price;
    const second = b.salePrice || b.price;
    return mode === "low" ? first - second : second - first;
  });
}