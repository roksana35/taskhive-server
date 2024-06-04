const express =require('express')
const app =express()
const cors= require('cors');

require('dotenv').config()
// const stripe= require('stripe')(process.env.STRIPE_PUBLISHED_KEY)
const { MongoClient, ServerApiVersion } = require('mongodb');
const port=process.env.PORT||5000;

//middlware
app.use(cors());
app.use(express.json());

// uzK6xzrLHnoniRyF
// TaskHive


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qmgfwvr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const userCollection = client.db("taskhiveDB").collection("users");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    app.post('/users',async(req,res)=>{
      const user=req.body;
      const quary={email:user.email}
      const existingUser=await userCollection.findOne(quary)
      if(existingUser){
        return res.send({message:'this user already exist in database'})
      }
        // Assign coins based on role
    let coin = 0;
    if (user.role === 'worker') {
      coin = 10;
    } else if (user.role === 'taskcreator') {
      coin = 50;
    }

    // Add the coin property to the user object
    user.coin = coin;
      const result=await userCollection.insertOne(user)
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

app.get('/',(req,res)=>{
  res.send('taskhive is sitting')
})
app.listen(port,()=>{
  console.log(`Bistro boss is sitting on port:${port}`)
})