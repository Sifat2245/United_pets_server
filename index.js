const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

//middlewares
dotenv.config();
app.use(cors());
app.use(express.json());

const stripe = require("stripe")(process.env.PAYMENT_GETAWAY_KEY);

const serviceAccount = require("./Admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const emailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
    const userDonationCollection = db.collection("user-donation");

    //verify firebase token
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      // console.log(authHeader);

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

    //email sending api
    app.post("/send-mail", async (req, res) => {
      const { fromName, fromEmail, message, subject } = req.body;

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: process.env.EMAIL_TO,
        subject: subject,
        replyTo: fromEmail,
        html: `
        <h2>New Contact Form Message</h2>
        <p><strong>Name:</strong> ${fromName}</p>
        <p><strong>Email:</strong> ${fromEmail}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong><br/>${message}</p>
      `,
      };

      await emailTransporter.sendMail(mailOptions);
      res.send({success: true , message: 'email send successfully'})
    });

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

    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email/role", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (!email) {
        return res.status(400).send({ message: "email is required" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(400).send({ message: "user not found" });
      }

      res.send({ role: user.role || "user" });
    });

    //admin controls

    app.patch("/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    app.patch("/pet/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updates = req.body;
      const result = await petsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );
      res.send(result);
    });

    app.get("/donation", verifyToken, verifyAdmin, async (req, res) => {
      const result = await donationCollection.find().toArray();
      res.send(result);
    });

    app.delete(
      "/donation-delete/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await donationCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    app.patch(
      "/donation-status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: updatedData,
        };

        const result = await donationCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.put(
      "/donation-edit/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedCampaign = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedCampaign,
        };
        const result = await donationCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

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

    app.get("/pets", verifyToken, async (req, res) => {
      const result = await petsCollection.find().toArray();
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
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const cursor = petsCollection
        .find({ adoptionStatus: "Not Adopted" })
        .sort({ addedTime: -1 })
        .skip(skip)
        .limit(limit);

      const pets = await cursor.toArray();
      const total = await petsCollection.countDocuments({
        adoptionStatus: "Not Adopted",
      });

      res.send({
        pets,
        total,
        hasMore: skip + pets.length < total,
      });
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
      // console.log(petId);

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
      const result = await donationCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/donations/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationCollection.findOne(query);
      res.send(result);
    });

    app.get("/donation/category/:category", async (req, res) => {
      const category = req.params.category;
      const { excludeId } = req.query;
      const query = {
        petCategory: { $regex: new RegExp(category, "i") },
      };

      if (excludeId) {
        query._id = { $ne: new ObjectId(excludeId) };
      }

      const result = await donationCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();
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

    //payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.patch("/donate/:id", async (req, res) => {
      const id = req.params.id;
      const { amount, email } = req.body;

      const update = {
        $inc: { totalDonated: amount },
        $push: {
          donators: {
            email: email,
            donatedAmount: amount,
            date: new Date(),
          },
        },
      };

      const result = await donationCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );

      res.send(result);
    });

    //donators api
    app.post("/user-donation", async (req, res) => {
      const donation = req.body;
      const result = await userDonationCollection.insertOne(donation);
      res.send(result);
    });

    app.get("/user-donation/email", async (req, res) => {
      const email = req.query.email;
      const result = await userDonationCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    app.delete("/user-donation/refund", async (req, res) => {
      const { donationId, userEmail, amount } = req.body;

      const deleteResult = await userDonationCollection.deleteOne({
        donationId,
        userEmail,
        amount,
      });

      const updateResult = await donationCollection.updateOne(
        { _id: new ObjectId(donationId) },
        {
          $inc: { totalDonated: -amount },
          $pull: { donators: { email: userEmail, donatedAmount: amount } },
        }
      );

      res.send(deleteResult);
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

// GET /user-overview/:email
// app.get("/user-overview/:email", verifyToken, async (req, res) => {
//   const email = req.params.email;

//   const petsAdded = await petsCollection.countDocuments({ addedBy: email });

//   const adoptionRequests = await adoptionCollection.countDocuments({
//     ownerEmail: email,
//   });

//   const pendingAdoptions = await adoptionCollection.countDocuments({
//     ownerEmail: email,
//     status: "pending",
//   });

//   const activeCampaigns = await donationCollection.countDocuments({
//     ownerEmail: email,
//     isPaused: false,
//   });

//   const totalDonations = await donationPaymentsCollection
//     .aggregate([
//       { $match: { ownerEmail: email } },
//       { $group: { _id: null, total: { $sum: "$amount" } } },
//     ])
//     .toArray();

//   res.send({
//     petsAdded,
//     adoptionRequests,
//     pendingAdoptions,
//     activeCampaigns,
//     totalDonations: totalDonations[0]?.total || 0,
//   });
// });
