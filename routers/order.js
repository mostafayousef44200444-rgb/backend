// BackEnd/routes/order.routes.js
const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// ==================== USER ROUTES ====================

// POST /api/orders - Add multiple products to cart
router.post("/", verifyToken, asyncHandler(async (req, res) => { // تعريف روت POST لإضافة منتجات للسلة، مع التحقق من تسجيل الدخول
  const { products } = req.body; // جلب مصفوفة المنتجات من جسم الطلب
  if (!Array.isArray(products) || products.length === 0) // التأكد إن المصفوفة موجودة ومش فاضية
    return res.status(400).json({ message: "Products array is required" }); // رجوع خطأ 400 لو المصفوفة ناقصة

  const productIds = products.map(p => p.productId); // استخراج الـ IDs الخاصة بالمنتجات فقط
  const dbProducts = await Product.find({ _id: { $in: productIds } }); // جلب كل المنتجات من قاعدة البيانات اللي موجودة بالأيدي دي
  if (dbProducts.length === 0) // التأكد إنه في منتجات صالحة
    return res.status(400).json({ message: "No valid products found" }); // رجوع خطأ لو مفيش منتجات صالحة

  let order = await Order.findOne({ user: req.user.id, status: "pending" }); // البحث عن سلة مشتريات حالية للمستخدم
  if (!order) { // لو مفيش سلة موجودة
    order = new Order({ // إنشاء سلة جديدة
      user: req.user.id, // ربط السلة بالمستخدم
      items: [], // بدء السلة بدون منتجات
      total: 0, // إجمالي السعر صفر
      status: "pending", // حالة السلة "قيد الانتظار"
      statusHistory: [{ status: "pending", note: "Created cart" }] // سجل حالة السلة
    });
  } else { 
    order.items = []; // لو السلة موجودة، مسح المنتجات القديمة استعداداً لإضافة المنتجات الجديدة
  }

  for (const prod of products) { // المرور على كل منتج في المصفوفة
    const dbProduct = dbProducts.find(p => p._id.toString() === prod.productId); // البحث عن المنتج في قاعدة البيانات
    if (!dbProduct) continue; // تخطي المنتج لو مش موجود

    const existingItem = order.items.find(i =>
      i.productId.toString() === prod.productId && i.size === (prod.size || "") // البحث عن المنتج نفسه بنفس الحجم في السلة
    );

    if (existingItem) { // لو موجود بالفعل في السلة
      existingItem.quantity += prod.quantity || 1; // زيادة الكمية بالعدد الجديد أو واحد افتراضياً
    } else { // لو مش موجود
      order.items.push({ // إضافة المنتج للسلة
        productId: dbProduct._id, // ID المنتج
        name: dbProduct.name, // اسم المنتج
        price: dbProduct.price, // سعر المنتج
        quantity: prod.quantity || 1, // الكمية
        size: prod.size || "", // الحجم إذا موجود
        image: dbProduct.images?.[0] || "" // صورة المنتج (أول صورة أو فارغ)
      });
    }
  }

  order.total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0); // حساب إجمالي السعر بعد تحديث السلة
  await order.save(); // حفظ السلة في قاعدة البيانات

  const populated = await Order.findById(order._id).populate("user", "email"); // جلب السلة مع معلومات المستخدم (البريد الإلكتروني)
  res.status(201).json({ success: true, message: "Cart updated", order: populated }); // إرسال الرد للمستخدم مع السلة المحدثة
}));


