export const validateCreateProduct = (req, res, next) => {
  const {
    productName,
    price,
    expiryDate,
    quantity,
    category,
    discount,
    imgUrl,
    isDeliverable,
  } = req.body;

  const categoriesEnum = ["bakery", "dairy", "snacks"];

  const daysToSubtractBeforeExpiry = {
    bakery: 7,
    dairy: 10,
    snacks: 30,
  };

  // 1. Required fields
  const requiredFields = [
    "productName",
    "price",
    "expiryDate",
    "quantity",
    "category",
    "imgUrl",
    "isDeliverable",
  ];

  for (const field of requiredFields) {
    if (req.body[field] === undefined || req.body[field] === null) {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
      });
    }
  }

  // 2. productName validation
  if (typeof productName !== "string") {
    return res.status(400).json({
      success: false,
      message: "Product name must be a string",
    });
  }

  const trimmedName = productName.trim();

  if (trimmedName.length < 3 || trimmedName.length > 50) {
    return res.status(400).json({
      success: false,
      message: "Product name must be between 3 and 50 characters",
    });
  }

  if (/^\d+$/.test(trimmedName)) {
    return res.status(400).json({
      success: false,
      message: "Product name cannot contain only numbers",
    });
  }

  // 3. category validation
  if (typeof category !== "string" || !categoriesEnum.includes(category)) {
    return res.status(400).json({
      success: false,
      message: `Category must be one of: ${categoriesEnum.join(", ")}`,
    });
  }

  // 4. BUSINESS RULE (category vs expiry window)
  const today = new Date();
  const expiry = new Date(expiryDate);

  const minAllowedDate = new Date(expiry);
  minAllowedDate.setDate(
    minAllowedDate.getDate() - daysToSubtractBeforeExpiry[category],
  );

  if (minAllowedDate < today) {
    return res.status(400).json({
      success: false,
      message: `This ${category} product is too close to expiry to be accepted`,
    });
  }

  // 5. expiryDate validation
  if (isNaN(expiry.getTime()) || expiry <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "Expiry date must be a valid future date",
    });
  }

  // 6. price validation
  if (typeof price !== "number" || price <= 0) {
    return res.status(400).json({
      success: false,
      message: "Price must be a positive number",
    });
  }

  // 7. quantity validation
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be a positive integer",
    });
  }

  // 8. discount validation
  if (discount !== undefined) {
    if (typeof discount !== "number" || discount < 0 || discount > price) {
      return res.status(400).json({
        success: false,
        message: "Discount must be between 0 and the product price",
      });
    }
  }

  // 9. imgUrl validation
  if (typeof imgUrl !== "string" || imgUrl.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Image URL must be a valid string",
    });
  }

  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(imgUrl)) {
    return res.status(400).json({
      success: false,
      message: "Image URL must be a valid URL",
    });
  }

  // 10. isDeliverable validation
  if (typeof isDeliverable !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isDeliverable must be true or false",
    });
  }

  // 11. vendorId from auth (NOT BODY)
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: user not found",
    });
  }

  req.body.vendorId = req.user.id;

  next();
};
