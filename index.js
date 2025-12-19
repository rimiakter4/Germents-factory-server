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

   app.get('/products/:id',async(req,res)=>{
            const id=req.params.id
            const qurey={_id : new ObjectId(id)}
            const result=await productsCollection.findOne(qurey)
            res.send(result)
        })

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

      // ✅ metadata খুব জরুরি
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