// PUT /api/orders/update-cart - update quantities or items
router.put("/update-cart", verifyToken, asyncHandler(async (req, res) => { // روت PUT لتحديث السلة للمستخدم المسجل
  const { items } = req.body; // جلب مصفوفة العناصر الجديدة من جسم الطلب
  if (!Array.isArray(items)) // التأكد أن البيانات مصفوفة
    return res.status(400).json({ message: "Items array required" }); // رجوع خطأ لو مش مصفوفة

  const order = await Order.findOne({ user: req.user.id, status: "pending" }); // البحث عن السلة الحالية للمستخدم
  if (!order) return res.status(404).json({ message: "No pending cart found" }); // لو مفيش سلة حالية رجوع خطأ

  order.items = items.map(i => ({ // تحديث عناصر السلة بالمصفوفة الجديدة
    productId: i.productId, // ID المنتج
    quantity: i.quantity, // كمية المنتج
    size: i.size || "", // الحجم إذا موجود أو فارغ
    name: i.name || "", // اسم المنتج إذا موجود أو فارغ
    price: i.price || 0, // السعر أو صفر افتراضياً
    image: i.image || "" // الصورة أو فارغ
  }));

  order.total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0); // حساب إجمالي السلة بعد التحديث
  await order.save(); // حفظ التعديلات في قاعدة البيانات

  res.json({ success: true, message: "Cart updated", order }); // إرسال الرد للمستخدم مع السلة المحدثة
}));


// POST /api/orders/add-to-cart - add single product
router.post("/add-to-cart", verifyToken, asyncHandler(async (req, res) => { // روت POST لإضافة منتج للسلة، لازم المستخدم مسجل
  const { productId, quantity = 1, size = "" } = req.body; // جلب بيانات المنتج من جسم الطلب مع قيمة افتراضية للكمية والحجم
  const dbProduct = await Product.findById(productId); // البحث عن المنتج في قاعدة البيانات
  if (!dbProduct) return res.status(404).json({ message: "Product not found" }); // لو المنتج مش موجود رجوع خطأ

  let order = await Order.findOne({ user: req.user.id, status: "pending" }); // البحث عن السلة الحالية للمستخدم
  if (!order) { // لو مفيش سلة حالية
    order = new Order({ // إنشاء سلة جديدة
      user: req.user.id, // ربط السلة بالمستخدم
      items: [], // مصفوفة العناصر فارغة
      total: 0, // الإجمالي صفر
      status: "pending", // حالة السلة "معلقة"
      statusHistory: [{ status: "pending", note: "Created cart" }] // سجل الحالة
    });
  }

  const existingItem = order.items.find(i => // البحث إذا كان المنتج موجود مسبقاً بنفس الحجم
    i.productId.toString() === productId && i.size === size
  );

  if (existingItem) { // لو المنتج موجود
    existingItem.quantity += quantity; // زيادة الكمية
  } else { // لو المنتج مش موجود
    order.items.push({ // إضافة المنتج للسلة
      productId: dbProduct._id, // ID المنتج
      name: dbProduct.name, // الاسم
      price: dbProduct.price, // السعر
      quantity, // الكمية
      size, // الحجم
      image: dbProduct.images?.[0] || "" // الصورة الأولى أو فارغ
    });
  }

  order.total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0); // حساب إجمالي السلة
  await order.save(); // حفظ السلة في قاعدة البيانات

  const populated = await Order.findById(order._id).populate("user", "email"); // جلب السلة مع بيانات المستخدم
  res.json({ success: true, message: "Item added to cart", order: populated }); // إرسال الرد مع السلة المحدثة
}));

// DELETE /api/orders/remove-from-cart/:productId
router.delete("/remove-from-cart/:productId", verifyToken, asyncHandler(async (req, res) => { // روت DELETE لحذف منتج من السلة، لازم المستخدم مسجل
  const { productId } = req.params; // جلب الـ productId من رابط الطلب
  const order = await Order.findOne({ user: req.user.id, status: "pending" }); // البحث عن السلة الحالية للمستخدم
  if (!order) return res.status(404).json({ message: "No pending cart found" }); // لو مفيش سلة حالية رجوع خطأ

  order.items = order.items.filter(i => i.productId.toString() !== productId); // إزالة المنتج من السلة
  order.total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0); // إعادة حساب إجمالي السلة بعد الحذف
  await order.save(); // حفظ السلة بعد التحديث

  res.json({ success: true, message: "Item removed", order }); // إرسال الرد مع السلة المحدثة
}));

