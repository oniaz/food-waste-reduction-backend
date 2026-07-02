import AppError from "../../utils/AppError.js";
import * as ordersRepo from "./orders.repository.js";

// ── Order Summary ─────────────────────────────────────────────────────────────

/**
 * Computes a pricing summary for a plain order object (after .toObject()).
 * Attaches the summary onto the order and returns it.
 */
export function attachOrderSummary(order) {
    let totalPriceBeforeDiscount = 0;
    let totalDiscount = 0;

    order.products.forEach((item) => {
        const quantity = item.quantity || 0;
        const populatedPrice = item.productId?.price;
        const basePrice = populatedPrice != null
            ? Number(populatedPrice) + Number(item.productId?.commission || 0)
            : Number(item.priceAtPurchase || 0);
        const itemDiscount = populatedPrice != null
            ? Number(item.productId?.discount || 0) * Number(populatedPrice) * 0.01
            : 0;

        totalPriceBeforeDiscount += basePrice * quantity;
        totalDiscount += itemDiscount * quantity;
    });

    const finalPrice = totalPriceBeforeDiscount - totalDiscount;

    // Attach computed values back to the order object root level
    order.summary = {
        totalPriceBeforeDiscount,
        totalDiscount,
        finalPrice: finalPrice < 0 ? 0 : finalPrice, // Ensure it doesn't drop below zero
    };

    return order;
}

/**
 * Rebuilds safe product objects for order responses using live products when available.
 */
export function hydrateOrderProducts(order, productDocs = []) {
    const productMap = new Map(
        productDocs.map((productDoc) => [productDoc._id.toString(), productDoc.toObject()])
    );

    order.products = order.products.map((item) => {
        const productId = item.productId?.toString?.() || item.productRefId || null;
        const liveProduct = productId ? productMap.get(productId) : null;

        if (liveProduct) {
            return {
                ...item,
                productId: liveProduct,
            };
        }

        return {
            ...item,
            productId: {
                _id: productId,
                productName: item.productName || "Deleted product",
                price: item.priceAtPurchase,
                commission: 0,
                discount: 0,
            },
        };
    });

    return order;
}

// ── Status Filter Helper ──────────────────────────────────────────────────────

/**
 * Parses and sanitizes a status query string into a filter object.
 * Guards against frontend string serialization bugs ('undefined', 'all').
 */
export function buildStatusFilter(baseFilter, incomingStatus) {
    const queryFilter = { ...baseFilter };

    if (
        incomingStatus &&
        typeof incomingStatus === "string" &&
        incomingStatus.trim() !== "" &&
        incomingStatus !== "undefined" && // Guardrail against frontend string serialization bugs
        incomingStatus !== "all" // Guardrail if frontend uses 'all' for resetting filters
    ) {
        queryFilter.status = incomingStatus.trim().toLowerCase();
    }

    return queryFilter;
}

// ── Order Creation ────────────────────────────────────────────────────────────

/**
 * Verifies each cart item (product exists, vendor is active, quantity is valid),
 * computes the server-side price snapshot, saves the order, and decrements stock.
 */
export async function createOrderForCustomer(customerId, products, shippingAddress, paymentMethod) {
    if (!shippingAddress) {
        const customer = await ordersRepo.findCustomerById(customerId);
        const { detailedAddress, neighborhood, city, governorate } = customer.address;
        if (!detailedAddress || !neighborhood || !city || !governorate) {
            throw new AppError(
                "Your profile address is incomplete. Please provide a full shipping address.",
                400
            );
        }
        shippingAddress = `${detailedAddress}, district:${neighborhood}, city: ${city},governorate: ${governorate}`;
    }

    if (!paymentMethod) {
        paymentMethod = "cash_on_delivery";
    }

    //must verify price from products collection and calculate total price here before creating order
    const verifiedProductsList = [];
    for (const item of products) {
        const product = await ordersRepo.findProductByIdWithVendorAuth(item.productId);
        if (!product) {
            throw new AppError(`Product with ID ${item.productId} not found`, 404);
        }
        if (product.vendorId?.authId?.accountStatus !== "active") {
            throw new AppError(
                `Product ${product.productName} is currently unavailable because the vendor shop is inactive`,
                400
            );
        }
        if (item.quantity < 1 || item.quantity > product.quantity) {
            throw new AppError(`Invalid quantity for product ID ${item.productId}`, 400);
        }

        const finalCustomerPrice =
            product.price +
            (product.commission || 0) -
            (product.discount || 0) * product.price * 0.01;

        verifiedProductsList.push({
            productId: item.productId,
            productRefId: item.productId.toString(),
            productName: product.productName,
            vendorId: product.vendorId?._id || product.vendorId, //added to match schema edit
            quantity: item.quantity,
            priceAtPurchase: parseFloat(Math.max(0, finalCustomerPrice).toFixed(2)),
            isCommissioned: false,
        });
    }

    //create order
    const order = await ordersRepo.createOrder({
        customerId,
        products: verifiedProductsList,
        shippingAddress,
        paymentMethod,
        status: "pending",
    });

    //Update Inventory
    for (const item of verifiedProductsList) {
        await ordersRepo.decrementProductStock(item.productId, item.quantity); // Decrements stock count natively in MongoDB
    }

    return order;
}

