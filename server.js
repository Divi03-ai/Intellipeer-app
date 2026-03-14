const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// ✅ CORS - Allow all origins (frontend can call from anywhere)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ Serve uploaded files publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Ensure upload directory exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ✅ MongoDB Connection - uses environment variable on Render
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

// ✅ Multer - Use /tmp on Render (ephemeral storage)
const uploadDir = process.env.RENDER ? '/tmp/uploads' : './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// ✅ Health check route (Render needs this)
app.get('/', (req, res) => res.json({ status: 'IntelliPeer API running 🚀' }));

// --- API ROUTES ---

// 1. SIGNUP
app.post('/api/signup', async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json({ name: user.name });
    } catch (err) {
        res.status(400).json({ error: "Email already exists!" });
    }
});

// 2. LOGIN
app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email, password: req.body.password });
    user ? res.json({ name: user.name }) : res.status(400).json({ error: "Invalid Login" });
});

// 3. RESET PASSWORD
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

// 4. UPDATE PROFILE
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

// 5. GET ALL USERS
app.get('/api/users', async (req, res) => {
    res.json(await User.find({}, 'name toLearn toTeach'));
});

// 6. UPLOAD FILE
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const folder = new Folder({
        topic: req.body.topic,
        type: req.body.type,
        uploadedBy: req.body.uploadedBy,
        filePath: 'uploads/' + req.file.filename
    });
    await folder.save();
    res.json({ message: "Success" });
});

// 7. GET ALL FOLDERS
app.get('/api/folders', async (req, res) => {
    res.json(await Folder.find().sort({ createdAt: -1 }));
});

// 8. DELETE FOLDER
app.delete('/api/folders/:id', async (req, res) => {
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
});

// 9. SEND MESSAGE
app.post('/api/messages', async (req, res) => {
    const msg = new Message(req.body);
    await msg.save();
    res.json(msg);
});

// 10. GET MESSAGES
app.get('/api/messages/:u1/:u2', async (req, res) => {
    const msgs = await Message.find({
        $or: [
            { sender: req.params.u1, receiver: req.params.u2 },
            { sender: req.params.u2, receiver: req.params.u1 }
        ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});

// ✅ Use PORT from environment (Render sets this automatically)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));