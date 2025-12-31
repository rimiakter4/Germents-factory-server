
const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require("cors");
require('dotenv').config();
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin Setup
const serviceAccount = require("./germents-factory-firebase-adminsdk-fbsvc-d05cd6a5a0.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// --- ১. টোকেন ভেরিফাই মিডলওয়্যার ---
const verifyToken = async (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).send({ message: "Unauthorized" });
    const token = req.headers.authorization.split(' ')[1];
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded_email = decoded.email;
        next();
    } catch (err) {
        return res.status(403).send({ message: "Forbidden access" });
    }
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q32hk1x.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
    try {
        const db = client.db("germents_factory_db");
        const productsCollection = db.collection("products");
        const usersCollection = db.collection("users");
        const ordersCollection = db.collection('orders');
        const trackingCollection = db.collection('tracking');

        /* ------------------ ২. রোল মিডলওয়্যার ------------------ */
        const verifyAdmin = async (req, res, next) => {
            const user = await usersCollection.findOne({ email: req.decoded_email });
            if (user?.role !== 'admin') return res.status(403).send({ message: 'Admin only access' });
            next();
        };

        const verifyManager = async (req, res, next) => {
            const user = await usersCollection.findOne({ email: req.decoded_email });
            const role = user?.role;
            if (role === 'manager' || role === 'admin') {
                next();
            } else {
                return res.status(403).send({ message: "Forbidden: Manager/Admin only" });
            }
        };

        /* ------------------ ৩. ইউজার রাউটস ------------------ */
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: "user already exists" });
            if (!user.role) user.role = 'buyer'; 
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.get('/user/:email/role', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            res.send({ role: user?.role || 'buyer' });
        });

        app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { role: req.body.role } }
            );
            res.send(result);
        });

        /* ------------------ ৪. প্রোডাক্ট রাউটস ------------------ */
        app.get('/products/home', async (req, res) => {
            const result = await productsCollection.find().sort({ _id: -1 }).limit(6).toArray();
            res.send(result);
        });

        app.get('/products', async (req, res) => {
            const limit = parseInt(req.query.limit);
            let cursor = productsCollection.find().sort({ _id: -1 });
            if (limit) cursor = cursor.limit(limit);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/products/:id', async (req, res) => {
            const result = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        app.get('/all-products/:email', verifyToken, verifyManager, async (req, res) => {
            const result = await productsCollection.find().sort({ _id: -1 }).toArray();
            res.send(result);
        });

        /* ------------------ ৫. অর্ডার রাউটস (Clean & Unified) ------------------ */
        
        // ইউজারের নিজের অর্ডার
          app.get("/orders/pending", verifyToken, verifyManager, async (req, res) => {
            const result = await ordersCollection.find({ orderStatus: "pending" }).toArray();
            res.send(result);
        });
        app.get("/orders", verifyToken, async (req, res) => {
            const email = req.decoded_email.toLowerCase();
            const result = await ordersCollection.find({ email }).sort({ _id: -1 }).toArray();
            res.send(result);
        });

        // ম্যানেজারের জন্য সব অর্ডার
        app.get("/allorders", verifyToken, verifyManager, async (req, res) => {
            const status = req.query.status;
            let query = {};
            if (status) query.orderStatus = { $regex: new RegExp(`^${status}$`, "i") };
            const result = await ordersCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result);
        });

        // সিঙ্গেল অর্ডার দেখার জন্য (সব ক্ষেত্রে এটি ব্যবহার করুন)
        app.get('/order-details/:id', verifyToken, async (req, res) => {
            try {
                const result = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!result) return res.status(404).send({ message: "Order not found" });
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: "Error fetching order details" });
            }
        });

        // ফ্রন্টএন্ড যদি /orders/:id এ GET রিকোয়েস্ট পাঠায় (ডুপ্লিকেট এরর কমাতে এটিও রাখা হলো)
        app.get('/orders/:id', verifyToken, async (req, res) => {
            const result = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        app.post("/orders", verifyToken, async (req, res) => {
            const order = req.body;
            order.email = req.decoded_email.toLowerCase();
            order.paymentStatus = order.paymentRequired ? "unpaid" : "cod";
            order.orderStatus = "pending";
            order.createdAt = new Date();
            const result = await ordersCollection.insertOne(order);
            res.send(result);
        });

app.patch('/orders/approve/:id', verifyToken, verifyManager, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: { orderStatus: 'approved' }
    };
    const result = await ordersCollection.updateOne(filter, updateDoc);
    // success প্রপার্টি যোগ করা হয়েছে ফ্রন্টএন্ডের সুবিধার জন্য
    res.send({ ...result, success: result.modifiedCount > 0 });
});

// ২. অর্ডার রিজেক্ট রুট
app.patch('/orders/reject/:id', verifyToken, verifyManager, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: { orderStatus: 'rejected' }
    };
    const result = await ordersCollection.updateOne(filter, updateDoc);
    res.send({ ...result, success: result.modifiedCount > 0 });
});
        // ম্যানেজার যখন স্ট্যাটাস (Approve/Reject) আপডেট করবে
        app.patch("/orders/:id", verifyToken, verifyManager, async (req, res) => {
            const id = req.params.id;
            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { orderStatus: req.body.status, updatedAt: new Date() } }
            );
            res.send(result);
        });

        /* ------------------ ৬. ট্র্যাকিং সিস্টেম (Fixed Tracking) ------------------ */
        
        // ম্যানেজার লোকেশন এবং টাইমলাইন আপডেট সেভ করলে
        app.post("/tracking", verifyToken, verifyManager, async (req, res) => {
            const trackingData = {
                orderId: req.body.orderId,
                status: req.body.status,
                location: req.body.location,
                message: req.body.message,
                updatedAt: new Date()
            };
            const result = await trackingCollection.insertOne(trackingData);
            res.send(result);
        });

        // ট্র্যাকিং হিস্ট্রি দেখার জন্য (৪-০-৪ এরর দিবে না)
        app.get("/tracking/:orderId", async (req, res) => {
            const orderId = req.params.orderId;
            const result = await trackingCollection.find({ orderId: orderId }).sort({ updatedAt: -1 }).toArray();
            res.send(result || []); 
        });

        /* ------------------ ৭. পেমেন্ট ------------------ */
        app.post('/create-checkout-session', async (req, res) => {
            const { productTitle, price, quantity, email, orderData } = req.body;
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: { currency: 'usd', product_data: { name: productTitle }, unit_amount: Math.round(price * quantity * 100) },
                    quantity: 1,
                }],
                customer_email: email,
                mode: 'payment',
                metadata: { orderData: JSON.stringify(orderData) },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/cancel`,
            });
            res.send({ url: session.url });
        });

        // console.log("MongoDB Connected Successfully!");
    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Garments Factory Server is Running'));
app.listen(port, () => console.log(`Server listening on port ${port}`));