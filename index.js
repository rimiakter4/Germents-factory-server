const express =require("express")
const app =express()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors=require("cors")
require('dotenv').config()
// const port =process.env.PORT||3000
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

// const stripe = require('stripe')(process.env.STIPE_SECRET);
const stripe = require('stripe')(process.env.STRIPE_SECRET);



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q32hk1x.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
const db=client.db("germents_factory_db")

const productsCollection=db.collection("products")
const usersCollection=db.collection("users")
const ordersCollection=db.collection('orders')


//  Create Order (Booking Submit)

  app.post("/orders", async (req, res) => {
    const order = req.body;

    order.paymentStatus = order.paymentRequired ? "unpaid" : "cod";
    order.orderStatus = "pending";
    order.createdAt = new Date();

    const result = await ordersCollection.insertOne(order);
    res.send({ insertedId: result.insertedId });
  });

  // Get Single Order (Payment Page)
 app.get("/orders/:id", async (req, res) => {
    const id = req.params.id;

    const order = await ordersCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!order) return res.status(404).send({ message: "Order not found" });
    res.send(order);
  });


 app.get("/orders", async (req, res) => {
    const email = req.query.email;
    const orders = await ordersCollection
      .find({ email })
      .toArray();
    res.send(orders);
  });


//   app.get('/allorders',async (req, res) => {
//   try {
//     const { status, sort = 'desc' } = req.query;

//     let query = {};
//     if (status) {
//       query.status = status; // Pending / Approved / Rejected
//     }

//     const sortOrder = sort === 'asc' ? 1 : -1;

//     const orders = await ordersCollection
//       .find(query)
//       .sort({ createdAt: sortOrder })
//       .toArray();

//     res.send(orders);
//   } catch (error) {
//     res.status(500).send({ message: 'Failed to load orders' });
//   }
// });

// Update Payment Status




app.patch("/orders/payment/:id", async (req, res) => {
    const id = req.params.id;
    const { transactionId } = req.body;

    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          paymentStatus: "paid",
          transactionId,
          paidAt: new Date(),
        },
      }
    );

    res.send(result);
  });

  
// Delete order only if status is pending
app.delete("/orders/:id", async (req, res) => {
  const id = req.params.id;

  const result = await ordersCollection.deleteOne({
    _id: new ObjectId(id),
    orderStatus: "pending" 
  });

  res.send(result);
});



// admin all orders api


//  admin all products get api
app.get('/allorders', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};


    if (status) {
      query.orderStatus = status;
    }

    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { productTitle: { $regex: search, $options: "i" } }
      ];
    }

    const orders = await ordersCollection
      .find(query)
      .sort({ createdAt: -1 }) 
      .toArray();

    res.send(orders);
  } catch (error) {
    res.status(500).send({ message: 'Failed to load orders' });
  }
});

// addmin order patch api by id 
app.patch("/orders/:id", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      orderStatus: status,
      updatedAt: new Date()
    },
  };

  try {
    const result = await ordersCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update status" });
  }
});

// admin orders delete api by id
app.delete("/orders/admin/:id", async (req, res) => {
  const id = req.params.id;
  

  const result = await ordersCollection.deleteOne({
    _id: new ObjectId(id),
    orderStatus: "Rejected" 
  });

  res.send(result);
});








// user api

 app.post('/users',async(req,res)=>{
            const newuser=req.body
            const email=newuser.email
            const query={email:email}
            const existingUser=await usersCollection.findOne(query)
            if(existingUser){
                res.send({message:"user alredy exiatis"})

            }
            else{
   const result=await usersCollection.insertOne(newuser)
            res.send(result)
            }
         
        })



// GET all users
app.get('/users', async (req, res) => {
  try {
    // Query ছাড়া সব user fetch হবে
    const cursor = usersCollection.find(); 
    const users = await cursor.toArray();

    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Express.js Backend Example
app.patch('/users/:id', async (req, res) => {
    const id = req.params.id;
    const { role } = req.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: { role: role },
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
});

        // products api
        app.get('/all-products', async (req, res) => {
  const result = await productsCollection
    .find()
    .sort({ created_at: -1 }) 
    .toArray();

  res.send(result);
});


app.get('/products', async (req, res) => {
  // limit optional, default = 6
  const limit = parseInt(req.query.limit) || null; 

  let cursor = productsCollection.find().sort({ created_at: -1 });

  if (limit) {
    cursor = cursor.limit(limit); 
  }

  const result = await cursor.toArray();
  res.send(result);
});

app.get('/products/home', async (req, res) => {
    
    const query = { showOnHome: true };
    
 
    const result = await productsCollection
        .find(query)        
        .sort({ _id: -1 })  
        .limit(6)           
        .toArray();
        
    res.send(result);
});


   app.get('/products/:id',async(req,res)=>{
            const id=req.params.id
            const qurey={_id : new ObjectId(id)}
            const result=await productsCollection.findOne(qurey)
            res.send(result)
        })




app.delete('/products/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await productsCollection.deleteOne(query);
    res.send(result);
});

app.patch('/products/toggle-home/:id', async (req, res) => {
    const id = req.params.id;
    const { showOnHome } = req.body; 
    const query = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            showOnHome: showOnHome
        },
    };
    const result = await productsCollection.updateOne(query, updateDoc);
    res.send(result);
});


app.put('/products/:id', async (req, res) => {
    const id = req.params.id;
    const updatedData = req.body;
    const filter = { _id: new ObjectId(id) };
    
    const updateDoc = {
        $set: {
            name: updatedData.name,
            description: updatedData.description,
            price: updatedData.price,
            category: updatedData.category,
            images: updatedData.images, 
            demoVideo: updatedData.demoVideo,
            payment: updatedData.payment 
        },
    };

    const result = await productsCollection.updateOne(filter, updateDoc);
    res.send(result);
});


















app.post('/create-checkout-session', async (req, res) => {
  const { productTitle, price, quantity, email, orderData } = req.body;

  if (!price || !quantity) {
    return res.status(400).send({ error: "Price or quantity missing" });
  }

  const amountInCents = Math.round(price * quantity * 100);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: productTitle },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      mode: 'payment',

     
      metadata: {
        orderData: JSON.stringify(orderData),
      },

      success_url: `${process.env.SITE_DOMAIN}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/cancel`,
    });

    res.send({ url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});



app.post("/orders/confirm-payment", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ message: "Session ID missing" });
    }

    // 1️ Stripe session verify
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).send({ message: "Payment not completed" });
    }

    // 2️ Order data from metadata
    const orderData = JSON.parse(session.metadata.orderData);

    // 3️ Save order in DB
    const order = {
      ...orderData,
      paymentStatus: "paid",
      transactionId: session.payment_intent,
      orderStatus: "pending",
      paidAt: new Date(),
      createdAt: new Date(),
    };

    const result = await ordersCollection.insertOne(order);

    res.send({
      success: true,
      insertedId: result.insertedId,
    });

  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).send({ message: "Payment verification failed" });
  }
});


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('germents factory')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
