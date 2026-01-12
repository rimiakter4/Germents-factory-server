
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
            const result = await productsCollection.find().sort({ _id: -1 }).limit(8).toArray();
            res.send(result);
        });

        // app.get('/products', async (req, res) => {
        //     const limit = parseInt(req.query.limit);
        //     let cursor = productsCollection.find().sort({ _id: -1 });
        //     if (limit) cursor = cursor.limit(limit);
        //     const result = await cursor.toArray();
        //     res.send(result);
        // });
/* ------------------ ৪. প্রোডাক্ট রাউটস (সংশোধিত) ------------------ */

// app.get('/products', async (req, res) => {
//     try {
//         const query = req.query;
//         const page = parseInt(query.page) || 0;
//         const size = parseInt(query.size) || 10;
//         const search = query.search || "";
//         // ১. ফিল্টারিং লজিক
//         let filter = {};
//         if (query.search) {
//             filter.name = { $regex: query.search, $options: 'i' };
//         }
//         if (query.category) {
//             filter.category = query.category;
//         }
        
//         // প্রাইস ফিল্টার
//         if (query.minPrice || query.maxPrice) {
//             filter.price = {};
//             if (query.minPrice) filter.price.$gte = parseFloat(query.minPrice);
//             if (query.maxPrice) filter.price.$lte = parseFloat(query.maxPrice);
//         }

//         // ২. সর্টিং লজিক
//         let sortObj = {};
//         if (query.sort === 'price-asc') sortObj.price = 1;
//         else if (query.sort === 'price-desc') sortObj.price = -1;
//         else if (query.sort === 'newest') sortObj.createdAt = -1;
//         else sortObj._id = -1; // Default Sort

//         // ৩. ডাটাবেস থেকে ডাটা আনা (productsCollection - এ s যোগ করা হয়েছে)
//         const skip = (page - 1) * size;
//         const products = await productsCollection
//             .find(filter)
//             .sort(sortObj)
//             .skip(skip)
//             .limit(size)
//             .toArray();

//         // ৪. টোটাল কাউন্ট (এখানেও s যোগ করা হয়েছে)
//         const total = await productsCollection.countDocuments(filter);