// ── Customer Orders ───────────────────────────────────────────────────────────

/**
 * Returns paginated orders for a customer, with summaries attached.
 */
export async function getCustomerOrders(customerId, incomingStatus, page, limit) {
    const queryFilter = buildStatusFilter({ customerId }, incomingStatus);
    const skip = (page - 1) * limit;

    const totalOrders = await ordersRepo.countOrdersByFilter(queryFilter);
    const rawOrders = await ordersRepo.findOrdersByFilterWithCustomerPopulate(
        queryFilter,
        skip,
        limit
    );

    const productIds = [...new Set(
        rawOrders.flatMap((orderDoc) =>
            orderDoc.products.map((item) => item.productId?.toString?.()).filter(Boolean)
        )
    )];
    const liveProducts = productIds.length > 0 ? await ordersRepo.findProductsByIds(productIds) : [];

    // 2. Map through orders to calculate summary pricing totals
    const orders = rawOrders.map((orderDoc) => {
        // Convert Mongoose Document to raw JS object so we can append custom properties safely
        const order = orderDoc.toObject();
        return attachOrderSummary(hydrateOrderProducts(order, liveProducts));
    });

    return { orders, totalOrders };
}

// ── Vendor Orders ─────────────────────────────────────────────────────────────

/**
 * Returns paginated orders that contain at least one product belonging to the vendor.
 */
export async function getOrdersForVendor(vendorId, incomingStatus, page, limit) {
    const skip = (page - 1) * limit;

    const queryFilter = buildStatusFilter(
        { "products.vendorId": vendorId },
        incomingStatus
    );

    const totalOrders = await ordersRepo.countOrdersByFilter(queryFilter);
    const rawOrders = await ordersRepo.findOrdersByFilter(
        queryFilter,
        skip,
        limit
    );

    const productIds = [...new Set(
        rawOrders.flatMap((orderDoc) =>
            orderDoc.products.map((item) => item.productId?.toString?.()).filter(Boolean)
        )
    )];
    const liveProducts = productIds.length > 0 ? await ordersRepo.findProductsByIds(productIds) : [];

    const orders = rawOrders.map((orderDoc) => {
        const order = orderDoc.toObject();
        return hydrateOrderProducts(order, liveProducts);
    });

    return { orders, totalOrders };
}

// ── Order Detail ──────────────────────────────────────────────────────────────

/**
 * Fetches a single order with full population, verifies access, and attaches summary.
 */
export async function getOrderDetails(orderId, currentUserId, currentUserRole) {
    const orderDoc = await ordersRepo.findOrderByIdPopulatedForDetail(orderId);
    if (!orderDoc) throw new AppError("Order not found", 404);

    const orderProductIds = orderDoc.products
        .map((item) => item.productId?.toString?.())
        .filter(Boolean);
    const liveProducts = orderProductIds.length > 0
        ? await ordersRepo.findProductsByIds(orderProductIds)
        : [];

    // --- MULTI-ROLE SECURITY GUARDRAIL ---
    const isAdmin = currentUserRole === "admin";
    const orderCustomerStrId = orderDoc.customerId?._id
        ? orderDoc.customerId._id.toString()
        : orderDoc.customerId?.toString();
    const isCustomerOwner =
        currentUserRole === "customer" && orderCustomerStrId === currentUserId;

    const isVendorInvolved =
        currentUserRole === "vendor" &&
        orderDoc.products.some((item) => {
            const vendorRef = item.vendorId || item.productId?.vendorId;
            if (!vendorRef) return false;

            const vendorStrId =
                typeof vendorRef === "object" && "_id" in vendorRef
                    ? vendorRef._id.toString()
                    : vendorRef.toString();

            return vendorStrId === currentUserId;
        });

    if (!isAdmin && !isCustomerOwner && !isVendorInvolved) {
        throw new AppError("Forbidden: You do not have permission to view this order", 403);
    }

    // Convert the single document safely into a plain object
    const order = orderDoc.toObject();
    return attachOrderSummary(hydrateOrderProducts(order, liveProducts));
}

// ── Order Cancellation ────────────────────────────────────────────────────────

/**
 * Cancels an order and restocks all product quantities atomically.
 */
export async function cancelOrderById(orderId, customerId) {
    const order = await ordersRepo.findOrderById(orderId);
    if (!order) throw new AppError("Order not found", 404);

    if (order.customerId?.toString() !== customerId) {
        throw new AppError("Forbidden: You do not have permission to cancel this order", 403);
    }

    if (order.status !== "pending" && order.status !== "ready") {
        throw new AppError(
            `Cannot cancel order. Order is currently '${order.status}' and cannot be altered.`,
            400
        );
    }

    const updatedOrder = await ordersRepo.findAndUpdateOrderStatus(orderId, "cancelled");

    // When an order is cancelled, we need to restock the products in that order by incrementing their stock counts back up by the quantities in the cancelled order. We can use bulkWrite for efficient batch updates.
    await ordersRepo.bulkRestockProducts(order.products);
    //.bulkWrite() takes an array of update operations and executes
    // them directly on the database server in a single network request packet.
    //this prevents the overhead of multiple round-trip queries that would occur if we updated each product sequentially in a loop, which is especially beneficial when there are many products to update.

    return updatedOrder.toObject ? updatedOrder.toObject() : updatedOrder;
}

