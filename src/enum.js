const PROMO_CODE_CLASS = {
    CMS: 0,
    AUTO_GENERATED: 1,
};

const PROMO_CODE_CLASS_DESC = [
    {
        code: PROMO_CODE_CLASS.CMS,
        name: "CMS",
    },
    {
        code: PROMO_CODE_CLASS.AUTO_GENERATED,
        name: "Auto generated",
    },
];

const BOOKING_NOTIFICATION = {
    NOT_NOTIFIED: 0,
    FULL_DAY_NOTIFIED: 1,
    // HALF_HOUR_NOTIFIED: 2,
    THREE_HOUR_NOTIFIED: 2,
};

const VACATION_TEMPLATE = {
    FULL_DAY: 0,
    CUSTOM_TIMING: 1,
};

const VACATION_TEMPLATE_DESC = [
    {
        code: VACATION_TEMPLATE.FULL_DAY,
        name: "Full day",
    },
    {
        code: VACATION_TEMPLATE.CUSTOM_TIMING,
        name: "Custom timing",
    },
];

const THERAPIST_PREF = {
    MALE: 0,
    FEMALE: 1,
    EITHER: 2
}
const PREFERRED_LANGUAGE = {
    ENGLISH: 0,
    DUTCH: 1,
}

const TRANSLATION_LANGUAGE = {
    ENGLISH: 1,
    DUTCH: 2,
}

const CLIENT_SOURCE = {
    WALKIN:0,
    CLIENT_REFERRAL:1,
    WEBSITE_BOOKING_FORM:2,
    APP:3,
    VIP:4,
    SM:5
}

const MESSAGE_USER_FILTER = {
    // 1. Users who have not booked
    USER_NOT_BOOKED: 0,
    // 2. Users who have not booked in XX days
    USER_NOT_BOOKED_IN_XX_DAYS: 1,
    // 3. Users who have booked XXX category in last XX days
    USER_BOOKED_YY_CATEGORY_IN_XX_DAYS: 2,
    // 4. Users who have not booked XXX category in the last XX days
    USER_NOT_BOOKED_YY_CATEGORY_IN_XX_DAYS: 3,
}

const MESSAGE_TYPE = {
    USER: 0,
    STAFF: 1,
    ALL: 2,
    USER_FILTERED: 3,
    GUEST: 4
}

const SHOW_OUTSIDE_OFFERS = {
    NOT_SHOW: 0,
    SHOW: 1
}

const AUTO_ACCEPT_ADDON_REQUEST = {
    DO_NOT_ACCEPT: 0,
    ACCEPT: 1
}

const REGISTERED_FROM = {
    CMS: 0,
    APP: 1,
}

const STAFF_SCHEDULE_TYPE = {
    GENERAL_OFFER: 0,
    INSTANT_CONFIRMATION: 1,
    BLOCK_TIME: 2
}

const GLOBAL_DISPATCH_SETTING = {
    AUTOMATIC_DISPATCH: 0,
    MANUAL_DISPATCH: 1,
    INSTANT_CONFIRMATION_AUTOMATIC: 0,
    INSTANT_CONFIRMATION_MANUAL: 1,
    FILTER_NOT_APPLIED: 0,
    FILTER_APPLIED: 1
}

const PRODUCT_DISPATCH_TYPE = {
    DIRECT_ASSIGNMENT: 0,
    AUTOMATIC_DISPATCH: 1,
    MANUAL_DISPATCH: 2,
}

const ENUM_DISPATCH_FILTERS = {
    GROUP: { Id: 1, Name: "Group" },
    RANK: { Id: 2, Name: "Rank" },
    AVAILABILITY: { Id: 3, Name: "Availability" }
}

const ADMIN_UNFILL_NOTIFICATION = {
    NOT_NOTIFIED: 0,
    THREE_HOUR: 1,
    SIX_HOUR: 2,
    TWELVE_HOUR: 3,
    NINETY_MIN: 4,
    SIXTY_MIN: 5,
    FORTY_FIVE_MIN: 6
}

const APP_PLATFORM = {
    ANDROID: {
        Code: 0,
        Label: "android"
    },
    IOS: {
        Code: 1,
        Label: "ios"
    }
}

const APPLICATION_TYPE = {
    USER: 0,
    AMBASSADOR: 1
}

const SYSTEM_PHASE = {
    PHASE_ONE: 1,
    PHASE_TWO: 2
}

const MESSAGE_TAG = {
    NORMAL: 0,
    IMPORTANT: 1
}

const SOS_CONTACT_TYPE = {
    SMS: 0,
    CALL: 1
}

const DELETE_ENUM = {
    NOT_DELETED: 0,
    DELETED: 1
}

const BOOKING_LIST_TAB = {
    UNFILLED: 0,
    FILLED: 1,
    ON_GOING: 2,
    COMPLETED: 3,
    OTHERS: 4,
    DRAFTS: 5,
    ALL:6
}