// PUT /api/orders/:orderId/confirm - confirm order
router.put("/:orderId/confirm", verifyToken, asyncHandler(async (req, res) => { // روت PUT لتأكيد الطلب، لازم المستخدم مسجل
  const { fullName, phone, city, street, country, paymentMethod, notes } = req.body; // جلب بيانات الشحن والدفع من الجسم
  const { orderId } = req.params; // جلب معرف الطلب من الرابط

  if (!fullName || !phone || !city || !street || !country || !paymentMethod)
    return res.status(400).json({ message: "All shipping and payment fields are required" }); // التحقق من وجود كل بيانات الشحن والدفع

  const order = await Order.findById(orderId); // البحث عن الطلب بالـ ID
  if (!order) return res.status(404).json({ message: "Order not found" }); // لو الطلب مش موجود رجوع خطأ
  if (order.user.toString() !== req.user.id) return res.status(403).json({ message: "Unauthorized" }); // التأكد أن الطلب يخص المستخدم الحالي
  if (order.status !== "pending") return res.status(400).json({ message: "Order already confirmed" }); // لو الطلب متأكد مسبقاً رجوع خطأ

  order.shippingAddress = { fullName, phone, city, street, country }; // حفظ عنوان الشحن
  order.payment = { method: paymentMethod }; // حفظ طريقة الدفع
  order.notes = notes || ""; // حفظ الملاحظات إذا موجودة
  order.status = "processing"; // تغيير حالة الطلب إلى معالجة
  order.statusHistory.push({ status: "processing", note: "Order confirmed by user" }); // إضافة سجل لتغيير الحالة

  await order.save(); // حفظ الطلب بعد التعديل
  const populated = await Order.findById(order._id).populate("user", "email"); // جلب الطلب مع بيانات المستخدم
  res.json({ success: true, message: "Order confirmed", order: populated }); // إرسال الرد مع الطلب المؤكد
}));

// GET /api/orders/my/current - current pending order
router.get("/my/current", verifyToken, asyncHandler(async (req, res) => { // روت GET لجلب السلة الحالية للمستخدم، لازم تسجيل دخول
  const order = await Order.findOne({ user: req.user.id, status: "pending" }) // البحث عن طلب المستخدم الحالي في حالة "pending"
    .populate("items.productId", "name price images") // جلب بيانات المنتجات المرتبطة بالعناصر: الاسم، السعر، الصور
    .lean(); // تحويل الناتج لكائن عادي بدل Mongoose document

  if (order) { // لو فيه طلب موجود
    order.items = order.items.map(item => ({ // تحديث كل عنصر
      ...item, // الاحتفاظ بكل البيانات القديمة
      image: item.image || item.productId?.images?.[0] || "" // إذا مفيش صورة موجودة للعنصر، استخدم أول صورة من المنتج، أو فارغ
    }));
  }

  res.json(order || { items: [], total: 0 }); // إرجاع الطلب إذا موجود، وإلا إرجاع سلة فارغة
}));

// GET /api/orders/my - all user orders
router.get("/my", verifyToken, asyncHandler(async (req, res) => { // روت GET لجلب كل طلبات المستخدم، لازم تسجيل دخول
  const orders = await Order.find({ user: req.user.id }) // البحث عن كل الطلبات اللي تخص المستخدم
    .sort({ createdAt: -1 }) // ترتيب الطلبات من الأحدث للأقدم
    .populate("items.productId", "name price images") // جلب بيانات المنتجات المرتبطة بالعناصر: الاسم، السعر، الصور
    .lean(); // تحويل الناتج لكائن عادي بدل Mongoose document

  res.json({ success: true, orders }); // إرسال كل الطلبات كـ JSON
}));


// ==================== ADMIN ROUTES ====================

