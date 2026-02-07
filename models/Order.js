const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String,
    price: Number,
    size: String,
    image: String,
    quantity: {
      type: Number,
      default: 1
    }
  }],

  total: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },

  shippingAddress: {
    fullName: String,
    phone: String,
    city: String,
    street: String,
    country: String
  },

  payment: {
    method: String,
    notes: String
  },

  statusHistory: [{
    status: String,
    at: { type: Date, default: Date.now },
    note: String
  }],

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model('Order', orderSchema);