// ── Status Update ─────────────────────────────────────────────────────────────

/**
 * Updates order status with side-effect handling:
 * - 'completed': awards customer loyalty points + increments vendor moneyOwed via bulkWrite
 * - 'abandoned': restocks all product quantities via bulkWrite
 */
export async function updateOrderStatusById(orderId, status, currentUserId, currentUserRole) {
    const validStatuses = ["ready", "completed", "pending", "abandoned"];

    // 'cancelled' is intentionally excluded — it has its own dedicated endpoint
    if (status === "cancelled") {
        throw new AppError("Use the cancel endpoint to cancel orders", 400);
    }
    if (!validStatuses.includes(status)) {
        throw new AppError("Invalid or missing status value", 400);
    }

    const order = await ordersRepo.findOrderById(orderId);
    if (!order) throw new AppError("Order not found", 404);

    //Add 'abandoned' to the state lock guardrail so finalized orders remain immutable
    if (["cancelled", "completed", "abandoned"].includes(order.status)) {
        throw new AppError(
            `Cannot update status. This order has already been finalized as '${order.status}'.`,
            400
        );
    }

    const isVendorInvolved =
        currentUserRole === "admin" ||
        order.products.some((item) => item.vendorId?.toString() === currentUserId);

    if (!isVendorInvolved) {
        throw new AppError(
            "Forbidden: You can only update status of orders that contain your products",
            403
        );
    }

    // 1. Process Status-Specific Side Effects BEFORE completing the request
    if (status === "completed") {
        // CUSTOMER LOYALTY POINTS
        let totalPrice = 0;
        for (let i = 0; i < order.products.length; i++) {
            totalPrice += order.products[i].priceAtPurchase * order.products[i].quantity;
        }

        const pointsToAward = Math.floor(totalPrice * 0.01);
        if (pointsToAward > 0) {
            await ordersRepo.incrementCustomerLoyaltyPoints(order.customerId, pointsToAward);
        }

        // VENDOR COMMISSION (BULK WRITE)
        const vendorSalesMap = {};
        order.products.forEach((item) => {
            const vId = item.vendorId?.toString();
            if (vId) {
                const itemTotal = item.priceAtPurchase * item.quantity;
                vendorSalesMap[vId] = (vendorSalesMap[vId] || 0) + itemTotal;
            }
        });

        await ordersRepo.bulkIncrementVendorMoneyOwed(vendorSalesMap);
    }

    if (status === "abandoned") {
        // Revert inventory levels cleanly for every item on the order invoice
        await ordersRepo.bulkRestockProducts(order.products);
    }

    // 2. Perform the update step after all logical hooks pass successfully
    const updatedOrder = await ordersRepo.findAndUpdateOrderStatus(orderId, status);

    // 3. Single clean response point serving all statuses consistently
    const message =
        status === "abandoned"
            ? "Order marked as abandoned and inventory returned successfully"
            : `Order status updated to '${status}' successfully`;

    return { order: updatedOrder.toObject ? updatedOrder.toObject() : updatedOrder, message };
}

// ── Rating ────────────────────────────────────────────────────────────────────

/**
 * Submits a star rating for a completed order.
 * Updates all involved vendors via a single bulkWrite.
 */
export async function rateCompletedOrder(orderId, customerId, rating) {
    const order = await ordersRepo.findOrderByIdPopulatedForRating(orderId);
    if (!order) throw new AppError("Order not found", 404);

    //Check if the user is the owner of the product
    if (order.customerId?.toString() !== customerId) {
        throw new AppError("Forbidden: You do not have permission to rate this order", 403);
    }

    // State-Lock Guardrail
    if (order.status !== "completed") {
        throw new AppError(
            `Cannot rate order. Only completed orders can be rated, but this order is currently '${order.status}'.`,
            400
        );
    }

    //Duplicate Prevention Guardrail ///will be edited if we edit schema
    if (order.toObject().isRated === true) {
        throw new AppError("You have already submitted a rating for this order", 400);
    }

    //Deduplicate Vendor IDs using Spread and Set
    const vendorIdsInOrder = [
        ...new Set(
            order.products
                .map(
                    (item) =>
                        item.vendorId?._id?.toString() ||
                        item.vendorId?.toString() ||
                        item.productId?.vendorId?._id?.toString() ||
                        item.productId?.vendorId?.toString()
                )
                .filter((id) => id) // Remove any undefined values safely
        ),
    ];

    if (vendorIdsInOrder.length === 0) {
        throw new AppError("No associated vendors found for this order", 404);
    }

    await ordersRepo.bulkIncrementVendorRatings(vendorIdsInOrder, rating);

    //Mutate the order document dynamically to mark it as rated
    const updatedOrder = await ordersRepo.markOrderRated(orderId);

    return updatedOrder.toObject ? updatedOrder.toObject() : updatedOrder;
}