// GET /api/orders - all orders
router.get("/", verifyAdmin, asyncHandler(async (req, res) => { // روت GET لجلب كل الطلبات، لازم يكون الأدمن مسجل دخول
  const orders = await Order.find() // البحث عن كل الطلبات في الداتا بيز
    .populate("user", "email") // جلب بيانات المستخدم المرتبط بالطلب (الإيميل فقط)
    .populate("items.productId", "name price images") // جلب تفاصيل المنتجات في كل عنصر: الاسم، السعر، الصور
    .sort({ createdAt: -1 }) // ترتيب الطلبات من الأحدث للأقدم
    .lean(); // تحويل الناتج لكائنات عادية بدل Mongoose documents

  res.json({ success: true, orders }); // إرسال كل الطلبات كـ JSON
}));


// GET /api/orders/:orderId/admin - get specific order
router.get("/:orderId/admin", verifyAdmin, asyncHandler(async (req, res) => { // روت GET لجلب تفاصيل طلب معين للأدمن، مع التحقق من التوكن والأدمن
  const { orderId } = req.params; // استخراج رقم أو ID الطلب من الرابط

  if (!mongoose.Types.ObjectId.isValid(orderId)) // التحقق إن الID صحيح بصيغة MongoDB
    return res.status(400).json({ message: "Invalid order ID" }); // لو مش صحيح يرجع خطأ 400

  const order = await Order.findById(orderId) // البحث عن الطلب بالID
    .populate("user", "email") // جلب بيانات المستخدم (الإيميل فقط)
    .populate("items.productId", "name price images stock"); // جلب بيانات المنتجات المرتبطة بكل عنصر: الاسم، السعر، الصور، الكمية المتوفرة

  if (!order) return res.status(404).json({ message: "Order not found" }); // لو الطلب مش موجود يرجع 404
  res.json({ success: true, order }); // لو موجود يرجع تفاصيل الطلب كJSON
}));


// PUT /api/orders/:orderId/admin - admin update
router.put("/:orderId/admin", verifyAdmin, asyncHandler(async (req, res) => { // روت PUT لتعديل طلب معين للأدمن فقط مع التحقق من التوكن والأدمن
  const { orderId } = req.params; // استخراج ID الطلب من الرابط
  const { items, status, shippingPrice = 0, adminNote } = req.body; // استخراج البيانات المرسلة من الجسم: العناصر الجديدة، حالة الطلب، سعر الشحن، ملاحظات الأدمن

  if (!mongoose.Types.ObjectId.isValid(orderId)) // التحقق من صحة ID الطلب
    return res.status(400).json({ message: "Invalid order ID" }); // لو مش صحيح يرجع خطأ 400

  const order = await Order.findById(orderId); // البحث عن الطلب بالID
  if (!order) return res.status(404).json({ message: "Order not found" }); // لو مش موجود يرجع 404

  if (items && Array.isArray(items)) { // لو تم إرسال عناصر جديدة لتحديثها
    order.items = items.map(i => ({ // نحدث العناصر بالبيانات الجديدة أو الافتراضيات
      productId: i.productId,
      name: i.name || "Unknown",
      price: i.price || 0,
      quantity: i.quantity || 1,
      size: i.size || "",
      image: i.image || ""
    }));
  }

  if (status && ["processing", "shipped", "delivered", "cancelled"].includes(status)) { // لو تم إرسال حالة جديدة صحيحة
    if (order.status !== status) { // فقط لو الحالة مختلفة عن الحالية
      order.status = status; // تحديث الحالة
      order.statusHistory.push({ status, note: adminNote || `Status changed to ${status} by admin` }); // إضافة سجل للتاريخ
    }
  }

  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0); // حساب مجموع العناصر
  order.total = subtotal + parseFloat(shippingPrice); // إضافة سعر الشحن للتوتال

  await order.save(); // حفظ التعديلات

  const populated = await Order.findById(order._id) // إعادة جلب الطلب مع بيانات المستخدم والمنتجات
    .populate("user", "email")
    .populate("items.productId", "name price images stock");

  res.json({ success: true, order: populated }); // إرسال الرد
}));


module.exports = router;