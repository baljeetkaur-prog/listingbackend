const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const slugify = require('slugify');
const bcrypt = require('bcrypt');
const csv = require('csvtojson');
const XLSX = require('xlsx');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 9000;
const { v4: uuidv4 } = require('uuid');
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const seller = await Seller.findById(decoded.id);
    if (!seller) {
      return res.status(401).json({ error: 'Seller not found' });
    }

    req.seller = seller;
    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Token failed' });
  }
};
const userAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId); // ✅ Change from decoded.id to decoded.userId
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Token failed' });
  }
};
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const uploadDir = path.join(__dirname, 'uploads');

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const categoryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const categoryPath = path.join(uploadDir, 'categories');
    if (!fs.existsSync(categoryPath)) {
      fs.mkdirSync(categoryPath, { recursive: true });
    }
    cb(null, categoryPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const uploadCategory = multer({ storage: categoryStorage });
const subCategoryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const subCategoryPath = path.join(uploadDir, 'subcategories'); 
    if (!fs.existsSync(subCategoryPath)) {
      fs.mkdirSync(subCategoryPath, { recursive: true });
    }
    cb(null, subCategoryPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); 
  },
});

const uploadSubCategory = multer({ storage: subCategoryStorage });


// For product images
const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const productPath = path.join(uploadDir, 'products');
    if (!fs.existsSync(productPath)) {
      fs.mkdirSync(productPath, { recursive: true });
    }
    cb(null, productPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const uploadProduct = multer({ storage: productStorage });

mongoose.connect('mongodb+srv://baljeetkor6:NhoYMNLXxKYBVJFY@cluster0.9zpt6hi.mongodb.net/listing?retryWrites=true&w=majority&appName=clustor0')
  .then(() => console.log('MongoDB Connected'))
  .catch((e) => console.log("Unable to connect to MongoDB: " + e.message));

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now }
});

const otpSchema = new mongoose.Schema({
  phone: String,
  otp: String,
  createdAt: { type: Date, default: Date.now, expires: 300 } // 5 minutes expiry
});

