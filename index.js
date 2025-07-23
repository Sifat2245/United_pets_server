const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

//middlewares
dotenv.config();
app.use(cors());
app.use(express.json());

const serviceAccount = require("./Admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    // await client.connect()

    const db = client.db("United_Pets");
    const usersCollection = db.collection("users");
    const petsCollection = db.collection("pets");
    const adoptionRequestCollection = db.collection("adoptionRequest");
    const donationCollection = db.collection("donations");

    //verify firebase token
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      console.log(authHeader);

      const token = authHeader.split(" ")[1];

      //verify
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // verify admin

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //users api

    app.post("/users", verifyToken, async (req, res) => {
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

    app.get("/users", verifyToken, async (req, res) => {
      const user = req.body;
      const result = await usersCollection.find({ user }).toArray();
      res.send(result);
    });

    //pet api's
    app.post("/pets", verifyToken, async (req, res) => {
      const newPet = req.body;
      const result = await petsCollection.insertOne(newPet);
      res.send(result);
    });

    app.put("/pets/:id", verifyToken, async (req, res) => {
      const petId = req.params.id;
      const updatedPet = req.body;

      const result = await petsCollection.updateOne(
        { _id: new ObjectId(petId) },
        { $set: updatedPet }
      );

      res.send(result);
    });

    app.patch("/pets/:id", verifyToken, async (req, res) => {
      const petId = req.params.id;
      const filter = { _id: new ObjectId(petId) };
      const updatedDoc = {
        $set: { adoptionStatus: "Adopted" },
      };

      const result = await petsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

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
      res.send({ pets, total });
    });

    app.get("/pets/latest", async (req, res) => {
      const latestPet = await petsCollection
        .find()
        .sort({ addedTime: -1 })
        .limit(6)
        .toArray();

      res.send(latestPet);
    });

    app.get("/pets/not-adopted", async (req, res) => {
      const pets = await petsCollection
        .find({ adoptionStatus: "Not Adopted" })
        .toArray();
      res.send(pets);
    });

    app.get("/pets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await petsCollection.findOne(query);
      res.send(result);
    });

    app.get("/pets/category/:category", async (req, res) => {
      const { category } = req.params;
      const { exclude } = req.query;
      const query = {
        category: { $regex: new RegExp(category, "i") },
        _id: { $ne: new ObjectId(exclude) },
      };

      const result = await petsCollection.find(query).limit(4).toArray();
      res.send(result);
    });

    app.delete("/pets/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const petId = { _id: new ObjectId(id) };
      const result = await petsCollection.deleteOne(petId);
      res.send(result);
    });

    //adoption api's

    app.post("/adoptionRequest", verifyToken, async (req, res) => {
      const adoptionRequest = req.body;
      const result = await adoptionRequestCollection.insertOne(adoptionRequest);
      res.send(result);
    });

    app.get("/adoptionRequest", async (req, res) => {
      const addedBy = req.query.email;

      const allRequests = await adoptionRequestCollection.find().toArray();
      const filteredRequests = [];

      for (const request of allRequests) {
        const pet = await petsCollection.findOne({
          _id: new ObjectId(request.petId),
        });

        // console.log(pet);

        if (pet && pet.addedBy === addedBy) {
          filteredRequests.push(request);
        }
      }

      res.send(filteredRequests);
    });

    app.patch("/adoptionRequest/:id/status", verifyToken, async (req, res) => {
      const requestId = req.params.id;
      const { status, petId } = req.body;
      console.log(petId);

      const filter = {
        _id: new ObjectId(requestId),
      };
      const updatedDoc = {
        $set: { status: status },
      };
      const result = await adoptionRequestCollection.updateOne(
        filter,
        updatedDoc
      );

      const adoptionStatus = await petsCollection.updateOne(
        { _id: new ObjectId(petId) },
        { $set: { adoptionStatus: "Adopted" } }
      );

      res.send(result);
    });

    app.delete("/adoptionRequest/:id", verifyToken, async (req, res) => {
      const requestedId = req.params.id;
      const result = await adoptionRequestCollection.deleteOne({
        _id: new ObjectId(requestedId),
      });
      res.send(result);
    });

    //donation api

    app.post("/donations", verifyToken, async (req, res) => {
      const donation = req.body;
      const result = await donationCollection.insertOne(donation);
      res.send(result);
    });

    app.get("/donations", async (req, res) => {
      const result = await donationCollection.find().toArray();
      res.send(result);
    });

    app.get("/donations/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationCollection.findOne(query);
      res.send(result);
    });

    app.get("/donation/email", async (req, res) => {
      const email = req.query.email;
      const result = await donationCollection
        .find({ addedBy: email })
        .toArray();
      res.send(result);
    });

    app.put("/donation/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedCampaign = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedCampaign,
      };
      const result = await donationCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/donation/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: updatedData,
      };

      const result = await donationCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
