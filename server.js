const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(cors());

const upload = multer({ dest: "Uploads/" });

app.post("/upload", upload.single("file"), (req, res) => {
    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, "Upload", req.file.originalname);

    // Ensure Upload directory exists
    if (!fs.existsSync("Upload")) {
        fs.mkdirSync("Upload");
    }

    // Rename and move file
    fs.rename(tempPath, targetPath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("File processing error.");
        }

        res.status(200).send("File uploaded successfully.");
    });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});
