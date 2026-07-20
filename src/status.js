/**
 * Booking Status'
 */

 const BOOKING_STATUS = {
    NEW: 0,
    COMPLETED: 1,
    CANCELLED: 2,
    ON_GOING: 3,
    CONFIRMED: 4,
    LAPSED: 5,
    UPDATED_TO_NEW: 6,
    CANCELLED_MANUALLY: 7,
    INCONCLUSIVE: 8,
    DRAFT:9,
    CANCELLED_DRAFT:10,
    TEMP_BOOKING:11
}

const BOOKING_STATUS_DESC = [
    {
        code: BOOKING_STATUS.COMPLETED,
        name: 'Completed',
        color:'#045c14'
        
    },
    {
        code: BOOKING_STATUS.ON_GOING,
        name: 'On Going',
        color:'#fcba03'
    },
    {
        code: BOOKING_STATUS.INCONCLUSIVE,
        name: 'Inconclusive',
        color:'#3d3935'
    },
    {
        code: BOOKING_STATUS.CONFIRMED,
        name: 'Confirmed',
        color:'#ABB131'
    },
    {
        code: BOOKING_STATUS.LAPSED,
        name: 'Lapsed',
        color:'#3c3d35'

    },
    {
        code: BOOKING_STATUS.CANCELLED_MANUALLY,
        name: 'Cancelled Manually',
        color:'#a7a7c4'
    },
    {
        code: BOOKING_STATUS.UPDATED_TO_NEW,
        name: 'Updated to new',
        color:'#76f5e8'
    },
    {
        code: BOOKING_STATUS.CANCELLED,
        name: 'Cancelled (Payment failed)',
        color:'#a7a7c4'
    },
    {
        code: BOOKING_STATUS.NEW,
        name: 'Payment not initiated',
        color:'#717575'
    },
    {
        code: BOOKING_STATUS.DRAFT,
        name: 'Draft',
        color:'#717575'
    },
    {
        code: BOOKING_STATUS.CANCELLED_DRAFT,
        name: 'Draft',
        color:'#717575'
    }
];

/**
 * Booking Payment Status'
 */
const BOOKING_PAYMENT_STATUS = {
    INITIATED: 0,
    SUCCEEDED: 1,
    CANCELLED: 2,
    FAILED: 3,
    MANUAL: 4,
    NOT_REQUIRED: 5,
    PENDING:6
}

const BOOKING_PAYMENT_STATUS_DESC = [
    {
        code: BOOKING_PAYMENT_STATUS.INITIATED,
        name: "Initiated",
        color:"#c42018"
    },
    {
        code: BOOKING_PAYMENT_STATUS.SUCCEEDED,
        name: "Paid",
        color:'#045c14'

    },
    {
        code: BOOKING_PAYMENT_STATUS.CANCELLED,
        name: "Cancelled",
        color:'#a7a7c4'
    },
    {
        code: BOOKING_PAYMENT_STATUS.FAILED,
        name: "Failed",
        color:'#3c3d35'
    },
    {
        code: BOOKING_PAYMENT_STATUS.MANUAL,
        name: "Manual",
        color:'#ABB131'
    },
    {
        code: BOOKING_PAYMENT_STATUS.NOT_REQUIRED,
        name: "Not required",
        color:'#717575'
    },
    {
        code: BOOKING_PAYMENT_STATUS.PENDING,
        name: "Payment Pending",
        color:'#c42018'
    },
]

/**
 * Booking Tip Payment Status'
 */
const BOOKING_TIP_PAYMENT_STATUS = {
    INITIATED: 0,
    SUCCEEDED: 1,
    CANCELLED: 2,
    FAILED: 3
}

const BOOKING_TIP_PAYMENT_STATUS_DESC = [
    {
        code: BOOKING_TIP_PAYMENT_STATUS.INITIATED,
        name: "Initiated"
    },
    {
        code: BOOKING_TIP_PAYMENT_STATUS.SUCCEEDED,
        name: "Succeeded"
    },
    {
        code: BOOKING_TIP_PAYMENT_STATUS.CANCELLED,
        name: "Cancelled"
    },
    {
        code: BOOKING_TIP_PAYMENT_STATUS.FAILED,
        name: "Failed"
    }
]

/**
 * Booking Product Status'
 */

const BOOKING_PRODUCT_STATUS = {
    NOT_STARTED: 0,
    ON_GOING: 1,
    COMPLETED: 2,
    CANCELLED: 3,
    LAPSED: 4,
    STAFF_CHECKED_IN: 5,
    CANCELLED_MANUALLY: 6,
    INCONCLUSIVE: 7,
}