const User = mongoose.model('User', userSchema);
const Otp = mongoose.model('Otp', otpSchema);
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await Otp.deleteMany({ phone }); // Clear old OTPs
    await Otp.create({ phone, otp }); // Store new OTP

    // ⚠️ MOCK ONLY: Send OTP back in response for testing
    res.status(200).json({ message: 'OTP generated (mock)', otp });
  } catch (error) {
    console.error('OTP send error:', error.message);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

/**
 * Verify OTP
 */
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

  try {
    const record = await Otp.findOne({ phone, otp });

    if (!record) return res.status(400).json({ error: 'Invalid or expired OTP' });

    // Register if new user
    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone });

    // JWT generation
    const token = jwt.sign(
      { userId: user._id, phone },
      process.env.JWT_SECRET || 'devsecret123',
      { expiresIn: '7d' }
    );

    await Otp.deleteMany({ phone }); // clear OTPs after use

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('OTP verify error:', error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});
app.get('/api/auth/check-user/:phone', async (req, res) => {
  const { phone } = req.params;

  try {
    const user = await User.findOne({ phone });
    if (user) {
      res.status(200).json({ exists: true });
    } else {
      res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error('User check error:', err.message);
    res.status(500).json({ error: 'Error checking user' });
  }
});
app.post('/api/auth/login-phone', async (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not registered' });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, phone },
      process.env.JWT_SECRET || 'devsecret123',
      { expiresIn: '7d' }
    );

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed' });
  }
});
const categorySchema = new mongoose.Schema({
  name: String,
  image: String,
  featured: { type: Boolean, default: false }  
});
const Category = mongoose.model('Category', categorySchema);
app.post('/api/categories', uploadCategory.single('image'), async (req, res) => {
  try {
    const category = new Category({
      name: req.body.name,
      image: req.file ? `/uploads/categories/${req.file.filename}` : '',
      featured: req.body.featured === 'true'
    });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/featured-categories', async (req, res) => {
  try {
    const featured = await Category.find({ featured: true });
    res.status(200).json(featured);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/categories/:id', async (req, res) => {
  try {
    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      { featured: req.body.featured === 'true' },
      { new: true }
    );
    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/categories/:name', async (req, res) => {
  try {
    const category = await Category.findOne({ name: req.params.name });
    if (!category) return res.status(404).json({ error: "Category not found" });

    const products = await Product.find({ category: category._id });
    res.json({ category, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/categories/by-id/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    res.json({ name: category.name });
  } catch (err) {
    res.status(500).json({ message: 'Server error while fetching category' });
  }
});
const subCategorySchema = new mongoose.Schema({
  name: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, 
  types: [String], 
  featured:{type: Boolean, default:false}, 
  image:{type:String, default:""}
});
const SubCategory = mongoose.model('SubCategory', subCategorySchema);
app.post('/api/subcategories', uploadSubCategory.single('image'), async (req, res) => {
  try {
    const { name, categoryId, types, featured } = req.body;

    const subCategory = new SubCategory({
      name,
      category: categoryId,
      types: JSON.parse(types),  // Pass as '["Anarkali", "Straight"]' from frontend/Postman
      featured: featured === 'true',
      image: req.file ? `/uploads/subcategories/${req.file.filename}` : ''
    });

    await subCategory.save();
    res.status(201).json({ message: 'SubCategory created with types', subCategory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/subcategories/:categoryId', async (req, res) => {
  try {
    const subcategories = await SubCategory.find({ category: req.params.categoryId });
    res.status(200).json(subcategories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/featured-subcategories', async (req, res) => {
  try {
    const subcategories = await SubCategory.find({ featured: true });
    res.status(200).json(subcategories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/subcategory/by-id/:id', async (req, res) => {
  try {
    const objectId = new mongoose.Types.ObjectId(req.params.id);

    const subcategory = await SubCategory.findOne({ _id: objectId }).populate('category');

    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    res.json({
      name: subcategory.name,
      categoryName: subcategory.category?.name || ''
    });
  } catch (error) {
    console.error('Error fetching subcategory:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/api/subcategories', async (req, res) => {
  try {
    const subcategories = await SubCategory.find().populate('category', 'name');
    res.json(subcategories);
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});
app.get('/test-sub', async (req, res) => {
  const sub = await SubCategory.findOne().populate('category');
  res.json(sub);
});

app.get('/api/category-tree', async (req, res) => {
  try {
    const categories = await Category.find();
    const categoryTree = [];

    for (const cat of categories) {
      const subcategories = await SubCategory.find({ category: cat._id });

      categoryTree.push({
        _id: cat._id,
        name: cat.name,
        subcategories: subcategories.map(sub => ({
          _id: sub._id,
          name: sub.name,
          types: sub.types
        }))
      });
    }

    res.status(200).json(categoryTree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/subcategory/by-name/:name', async (req, res) => {
  try {
    const subcategory = await SubCategory.findOne({ name: req.params.name }).populate('category');
    
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    res.json({
      _id: subcategory._id,
      name: subcategory.name,
      categoryName: subcategory.category?.name || ''
    });
  } catch (error) {
    console.error('Error fetching subcategory by name:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});
const sellerSchema = new mongoose.Schema({
  // Basic Identity
  gstin: {
    type: String,
    unique: true,
    sparse: true,
    match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  },
  enrollmentId: {
    type: String,
    unique: true,
    sparse: true,
    match: /^[A-Z0-9]{15}$/,
  },

  // Future: Seller’s user account (optional if integrated with User model)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // Pickup Address
  pickupAddress: {
    fullName: String,
    phone: String,
    pincode: String,
    addressLine: String,
    city: String,
    state: String,
  },

  // Bank Details
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branch: String,
  },

  // Supplier Details
  companyName: String,
   email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,

  },
  phone: String,
  password: {type:String, required:false,minlength:6},

  usertype: {
    type: String,
    default: 'seller',
    enum: ['seller']
  },

  // Status Flags
  isGstVerified: { type: Boolean, default: false },
  isEnrolmentVerified: { type: Boolean, default: false },
  isPickupAdded: { type: Boolean, default: false },
  isBankDetailsAdded: { type: Boolean, default: false },
  isApprovedSeller: { type: Boolean, default: false },

  // Timestamp
  createdAt: { type: Date, default: Date.now },
});
const Seller=mongoose.model('Seller',sellerSchema,'Seller')


// POST /api/seller/verify
app.post('/api/sellerverify', async (req, res) => {
  try {
    let { gstin, enrollmentId } = req.body;

    gstin = gstin?.trim();
    enrollmentId = enrollmentId?.trim();

    if (!gstin && !enrollmentId) {
      return res.status(400).json({ error: 'Please provide GSTIN or Enrolment ID.' });
    }

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const enrollRegex = /^[A-Z0-9]{15}$/;

    if (gstin && !gstRegex.test(gstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format.' });
    }
    if (enrollmentId && !enrollRegex.test(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid Enrolment ID format.' });
    }

    const existing = await Seller.findOne({
      $or: [
        gstin ? { gstin } : null,
        enrollmentId ? { enrollmentId } : null
      ].filter(Boolean)
    });

    if (existing) {
      return res.status(409).json({ error: 'This GSTIN or Enrolment ID is already registered.' });
    }

    const newSeller = new Seller({
      gstin: gstin || undefined,
      enrollmentId: enrollmentId || undefined,
      isGstVerified: !!gstin,
      isEnrolmentVerified: !!enrollmentId,
    });

    await newSeller.save();
    return res.status(201).json({ message: 'Verification successful.', sellerId: newSeller._id });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});


// Update Pickup Address
app.put('/api/seller/pickup-address/:id', async (req, res) => {
  const { id } = req.params;
  const {
    fullName,
    phone,
    pincode,
    addressLine,
    city,
    state,
  } = req.body;

  // Basic Validation
  if (!fullName || !phone || !pincode || !addressLine || !city || !state) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
      if (!/^\d{6}$/.test(pincode)) {
  return res.status(400).json({ error: 'Invalid pincode format.' });
}

if (!/^\d{10}$/.test(phone)) {
  return res.status(400).json({ error: 'Invalid phone number format.' });
}

  try {
    const updatedSeller = await Seller.findByIdAndUpdate(
      id,
      {
        pickupAddress: { fullName, phone, pincode, addressLine, city, state },
        isPickupAdded: true,
      },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    res.status(200).json({ message: 'Pickup address updated successfully.' });
  } catch (error) {
    console.error('Error updating pickup address:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
app.put('/api/seller/bank-details/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { accountHolderName, accountNumber, ifscCode, bankName, branch } = req.body;

    // Validate required fields
    if (!accountHolderName || !accountNumber || !ifscCode || !bankName || !branch) {
      return res.status(400).json({ error: 'All bank details are required.' });
    }

    // Validate IFSC code format
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return res.status(400).json({ error: 'Invalid IFSC Code format.' });
    }

    // Update seller document
    const updatedSeller = await Seller.findByIdAndUpdate(
      sellerId,
      {
        bankDetails: {
          accountHolderName,
          accountNumber,
          ifscCode,
          bankName,
          branch,
        },
        isBankDetailsAdded: true,
      },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    res.json({ message: 'Bank details saved successfully.' });
  } catch (error) {
    console.error('Bank details update error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
app.put('/api/seller/supplier-details/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { companyName, email, phone, password } = req.body;

    // Validate required fields
    if (!companyName || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Check if email already exists for another seller
    const emailExists = await Seller.findOne({ email, _id: { $ne: sellerId } });
    if (emailExists) {
      return res.status(409).json({ error: 'Email already in use.' });
    }

    // Hash password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update seller
    const updatedSeller = await Seller.findByIdAndUpdate(
      sellerId,
      {
        companyName,
        email,
        phone,
        password: hashedPassword,
      },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    res.json({ message: 'Supplier details saved successfully.' });
  } catch (err) {
    console.error('Supplier details error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});
app.post('/api/seller/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check presence
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find seller by email
    const seller = await Seller.findOne({ email });
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found. Please register first.' });
    }

    // ✅ Check if seller is approved by admin
    if (!seller.isApprovedSeller) {
      return res.status(403).json({
        error: 'Your account is pending admin approval. Please wait until approved.',
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, seller.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Generate JWT
    const token = jwt.sign({ id: seller._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: 'Login successful',
      token,
      seller: {
        _id: seller._id,
        email: seller.email,
        companyName: seller.companyName,
        usertype: 'seller',
        sellername: seller.pickupAddress?.fullName || seller.companyName || 'Seller'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/seller/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    const sellerId = req.seller._id;
     const seller = await Seller.findById(sellerId);

    // 1. Count products and low stock
    const products = await Product.find({ seller: sellerId });
    const productCount = products.length;
    const lowStockCount = products.filter(p => p.stock <= 5).length;

    // 2. Get orders where this seller has at least one product
    const orders = await Order.find({ "products.sellerId": sellerId });

    // 3. Filter only this seller's products inside each order
    let totalSales = 0;
    orders.forEach(order => {
      order.products.forEach(prod => {
        if (prod.sellerId?.toString() === sellerId.toString()) {
          totalSales += prod.price * prod.quantity;
        }
      });
    });

    const commission = totalSales * 0.1; // assume 10% commission

    res.json({
      sellerName: seller.companyName,
      products: productCount,
      orders: orders.length,
      sales: totalSales,
      commission: commission,
      lowStock: lowStockCount
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// app.get('/api/seller/products', async (req, res) => {
//   try {

//     const products = await Product.find().populate('category','name').populate('subcategory','name').sort({createdAt:-1}); 
     

//     res.status(200).json(products);
//   } catch (err) {
//     console.error('Error fetching seller products:', err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });
const brandTagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory', default: null },
  type: { type: String, default: null },
});
const Brand= mongoose.model('Brand', brandTagSchema);
app.get('/api/brand-tag/:name', async (req, res) => {
  try {
    const tag = await Brand.findOne({ name: req.params.name });
    if (!tag) return res.status(404).json({ message: 'Brand tag not found' });
    res.json(tag);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
const ratingSchema = new mongoose.Schema({
  userPhone: { type: String, required: true },
  stars: { type: Number, required: true },
  review: { type: String },
  ratedAt: { type: Date, default: Date.now }
}, { _id: false }); // Optional: disable _id for subdocs

const productSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  description: { type: String, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory', required: true },
  type: { type: String, required: true },
  sizes: [String],
  colors: [String],
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  stock: { type: Number, default: 1 },
  gender: { type: String, enum: ['men', 'women', 'kids', 'unisex'], default: 'unisex' },
  images: [String],
  thumbnail: { type: String },
  tags: [String],
  brand: { type: String, default: 'No Brand' },
  specifications: { type: Map, of: String },
 ratings: [ratingSchema],
averageRating: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false }, 
  commissionRate: { type: Number, default: 10 },
   seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  }
}, {
  timestamps: true // ✅ This enables `createdAt` and `updatedAt`
});


const Product = mongoose.model('Product', productSchema);
app.post(
  '/api/products',
  authMiddleware, 
  uploadProduct.fields([
    { name: 'images', maxCount: 5 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        subcategory,
        type,
        sizes,
        colors,
        price,
        discountPrice,
        stock,
        gender, 
        tags,
        brand,
        specifications,
        isFeatured,
        isTrending, 
      } = req.body;

      // Validate required fields
      if (!title || !category || !subcategory || !type || !price) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // ✅ Validate type belongs to subcategory
      const subCat = await SubCategory.findById(subcategory);
      if (!subCat || !subCat.types.includes(type)) {
        return res.status(400).json({ error: 'Invalid subcategory or type' });
      }

      // ✅ Handle images
     const imageFiles = req.files['images'] || [];
const thumbnailFile = req.files['thumbnail']?.[0];

// ⛔ Check limits
if (imageFiles.length > 5) {
  return res.status(400).json({ error: 'You can upload a maximum of 5 product images' });
}
if (req.files['thumbnail'] && req.files['thumbnail'].length > 1) {
  return res.status(400).json({ error: 'Only one thumbnail image is allowed' });
}

const imagePaths = imageFiles.map(file => `/uploads/products/${file.filename}`);
const thumbnailPath = thumbnailFile ? `/uploads/products/${thumbnailFile.filename}` : '';
      const baseSlug = slugify(title, { lower: true });
const existing = await Product.findOne({ slug: baseSlug });
const uniqueSlug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

      // ✅ Create Product
      const product = new Product({
  title,
  slug: uniqueSlug,
  description,
  category,
  subcategory,
  type,
  sizes: sizes ? JSON.parse(sizes) : ['Free Size'],
  colors: JSON.parse(colors || '[]'),
  price,
  discountPrice,
  stock,
  gender, 
  images: imagePaths,
  thumbnail: thumbnailPath,
  tags: JSON.parse(tags || '[]'),
  brand: brand || 'No Brand',
  specifications: specifications ? JSON.parse(specifications) : {},
  isFeatured,
  isTrending, 
  seller: req.seller._id
});

      await product.save();
      res.status(201).json({ message: 'Product uploaded successfully', product });
    } catch (error) {
      console.error('Error uploading product:', error);
      res.status(500).json({ error: 'Server error while uploading product' });
    }
  }
);
app.get('/api/products', async (req, res) => {
  try {
    const {
      gender,
      categoryId,
      subcategoryId,
      type,
      priceRange,
      sort
    } = req.query;

    const filter = {};

    if (gender) filter.gender = gender;
   if (categoryId) {
  filter.category = { $in: Array.isArray(categoryId) ? categoryId : [categoryId] };
}
    if (subcategoryId) {
  filter.subcategory = { $in: Array.isArray(subcategoryId) ? subcategoryId : [subcategoryId] };
}
    if (type) filter.type = type;

    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      filter.price = { $gte: min, $lte: max };
    }

    // ✅ Other sorting
    let sortOption = {};
    switch (sort) {
      case 'priceLow':
        sortOption.discountPrice = 1;
        break;
      case 'priceHigh':
        sortOption.discountPrice = -1;
        break;
      case 'new':
        sortOption.createdAt = -1;
        break;
      case 'rating':
        sortOption.ratings = -1;
        break;
      default:
        sortOption.createdAt = -1;
    }

   const products = await Product.find(filter)
  .populate('seller', 'companyName email phone') // or just 'companyName'
  .sort(sortOption);
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
app.get('/api/products/by-id/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate({
        path: 'subcategory',
        populate: { path: 'category' }  // populate category inside subcategory
      })
      .populate('seller','companyName email phone')
       

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // extract breadcrumb info
    let categoryId = '';
    let categoryName = '';
    let subcategoryId = '';
    let subcategoryName = '';

    if (product.subcategory) {
      subcategoryId = product.subcategory._id;
      subcategoryName = product.subcategory.name;
      if (product.subcategory.category) {
        categoryId = product.subcategory.category._id;
        categoryName = product.subcategory.category.name;
      }
    } else if (product.category) {
      categoryId = product.category;
    }

    res.status(200).json({
      ...product.toObject(),
      breadcrumb: {
        categoryId,
        categoryName,
        subcategoryId,
        subcategoryName,
        type: product.type || ''
      }
    });
  } catch (err) {
    console.error('Error fetching product:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});
app.post('/api/products/by-ids', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid product IDs' });
    }

    const products = await Product.find({ _id: { $in: ids } });

    // Create a map for quick lookup by id
    const productMap = {};
    products.forEach(p => {
      productMap[p._id.toString()] = p;
    });

    // Reorder products to match the ids order
    const orderedProducts = ids
      .map(id => productMap[id])
      .filter(p => p !== undefined); // Filter out missing products if any

    res.status(200).json(orderedProducts);
  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.put(
  '/api/products/:id',
  authMiddleware,
  uploadProduct.fields([
    { name: 'images', maxCount: 5 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const productId = req.params.id;
       const existingProduct = await Product.findOne({ _id: productId, seller: req.seller._id });
      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const {
        title,
        description,
        category,
        subcategory,
        type,
        sizes,
        colors,
        price,
        discountPrice,
        stock,
        gender,
        tags,
        brand,
        specifications,
        isFeatured,
        isTrending,
      } = req.body;

      // Optional slug update
      if (title && title !== existingProduct.title) {
        const baseSlug = slugify(title, { lower: true });
        const existingSlug = await Product.findOne({ slug: baseSlug });
        existingProduct.slug = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;
      }

      // Update other fields
      existingProduct.title = title ?? existingProduct.title;
      existingProduct.description = description ?? existingProduct.description;
      existingProduct.category = category ?? existingProduct.category;
      existingProduct.subcategory = subcategory ?? existingProduct.subcategory;
      existingProduct.type = type ?? existingProduct.type;
      existingProduct.sizes = sizes?.trim()
  ? JSON.parse(sizes)
  : existingProduct.colors;
      existingProduct.colors = colors?.trim()
  ? JSON.parse(colors)
  : existingProduct.colors;
      existingProduct.price = price ?? existingProduct.price;
      existingProduct.discountPrice = discountPrice ?? existingProduct.discountPrice;
      existingProduct.stock = stock ?? existingProduct.stock;
      existingProduct.gender = gender ?? existingProduct.gender;
     existingProduct.tags = tags?.trim()
  ? JSON.parse(tags)
  : existingProduct.colors;
      existingProduct.brand = brand ?? existingProduct.brand;
      existingProduct.specifications = specifications
        ? JSON.parse(specifications)
        : existingProduct.specifications;
      existingProduct.isFeatured = isFeatured ?? existingProduct.isFeatured;
      existingProduct.isTrending = isTrending ?? existingProduct.isTrending;

      // ✅ Optional file updates
      const imageFiles = req.files['images'] || [];
      const thumbnailFile = req.files['thumbnail']?.[0];

      if (imageFiles.length > 0) {
        existingProduct.images = imageFiles.map(file => `/uploads/products/${file.filename}`);
      }

      if (thumbnailFile) {
        existingProduct.thumbnail = `/uploads/products/${thumbnailFile.filename}`;
      }

      await existingProduct.save();
      res.json({ message: 'Product updated successfully', product: existingProduct });
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Server error while updating product' });
    }
  }
);
app.get('/api/seller/products', authMiddleware, async (req, res) => {
  try {
    const sellerId = req.seller._id;
    const { category, subcategory, type } = req.query;

    const query = { seller: sellerId };

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
   if (type) {
  query.type = { $regex: new RegExp(`^${type}$`, 'i') }; // case-insensitive exact match
}

    const products = await Product.find(query);
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Failed to fetch seller products" });
  }
});
app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;

    // 1. Find the product with seller ownership check
    const product = await Product.findOne({ _id: productId, seller: req.seller._id });
    if (!product) return res.status(404).json({ error: 'Product not found or unauthorized' });

    // 2. Delete thumbnail
    if (product.thumbnail) {
      const thumbRelativePath = product.thumbnail.replace('/uploads/', '');
      const thumbPath = path.join(uploadDir, thumbRelativePath);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }
    }

    // 3. Delete images
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        const imgRelativePath = img.replace('/uploads/', '');
        const imgPath = path.join(uploadDir, imgRelativePath);
        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
        }
      }
    }

    // 4. Delete the product from DB
    await Product.findByIdAndDelete(productId);

    res.json({ message: 'Product deleted successfully' });

  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Server error while deleting product' });
  }
});

app.post('/api/products/bulk-upload', authMiddleware, uploadProduct.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const sellerId = req.seller._id;
    const allowedGenders = ['men', 'women', 'kids', 'unisex'];
    const ext = path.extname(filePath).toLowerCase();

    let products = [];

    if (ext === '.csv') {
      products = await csv().fromFile(filePath);
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      products = XLSX.utils.sheet_to_json(worksheet);
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file format. Only CSV or Excel files allowed.' });
    }

    const formattedProducts = [];

    for (const p of products) {
      let parsedSpecs = {};
      try {
        parsedSpecs = p.specifications ? JSON.parse(p.specifications) : {};
      } catch (err) {
        console.log('Invalid specifications JSON:', p.specifications);
      }

      const categoryDoc = await Category.findOne({ name: p.category?.trim() });
      const subcategoryDoc = await SubCategory.findOne({ name: p.subcategory?.trim() });

      if (!categoryDoc || !subcategoryDoc) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          error: `Invalid category or subcategory for product: ${p.title}`,
        });
      }

      const rawGender = (p.gender || 'unisex').toLowerCase();
      const validGender = allowedGenders.includes(rawGender) ? rawGender : 'unisex';

      const title = p.title?.trim() || 'product';
      const generatedSlug = slugify(`${title}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, {
        lower: true,
        strict: true,
      });

      formattedProducts.push({
        seller: sellerId,
        title: title,
        slug: generatedSlug,
        description: p.description || '',
        category: categoryDoc._id,
        subcategory: subcategoryDoc._id,
        type: p.type || '',
        sizes: p.sizes ? p.sizes.split(',').map(s => s.trim()) : [],
        colors: p.colors ? p.colors.split(',').map(c => c.trim()) : [],
        price: Number(p.price),
        discountPrice: p.discountPrice ? Number(p.discountPrice) : undefined,
        stock: Number(p.stock) || 1,
        gender: validGender,
        tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
        brand: p.brand || '',
        specifications: parsedSpecs,
        isFeatured: p.isFeatured === 'true',
        isTrending: p.isTrending === 'true',
        thumbnail: p.thumbnail || '',
        images: p.images
          ? p.images.split(',').map(img => img.trim()).filter(img => img.length > 0)
          : [],
      });
    }

    await Product.insertMany(formattedProducts);
    fs.unlinkSync(filePath);

    res.status(200).json({ message: 'Bulk products uploaded successfully.' });

  } catch (error) {
    console.error('Bulk upload error:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload bulk products.' });
  }
});
app.get('/api/seller/product-detail', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.query;
    const sellerId = req.seller._id;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const product = await Product.findOne({ _id: productId, seller: sellerId })
      .populate('category', 'name')
      .populate('subcategory', 'name')
     .populate('seller', 'companyName')

    if (!product) {
      return res.status(404).json({ error: 'Product not found or unauthorized' });
    }

    res.json(product);
  } catch (err) {
    console.error('Error fetching product detail:', err);
    res.status(500).json({ error: 'Server error' });
  }
});









const cartSchema = new mongoose.Schema({ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, image: String, name: String, originalPrice: Number, quantity: Number, totalcost: Number, phone: {type: String, required: true }}, { versionKey: false });
const cartModel = mongoose.model("Cart", cartSchema, "Cart");
app.post('/api/addtocart', async (req, res) => {
  const { phone, productId, name, originalPrice, quantity, image } = req.body;

  if (!phone || !productId || !name || !originalPrice || !quantity) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const totalcost = originalPrice * quantity;

    // Check if the product is already in cart
    const existing = await cartModel.findOne({ phone, productId });

    if (existing) {
      // Update quantity and totalcost
      existing.quantity += quantity;
      existing.totalcost = existing.originalPrice * existing.quantity;
      await existing.save();
      return res.json({ success: true, message: "Cart updated", cartItem: existing });
    } else {
      const newItem = new cartModel({
        phone,
        productId,
        name,
        originalPrice,
        quantity,
        totalcost,
        image
      });
      await newItem.save();
      return res.json({ success: true, message: "Item added to cart", cartItem: newItem });
    }
  } catch (err) {
    console.error("Error adding to cart:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
app.get('/api/fetchcart/:phone', async (req, res) => {
  const { phone } = req.params;

  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }

  try {
    // Fetch cart with populated product details
    const cartItems = await cartModel.find({ phone }).populate('productId');

    if (!cartItems || cartItems.length === 0) {
      return res.json({ success: false, cartdata: [] });
    }

    // Format response to include necessary product fields
    const formattedCart = cartItems.map(item => {
      const product = item.productId;
      const price = product?.price || 0;
      const discountPrice = product?.discountPrice || null;
      const finalPrice = discountPrice || price;

      return {
        _id: item._id,
        productId: product?._id,
        quantity: item.quantity,
        totalcost: item.quantity * finalPrice,
        name: product?.title,
        image: product?.thumbnail || product?.images?.[0] || '/default.jpg',
        price,
        discountPrice,
        discountPercent: discountPrice
          ? Math.round(((price - discountPrice) / price) * 100)
          : 0
      };
    });

    return res.json({ success: true, cartdata: formattedCart });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
app.delete('/api/removefromcart/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const removed = await cartModel.findByIdAndDelete(id);
    if (!removed) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }
    return res.json({ success: true, message: "Item removed from cart" });
  } catch (err) {
    console.error("Error removing item:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
const addressSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: { type: String, required: true },
  houseNo: String,
  roadName: String,
  area: String,
  pincode: String,
  city: String,
  state: String,
  nearby: String,
}, { timestamps: true });

const addressModel = mongoose.model("Address", addressSchema, "Address");

// ✅ Create new address (allow multiple)
app.post('/api/saveaddress', async (req, res) => {
  const { phone, name, houseNo, roadName, area, pincode, city, state, nearby } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const newAddress = new addressModel({ phone, name, houseNo, roadName, area, pincode, city, state, nearby });
    await newAddress.save();
    return res.json({ success: true, message: "Address saved", address: newAddress });
  } catch (err) {
    console.error("Error saving address:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Get all addresses for a phone
app.get('/api/getaddress/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const addresses = await addressModel.find({ phone });

    if (addresses.length === 0) {
      return res.status(404).json({ success: false, message: "No addresses found" });
    }

    res.status(200).json({ success: true, addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Update address by ID
app.put('/api/updateaddress/:id', async (req, res) => {
  try {
    const updated = await addressModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }
    res.json({ success: true, address: updated });
  } catch (err) {
    console.error("Error updating address:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.delete('/api/clearcart/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    await cartModel.deleteMany({ phone });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});
app.get("/api/getprodsbyname", async (req, res) => {
  try {
    const searchtext = req.query.q;
    const result = await Product.find({
      title: { $regex: '.*' + searchtext + '.*', $options: 'i' },
    });
    if (result.length > 0) {
      res.send({ success: true, pdata: result });
    } else {
      res.send({ success: false });
    }
  } catch (e) {
    res.send({ success: false, errormessage: e.message });
  }
});
app.get('/api/search-suggestions', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const suggestions = await Product.find({
      title: { $regex: `^${q}`, $options: 'i' }
    })
      .limit(7)
      .select('title -_id');

    res.json(suggestions.map(s => s.title));
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userPhone: { type: String, required: true },

  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      name: String,
      image: String,
      quantity: Number,
      price: Number,
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }, 
    }
  ],

  paymentMethod: { type: String, required: true, default:"Cash on Delivery" },
  totalAmount: { type: Number, required: true },
  promoDiscount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },

  orderStatus: { type: String, default: 'Pending' },
  orderedAt: { type: Date, default: Date.now }
}, { versionKey: false });
const Order = mongoose.model('Order', orderSchema);
app.post('/api/place-order', async (req, res) => {
  try {
    const { phone, promoDiscount, paymentMethod, products, totalAmount } = req.body;

    if (!phone || !products || products.length === 0) {
      return res.status(400).json({ success: false, message: "Missing order data" });
    }
    for (const p of products) {
  const dbProduct = await Product.findById(p.productId);
  if (!dbProduct || dbProduct.stock < p.quantity) {
    return res.status(400).json({
      success: false,
      message: `Insufficient stock for product: ${p.name}`
    });
  }
}

    const finalAmount = Math.max(totalAmount - promoDiscount, 0);

    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const orderProducts = await Promise.all(products.map(async (p) => {
  const dbProduct = await Product.findById(p.productId).select('seller');
  return {
    productId: p.productId,
    name: p.name,
    image: p.image,
    quantity: p.quantity,
    price: p.price,
    sellerId: dbProduct?.seller || null
  };
}));

    const newOrder = new Order({
      orderId,
      userPhone: phone,
      products: orderProducts,
      paymentMethod,
      totalAmount,
      promoDiscount,
      finalAmount
    });

    await newOrder.save();
    for (const p of products) {
  await Product.findByIdAndUpdate(
    p.productId,
    { $inc: { stock: -p.quantity } }, // reduce stock
    { new: true }
  );
}

    return res.json({
  success: true,
  message: "Order placed successfully",
  orderId,
  finalAmount,
  promoDiscount,
  totalAmount
});

  } catch (err) {
    console.error("Order error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
app.get('/api/seller/orders', authMiddleware, async (req, res) => {
  try {
    const sellerId = req.seller._id; // Comes from authMiddleware

    const orders = await Order.find({
      "products.sellerId": sellerId,
    }).sort({ orderedAt: -1 }); // latest orders first

    // Optional: filter only matching products per seller
    const filteredOrders = orders.map(order => ({
      ...order.toObject(),
      products: order.products.filter(p => p.sellerId?.toString() === sellerId.toString())
    }));

    return res.json({ success: true, orders: filteredOrders });
  } catch (err) {
    console.error("Error fetching seller orders:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
app.put('/api/seller/order-status', authMiddleware, async (req, res) => {
  try {
    const { orderId, newStatus } = req.body;

    const order = await Order.findOne({ orderId });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Only update products of this seller (optional safety step)
    const sellerId = req.seller._id.toString();
    order.products = order.products.map(p => {
      if (p.sellerId?.toString() === sellerId) {
        return { ...p };
      }
      return p;
    });

    order.orderStatus = newStatus;
    await order.save();

    return res.json({ success: true, message: 'Order status updated' });
  } catch (err) {
    console.error('Order update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.get('/api/user/orders', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: "Phone number is required" });

    const orders = await Order.find({ userPhone: phone }).sort({ orderedAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error('User order fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.post('/api/user/rate-product', userAuthMiddleware, async (req, res) => {
  const { productId, stars, review } = req.body;
  const userPhone = req.user.phone;

  // Basic input validation
  if (!productId || !stars || isNaN(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Valid productId and rating (1-5) required' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Defensive check: ratings array must exist
   if (!Array.isArray(product.ratings)) {
  product.ratings = [];
} else {
  // Filter out any non-object junk like numbers or nulls
  product.ratings = product.ratings.filter(r => typeof r === 'object' && r !== null && !Array.isArray(r));
}
const existingRating = product.ratings.find(r => r.userPhone === userPhone);

    // Build a clean, validated rating object
    const newRating = {
      userPhone: String(userPhone),
      stars: Number(stars),
      review: String(review || ''),
      ratedAt: new Date()
    };

    if (existingRating) {
      // Update existing rating
      existingRating.stars = newRating.stars;
      existingRating.review = newRating.review;
      existingRating.ratedAt = newRating.ratedAt;
    } else {
      // ✅ Push only a valid rating object
      product.ratings.push(newRating);
    }

    // Recalculate average rating
    const totalStars = product.ratings.reduce((sum, r) => sum + Number(r.stars || 0), 0);
    const avgRating = product.ratings.length > 0 ? totalStars / product.ratings.length : 0;

    product.averageRating = parseFloat(avgRating.toFixed(2));

    // Optional: log before saving for debugging
    console.log("Final product.ratings:", product.ratings);

    await product.save();
    res.json({ success: true, message: 'Rating submitted successfully' });

  } catch (err) {
    console.error('Rating error:', err);
    res.status(500).json({ error: 'Failed to rate product' });
  }
});
const adminSchema = new mongoose.Schema({
  name: String,
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Admin = mongoose.model('Admin', adminSchema);
app.post('/api/adminregister', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) return res.status(400).json({ error: 'Admin already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ name, email, password: hashedPassword });

    await newAdmin.save();
    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/api/adminlogin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: 'Admin not found' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res.json({
      token,
      admin: { _id: admin._id, name: admin.name, email: admin.email },
      message: 'Admin login successful',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
app.patch('/api/admin/approve-seller/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isApprovedSeller } = req.body;

    const updatedSeller = await Seller.findByIdAndUpdate(
      id,
      { isApprovedSeller },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    res.json({ message: isApprovedSeller ? 'Seller approved' : 'Access revoked' });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});
app.get('/api/admin/sellers', async (req, res) => {
  try {
    const sellers = await Seller.find({}, '-password')  // exclude password field
      .sort({ createdAt: -1 }); // newest first
    res.status(200).json(sellers);
  } catch (err) {
    console.error('Error fetching sellers:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});
app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Delete product images if needed (optional, like you do for sellers)

    await Product.findByIdAndDelete(productId);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Admin delete error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});
// PATCH /api/admin/product/commission/:id
app.patch('/api/admin/product/commission/:id', async (req, res) => {
  try {
    const { commissionRate } = req.body;
    if (typeof commissionRate !== 'number') {
      return res.status(400).json({ error: 'Invalid commission rate' });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { commissionRate },
      { new: true }
    );

    res.json({ message: 'Commission updated successfully', product });
  } catch (err) {
    console.error('Commission update error:', err);
    res.status(500).json({ error: 'Failed to update commission' });
  }
});
// Route: /api/admin/category-full-summary
app.get('/api/admin/category-product-summary', async (req, res) => {
  try {
    const summary = await Category.aggregate([
      {
        $lookup: {
          from: 'subcategories',
          localField: '_id',
          foreignField: 'category',
          as: 'subcategories'
        }
      },
      { $unwind: { path: '$subcategories', preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: '$subcategories.types',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'products',
          let: {
            categoryId: '$_id',
            subcategoryId: '$subcategories._id',
            typeName: '$subcategories.types'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$category', '$$categoryId'] },
                    { $eq: ['$subcategory', '$$subcategoryId'] },
                    { $eq: ['$type', '$$typeName'] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: 'Seller',
                localField: 'seller',
                foreignField: '_id',
                as: 'sellerDetails'
              }
            },
            {
              $unwind: {
                path: '$sellerDetails',
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                _id: 1,
                sellerName: {
                  $ifNull: ['$sellerDetails.companyName', 'Unknown Seller']
                }
              }
            }
          ],
          as: 'matchedProducts'
        }
      },
      {
        $addFields: {
          uniqueSellers: {
            $setUnion: ['$matchedProducts.sellerName', []]
          }
        }
      },
      {
        $project: {
          category: '$name',
          subcategory: '$subcategories.name',
          type: '$subcategories.types',
          productCount: { $size: '$matchedProducts' },
          sellers: '$uniqueSellers'
        }
      },
      {
        $sort: {
          category: 1,
          subcategory: 1,
          type: 1
        }
      }
    ]);

    res.json(summary);
  } catch (err) {
    console.error('Error in category summary:', err);
    res.status(500).json({ error: 'Failed to fetch category product summary' });
  }
});












// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