const API_CLIENT = {
    USER_APP: process.env.API_CLIENT_COCON_APP,
    THERAPIST_APP: process.env.API_CLIENT_COCON_THERAPIST,
    CMS: process.env.API_CLIENT_COCON_CMS
}

const BOOKING_PROVIDER = {
    USER_APP: 0,
    CMS: 1
}

const BOOKING_LIST_FILTERS = {
    BOOKING_META: {
        KEY: "BookingMeta",
        VALUES: {
            FROM_APP: 0,
            FROM_CMS: 1,
            CONFLICT: 2
        }
    },
    BOOKING_STATUS:  {
        KEY: "BookingStatus"
    },
    BOOKING_DATE:  {
        KEY: "BookingDate"
    }
}

const USER_LIST_FILTERS = {
    GENDER: {
        KEY: "Gender",
        VALUES: {
            MALE: 0,
            FEMALE: 1
        }
    },
    APP_SIGNED_UP: {
        KEY: "AppSignedUp",
        VALUES: {
            APP_USED: 0,
            CMS_ONLY: 1
        }
    }
}

const PROMOCODE_LIST_FILTERS = {
    CODE_GEN_TYPE: {
        KEY: "codeGenerationType",
        VALUES: {
            CMS_GENERATED: 0,
            AUTO_GENERATED: 1
        }
    },
    VALUE_TYPE: {
        KEY: "valueType",
        VALUES: {
            PERCENTAGE: 0,
            DISCOUNT: 1
        }
    },
    PROMO_TYPE: {
        KEY: "promoType",
        VALUES: {
            BOOKING: 0,
            CATEGORY: 1
        } 
    },
    STARTDATE:  {
        KEY: "startDate"
    },
    ENDDATE:  {
        KEY: "endDate"
    }
}

const LOCATION_REQUEST_FILTERS = {
    ADDRESS_FILTER: {
        KEY: "addressStatus",
        VALUES: {
            GOT_IN_SERVICE_AREA: 0,
            OUT_OF_SERVICE_AREA: 1,
            UNKOWN_DISTANCE: 2,
        }
    },
    DATEFILTER:  {
        KEY: "dateRange"
    }
}


const STAFF_FILTERS = {
    GENDER: {
        KEY: "gender",
        VALUES: {
            MALE: 0,
            FEMALE: 1,
        }
    },
    SPECIALITY: {
        KEY: 'speciality'
        // Value will be dynamic based on category id 
    }
}

const MESSAGE_FILTERS = {
    TYPE: {
        KEY: "messageType",
        VALUES: {
            USER: 0,
            STAFF: 1,
            ALL: 2,
            GUEST: 3,
        }
    },
    DATEFILTER:  {
        KEY: "dateRange"
    }
}


const BINARY = {
    TRUE: 1,
    FALSE: 0
}

const RESPONSE_CODE = {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500
}
const LOG_ACTION_TYPE = {
    CREATE: 0,
    UPDATE: 1,
    DELETE: 2,
    LOGIN:3,
    LOGOUT:4
}
const ADMIN_TYPE = {
    SuperAdmin: 0,
    Agent: 1,
    Organisation: 2,
}

module.exports = {
    PROMO_CODE_CLASS,
    PROMO_CODE_CLASS_DESC,
    VACATION_TEMPLATE,
    VACATION_TEMPLATE_DESC,
    THERAPIST_PREF,
    BOOKING_NOTIFICATION,
    MESSAGE_USER_FILTER,
    MESSAGE_TYPE,
    SHOW_OUTSIDE_OFFERS,
    AUTO_ACCEPT_ADDON_REQUEST,
    REGISTERED_FROM,
    STAFF_SCHEDULE_TYPE,
    GLOBAL_DISPATCH_SETTING,
    PRODUCT_DISPATCH_TYPE,
    ENUM_DISPATCH_FILTERS,
    ADMIN_UNFILL_NOTIFICATION,
    APP_PLATFORM,
    APPLICATION_TYPE,
    SYSTEM_PHASE,
    MESSAGE_TAG,
    SOS_CONTACT_TYPE,
    DELETE_ENUM,
    BOOKING_LIST_TAB,
    API_CLIENT,
    BOOKING_LIST_FILTERS,
    BOOKING_PROVIDER,
    BINARY,
    USER_LIST_FILTERS,
    RESPONSE_CODE,
    PROMOCODE_LIST_FILTERS,
    LOCATION_REQUEST_FILTERS,
    STAFF_FILTERS,
    MESSAGE_FILTERS,
    PREFERRED_LANGUAGE,
    CLIENT_SOURCE,
    TRANSLATION_LANGUAGE,
    LOG_ACTION_TYPE,
    ADMIN_TYPE
}