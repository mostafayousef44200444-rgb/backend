const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// تسجيل مستخدم جديد
router.post('/register', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'البريد الإلكتروني مستخدم من قبل' });
  }

  const newUser = await User.create({ firstName, lastName, email, password });

  const secret = process.env.JWT_SECRET || 'my-backup-secret-key- changeable-please';

  const token = jwt.sign(
    { id: newUser._id, role: newUser.role },
    secret,
    { expiresIn: '8d' }
  );

  res.status(201).json({
    success: true,
    message: 'تم التسجيل بنجاح',
    token,
    user: {
      id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.role
    }
  });
}));

// تسجيل الدخول
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'البريد وكلمة المرور مطلوبين' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
  }

  const isMatch = await user.comparePassword(password);   // ← هنا صححنا الاسم
  if (!isMatch) {
    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
  }

  const secret = process.env.JWT_SECRET || 'my-backup-secret-key- changeable-please';

  const token = jwt.sign(
    { id: user._id, role: user.role },
    secret,
    { expiresIn: '8d' }
  );

  res.status(200).json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    }
  });
}));

// جلب كل المستخدمين
router.get('/', asyncHandler(async (req, res) => {
  const users = await User.find({}, '-password'); // استثناء كلمة المرور من النتيجة
  res.status(200).json(users);
}));

module.exports = router;