//         res.send({ products, total });
//     } catch (error) {
//         console.error("Error in /products:", error);
//         res.status(500).send({ message: "Server Error", error: error.message });
//     }
// });
app.get('/products', async (req, res) => {
    try {
        const query = req.query;
        // ফ্রন্টএন্ড থেকে page ০ থেকে শুরু হয়, তাই ডিফল্ট ০ ধরুন
        const page = parseInt(query.page) || 0; 
        const size = parseInt(query.size) || 10;
        
        // ১. ফিল্টারিং লজিক (আপনার আগের কোড)
        let filter = {};
        if (query.search) {
            filter.name = { $regex: query.search, $options: 'i' };
        }
        if (query.category) {
            filter.category = query.category;
        }
        
        // প্রাইস ফিল্টার
        if (query.minPrice || query.maxPrice) {
            filter.price = {};
            if (query.minPrice) filter.price.$gte = parseFloat(query.minPrice);
            if (query.maxPrice) filter.price.$lte = parseFloat(query.maxPrice);
        }

        // ২. সর্টিং লজিক (আপনার আগের কোড)
        let sortObj = {};
        if (query.sort === 'price-asc') sortObj.price = 1;
        else if (query.sort === 'price-desc') sortObj.price = -1;
        else if (query.sort === 'newest') sortObj.createdAt = -1;
        else sortObj._id = -1; // Default Sort

        // ৩. ডাটাবেস থেকে ডাটা আনা (ফিক্স করা অংশ)
        // যেহেতু page ০ থেকে শুরু, তাই skip হবে সরাসরি page * size
        const skip = page * size; 

        const products = await productsCollection
            .find(filter)
            .sort(sortObj)
            .skip(skip)
            .limit(size)
            .toArray();

        // ৪. টোটাল কাউন্ট 
        const total = await productsCollection.countDocuments(filter);

        res.send({ products, total });
    } catch (error) {
        console.error("Error in /products:", error);
        res.status(500).send({ message: "Server Error", error: error.message });
    }
});
        app.get('/products/:id', async (req, res) => {
            const result = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        // app.get('/all-products/:email', verifyToken, verifyManager, async (req, res) => {
        //     const result = await productsCollection.find().sort({ _id: -1 }).toArray();
        //     res.send(result);
        // });
        /* ------------------ ৪. প্রোডাক্ট রাউটস (সংশোধিত) ------------------ */

app.get('/all-products/:email', verifyToken, verifyManager, async (req, res) => {
    const email = req.params.email; // ফ্রন্টএন্ড থেকে পাঠানো ইউজারের ইমেইল
    const decodedEmail = req.decoded_email; // টোকেন থেকে পাওয়া লগইন করা ইউজারের ইমেইল

    // ১. প্রথমে চেক করি এই ইউজারটি আসলে কে (এডমিন নাকি অন্য কিছু)
    const user = await usersCollection.findOne({ email: decodedEmail });
    
    let query = {}; // ডিফল্টভাবে খালি কোয়েরি (সব দেখাবে)

    // ২. লজিক সেট করা
    if (user?.role !== 'admin') {
        // যদি ইউজার এডমিন না হয় (মানে সে ম্যানেজার), তবে সে শুধু তার নিজের আপলোড করা প্রোডাক্ট দেখবে
        // তাই আমরা শুধু তার ইমেইল অনুযায়ী প্রোডাক্ট খুঁজব
        query = { sellerEmail: email }; 
    }
    // যদি সে Admin হয়, তবে query খালি {} থাকবে, ফলে এডমিন সব প্রোডাক্টই পাবে।

    const result = await productsCollection.find(query).sort({ _id: -1 }).toArray();
    res.send(result);
});
// app.get('/all-products/:email', verifyToken, verifyManager, async (req, res) => {
//     const email = req.params.email; // ফ্রন্টএন্ড থেকে পাঠানো ইমেইল
//     const decodedEmail = req.decoded_email; // টোকেন থেকে পাওয়া ইমেইল

//     // ১. ইউজার ডাটাবেজে আছে কি না এবং তার রোল কী তা চেক করা
//     const user = await usersCollection.findOne({ email: decodedEmail });
    
//     let query = {}; // ডিফল্টভাবে এডমিনের জন্য সব দেখাবে

//     // ২. লজিক সেট করা
//     if (user?.role !== 'admin') {
//         // যদি ইউজার এডমিন না হয় (মানে ম্যানেজার), তবে সে শুধু নিজের ইমেইলের প্রোডাক্ট দেখবে
//         // আমরা সরাসরি decodedEmail ব্যবহার করছি নিরাপত্তার জন্য
//         query = { sellerEmail: decodedEmail }; 
//     }

//     // ৩. ডাটা ফেচ করা
//     const result = await productsCollection.find(query).sort({ _id: -1 }).toArray();
//     res.send(result);
// });
// ম্যানেজারের নিজের পেন্ডিং বা সব অর্ডার দেখার এপিআই
app.get("/allorders", verifyToken, verifyManager, async (req, res) => {
    const status = req.query.status;
    const decodedEmail = req.decoded_email; // টোকেন থেকে আসা ম্যানেজারের ইমেইল

    // ১. চেক করি ইউজার এডমিন নাকি ম্যানেজার
    const user = await usersCollection.findOne({ email: decodedEmail });
    
    let query = {}; 

    // ২. স্ট্যাটাস ফিল্টার (যেমন: pending/approved)
    if (status) {
        query.orderStatus = { $regex: new RegExp(`^${status}$`, "i") };
    }

    // ৩. রোল ফিল্টার (এটিই ম্যানেজারকে তার নিজের অর্ডার দেখাবে)
    if (user?.role !== 'admin') {
        // যদি সে এডমিন না হয়, তবে শুধু তার নিজের sellerEmail এর ডাটা দেখাবে
        query.sellerEmail = decodedEmail; 
    }

    const result = await ordersCollection.find(query).sort({ _id: -1 }).toArray();
    res.send(result);
});

/* ------------------ ৪. প্রোডাক্ট রাউটস (সংশোধিত ও বর্ধিত) ------------------ */

// প্রোডাক্ট ডিলিট করার রুট
app.delete('/products/:id', verifyToken, verifyManager, async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.deleteOne(query);
    res.send(result);
});

// প্রোডাক্ট আপডেট করার রুট (Update/Edit এর জন্য)
// app.patch('/products/:id', verifyToken, verifyManager, async (req, res) => {
//     const id = req.params.id;
//     const item = req.body;
//     const filter = { _id: new ObjectId(id) };
//     const updatedDoc = {
//         $set: {
//             name: item.name,
//             price: item.price,
//             category: item.category,
//             description: item.description,
//             images: item.images,
//         }
//     };
//     const result = await productsCollection.updateOne(filter, updatedDoc);
//     res.send(result);
// });
app.patch('/products/:id', verifyToken, verifyManager, async (req, res) => {
    const id = req.params.id;
    const item = req.body;
    const filter = { _id: new ObjectId(id) };
    const updatedDoc = {
        $set: {
            name: item.name,
            price: item.price,
            category: item.category,
            description: item.description,
            // এখানে নিশ্চিত করুন ইমেজ সেভ হচ্ছে
            image: item.image, 
            productImage: item.productImage,
            images: item.images,
        }
    };
    const result = await productsCollection.updateOne(filter, updatedDoc);
    res.send(result);
});
// হোম পেজে দেখানোর জন্য টগল এপিআই
app.patch('/products/toggle-home/:id', verifyToken, verifyManager, async (req, res) => {
    const id = req.params.id;
    const { showOnHome } = req.body; // ফ্রন্টএন্ড থেকে true/false আসবে
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: { showOnHome: showOnHome }
    };
    const result = await productsCollection.updateOne(filter, updateDoc);
    res.send(result);
});
// নতুন প্রোডাক্ট অ্যাড করার রুট (এটি আপনার কোডে ছিল না)
app.post("/products", verifyToken, verifyManager, async (req, res) => {
    try {
        const product = req.body;
        // সার্ভার সাইড থেকে ক্রিয়েটেড টাইম সেট করে দেওয়া ভালো
        product.createdAt = new Date(); 
        const result = await productsCollection.insertOne(product);
        res.send(result);
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
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

        // app.post("/orders", verifyToken, async (req, res) => {
        //     const order = req.body;
        //     order.email = req.decoded_email.toLowerCase();
        //     order.paymentStatus = order.paymentRequired ? "unpaid" : "cod";
        //     order.orderStatus = "pending";
        //     order.createdAt = new Date();
        //     const result = await ordersCollection.insertOne(order);
        //     res.send(result);
        // });
        app.post("/orders", verifyToken, async (req, res) => {
    const order = req.body;

    // ১. ক্রেতার ইমেইল (Buyer Email) নিশ্চিত করা
    order.email = req.decoded_email.toLowerCase();

    // ২. পেমেন্ট এবং অর্ডার স্ট্যাটাস সেট করা
    // এখানে 'paymentRequired' ফ্রন্টএন্ড থেকে আসবে, নাহলে ডিফল্ট লজিক কাজ করবে
    order.paymentStatus = order.paymentRequired ? "unpaid" : "cod";
    order.orderStatus = "pending"; 
    
    // ৩. সময় সেট করা
    order.createdAt = new Date();

    // ৪. নিশ্চিত করা যে sellerEmail ডাটাতে আছে (ফ্রন্টএন্ড থেকে যা পাঠানো হয়েছে)
    // আপনি যেহেতু ফ্রন্টএন্ডে orderData-তে sellerEmail দিয়েছেন, তাই এখানে আলাদা কিছু করার দরকার নেই, 
    // শুধু চেক করবেন ডাটাবেজে এটি যাচ্ছে কি না।

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
        // Admin Stats API
// Backend Code (Index.js)
/* ------------------ ৮. অ্যাডমিন স্ট্যাটাস এপিআই (ফিক্সড) ------------------ */
app.get('/admin-stats', async (req, res) => {
    try {
        // কালেকশন নেমগুলো আপনার উপরের ভেরিয়েবলের সাথে মিল রাখা হয়েছে (s যোগ করা হয়েছে)
        const totalUsers = await usersCollection.estimatedDocumentCount();
        const totalProducts = await productsCollection.estimatedDocumentCount();
        
        // সব অর্ডার আনা হচ্ছে
        const orders = await ordersCollection.find().toArray();
        const totalOrders = orders.length;

        // রেভিনিউ ক্যালকুলেশন (নিশ্চিত করা হয়েছে যাতে প্রাইস নাম্বার হিসেবে থাকে)
        const totalRevenue = orders.reduce((total, order) => {
            const price = parseFloat(order.totalPrice || order.price || 0);
            return total + price;
        }, 0);

        // চার্টের জন্য ডাইনামিক ডেটা ফরম্যাট
        const chartData = [
            { name: 'Revenue', value: Math.round(totalRevenue) },
            { name: 'Users', value: totalUsers },
            { name: 'Orders', value: totalOrders },
            { name: 'Products', value: totalProducts }
        ];

        // সবশেষে ৫টি রিসেন্ট অর্ডার পাঠানো হচ্ছে
        const recentOrders = orders.slice(-5).reverse();

        res.send({
            totalUsers,
            totalOrders,
            totalRevenue: totalRevenue.toFixed(2),
            totalProducts,
            chartData,
            recentOrders
        });
    } catch (error) {
        console.error("Admin Stats Error:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
    }
});

        // console.log("MongoDB Connected Successfully!");
    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Garments Factory Server is Running'));
app.listen(port, () => console.log(`Server listening on port ${port}`));