const express = require('express');
const router = express.Router();
const multer = require('multer');
const asynchandler = require('express-async-handler');
const Product = require('../models/Product');
const { verifyAdmin } = require('../middleware/auth');
const cloudinary = require("cloudinary").v2;

// ───────────────── Cloudinary Config ─────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ───────────────── Multer Memory Storage ─────────────────
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ───────────────── Upload Helper ─────────────────
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'coze_store',
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    ).end(buffer);
  });
};

// =====================================================
// CREATE PRODUCT
// =====================================================
router.post('/', verifyAdmin, upload.array('images', 5), asynchandler(async (req, res) => {

  const { name, description, price, category } = req.body;

  if (!name || !price || !category) {
    return res.status(400).json({ message: "name, price, category required" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "At least one image required" });
  }

  const uploads = await Promise.all(
    req.files.map(file => uploadToCloudinary(file.buffer))
  );

  const imageUrls = uploads.map(r => r.secure_url);

  const product = await Product.create({
    name,
    description,
    price,
    category,
    images: imageUrls
  });

  res.status(201).json(product);
}));

// =====================================================
// GET ALL PRODUCTS
// =====================================================
router.get('/', asynchandler(async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
}));

// =====================================================
// GET PRODUCT BY ID
// =====================================================
router.get('/:id', asynchandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
}));

// =====================================================
// UPDATE PRODUCT  ✅ FIXED
// =====================================================
router.put('/:id', verifyAdmin, upload.array('images', 5), asynchandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  let updatedImages = [];

  // رفع الصور الجديدة
  if (req.files && req.files.length > 0) {
    const uploads = await Promise.all(
      req.files.map(file => uploadToCloudinary(file.buffer))
    );
    updatedImages.push(...uploads.map(r => r.secure_url));
  }

  // إضافة الصور القديمة
  if (req.body.existingImages) {
    const oldImages = JSON.parse(req.body.existingImages);
    updatedImages.push(...oldImages);
  }

  // تحديث بيانات المنتج
  product.name = req.body.name || product.name;
  product.description = req.body.description || product.description;
  product.price = req.body.price || product.price;
  product.category = req.body.category || product.category;
  product.sectionType = req.body.sectionType || product.sectionType;
  product.sizes = req.body.sizes || product.sizes;
  product.images = updatedImages;

  await product.save();
  res.json(product);
}));


// =====================================================
// DELETE PRODUCT
// =====================================================
router.delete('/:id', verifyAdmin, asynchandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ message: "Product deleted" });
}));

module.exports = router;
