export const validateCreateProduct = (req, res, next) => {
  const {
    productName,
    price,
    expiryDate,
    quantity,
    category,
    discount,
    imgUrl,
    vendorId,
  } = req.body;
  const categoriesEnum = ["bakery", "dairy", "snacks"];

  // 1. التأكد من وجود الحقول الإجبارية (ضفنا vendorId)
  if (
    !productName ||
    !price ||
    !expiryDate ||
    quantity === undefined ||
    !category ||
    !imgUrl
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  // 2. فحص طول اسم المنتج (عشان يطابق الموديل)
  if (productName.trim().length < 3 || productName.trim().length > 50) {
    return res.status(400).json({
      success: false,
      message: "Product name must be between 3 and 50 characters",
    });
  }

  // 3. فحص التصنيف (Category)
  if (!categoriesEnum.includes(category)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid category" });
  }

  // 4. فحص السعر والكمية (Types and Values)
  if (typeof price !== "number" || price <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Price must be a positive number" });
  }

  if (typeof quantity !== "number" || quantity < 0) {
    return res
      .status(400)
      .json({ success: false, message: "Quantity cannot be negative" });
  }

  // 5. فحص التاريخ (المنتج لازم يكون لسه منتهىش)
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime()) || expiry <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "Expiry date must be a valid future date",
    });
  }

  // 6. فحص الخصم (لو موجود)
  if (discount !== undefined) {
    if (typeof discount !== "number" || discount < 0 || discount > price) {
      return res.status(400).json({
        success: false,
        message: "Invalid discount value (cannot exceed price)",
      });
    }
  }

  next();
};