const BOOKING_PRODUCT_STATUS_DESC = [
    {
        code: BOOKING_PRODUCT_STATUS.NOT_STARTED,
        name: "Not Started"
    },
    {
        code: BOOKING_PRODUCT_STATUS.ON_GOING,
        name: "On Going"
    },
    {
        code: BOOKING_PRODUCT_STATUS.COMPLETED,
        name: "Completed"
    },
    {
        code: BOOKING_PRODUCT_STATUS.CANCELLED,
        name: "Cancelled"
    },
    {
        code: BOOKING_PRODUCT_STATUS.LAPSED,
        name: "Lapsed"
    },
    {
        code: BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN,
        name: "Staff Checked-In"
    },
    {
        code: BOOKING_PRODUCT_STATUS.CANCELLED_MANUALLY,
        name: "Cancelled Manually"
    },
    {
        code: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
        name: "Inconclusive"
    },
];

/**
 * Booking Product Add-on Status'
 */

const BOOKING_PRODUCT_ADD_ON_STATUS = {
    NOT_STARTED: 0,
    ON_GOING: 1,
    COMPLETED: 2,
    CANCELLED: 3,
    LAPSED: 4,
    CANCELLED_MANUALLY: 5,
}

const BOOKING_PRODUCT_ADD_ON_STATUS_DESC = [
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.NOT_STARTED,
        name: "Not Started"
    },
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.ON_GOING,
        name: "On Going"
    },
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.COMPLETED,
        name: "Completed"
    },
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.CANCELLED,
        name: "Cancelled"
    },
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.LAPSED,
        name: "Lapsed"
    },
    {
        code: BOOKING_PRODUCT_ADD_ON_STATUS.CANCELLED_MANUALLY,
        name: "Cancelled Manually"
    },
];

/**
 * Staff status
 */
const STAFF_STATUS = {
    AVAILABLE: 0,
    CHECKED_IN: 1,
    IN_TREATMENT: 2,
    LATE: 3,
}

const STAFF_STATUS_DESC = [
    {
        code: STAFF_STATUS.AVAILABLE,
        name: "Available"
    },
    {
        code: STAFF_STATUS.CHECKED_IN,
        name: "Checked In"
    },
    {
        code: STAFF_STATUS.IN_TREATMENT,
        name: "In Treatment"
    },
    {
        code: STAFF_STATUS.LATE,
        name: "Late"
    },
];

/**
 * Bookings not allowed to cancel
 */
const BOOKING_NOT_ALLOWED_TO_CANCEL = [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.ON_GOING,
    BOOKING_STATUS.LAPSED,
    BOOKING_STATUS.UPDATED_TO_NEW,
    BOOKING_STATUS.CANCELLED_MANUALLY,
    BOOKING_STATUS.DRAFT
];

/**
 * Vacation status
 */

const VACATION_STATUS = {
    NEW: 0,
    ACCEPTED: 1,
    REJECTED: 2,
    RETREATED: 3
};

const VACATION_STATUS_DESC = [
    {
        code: VACATION_STATUS.NEW,
        name: "New",
    },
    {
        code: VACATION_STATUS.ACCEPTED,
        name: "Accepted",
    },
    {
        code: VACATION_STATUS.REJECTED,
        name: "Rejected",
    },
    {
        code: VACATION_STATUS.RETREATED,
        name: "Retreated",
    },
];

const DISPATCH_STATUS = {
    READY_TO_DISPATCH: 0,
    DISPATCHED: 1,
    ACCEPTED: 2,
    REJECTED: 3
}

const ADDON_REQUEST_STATUS = {
    PENDING: 0,
    ACCEPTED: 1,
    REJECTED: 2,
    NOT_ACCEPTABLE: 3  // because staff no more available
}

const ADDON_PAYMENTS_STATUS = {
    INITIATED: 0,
    SUCCEEDED: 1,
    CANCELLED: 2,
    FAILED: 3
}
const BOOKING_BUSINESS_TYPE = {
    B2B: 0,
    B2C: 1,
}
const PROMO_STATUS = {
    TEMP: 0,
    CONFIRMED:1,
}

module.exports = {
    BOOKING_STATUS,
    BOOKING_STATUS_DESC,
    BOOKING_PRODUCT_STATUS,
    BOOKING_PRODUCT_STATUS_DESC,
    BOOKING_PRODUCT_ADD_ON_STATUS,
    BOOKING_PRODUCT_ADD_ON_STATUS_DESC,
    BOOKING_PAYMENT_STATUS,
    BOOKING_PAYMENT_STATUS_DESC,
    BOOKING_TIP_PAYMENT_STATUS,
    BOOKING_TIP_PAYMENT_STATUS_DESC,
    BOOKING_NOT_ALLOWED_TO_CANCEL,
    STAFF_STATUS,
    STAFF_STATUS_DESC,
    VACATION_STATUS,
    VACATION_STATUS_DESC,
    DISPATCH_STATUS,
    ADDON_REQUEST_STATUS,
    ADDON_PAYMENTS_STATUS,
    BOOKING_BUSINESS_TYPE,
    PROMO_STATUS

}