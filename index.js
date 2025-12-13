const express =require("express")
const app =express()
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors=require("cors")
require('dotenv').config()
const port =process.env.PORT||3000
app.use(cors())
app.use(express.json())




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

app.get('/products',async(req,res)=>{
    const cursor=productsCollection.find().sort({created_at:-1}).limit(6)
            const result=await cursor.toArray()
            res.send(result)
})






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
