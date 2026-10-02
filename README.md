# DukaanDesk

Online store with product management, orders, customer questions and a seller dashboard.
Stack: React (Vite), Node/Express, MongoDB. One server serves both the API and the built site.

## Data stored in MongoDB
- Products: name, description, category, prices, available stock, and product image.
- Orders: order ID, customer name/phone/address, items and price snapshot, payment method, payment screenshot (wallet payments), totals, and status.
- Customer messages: name, phone, optional order number, message, and seller reply.
- Feedback: customer name, private email, comment, date, and seller reply. Public feedback responses never include email addresses.
- Guest customer state: cart product IDs/quantities and favorite product IDs, keyed to a random customer key stored in that browser. Existing browser cart/favorites are migrated on first API sync. Clearing site storage loses that key, so customers should keep using the same browser profile to recover their guest cart.

Search text, category/sort selections, unfinished checkout form fields, and seller login tokens are not stored in MongoDB. Seller credentials and store settings are read from environment variables, not database records. Data is written when a customer submits an order, question, or feedback, or when cart/favorite state syncs; partially completed forms are not sent.

Uploaded product images and wallet payment screenshots are currently stored as encoded image data in MongoDB documents. This is convenient for a small store, but production should use object storage such as Cloudinary or S3 for images and save only the resulting URL in MongoDB to keep document sizes and database costs manageable. Wallet payments are manually verified from uploaded screenshots; this project does not process payments through a payment gateway.

## 1. Run locally
1. Install Node 20+ and either MongoDB locally or a free MongoDB Atlas cluster.
2. `npm run install:all`
3. `cp server/.env.example server/.env` and edit it (Mongo URI, admin email/password, JWT secret, store name, WhatsApp number as 923XXXXXXXXX).
4. Terminal 1: `npm run dev:server`  Terminal 2: `npm run dev:client`
5. Open http://localhost:5173. Seller page: log in with your ADMIN_EMAIL/ADMIN_PASSWORD, add products, then test an order.

## 2. Deploy (one service on Render)
1. Create a free MongoDB Atlas cluster. Add a database user, allow network access 0.0.0.0/0, copy the connection string into MONGO_URI.
2. Push this folder to a GitHub repo.
3. On render.com: New > Web Service > connect the repo.
   - Build command: `npm run install:all && npm run build`
   - Start command: `npm start`
   - Environment variables: MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, STORE_NAME, WHATSAPP, DELIVERY_FEE, FREE_DELIVERY_ABOVE, NODE_VERSION=20
4. Open the .onrender.com URL and test. (Free tier sleeps after idle time; use a paid instance for a real launch.)

## 3. Domain
1. Test with 2-3 real sellers first, then buy the domain (Namecheap/GoDaddy; .com about $10-15/year).
2. Render > your service > Settings > Custom Domains > add `www.yourdomain.com` and the root domain.
3. At your registrar's DNS page, add the records Render shows (usually a CNAME for `www` and A/ALIAS for the root). Remove conflicting old records.
4. Wait for DNS (minutes to 24h). Render issues HTTPS automatically.

## 4. Launch checklist
- Place a test order, change its status, reply to a test question, track it.
- Use a long random JWT_SECRET and a strong admin password.
- Add 15-20 products with photos and verify an image can be opened on mobile and desktop.
- Share the link in Facebook seller groups and Instagram; offer first customers free delivery.

## Not included yet
Multi-seller subdomains, live (Socket.io) chat, PDF invoices, customer accounts/password recovery, automatic payment-gateway processing, automated email/SMS notifications, and automated database backups. Plan these before a larger public launch.
