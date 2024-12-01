const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('node:http');
const cors = require('cors');
const mongodb = require('mongodb');
require('dotenv').config();

// MongoDB connection URI
const uri = "mongodb+srv://ujwalb29:Doodlearmy_2@cluster0.ne3wrkv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// MongoDB Client and Database Initialization
const client = new mongodb.MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect()
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch((error) => console.error("Error connecting to MongoDB:", error));

const database = client.db('Spotify_users');
const collection = database.collection("spotify_data");

const app = express();
app.use(express.json());
app.use(cors());
const server = createServer(app);

// Endpoint to delete users from the database
app.post('/delete_users', async (req, res) => {
    try {
        const { username, Selected_users } = req.body;
        console.log(Selected_users);
        const filter = { Username: username.Username };
        const update = { $pull: { Selectedusers: Selected_users } }; // Use $in to ensure multiple selections are handled
        const result = await collection.updateOne(filter, update);
        res.status(200).send("Users deleted successfully");
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to store socket information (you might want to expand this later)
app.post('/store_socket', async (req, res) => {
    console.log(req.body);
    res.status(200).send("Socket stored successfully");
});

// Endpoint to get selected users from MongoDB
app.post('/get_selected_users', async (req, res) => {
    const selected_users = await collection.findOne({ Username: req.body.username.Username });
    if (selected_users === null) {
        res.status(200).send([]);
    } else {
        const arr = selected_users['Selectedusers'];
        res.status(200).send(arr);
    }
});

// Endpoint to handle adding selected users
app.post('/selected_users', async (req, res) => {
    try {
        const { username, Selected_users } = req.body;
        const filter = { Username: username.Username };
        const update = { $push: { Selectedusers: Selected_users } }; // Handle multiple usernames
        await collection.updateOne(filter, update);
        res.status(200).send("Users added successfully");
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Endpoint to handle user registration using MongoDB (no Firebase)
app.post('/get_data', async (req, res) => {
    try {
        const { Username, Email, Password } = req.body;

        // Check if the username exists
        const username_exist = await collection.findOne({ Username: Username });
        if (username_exist) {
            return res.status(200).send("Username Already Taken");
        }

        // Check if the email exists
        const email_exist = await collection.findOne({ Email: Email });
        if (email_exist) {
            return res.status(200).send("Email Already Exists");
        }

        // Insert the new user into MongoDB
        const doc = { Username, Email, Password, Selectedusers: [], Messages: {} };
        await collection.insertOne(doc);

        console.log("User Registered successfully");
        res.status(200).send("Successful");
    } catch (error) {
        res.status(500).send("Error");
        console.log(error);
    }
});

// Endpoint to search for users in MongoDB
app.post('/get_users', async (req, res) => {
    try {
        const { searchValue, username } = req.body;
        const users = [];
        const cursor = await collection.find({ Username: { $ne: username.Username, $regex: searchValue, $options: 'i' } });

        await cursor.forEach(doc => {
            users.push(doc.Username);
        });

        res.status(200).send(users);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("ERROR IN DATABASE CONTACT THE AUTHORITIES");
    }
});

// Authentication endpoint using MongoDB (no Firebase)
app.post('/auth', async (req, res) => {
    try {
        const { EmailUsername, Password } = req.body;

        const user = await collection.findOne({
            $or: [{ Email: EmailUsername }, { Username: EmailUsername }],
            Password: Password
        });

        if (user) {
            return res.status(200).send({ auth: true, username: user.Username });
        }

        return res.status(200).send({ auth: false, username: '' });
    } catch (error) {
        console.log("error in login auth");
        console.log(error);
        res.status(500).send("Internal Server Error");
    }
});

// Store messages in MongoDB
app.post('/store_messages', async (req, res) => {
    const { username, other_user, message } = req.body;
    const filter = { Username: username };
    const change = { $push: { [`Messages.${other_user}`]: message } };
    await collection.updateOne(filter, change);
    res.status(200).send("Message stored successfully");
});

// Retrieve messages from MongoDB
app.post('/retrieve_messages', async (req, res) => {
    const { username } = req.body;
    const result = await collection.findOne({ Username: username });
    if(result)
        res.status(200).send(result.Messages);
    else
        res.status(200).send("Error !!!");
});

// Set up the HTTP server and WebSocket server
const httpserver = server.listen(5000, () => {
    console.log("Server started");
});

const io = new Server(httpserver, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const sockets = new Map();
io.on("connection", (socket) => {
    socket.on("username", async (username) => {
        if (sockets.has(username.Username)) {
            sockets.delete(username.Username);
        }
        sockets.set(username.Username, socket);
    });

    socket.on("messages", (data) => {
        if (sockets.has(data.reciever)) {
            console.log(data.sender);
            sockets.get(data.reciever).emit("rcv_message", { sender: data.sender, message: data.message });
        }
    });
});
