const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  price: { type: Number, required: true },
  images: { type: [String], required: true },

  category: { 
    type: String, 
    enum: ["Men", "Women", "Kids", "Bag", "Shoes", "Watches"], // تم تعديلها لتطابق Angular
    required: true
  },

  sizes: [{ 
    type: String, 
    enum: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] 
  }],
  
 
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
