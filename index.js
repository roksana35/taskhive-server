const express =require('express');
const app = express();
const cors= require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe= require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port=process.env.PORT||5000;

//middlware
//Must remove "/" from your production URL
app.use(  cors({
  origin: [
    "http://localhost:5173",
    "https://task-hive-d1851.web.app",
    "https://task-hive-d1851.firebaseapp.com",
  ]}))

  
app.use(express.json());

console.log("JWT_SECRET_KEY:", process.env.JWT_SECRET_KEY);


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qmgfwvr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log(process.env.DB_USER)
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const userCollection = client.db("taskhiveDB").collection("users");
const taskCollection = client.db("taskhiveDB").collection("tasks");
const submissionCollection = client.db("taskhiveDB").collection("submission");
const withdrawCollection = client.db("taskhiveDB").collection("withdrawals");
const paymentCollection = client.db("taskhiveDB").collection("payments");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

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

    app.get('/allusers',verifyToken,verifyAdmin,async(req,res)=>{
      const result=await userCollection.find().toArray()
      res.send(result)
    })
    app.get('/users',verifyToken,async(req,res)=>{
      const result=await userCollection.find({role:'worker'}).toArray()
      res.send(result)
    })

    app.get('/totalcoins', async (req, res) => {
      try {
        const totalCoins = await userCollection.aggregate([
          { $group: { _id: null, total: { $sum: "$coin" } } }
        ]).toArray();
        const total = totalCoins[0] ? totalCoins[0].total : 0;
        res.send({ totalCoins: total });
      } catch (error) {
        res.status(500).send({ error: 'Error calculating total coins' });
      }
    });
    
    app.get('/usersinfo/:email',verifyToken,async(req,res)=>{
      const quary=req.params.email;
      const filter={email:quary}
      const result=await userCollection.findOne(filter)
      res.send(result)
    })


   
   


    // app.get('/users/:email',verifyToken,async(req,res)=>{
    //   const email =req.params.email;
    //   if(email !== req.decoded.email){
    //     return res.status(403).send({message:'unauthorized access'})
    //   }
    //   const quary={email:email}
    //   const user =await userCollection.findOne(quary);
    //   let admin=false;
    //   let taskcreator=false;
    //   let worker=false

    //   if(user){
    //       admin=user?.role === 'admin',
    //       taskcreator=user?.role === 'taskcreator',
    //       worker=user?.role === 'worker'

    //   }
    //   res.send({admin,taskcreator,worker})
    // })

    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
    
      // Ensure the user is accessing their own information
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }
    
      try {
        const query = { email: email };
        const user = await userCollection.findOne(query);
    
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
    
        // Check the roles of the user
        const admin = user.role === 'admin';
        const taskcreator = user.role === 'taskcreator';
        const worker = user.role === 'worker';
    
        res.send({ admin, taskcreator, worker });
      } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });
    
  // submission approved
    app.patch('/submission/approve/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const { worker_email, payable_amount } = req.body;
    
      const submissionFilter = { _id: new ObjectId(id) };
      const updateSubmission = {
        $set: {
          status: 'approved',
        },
      };
    
      const userFilter = { email: worker_email };
      const updateUser = {
        $inc: {
          coin: payable_amount,
        },
      };
    
      await submissionCollection.updateOne(submissionFilter, updateSubmission);
      await userCollection.updateOne(userFilter, updateUser);
    
      res.send({ message: 'Submission approved and coins updated' });
    });
    // submission reject
    app.patch('/submission/reject/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
    
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'rejected',
        },
      };
    
      const result = await submissionCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/tasks',verifyToken,verifyAdmin,async(req,res)=>{
      const result=await taskCollection.find().toArray()
      res.send(result)
    })


    app.get('/task/:email',async(req,res)=>{
      const email=req.params.email;
      const filter={
        creator_email:email}
      const result=await taskCollection.find().toArray()
      res.send(result)

    })


    app.get('/tasks/:id',async(req,res)=>{
      const id=req.params.id;
      const quary={_id:new ObjectId(id)}
      const result=await taskCollection.findOne(quary)
      res.send(result)
    })

    app.patch('/task/:id',verifyToken,async(req,res)=>{
      const id=req.params.id;
      const {task_title,
        task_detail,submission_info}=req.body;
      const filter={_id:new ObjectId(id)}
      const updatedDoc={
        $set:{
          task_title:task_title,
          task_detail:task_detail,
          submission_info:submission_info,


        }
      }
      const result=await taskCollection.updateOne(filter,updatedDoc)
      res.send(result)
    })

    // worker
     
    

    app.get('/submission/:email',async(req,res)=>{
      const email=req.params.email;
      // if (req.decoded.email !== email) {
      //   return res.status(403).send({ message: 'unauthorized access' });
      // }
      const filter={worker_email:email}
      const result=await submissionCollection.find(filter).toArray();
      res.send(result)
    })

    // taskcreator
    app.get('/submissions/:email',async(req,res)=>{
      const email=req.params.email;
      const filter={
        creator_email:email}
        const result=await submissionCollection.find(filter).toArray();
        res.send(result)
    })

    // app.post('/tasks',verifyToken,async(req,res)=>{
    //   const quary=req.body;
      
    //   const result=await taskCollection.insertOne(quary);
    //   res.send(result)
    // })
  

    app.post('/tasks', verifyToken, async (req, res) => {
      const taskInfo = req.body;
      const totalCost = taskInfo.task_quantity * taskInfo.payable_amount;
  
      if (totalCost > req.decoded.coin) {
          return res.status(400).send({ message: 'Not enough coins. Purchase more coins.' });
      }
  
      try {
          const response = await taskCollection.insertOne(taskInfo);
          if (response.insertedId) {
              // Reduce user's available coins
              await userCollection.updateOne(
                  { email: req.decoded.email },
                  { $inc: { coin: -totalCost } }
              );
              res.send({ insertedId: response.insertedId });
          } else {
              res.status(500).send({ message: 'Failed to add task.' });
          }
      } catch (error) {
          console.error('Error adding task:', error);
          res.status(500).send({ message: 'Internal server error.' });
      }
  });


    app.post('/submission',async(req,res)=>{
      const query=req.body;
      const result=await submissionCollection.insertOne(query);
      res.send(result)

    })

    app.get('/withdraws',async(req,res)=>{
      const result= await withdrawCollection.find().toArray();
      res.send(result);
    })

    // withdrow
    app.post('/withdraw',verifyToken,async(req,res)=>{
      const withdrawal=req.body;
      // const {amount,payment,coin,account} = req.body;

      const email = req.decoded.email;

      // Fetch user data to get current coin balance
      const user = await userCollection.findOne({ email:email });
    
      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }
      const maxWithdrawAmount = user.coin / 20;
  if (withdrawal.amount > maxWithdrawAmount) {
    return res.status(400).send({ message: 'The amount exceeds your maximum withdrawal limit' });
  }

  const newCoins=user.coin-withdrawal.withdraw_coin;
  if(newCoins<0){
    return res.status(400).send({ message: 'Insufficient coins for withdrawal' });
  }
  try {
    // Update the user's coin balance
    await userCollection.updateOne(
        { email: email },
        { $set: { coin: newCoins} }
    );

    // Insert the withdrawal record
    const result = await withdrawCollection.insertOne(withdrawal);

    res.send(result);
} catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).send({ message: 'Internal server error' });
}
    })

    

    // payment get api 
    app.get('/payment/:email',verifyToken,async(req,res)=>{
      const email=req.params.email;
      const filter={email:email}
      if(req.params.email != req.decoded.email){
        return res.status(403).send({message:'forbidden access'})
      }
      const result=await paymentCollection.find().toArray();
      res.send(result);
    })


    app.post('/create-payment-inten',verifyToken,async(req,res)=>{
      const {price}=req.body;
      // const amount=parseInt(price * 100);
      // console.log(amount,'amount inside of paymentintent')
      const paymentIntent=await stripe.paymentIntents.create({
        amount:price,
        currency: "usd",
        payment_method_types:['card']
      })
      res.send({
        clientSecret:paymentIntent.client_secret
      })
    })
  
    // payment post related api
    app.post('/payment',async(req,res)=>{
      const payment = req.body;
      const email = payment.email;  // Assuming email is included in the payment data
  
      try {
          // Save the payment details in the paymentCollection
          const paymentResult = await paymentCollection.insertOne(payment);
  
          // Find the TaskCreator by email and update their coin balance
          const updateResult = await userCollection.updateOne(
              { email: email },
              { $inc: { coin: Number(payment.coin_purchase) } }
          );
  
          if (updateResult.modifiedCount > 0) {
              res.send({ success: true, message: 'Payment and coin balance updated successfully' });
          } else {
              res.status(500).send({ success: false, message: 'Failed to update user coin balance' });
          }
      } catch (error) {
          console.error('Error processing payment:', error);
          res.status(500).send({ success: false, message: 'Internal server error' });
      }
    })


    app.post('/payment/success', async (req, res) => {
      try {
          // Extract withdrawal ID from the request body
          const { withdrawalId } = req.body;
  
          // 1. Delete data from withdrawal collection
          const deletedWithdrawal = await Withdrawal.findByIdAndDelete(withdrawalId);
          if (!deletedWithdrawal) {
              return res.status(404).json({ error: 'Withdrawal not found' });
          }
  
          // 2. Deduct user's coin
          const user = await User.findById(deletedWithdrawal.userId);
          if (!user) {
              return res.status(404).json({ error: 'User not found' });
          }
  
          const currentCoin = user.coin;
          const withdrawCoin = deletedWithdrawal.withdraw_coin;
          const updatedCoin = currentCoin - withdrawCoin;
  
          // Update user's coin count
          await User.findByIdAndUpdate(user._id, { coin: updatedCoin });
  
          res.status(200).json({ message: 'Payment success. Withdrawal data deleted and user coin deducted.' });
      } catch (error) {
          console.error('Error handling payment success:', error);
          res.status(500).json({ error: 'Internal server error' });
      }
  });

    // app.delete('/taskdelete/:id',verifyToken, async (req, res) => {
    //  const id = req.params.id;
    //  const query={_id:new ObjectId(id)}
    //  const result=await taskCollection.deleteOne(query)
    //  res.send(result)
    // });

    app.delete('/taskdelete/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded.email; // Assuming `verifyToken` sets `req.user`
      const query = { _id: new ObjectId(id) };
    
      try {
        // Find the task to get task_quantity and payable_amount
        const task = await taskCollection.findOne(query);
    
        if (task) {
          const { task_quantity, payable_amount } = task;
          console.log(task_quantity,payable_amount)
          const coinIncrease = task_quantity * payable_amount;
    
          // Update user's coin balance
          const userUpdateResult = await userCollection.updateOne(
            { email },
            { $inc: { coins: coinIncrease } }
          );
    
          if (userUpdateResult.modifiedCount > 0) {
            // Delete the task
            const deleteResult = await taskCollection.deleteOne(query);
            res.send(deleteResult);
          } else {
            res.status(500).send({ message: 'Failed to update user coins' });
          }
        } else {
          res.status(404).send({ message: 'Task not found' });
        }
      } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).send({ message: 'An error occurred while deleting the task' });
      }
    });
    
    
    

    app.patch('/usersinfo/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const  {coin}  = req.body;
    
      const filter={email:email}
      const updatedDoc={
        $set:{
          coin:coin
        }
      }
      const result=await userCollection.updateOne(filter,updatedDoc)
      res.send(result)
    });
    

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