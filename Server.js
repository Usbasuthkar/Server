const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('node:http');
const cors = require('cors');
const admin = require('firebase-admin');
const mongodb = require('mongodb');

const uri = "mongodb+srv://ujwalb29:Doodlearmy_2@cluster0.ne3wrkv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const serviceAccount = require('spotify-user-data-firebase.json');

const client = new mongodb.MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect();
console.log("Connected to MongoDB Atlas");
const database = client.db('Spotify_users');
const collection = database.collection("spotify_data");

admin.initializeApp({
    credential:admin.credential.cert(serviceAccount),
    databaseURL : "https://spotify-user-data-default-rtdb.asia-southeast1.firebasedatabase.app/"
});
const db = admin.database();
const app = express();
app.use(express.json());
app.use(cors());
const server = createServer(app);
app.post('/delete_users',async (req,res)=>{
    try {
        const { username, Selected_users } = req.body;
        console.log(Selected_users);
        const filter = { Username: username.Username };
        const update = { $pull: { Selectedusers: Selected_users } };
        const result = await collection.updateOne(filter, update);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    } finally {
        await client.close();
    }
});
app.post('/store_socket',async (req,res)=>{
    await client.connect();
    const database = client.db('Spotify_users');
    const collection = database.collection("spotify_data");
    console.log(req.body)
})
app.post('/get_selected_users',async (req,res)=>{
    const Selected_users = await collection.findOne({Username:req.body.username.Username});
    if(Selected_users === null){
        res.status(200).send([]);
    }else{
    const arr = Selected_users['Selectedusers'];
    res.status(200).send(arr);
    }
});
app.post('/selected_users', async (req, res) => {
    try {
        const { username, Selected_users } = req.body; // Assume Selected_user is a single username string
        console.log(Selected_users);
        const filter = { Username: username.Username };
        const update = { $push: { Selectedusers: Selected_users } }; // Push the single username
        const result = await collection.updateOne(filter, update);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    } finally {
        await client.close(); // Close the connection
    }
});


app.post('/get_data',async (req,res)=>{
    try{
        console.log("got submitted");
        const data = req.body;
        const { Username,Email } = req.body;
        const username_exist = await db.ref("UserData")
        .orderByChild("Username")
        .equalTo(Username)
        .once("value");
        if(username_exist.exists()){
            return res.status(200).send("Username Already Taken");
        }
        const email_exist = await db.ref("UserData")
        .orderByChild("Email")
        .equalTo(Email)
        .once("value");
        if(email_exist.exists()){
            return res.status(200).send("Email Already Exsists");
        }
        await db.ref("UserData").push(data);
        const doc = {
            Username:Username,
            Selectedusers : [],
            Messages : {}
        };
        const result = await collection.insertOne(doc);
        console.log("User Registered successfully");
        res.status(200).send("Successful");
    }catch(error){
        res.status(200).send("Error");
        console.log(error);
    }
});

app.post('/get_users', async (req, res) => {
    try {
        const { searchValue,username } = req.body;
        const snapshot = await db.ref("UserData").once("value");
        const users = [];
        snapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.Username && userData.Username !== username.Username && userData.Username.toLowerCase().includes(searchValue.toLowerCase())) {
                users.push(userData.Username);
            }
        });
        res.status(200).send(users);
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("ERROR IN DATABASE CONTACT THE AUTHORITIES");
    }
});

app.post('/auth', async (req,res)=>{
    try{
        const {EmailUsername,Password} = req.body;
        const check_email = await db.ref("UserData")
        .orderByChild("Email")
        .equalTo(EmailUsername)
        .once("value");

        const check_username = await db.ref("UserData")
        .orderByChild("Username")
        .equalTo(EmailUsername)
        .once("value");

        const check_password = await db.ref("UserData")
        .orderByChild("Password")
        .equalTo(Password)
        .once("value")

        if(check_email.exists()  && check_password.exists()){
            let username = null;
            check_email.forEach(childSnapshot => {
                const userData = childSnapshot.val();
                username = userData.Username;
            });
            return res.status(200).send({auth:true,username:username});
        }
        else if(check_username.exists() && check_password.exists()){
            return res.status(200).send({auth:true,username:EmailUsername});
        }
        return res.status(200).send({auth:false,username:''});
    }catch(error){
        console.log("error in login auth");
        console.log(error);
    }
});

app.post('/store_messages', async (req,res)=>{
    
    const filter = {Username:req.body.username};
    console.log("i got called");
    const change = {$push:{[`Messages.${req.body.other_user}`]:req.body.message}};
    const result = await collection.updateOne(filter, change);
});

app.post('/retrieve_messages', async (req,res)=>{
    const result = await collection.findOne({Username:req.body.username});
    res.status(200).send(result.Messages);
})
const httpserver = server.listen(5000,()=>{
    console.log("Server started");
});
const io = new Server(httpserver, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const sockets = new Map();
io.on("connection",(socket)=>{
    socket.on("username", async (username)=>{
        if(sockets.has(username.Username)){
            sockets.delete(username.Username);
        }
        sockets.set(username.Username,socket);
    });
    socket.on("messages",(data)=>{
        if(sockets.has(data.reciever)){
            console.log(data.sender);
            sockets.get(data.reciever).emit("rcv_message",{sender:data.sender,message:data.message});
        }
    });
})