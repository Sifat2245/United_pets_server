const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

//middlewares
dotenv.config();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.qwhtqkb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    await client.connect();

    const db = client.db("United_Pets");
    const usersCollection = db.collection("users");
    const petsCollection = db.collection("pets");

    //users api

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .send({ message: "user already exist", inserted: false });
      }
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.find({ user }).toArray();
      res.send(result);
    });

    app.post("/pets", async (req, res) => {
      const newPet = req.body;
      const result = await petsCollection.insertOne(newPet);
      res.send(result);
    });

    app.put('/pets/:id', async(req, res) =>{
      const petId = req.params.id;
      const updatedPet = req.body;

      const result = await petsCollection.updateOne(
        {_id: new ObjectId(petId)},
        {$set: updatedPet}
      )

      res.send(result)
    })

    app.get("/pets", async (req, res) => {
      const pets = req.body;
      const result = await petsCollection.find(pets).toArray();
      res.send(result);
    });

    app.get("/pets/email", async (req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const filter = { addedBy: email };

      const [pets, total] = await Promise.all([
        petsCollection.find(filter).skip(skip).limit(limit).toArray(),
        petsCollection.countDocuments(filter),
      ]);
      res.send({pets, total});
    });

    app.get('/pets/latest', async(req, res) =>{
      const latestPet = await petsCollection
      .find()
      .sort({addedTime: -1})
      .limit(6)
      .toArray()

      res.send(latestPet)
    })

    app.get('/pets/not-adopted', async(req, res) =>{
      const pets = await petsCollection.find({adoptionStatus: 'Not Adopted'}).toArray()
      res.send(pets)
    })

    app.get('/pets/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result =  await petsCollection.findOne(query)
      res.send(result)
    })

    app.get('/pets/category/:category', async(req, res) =>{
      const {category} = req.params;
      const {exclude} = req.query;
      const query = {
       category: { $regex: new RegExp(category, "i") },
        _id: {$ne: new ObjectId(exclude)}
      }

      const result = await petsCollection.find(query).limit(4).toArray()
      res.send(result)
    })

    app.delete('/pets/:id', async(req, res) =>{
      const id = req.params.id;
      const petId ={_id: new ObjectId(id)}
      const result = await petsCollection.deleteOne(petId)
      res.send(result)
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
};

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("welcome to the server");
});

app.listen(port, () => {
  console.log(`the server is running on port ${port}`);
});
