const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Ensure upload directory exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/intellipeer')
    .then(() => console.log("DB Connected ✅"))
    .catch(err => console.error("DB Error:", err));

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    toLearn: String,
    toTeach: String
}));

const Folder = mongoose.model('Folder', new mongoose.Schema({
    topic: String,
    type: String,
    filePath: String,
    uploadedBy: String,
    createdAt: { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    sender: String,
    receiver: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
}));

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// --- API ROUTES ---

// 1. SIGNUP & LOGIN
app.post('/api/signup', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json({ name: user.name });
    } catch (err) { res.status(400).json({ error: "Email exists!" }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email, password: req.body.password });
    user ? res.json({ name: user.name }) : res.status(400).json({ error: "Invalid Login" });
});
// Add this to your server.js (Backend)
app.put('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        // Find the user by email and update their password
        const user = await User.findOneAndUpdate(
            { email: email },
            { password: newPassword }, // In a real app, you should hash this!
            { new: true }
        );

        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// 2. USER PROFILE UPDATE (The part you needed for Settings)
app.put('/api/users/update', async (req, res) => {
    const { oldName, newName, toLearn, toTeach } = req.body;
    try {
        // Update user profile
        const user = await User.findOneAndUpdate(
            { name: oldName },
            { name: newName, toLearn: toLearn, toTeach: toTeach },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: "User not found" });

        // Synchronize name changes across other collections
        await Folder.updateMany({ uploadedBy: oldName }, { uploadedBy: newName });
        await Message.updateMany({ sender: oldName }, { sender: newName });
        await Message.updateMany({ receiver: oldName }, { receiver: newName });

        res.json({ message: "Profile Updated", name: user.name });
    } catch (err) {
        res.status(500).json({ error: "Server update error" });
    }
});

app.get('/api/users', async (req, res) => {
    res.json(await User.find({}, 'name toLearn toTeach'));
});

// 3. FOLDERS & UPLOADS
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const folder = new Folder({
        topic: req.body.topic,
        type: req.body.type,
        uploadedBy: req.body.uploadedBy,
        filePath: req.file.path
    });
    await folder.save();
    res.json({ message: "Success" });
});

app.get('/api/folders', async (req, res) => {
    res.json(await Folder.find().sort({ createdAt: -1 }));
});

app.delete('/api/folders/:id', async (req, res) => {
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

// 4. MESSAGES
app.post('/api/messages', async (req, res) => {
    const msg = new Message(req.body);
    await msg.save();
    res.json(msg);
});

app.get('/api/messages/:u1/:u2', async (req, res) => {
    const msgs = await Message.find({
        $or: [{ sender: req.params.u1, receiver: req.params.u2 }, 
              { sender: req.params.u2, receiver: req.params.u1 }]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});
// Route for Password Reset
app.put('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        // 1. Check if user exists
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ error: "No account found with this email." });
        }

        // 2. Update the password
        // Note: If you use bcrypt for hashing, hash 'newPassword' before saving!
        user.password = newPassword; 
        await user.save();

        console.log(`Password reset successful for: ${email}`);
        res.json({ message: "Password updated successfully!" });

    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ error: "Server error during password reset." });
    }
}); 

app.listen(5000, () => console.log("Server running on port 5000 🚀"));