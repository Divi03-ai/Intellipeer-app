const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ FIX: One uploadDir for both serve + multer
const uploadDir = process.env.RENDER ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ FIX: Serve from correct uploadDir (not hardcoded __dirname/uploads)
app.use('/uploads', express.static(uploadDir));

// ✅ MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intellipeer';
mongoose.connect(MONGO_URI)
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

// ✅ Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/', (req, res) => res.json({ status: 'IntelliPeer API running 🚀' }));

app.post('/api/signup', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json({ name: user.name });
    } catch (err) {
        res.status(400).json({ error: "Email already exists!" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email, password: req.body.password });
        user ? res.json({ name: user.name }) : res.status(400).json({ error: "Invalid Login" });
    } catch (err) {
        res.status(500).json({ error: "Login error" });
    }
});

app.put('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "No account found with this email." });
        user.password = newPassword;
        await user.save();
        res.json({ message: "Password updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Server error during password reset." });
    }
});

app.put('/api/users/update', async (req, res) => {
    const { oldName, newName, toLearn, toTeach } = req.body;
    try {
        const user = await User.findOneAndUpdate(
            { name: oldName },
            { name: newName, toLearn, toTeach },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: "User not found" });
        await Folder.updateMany({ uploadedBy: oldName }, { uploadedBy: newName });
        await Message.updateMany({ sender: oldName }, { sender: newName });
        await Message.updateMany({ receiver: oldName }, { receiver: newName });
        res.json({ message: "Profile Updated", name: user.name });
    } catch (err) {
        res.status(500).json({ error: "Server update error" });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        res.json(await User.find({}, 'name toLearn toTeach'));
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const folder = new Folder({
            topic: req.body.topic,
            type: req.body.type,
            uploadedBy: req.body.uploadedBy,
            filePath: 'uploads/' + req.file.filename
        });
        await folder.save();
        res.json({ message: "Success" });
    } catch (err) {
        res.status(500).json({ error: "Upload error" });
    }
});

app.get('/api/folders', async (req, res) => {
    try {
        res.json(await Folder.find().sort({ createdAt: -1 }));
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

app.delete('/api/folders/:id', async (req, res) => {
    try {
        await Folder.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: "Delete error" });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const msg = new Message(req.body);
        await msg.save();
        res.json(msg);
    } catch (err) {
        res.status(500).json({ error: "Message error" });
    }
});

app.get('/api/messages/:u1/:u2', async (req, res) => {
    try {
        const msgs = await Message.find({
            $or: [
                { sender: req.params.u1, receiver: req.params.u2 },
                { sender: req.params.u2, receiver: req.params.u1 }
            ]
        }).sort({ timestamp: 1 });
        res.json(msgs);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

// ✅ 0.0.0.0 binding — Render-ல அவசியம்
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} 🚀`));