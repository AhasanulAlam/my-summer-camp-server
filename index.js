const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // [bearer, token]
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zgkvxtd.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
        // await client.connect();

        const usersCollection = client.db("mySummerCampDB").collection("users");
        const classesCollection = client.db("mySummerCampDB").collection("classes");
        const cartCollection = client.db("mySummerCampDB").collection("carts");
        const paymentCollection = client.db("mySummerCampDB").collection("payments");


        // JWT Token API
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // verifyAdmin Middleware with the mongodb connection
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' });
            }
            next();
        }

        // verifyInstructor Middleware with the mongodb connection
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden access' });
            }
            next();
        }


        // Get User API
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        // Create Users API
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists!' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Delete Users API
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })

        // Check admin role  API
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        });

        // Update User Admin Role API
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Check Instructor role  API
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })

        // Update User Instructor Role API
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Get approved Classes for Class page Data API
        app.get('/classes', async (req, res) => {
            const query = { classStatus: 'approved' };
            const options = {
                sort: { price: -1 }
            };
            const result = await classesCollection.find(query, options).toArray();
            res.send(result);
        });
        // Get All the Popular Classes for Home page Data API
        app.get('/popularclasses', async (req, res) => {
            const query = { classStatus: 'approved' };
            const options = {
                sort: { enrolledSeats: -1 }

            };
            const result = await classesCollection.find(query, options).limit(6).toArray();
            res.send(result);
        });

        // Get All Classes for admin Class page Data API
        app.get('/manageclasses', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        });

        // Update Class Approve Status API
        app.patch('/class/approve/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    classStatus: 'approved'
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Update Class Status update API
        app.patch('/class/deny/:id', async (req, res) => {
            const id = req.params.id;
            const denyFeedBack = req.body;
            const feedBack = denyFeedBack.feedBack;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {                
                $set: {
                    classStatus: 'denied',
                    feedBack: feedBack
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Get All Classes for Instructor Class page Data API
        app.get('/instructormanageclasses', verifyJWT, verifyInstructor, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        });

        // Get All Enrolled Classes for Student Class page Data API
        app.get('/studentmanageclasses', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const queryPayment = { email: decodedEmail };

            const enrollClassResult = await paymentCollection.find(queryPayment).toArray();
            const classItemIds = enrollClassResult.map(enrollClass => {
                return {
                    classItemId: enrollClass.classItemId[0].toString()
                };
            });
            let myAllClassData = [];
            const myClassData = classItemIds.map(async(myclass) => {
                console.log("test",myclass);
                const queryEnrollClass = { _id: new ObjectId(myclass.classItemId) }
                const myEnrolledClasses = await classesCollection.findOne(queryEnrollClass);
                return myEnrolledClasses;
            })
            myAllClassData = await Promise.all(myClassData);
            res.send(myAllClassData);
        });

        // Add a new Class in the DataBase API
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        });

        // Get All Instructors Data API
        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

        // Get All Popular Instructors Data for Home API
        app.get('/popularinstructors', async (req, res) => {
            const query = { role: 'instructor' };
            // const options = {
            //     sort: { enrolledSeats: -1 }
            // };
            const result = await usersCollection.find(query).limit(6).toArray();
            res.send(result);
        });


        // carts collection related API
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            // checking token user === logged user
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' });
            }
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        // Add a selected class in to database
        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            cartItem.classItemId = new ObjectId(cartItem.classItemId);
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        // Delete a selected class from cart
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // Create Payment Intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseFloat(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });

        // Payment Update API
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;

            payment.cartItemId = payment.cartItemId.map(item => new ObjectId(item));
            payment.classItemId = payment.classItemId.map(item => new ObjectId(item));
            // 
            const insertResult = await paymentCollection.insertOne(payment);

            // remove classes from cart
            const query = { _id: { $in: payment.cartItemId.map(id => new ObjectId(id)) } }
            const deleteResult = await cartCollection.deleteMany(query);

            // Update the class seats
            const queryUpdate = { _id: { $in: payment.classItemId.map(id => new ObjectId(id)) } }
            const updateDoc = {
                $inc: {
                    enrolledSeats: 1 //TODO: inc
                },
                $inc: {
                    availableSeats: -1
                }
            };

            const UpdateResult = await classesCollection.updateOne(queryUpdate, updateDoc);

            res.send({ insertResult, deleteResult, UpdateResult });

        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('My SummerCamp is Running')
});

app.listen(port, () => {
    console.log(`My SummerCamp is Running on port: ${port}`);
});