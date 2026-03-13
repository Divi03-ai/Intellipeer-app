const mongoose = require("mongoose");

const FolderSchema = new mongoose.Schema({
    folderName: String,
    contentType: String,
    createdBy: String
}, { timestamps: true });

module.exports = mongoose.model("Folder", FolderSchema);