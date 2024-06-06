const express =require('express')
const app =express()
const cors= require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe= require('stripe')(process.env.JWT_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port=process.env.PORT||5000;

//middlware
app.use(cors());
app.use(express.json());

console.log("JWT_SECRET_KEY:", process.env.JWT_SECRET_KEY);


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

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
      res.send({ token }); // Ensure the token is sent as an object property
    });

    const verifyToken=(req,res,next)=>{
      console.log('inside verify token',req.headers.authorization)
      if(!req.headers.authorization){
        return res.status(401).send({message:'forbidden access'})
      }
      const token=req.headers.authorization.split(' ')[1];
      jwt.verify(token,process.env.JWT_SECRET_KEY,(err,decoded)=>{
        if(err){
          return res.status(401).send({message:'forbidden access'})
        }
        req.decoded=decoded;
        next()
      })
     
      

    }

    // verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

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

    app.get('/users',verifyToken,async(req,res)=>{
      const result=await userCollection.find({role:'worker'}).toArray()
      res.send(result)
    })
    app.get('/usersinfo/:email',verifyToken,async(req,res)=>{
      const quary=req.params.email;
      const filter={email:quary}
      const result=await userCollection.findOne(filter)
      res.send(result)
    })
   


    app.get('/users/:email',verifyToken,async(req,res)=>{
      const email =req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message:'unauthorized access'})
      }
      const quary={email:email}
      const user =await userCollection.findOne(quary);
      let admin=false;
      let taskcreator=false;
      let worker=false

      if(user){
          admin=user?.role === 'admin',
          taskcreator=user?.role === 'taskcreator',
          worker=user?.role === 'worker'

      }
      res.send({admin,taskcreator,worker})
    })


    app.patch('/users/admins/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id=req.params.id;
      const { role } = req.body;
      const filter={_id:new ObjectId(id)}
      const updatedDoc={
        $set:{
          role:role,
        }
      }
      const result=await userCollection.updateOne(filter,updatedDoc)
      res.send(result)

    })

    app.delete('/users/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id=req.params.id;
      const quary={_id:new ObjectId(id)}
      const result=await userCollection.deleteOne(quary);
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
  console.log(`taskhive is sitting on port:${port}`)
})