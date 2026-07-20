const { verifyAccessToken } = require("./authorize")
const { v4: uuidv4 } = require('uuid');
const { con } = require("../db");
const { Headers } = require("../header");
const zone = require("../zone");
const STRIPE_SECRET = process.env.STRIPE_SECRET;
const CURRENCY_CODE = process.env.CURRENCY_CODE;
const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
const moment = require('moment');
const momentz = require("moment-timezone");
// const aws = require('aws-sdk');
const nodemailer = require('nodemailer');
const compareVersions = require('compare-versions');
const {performance} = require('perf_hooks')
const {organisations} = require("./organisations");


const {
    BOOKINGS,
    BOOKING_EXTRA,
    BOOKING_PRODUCTS,
    BOOKING_PRODUCT_EXTRA,
    BOOKING_PRODUCT_ADDONS,
    BOOKING_TIPS,
    GUESTS,
    RATINGS,
    USERS,
    USER_MESSAGES,
    STAFF,
    ADDONS,
    PRODUCT_DURATIONS,
    PRODUCTS,
    BOOKING_ADDON_PAYMENTS,
    STAFF_MESSAGES,
    PROMOCODES,
    PROMOCODE_CATEGORIES,
    BOOKING_PREFERENCE,
    DISPATCH_FILTERS,
    BOOKING_PRODUCT_DISPATCH,
    STAFF_GROUP,
    STAFF_METADATA,
    STAFF_PRODUCT,
    ADMIN_NOTIFICATION_CONTACT,
    SPECIAL_REQUEST,
    BOOKING_SPECIAL_REQUEST,
    BOOKING_INVOICE_DATA,
    ORGANISATION,
    ORGANISATION_LOCATION,
    SERVICE_ZIPCODE,
    CATEGORY_HOURLY_RATE,
    BOOKING_PRODUCT_APPLIED_RATE
} = require("../tables");
const { checkHeaders, validateEmail, InitializeFirebase, InitializeFirebaseTherapist, getInstanceURL, getPayloadData, setPayloadData, getLambdaNameByInstance } = require("../util");
const { staffCheck, staffDaySchedule, getTodayVacation, getTodayBookingEvents, getStaffDayScheduleByType, getAmountForTreatment, getRateForTreatment } = require("./staff");
const {
    BOOKING_STATUS,
    BOOKING_STATUS_DESC,
    BOOKING_PRODUCT_STATUS,
    BOOKING_PRODUCT_STATUS_DESC,
    BOOKING_PRODUCT_ADD_ON_STATUS,
    BOOKING_PAYMENT_STATUS,
    BOOKING_PAYMENT_STATUS_DESC,
    BOOKING_TIP_PAYMENT_STATUS,
    BOOKING_TIP_PAYMENT_STATUS_DESC,
    STAFF_STATUS,
    BOOKING_NOT_ALLOWED_TO_CANCEL,
    DISPATCH_STATUS,
    ADDON_REQUEST_STATUS,
    ADDON_PAYMENTS_STATUS,
    BOOKING_BUSINESS_TYPE,
    PROMO_STATUS
} = require("../status");
const {
    VACATION_TEMPLATE,
    BOOKING_NOTIFICATION,
    GLOBAL_DISPATCH_SETTING,
    PRODUCT_DISPATCH_TYPE,
    STAFF_SCHEDULE_TYPE,
    ENUM_DISPATCH_FILTERS,
    ADMIN_UNFILL_NOTIFICATION,
    THERAPIST_PREF,
    SYSTEM_PHASE,
    MESSAGE_TAG,
    BOOKING_LIST_TAB,
    API_CLIENT,
    BOOKING_LIST_FILTERS,
    BOOKING_PROVIDER,
    BINARY,
    RESPONSE_CODE,
    PREFERRED_LANGUAGE,
    CLIENT_SOURCE,
    LOG_ACTION_TYPE
    
} = require("../enum");
const { MESSAGE, DATE_TIME_FORMAT, PUSH } = require("../strings");
// const currentZone = process.env.STAFF_ZONE;
// const STAFF_ZONE = momentz().tz(currentZone).format(DATE_TIME_FORMAT.Z);
let STAFF_ZONE;
const BUFFER_ADDON = parseInt(process.env.BUFFER_ADDON);
const LAPSED_WAIT_TIME = 5;
const CURRENCY = 'eur';

const { google } = require("googleapis");
const { product } = require("./product");
const { getDayTimesGOnIC } = require("./timeSlotNew");
const { OAuth2 } = google.auth;
const oAuth2Client = new OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET);
const { saveLog, } = require("../helpers/common.js");
oAuth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
});
const calendar = google.calendar({
    version: "v3",
    auth: oAuth2Client
})

const STATUS_WAIT_TIME = parseInt(process.env.STATUS_WAIT_TIME);  //minutes

const BOOKINGS_FOR_USER_APP = [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.ON_GOING,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.LAPSED,
    BOOKING_STATUS.CANCELLED_MANUALLY,
    BOOKING_STATUS.INCONCLUSIVE
];

const BOOKINGS_FOR_CMS = [
    BOOKING_STATUS.NEW,
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.ON_GOING,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.LAPSED,
    BOOKING_STATUS.UPDATED_TO_NEW,
    BOOKING_STATUS.CANCELLED_MANUALLY,
    BOOKING_STATUS.INCONCLUSIVE
];
let BOOKINGS_TO_CONSIDER_FOR_ORGANISATION = [
    BOOKING_STATUS.COMPLETED,
    BOOKING_STATUS.ON_GOING,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.CONFIRMED,
    BOOKING_STATUS.LAPSED,
    BOOKING_STATUS.CANCELLED_MANUALLY,
    BOOKING_STATUS.INCONCLUSIVE
]
let STAFF_CURRENT_SCHEDULE = [];

const API_CLIENT_COCON_APP = process.env.API_CLIENT_COCON_APP;
const API_CLIENT_COCON_THERAPIST = process.env.API_CLIENT_COCON_THERAPIST;
const API_CLIENT_COCON_CMS = process.env.API_CLIENT_COCON_CMS;

const twilioClient = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    {

        region: ""

    }
);

let AWS = require('aws-sdk');




AWS.config.region = 'us-east-2';





const BOOKING_SORT_KEYS = ["DateTime", "Duration", "PaidPrice"];

const CMS_OTHER_TAB_BOOKINGS = [
    BOOKING_STATUS.NEW,
    BOOKING_STATUS.CANCELLED,
    BOOKING_STATUS.LAPSED,
    BOOKING_STATUS.UPDATED_TO_NEW,
    BOOKING_STATUS.CANCELLED_MANUALLY,
    BOOKING_STATUS.INCONCLUSIVE
];

let searchItemCount = 0;

// Fetch all the bookings for particular user, if no user provided then fetch all bookings
module.exports.bookings = async (knex, userId, apiClient, {
    bookingTab,
    pagination,
    sort,
    filters,
    search,
    lastUpdated,
    currentIds,
    organisationLocationId,
    FromAdmin
}, showUpcoming) => {
    let bookingIds = [];
    if (apiClient === API_CLIENT.CMS) {
        console.log("bookingTab1",bookingTab)
        console.log("FromAdmin",FromAdmin)
        bookingIds = await findBookings(knex, apiClient, { bookingTab, pagination, sort, filters, search,organisationLocationId,FromAdmin });
    }
    console.log("bookingIds",bookingIds)
    // return
    try {
        let bookingsData = await knex
            .select(
                BOOKINGS + '.BookingId',
                BOOKINGS + '.BookingProvider',
                BOOKINGS + '.UserId as BookingUser',
                USERS + '.Name',
                BOOKINGS + '.Street',
                BOOKINGS + '.Floor',
                BOOKINGS + '.City',
                BOOKINGS + '.Zip',
                BOOKINGS + '.HouseNumber',
                BOOKINGS + '.Elevator',
                BOOKINGS + '.Amount',
                BOOKINGS + '.PromoCode',
                BOOKINGS + '.PromoAmount',
                BOOKINGS + '.PaidPrice',
                BOOKINGS + '.Duration',
                BOOKINGS + '.DateTime',
                BOOKINGS + '.PaymentStatus',
                BOOKINGS + '.PredecessorBookingId',
                BOOKINGS + '.SuccessorBookingId',
                BOOKINGS + '.LastUpdated',
                BOOKINGS + '.OrganisationLocationId',
                BOOKINGS + '.CancelBookingReason',
                BOOKINGS + '.CancelBookingNotes',
                BOOKINGS + '.BookedBy',
                BOOKINGS + '.FullAddress',
                BOOKINGS + '.InvoiceUrl',
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.ProductId',
                BOOKING_PRODUCTS + '.Product',
                BOOKING_PRODUCTS + '.UserId',
                BOOKING_PRODUCTS + '.GuestId',
                BOOKING_PRODUCTS + '.StaffVacConflict',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.DispatchType',
                STAFF + ".Name as ProductStaffName",
                BOOKINGS + '.Status',
                BOOKINGS + '.Created',
                RATINGS + '.EaseOfBooking',
                RATINGS + '.Professionalism',
                RATINGS + '.Experience',
                RATINGS + '.Quality',
                RATINGS + '.Value',
                RATINGS + '.Feedback',
                BOOKING_TIPS + ".TipAmount",
                BOOKING_TIPS + ".PaymentStatus as TipPaymentStatus",
                USERS + '.Archive',
                ORGANISATION_LOCATION + '.Name as OrganisationName'
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
            .leftJoin(STAFF, STAFF + '.StaffId', BOOKING_PRODUCTS + '.StaffId')
            .leftJoin(RATINGS, RATINGS + ".BookingId", BOOKINGS + '.BookingId')
            .leftJoin(BOOKING_TIPS, BOOKING_TIPS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', BOOKINGS + '.OrganisationLocationId')
            .modify(function (queryBuilder) {
                if (apiClient === API_CLIENT.USER_APP) {
                    if (userId) {
                        queryBuilder.where(BOOKINGS + ".UserId", "=", userId)
                        queryBuilder.whereIn(BOOKINGS + ".Status", BOOKINGS_FOR_USER_APP)
                        if (showUpcoming) {
                            queryBuilder.where(BOOKINGS + ".DateTime", ">", moment().toDate())
                        }
                    }
                    queryBuilder.orderBy(BOOKINGS + ".DateTime", "asc")
                } else {
                    // Called by CMS
                    queryBuilder.whereIn(BOOKINGS + ".BookingId", bookingIds);

                    if (lastUpdated && currentIds) {
                        //console.log("bookingIds")
                        // check for mismatched ids fetch to fetch those bookings as well
                        
                        var missedBookingIds = bookingIds.filter( function(n) { 
                            return !this.has(n) }, new Set(currentIds) 
                        );
                        queryBuilder.where(BOOKINGS + ".LastUpdated", ">", lastUpdated)
                        queryBuilder.orWhereIn(BOOKINGS + ".BookingId", missedBookingIds)
                    }
                    if (sort.Key && BOOKING_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(BOOKINGS + "." + sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(BOOKINGS + ".Created", "desc")
                    }
                }
                // if (userId) {
                //     queryBuilder.where(BOOKINGS + ".UserId", "=", userId)
                //     if(showUpcoming) {
                //         queryBuilder.where(BOOKINGS + ".DateTime", ">", moment().toDate())
                //     }
                //     // if (platform === 'ios' || platform === "android") {
                //     //     queryBuilder.andWhere(BOOKINGS + ".BookingProvider", "=", 0)
                //     // } else {
                //     //     queryBuilder.andWhere(BOOKINGS + ".BookingProvider", "=", 1)
                //     // }
                // }
            });
            console.log("bookingsData")
            // return
            // //console.log(bookingsData)
        let finalData = [];
        try{
            for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
                const booking = bookingsData[bookingInc];
                
                console.log(booking.BookingId)
                booking.StatusName = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name;
                
    
                const found = finalData.find(book => book.BookingId === booking.BookingId);
                // console.log("found")
                // console.log(found)
                if (!found) {
                    let ratings;
                    if (
                        !booking.EaseOfBooking ||
                        !booking.Professionalism ||
                        !booking.Experience ||
                        !booking.Quality ||
                        !booking.Value
                    ) {
                        ratings = null;
                    } else {
                        ratings = {
                            EaseOfBooking: booking.EaseOfBooking,
                            Professionalism: booking.Professionalism,
                            Experience: booking.Experience,
                            Quality: booking.Quality,
                            Value: booking.Value,
                            Feedback: booking.Feedback,
                        }
                    }
                    // console.log("ob pushe start")
                    let objToPush = {
                        BookingId: booking.BookingId,
                        BookingProvider: booking.BookingProvider,
                        UserId: booking.BookingUser,
                        UserName: booking.Name,
                        Street: booking.Street,
                        HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                        Floor: booking.Floor ? booking.Floor : null,
                        City: booking.City ? booking.City : null,
                        Zip: booking.Zip ? booking.Zip : null,
                        Elevator: booking.Elevator,
                        Amount: booking.Amount,
                        PromoCode: booking.PromoCode,
                        PromoAmount: booking.PromoAmount,
                        PaidPrice: booking.PaidPrice,
                        Duration: booking.Duration,
                        DateTime: booking.DateTime,
                        Status: booking.Status,
                        StatusName: booking.StatusName,
                        PaymentStatus: booking.PaymentStatus,
                        PredecessorBookingId: booking.PredecessorBookingId,
                        SuccessorBookingId: booking.SuccessorBookingId,
                        LastUpdated: booking.LastUpdated,
                        Myself: false,
                        Guests: [],
                        Products: [],
                        Ratings: ratings,
                        Tip: !booking.TipAmount ? null : {
                            TipAmount: booking.TipAmount,
                            PaymentStatus: booking.TipPaymentStatus
                        },
                        Created: booking.Created,
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        },
                        Archive:booking.Archive?booking.Archive:0,
                        OrganisationName:booking.OrganisationName,
                        OrganisationLocationId:booking.OrganisationLocationId,
                        CancelBookingReason:booking.CancelBookingReason,
                        CancelBookingNotes:booking.CancelBookingNotes,
                        BookedBy:booking.BookedBy,
                        FullAddress:booking.FullAddress,
                        InvoiceUrl:booking.InvoiceUrl,

                    }
                    if (objToPush.BookingProvider === parseInt(process.env.BOOKING_PROVIDER_CMS)) {
                        objToPush.BookingProviderName = "CMS";
                    } else {
                        objToPush.BookingProviderName = "App";
                    }
                    console.log("booking",objToPush)
                    console.log("booking.Myself",objToPush.Myself)
                    // console.log("before payment status")
                    objToPush.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).name;
                    let guestName;
                    if (booking.GuestId) {
                        console.log("in guest")
                        guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                        objToPush.Guests.push(guestName[0].Name);
                    }
                    console.log("booking",booking)
                    console.log("booking.BookingUser",booking.BookingUser)
                    if (booking.BookingUser) {
                        objToPush.Myself = true;
                    }
                    console.log("405 booking.Myself",objToPush.Myself)
                    let prodPushObj
                    // console.log("ob pushe end")
                    // console.log("ob pushe prod start ")
                    if(booking.BookingProductId){
                        try {
                            prodPushObj = {
                                BookingProductId: booking.BookingProductId,
                                ProductId: booking.ProductId,
                                Product: booking.Product,
                                StaffVacConflict: booking.StaffVacConflict,
                                StaffId: booking.StaffId,
                                StaffName: booking.ProductStaffName,
                                DispatchType: booking.DispatchType,
                                Myself: booking.BookingUser ? true : false,
                                Guest: booking.GuestId ? guestName[0].Name : "",
                                Status: booking.BookingProductStatus,
                                StatusName: BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name,
                                AddOns: []
                            }
                        } catch (error) {
                            console.log(error)
                        }
                        // console.log("ob pushe prod end ")
        
                        if (apiClient === API_CLIENT.CMS) {
                            /**
                             * Check if booking products are auto dispatch or manual dispatch
                             */
                            if (booking.Status === BOOKING_STATUS.CONFIRMED) {
                                let dispatches = await knex
                                    .select(
                                        BOOKING_PRODUCTS + ".DispatchId",
                                        BOOKING_PRODUCT_DISPATCH + ".StaffId",
                                        BOOKING_PRODUCT_DISPATCH + ".Status"
                                    )
                                    .from(BOOKING_PRODUCTS)
                                    .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                                    .where(BOOKING_PRODUCTS + ".BookingProductId", "=", booking.BookingProductId);
                                prodPushObj.DispatchList = []
                                dispatches.forEach(dispatch => {
                                    if (dispatch.StaffId && dispatch.DispatchId) {
                                        prodPushObj.DispatchList.push({
                                            ...dispatch
                                        })
                                    }
                                });
                            }
                        }
                        objToPush.Products.push(prodPushObj);
                        
                        //console.log("finalData")
                        //console.log(finalData)
                    }
                    console.log("final booking.Myself",objToPush.Myself)
                    finalData.push(objToPush);
                   
                } else {
                    // console.log("notfiundes")
                    
                    console.log("found booking.Myself",found.Myself)
                    if (found.UserId) {
                        found.Myself = true;
                    }
                    // console.log("before guest")
                
                    let guestName;
                    if (booking.GuestId) {
                        guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                        found.Guests.push(guestName[0].Name);
                    }
                    // console.log("after guest")
                    // console.log("before prod")
                    if(booking.BookingProductId){
                        let prodPushObj = {
                            BookingProductId: booking.BookingProductId,
                            ProductId: booking.ProductId,
                            Product: booking.Product,
                            StaffVacConflict: booking.StaffVacConflict,
                            StaffId: booking.StaffId,
                            StaffName: booking.ProductStaffName,
                            DispatchType: booking.DispatchType,
                            Myself: booking.BookingUser ? true : false,
                            Guest: booking.GuestId ? guestName[0].Name : "",
                            Status: booking.BookingProductStatus,
                            StatusName: BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name,
                            AddOns: []
                        }
                        // console.log("after prod")
                        // console.log("booking.BookingProductStatus",booking.BookingProductStatus)
                        if (apiClient === API_CLIENT.CMS) {
                            /**
                             * Check if booking products are auto dispatch or manual dispatch
                             */
                           
                            if (booking.DispatchType !== PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT && !booking.StaffId) {
                                // this is not direct assignment and staff is not allotted, collect all dispatched staff list.
                                let dispatches = await knex
                                    .select(
                                        BOOKING_PRODUCTS + ".DispatchId",
                                        BOOKING_PRODUCT_DISPATCH + ".StaffId",
                                        BOOKING_PRODUCT_DISPATCH + ".Status"
                                    )
                                    .from(BOOKING_PRODUCTS)
                                    .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                                    .where(BOOKING_PRODUCTS + ".BookingProductId", "=", booking.BookingProductId);
                                prodPushObj.DispatchList = []
                                dispatches.forEach(dispatch => {
                                    if (dispatch.StaffId && dispatch.DispatchId) {
                                        prodPushObj.DispatchList.push({
                                            ...dispatch
                                        })
                                    }
                                });
                            }
                        }
                        found.Products.push(prodPushObj)
                    }
                    //console.log("foundelse")
                    //console.log(found)
                }
                // if (booking.Status !== BOOKING_STATUS.COMPLETED && booking.Status !== BOOKING_STATUS.LAPSED) {
                //     let bookingBufferEndTime = moment(booking.DateTime)
                //         .add(booking.Duration, "minute")
                //         .add(STATUS_WAIT_TIME, "minute");
                //     let currentTime = moment();
                //     if (
                //         bookingBufferEndTime.isBefore(currentTime) ||
                //         bookingBufferEndTime.isSame(currentTime)
                //     ) {
                //         const PROD_STAFF_CONFLICT = [
                //             BOOKING_PRODUCT_STATUS.ON_GOING,
                //             BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN
                //         ];
                //         if (PROD_STAFF_CONFLICT.includes(booking.BookingProductStatus)) {
                //             //console.log(`BookingId: ${booking.BookingId}`);
                //             //console.log(bookingBufferEndTime);
                //             //console.log(currentTime);
                //             //console.log("Need to update status");
                //             let prodStatusUpdated = await knex(BOOKING_PRODUCTS)
                //                 .where("BookingProductId", "=", booking.BookingProductId)
                //                 .update({
                //                     Status: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             const found = finalData.find(f => f.BookingId === booking.BookingId);
                //             let bookingUpdated = await knex(BOOKINGS)
                //                 .where("BookingId", "=", found.BookingId)
                //                 .update({
                //                     Status: BOOKING_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             found.Status = BOOKING_STATUS.INCONCLUSIVE;
                //             let staffStatus = await knex(STAFF)
                //                 .select("Status", "CurrentBookingId")
                //                 .where("StaffId", "=", booking.StaffId);
                //             let staffData = staffStatus[0];
                //             if (staffData.CurrentBookingId === booking.BookingId) {
                //                 // free the staff
                //                 let staffStatusUpdated = await knex(STAFF)
                //                     .where("StaffId", "=", booking.StaffId)
                //                     .update({
                //                         Status: STAFF_STATUS.AVAILABLE,
                //                         CurrentBookingId: null,
                //                         LastUpdated: zone.getLastUpdate()
                //                     })
                //             }
                //         }
                //     }
                // }
                // console.log("finalDasta, bok")
            }
        }
        catch(err){
            console.log(err)
        }
        // console.log("finalDasta")
        //             console.log(finalData)
        const PROD_STATUS_LAPSE_CHECK = [
            BOOKING_PRODUCT_STATUS.ON_GOING,
            BOOKING_PRODUCT_STATUS.COMPLETED,
            BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN
        ]
        for (let book = 0; book < finalData.length; book++) {
            const booking = finalData[book];
            //console.log(booking)
            for (let prod = 0; prod < booking.Products.length; prod++) {
                const product = booking.Products[prod];
                
                let addOn = await knex
                    .select(
                        BOOKING_PRODUCT_ADDONS + '.AddOn'
                    )
                    .from(BOOKING_PRODUCT_ADDONS)
                    .where(BOOKING_PRODUCT_ADDONS + '.BookingProductId', "=", product.BookingProductId)
                product.AddOns = addOn;
            }
        }
        console.log(apiClient)
        switch (apiClient) {
            case API_CLIENT.CMS: {
                console.log("retrun")
                return {
                    Data: finalData,
                    CurrentIds: bookingIds,
                    LastUpdated: moment().utc().format(),
                    TotalItems: search ? searchItemCount : await getItemCount(knex, bookingTab, filters,organisationLocationId,FromAdmin),
                    Pagination: {
                        ...pagination
                    }
                };
            }
            case API_CLIENT.USER_APP: {
                
                return finalData;
            }
        }
    } catch (err) {
        //console.log(err);
        return {
            Error: err.message
        }
    }
}

// Fetch the Details of given booking Id
const bookingDetail = async (knex, bookingId, platform) => {
    var bookingDetail;

    try {
        bookingDetail = await knex
            .select(
                BOOKINGS + '.BookingId',
                BOOKINGS + '.BookingProvider',
                BOOKINGS + '.UserId',
                USERS + '.Name',
                USERS + '.Therapist',
                USERS + '.Notes',
                USERS + '.CoconNotes',
                USERS + '.Gender',
                USERS + '.Email',
                BOOKINGS + '.Street',
                BOOKINGS + '.HouseNumber',
                BOOKINGS + '.Floor',
                BOOKINGS + '.City',
                BOOKINGS + '.Zip',
                BOOKINGS + '.Elevator',
                BOOKINGS + '.Distance',
                BOOKINGS + '.Amount',
                BOOKINGS + '.Duration',
                BOOKINGS + '.DateTime',
                BOOKINGS + '.PromoCode',
                BOOKINGS + '.PromoAmount',
                BOOKINGS + '.PromoCodeId',
                BOOKINGS + '.PaidPrice',
                BOOKINGS + '.ReachOutTime',
                BOOKINGS + '.PaymentStatus',
                BOOKINGS + '.TransactionId',
                BOOKINGS + '.TransactionDate',
                BOOKINGS + '.Status',
                BOOKINGS + '.PredecessorBookingId',
                BOOKINGS + '.SuccessorBookingId',
                BOOKINGS + '.LastUpdated',
                BOOKINGS + '.TravelFee',
                BOOKINGS + '.BookingChannelId',
                BOOKINGS + '.PaymentType',
                BOOKINGS + '.OrganisationLocationId',
                BOOKINGS + '.BookingBusinessType',
                BOOKINGS + '.CancelBookingReason',
                BOOKINGS + '.CancelBookingNotes',
                BOOKINGS + '.BookedBy',
                BOOKINGS + '.FullAddress',
                BOOKINGS + '.InvoiceUrl',
                BOOKING_EXTRA + '.AdminNotes',
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.ProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.CategoryId',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.Therapist as ProductTherapist',
                BOOKING_PRODUCTS + '.StartTime as ProductStartTime',
                BOOKING_PRODUCTS + '.Amount as ProductAmount',
                BOOKING_PRODUCTS + '.DiscountedAmount',
                BOOKING_PRODUCTS + '.Discount',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.StaffVacConflict',
                STAFF + '.Name as StaffName',
                STAFF + ".GoogleEmail",
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.EventId',
                BOOKING_PRODUCTS + '.Status as ProductStatus',
                BOOKING_PRODUCTS + '.StaffNotes as ProductStaffNotes',
                BOOKING_PRODUCT_EXTRA + ".ExtraValue",
                RATINGS + '.EaseOfBooking',
                RATINGS + '.Professionalism',
                RATINGS + '.Experience',
                RATINGS + '.Quality',
                RATINGS + '.Value',
                RATINGS + '.Feedback',
                BOOKING_TIPS + ".TipAmount",
                BOOKING_TIPS + ".PaymentStatus as TipPaymentStatus",
                USERS + '.Archive',
                USERS + '.Contact',
                USERS + '.Street as UserStreet',
                USERS + '.Floor as UserFloor',
                USERS + '.City as UserCity',
                USERS + '.Zip as UserZip',
                USERS + '.HouseNumber as UserHouseNumber',
                USERS + '.Distance as UserDistance',
                USERS + '.Elevator as UserElevator',
                USERS + '.DOB',
                USERS + '.PreferredLanguage',
                USERS + '.ClientSource',
                USERS + '.ReachOutTime as UserReachOutTime',
                USERS + '.FromCMS',
                ORGANISATION_LOCATION + '.Name as OrganisationName',
                ORGANISATION_LOCATION + '.ReachOutTime as OrgReachouttime',
                ORGANISATION_LOCATION + '.Email as OrganisationEmail'
                
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .leftJoin(BOOKING_EXTRA, BOOKING_EXTRA + ".BookingId", bookingId)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", bookingId)
            .leftJoin(BOOKING_PRODUCT_EXTRA, BOOKING_PRODUCT_EXTRA + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + '.StaffId')
            .leftJoin(RATINGS, RATINGS + ".BookingId", bookingId)
            .leftJoin(BOOKING_TIPS, BOOKING_TIPS + ".BookingId", bookingId)
            .leftJoin(ORGANISATION_LOCATION, BOOKINGS + ".OrganisationLocationId", ORGANISATION_LOCATION + ".OrganisationLocationId")
            .where(BOOKINGS + ".BookingId", "=", bookingId)
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
        if (bookingDetail.length === 0) {
            throw new Error(MESSAGE.BOOK_NOT_EXIST_REFRESH);
        }
        const successTipFound = bookingDetail.find(f => f.TipAmount && f.TipPaymentStatus === BOOKING_TIP_PAYMENT_STATUS.SUCCEEDED);
        let tipData = null;
        if (successTipFound) {
            tipData = {
                TipAmount: successTipFound.TipAmount,
                PaymentStatus: successTipFound.TipPaymentStatus
            }
        }
        var tempData = bookingDetail[0];
        var finalData = {
            BookingId: tempData.BookingId,
            BookingProvider: tempData.BookingProvider,
            UserId: tempData.UserId,
            UserName: tempData.Name,
            UserNotes: tempData.Notes,
            UserEmail: tempData.Email,
            UserGenderKey: tempData.Gender ? "F" : "M",
            CoconNotes: tempData.CoconNotes,
            UserTherapist: tempData.Therapist,
            Street: tempData.Street,
            HouseNumber: tempData.HouseNumber,
            Floor: tempData.Floor,
            City: tempData.City,
            Zip: tempData.Zip,
            Distance: tempData.Distance,
            Elevator: tempData.Elevator,
            Duration: tempData.Duration,
            Amount: tempData.Amount,
            DateTime: tempData.DateTime,
            PromoCode: tempData.PromoCode,
            PromoAmount: tempData.PromoAmount,
            PromoCodeId: tempData.PromoCodeId,
            PaidPrice: tempData.PaidPrice,
            PaymentStatus: tempData.PaymentStatus,
            ReachOutTime: tempData.ReachOutTime,
            TransactionId: tempData.TransactionId,
            TransactionDate: tempData.TransactionDate,
            Status: tempData.Status,
            PredecessorBookingId: tempData.PredecessorBookingId,
            SuccessorBookingId: tempData.SuccessorBookingId,
            Products: [],
            Ratings: null,
            Tip: tipData,
            AdminNotes: tempData.AdminNotes ? tempData.AdminNotes : null,
            TimeZone: {
                Zone: process.env.STAFF_ZONE
            },
            LastUpdated: tempData.LastUpdated,
            Archive:tempData.Archive?tempData.Archive:0,
            TravelFee:tempData.TravelFee,
            BookingChannelId:tempData.BookingChannelId,
            PaymentType:tempData.PaymentType,
            SpecialRequest:[],
            ProductStatus:tempData.ProductStatus,
            UserStreet:tempData.UserStreet,
            UserFloor:tempData.UserFloor,
            UserCity:tempData.UserCity,
            UserZip:tempData.UserZip,
            UserHouseNumber:tempData.UserHouseNumber,
            UserDistance:tempData.UserDistance,
            UserElevator:tempData.UserElevator,
            DOB:tempData.DOB,
            PreferredLanguage:tempData.PreferredLanguage,
            ClientSource:tempData.ClientSource,
            UserReachOutTime:tempData.UserReachOutTime,
            FromCMS:tempData.FromCMS,
            BookingBusinessType:tempData.BookingBusinessType,
            OrganisationLocationId:tempData.OrganisationLocationId,
            OrganisationName:tempData.OrganisationName,
            OrgReachouttime:tempData.OrgReachouttime,
            OrganisationEmail:tempData.OrganisationEmail,
            CancelBookingReason:tempData.CancelBookingReason,
            CancelBookingNotes:tempData.CancelBookingNotes,
            BookedBy:tempData.BookedBy,
            FullAddress:tempData.FullAddress,
            InvoiceUrl:tempData.InvoiceUrl
        };
        finalData.StatusName = BOOKING_STATUS_DESC.find(f => f.code === finalData.Status).name;
        if (finalData.Tip) {
            finalData.Tip.PaymentStatusName = BOOKING_TIP_PAYMENT_STATUS_DESC.find(f => f.code === finalData.Tip.PaymentStatus).name;
        }
        finalData.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === finalData.PaymentStatus).name;
        finalData.PaymentStatusColor = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === finalData.PaymentStatus).color;
            let guestName;
        if (
            !tempData.EaseOfBooking ||
            !tempData.Professionalism ||
            !tempData.Experience ||
            !tempData.Quality ||
            !tempData.Value
        ) {
            finalData.Ratings = null;
        } else {
            finalData.Ratings = {
                EaseOfBooking: tempData.EaseOfBooking,
                Professionalism: tempData.Professionalism,
                Experience: tempData.Experience,
                Quality: tempData.Quality,
                Value: tempData.Value,
                Feedback: tempData.Feedback,
            }
        }
        if (finalData.PaymentType == 1) {
            const invoiceData = await knex
                .select(
                    BOOKING_INVOICE_DATA + ".InvoiceEmail"
                )
                .from(BOOKING_INVOICE_DATA)
                .where(BOOKING_INVOICE_DATA + ".BookingId", "=", finalData.BookingId)
                .andWhere(BOOKING_INVOICE_DATA + ".InvoiceStripeStatus", "open");
                finalData.IsInvoiceOpen = 0
            if (invoiceData.length > 0) {
                finalData.IsInvoiceOpen = 1
                finalData.InvoiceEmail = invoiceData[0].InvoiceEmail
            }
        }
        const specialRequest = await knex
        .select(
            BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
            BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
        )
        .from(BOOKING_SPECIAL_REQUEST)
        .where("BookingId", "=", finalData.BookingId);
        finalData.SpecialRequest=specialRequest

        finalData.PromoDetail={}
        if(finalData.PromoCodeId){
            const promoDetail = await getPromoCodeDetail(finalData.PromoCodeId)
            finalData.PromoDetail=promoDetail
        }   
        // //console.log(finalData)


        bookingDetail.forEach(booking => {
            const bookingProductFound = finalData.Products.find(f => f.BookingProductId === booking.BookingProductId);
            if (!bookingProductFound) {
                booking.ProductStatusName = (booking.ProductStatus==null)?null:BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.ProductStatus).name;
                finalData.Products.push({
                    BookingProductId: booking.BookingProductId,
                    ProductId: booking.ProductId,
                    CategoryId: booking.CategoryId,
                    ProductName: booking.ProductName,
                    Duration: booking.ProductDuration,
                    Amount: booking.ProductAmount,
                    PreparationTime: booking.PreparationTime,
                    StaffId: booking.StaffId,
                    StaffName: booking.StaffName,
                    Therapist: booking.ProductTherapist,
                    StartTime: booking.ProductStartTime,
                    AddOns: [],
                    Guest: booking.ProductGuest,
                    Myself: booking.ProductGuest ? false : true,
                    SameTime: booking.SameTime === 1 ? true : false,
                    EventId: booking.EventId,
                    Status: booking.ProductStatus,
                    StatusName: booking.ProductStatusName,
                    StaffVacConflict: booking.StaffVacConflict,
                    StaffNotes: booking.ProductStaffNotes,
                    Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                    GoogleEmail:booking.GoogleEmail,
                    DiscountedAmount:booking.DiscountedAmount,
                    Discount:booking.Discount
                   
                });
            } else {
                if (booking.ExtraValue) {
                    bookingProductFound.Extras.push(booking.ExtraValue);
                }
            }
        });

        

        for (let index = 0; index < finalData.Products.length; index++) {
            let product = finalData.Products[index];
            const addOnResult = await knex
                .select(
                    BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                    BOOKING_PRODUCT_ADDONS + ".AddOnId",
                    BOOKING_PRODUCT_ADDONS + ".AddOn",
                    BOOKING_PRODUCT_ADDONS + ".Duration",
                    BOOKING_PRODUCT_ADDONS + ".Amount",
                    BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                    BOOKING_PRODUCT_ADDONS + ".BookingAddOnPaymentId",
                    BOOKING_PRODUCT_ADDONS + ".RequestStatus"
                )
                .from(BOOKING_PRODUCT_ADDONS)
                .where("BookingProductId", "=", product.BookingProductId);
            if (addOnResult.length > 0) {
                for (let adInc = 0; adInc < addOnResult.length; adInc++) {
                    const addOn = addOnResult[adInc];
                    if (!addOn.ExtraAddOn) {
                        product.AddOns.push({
                            BookingProductAddOnId: addOn.BookingProductAddOnId,
                            AddOnId: addOn.AddOnId,
                            AddOn: addOn.AddOn,
                            Duration: addOn.Duration,
                            ExtraAddOn: addOn.ExtraAddOn,
                            Amount: addOn.Amount,
                            RequestStatus: addOn.RequestStatus,
                            PaymentStatus: null
                        })
                    } else if (
                        addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                        addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED ||
                        addOn.RequestStatus === ADDON_REQUEST_STATUS.REJECTED
                    ) {
                        let paymentStatus = null;
                        if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                            if (addOn.BookingAddOnPaymentId) {
                                let paymentStats = await knex(BOOKING_ADDON_PAYMENTS)
                                    .select("PaymentStatus")
                                    .where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                if (paymentStats.length) {
                                    paymentStatus = paymentStats[0].PaymentStatus;
                                }
                            }
                        }
                        product.AddOns.push({
                            BookingProductAddOnId: addOn.BookingProductAddOnId,
                            AddOnId: addOn.AddOnId,
                            AddOn: addOn.AddOn,
                            Duration: addOn.Duration,
                            ExtraAddOn: addOn.ExtraAddOn,
                            Amount: addOn.Amount,
                            RequestStatus: addOn.RequestStatus,
                            PaymentStatus: paymentStatus
                        })
                    }
                }
                // addOnResult.forEach(element => {
                //     finalData.Products[index].AddOns.push(element);
                // });
            }

            if (product.Guest) {
                const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                    .where("GuestId", "=", product.Guest);
                finalData.Products[index].Guest = guestResult[0];
            }
        }

        if(finalData.PredecessorBookingId){
            const prevBooking = await knex
            .select(
               '*',
            )
            .from(BOOKINGS)
            .where("BookingId", "=", finalData.PredecessorBookingId);
            finalData.PreviousBooking=prevBooking[0]
        }
    } catch (error) {
        //console.log(error);
        return {
            Error: error.message
        };
    }

    return finalData;
}

const findBookings = async (knex, apiClient, { bookingTab, pagination, sort, filters, search ,organisationLocationId,FromAdmin}) => {
    try {
        if (search) {
            searchstr=search.replace(',','');
            let searchArray=searchstr.split(' ');
            let searchString=escapeRegex(searchArray[0])
            searchArray.forEach(function(element,index){ 
                // //console.log(index)
                if(index!=0){
                    searchString+='|'+escapeRegex(element)
                }
            });
        
            // By User Name, Booking Id, Booking Address, Booking Date.
            let collectedBookings = [];

            // try to find if its a booking id, then it will parsed to int
            try {
                let checkBooking = parseInt(search);
                checkBooking > 0 ? collectedBookings.push(checkBooking) : true;
            } catch (error) {
                //console.log(error)
            }

            // search bookings by user name.
            let userBookings = await knex
                .select(BOOKINGS + ".BookingId")
                .from(BOOKINGS)
                .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                .where("Name", "like", `%${search}%`);
            userBookings.length ? collectedBookings.push(...userBookings.map(b => b.BookingId)) : true;

            // search by booking address.
            // let addreBooks = await knex(BOOKINGS)
            //     .select("BookingId")
            //     .orWhere("Street", "REGEXP", `${searchString}`)
            //     .orWhere("Floor", "REGEXP", `${searchString}`)
            //     .orWhere("Zip", "REGEXP", `${searchString}`)
            //     .orWhere("City","REGEXP", `${searchString}`)
            //     .modify(function (queryBuilder) {
            //         //console.log(queryBuilder.toSQL().toNative()) 
            //     });

              // search bookings by treatment name.
              let prodBookings = await knex
              .select(BOOKINGS + ".BookingId")
              .from(BOOKINGS)
              .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
              .where("Product", "like", `%${search}%`);
              prodBookings.length ? collectedBookings.push(...prodBookings.map(b => b.BookingId)) : true

               // search bookings by treatment duration.
               let prodDurationBookings = await knex
               .select(BOOKINGS + ".BookingId")
               .from(BOOKINGS)
               .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
               .where(BOOKING_PRODUCTS+".Duration", "like", `%${search}%`)
               .orWhere(BOOKINGS+".Duration", "like", `%${search}%`);
               prodDurationBookings.length ? collectedBookings.push(...prodDurationBookings.map(b => b.BookingId)) : true


            let addreBooks = await knex(BOOKINGS)
                .select("BookingId",
                knex.raw('REPLACE(CONCAT(COALESCE(Floor, \'\'), \'\, \', COALESCE(Street,\'\'), \'\, \', COALESCE(HouseNumber,\'\'), \'\, \',COALESCE(City,\'\'),\'\, \',COALESCE(Zip,\'\') ), \' \', \'\') as "searchAdrress"'))
                .modify(function (queryBuilder) {
                    queryBuilder.having("searchAdrress", "like", `%${search.replace(/ /g,'')}%`);
                    //console.log(queryBuilder.toSQL().toNative()) 
                });
               
            addreBooks.length ? collectedBookings.push(...addreBooks.map(b => b.BookingId)) : true;
            
            // search by date
            try {
                // First try to find particular date
                let selTime = momentz.tz(search, DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm, true, process.env.STAFF_ZONE);
                console.log(selTime);
                // if (selTime.isValid) {
                    let dateBooks = await knex(BOOKINGS)
                        .select("BookingId",
                        knex.raw(`DATE_FORMAT(DateTime, '%b %d %Y, %H:%m %Z')`)
                        )
                        // .where("DateTime", "=", selTime.toDate())
                        // .where(knex.raw("to_char(DateTime, 'MMM DD YYYY, HH:mm z') like ?", `%${search}%`))
                        .whereRaw("DATE_FORMAT(DateTime, '%b %d %Y, %H:%m %Z') LIKE ?", [`%${search}%`])
                        // .where("BookingId", "=", 1974)
                        .modify(function (queryBuilder) {
                            console.log(queryBuilder.toSQL().toNative());
                        });
                    console.log("dateBooks",dateBooks);
                    if (dateBooks.length && dateBooks[0].BookingId) {
                        collectedBookings = [...dateBooks.map(f => f.BookingId)]
                    }
                // }
            } catch (error) {
                console.log(error)
            }

            // search by Organisation Name
            if(organisationLocationId!=-1){
                let orgBookings = await knex
            .select(BOOKINGS + ".BookingId")
            .from(BOOKINGS)
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .where(ORGANISATION_LOCATION+".Name", "like", `%${search}%`)
            .modify(function (queryBuilder) {
                console.log(queryBuilder.toSQL().toNative());
            });

            orgBookings.length ? collectedBookings.push(...orgBookings.map(b => b.BookingId)) : true
            }
            

            console.log("collectedBookings",collectedBookings)
            let bookingsData = await knex
                .select(
                    BOOKINGS + '.BookingId'
                )
                .from(BOOKINGS)
                .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
                .leftJoin(USERS, USERS + '.UserId', BOOKINGS + '.UserId')
                .modify(function (queryBuilder) {
                    queryBuilder.whereIn(BOOKINGS + ".BookingId", collectedBookings)
                    if(organisationLocationId){
                        if(organisationLocationId==-1){
                            // queryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                            queryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                        }else{
                            queryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                        if(!FromAdmin){
                            queryBuilder.whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER_FOR_ORGANISATION);
                        }
                        }
                        
                        
                    }
                    if(bookingTab!=null){
                        switch (bookingTab) {
                            case BOOKING_LIST_TAB.UNFILLED: {
                                queryBuilder.whereNull(BOOKING_PRODUCTS + ".StaffId")
                                queryBuilder.andWhere(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                                break;
                            }
                            case BOOKING_LIST_TAB.FILLED: {
                                queryBuilder.whereNotNull(BOOKING_PRODUCTS + ".StaffId")
                                queryBuilder.andWhere(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                                break;
                            }
                            case BOOKING_LIST_TAB.ON_GOING: {
                                queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.ON_GOING)
                                break;
                            }
                            case BOOKING_LIST_TAB.COMPLETED: {
                                queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.COMPLETED)
                                break;
                            }
                            case BOOKING_LIST_TAB.OTHERS: {
                                queryBuilder.whereIn(BOOKINGS + ".Status", CMS_OTHER_TAB_BOOKINGS);
                                break;
                            }
                            case BOOKING_LIST_TAB.DRAFTS: {
                                queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.DRAFT);
                                break;
                            }
                            default: {
                                console.log('no default option')
                                break;
                            }
                        }
                    }
                    
                    if (sort.Key && BOOKING_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(BOOKINGS + "." + sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(BOOKINGS + ".Created", "desc")
                    }
                    queryBuilder.groupBy(BOOKINGS + ".BookingId");
                    console.log(queryBuilder.toSQL().toNative());
                });
            return bookingsData.map(booking => booking.BookingId);
        } else {
            let bookingsData = await knex
                .select(
                    BOOKINGS + '.BookingId'
                )
                .from(BOOKINGS)
                .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
                .modify(function (queryBuilder) {
                    if (apiClient === API_CLIENT.USER_APP) {
                        queryBuilder.where(BOOKINGS + ".UserId", "=", userId)
                        queryBuilder.whereIn(BOOKINGS + ".Status", BOOKINGS_FOR_USER_APP)
                        queryBuilder.orderBy(BOOKINGS + ".DateTime", "asc")
                    } else {
                        // Called by CMS

                        let bookingMetaFilter = filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_META.KEY);
                        console.log("organisationLocationId",organisationLocationId)
                        if(organisationLocationId){
                            if(organisationLocationId==-1){
                                // queryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                queryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                console.log("in org")
                            queryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                            console.log("FromAdmin",FromAdmin)
                            if(!FromAdmin){
                                queryBuilder.whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER_FOR_ORGANISATION);
                            }
                            }
                            
                            // queryBuilder.whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER_FOR_ORGANISATION);
                        }
                        
                        if(bookingTab!=null){
                            switch (bookingTab) {
                                case BOOKING_LIST_TAB.UNFILLED: {
                                    queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                                    queryBuilder.whereNull(BOOKING_PRODUCTS + ".StaffId");
                                    break;
                                }
                                case BOOKING_LIST_TAB.FILLED: {
                                    queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                                    queryBuilder.whereNotNull(BOOKING_PRODUCTS + ".StaffId");
                                    break;
                                }
                                case BOOKING_LIST_TAB.ON_GOING: {
                                    queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.ON_GOING)
                                    break;
                                }
                                case BOOKING_LIST_TAB.COMPLETED: {
                                    queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.COMPLETED)
                                    break;
                                }
                                case BOOKING_LIST_TAB.OTHERS: {
                                    let bookingStatusFilter = filters && filters.length
                                        ? filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_STATUS.KEY)
                                        : null;
                                    bookingStatusFilter
                                        ? queryBuilder.whereIn(BOOKINGS + ".Status", bookingStatusFilter.Values) // Status filter applied, return the bookings which follow the filter criteria.
                                        : queryBuilder.whereIn(BOOKINGS + ".Status", CMS_OTHER_TAB_BOOKINGS); // Status filter not applied, return the bookings of other status.                            
                                    break;
                                }
                                case BOOKING_LIST_TAB.DRAFTS: {
                                    queryBuilder.where(BOOKINGS + ".Status", BOOKING_STATUS.DRAFT)
                                    break;
                                }
                                case BOOKING_LIST_TAB.ALL: {
                                    let bookingStatusFilter = filters && filters.length
                                        ? filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_STATUS.KEY)
                                        : null;
                                        if(bookingStatusFilter){
                                            queryBuilder.whereIn(BOOKINGS + ".Status", bookingStatusFilter.Values) 
                                        }
                                                             
                                    break;
                                }
                                default: {
                                    console.log('no default option')
                                    break;
                                }
                            }
                        }
                        // if (json.OrganisationLocationId) {
                        //     queryBuilder.where(BOOKINGS + ".OrganisationLocationId", OrganisationLocationId)
                        // }
                        if (filters && filters.length) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? queryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true;
                            }
                            let bookingDateFilter = filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_DATE.KEY);
                            // //console.log(bookingDateFilter)
                            // let values=bookingDateFilter.Va
                            if (bookingDateFilter) {

                                queryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                queryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                        }

                        
                        if (sort.Key && BOOKING_SORT_KEYS.includes(sort.Key)) {
                            queryBuilder.orderBy(BOOKINGS + "." + sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                        } else {
                            queryBuilder.orderBy(BOOKINGS + ".Created", "desc")
                        }
                        queryBuilder.limit(pagination.Size);
                        if (pagination.Number > 1) {
                            let offset = pagination.Size * (pagination.Number - 1);
                            queryBuilder.offset(offset)
                        }
                        queryBuilder.groupBy(BOOKINGS + ".BookingId");
                        console.log(queryBuilder.toSQL().toNative());
                    }
                })
            return bookingsData.map(booking => booking.BookingId);
        }
    } catch (err) {
        //console.log(err);
        return {
            Error: err.message
        }
    }
}

const getMetaFilterQuery = (bookingMetaFilter) => {
    let whereClause = {
        leftClause: "",
        operator: "",
        rightClause: ""
    };
    if (bookingMetaFilter) {
        switch (bookingMetaFilter.Values[0]) {
            case BOOKING_LIST_FILTERS.BOOKING_META.VALUES.FROM_APP: {
                whereClause.leftClause = BOOKINGS + ".BookingProvider";
                whereClause.operator = "=";
                whereClause.rightClause = BOOKING_PROVIDER.USER_APP;
                break;
            }
            case BOOKING_LIST_FILTERS.BOOKING_META.VALUES.FROM_CMS: {
                whereClause.leftClause = BOOKINGS + ".BookingProvider";
                whereClause.operator = "=";
                whereClause.rightClause = BOOKING_PROVIDER.CMS;
                break;
            }
            case BOOKING_LIST_FILTERS.BOOKING_META.VALUES.CONFLICT: {
                whereClause.leftClause = BOOKING_PRODUCTS + ".StaffVacConflict";
                whereClause.operator = "=";
                whereClause.rightClause = BINARY.TRUE;
                break;
            }
            default:
                break;
        }
        return whereClause;
    }
}

const getItemCount = async (knex, bookingTab, filters,organisationLocationId,FromAdmin) => {
    let itemCount = 0;
    let bookingMetaFilter = filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_META.KEY);
    let bookingDateFilter = filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_DATE.KEY);
    try {
        console.log("bookingTab",bookingTab)
        if(bookingTab!=null){
            switch (bookingTab) {
                case BOOKING_LIST_TAB.UNFILLED: {
                    console.log("bookingTab2",bookingTab)
                    let count = await knex
                        .count(BOOKINGS + ".BookingId")
                        .from(BOOKINGS)
                        .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                        .where(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                        .whereNull(BOOKING_PRODUCTS + ".StaffId")
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
      
                                if(bookingDateFilter){
                                    subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                                }
                                if(organisationLocationId==-1){
                                    // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                    subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                                }else{
                                    if(organisationLocationId && FromAdmin){
                                        subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                    }
                                }
                                
                                subQueryBuilder.toSQL().toNative()
                        })
                        .groupBy(BOOKINGS + ".BookingId");
                    itemCount = count.length;
                    break;
                }
                case BOOKING_LIST_TAB.FILLED: {
                    let count = await knex
                        .count(BOOKINGS + ".BookingId")
                        .from(BOOKINGS)
                        .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                        .where(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
                        .whereNotNull(BOOKING_PRODUCTS + ".StaffId")
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
    
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                        })
                        .groupBy(BOOKINGS + ".BookingId");
                    itemCount = count.length;
                    break;
                }
                case BOOKING_LIST_TAB.ON_GOING: {
                    let count = await knex(BOOKINGS)
                        .count("BookingId")
                        .where("Status", BOOKING_STATUS.ON_GOING)
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
    
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                        });
                    itemCount = count[0]['count(`BookingId`)'];
                    break;
                }
                case BOOKING_LIST_TAB.COMPLETED: {
                    let count = await knex(BOOKINGS)
                        .count("BookingId")
                        .where("Status", BOOKING_STATUS.COMPLETED)
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
    
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                
                            }
                            }
                        });
                    itemCount = count[0]['count(`BookingId`)'];
                    break;
                }
                case BOOKING_LIST_TAB.OTHERS: {
                    let bookingStatusFilter = filters && filters.length
                        ? filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_STATUS.KEY)
                        : null;
                    if (bookingStatusFilter) {
                        // Status filter applied, return the bookings count which follow the filter criteria.
                        let count = await knex(BOOKINGS).count("BookingId").whereIn("Status", bookingStatusFilter.Values)
                        .modify(function (subQueryBuilder) {
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                            
                        })
                        itemCount = count[0]['count(`BookingId`)'];
                    } else if (bookingMetaFilter) {
                        // Meta filter applied, return the bookings count of other status.
                        let count = await knex(BOOKINGS)
                            .count("BookingId")
                            .modify(function (subQueryBuilder) {
                                if (bookingMetaFilter) {
                                    let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                    whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                                }
                                if(organisationLocationId==-1){
                                    // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                    subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                                }else{
                                    if(organisationLocationId && FromAdmin){
                                        subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                    }
                                }
                                
                            })
                            .whereIn("Status", CMS_OTHER_TAB_BOOKINGS)
                        itemCount = count[0]['count(`BookingId`)'];
                    } else {
                        // Status filter not applied, return the bookings count of other status.
                        let count = await knex(BOOKINGS).count("BookingId").whereIn("Status", CMS_OTHER_TAB_BOOKINGS)
                        .modify(function (subQueryBuilder) {
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                        })
                        itemCount = count[0]['count(`BookingId`)'];
                    }
                    break;
                }
                case BOOKING_LIST_TAB.DRAFTS: {
                    let count = await knex(BOOKINGS)
                        .count("BookingId")
                        .where("Status", BOOKING_STATUS.DRAFT)
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
    
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                        });
                    itemCount = count[0]['count(`BookingId`)'];
                    break;
                }
                case BOOKING_LIST_TAB.ALL: {
                    let bookingStatusFilter = filters && filters.length
                    ? filters.find(f => f.Key === BOOKING_LIST_FILTERS.BOOKING_STATUS.KEY)
                    : null;
                if (bookingStatusFilter) {
                    // Status filter applied, return the bookings count which follow the filter criteria.
                    let count = await knex(BOOKINGS).count("BookingId").whereIn("Status", bookingStatusFilter.Values)
                    .modify(function (subQueryBuilder) {
                        if(bookingDateFilter){
                            subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                        }
                        if(organisationLocationId==-1){
                            // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                            subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                        }else{
                            if(organisationLocationId && FromAdmin){
                                subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                            }
                        }
                        
                        
                    })
                    itemCount = count[0]['count(`BookingId`)'];
                } else if (bookingMetaFilter) {
                    // Meta filter applied, return the bookings count of other status.
                    let count = await knex(BOOKINGS)
                        .count("BookingId")
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
                            if(organisationLocationId==-1){
                                // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                                subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                            }else{
                                if(organisationLocationId && FromAdmin){
                                    subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                                }
                            }
                            
                        })
                        .whereIn("Status", CMS_OTHER_TAB_BOOKINGS)
                    itemCount = count[0]['count(`BookingId`)'];
                } else {
                    // Status filter not applied, return the bookings count of other status.
                    let count = await knex(BOOKINGS).count("BookingId").whereIn("Status", CMS_OTHER_TAB_BOOKINGS)
                    .modify(function (subQueryBuilder) {
                        if(bookingDateFilter){
                            subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                        }
                        if(bookingDateFilter){
                            subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                        }
                        if(organisationLocationId==-1){
                            // subQueryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,null)
                            subQueryBuilder.whereNull(BOOKINGS + ".OrganisationLocationId")
                        }else{
                            if(organisationLocationId && FromAdmin){
                                subQueryBuilder .andWhere(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                            }
                        }
                        
                    })
                    itemCount = count[0]['count(`BookingId`)'];
                }
                break;
                }
                default: {
                    //console.log('no default option')
                    break;
                }
            }
        }
        if(organisationLocationId && organisationLocationId !=-1 && FromAdmin!=1){
            let count = await knex
                        .count(BOOKINGS + ".BookingId")
                        .from(BOOKINGS)
                        .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                        .modify(function (subQueryBuilder) {
                            if (bookingMetaFilter) {
                                let whereClause = getMetaFilterQuery(bookingMetaFilter);
                                whereClause.leftClause ? subQueryBuilder.where(whereClause.leftClause, whereClause.operator, whereClause.rightClause) : true
                            }
    
                            if(bookingDateFilter){
                                subQueryBuilder.where("DateTime", ">=", momentz.tz(bookingDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
    
                                    subQueryBuilder.andWhere("DateTime", "<=", momentz.tz(bookingDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                        })
                        .groupBy(BOOKINGS + ".BookingId")
                        .where(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
                        .whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER_FOR_ORGANISATION);
                    itemCount = count.length;
                    
            // queryBuilder.where(BOOKINGS + ".OrganisationLocationId",'=' ,organisationLocationId)
        }
    } catch (error) {
        //console.log(error)
    }
    console.log("itemCount",itemCount)
    return itemCount;
}

const getSearchItemCount = async (knex, bookingTab, search) => {

}

const escapeRegex=(string)=> {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
module.exports.getBooking = async event => {
    /**
     * Used by CMS and user application.
     * For user application: UserId is mandatory.
     * For CMS:
     *  - we are applying the pagination in API.
     *  - It should return the data in chunks based on the request specification (page number and size)
     *  - Other functionalities:
     *    - Filters: 
     *      - BookingMeta (from App, from CMS, Having staff vac conflicts)
     *      - BookingStatus (all types of bookings)
     *    - Sorting:
     *      - sorts the result based on given criteria (key & value)
     *    - Tab wise data:
     *      - returns the data booking tab wise (unfilled, filled ...)
     */
    let knex, connected = false, response;
    try {
        const apiClient = event.headers['api-client'];
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        //console.log(json)
        //console.log(apiClient)
        knex = require("knex")(con);
        connected = true;
        switch (apiClient) {
            case API_CLIENT.USER_APP: {
                if (!json || !json.UserId || typeof json.UserId !== "number") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                if (json && json.UserId) {
                    var userExist = await knex(USERS).select("Email").where("UserId", "=", json.UserId);
                    if (userExist.length === 0 || !userExist[0].Email) {
                        throw new Error(MESSAGE.USER_NOT_EXIST);
                    }
                }
                let boData = await this.bookings(knex, json && json.UserId ? json.UserId : null, event.headers['api-client'], {
                    bookingTab: 0,
                    filters: [],
                    pagination: null,
                    search: "",
                    sort: null
                }, json.ShowUpcoming ? true : false);
                if (boData.Error) {
                    throw new Error(response.Error);
                }
                response = {
                    Data: boData
                }
                break;
            }
            case API_CLIENT.CMS: {
                if(json.OrganisationLocationId){
                    if (
                        !json ||
                        !json.Sort || typeof json.Sort !== "object" ||
                        !json.Filters || typeof json.Filters !== "object" ||
                        !json.Pagination || typeof json.Pagination !== "object"
                    ) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }

                }else{
                    if (
                        !json ||
                        typeof json.BookingTab !== "number" ||
                        !json.Sort || typeof json.Sort !== "object" ||
                        !json.Filters || typeof json.Filters !== "object" ||
                        !json.Pagination || typeof json.Pagination !== "object"
                    ) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                }
                //console.log(json)
                response = await this.bookings(knex, json && json.UserId ? json.UserId : null, event.headers['api-client'], {
                    bookingTab: json.OrganisationLocationId && json.FromAdmin!=1?null:json.BookingTab,
                    pagination: json.Pagination,
                    filters: json.Filters,
                    sort: json.Sort,
                    search: json.Search,
                    lastUpdated: json.LastUpdated,
                    currentIds: json.CurrentIds,
                    organisationLocationId:json.OrganisationLocationId?json.OrganisationLocationId:null,
                    FromAdmin:json.FromAdmin
                });
                
                if (response.Error) {
                    throw new Error(response.Error);
                }
                break;
            }
            default: {
                throw new Error(MESSAGE.REQUES_NOT_ALLOWED);
            }
        }
        await knex.destroy();
        connected = false;
        console.log("response",response)
        return {
            statusCode: 200,
            headers: {
                ...Headers,
                message: MESSAGE.BOOKING_FETCH_SUCCESS
            },
            body: setPayloadData(event, response)
        }
    } catch (error) {
        //console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
}

module.exports.saveRating = async event => {
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        var connected = false;
        const json = event.body ? getPayloadData(event) : {};
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json.UserId || typeof json.UserId !== "number" ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            !json.EaseOfBooking || typeof json.EaseOfBooking !== "number" ||
            !json.Professionalism || typeof json.Professionalism !== "number" ||
            !json.Experience || typeof json.Experience !== "number" ||
            !json.Quality || typeof json.Quality !== "number" ||
            !json.Value || typeof json.Value !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require('knex')(con);
        connected = true;
        var userBookingExist = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                RATINGS + ".RatingId"
            )
            .from(BOOKINGS)
            .leftJoin(RATINGS, RATINGS + ".BookingId", BOOKINGS + ".BookingId")
            .where(BOOKINGS + ".UserId", "=", json.UserId)
            .andWhere(BOOKINGS + ".BookingId", "=", json.BookingId)

        if (userBookingExist.length === 0 || !userBookingExist[0].UserId || !userBookingExist[0].BookingId) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        if (!userBookingExist[0].RatingId) {
            const ratingSaved = await knex(RATINGS)
                .insert({
                    UserId: json.UserId,
                    BookingId: json.BookingId,
                    EaseOfBooking: json.EaseOfBooking,
                    Professionalism: json.Professionalism,
                    Experience: json.Experience,
                    Quality: json.Quality,
                    Value: json.Value,
                    Feedback: json.Feedback,
                    ...zone.getCreateUpdate()
                });
            if (ratingSaved.length === 0) {
                throw new Error(MESSAGE.RATINGS_SAVE_FAILED);
            }
        } else {
            const ratingUpdated = await knex(RATINGS)
                .where("RatingId", "=", userBookingExist[0].RatingId)
                .update({
                    EaseOfBooking: json.EaseOfBooking,
                    Professionalism: json.Professionalism,
                    Experience: json.Experience,
                    Quality: json.Quality,
                    Value: json.Value,
                    Feedback: json.Feedback,
                    LastUpdated: zone.getLastUpdate()
                })
            if (!ratingUpdated) {
                throw new Error(MESSAGE.RATINGS_SAVE_FAILED);
            }
        }

        /**
         * Calculate the average ratings which will be given to all staff in this booking.
         * Consider only Professionalism, Quality, Experience. 
         */
        let rateAvgForTherapist = (json.Professionalism + json.Experience + json.Quality) / 3;
        rateAvgForTherapist = Math.round(rateAvgForTherapist);

        /**
         * Now find out all the staff which worked in this booking.
         * Loop over all of them and fetch there existing ratings, count
         * Add new rating average in existing ratings avarage and divide by count to get new average.
         */

        let existingStaffIds = await knex(BOOKING_PRODUCTS).select("StaffId").where("BookingId", '=', json.BookingId);
        let uniqueStaffId = [];
        existingStaffIds.forEach(element => {
            const found = uniqueStaffId.find(f => f.StaffId === element.StaffId);
            if (!found) {
                uniqueStaffId.push({
                    StaffId: element.StaffId
                })
            }
        });
        for (let staffInc = 0; staffInc < uniqueStaffId.length; staffInc++) {
            const staffId = uniqueStaffId[staffInc].StaffId;
            let staffExistRate = await knex(STAFF).select("TotalRatings", "AverageRating").where("StaffId", "=", staffId);
            let existData = staffExistRate[0];
            let updateObj = {
                TotalRatings: null,
                AverageRating: null
            }
            if (existData && existData.TotalRatings > 0) {
                let newRateAvg = (existData.AverageRating + rateAvgForTherapist) / 2;
                newRateAvg = Math.round(newRateAvg);
                updateObj.AverageRating = newRateAvg;
                updateObj.TotalRatings = existData.TotalRatings + 1;
            } else {
                updateObj.TotalRatings = 1;
                updateObj.AverageRating = rateAvgForTherapist;
            }
            let staffUpdated = await knex(STAFF).where("StaffId", "=", staffId).update(updateObj);
        }


        var bookingsData = await bookingDetail(knex, json.BookingId, event.headers['platform']);
        if (bookingsData.Error) {
            throw new Error(bookingData.Error);
        }
        await knex.destroy();
    } catch (err) {
        //console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: err.message
            },
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.RATINGS_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingsData
        })
    }

}

const checkUpdatedBookings = async (knex, bookingIds, lastUpdated) => {
    var bookingsIdsData = bookingIds;
    if (lastUpdated) {
        bookingsIdsData = await knex
        .pluck('BookingId')
        .from(BOOKINGS)
        .modify(function (queryBuilder) {
            queryBuilder.whereIn("BookingId", bookingIds)
            queryBuilder.where("LastUpdated", ">", lastUpdated)
        });
    }
    return bookingsIdsData;
}

module.exports.getBookingDetail = async event => {
    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var connected = false;
        var json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.SOMETHING_WENT_WRONG);
        }
        let bookingIds = [];
        if (typeof json.BookingId === "string") {
            bookingIds = [parseInt(json.BookingId)];
        } else if ( typeof json.BookingId === 'object' && json.BookingId.length > 0) {
            json.BookingId.forEach(id => {
                    bookingIds.push(typeof id === "string" ? parseInt(id) : id)
            })
        } else {
            bookingIds = [json.BookingId]
        }
        var knex = require("knex")(con);
        connected = true;
        const promises = [];
        var bookingData = [];
        bookingIds = await checkUpdatedBookings(knex, bookingIds, json.LastUpdated)
        for (let count = 0; count < bookingIds.length; count++) {
            promises.push(bookingDetail(knex, bookingIds[count], event.headers['platform']));
        }
        bookingData = await Promise.all(promises);
        // Mobile app is expecting the direct object in "Data" field
        var response = {
            Data: event.headers['api-client'] === API_CLIENT.CMS ? bookingData : bookingData[0],
            LastUpdated: moment().utc().format()
        }
        await knex.destroy();
        if (bookingData.Error) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: bookingData.Error
                }
            }
        }
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_DETAIL_FETCH_SUCCESS
        },
        body: setPayloadData(event, response)
    }
}

module.exports.getRating = async event => {
    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const knex = require("knex")(con);
        var ratingData = await knex
            .select(
                RATINGS + '.RatingId',
                RATINGS + '.UserId',
                USERS + '.Name',
                RATINGS + '.BookingId',
                RATINGS + '.EaseOfBooking',
                RATINGS + '.Professionalism',
                RATINGS + '.Experience',
                RATINGS + '.Quality',
                RATINGS + '.Value',
                RATINGS + '.Feedback',
                USERS + '.Archive',
            )
            .from(RATINGS)
            .leftJoin(USERS, USERS + ".UserId", RATINGS + ".UserId")
            .orderBy(RATINGS + ".Created", "desc");
        await knex.destroy();
    } catch (error) {
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.RATINGS_FETCH_SUCCESSstaffPushNotify
        },
        body: setPayloadData(event, {
            Data: ratingData
        })
    }
}

module.exports.saveBookingNew = async event => {
    let eventsCreated = [];
    let agPromoId = null;
    let bookingCreatedId = null;
    let knex, connected = false, bookingData;
    try {
        const headers = event.headers;
        // //console.log(headers);
        let isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        // let tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        // if (tokenValid.statusCode !== 200) {
        //     return {
        //         statusCode: tokenValid.statusCode,
        //         headers: {
        //             ...Headers,
        //             message: tokenValid.message
        //         }
        //     }
        // }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json.UserId || typeof json.UserId !== "number" ||
            !json.Street || typeof json.Street !== "string" ||
            // !json.HouseNumber || typeof json.HouseNumber !== "string" ||
            !json.Amount || typeof json.Amount !== "number" ||
            !json.DateTime || typeof json.DateTime !== "string" ||
            typeof json.PaidPrice !== "number" || json.PaidPrice < 0 ||
            !json.Products || typeof json.Products !== 'object' ||
            json.ReachOutTime== null || json.ReachOutTime==undefined || typeof json.ReachOutTime !== "number" ||
            json.Products.length === 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        if (json.PaidPrice > 0) {
            if (
                json.PaymentMethod < 0 || typeof json.PaymentMethod !== "number" ||
                json.PaymentMethod > 1
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            if (json.PaymentMethod === 1 && !json.BankKey) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        }

        let reminder = 0
        if(json.ReachOutTime>0){
            json.ReachOutTime % 5;
        }if (reminder > 0) {
            let toAdd = 5 - reminder;
            json.ReachOutTime += toAdd;
        }

        // if (json.PromoCodeId && (!json.PromoCode || !json.PromoAmount)) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
        let dateTime = moment(json.DateTime).utc().toDate();
        const UserId = json.UserId;
        let products = [];
        products = json.Products;
        let eventsData = [];
        let productNames = [];
        let productToFetch = [];
        let addOnToFetch = [];

        // Validate each product configuration
        STAFF_CURRENT_SCHEDULE = [];
        products.forEach((product) => {
            if (
                !product.ProductId || typeof product.ProductId !== "number" ||
                !product.CategoryId || typeof product.CategoryId !== "number" ||
                !product.Name || typeof product.Name !== "string" ||
                !product.StartTime || typeof product.StartTime !== "string" ||
                !product.Duration || typeof product.Duration !== "number" ||
                !product.Amount || typeof product.Amount !== "number" ||
                !product.AvailableStaff || typeof product.AvailableStaff !== "object" ||
                product.AvailableStaff.length <= 0 ||
                typeof product.Therapist !== "number" ||
                product.Therapist < 0 || product.Therapist > 2
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const found = productToFetch.find(f => f === product.ProductId);
            if (!found) {
                productToFetch.push(product.ProductId)
            }
            product.AvailableStaff.forEach(staff => {
                if (!staff.StaffId || !staff.GoogleEmail) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
                if (!staffFound) {
                    STAFF_CURRENT_SCHEDULE.push({
                        StaffId: staff.StaffId,
                        GoogleEmail: staff.GoogleEmail
                    })
                }
            });
            if (product.AddOns.length > 0) {
                product.AddOns.forEach(addOn => {
                    if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                    const found = addOnToFetch.find(f => f === addOn.AddOnId);
                    if (!found) {
                        addOnToFetch.push(addOn.AddOnId);
                    }
                });
            }
            if (product.Guest) {
                if (!product.Guest.Name || !product.Guest.Contact) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            }
            productNames.push(product.Name);
        });

        knex = require("knex")(con);
        connected = true;
        const userData = await knex(USERS)
            .select("UserId", "Email", "Name", "CustomerId", "ReachOutTime", "FcmToken")
            .where("UserId", "=", UserId);
        if (userData.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_EXIST);
        }
        let totalDuration = 0;
        // Check amount accuracy and product/add-on configuration
        let calculatedAmount = 0;
        try {
            let proDurationFetched = await knex
                .select(
                    PRODUCTS + ".ProductId",
                    PRODUCTS + ".PreparationTime",
                    PRODUCT_DURATIONS + ".Duration",
                    PRODUCT_DURATIONS + ".Amount"
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
                .whereIn(PRODUCTS + ".ProductId", productToFetch)
                .andWhere(PRODUCTS + ".Deleted", "=", 0)
            let addOnFetched = await knex(ADDONS)
                .select("AddOnId", "Duration", "Amount")
                .whereIn("AddOnId", addOnToFetch)
                .andWhere("Deleted", "=", 0);
            products.forEach((product, index) => {
                const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
                if (!found || found.Amount !== product.Amount) {
                    throw new Error(MESSAGE.INVALID_PRODUCT_CONFIG);
                }
                product.TotalDuration = found.Duration;
                product.TotalAmount = found.Amount;
                calculatedAmount += found.Amount;
                product.AddOns.forEach(addOn => {
                    const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
                    if (!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) {
                        throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
                    }
                    calculatedAmount += found.Amount;
                    product.TotalDuration += found.Duration;
                    product.TotalAmount += found.Amount;
                });
                product.PreparationTime = found.PreparationTime;
            });
            if (calculatedAmount !== json.Amount) {
                throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
            }
            if (json.PromoCode && json.PromoAmount) {
                calculatedAmount -= json.PromoAmount;
                calculatedAmount = calculatedAmount < 0 ? 0 : calculatedAmount;
            }
            calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));
            if (calculatedAmount !== json.PaidPrice) {
                throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
            }
        } catch (error) {
            //console.log(error);
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: error.message
                }
            }
        }
        calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));

        await getStaffCurrentICSchedule(knex, moment(json.DateTime));
        /**
         * Handling dispatch for same time and back2back conditions.
         */
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            let dispatchId = uuidv4();
            let prevProdICStaff = null;
            if (prodInc === 1) {
                if (products[0].StaffId && product.SameTime) {
                    prevProdICStaff = products[0].StaffId;
                }
            }
            let finalDispatch = await dispatchBooking({
                knex,
                staffList: product.AvailableStaff,
                dispatchId,
                productStart: moment(product.StartTime),
                productEnd: moment(product.StartTime).add(product.TotalDuration, "minute"),
                prevProdICStaff
            });
            // //console.log(finalDispatch);
            switch (finalDispatch.type) {
                case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                    /**
                     * Set product dispatch type to direct assignment.
                     * Assign the staff directly to product.
                     */
                    product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                    product.DispatchId = null;
                    product.StaffId = finalDispatch.staffId;
                    product.StaffEmail = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === finalDispatch.staffId).GoogleEmail;
                    let staffProductData = await knex(STAFF_PRODUCT)
                        .select("ProductId", "Rate")
                        .where("StaffId", "=", product.StaffId)
                        .andWhere("ProductId", "=", product.ProductId);
                    let staffRate = staffProductData[0];
                    product.StaffRate = staffRate.Rate;
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                    /**
                     * Set product dispatch type to direct assignment.
                     * Set the product dispatch id.
                     * Send the notification to given staff list.
                     */
                    if (finalDispatch.staffList.length) {
                        product.DispatchType = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                        product.DispatchId = dispatchId;
                        product.DispatchList = finalDispatch.staffList;
                        product.StaffId = null;
                    } else {
                        product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
                        product.DispatchId = "";
                        product.DispatchList = [];
                        product.StaffId = null;
                    }
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH: {
                    /**
                     * Booking is to be dispatched manually by admin.
                     * Record already inserted by dispatch function.
                     * Also no need to send notification to staff.
                     */
                    product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
                    product.DispatchId = dispatchId;
                    product.DispatchList = finalDispatch.staffList;
                    product.StaffId = null;
                    break;
                }
                default: {
                    throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
                }
            }
        }

        /**
         * Allocate staff in all products based on available staff.
         * In case of single product just loop over all staff & check their availability, select the available one.
         * In case of two products: try to check staff availability based on same index they came from time-slot.
         * If staff is exhausted then return 410
         */

        // for (let staffInc = 0; staffInc < products[0].AvailableStaff.length; staffInc++) {
        //     const staffOne = products[0].AvailableStaff[staffInc];
        //     let staffAvailable = false;
        //     const isStaffAvailable = await staffCheck(knex, {
        //         StaffId: staffOne.StaffId,
        //         Duration: products[0].TotalDuration + json.ReachOutTime,
        //         StartTime: new moment(products[0].StartTime).subtract(products[0].PreparationTime + json.ReachOutTime, "minute").utc().format()
        //     });
        //     staffAvailable = isStaffAvailable.IsAvailable;
        //     if (products.length > 1) {
        //         const staffTwo = products[1].AvailableStaff[staffInc];
        //         const isStaffTwoAvailable = await staffCheck(knex, {
        //             StaffId: staffTwo.StaffId,
        //             Duration: products[1].TotalDuration + json.ReachOutTime,
        //             StartTime: new moment(products[1].StartTime).subtract(products[1].PreparationTime + json.ReachOutTime, "minute").utc().format()
        //         });
        //         staffAvailable = isStaffTwoAvailable.IsAvailable;
        //         if (staffAvailable) {
        //             products.forEach((product, index) => {
        //                 switch (index) {
        //                     case 0:
        //                         product.StaffId = staffOne.StaffId;
        //                         product.StaffEmail = staffOne.GoogleEmail;
        //                         break;
        //                     case 1:
        //                         product.StaffId = staffTwo.StaffId;
        //                         product.StaffEmail = staffTwo.GoogleEmail;
        //                         break;
        //                 }
        //             });
        //             break;
        //         }
        //     }
        //     if (staffAvailable) {
        //         products[0].StaffId = staffOne.StaffId;
        //         products[0].StaffEmail = staffOne.GoogleEmail;
        //         break;
        //     }
        // }
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            // if (!product.StaffId || !product.StaffEmail) {
            //     return {
            //         statusCode: 410,
            //         headers: {
            //             ...Headers,
            //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
            //         }
            //     }
            // }
            if (prodInc === 0) {
                totalDuration += product.TotalDuration;
            } else {
                if (product.SameTime) {
                    if (product.TotalDuration >= products[0].TotalDuration) {
                        totalDuration = product.TotalDuration;
                    }
                } else if (products[0].StaffId === product.StaffId) {
                    totalDuration += product.PreparationTime + product.TotalDuration;
                } else {
                    totalDuration += product.TotalDuration;
                }
            }
        }

        let drctAssgnStaffNotify = [];

        if (json.Floor && typeof json.Floor === "string" && json.Floor.length > 30) {
            json.Floor = json.Floor.substr(0, 30);
        }

        let bookingFirstProTime = getBookingStartTime(products);
        STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);
        const dataSubmit = {
            BookingProvider: parseInt(process.env.BOOKING_PROVIDER_APP),
            UserId,
            Street: json.Street,
            HouseNumber: json.HouseNumber,
            Floor: json.Floor ? json.Floor : null,
            City: json.City ? json.City : null,
            Zip: json.Zip ? json.Zip : null,
            Elevator: json.Elevator ? 1 : 0,
            Amount: json.Amount,
            Duration: totalDuration,
            DateTime: moment(bookingFirstProTime).toDate(),
            ReachOutTime: json.ReachOutTime,
            PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
            AGPromoCodeId: null,
            PromoCode: json.PromoCode ? json.PromoCode : null,
            PromoAmount: json.PromoAmount ? json.PromoAmount : null,
            PaidPrice: json.PaidPrice,
            PaymentStatus: json.PaidPrice === 0 ? BOOKING_PAYMENT_STATUS.NOT_REQUIRED : BOOKING_PAYMENT_STATUS.INITIATED,
            TransactionId: null,                                        //updated after successfull payment
            TransactionDate: null,                                      //updated after successfull payment
            Status: json.PaidPrice === 0 ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.NEW,
            PredecessorBookingId: null,
            SuccessorBookingId: null,
            SystemPhase: SYSTEM_PHASE.PHASE_TWO,
            Deleted: 0,
            ...zone.getCreateUpdate()
        };
        //console.log("dataSubmit");
        //console.log(dataSubmit);
        let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
        if (bookingResult.length === 0) {
            throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
        }
        let bookingInserted = bookingResult[0];                         //now we have BookingId for further operations
        bookingCreatedId = bookingInserted;
        let autoDispatchNotifyStaff = [];
        let promoExist=[]
        let discountToValidate=0
        let totalAmountByCategory=0
        if (json.PromoCodeId) {
             promoExist = await knex(PROMOCODES).select("*").where("PromoCodeId", "=", json.PromoCodeId);
            if (promoExist.length > 0) {
                let promoCountInc = await knex(PROMOCODES)
                    .update({
                        CurrentCount: promoExist[0].CurrentCount + 1,
                        LastUpdated: zone.getLastUpdate()
                    })
                    .where("PromoCodeId", "=", json.PromoCodeId)
                let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                console.log("promoCats")
                console.log(promoCats)
                console.log("promoExist[0].Type")
                console.log(promoExist[0])
                if(promoExist[0].Type==1){
                    
                    for (let index = 0; index < products.length; index++) {
                        let product = products[index];
    
                        let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
                        console.log("catFound")
                         console.log(catFound)
                         console.log("totalAmountByCategory1",totalAmountByCategory)
                         
                        if(catFound){
                            totalAmountByCategory+=product.Amount
                            if (product.AddOns.length > 0) {
                                let AddOns = product.AddOns;
                                for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                                    const addOn = AddOns[addOnIndex];
                                    totalAmountByCategory+=addOn.Amount
                                    console.log("totalAmountByCategory2",totalAmountByCategory)
                            }
                        }
                        
                    }
                    console.log("totalAmountByCategory3",totalAmountByCategory)
                    discountToValidate=totalAmountByCategory;
                    switch(promoExist[0].Mode){
                      case 0:
                        discount=(promoExist[0].Value*totalAmountByCategory)/100;
                        break;
                      case 1:
                        discount=promoExist[0].Value;
                        break;
                      default:
                        discount=promoExist[0].Value
                        break;
                
                    }
                        
                }
                }
               
                
           
        }
    }


        for (let index = 0; index < products.length; index++) {
            let product = products[index];
            let guestInsert;
            if (product.Guest) {
                let guest = product.Guest;
                guestInsert = await knex(GUESTS)
                    .insert({
                        UserId,
                        BookingId: bookingInserted,
                        ...guest,
                        ...zone.getCreateUpdate()
                    })
            }
            
            let totalProdAmount=product.Amount
            let productInserted = await knex(BOOKING_PRODUCTS)
                .insert({
                    BookingId: bookingInserted,
                    Product: product.Name,
                    ProductId: product.ProductId,
                    CategoryId: product.CategoryId,
                    Duration: product.Duration,
                    Amount: product.Amount,
                    PreparationTime: product.PreparationTime,
                    StaffId: product.StaffId ? product.StaffId : null,
                    UserId: !product.Guest ? UserId : null,
                    GuestId: product.Guest ? guestInsert[0] : null,
                    SameTime: product.SameTime,
                    StartTime: new moment(product.StartTime).toDate(),
                    Therapist: product.Therapist,
                    ForceStaffAllot: 0,
                    Status: 0,
                    DispatchType: product.DispatchType,
                    DispatchId: product.DispatchId,
                    StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                    ...zone.getCreateUpdate()
                });
            let bookingProductId = productInserted[0];

            if (
                product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH ||
                product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH
            ) {
                // Insert the staffList to dispatch and save this staff for automatic dispatch notification.
                let productDispatchList = [];
                product.DispatchList.forEach(staff => {
                    productDispatchList.push({
                        DispatchId: product.DispatchId,
                        StaffId: staff.StaffId,
                        Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                        ...zone.getCreateUpdate()
                    });
                    if (product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH) {
                        let stFound = STAFF_CURRENT_SCHEDULE.find(sts => sts.StaffId === staff.StaffId);
                        autoDispatchNotifyStaff.push({
                            StaffId: stFound.StaffId,
                            FcmToken: stFound.FcmToken,
                            DateTime: product.StartTime,
                            DispatchId: product.DispatchId
                        });
                    }
                });
                let insertedDispatchList = await knex(BOOKING_PRODUCT_DISPATCH).insert(productDispatchList);
            }

            if (product.Extras && product.Extras.length > 0) {
                for (let extInc = 0; extInc < product.Extras.length; extInc++) {
                    const extra = product.Extras[extInc];
                    let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
                        .insert({
                            BookingProductId: bookingProductId,
                            ExtraTitle: extra.ExtraTitle,
                            ExtraValue: extra.ExtraValue,
                            ...zone.getCreateUpdate()
                        })

                }
            }

            if (product.AddOns.length > 0) {
                let AddOns = product.AddOns;
                for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                    const addOn = AddOns[addOnIndex];
                    totalProdAmount+=addOn.Amount
                    let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
                        .insert({
                            BookingId: bookingInserted,
                            BookingProductId: bookingProductId,
                            AddOnId: addOn.AddOnId,
                            AddOn: addOn.Name,
                            Duration: addOn.Duration,
                            Amount: addOn.Amount,
                            BookingAddOnPaymentId: null,
                            StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
                            ...zone.getCreateUpdate()
                        })
                }
            }
            let ProdDiscountedAmount=totalProdAmount
            let ProdDiscounted=0
            if(promoExist.length > 0){
                ProdDiscountedAmount=totalProdAmount
                ProdDiscounted=0
                if(promoExist[0].Type==0){
                    //console.log("booking")
                     ProdDiscountedAmount=totalProdAmount
                     ProdDiscounted=0
                }else{
                    let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                    let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
                    if(catFound){
                        let PromoAmount=json.PromoAmount
                        if (promoExist[0].Mode == 0 && json.PromoAmount==discountToValidate) {
                            //percent
                            //console.log("cat per")
                            let prodAmt = totalProdAmount
                            let prodDiscount = (promoExist[0].Value * prodAmt) / 100;
                            let prodDiscountedAmount = prodAmt - prodDiscount
                            ProdDiscountedAmount=prodDiscountedAmount
                            ProdDiscounted=prodDiscount
                        } else {
                            //fix
                            console.log("cat fix")
                            console.log(totalAmountByCategory)
                            console.log("json.PromoAmount",json.PromoAmount)
                            console.log("totalProdAmount",totalProdAmount)
                            

                            let discountInPercent = (json.PromoAmount / totalAmountByCategory) * 100
                            let prodAmt = totalProdAmount
                            let prodDiscount = (discountInPercent * prodAmt) / 100;
                            let prodDiscountedAmount = prodAmt - prodDiscount
                            console.log("prodDiscount",prodDiscount)
                            console.log("prodDiscountedAmount",prodDiscountedAmount)
                            //console.log("prodAmt"+prodAmt)
                            //console.log("prodDiscountedAmount"+prodDiscountedAmount)
                            //console.log("prodDiscount"+prodDiscount)
                            ProdDiscountedAmount=prodDiscountedAmount
                            ProdDiscounted=prodDiscount
                        }
                    }else{
                        //console.log("no promo on cat")
                         ProdDiscountedAmount=totalProdAmount
                         ProdDiscounted=0
                    }

                }
                
            

            }else{
                //console.log("else")
                ProdDiscountedAmount=totalProdAmount
                ProdDiscounted=0
            }
            const discountAmountUpdated = await knex(BOOKING_PRODUCTS)
                .where("BookingProductId", bookingProductId)
                .update({
                    DiscountedAmount: ProdDiscountedAmount,
                    Discount: ProdDiscounted
                })
                .modify(function (queryBuilder) {
                    console.log(queryBuilder.toSQL().toNative())
                    
                });
                //console.log("amtUp"+discountAmountUpdated)
        }

            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                // Events configuration
                if (index === 0) {
                    let startTime = new moment(product.StartTime).utc();
                    let endTime = new moment(product.StartTime).utc();
                    endTime.add(product.TotalDuration, "minute");
                    let eventObj = {
                        StaffId: product.StaffId,
                        start: {
                            dateTime: startTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        end: {
                            dateTime: endTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        attendees: [
                            { email: process.env.EMAIL },
                            { email: product.StaffEmail }
                        ],
                        Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                        BookingProductId: [bookingProductId],
                        extendedProperties: {
                            shared: {
                                'BookingId': bookingInserted,
                                'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                'ReturnTime': json.ReachOutTime
                            }
                        }
                    }
                    eventsData.push(eventObj);
                } else {
                    let found = eventsData.find(sta => sta.StaffId === product.StaffId);        //create staff entry for events if not exists already
                    if (found) {
                        found.end.dateTime = new moment(found.end.dateTime)
                            .add(product.PreparationTime + product.TotalDuration, "minute").toDate();
                        found.Products.push(product.Name + " (" + product.TotalDuration + " mins)")
                        found.BookingProductId.push(bookingProductId);
                    } else {
                        let startTime = new moment(product.StartTime).utc();
                        let endTime = new moment(product.StartTime).utc();
                        endTime.add(product.TotalDuration, "minute");
                        let eventObj = {
                            StaffId: product.StaffId,
                            start: {
                                dateTime: startTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            attendees: [
                                { email: process.env.EMAIL },
                                { email: product.StaffEmail }
                            ],
                            Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                            BookingProductId: [bookingProductId],
                            extendedProperties: {
                                shared: {
                                    'BookingId': bookingInserted,
                                    'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                    'ReturnTime': json.ReachOutTime
                                }
                            }
                        }
                        eventsData.push(eventObj);
                    }
                }

                // Push configuration
                const pushStaffFound = drctAssgnStaffNotify.find(f => f.StaffId === product.StaffId);
                if (!pushStaffFound) {
                    // let staffFcmToken = await knex(STAFF)
                    //     .select("StaffId", "FcmToken")
                    //     .where("StaffId", "=", product.StaffId);
                    // let staffData = staffFcmToken[0];
                    // let pushStaffObj = {
                    //     StaffId: staffData.StaffId,
                    //     FcmToken: staffData.FcmToken,
                    //     DateTime: product.StartTime
                    // }
                    // staffPushNotify.push(pushStaffObj);
                    let staffFcm = STAFF_CURRENT_SCHEDULE.find(st => st.StaffId === product.StaffId);
                    let pushStaffObj = {
                        StaffId: staffFcm.StaffId,
                        FcmToken: staffFcm.FcmToken,
                        DateTime: product.StartTime
                    }
                    drctAssgnStaffNotify.push(pushStaffObj);
                }
            }
        
        

        const userExist = userData[0];
        // Generate Events on google calendar
        let finalEvents = [];
        eventsData.forEach(config => {
            let description = config.Products.toString();
            finalEvents.push({
                ...config,
                summary: userExist.Name + ", Booking #" + bookingInserted,
                description
            })
        });

        for (let ev = 0; ev < finalEvents.length; ev++) {
            const event = finalEvents[ev];
            delete event.StaffId;
            const inserted = await calendar.events.insert({
                auth: oAuth2Client,
                calendarId: "primary",
                resource: event
            });
            const eventInserted = await knex(BOOKING_PRODUCTS)
                .whereIn("BookingProductId", event.BookingProductId)
                .update({
                    EventId: inserted.data.id,
                    LastUpdated: zone.getLastUpdate()
                })
            eventsCreated.push(inserted.data.id);
        }

        // var bookingData;

        if (json.PaidPrice > 0) {
            // Initiate payment procedure.
            let stripeAmount = Math.round(calculatedAmount * 100);
            //console.log(`stripeAmount: ${stripeAmount}`);
            let description = "Cocon Booking #" + bookingInserted + ", Products: " + productNames.toString();
            let customer_id = userExist.CustomerId;
            let customerEmail = userExist.Email;
            let isCreated = false;
            if (!customer_id) {
                let customerData = await createStripeCustomer(stripe, userExist, knex);
                //console.log(customerData);
                customer_id = customerData.id;
                isCreated = true;
            }
            try {
                if (!isCreated) {
                    const customerExist = await stripe.customers.retrieve(customer_id);
                    //console.log(customerExist)
                    customer_id = customerExist.id;
                }
            } catch (error) {
                //console.log(error);
                let customerData = await createStripeCustomer(stripe, userExist, knex);
                //console.log(customerData)
                customer_id = customerData.id;
            }
            let paymentIntent;
            if (json.SaveCard && json.PaymentMethod === 0) {
                paymentIntent = await stripe.paymentIntents.create({
                    amount: stripeAmount,
                    currency: CURRENCY_CODE,
                    customer: customer_id,
                    description,
                    metadata: {
                        "BookingId": bookingInserted
                    },
                    receipt_email: customerEmail,
                    setup_future_usage: 'on_session',
                    payment_method_types: ['card']
                });
            } else {
                paymentIntent = await stripe.paymentIntents.create({
                    amount: stripeAmount,
                    currency: CURRENCY_CODE,
                    customer: customer_id,
                    description,
                    metadata: {
                        "BookingId": bookingInserted
                    },
                    receipt_email: customerEmail,
                    payment_method_types: json.PaymentMethod === 0 ? ['card'] : ['ideal']
                });
            }
            //console.log(paymentIntent);
            let bookingIntentInsert = await knex(BOOKINGS).where("BookingId", "=", bookingInserted)
                .update({
                    PaymentIntent: paymentIntent.id
                })

            if (json.PaymentMethod === 1) {
                const paymentMethod = await stripe.paymentMethods.create({
                    type: "ideal",
                    ideal: {
                        bank: json.BankKey
                    }
                })
                bookingData = {
                    BookingId: bookingInserted,
                    ClientSecret: paymentIntent.client_secret,
                    PaymentMethod: paymentMethod
                }
            } else {
                bookingData = {
                    BookingId: bookingInserted,
                    ClientSecret: paymentIntent.client_secret
                }
            }
        } else {
            bookingData = {
                BookingId: bookingInserted
            }
            try {
                let lambda = new AWS.Lambda();
                let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
                lambda.invoke({
                    FunctionName: lambdaName,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        Type: 0,
                        BookingId: bookingInserted
                    })
                }, function (err, data) {
                    if (err) {
                        //console.log(err);
                    } else {
                        //console.log('Lambda_B said ' + data.Payload);
                    }
                });

                // send booking confirmation email
                let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
                lambda.invoke({
                    FunctionName: bookingNotifier,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        BookingId: bookingInserted
                    })
                }, function (err, data) {
                    if (err) {
                        //console.log(err);
                    } else {
                        //console.log('Lambda_B said ' + data.Payload);
                    }
                });

                await holdfor10secs();
                // //console.log(caller);
                //console.log("after lambda hit");
            } catch (error) {
                //console.log(error)
            }
        }

        // Auto generate remaining amount promo code
        try {
            if (json.PromoCodeId && json.RemainingAmount) {
                /**
                 * 1. Generate a random name for AG promo.
                 * 2. Generate the promo code with class AG
                 * 3. send push notification to user
                 * 4. create a user specific message
                 */
                let remAmount = Math.round(json.RemainingAmount);
                let promoExistData = await knex(PROMOCODES)
                    .select("PromoCodeId", "Type", "StartDate", "EndDate", "MinPurchaseAmount")
                    .where("PromoCodeId", "=", json.PromoCodeId);
                let promoExistDetail = promoExistData.length > 0 ? promoExistData[0] : null;
                if (remAmount >= parseInt(process.env.MIN_REMAINING_VALUE) && promoExistDetail) {
                    let codeName = null;
                    for (let chNamInc = 0; chNamInc < 5; chNamInc++) {
                        let newName = makeid(7);
                        let exist = await knex(PROMOCODES).select("PromoCodeId").where("Code", "=", newName);
                        if (exist.length === 0) {
                            codeName = newName;
                            break;
                        }
                    }
                    if (codeName) {
                        let promoIns = {
                            Code: codeName,
                            Type: promoExistDetail.Type,
                            Mode: 1,
                            StartDate: moment(promoExistDetail.StartDate).toDate(),
                            EndDate: moment(promoExistDetail.EndDate).toDate(),
                            Value: remAmount,
                            MaxAmount: remAmount,
                            MinPurchaseAmount: 5,
                            Class: 1,
                            RedeemCount: 1,
                            CurrentCount: 0,
                            ...zone.getCreateUpdate()
                        }
                        let promoInserted = await knex(PROMOCODES).insert(promoIns);
                        agPromoId = promoInserted[0];
                        let bookingAgPUp = await knex(BOOKINGS).where("BookingId", "=", bookingInserted).update({
                            AGPromoCodeId: promoInserted[0]
                        })
                        if (promoIns.Type === 1) {
                            let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                            for (let catInc = 0; catInc < promoCats.length; catInc++) {
                                let category = promoCats[catInc];
                                let obj = {
                                    PromoCodeId: promoInserted[0],
                                    CategoryId: category.CategoryId,
                                    ...zone.getCreateUpdate()
                                }
                                let catInserted = await knex(PROMOCODE_CATEGORIES).insert(obj);
                            }
                        }
                        /**
                         * send ag promo push if any
                         */
                        if (json.PaidPrice === 0) {
                            try {
                                // let title = `New promo code received`;
                                let title = PUSH.TITLE.AG_PROMO_RECEIVED;
                                let description = `New promo code: ${codeName} of amount €${remAmount} valid till ${momentz.tz(promoIns.EndDate, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DDC_YYYY + " z")}`;
                                let token = userExist.FcmToken ? userExist.FcmToken : null;
                                const msgInsert = await knex(USER_MESSAGES).insert({
                                    UserId: userExist.UserId,
                                    Title: title,
                                    Description: description,
                                    ImagePath: null,
                                    Date: moment().toDate(),
                                    ...zone.getCreateUpdate()
                                })
                                if (token) {
                                    const message = {
                                        token,
                                        notification: {
                                            title: title,
                                            body: description
                                        },
                                        data: {
                                            ScreenName: PUSH.SCREEN.MESSAGES
                                        }
                                    }
                                    try {
                                        const userApp = InitializeFirebase();
                                        const sentNotification = await userApp.messaging().send(message);
                                        //console.log(sentNotification)
                                    } catch (error) {
                                        //console.log(error);
                                    }
                                }
                            } catch (error) {
                                //console.log(error);
                            }
                        }
                    }
                }

            }
        } catch (error) {
            //console.log(error);
        }

        //console.log("drctAssgnStaffNotify");
        //console.log(drctAssgnStaffNotify);
        // send push notification to staff - For direct assignment.
        for (let pushInc = 0; pushInc < drctAssgnStaffNotify.length; pushInc++) {
            try {
                const element = drctAssgnStaffNotify[pushInc];
                let title = `New booking #${bookingInserted} received`;
                let description = `You have been allotted a new booking, scheduled on ${momentz.tz(element.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " z")}`;
                // insert staff specific message in DB
                const msgInsert = await knex(STAFF_MESSAGES).insert({
                    StaffId: element.StaffId,
                    Title: title,
                    Description: description,
                    ImagePath: null,
                    Date: moment().toDate(),
                    ...zone.getCreateUpdate()
                })
                if (element.FcmToken) {
                    const message = {
                        token: element.FcmToken,
                        notification: {
                            title,
                            body: description
                        },
                        data: {
                            BookingId: `${bookingInserted}`,
                            DateTime: moment(element.DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                            ScreenName: PUSH.SCREEN.BOOKINGS,
                            TimeZone: process.env.STAFF_ZONE
                        }
                    }
                    //console.log(message);
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotifications = await therapistApp.messaging().send(message);
                    //console.log(sentNotifications)
                }
            } catch (error) {
                //console.log(error)
            }
        }

        /**
         * The dispatch notification should be in different lambda 
         * Because it might take time to send notification to all available staff
         */
        // let notifierLambda = new aws.Lambda(); 
        // notifierLambda.invoke({
        //     FunctionName: "autoDispatchNotifier",
        //     InvocationType: "Event",
        //     Payload: autoDispatchNotifyStaff
        // }, function (err, data) {
        //     //console.log(data);
        // })
        let markToDispatched = [];
        for (let dispInc = 0; dispInc < autoDispatchNotifyStaff.length; dispInc++) {
            const staff = autoDispatchNotifyStaff[dispInc];
            let dispatchFound = markToDispatched.find(f => f === staff.DispatchId);
            if (!dispatchFound) {
                markToDispatched.push(staff.DispatchId);
            }
        }
        if (markToDispatched.length) {
            let marked = await knex(BOOKING_PRODUCT_DISPATCH)
                .whereIn("DispatchId", markToDispatched)
                .update({
                    Status: DISPATCH_STATUS.DISPATCHED
                })
        }
        await knex.destroy();
        // for (let pushInc = 0; pushInc < autoDispatchNotifyStaff.length; pushInc++) {
        //     try {
        //         const element = autoDispatchNotifyStaff[pushInc];
        //         if (element.FcmToken) {
        //             let title = `You have a booking offer.`;
        //             let description = `You have got a new booking request for ${moment(element.DateTime).utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm)}`;
        //             const message = {
        //                 token: element.FcmToken,
        //                 notification: {
        //                     title,
        //                     body: description
        //                 },
        //                 data: {
        //                     BookingId: `${bookingInserted}`,
        //                     ScreenName: PUSH.SCREEN.INCOMING_REQUEST
        //                 }
        //             }
        //             //console.log(message);
        //             const therapistApp = InitializeFirebaseTherapist();
        //             const sentNotifications = await therapistApp.messaging().send(message);
        //             //console.log(sentNotifications)
        //         }
        //     } catch (error) {
        //         //console.log(error)
        //     }
        // }

        // send notification for automatic dispatch
    } catch (error) {
        //console.log(error);
        /**
         * Rollback the booking by updating status'
         * 1. Booking status: CANCELLED
         * 2. Payment status: FAILED
         * 3. Delete the events if generated already
         * 4. Delete the auto generated promo if already created.
         */
        if (bookingCreatedId) {
            //console.log("rollback initiated");
            let bookingRollbObj = {
                Status: BOOKING_STATUS.CANCELLED,
                PaymentStatus: BOOKING_PAYMENT_STATUS.FAILED,
                LastUpdated: zone.getLastUpdate()
            }
            let bookingRollbacked = await knex(BOOKINGS)
                .where("BookingId", "=", bookingCreatedId)
                .update(bookingRollbObj);
            for (let evInc = 0; evInc < eventsCreated.length; evInc++) {
                let eventId = eventsCreated[evInc];
                //console.log(`EventId: ${eventId}`)
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        auth: oAuth2Client,
                        eventId: eventId
                    });
                } catch (error) {
                    // event might be already deleted
                    //console.log(error.message);
                }
            }
            if (agPromoId) {
                let agPromoDeleted = await knex(PROMOCODES).where("PromoCodeId", "=", agPromoId).del();
                let agPromoCatDeleted = await knex(PROMOCODE_CATEGORIES).where("PromoCodeId", "=", agPromoId).del();
            }
        } else {
            //console.log("rollback not required");
        }
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }

    //console.log(bookingData);
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.BOOKING_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingData
        })
    }
}

const getBookingStartTime = (products) => {
    let firstProductTime = moment(products[0].StartTime);
    products.forEach(product => {
        if (moment(product.StartTime).isBefore(firstProductTime)) {
            firstProductTime = moment(product.StartTime);
        }
    });
    return firstProductTime.utc().format();
}

const getStaffCurrentICSchedule = async (knex, dateTime) => {
    let staffIds = [];
    for (let staffInc = 0; staffInc < STAFF_CURRENT_SCHEDULE.length; staffInc++) {
        const staff = STAFF_CURRENT_SCHEDULE[staffInc];
        staff.InstantConfirmation = await getStaffDayScheduleByType(knex, staff.StaffId, dateTime, STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION);
        staffIds.push(staff.StaffId);
    }
    let staffGroups = await knex
        .select(
            STAFF + ".StaffId",
            STAFF + ".StaffGroupId",
            STAFF + ".FcmToken",
            STAFF_METADATA + ".Rank"
        )
        .from(STAFF)
        .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", STAFF + ".StaffId")
        .whereIn(STAFF + ".StaffId", staffIds);
    staffGroups.forEach(sta => {
        let stFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === sta.StaffId);
        stFound.StaffGroupId = sta.StaffGroupId;
        stFound.FcmToken = sta.FcmToken;
        stFound.Rank = sta.Rank;
    });
}

const dispatchBooking = async ({
    knex,
    staffList,
    dispatchId,
    productStart,
    productEnd,
    prevProdICStaff
}) => {
    /**
     * Check Automatic dispatch
        ON: 
            - Check for Instant confirmation
                ON: 
                    - Consider the global filters and try to assign the staff directly based on Group, Ranking and availability.
                        If no staff found which can work according to current filters then dispatch the booking to filtered staff.                    
                OFF: 
                    - Dispatch the booking to available staff after filtering them (if applied).
        OFF: 
            - We will just show the available staff list, so admin can dispatch to any one of them.             
     */
    let response = {
        type: null,
        staffList: null,
        staffId: null
    }
    let globalDispatchSettings = await this.getGlobalDispatchSettings(knex);
    let dispatchSettings = globalDispatchSettings.globalDispatchSettings[0];
    switch (dispatchSettings.GlobalDispatchDefault) {
        case GLOBAL_DISPATCH_SETTING.AUTOMATIC_DISPATCH: {
            switch (dispatchSettings.InstantConfirmation) {
                case GLOBAL_DISPATCH_SETTING.INSTANT_CONFIRMATION_AUTOMATIC: {
                    // Consider the global filters and try to assign staff directly.
                    if (dispatchSettings.IsFilterApplied === GLOBAL_DISPATCH_SETTING.FILTER_APPLIED) {
                        /**
                         * Filters applied - try assign to staff which fulfills filter, 
                         * If no staff has IC timing for this booking then dispatch to all available.
                         */
                        let availableStaff = STAFF_CURRENT_SCHEDULE.filter(f => {
                            let stF = staffList.find(e => e.StaffId === f.StaffId);
                            if (stF) {
                                return true;
                            } else {
                                return false;
                            }
                        });
                        let filteredStaff = [...availableStaff];
                        let groupFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.GROUP.Name);
                        let rankFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.RANK.Name);
                        // Availability based filter is already applied on timeslot level, the list is sorted
                        // let availabilityFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.AVAILABILITY);
                        filteredStaff = filteredStaff.filter(st => {
                            if (globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === st.StaffGroupId)) {
                                return true;
                            } else {
                                return false;
                            }
                        })
                        if (dispatchSettings.IsPriorityActive) {
                            filteredStaff.forEach(staff => {
                                let staffGroup = globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === staff.StaffGroupId);
                                staff.StaffGroupPriority = staffGroup.Priority;
                            });
                        }
                        if (rankFilter.IsActive) {
                            filteredStaff.sort((a, b) => b.Rank - a.Rank);
                        }
                        let icAvailStaff = await checkICBookTiming(filteredStaff, productStart, productEnd);
                        if (prevProdICStaff) {
                            icAvailStaff = icAvailStaff.filter(f => f.StaffId !== prevProdICStaff);
                        }
                        if (icAvailStaff.length) {
                            if (icAvailStaff.length > 1) {
                                response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                                response.staffList = [];
                                // The staffList is from timeslot for each product and is already sorted based on availability. 

                                // check if group priority applied
                                if (dispatchSettings.IsPriorityActive) {
                                    // sort the icAvailStaff list based on group priority.
                                    icAvailStaff.sort((a, b) => a.StaffGroupPriority - b.StaffGroupPriority);
                                }
                                response.staffId = icAvailStaff[0].StaffId;
                                // staffList.every(availableFillStaff => {
                                //     let firstStaff = icAvailStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                                //     if (firstStaff) {
                                //         response.staffId = firstStaff.StaffId;
                                //         return false;
                                //     }
                                //     return true;
                                // });
                            } else {
                                // Only one staff available assign it.
                                response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                                response.staffList = [];
                                response.staffId = icAvailStaff[0].StaffId;
                            }
                        } else {
                            // filtered staff don't have IC timing, dispatch the booking to filtered staff.
                            let autoDispatchList = [];
                            filteredStaff.forEach(element => {
                                autoDispatchList.push({
                                    DispatchId: dispatchId,
                                    StaffId: element.StaffId,
                                    StaffEmail: element.GoogleEmail,
                                    Status: DISPATCH_STATUS.DISPATCHED,
                                    ...zone.getCreateUpdate()
                                });
                            });
                            response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                            response.staffList = autoDispatchList;



                            // let otherStaff = availableStaff.filter(f => {
                            //     let fromFiltered = filteredStaff.find(s => s.StaffId === f.StaffId);
                            //     if (!fromFiltered) {
                            //         return true;
                            //     }
                            //     return false;
                            // })
                            // let icOtherStaff = await checkICBookTiming(otherStaff, productStart, productEnd);
                            // if (icOtherStaff.length) {
                            //     if (icOtherStaff.length > 1) {
                            //         // Availability based filter to be applied here.
                            //         response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                            //         response.staffList = [];
                            //         staffList.every(availableFillStaff => {
                            //             let firstStaff = icOtherStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                            //             if (firstStaff) {
                            //                 response.staffId = firstStaff.StaffId;
                            //                 return false;
                            //             }
                            //             return true;
                            //         });
                            //     } else {
                            //         // Only one staff available assign it.
                            //         response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                            //         response.staffList = [];
                            //         response.staffId = icOtherStaff[0].StaffId;
                            //     }
                            // } else {
                            //     // no staff found, dispatch to all available.
                            //     response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                            //     response.staffList = staffList;
                            //     response.staffId = null;
                            // }
                        }
                    } else {
                        /**
                         * Filters not applied, try assign to any staff with IC timing.
                         * If no staff has IC timing for this booking then dispatch to all available.
                         */
                        let icAvailAllStaff = await checkICBookTiming(staffList, productStart, productEnd);
                        if (prevProdICStaff) {
                            icAvailAllStaff = icAvailAllStaff.filter(f => f.StaffId !== prevProdICStaff);
                        }
                        if (icAvailAllStaff.length) {
                            if (icAvailAllStaff.length > 1) {
                                response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                                response.staffList = [];
                                staffList.every(availableFillStaff => {
                                    let firstStaff = icAvailAllStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                                    if (firstStaff) {
                                        response.staffId = firstStaff.StaffId;
                                        return false;
                                    }
                                    return true;
                                });
                            } else {
                                // Only one staff available assign it.
                                response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                                response.staffList = [];
                                response.staffId = icAvailAllStaff[0].StaffId;
                            }
                        } else {
                            // no staff found, dispatch to all available.
                            response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                            response.staffList = staffList;
                            response.staffId = null;
                        }
                    }
                    break;
                }
                case GLOBAL_DISPATCH_SETTING.INSTANT_CONFIRMATION_MANUAL: {
                    // Return the staff list based on filter applied or not.
                    if (dispatchSettings.IsFilterApplied === GLOBAL_DISPATCH_SETTING.FILTER_APPLIED) {
                        /**
                         * Filters applied - return only those staff, which comes in filter.
                         */
                        let availableStaff = STAFF_CURRENT_SCHEDULE.filter(f => {
                            let stF = staffList.find(e => e.StaffId === f.StaffId);
                            if (stF) {
                                return true;
                            } else {
                                return false;
                            }
                        });
                        let filteredStaff = [...availableStaff];
                        let groupFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.GROUP.Name);
                        // if (groupFilter.IsActive) {
                        filteredStaff = filteredStaff.filter(st => {
                            if (globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === st.StaffGroupId)) {
                                return true;
                            } else {
                                return false;
                            }
                        })
                        // }
                        response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                        response.staffList = [];
                        filteredStaff.forEach(element => {
                            response.staffList.push({
                                DispatchId: dispatchId,
                                StaffId: element.StaffId,
                                StaffEmail: element.GoogleEmail,
                                Status: DISPATCH_STATUS.DISPATCHED,
                                ...zone.getCreateUpdate()
                            })
                        });
                    } else {
                        /**
                         * Filters not applied, return all available staff.
                         */
                        let autoStaffList = [];
                        staffList.forEach(element => {
                            autoStaffList.push({
                                DispatchId: dispatchId,
                                StaffId: element.StaffId,
                                StaffEmail: element.GoogleEmail,
                                Status: DISPATCH_STATUS.DISPATCHED,
                                ...zone.getCreateUpdate()
                            });
                        });
                        response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                        response.staffList = autoStaffList;
                    }
                    break;
                }
            }
            break;
        }
        case GLOBAL_DISPATCH_SETTING.MANUAL_DISPATCH: {
            // Return the given staff list for admin to manual dispatch.
            let manualStaffList = [];
            staffList.forEach(element => {
                manualStaffList.push({
                    DispatchId: dispatchId,
                    StaffId: element.StaffId,
                    StaffEmail: element.GoogleEmail,
                    Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                    ...zone.getCreateUpdate()
                });
            });
            response.type = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
            response.staffList = manualStaffList;
            break;
        }
        default: {
            throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
        }
    }
    return response;
}

const dispatchBookingCMS = async ({
    knex,
    staffList,
    dispatchId,
    productStart,
    productEnd,
    prevProdICStaff
}) => {
    /**
     * Check Automatic dispatch
        ON: 
            - Check for Instant confirmation
                ON: 
                    - Consider the global filters and try to assign the staff directly based on Group, Ranking and availability.
                        If no staff found which can work according to current filters then dispatch the booking to filtered staff.                    
                OFF: 
                    - Dispatch the booking to available staff after filtering them (if applied).
        OFF: 
            - We will just show the available staff list, so admin can dispatch to any one of them.             
     */
    let response = {
        type: null,
        staffList: null,
        staffId: null
    }
    let globalDispatchSettings = await this.getGlobalDispatchSettings(knex);
    let dispatchSettings = globalDispatchSettings.globalDispatchSettings[0];
    switch (dispatchSettings.InstantConfirmation) {
        case GLOBAL_DISPATCH_SETTING.INSTANT_CONFIRMATION_AUTOMATIC: {
            // Consider the global filters and try to assign staff directly.
            if (dispatchSettings.IsFilterApplied === GLOBAL_DISPATCH_SETTING.FILTER_APPLIED) {
                /**
                 * Filters applied - try assign to staff which fulfills filter, 
                 * If no staff has IC timing for this booking then dispatch to all available.
                 */
                let availableStaff = STAFF_CURRENT_SCHEDULE.filter(f => {
                    let stF = staffList.find(e => e.StaffId === f.StaffId);
                    if (stF) {
                        return true;
                    } else {
                        return false;
                    }
                });
                let filteredStaff = [...availableStaff];
                let groupFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.GROUP.Name);
                let rankFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.RANK.Name);
                // Availability based filter is already applied on timeslot level, the list is sorted
                // let availabilityFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.AVAILABILITY);
                filteredStaff = filteredStaff.filter(st => {
                    if (globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === st.StaffGroupId)) {
                        return true;
                    } else {
                        return false;
                    }
                })
                if (dispatchSettings.IsPriorityActive) {
                    filteredStaff.forEach(staff => {
                        let staffGroup = globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === staff.StaffGroupId);
                        staff.StaffGroupPriority = staffGroup.Priority;
                    });
                }
                if (rankFilter.IsActive) {
                    filteredStaff.sort((a, b) => b.Rank - a.Rank);
                }
                let icAvailStaff = await checkICBookTiming(filteredStaff, productStart, productEnd);
                if (icAvailStaff.length) {
                    if (icAvailStaff.length > 1) {
                        response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                        response.staffList = [];
                        // The staffList is from timeslot for each product and is already sorted based on availability. 

                        // check if group priority applied
                        if (dispatchSettings.IsPriorityActive) {
                            // sort the icAvailStaff list based on group priority.
                            icAvailStaff.sort((a, b) => a.StaffGroupPriority - b.StaffGroupPriority);
                        }
                        response.staffId = icAvailStaff[0].StaffId;
                        // staffList.every(availableFillStaff => {
                        //     let firstStaff = icAvailStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                        //     if (firstStaff) {
                        //         response.staffId = firstStaff.StaffId;
                        //         return false;
                        //     }
                        //     return true;
                        // });
                    } else {
                        // Only one staff available assign it.
                        response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                        response.staffList = [];
                        response.staffId = icAvailStaff[0].StaffId;
                    }
                } else {
                    // filtered staff don't have IC timing, dispatch the booking to filtered staff.
                    let autoDispatchList = [];
                    filteredStaff.forEach(element => {
                        autoDispatchList.push({
                            DispatchId: dispatchId,
                            StaffId: element.StaffId,
                            StaffEmail: element.GoogleEmail,
                            Status: DISPATCH_STATUS.DISPATCHED,
                            ...zone.getCreateUpdate()
                        });
                    });
                    response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                    response.staffList = autoDispatchList;



                    // let otherStaff = availableStaff.filter(f => {
                    //     let fromFiltered = filteredStaff.find(s => s.StaffId === f.StaffId);
                    //     if (!fromFiltered) {
                    //         return true;
                    //     }
                    //     return false;
                    // })
                    // let icOtherStaff = await checkICBookTiming(otherStaff, productStart, productEnd);
                    // if (icOtherStaff.length) {
                    //     if (icOtherStaff.length > 1) {
                    //         // Availability based filter to be applied here.
                    //         response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                    //         response.staffList = [];
                    //         staffList.every(availableFillStaff => {
                    //             let firstStaff = icOtherStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                    //             if (firstStaff) {
                    //                 response.staffId = firstStaff.StaffId;
                    //                 return false;
                    //             }
                    //             return true;
                    //         });
                    //     } else {
                    //         // Only one staff available assign it.
                    //         response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                    //         response.staffList = [];
                    //         response.staffId = icOtherStaff[0].StaffId;
                    //     }
                    // } else {
                    //     // no staff found, dispatch to all available.
                    //     response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                    //     response.staffList = staffList;
                    //     response.staffId = null;
                    // }
                }
            } else {
                /**
                 * Filters not applied, try assign to any staff with IC timing.
                 * If no staff has IC timing for this booking then dispatch to all available.
                 */
                let icAvailAllStaff = await checkICBookTiming(staffList, productStart, productEnd);
                if (prevProdICStaff) {
                    icAvailAllStaff = icAvailAllStaff.filter(f => f.StaffId !== prevProdICStaff);
                }
                if (icAvailAllStaff.length) {
                    if (icAvailAllStaff.length > 1) {
                        response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                        response.staffList = [];
                        staffList.every(availableFillStaff => {
                            let firstStaff = icAvailAllStaff.find(f => f.StaffId === availableFillStaff.StaffId);
                            if (firstStaff) {
                                response.staffId = firstStaff.StaffId;
                                return false;
                            }
                            return true;
                        });
                    } else {
                        // Only one staff available assign it.
                        response.type = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                        response.staffList = [];
                        response.staffId = icAvailAllStaff[0].StaffId;
                    }
                } else {
                    // no staff found, dispatch to all available.
                    response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                    response.staffList = staffList;
                    response.staffId = null;
                }
            }
            break;
        }
        case GLOBAL_DISPATCH_SETTING.INSTANT_CONFIRMATION_MANUAL: {
            // Return the staff list based on filter applied or not.
            if (dispatchSettings.IsFilterApplied === GLOBAL_DISPATCH_SETTING.FILTER_APPLIED) {
                /**
                 * Filters applied - return only those staff, which comes in filter.
                 */
                let availableStaff = STAFF_CURRENT_SCHEDULE.filter(f => {
                    let stF = staffList.find(e => e.StaffId === f.StaffId);
                    if (stF) {
                        return true;
                    } else {
                        return false;
                    }
                });
                let filteredStaff = [...availableStaff];
                let groupFilter = globalDispatchSettings.globalDispatchFilters.find(f => f.Name === ENUM_DISPATCH_FILTERS.GROUP.Name);
                filteredStaff = filteredStaff.filter(st => {
                    if (globalDispatchSettings.activeStaffGroups.find(f => f.StaffGroupId === st.StaffGroupId)) {
                        return true;
                    } else {
                        return false;
                    }
                })
                response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                response.staffList = [];
                filteredStaff.forEach(element => {
                    response.staffList.push({
                        DispatchId: dispatchId,
                        StaffId: element.StaffId,
                        StaffEmail: element.GoogleEmail,
                        Status: DISPATCH_STATUS.DISPATCHED,
                        ...zone.getCreateUpdate()
                    })
                });
            } else {
                /**
                 * Filters not applied, return all available staff.
                 */
                let autoStaffList = [];
                staffList.forEach(element => {
                    autoStaffList.push({
                        DispatchId: dispatchId,
                        StaffId: element.StaffId,
                        StaffEmail: element.GoogleEmail,
                        Status: DISPATCH_STATUS.DISPATCHED,
                        ...zone.getCreateUpdate()
                    });
                });
                response.type = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                response.staffList = autoStaffList;
            }
            break;
        }
    }
    return response;
}

module.exports.getGlobalDispatchSettings = async (knex) => {
    let globalDispatchSettings = await knex(BOOKING_PREFERENCE).select("*");
    let globalDispatchFilters = null, activeStaffGroups = [];
    if (globalDispatchSettings[0].IsFilterApplied === GLOBAL_DISPATCH_SETTING.FILTER_APPLIED) {
        // fetch global applied filters
        globalDispatchFilters = await knex(DISPATCH_FILTERS).select("*");
        activeStaffGroups = await knex(STAFF_GROUP).select("StaffGroupId", "Priority").where("IsUsedInFilter", "=", 1);
    }
    let dispatchSettings = {
        globalDispatchSettings,
        globalDispatchFilters,
        activeStaffGroups
    }
    return dispatchSettings;
}

const checkICBookTiming = async (staffList, startTime, endTime) => {
    let eligibleICStaff = [];
    let bookingDate = moment(startTime).format(DATE_TIME_FORMAT.DD_MMM_YYYY);
    STAFF_ZONE = zone.getStaffZone(startTime);

    //console.log(staffList)
    //console.log(startTime)
    //console.log(endTime)
    for (let staffInc = 0; staffInc < staffList.length; staffInc++) {
        const staff = staffList[staffInc];
        const staffICTiming = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
        if (staffICTiming.InstantConfirmation.IsWorking) {
            let icStart = moment(bookingDate + ", " + staffICTiming.InstantConfirmation.DayStart + " " + STAFF_ZONE, DATE_TIME_FORMAT.DD_MMM_YYYYC_HHcmm_Z);
            let icEnd = moment(bookingDate + ", " + staffICTiming.InstantConfirmation.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.DD_MMM_YYYYC_HHcmm_Z);
            //console.log(icStart);
            //console.log(icEnd);
            if (
                (icStart.isBefore(startTime) || icStart.isSame(startTime)) &&
                (icEnd.isAfter(endTime) || icEnd.isSame(endTime))
            ) {
                //console.log("ic available StaffId: " + staff.StaffId);
                eligibleICStaff.push(staff);
            } else {
                //console.log("ic not available StaffId: " + staff.StaffId);
            }
        }
    }
    return eligibleICStaff;
}

module.exports.autoDispatchNotifier = async (event) => {
    try {
        // for automatic dispatch notifications:
        //console.log("event");
        //console.log(event);
    } catch (error) {
        //console.log(error)
        return {
            statusCode: 400
        };
    }
    return {
        statusCode: 200,
        body: JSON.stringify({
            "hello": "world"
        })
    };
}

const createStripeCustomerInvoice = async (stripe, userExist, knex, bookingObj) => {
    let customer;
    try {
        let email = null
        if (bookingObj && bookingObj.InvoiceId) {
            email = bookingObj.InvoiceEmail
        } else {
            email = userExist.Email
        }
         customer = await stripe.customers.create({
            email: email,
            name: userExist.Name,
            address: {
                line1: userExist.Street
            }
        });
        const updateUser = await knex(USERS).where("UserId", "=", userExist.UserId).update({
            CustomerId: customer.id
        })
    }
    catch (error) {
        //console.log(error)
        throw new Error(error.Message)
    }
    return customer;
}
const createStripeCustomer = async (stripe, userExist, knex) => {
    const customer = await stripe.customers.create({
        email: userExist.Email ? userExist.Email : null,
        name: userExist.Name,
        address: {
            line1: userExist.Street
        }
    });
    const updateUser = await knex(USERS).where("UserId", "=", userExist.UserId).update({
        CustomerId: customer.id
    })
    return customer;
}

module.exports.stripeWebhook = async (event) => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        console.log(json);
        if (json.data.object.metadata && !json.data.object.metadata.BookingId) {
            //console.log(json);
            return {
                statusCode: 200,
                headers: {
                    ...Headers
                }
            }
        }
        let bookingId, tipId = null, bookingAddOnPaymentId = null;
        let paymentStatus, transactionId, transactionDate;
        var knex = require("knex")(con);
        if (json.type === 'payment_intent.succeeded') {
            console.log("1")
            let data = json.data;
            bookingId = data.object.metadata.BookingId;
            paymentStatus = 1;
            if (typeof data.object.metadata.BookingId === 'string') {
                bookingId = parseInt(data.object.metadata.BookingId);
            }
            if (data.object.metadata.BookingTipId) {
                typeof data.object.metadata.BookingTipId === "string"
                    ? tipId = parseInt(data.object.metadata.BookingTipId)
                    : tipId = data.object.metadata.BookingTipId;

                /**
                 * First find fetch all the staff in this booking.
                 * Divide the tip amount by number of staff creating equal tips for all staff.
                 * Update the staff tip received by adding there respective tip
                 */

                let existStaff = await knex(BOOKING_PRODUCTS).select("StaffId").where("BookingId", "=", bookingId);
                let tipForEach = (data.object.amount / 100) / existStaff.length;
                for (let staffInc = 0; staffInc < existStaff.length; staffInc++) {
                    const staffId = existStaff[staffInc].StaffId;
                    const staffData = await knex(STAFF).select("TipReceived").where("StaffId", "=", staffId);
                    const existingTip = (staffData.length>0)?staffData[0].TipReceived:0;
                    let updateObj = {
                        TipReceived: 0
                    }
                    if (existingTip === 0) {
                        updateObj.TipReceived = tipForEach;
                    } else {
                        updateObj.TipReceived = existingTip + tipForEach;
                    }
                    let staffTipUpdated = await knex(STAFF).where("StaffId", "=", staffId).update(updateObj);
                }
            }
            if (data.object.metadata.BookingAddOnPaymentId) {
                bookingAddOnPaymentId = parseInt(data.object.metadata.BookingAddOnPaymentId);
            }
            transactionId = data.object.charges.data[0].id;
            transactionDate = moment.unix(data.object.charges.data[0].created).toDate();
           
        }
        if (json.type === 'payment_intent.payment_failed') {
            console.log("2")
            let data = json.data;
            bookingId = data.object.metadata.BookingId;
            paymentStatus = 3;
            if (typeof data.object.metadata.BookingId === 'string') {
                bookingId = parseInt(data.object.metadata.BookingId);
            }
            if (data.object.metadata.BookingTipId) {
                typeof data.object.metadata.BookingTipId === "string"
                    ? tipId = parseInt(data.object.metadata.BookingTipId)
                    : tipId = data.object.metadata.BookingTipId;

            }
            if (data.object.metadata.BookingAddOnPaymentId) {
                bookingAddOnPaymentId = data.object.metadata.BookingAddOnPaymentId;
            }
            transactionId = data.object.id;
            transactionDate = moment.unix(data.object.created).toDate();
        }
        if (json.type === 'payment_intent.canceled') {
            console.log("3")
            let data = json.data;
            bookingId = data.object.metadata.BookingId;
            paymentStatus = 2;
            if (typeof data.object.metadata.BookingId === 'string') {
                bookingId = parseInt(data.object.metadata.BookingId);
            }
            if (data.object.metadata.BookingTipId) {
                typeof data.object.metadata.BookingTipId === "string"
                    ? tipId = parseInt(data.object.metadata.BookingTipId)
                    : tipId = data.object.metadata.BookingTipId;

            }
            if (data.object.metadata.BookingAddOnPaymentId) {
                bookingAddOnPaymentId = data.object.metadata.BookingAddOnPaymentId;
            }
            transactionId = data.object.id;
            transactionDate = moment.unix(data.object.created).toDate();
        }

        let updateObj = {
            PaymentStatus: paymentStatus,
            TransactionId: transactionId,
            TransactionDate: transactionDate,
            LastUpdated: zone.getLastUpdate()
        }
        console.log(updateObj)
        if (tipId) {
            console.log("tip payment")
            connected = true;
            let tipUpdated = await knex(BOOKING_TIPS).where("BookingTipId", "=", tipId)
                .update(updateObj)
        } else if (bookingAddOnPaymentId) {
            console.log("addOn payment")
            let addOnsUpdated = await knex(BOOKING_ADDON_PAYMENTS).where("BookingAddOnPaymentId", bookingAddOnPaymentId)
                .update(updateObj);
            try {
                let addOnStaff = await knex
                    .select(
                        BOOKING_PRODUCT_ADDONS + ".BookingAddOnPaymentId",
                        BOOKING_PRODUCT_ADDONS + ".BookingProductId",
                        BOOKING_PRODUCTS + ".StartTime",
                        BOOKING_PRODUCTS + ".StaffId",
                        STAFF + ".FcmToken",
                    )
                    .from(BOOKING_PRODUCT_ADDONS)
                    .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingProductId", BOOKING_PRODUCT_ADDONS + ".BookingProductId")
                    .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
                    .where(BOOKING_PRODUCT_ADDONS + ".BookingAddOnPaymentId", "=", bookingAddOnPaymentId)
                let pushStaffNotified = [];
                for (let aIn = 0; aIn < addOnStaff.length; aIn++) {
                    const addOn = addOnStaff[aIn];
                    if (addOn.StaffId) {
                        let found = pushStaffNotified.find(f => f === addOn.StaffId);
                        if (!found) {
                            let title = "Add-on payment successful";
                            const description = `The user have completed the add-on payment for the booking #${bookingId} - ${momentz.tz(addOn.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                            let inserted = await knex(STAFF_MESSAGES).insert({
                                StaffId: addOn.StaffId,
                                Title: title,
                                Description: description,
                                Date: moment().toDate(),
                                ImagePath: null,
                                Tag: MESSAGE_TAG.NORMAL,
                                ...zone.getCreateUpdate()
                            })
                            if (addOn.FcmToken) {
                                const message = {
                                    token: addOn.FcmToken,
                                    notification: {
                                        title,
                                        body: description
                                    },
                                    data: {
                                        BookingId: `${bookingId}`,
                                        DateTime: moment(addOn.StartTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                        ScreenName: PUSH.SCREEN.BOOKINGS,
                                        TimeZone: process.env.STAFF_ZONE
                                    }
                                }
                                try {
                                    const therapistApp = InitializeFirebaseTherapist();
                                    const sentNotification = await therapistApp.messaging().send(message);
                                    //console.log(sentNotification)
                                } catch (error) {
                                    //console.log(error);
                                }
                            }
                            pushStaffNotified.push(addOn.StaffId);
                        }
                    }
                }

                let bookingAmountData = await knex
                    .select(
                        BOOKINGS + ".BookingId",
                        BOOKINGS + ".Amount",
                        BOOKINGS + ".PaidPrice"
                    )
                    .from(BOOKINGS)
                    .where(BOOKINGS + ".BookingId", "=", bookingId);
                let existBookingAmount = bookingAmountData[0].Amount;
                let existPaidPrice = bookingAmountData[0].PaidPrice;
                let paidIntent = json.data.object.amount_received / 100;
                let updated = await knex(BOOKINGS)
                    .where("BookingId", "=", bookingId)
                    .update({
                        Amount: existBookingAmount + paidIntent,
                        PaidPrice: existPaidPrice + paidIntent,
                        LastUpdated: zone.getLastUpdate()
                    });
                // let totalAmount = 0, totalPaid = 0;
                // for (let boPro = 0; boPro < bookingAmountData.length; boPro++) {
                //     const product = bookingAmountData[boPro];
                //     totalAmount += product.ProductAmount;
                //     totalPaid += product.totalPaid;
                //     let addOns = await knex(BOOKING_PRODUCT_ADDONS)
                //         .select(
                //             BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                //             BOOKING_PRODUCT_ADDONS + ".Amount as AddOnAmount",
                //             BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                //             BOOKING_PRODUCT_ADDONS + ".RequestStatus",
                //             BOOKING_PRODUCT_ADDONS + ".BookingAddOnPaymentId"
                //         )
                //         .where(BOOKING_PRODUCT_ADDONS + ".BookingProductId", "=", product.BookingProductId);
                //     for (let addInc = 0; addInc < addOns.length; addInc++) {
                //         const element = addOns[addInc];

                //     }
                // }
            } catch (error) {
                //console.log(error);
            }
        } else {
            console.log("booking payment")
            if (paymentStatus === 1) {
                updateObj.Status = BOOKING_STATUS.CONFIRMED;
            }
            let bookUpdated = await knex(BOOKINGS).where("BookingId", "=", bookingId)
                .update(updateObj);
            try {
                let lambda = new AWS.Lambda();
                let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
                lambda.invoke({
                    FunctionName: lambdaName,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        Type: 0,
                        BookingId: bookingId
                    })
                }, function (err, data) {
                    if (err) {
                        //console.log(err);
                    } else {
                        //console.log('Lambda_B said ' + data.Payload);
                    }
                });
                // await holdfor10secs();
                if (paymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED) {
                    // send booking confirmation email
                    let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
                    console.log(bookingNotifier)
                    lambda.invoke({
                        FunctionName: bookingNotifier,
                        InvocationType: 'Event',
                        LogType: 'Tail',
                        Payload: JSON.stringify({
                            BookingId: bookingId
                        })
                    }, function (err, data) {
                        if (err) {
                            //console.log(err);
                        } else {
                            //console.log('Lambda_B said ' + data.Payload);
                        }
                    });
                    await holdfor10secs();
                }
            } catch (error) {
                console.log(error)
            }
        }
        //console.log("before exit");
        await knex.destroy();
    } catch (error) {
        console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers
        }
    }
    //console.log('sdfsdfdsf');
}

module.exports.saveTip = async event => {
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            !json.UserId || typeof json.UserId !== "number" ||
            !json.TipAmount || typeof json.TipAmount !== "number" ||
            json.PaymentMethod < 0 || typeof json.PaymentMethod !== "number" ||
            json.PaymentMethod > 1
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.PaymentMethod === 1 && !json.BankKey) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        const userData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                USERS + ".CustomerId",
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .where(BOOKINGS + ".BookingId", json.BookingId)
        if (userData.length <= 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        const userExist = userData[0];
        const tipExist = await knex(BOOKING_TIPS).select("BookingTipId", "PaymentStatus").where("BookingId", "=", json.BookingId);
        if (tipExist.length > 0 && tipExist.PaymentStatus === 1) {
            throw new Error(MESSAGE.TIP_ALREADY_GIVEN);
        }
        const tipInserted = await knex(BOOKING_TIPS)
            .insert({
                BookingId: json.BookingId,
                UserId: json.UserId,
                TipAmount: json.TipAmount,
                PaymentStatus: 0,
                TransactionId: null,
                TransactionDate: null,
                ...zone.getCreateUpdate()
            })
        if (tipInserted.length <= 0) {
            throw new Error(MESSAGE.TIP_SAVE_FAILED);
        }
        await knex.destroy();
        const tipId = tipInserted[0];

        // Initiate payment procedure.
        var description = "Tip #" + tipId + " for Cocon Booking #" + json.BookingId;
        var customer_id = userExist.CustomerId;
        var isCreated = false;
        const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
        if (!customer_id) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            //console.log(customerData);
            customer_id = customerData.id;
            isCreated = true;
        }
        try {
            if (!isCreated) {
                const customerExist = await stripe.customers.retrieve(customer_id);
                //console.log(customerExist);
                customer_id = customerExist.id;
            }
        } catch (error) {
            //console.log(error);
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            //console.log(customerData);
            customer_id = customerData.id;
        }

        if (json.SaveCard && json.PaymentMethod === 0) {
            var paymentIntent = await stripe.paymentIntents.create({
                amount: json.TipAmount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingTipId": tipId
                },
                setup_future_usage: 'on_session',
                payment_method_types: ['card']
            });
        } else {
            var paymentIntent = await stripe.paymentIntents.create({
                amount: json.TipAmount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingTipId": tipId
                },
                payment_method_types: json.PaymentMethod === 0 ? ['card'] : ['ideal']
            });
        }
        //console.log(paymentIntent);
        if (json.PaymentMethod === 1) {
            const paymentMethod = await stripe.paymentMethods.create({
                type: "ideal",
                ideal: {
                    bank: json.BankKey
                }
            })
            var tipData = {
                BookingId: json.BookingId,
                BookingTipId: tipId,
                ClientSecret: paymentIntent.client_secret,
                PaymentMethod: paymentMethod
            }
        } else {
            var tipData = {
                BookingId: json.BookingId,
                BookingTipId: tipId,
                ClientSecret: paymentIntent.client_secret
            }
        }
        //console.log(tipData)

    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.TIP_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: tipData
        })
    }
}

module.exports.updateBooking = async event => {
    /**
     * Objective: request add-ons to therapist and auto accept add-ons.
     * Working:
     * 1. Verify user with booking (get the details from DB)
     * 2. Collect staff to which we need to send push and message
     * 3. Foreach add-on: Mark as auto accepted if
     *      a) the product is not yet accepted by any staff.
     *      b) the staff in product has auto accept add-on turned ON.
     * 4. Insert the add-ons to DB
     * 5. Update booking duration and paid price.
     * 6. Send message and notification to staff for add-on request.
     * 7. Send message and notification to staff for auto accepted add-ons.
     * 8. Update booking calendar events.
     */


    let knex, connected = false, response;
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        let tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        const json = event.body ? getPayloadData(event) : {};
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId ||
            !json.BookingId ||
            // !json.BookingAddOnPaymentId ||
            !json.AddOn ||
            json.AddOn.length === 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        let updatedBookingAmount = 0;
        let bookingProductIdToFetch = [];
        let durationToAdd = 0;
        json.AddOn.forEach(element => {
            if (!element.BookingProductId || !element.AddOnId || !element.Name || !element.Duration || !element.Amount) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const found = bookingProductIdToFetch.find(f => f === element.BookingProductId);
            if (!found) {
                bookingProductIdToFetch.push(element.BookingProductId);
            }
            // updatedBookingAmount += element.Amount;
            // durationToAdd += element.Duration;
        });
        knex = require("knex")(con);
        connected = true;

        // verify user with booking
        let existBookingData = await knex(BOOKINGS)
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                BOOKINGS + ".Amount",
                BOOKINGS + ".Duration",
                BOOKINGS + ".PaidPrice",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".SystemPhase",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".StaffId",
                STAFF + ".FcmToken",
                BOOKING_PRODUCTS + ".EventId",
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", json.BookingId)
            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
            .where(BOOKINGS + ".BookingId", "=", json.BookingId)
            .andWhere(BOOKINGS + ".UserId", "=", json.UserId);
        if (existBookingData.length === 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }

        // collect staff to which we need to send push and message
        let staffMessages = [];
        STAFF_ZONE = zone.getStaffZone(moment(existBookingData[0].DateTime).utc().format())
        const bookingDateTime = momentz.tz(existBookingData[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z);
        existBookingData.forEach(element => {
            if (element.StaffId) {
                const found = bookingProductIdToFetch.find(f => f === element.BookingProductId);
                if (found) {
                    const staffFound = staffMessages.find(fi => fi.StaffId === element.StaffId);
                    if (!staffFound) {
                        staffMessages.push({
                            StaffId: element.StaffId,
                            FcmToken: element.FcmToken,
                            Title: PUSH.TITLE.ADDON_REQ_RECEIVED,
                            Description: `A new add-on request is received in booking #${json.BookingId} - ${bookingDateTime}`
                        })
                    }
                }
            }
        });

        let autoAcceptAddOns = [];
        // insert add-ons to db
        let insertedAddOnsId = [];
        for (let addOnInc = 0; addOnInc < json.AddOn.length; addOnInc++) {
            const element = json.AddOn[addOnInc];
            let staffExist = await knex
                .select(
                    BOOKING_PRODUCTS + ".StaffId",
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StartTime",
                    BOOKING_PRODUCTS + ".Duration as ProductDuration",
                    BOOKING_PRODUCTS + ".StaffAmount as ProductStaffAmount",
                    BOOKING_PRODUCTS + ".StartTime",
                    STAFF + ".FcmToken",
                    STAFF_METADATA + ".AutoAcceptAddonRequest"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
                .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
                .where(BOOKING_PRODUCTS + ".BookingProductId", "=", element.BookingProductId);
            let autoAccepted = false;
            if (staffExist.length) {
                if (
                    !staffExist[0].StaffId ||
                    (staffExist[0].StaffId && staffExist[0].AutoAcceptAddonRequest) ||
                    existBookingData[0].SystemPhase === SYSTEM_PHASE.PHASE_ONE
                ) {
                    autoAccepted = true;
                    updatedBookingAmount += element.Amount;
                }
            }
            let staffAmount = null;
            if (existBookingData[0].SystemPhase === SYSTEM_PHASE.PHASE_TWO) {
                if (staffExist[0].ProductStaffAmount && autoAccepted) {
                    let rate = getRateForTreatment(staffExist[0].ProductDuration, staffExist[0].ProductStaffAmount);
                    staffAmount = getAmountForTreatment(element.Duration, rate);
                }
            }
            const inserted = await knex(BOOKING_PRODUCT_ADDONS)
                .insert({
                    BookingId: json.BookingId,
                    BookingProductId: element.BookingProductId,
                    AddOnId: element.AddOnId,
                    AddOn: element.Name,
                    Duration: element.Duration,
                    Amount: element.Amount,
                    ExtraAddOn: 1,
                    // BookingAddOnPaymentId: json.BookingAddOnPaymentId,
                    BookingAddOnPaymentId: null,
                    Status: BOOKING_PRODUCT_ADD_ON_STATUS.NOT_STARTED,
                    RequestStatus: autoAccepted ? ADDON_REQUEST_STATUS.ACCEPTED : ADDON_REQUEST_STATUS.PENDING,
                    StaffAmount: staffAmount,
                    AutoAccepted: autoAccepted ? 1 : 0,
                    ...zone.getCreateUpdate()
                })
            insertedAddOnsId.push(inserted[0])
            if (autoAccepted) {
                autoAcceptAddOns.push({
                    BookingProductId: element.BookingProductId,
                    BookingProductAddOnId: inserted[0],
                    Amount: element.Amount,
                    StaffId: staffExist[0].StaffId ? staffExist[0].StaffId : null,
                    FcmToken: staffExist[0].StaffId && staffExist[0].FcmToken ? staffExist[0].FcmToken : null,
                    PushTime: staffExist[0].StartTime ? staffExist[0].StartTime : null
                })
            }
        }

        // update booking
        let finalPaidPrice = existBookingData[0].PaidPrice + updatedBookingAmount;
        let finalAmount = existBookingData[0].Amount + updatedBookingAmount;
        let finalDuration = existBookingData[0].Duration;
        let updateObj = {
            // Amount: finalAmount,
            Duration: 0,
            // PaidPrice: finalPaidPrice,
            LastUpdated: zone.getLastUpdate()
        }


        // Fetch booking durations data and update duration;
        let bookDurs = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".Duration",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".Duration as ProductDuration",
                BOOKING_PRODUCTS + ".PreparationTime",
                BOOKING_PRODUCTS + ".SameTime",
                BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                BOOKING_PRODUCT_ADDONS + ".RequestStatus",
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .where(BOOKINGS + ".BookingId", "=", json.BookingId)
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
        let bookingDurationData = {
            BookingId: bookDurs[0].BookingId,
            Duration: bookDurs[0].Duration,
            Products: []
        }

        bookDurs.forEach(booking => {
            let prodFound = bookingDurationData.Products.find(f => f.BookingProductId === booking.BookingProductId);
            if (!prodFound) {
                let prodObj = {
                    BookingProductId: booking.BookingProductId,
                    Duration: booking.ProductDuration,
                    PreparationTime: booking.PreparationTime,
                    SameTime: booking.SameTime,
                    AddOns: []
                }
                if (booking.BookingProductAddOnId) {
                    if (!booking.ExtraAddOn) {
                        prodObj.AddOns.push({
                            BookingProductAddOnId: booking.BookingProductAddOnId,
                            Duration: booking.AddOnDuration,
                        })
                    } else {
                        if (booking.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                            prodObj.AddOns.push({
                                BookingProductAddOnId: booking.BookingProductAddOnId,
                                Duration: booking.AddOnDuration
                            })
                        }
                    }
                }
                bookingDurationData.Products.push(prodObj);
            } else {
                if (booking.BookingProductAddOnId) {
                    let addOnFound = prodFound.AddOns.find(f => f.BookingProductAddOnId === booking.BookingProductAddOnId);
                    if (!addOnFound) {
                        if (!booking.ExtraAddOn) {
                            prodFound.AddOns.push({
                                BookingProductAddOnId: booking.BookingProductAddOnId,
                                Duration: booking.AddOnDuration
                            })
                        } else {
                            if (booking.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                prodFound.AddOns.push({
                                    BookingProductAddOnId: booking.BookingProductAddOnId,
                                    Duration: booking.AddOnDuration
                                })
                            }
                        }
                    }
                }
            }
        });

        bookingDurationData.Products.forEach((product, index) => {
            let totalDuration = product.Duration;
            product.AddOns.forEach(element => {
                totalDuration += element.Duration;
            });
            if (index === 0) {
                updateObj.Duration += totalDuration;
            } else {
                if (product.SameTime) {
                    if (totalDuration > updateObj.Duration) {
                        updateObj.Duration = totalDuration;
                    }
                } else {
                    totalDuration += product.PreparationTime;
                    updateObj.Duration += totalDuration;
                }
            }
        });
        if (json.Street) {
            updateObj.Street = json.Street;
        }
        if (json.Floor) {
            updateObj.Floor = json.Floor;
        }
        if (json.HouseNumber) {
            updateObj.HouseNumber = json.HouseNumber;
        }
        const bookingUpdated = await knex(BOOKINGS).where("BookingId", "=", json.BookingId)
            .update(updateObj);

        for (let staffMsgInc = 0; staffMsgInc < staffMessages.length; staffMsgInc++) {
            const element = staffMessages[staffMsgInc];
            // Insert message
            let existInAutoAccept = autoAcceptAddOns.find(f => f.StaffId === element.StaffId);
            if (element.StaffId && !existInAutoAccept) {
                const msgInsert = await knex(STAFF_MESSAGES).insert({
                    StaffId: element.StaffId,
                    Title: element.Title,
                    Description: element.Description,
                    ImagePath: null,
                    Date: moment().toDate(),
                    ...zone.getCreateUpdate()
                })
                // send push
                if (element.FcmToken) {
                    try {
                        const message = {
                            token: element.FcmToken,
                            notification: {
                                title: element.Title,
                                body: element.Description,
                            },
                            data: {
                                BookingId: `${json.BookingId}`,
                                DateTime: moment(existBookingData[0].DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                ScreenName: PUSH.SCREEN.INCOMING_REQUEST,
                                TimeZone: process.env.STAFF_ZONE
                            }
                        }
                        const therapistApp = InitializeFirebaseTherapist();
                        const sentNotifications = await therapistApp.messaging().send(message);
                        //console.log(sentNotifications)
                    } catch (error) {
                        //console.log(error)
                    }
                }
            }
        }
        let sent = [];
        for (let aIn = 0; aIn < autoAcceptAddOns.length; aIn++) {
            const staff = autoAcceptAddOns[aIn];
            if (!staff.StaffId) {
                continue;
            }
            let alreadySent = sent.find(f => f === staff.StaffId);
            if (alreadySent) {
                continue;
            }
            let title = "Add-ons accepted";
            let desc = `A new add-on is added to the booking #${json.BookingId} - ${momentz.tz(staff.PushTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
            const msgInsert = await knex(STAFF_MESSAGES).insert({
                StaffId: staff.StaffId,
                Title: title,
                Description: desc,
                ImagePath: null,
                Date: moment().toDate(),
                Tag: 1,
                ...zone.getCreateUpdate()
            })
            // send push
            if (staff.FcmToken) {
                try {
                    const message = {
                        token: staff.FcmToken,
                        notification: {
                            title: title,
                            body: desc,
                        },
                        data: {
                            BookingId: `${json.BookingId}`,
                            DateTime: moment(staff.PushTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                            ScreenName: PUSH.SCREEN.BOOKINGS,
                            TimeZone: process.env.STAFF_ZONE
                        }
                    }
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotifications = await therapistApp.messaging().send(message);
                    //console.log(sentNotifications)
                } catch (error) {
                    //console.log(error)
                }
            }
        }
        await knex.destroy();
        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingRateCalculation = getLambdaNameByInstance() + "-calculateBookingStaffRate";
            console.log(bookingRateCalculation)
            lambda.invoke({
                FunctionName: bookingRateCalculation,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: json.BookingId
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    console.log('Lambda_Push said ' + data.Payload);
                }
            });

            // await holdfor10secs();
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            console.log(error)
        }
        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingRateCalculation = getLambdaNameByInstance() + "-calculateAddonStaffRate";
            console.log(bookingRateCalculation)
            lambda.invoke({
                FunctionName: bookingRateCalculation,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: json.BookingId
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    console.log('Lambda_Push said ' + data.Payload);
                }
            });

            
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            console.log(error)
        }
        await holdfor10secs();

        // collect booking event ids.
        let bookingEventIds = [];
        existBookingData.forEach(element => {
            bookingEventIds.push({
                BookingProductId: element.BookingProductId,
                EventId: element.EventId
            })
        });

        response = {
            AutoAcceptAddOns: autoAcceptAddOns
        };

        // // fetch events from google calendar of this booking.
        // const fetchedEvents = await calendar.events.list({
        //     calendarId: "primary",
        //     timeMin: moment(existBookingData[0].DateTime).utc().toDate(),
        //     timeMax: moment(existBookingData[0].DateTime).add(existBookingData[0].Duration, "minute").utc().toDate(),
        //     timeZone: "UTC"
        // })

        // // filter out booking events from fetched events.
        // let bookingEvents = fetchedEvents.data.items;
        // const bookingStartTime = moment(existBookingData[0].DateTime);
        // let addOnsDurationAdded = 0;
        // let eventsToUpdate = [];
        // for (let eventId = 0; eventId < bookingEventIds.length; eventId++) {
        //     const dbEvent = bookingEventIds[eventId];
        //     const eventDetail = bookingEvents.find(ev => ev.id === dbEvent.EventId);
        //     const requestedAddOns = json.AddOn.filter(addOn => addOn.BookingProductId === dbEvent.BookingProductId);
        //     const eventStartTime = moment(eventDetail.start.dateTime);
        //     if (requestedAddOns.length === 0) {
        //         // no addOns requested just check if its b2b event then update its timing start & end by adding addOnDurationAdded
        //         if (!eventStartTime.isSame(bookingStartTime)) {
        //             if (addOnsDurationAdded > 0) {
        //                 eventsToUpdate.push({
        //                     EventId: eventDetail.id,
        //                     startTime: moment(eventDetail.start.dateTime).add(addOnsDurationAdded, "minute").utc().toDate(),
        //                     endTime: moment(eventDetail.end.dateTime).add(addOnsDurationAdded, "minute").utc().toDate()
        //                 })
        //             }
        //         }
        //     } else {
        //         let reqAddOnsDuration = 0;
        //         requestedAddOns.forEach(element => {
        //             reqAddOnsDuration += element.Duration;
        //         });
        //         let objToPush = {
        //             EventId: eventDetail.id,
        //             startTime: eventDetail.start.dateTime,
        //             endTime: eventDetail.end.dateTime
        //         }
        //         if (eventStartTime.isSame(bookingStartTime)) {
        //             // need to add reqAddOnsDuration at end
        //             objToPush.endTime = moment(objToPush.endTime).add(reqAddOnsDuration, "minute").utc().toDate();
        //         } else {
        //             // need to add addOnsDurationAdded at start and reqAddOnsDuration at end
        //             objToPush.startTime = moment(objToPush.startTime).add(addOnsDurationAdded, "minute").utc().toDate();
        //             objToPush.endTime = moment(objToPush.endTime).add(reqAddOnsDuration + addOnsDurationAdded, "minute").utc().toDate();
        //         }
        //         addOnsDurationAdded = reqAddOnsDuration;
        //         eventsToUpdate.push(objToPush);
        //     }
        // }

        // // update events in calendar
        // for (let eventInc = 0; eventInc < eventsToUpdate.length; eventInc++) {
        //     const event = eventsToUpdate[eventInc];
        //     const eventPatched = await calendar.events.patch({
        //         eventId: event.EventId,
        //         calendarId: "primary",
        //         requestBody: {
        //             start: {
        //                 dateTime: event.startTime,
        //                 timeZone: process.env.TIME_ZONE
        //             },
        //             end: {
        //                 dateTime: event.endTime,
        //                 timeZone: process.env.TIME_ZONE
        //             }
        //         }
        //     })
        // }
    } catch (error) {
        //console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.checkAddOnStaff = async event => {
    let knex, connected = false, response = [];
    try {
        const headers = event.headers;
        // //console.log(headers);
        let isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        let tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId ||
            !json.AddOn ||
            json.AddOn.length <= 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        if (compareVersions.compare(event.headers['api-version'], '1.3.2', '<=')) {
            //console.log("older versions");
            json.AddOn.forEach(element => {
                element.IsAvailable = false;
            });
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    message: MESSAGE.STAFF_NOT_AVAILABLE
                },
                body: setPayloadData(event, {
                    Data: json.AddOn
                })
            }
        }

        var addOnToFetch = [];
        var bookingProductIds = [];
        json.AddOn.forEach(element => {
            if (!element.BookingProductId || !element.AddOnId || !element.Duration || !element.Amount) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const bpfound = bookingProductIds.find(f => f === element.BookingProductId);
            if (!bpfound) {
                bookingProductIds.push(element.BookingProductId);
            }
            const addOnFound = addOnToFetch.find(f => f === element.AddOnId);
            if (!addOnFound) {
                addOnToFetch.push(element.AddOnId);
            }
        });
        knex = require("knex")(con);
        connected = true;
        // fetch add-ons of given AddOnId to check for conflict
        let addOnsFetched = await knex
            .select(
                ADDONS + ".AddOnId",
                ADDONS + ".Duration",
                ADDONS + ".Amount",
            )
            .from(ADDONS)
            .whereIn(ADDONS + ".AddOnId", addOnToFetch)
            .andWhere(ADDONS + ".Deleted", 0)
        try {
            // check for add-on configuration match or if add-on is deleted
            json.AddOn.forEach(addOn => {
                const found = addOnsFetched.find(f => f.AddOnId === addOn.AddOnId);
                if (!found) {
                    throw new Error(MESSAGE.ADDON_NOT_FOUND);
                }
                if (addOn.Duration !== found.Duration || addOn.Amount !== found.Amount) {
                    throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
                }
            });
        } catch (error) {
            //console.log(error);
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    message: error.message
                },
            }
        }
        // no conflict after this.
        // fetch BookingId, duration, dateTime, etc.
        const bookingExist = await knex(BOOKINGS)
            .select("BookingId", "DateTime")
            .where("BookingId", "=", json.BookingId);
        if (bookingExist.length <= 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        const bookingData = bookingExist[0];
        const bookingDate = moment(bookingData.DateTime).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);

        // fetch booking products data - staff, eventId, sametime.
        var bookingProductExist = await knex
            .select(
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".EventId",
                BOOKING_PRODUCTS + ".StaffId",
                BOOKING_PRODUCTS + ".Status",
                STAFF + ".GoogleEmail",
            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
            .andWhere(BOOKING_PRODUCTS + ".BookingId", "=", json.BookingId)
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
        json.AddOn.forEach(element => {
            const productExist = bookingProductExist.find(f => f.BookingProductId === element.BookingProductId);
            if (!productExist) {
                throw new Error(MESSAGE.BOOKING_PRODUCT_NOT_EXIST);
            }
            if (!productExist.StaffId) {
                element.StaffNotAssigned = true;
            }
            let allowedProdStatus = [
                BOOKING_PRODUCT_STATUS.COMPLETED,
                BOOKING_PRODUCT_STATUS.CANCELLED,
                BOOKING_PRODUCT_STATUS.LAPSED,
                BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                BOOKING_PRODUCT_STATUS.CANCELLED_MANUALLY
            ]
            if (allowedProdStatus.includes(productExist.Status)) {
                element.ProductFinished = true;
            }
        });
        let staffIds = [];
        bookingProductExist.forEach(element => {
            const staffFound = staffIds.find(f => f === element.StaffId);
            if (!staffFound) {
                staffIds.push(element.StaffId);
            }
        });
        let staffBlockTimes = [];
        for (let staffInc = 0; staffInc < bookingProductExist.length; staffInc++) {
            const element = bookingProductExist[staffInc];
            if (!element.StaffId) {
                continue;
            }
            let staffDayWorking = await staffDaySchedule(knex, element.StaffId, moment(bookingData.DateTime));
            //console.log(staffDayWorking);
            //console.log(bookingData);
            let finalTimings = getDayTimesGOnIC(moment(bookingData.DateTime).format(DATE_TIME_FORMAT.MMLDDLYYYY), staffDayWorking.GeneralOffer.DayStart ? staffDayWorking.GeneralOffer : {}, staffDayWorking.InstantConfirmation.DayStart ? staffDayWorking.InstantConfirmation : {});
            //console.log(finalTimings);
            element.DayStart = finalTimings.DayStart;
            element.DayEnd = finalTimings.DayEnd;
            if (finalTimings.Blocks.length) {
                finalTimings.Blocks.forEach(block => {
                    staffBlockTimes.push({
                        StaffId: element.StaffId,
                        StaffBlockTimeId: block.StaffBlockTimeId,
                        GoogleEmail: element.GoogleEmail,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime
                    });
                });
            }
            if (
                staffDayWorking.BlockTime &&
                staffDayWorking.BlockTime.Blocks
            ) {
                staffDayWorking.BlockTime.Blocks.forEach(block => {
                    staffBlockTimes.push({
                        StaffId: element.StaffId,
                        StaffBlockTimeId: block.StaffBlockTimeId,
                        GoogleEmail: element.GoogleEmail,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime
                    })
                });
            }
        }
        // for (let staffInc = 0; staffInc < staffIds.length; staffInc++) {
        //     const element = staffIds[staffInc];
        //     const found = bookingProductExist.find(f => f.StaffId === element);
        //     let staffDayWorking = await staffDaySchedule(knex, element, moment(bookingData.DateTime))
        //     found.DayStart = staffDayWorking.DayStart;
        //     found.DayEnd = staffDayWorking.DayEnd;
        //     staffDayWorking.Block.forEach(block => {
        //         staffBlockTimes.push({
        //             StaffId: element,
        //             StaffBlockTimeId: block.StaffBlockTimeId,
        //             GoogleEmail: found.GoogleEmail,
        //             StartTime: block.StartTime,
        //             EndTime: block.EndTime
        //         })
        //     });

        // }
        let minTime = moment(bookingData.DateTime);
        let maxTime = moment(bookingData.DateTime).endOf("day");
        // fetched events includes all events in given duration.
        let fetchedEvents = [];
        let staffVacations = await getTodayVacation({ knex: knex, date: bookingData.DateTime, staffId: staffIds });
        for (let staffVac = 0; staffVac < staffVacations.length; staffVac++) {
            const vacation = staffVacations[staffVac];
            if (vacation.Template !== VACATION_TEMPLATE.FULL_DAY) {
                fetchedEvents.push({
                    id: vacation.EventId,
                    attendees: [
                        {
                            email: process.env.EMAIL
                        },
                        {
                            email: vacation.StaffMail
                        }
                    ],
                    start: {
                        dateTime: moment(vacation.StartTime).utc().format()
                    },
                    end: {
                        dateTime: moment(vacation.EndTime).utc().format()
                    },
                })
            }
        }
        let todayBookingEvents = await getTodayBookingEvents({ knex: knex, date: moment(bookingData.DateTime).format(DATE_TIME_FORMAT.MMLDDLYYYY) });
        todayBookingEvents.forEach(element => {
            fetchedEvents.push(element);
        });
        // let fetchedEvents = await calendar.events.list({
        //     calendarId: "primary",
        //     timeMin: minTime.toDate(),
        //     timeMax: maxTime.toDate(),
        //     timeZone: "UTC"
        // })
        await knex.destroy();
        // bookingStaffEvents includes events of staff which are in current booking, events may also include other booking events
        let bookingStaffEvents = [];
        fetchedEvents.forEach(event => {
            const attendee = event.attendees.filter(att => att.email !== process.env.EMAIL)[0];
            const attendeeFound = bookingProductExist.find(f => f.GoogleEmail === attendee.email);
            if (attendeeFound) {
                let pushObj = {
                    id: event.id,
                    startTime: moment(event.start.dateTime),
                    endTime: moment(event.end.dateTime),
                    attendee: attendeeFound.GoogleEmail
                }
                if (event.extendedProperties && event.extendedProperties.shared.ReachOutTime) {
                    const toSub = parseInt(event.extendedProperties.shared.ReachOutTime) + parseInt(process.env.BUFFER_AFTER);
                    pushObj.startTime = moment(event.start.dateTime).subtract(toSub, "minute");
                }
                if (event.extendedProperties && event.extendedProperties.shared.ReturnTime) {
                    const toAdd = parseInt(event.extendedProperties.shared.ReturnTime) + parseInt(process.env.BUFFER_AFTER);
                    pushObj.endTime = moment(event.end.dateTime).add(toAdd, "minute");
                }
                bookingStaffEvents.push(pushObj);
            }
        });
        STAFF_ZONE = zone.getStaffZone(moment(bookingData.DateTime).utc().format());
        staffBlockTimes.forEach(element => {
            let toPush = {
                id: element.StaffBlockTimeId,
                startTime: moment(bookingDate + " " + element.StartTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.YYYYdaMMdaDD_HHcmmcss_Z),
                endTime: moment(bookingDate + " " + element.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.YYYYdaMMdaDD_HHcmmcss_Z),
                attendee: element.GoogleEmail
            }
            bookingStaffEvents.push(toPush)
        });

        bookingStaffEvents = bookingStaffEvents.sort((a, b) => {
            return a.startTime - b.startTime;
        })

        // bookingEvents only includes events of current booking
        let bookingEvents = [];
        fetchedEvents.forEach(event => {
            const eventFound = bookingProductExist.find(f => f.EventId === event.id);
            if (eventFound) {
                const attendee = event.attendees.filter(att => att.email !== process.env.EMAIL)[0];
                let pushObj = {
                    id: event.id,
                    startTime: moment(event.start.dateTime),
                    endTime: moment(event.end.dateTime),
                    attendee: attendee.email
                }
                if (event.extendedProperties && event.extendedProperties.shared.ReachOutTime) {
                    pushObj.ReachOutTime = parseInt(event.extendedProperties.shared.ReachOutTime);
                }
                if (event.extendedProperties && event.extendedProperties.shared.ReturnTime) {
                    pushObj.ReturnTime = parseInt(event.extendedProperties.shared.ReturnTime);
                }
                bookingEvents.push(pushObj);
            }
        });
        bookingEvents = bookingEvents.sort((a, b) => {
            return a.startTime - b.startTime;
        })

        response = json.AddOn;
        // check availability here
        for (let addOnInc = 0; addOnInc < response.length; addOnInc++) {
            let addOnAvailable = false;
            const addOn = response[addOnInc];
            if (addOn.StaffNotAssigned) {
                delete addOn.StaffNotAssigned;
                addOn.IsAvailable = true;
                continue;
            }
            if (addOn.ProductFinished) {
                delete addOn.ProductFinished;
                addOn.IsAvailable = false;
                continue;
            }
            const duration = addOn.Duration;
            const bookingProductData = bookingProductExist.find(f => f.BookingProductId === addOn.BookingProductId);
            const currentEventId = bookingProductData.EventId;
            const eventDetails = bookingEvents.find(event => event.id === currentEventId);
            const originalEndTime = moment(eventDetails.endTime);
            const currentEventStartTime = moment(eventDetails.startTime);
            let toAdd = 0;
            if (eventDetails.ReturnTime) {
                toAdd += (parseInt(eventDetails.ReturnTime) + parseInt(process.env.BUFFER_AFTER));
            }
            const currentEventEndTime = moment(eventDetails.endTime)
            currentEventEndTime.add(toAdd, "minute");

            // filter that particular staff events from bookingStaffEvents into staffOtherEvents
            const staffOtherEvents = bookingStaffEvents.filter(event => {
                const staffEmail = bookingProductData.GoogleEmail;
                const attendee = event.attendee;
                const startTime = moment(event.startTime);
                const endTime = moment(event.endTime);
                var previousEvent = false;
                if (startTime.isBefore(currentEventStartTime) && endTime.isBefore(currentEventStartTime)) {
                    previousEvent = true;
                }
                if (staffEmail === attendee && event.id !== currentEventId && !previousEvent) {
                    return true;
                } else {
                    return false;
                }
            })
            // create time for which we want no events to occur.
            const freeTill = moment(currentEventEndTime);
            freeTill.add(duration, "minute");
            if (staffOtherEvents.length === 0) {
                addOnAvailable = true;
            }

            // check with remaining events of this staff with freeTill should be less than event start time
            for (let stOthEInc = 0; stOthEInc < staffOtherEvents.length; stOthEInc++) {
                const otherEvent = staffOtherEvents[stOthEInc];
                if (otherEvent.startTime.isAfter(freeTill) || otherEvent.startTime.isSame(freeTill)) {
                    addOnAvailable = true;
                } else {
                    addOnAvailable = false;
                    break;
                }
            }
            // let dayEnd = moment(bookingData.DateTime).startOf("day").set("hour", parseInt(process.env.DAY_END));
            // dayEnd = moment(dayEnd.format("YYYY-MM-DD HH:mm") + " " + STAFF_ZONE, "YYYY-MM-DD HH:mm Z");
            let tempDate = moment(bookingData.DateTime).format(DATE_TIME_FORMAT.MMLDDLYYYY);
            let dayEnd = moment(tempDate + " " + bookingProductData.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
            if (freeTill.isAfter(dayEnd)) {
                addOnAvailable = false;
            }

            // other staff booking events after this event if any
            const otherBookingEvents = bookingEvents.filter(event => {
                if (event.id !== currentEventId) {
                    const eventStartTime = event.startTime;
                    if (eventStartTime.isSame(eventDetails.endTime) || eventStartTime.isAfter(eventDetails.endTime)) {
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            })
            // for every other event in current booking, check that event staff availability
            for (let otherEvnInc = 0; otherEvnInc < otherBookingEvents.length; otherEvnInc++) {
                const event = otherBookingEvents[otherEvnInc];

                // get staff of event and find its other events in current booking.
                const currentAttendee = event.attendee;
                const currentStaffSchedule = bookingProductExist.find(f => f.GoogleEmail === currentAttendee);
                const eventStartTime = moment(event.startTime);
                const currentStaffEventInBooking = bookingEvents.filter(bookingEvent => {
                    const attendee = bookingEvent.attendee;
                    const startTime = moment(bookingEvent.startTime);
                    const endTime = moment(bookingEvent.endTime);
                    let toAdd = 0;
                    if (bookingEvent.ReturnTime) {
                        toAdd += (parseInt(bookingEvent.ReturnTime) + parseInt(process.env.BUFFER_AFTER));
                    }
                    endTime.add(toAdd, "minute");
                    let previousEvent = false;
                    if (startTime.isBefore(eventStartTime) && endTime.isBefore(eventStartTime)) {
                        previousEvent = true;
                    }
                    if (attendee === currentAttendee.email && event.id !== event.id && !previousEvent) {
                        return true;
                    } else {
                        return false;
                    }
                })

                // get its last event in current booking.
                let currentStaffLastEvent, currentStaffLastEventStart;
                if (currentStaffEventInBooking.length === 0) {
                    addOnAvailable = true;
                    currentStaffLastEvent = event;
                    currentStaffLastEventStart = eventStartTime;
                } else {
                    currentStaffLastEvent = currentStaffEventInBooking[currentStaffEventInBooking.length - 1];
                    currentStaffLastEventStart = moment(currentStaffLastEvent.startTime);
                }

                // find if there's any other event of this staff in any other booking.
                const currentStaffOtherEvents = bookingStaffEvents.filter(staffEvent => {
                    const staffEmail = currentAttendee;
                    const attendee = staffEvent.attendee;
                    const startTime = moment(staffEvent.startTime);
                    const endTime = moment(staffEvent.endTime);
                    var previousEvent = false;
                    if (startTime.isBefore(currentStaffLastEventStart) && endTime.isBefore(currentStaffLastEventStart)) {
                        previousEvent = true;
                    }
                    if (staffEmail === attendee && event.id !== staffEvent.id && !previousEvent) {
                        return true;
                    } else {
                        return false;
                    }
                })


                // create time for which we want no events to occur.
                const newFreeTill = moment(currentStaffLastEvent.endTime);
                newFreeTill.add(duration, "minute");
                let toAdd = 0;
                if (currentStaffLastEvent.ReturnTime) {
                    toAdd += (parseInt(currentStaffLastEvent.ReturnTime) + parseInt(process.env.BUFFER_AFTER));
                }
                newFreeTill.add(toAdd, "minute");
                if (currentStaffOtherEvents.length === 0) {
                    addOnAvailable = true;
                }

                // check with remaining events of this staff with newFreeTill should be less than event start time
                for (let curStOthEInc = 0; curStOthEInc < currentStaffOtherEvents.length; curStOthEInc++) {
                    const curStOtherEvent = currentStaffOtherEvents[curStOthEInc];
                    if (curStOtherEvent.startTime.isAfter(newFreeTill) || curStOtherEvent.startTime.isSame(newFreeTill)) {
                        addOnAvailable = true;
                    } else {
                        addOnAvailable = false;
                        break;
                    }
                }
                let newTempDate = moment(tempDate + " " + currentStaffSchedule.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
                if (newFreeTill.isAfter(newTempDate)) {
                    addOnAvailable = false;
                }
            }

            addOn.IsAvailable = addOnAvailable;
            // update all events in bookingEvents temporarily if add-on is available
            if (addOnAvailable) {
                bookingEvents.forEach(element => {
                    if (element.id === eventDetails.id) {
                        element.endTime = element.endTime.add(duration, "minute");
                    } else {
                        if (element.startTime.isSame(originalEndTime) ||
                            element.startTime.isAfter(originalEndTime)) {
                            element.startTime = element.startTime.add(duration, "minute");
                            element.endTime = element.endTime.add(duration, "minute");
                        }
                    }
                });
            }
        }
        //console.log(response);
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.STAFF_AVAIL_CHECKED
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.confirmBooking = async event => {
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            typeof json.PaymentStatus !== "number"         //1-succeeded, 2-cancelled, 3-failed
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        var bookingData = {
            BookingId: json.BookingId,
            PaymentStatus: json.PaymentStatus,
        };
        if (json.PaymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED) {
            const paymentIntent = await knex(BOOKINGS).select("PaymentIntent").where("BookingId", "=", json.BookingId);
            const intentDetails = await stripe.paymentIntents.retrieve(paymentIntent[0].PaymentIntent);
            const found = intentDetails.charges.data.find(f => f.status === "succeeded");
            const updateObj = {
                PaymentStatus: BOOKING_PAYMENT_STATUS.SUCCEEDED,
                TransactionId: found.id,
                Status: BOOKING_STATUS.CONFIRMED,
                TransactionDate: moment.unix(found.created).toDate(),
                LastUpdated: zone.getLastUpdate()
            }
            const updateBookingData = await knex(BOOKINGS)
                .where("BookingId", "=", json.BookingId)
                .update(updateObj);
        }
        bookingData.Status = BOOKING_STATUS.CONFIRMED;
        if (
            json.PaymentStatus === BOOKING_PAYMENT_STATUS.CANCELLED ||
            json.PaymentStatus === BOOKING_PAYMENT_STATUS.FAILED
        ) {
            // mark booking payment status failed and status cancelled.
            const paymentIntent = await knex(BOOKINGS).select("PaymentIntent").where("BookingId", "=", json.BookingId);
            const intentDetails = await stripe.paymentIntents.retrieve(paymentIntent[0].PaymentIntent);
            let bookingUdpated = await knex(BOOKINGS).where("BookingId", "=", json.BookingId)
                .update({
                    PaymentStatus: json.PaymentStatus,
                    Status: BOOKING_STATUS.CANCELLED,
                    TransactionId: json.PaymentIntent,
                    TransactionDate: moment.unix(intentDetails.created).toDate()
                })

            // fetch events from db & delete from calendar.
            let bookingEvents = await knex(BOOKING_PRODUCTS).select("EventId").where("BookingId", "=", json.BookingId);
            for (let eleInc = 0; eleInc < bookingEvents.length; eleInc++) {
                const element = bookingEvents[eleInc];
                try {
                    const deleted = await calendar.events.delete({
                        calendarId: "primary",
                        auth: oAuth2Client,
                        eventId: element.EventId
                    })
                } catch (error) {
                    //console.log(error);
                }
            }
            bookingData.Status = BOOKING_STATUS.CANCELLED;
        }

        await knex.destroy();
    } catch (error) {
        //console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_STATUS_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingData
        })
    }
}

function makeid(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result.toUpperCase();
}

module.exports.captureAddOnPayment = async event => {
    let knex, connected = false, response;
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId ||
            !json.UserId ||
            !json.Amount ||
            !json.AddOns
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let totalAmount = 0;
        json.AddOns.forEach(addOn => {
            if (
                !addOn.BookingProductId ||
                !addOn.BookingProductAddOnId ||
                !addOn.Amount
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            totalAmount += addOn.Amount;
        });

        if (totalAmount !== json.Amount) {
            throw new Error(MESSAGE.INVALID_TOTAL_AMOUNT);
        }

        knex = require("knex")(con);
        let bookingExist = await knex
            .select(
                USERS + ".UserId",
                USERS + ".CustomerId",
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId as BookingUser",
                BOOKINGS + ".PaymentStatus",
            )
            .from(USERS)
            .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", json.BookingId)
            .where(USERS + ".UserId", "=", json.UserId)
        if (bookingExist.length <= 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        const bookingData = bookingExist[0];
        if (bookingData.UserId !== bookingData.BookingUser) {
            throw new Error("Booking" + json.BookingId + " does not exist for UserId" + json.UserId)
        }
        let allowedPaymentStatus = [
            BOOKING_PAYMENT_STATUS.SUCCEEDED,
            BOOKING_PAYMENT_STATUS.MANUAL,
            BOOKING_PAYMENT_STATUS.NOT_REQUIRED
        ];
        if (!allowedPaymentStatus.includes(bookingData.PaymentStatus)) {
            throw new Error(MESSAGE.BOOKING_PAY_FIRST);
        }

        let addOnCaptureInsert = await knex(BOOKING_ADDON_PAYMENTS).insert({
            BookingId: json.BookingId,
            UserId: json.UserId,
            Amount: json.Amount,
            PaymentStatus: ADDON_PAYMENTS_STATUS.INITIATED,
            TransactionId: null,
            TransactionDate: null,
            ...zone.getCreateUpdate()
        })
        let bookingAddOnPaymentId = addOnCaptureInsert[0];
        let bookingProductAddOnIds = [];
        json.AddOns.forEach(element => {
            bookingProductAddOnIds.push(element.BookingProductAddOnId);
        });
        let paymentIdAttached = await knex(BOOKING_PRODUCT_ADDONS)
            .whereIn("BookingProductAddOnId", bookingProductAddOnIds)
            .update({
                BookingAddOnPaymentId: bookingAddOnPaymentId,
                LastUpdated: zone.getLastUpdate()
            })

        // initiate payment procedure
        var description = "Cocon Booking #" + json.BookingId + " for extra Add-ons";
        var customer_id = bookingData.CustomerId;
        var isCreated = false;
        if (!customer_id) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            customer_id = customerData.id;
            isCreated = true;
        }
        try {
            if (!isCreated) {
                const customerExist = await stripe.customers.retrieve(customer_id);
                customer_id = customerExist.id;
            }
        } catch (error) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            customer_id = customerData.id;
        }
        var paymentIntent;
        if (json.SaveCard && json.PaymentMethod === 0) {
            paymentIntent = await stripe.paymentIntents.create({
                amount: json.Amount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingAddOnPaymentId": bookingAddOnPaymentId
                },
                setup_future_usage: 'on_session',
                payment_method_types: ['card']
            });
        } else {
            paymentIntent = await stripe.paymentIntents.create({
                amount: json.Amount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingAddOnPaymentId": bookingAddOnPaymentId
                },
                payment_method_types: json.PaymentMethod === 0 ? ['card'] : ['ideal']
            });
        }
        //console.log(paymentIntent)
        let intentInserted = await knex(BOOKING_ADDON_PAYMENTS)
            .where("BookingAddOnPaymentId", "=", bookingAddOnPaymentId)
            .update({
                PaymentIntent: paymentIntent.id
            })
        let addOnData = {
            BookingAddOnPaymentId: bookingAddOnPaymentId,
            ClientSecret: paymentIntent.client_secret
        };
        if (json.PaymentMethod === 1) {
            const paymentMethod = await stripe.paymentMethods.create({
                type: "ideal",
                ideal: {
                    bank: json.BankKey
                }
            })
            addOnData.PaymentMethod = paymentMethod;
        }
        //console.log(addOnData);
        response = addOnData;
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_STATUS_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.saveBookingCMS = async event => {
    /**
     * API Objective: Create a booking configured from CMS.
     * Working:
     * 1. Check for required data.
     * 2. Validate each product configuration
     * 3. Check amount accuracy and product/add-on configuration for conflict
     * 4. Do staff allocation from available staff in products
     * 5. Check if user already exist, else register new one.
     * 6. Insert all data to DB
     * 7. Configure events for booking staff
     * 8. Insert events to google calendar
     * 9. Return booking list
     */
    let knex, connected = false, response={};

    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if(json.OrganisationLocationId){
            if (
                // (
                //     // !json.UserId &&
                //      !json.Email) ||
                // !json.Name || typeof json.Name !== "string" ||
                !json.BookedBy || typeof json.BookedBy !== "string" ||
                !json.FullAddress || typeof json.FullAddress !== "string" ||
                // !json.Street || typeof json.Street !== "string" ||
                // !json.HouseNumber || typeof json.HouseNumber !== "string" ||
                // !json.Amount || typeof json.Amount !== "number" ||
                // !json.ReachOutTime || typeof json.ReachOutTime !== "number" ||
                !json.DateTime || typeof json.DateTime !== "string" ||
                json.PaidPrice ==null ||  typeof json.PaidPrice !== "number" ||
                !json.Products ||
                typeof json.Products !== 'object' ||
                json.Products.length === 0
                // typeof json.Elevator !== "number" || json.Elevator < 0 || json.Elevator > 1
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }

        }else{
            if (
                // (
                //     // !json.UserId &&
                //      !json.Email) ||
                !json.Name || typeof json.Name !== "string" ||
                !json.BookedBy || typeof json.BookedBy !== "string" ||
                !json.FullAddress || typeof json.FullAddress !== "string" ||
                // !json.Street || typeof json.Street !== "string" ||
                !json.HouseNumber || typeof json.HouseNumber !== "string" ||
                // !json.Amount || typeof json.Amount !== "number" ||
                json.ReachOutTime== null || json.ReachOutTime==undefined || typeof json.ReachOutTime !== "number" ||
                !json.DateTime || typeof json.DateTime !== "string" ||
                json.PaidPrice ==null ||  typeof json.PaidPrice !== "number" ||
                !json.Products ||
                typeof json.Products !== 'object' ||
                json.Products.length === 0 ||
                typeof json.Elevator !== "number" || json.Elevator < 0 || json.Elevator > 1
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        }
       

        let reminder = 0
        if(json.ReachOutTime>0){
            json.ReachOutTime % 5;
        }
        if (reminder > 0) {
            let toAdd = 5 - reminder;
            json.ReachOutTime += toAdd;
        }

        if (json.Email && !validateEmail(json.Email)) {
            throw new Error(MESSAGE.INVALID_EMAIL);
        }

        
        let dateTime = moment(json.DateTime).toDate();
        let products = [];
        products = json.Products;
        let eventsData = [];
        let productNames = [];
        let productToFetch = [];
        let addOnToFetch = [];

        // Validate each product configuration
        STAFF_CURRENT_SCHEDULE = [];
        products.forEach(product => {
            if (
                !product.ProductId ||
                !product.Name ||
                !product.CategoryId ||
                !product.StartTime ||
                !product.Duration ||
                !product.Amount ||
                !product.AvailableStaff ||
                // product.AvailableStaff.length <= 0 ||
                typeof product.Therapist !== "number" ||
                product.Therapist < 0 || product.Therapist > 2
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const found = productToFetch.find(f => f === product.ProductId);
            if (!found) {
                productToFetch.push(product.ProductId)
            }
            product.AvailableStaff.forEach(staff => {
                if (!staff.StaffId || !staff.GoogleEmail) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
                if (!staffFound) {
                    STAFF_CURRENT_SCHEDULE.push({
                        StaffId: staff.StaffId,
                        GoogleEmail: staff.GoogleEmail
                    })
                }
            });
            if (product.AddOns.length > 0) {
                product.AddOns.forEach(addOn => {
                    if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                    const found = addOnToFetch.find(f => f === addOn.AddOnId);
                    if (!found) {
                        addOnToFetch.push(addOn.AddOnId);
                    }
                });
            }
            if (product.Guest) {
                if (!product.Guest.Name || !product.Guest.Contact) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            }
            // let StaffData = product.AvailableStaff[0];                      //allocate staff for this product.
            // product.StaffId = StaffData.StaffId;
            // product.StaffEmail = StaffData.GoogleEmail;
            productNames.push(product.Name);
        });
        knex = require("knex")(con);
        connected = true;
  /****************************
         * Check organisation and insert else throw error
         ****************************/
        // create variables for address fields
        // let housenumber=json.HouseNumber?json.HouseNumber:null
        // let zip=json.Zip?json.Zip:null
        // let elevator=json.Elevator?(json.Elevator==1)?1:0:0
        // let reachOutTime=json.ReachOutTime?json.ReachOutTime:null
        // let distance=json.Distance?json.Distance:null
        // let street=json.Street?json.Street:null
        // let city=json.City?json.City:null

        if(json.OrganisationLocationId){
            let organisationData=await organisations(knex, json.OrganisationLocationId,null);
            if(organisationData.length){
                organisation =organisationData[0]
                //console.log("organisation",organisation)
                json.HouseNumber=organisation.HouseNumber
                json.Zip=organisation.Zip
                json.Elevator=organisation.Elevator?1:0
                json.ReachOutTime=organisation.ReachOutTime
                json.Distance=organisation.Distance
                 json.Street=organisation.Street
                 json.City=organisation.City

            }else{
                throw new Error(MESSAGE.INVALID_ORGANISATION);

            }
        }

        // //console.log("JSON",json)
        let totalDuration = 0;
        // Check amount accuracy and product/add-on configuration
        let calculatedAmount = 0;
        try {
            const proDurationFetched = await knex
                .select(
                    PRODUCTS + ".ProductId",
                    PRODUCTS + ".PreparationTime",
                    PRODUCT_DURATIONS + ".Duration",
                    PRODUCT_DURATIONS + ".Amount"
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
                .whereIn(PRODUCTS + ".ProductId", productToFetch)
                .andWhere(PRODUCTS + ".Deleted", "=", 0)

            const addOnFetched = await knex(ADDONS)
                .select("AddOnId", "Duration", "Amount")
                .whereIn("AddOnId", addOnToFetch)
                .andWhere("Deleted", "=", 0);
            let totalBookingDuration=0
            products.forEach(product => {
                const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
                if (!found || found.Amount !== product.Amount) {
                    throw new Error(MESSAGE.INVALID_PRODUCT_CONFIG);
                }
                product.TotalDuration = found.Duration;
                product.TotalAmount = found.Amount;
                calculatedAmount += found.Amount;
                product.AddOns.forEach(addOn => {
                    const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
                    if (!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) {
                        throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
                    }
                    calculatedAmount += found.Amount;
                    
                    product.TotalDuration += found.Duration;
                    product.TotalAmount += found.Amount;
                });
                product.PreparationTime = found.PreparationTime;
            });
            //console.log(calculatedAmount)
            //console.log("product.TotalDuration"+product.TotalDuration)
            if(json.TravelFee){
                //console.log("calculatedAmount")
                calculatedAmount += json.TravelFee;
            }
            //console.log(calculatedAmount)
            if (calculatedAmount !== json.Amount) {
                throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
            }
            if (json.PromoCode && json.PromoAmount) {
                calculatedAmount -= json.PromoAmount;
            }
            calculatedAmount=Math.max(calculatedAmount,0)
            //console.log(calculatedAmount)
            if (calculatedAmount !== json.PaidPrice) {
                throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
            }
            
        } catch (error) {
            //console.log(error);
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: error.message
                }
            }
        }
        // await getStaffCurrentICSchedule(knex, moment(json.DateTime));
        /**
        * Handling dispatch for same time and back2back conditions.
        */
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            let dispatchId = uuidv4();
            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                product.DispatchId = null;
                product.StaffId = product.AvailableStaff[0].StaffId;
                product.StaffEmail = product.AvailableStaff[0].GoogleEmail;
                let staffProductData = await knex(STAFF_PRODUCT)
                    .select("ProductId", "Rate")
                    .where("StaffId", "=", product.StaffId)
                    .andWhere("ProductId", "=", product.ProductId);
                let staffRate = staffProductData[0];
                // product.StaffRate = staffRate.Rate;
                if(staffRate){
                    product.StaffRate = staffRate.Rate;
                }else{
                    product.StaffRate=0
                }
            } else {
                // booking to be dispatched.
                if (product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH) {
                    product.DispatchId = dispatchId;
                    let manualStaffList = [];
                    product.AvailableStaff.forEach(element => {
                        manualStaffList.push({
                            DispatchId: dispatchId,
                            StaffId: element.StaffId,
                            StaffEmail: element.GoogleEmail,
                            Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                            ...zone.getCreateUpdate()
                        });
                    });
                    product.DispatchList = manualStaffList;
                    product.StaffId = null;
                } else {
                    let prevProdICStaff = null;
                    if (prodInc === 1) {
                        if (products[0].StaffId && product.SameTime) {
                            prevProdICStaff = products[0].StaffId;
                        }
                    }
                    let finalDispatch = await dispatchBookingCMS({
                        knex,
                        staffList: product.AvailableStaff,
                        dispatchId,
                        productStart: moment(product.StartTime),
                        productEnd: moment(product.StartTime).add(product.TotalDuration, "minute"),
                        prevProdICStaff
                    });
                    // //console.log(finalDispatch);
                    switch (finalDispatch.type) {
                        case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                            /**
                             * Set product dispatch type to direct assignment.
                             * Assign the staff directly to product.
                             */
                            product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                            product.DispatchId = null;
                            product.StaffId = finalDispatch.staffId;
                            product.StaffEmail = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === finalDispatch.staffId).GoogleEmail;
                            let staffProductData = await knex(STAFF_PRODUCT)
                                .select("ProductId", "Rate")
                                .where("StaffId", "=", product.StaffId)
                                .andWhere("ProductId", "=", product.ProductId);
                            let staffRate = staffProductData[0];
                            if(staffRate){
                                product.StaffRate = staffRate.Rate;
                            }else{
                                product.StaffRate=0
                            }
                            
                            break;
                        }
                        case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                            /**
                             * Set product dispatch type to direct assignment.
                             * Set the product dispatch id.
                             * Send the notification to given staff list.
                             */
                            if (finalDispatch.staffList.length) {
                                product.DispatchType = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                                product.DispatchId = dispatchId;
                                product.DispatchList = finalDispatch.staffList;
                                product.StaffId = null;
                            } else {
                                product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
                                product.DispatchId = "";
                                product.DispatchList = [];
                                product.StaffId = null;
                            }
                            break;
                        }
                        default: {
                            throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
                        }
                    }
                }
            }
        }

        

         /****************************
         * Get Total booking duration 
         ****************************/
         const startTimes = products.map(product => moment(product.StartTime));
         const bookingStartTime = moment.min(startTimes);
         const bookingLastTreatmentST = moment.max(startTimes);
         let maxDurationOfLastProd = 0;
         for (let prodInc = 0; prodInc < products.length; prodInc++) {
             const product = products[prodInc];
             if (moment(product.StartTime).isSame(bookingLastTreatmentST)) {
                 if (product.Duration > maxDurationOfLastProd) {
                     maxDurationOfLastProd = product.Duration;
                 }
             }
         }
         const bookingEndTime = bookingLastTreatmentST.add(maxDurationOfLastProd, 'minutes');
         totalDuration = bookingEndTime.diff(bookingStartTime, 'minutes')
        
         /****************************
         * Get Total booking duration 
         ****************************/
         totalDuration=0
         for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            // if ((!product.StaffId || !product.StaffEmail) && !json.ForceStaffAllot) {
            //     return {
            //         statusCode: 410,
            //         headers: {
            //             ...Headers,
            //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
            //         }
            //     }
            // }
            if (prodInc === 0) {
                totalDuration += product.TotalDuration;
                //console.log("totalDuration"+totalDuration)
            } else {
                if (product.SameTime) {
                    if (product.TotalDuration >= products[0].TotalDuration) {
                        totalDuration = product.TotalDuration;
                        totalDuration = product.TotalDuration;
                    }
                    //console.log("totalDuration1"+totalDuration)
                    //console.log("product.TotalDuration"+product.TotalDuration)
                } else if (products[0].StaffId === product.StaffId) {
                    totalDuration += product.PreparationTime + product.TotalDuration;
                    //console.log("totalDuration2"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                    //console.log("product.PreparationTime"+product.PreparationTime)
                } else {
                    totalDuration += product.TotalDuration;
                    //console.log("totalDuration3"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                }
            }
        }
      
       

        /****************************
         * Check user info is available otherwise create new user
         ****************************/
        let userId = json.UserId ? json.UserId : null;
        let userName = json.Name;
        if (!userId) {
            let emailExist = await knex(USERS).select("UserId", "Name").where("Email", "=", json.Email);
            if (emailExist.length > 0) {
                userId = emailExist[0].UserId;
                userName = emailExist[0].Name;
            }
        }
        if (Object.keys(json.Userdata).length != 0) {
            if (!userId) {
                // new user
                let user = json.Userdata
                if (
                    !user.Name
                    // !user.Email ||
                    // !user.Contact ||
                    // typeof user.Gender !== "number" || user.Gender < 0 || user.Gender > 1||
                    // // typeof user.Elevator !== "number" || user.Elevator < 0 || user.Elevator > 1||
                    // typeof user.Therapist !== "number" || user.Therapist < 0 || user.Therapist > 2||
                    // typeof user.PreferredLanguage !== "number" || user.PreferredLanguage < 0 ||
                    // typeof user.ClientSource  !== "number" || user.ClientSource < 0 ||
                    // !user.Zip ||
                    // !user.HouseNumber ||
                    // !user.DOB 



                ) {
                    throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
                }

                //console.log("user")
                const userInserted = await knex(USERS).insert(
                    {
                        FromCMS: 1,
                        Name: user.Name,
                        Email: user.Email,
                        ImagePath: user.ImagePath ? user.ImagePath : null,
                        Contact: user.Contact,
                        Gender: user.Gender,
                        Therapist: user.Therapist,
                        Street: user.Street ? user.Street : null,
                        HouseNumber: user.HouseNumber,
                        Floor: user.Floor ? user.Floor : null,
                        City: user.City ? user.City : null,
                        Zip: user.Zip ? user.Zip : null,
                        DOB: user.DOB ? new Date(user.DOB) : null,
                        Distance: user.Distance ? user.Distance : null,
                        ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                        PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                        ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                        Elevator: user.Elevator ? 1 : 0,
                        Notes: user.Notes,
                        FullAddress : user.FullAddress?user.FullAddress:null,
                        ...zone.getCreateUpdate()
                    }
                )
                userId = userInserted[0];
            } else {
                

               
                if (json.userUpdated) {
                    let user = json.Userdata
                    if (
                        !user.Name
                        // !user.Email ||
                        // !user.Contact ||
                        // typeof user.Gender !== "number" || user.Gender < 0 || user.Gender > 1||
                        // // typeof user.Elevator !== "number" || user.Elevator < 0 || user.Elevator > 1||
                        // typeof user.Therapist !== "number" || user.Therapist < 0 || user.Therapist > 2||
                        // typeof user.PreferredLanguage !== "number" || user.PreferredLanguage < 0 ||
                        // typeof user.ClientSource  !== "number" || user.ClientSource < 0 ||
                        // !user.Zip ||
                        // !user.HouseNumber ||
                        // !user.DOB 



                    ) {
                        throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
                    }
                    if(json.saveUserDetailRecord){
                        await knex(USERS)
                        .update({
                            FromCMS: 1,
                            Name: user.Name,
                            Email: user.Email,
                            ImagePath: user.ImagePath ? user.ImagePath : null,
                            Contact: user.Contact,
                            Gender: user.Gender,
                            Therapist: user.Therapist,
                            Street: user.Street ? user.Street : null,
                            HouseNumber: user.HouseNumber,
                            Floor: user.Floor ? user.Floor : null,
                            City: user.City ? user.City : null,
                            Zip: user.Zip ? user.Zip : null,
                            DOB: user.DOB ? new Date(user.DOB) : null,
                            Distance: user.Distance ? user.Distance : null,
                            ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                            PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                            ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                            Elevator: user.Elevator ? 1 : 0,
                            Notes: user.Notes,
                            FullAddress : user.FullAddress?user.FullAddress:null,
                            LastUpdated: zone.getLastUpdate(),
                        })
                        .where("UserId", "=", json.UserId)
                    }
                    else{
                        await knex(USERS)
                        .update({
                            FromCMS: 1,
                            Name: user.Name,
                            Email: user.Email,
                            ImagePath: user.ImagePath ? user.ImagePath : null,
                            Contact: user.Contact,
                            Gender: user.Gender,
                            Therapist: user.Therapist,
                            DOB: user.DOB ? new Date(user.DOB) : null,
                            PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                            ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                            Notes: user.Notes,
                            LastUpdated: zone.getLastUpdate(),
                        })
                        .where("UserId", "=", json.UserId)
                    }
                    await knex(BOOKINGS)
                        .update({
                            UserId:json.UserId,
                            LastUpdated: zone.getLastUpdate(),
                        })
                        .where("UserId", "=", json.UserId)
                        .modify(queryBuilder => {
                    
                    console.log(queryBuilder.toSQL().toNative())
                });
                    
                    //console.log("user")


                }
           
            }
        }
      

        let staffPushNotify = [];
        let bookingFirstProTime = getBookingStartTime(products);
        //console.log(bookingFirstProTime)
        STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);

        const dataSubmit = {
            BookingProvider: parseInt(process.env.BOOKING_PROVIDER_CMS),
            UserId: userId,
            Street: json.Street,
            HouseNumber: json.HouseNumber,
            Floor: json.Floor ? json.Floor : null,
            City: json.City ? json.City : null,
            Zip: json.Zip ? json.Zip : null,
            Distance: json.Distance ? json.Distance : null,
            Elevator: json.Elevator,
            Amount: json.Amount,
            Duration: totalDuration,
            DateTime: moment(bookingFirstProTime).toDate(),
            ReachOutTime: json.ReachOutTime,
            PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
            AGPromoCodeId: null,
            PromoCode: json.PromoCode ? json.PromoCode : null,
            PromoAmount: json.PromoAmount ? json.PromoAmount : null,
            PaidPrice: json.PaidPrice,
            PaymentStatus: BOOKING_PAYMENT_STATUS.MANUAL,                    // make payment status manual
            TransactionId: null,                                             // not known as payment is manual
            TransactionDate: null,                                           // not known as payment is manual
            Status: BOOKING_STATUS.CONFIRMED,                                // make booking status confirmed
            PredecessorBookingId: null,
            SuccessorBookingId: null,
            SystemPhase: SYSTEM_PHASE.PHASE_TWO,
            Deleted: 0,
            TravelFee: json.TravelFee ? json.TravelFee : 0,
            PaymentType: json.PaymentType? json.PaymentType:0,
            BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
            OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
            BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
            BookedBy: json.BookedBy,
            FullAddress: json.FullAddress,
            ...zone.getCreateUpdate()
        };
        dataSubmit.PaymentStatus=(json.PaymentType==0)?BOOKING_PAYMENT_STATUS.MANUAL:BOOKING_PAYMENT_STATUS.PENDING
        let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
        if (bookingResult.length === 0) {
            throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
        }
        let bookingInserted = bookingResult[0];
        let autoDispatchNotifyStaff = [];
        let perf1 = performance.now()
        //now we have BookingId for further operations
        for (let index = 0; index < products.length; index++) {
            let product = products[index];
            let guestId = 0;
            if (product.Guest) {
                const guest = product.Guest;
                const guestInsert = await knex(GUESTS)
                    .insert({
                        UserId: userId,
                        BookingId: bookingInserted,
                        ...guest,
                        ...zone.getCreateUpdate()
                    })
                guestId = guestInsert[0];
            }
            const productInserted = await knex(BOOKING_PRODUCTS)
                .insert({
                    BookingId: bookingInserted,
                    Product: product.Name,
                    ProductId: product.ProductId,
                    CategoryId: product.CategoryId,
                    Duration: product.Duration,
                    Amount: product.Amount,
                    PreparationTime: product.PreparationTime,
                    StaffId: product.StaffId ? product.StaffId : null,
                    UserId: !product.Guest ? userId : null,
                    GuestId: product.Guest ? guestId : null,
                    SameTime: product.SameTime,
                    StartTime: new moment(product.StartTime).toDate(),
                    Therapist: product.Therapist,
                    ForceStaffAllot: json.ForceStaffAllot ? 1 : 0,
                    Status: BOOKING_PRODUCT_STATUS.NOT_STARTED,
                    DispatchType: product.DispatchType,
                    DispatchId: product.DispatchId,
                    StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                    DiscountedAmount: product.DiscountedAmount ? product.DiscountedAmount : 0,
                    Discount: product.Discount ? product.Discount : 0,
                    ...zone.getCreateUpdate()
                });
            let bookingProductId = productInserted[0];

            if (
                product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH ||
                product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH
            ) {
                // Insert the staffList to dispatch and save this staff for automatic dispatch notification.
                let productDispatchList = [];
                product.DispatchList.forEach(staff => {
                    productDispatchList.push({
                        DispatchId: product.DispatchId,
                        StaffId: staff.StaffId,
                        Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                        ...zone.getCreateUpdate()
                    });
                    if (product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH) {
                        let stFound = STAFF_CURRENT_SCHEDULE.find(sts => sts.StaffId === staff.StaffId);
                        autoDispatchNotifyStaff.push({
                            StaffId: stFound.StaffId,
                            FcmToken: stFound.FcmToken,
                            DateTime: product.StartTime,
                            DispatchId: product.DispatchId
                        });
                    }
                });
                let insertedDispatchList = await knex(BOOKING_PRODUCT_DISPATCH).insert(productDispatchList);
            }

            if (product.Extras && product.Extras.length > 0) {
                for (let extInc = 0; extInc < product.Extras.length; extInc++) {
                    const extra = product.Extras[extInc];
                    let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
                        .insert({
                            BookingProductId: bookingProductId,
                            ExtraTitle: extra.ExtraTitle,
                            ExtraValue: extra.ExtraValue,
                            ...zone.getCreateUpdate()
                        })

                }
            }

            if (product.AddOns.length > 0) {
                let AddOns = product.AddOns;
                for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                    const addOn = AddOns[addOnIndex];
                    let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
                        .insert({
                            BookingId: bookingInserted,
                            BookingProductId: bookingProductId,
                            AddOnId: addOn.AddOnId,
                            AddOn: addOn.Name,
                            Duration: addOn.Duration,
                            Amount: addOn.Amount,
                            BookingAddOnPaymentId: null,
                            Status: BOOKING_PRODUCT_ADD_ON_STATUS.NOT_STARTED,
                            StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
                            ...zone.getCreateUpdate()
                        })
                }
            }

            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                // Events configuration
                if (index === 0) {
                    let startTime = new moment(product.StartTime).utc();
                    let endTime = new moment(product.StartTime).utc();
                    endTime.add(product.TotalDuration, "minute");
                    let eventObj = {
                        StaffId: product.StaffId,
                        start: {
                            dateTime: startTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        end: {
                            dateTime: endTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        attendees: [
                            { email: process.env.EMAIL },
                            { email: product.StaffEmail }
                        ],
                        Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                        BookingProductId: [bookingProductId],
                        extendedProperties: {
                            shared: {
                                'BookingId': bookingInserted,
                                'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                'ReturnTime': json.ReachOutTime
                            }
                        }
                    }
                    eventsData.push(eventObj);
                } else {
                    let found = eventsData.find(sta => sta.StaffId === product.StaffId);        //create staff entry for events if not exists already
                    if (found) {
                        found.end.dateTime = new moment(found.end.dateTime)
                            .add(product.PreparationTime + product.TotalDuration, "minute").toDate();
                        found.Products.push(product.Name + " (" + product.TotalDuration + " mins)")
                        found.BookingProductId.push(bookingProductId);
                    } else {
                        let startTime = new moment(product.StartTime).utc();
                        let endTime = new moment(product.StartTime).utc();
                        endTime.add(product.TotalDuration, "minute");
                        let eventObj = {
                            StaffId: product.StaffId,
                            start: {
                                dateTime: startTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            attendees: [
                                { email: process.env.EMAIL },
                                { email: product.StaffEmail }
                            ],
                            Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                            BookingProductId: [bookingProductId],
                            extendedProperties: {
                                shared: {
                                    'BookingId': bookingInserted,
                                    'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                    'ReturnTime': json.ReachOutTime
                                }
                            }
                        }
                        eventsData.push(eventObj);
                    }
                }

                // Push configuration
                const pushStaffFound = staffPushNotify.find(f => f.StaffId === product.StaffId);
                if (!pushStaffFound) {
                    let staffFcmToken = await knex(STAFF)
                        .select("StaffId", "FcmToken")
                        .where("StaffId", "=", product.StaffId);
                    let staffData = staffFcmToken[0];
                    let pushStaffObj = {
                        StaffId: staffData.StaffId,
                        FcmToken: staffData.FcmToken,
                        DateTime: product.StartTime
                    }
                    staffPushNotify.push(pushStaffObj);
                }
            }
            
        }
        let perf2 = performance.now()
        //console.log("Insert"+ (perf2 - perf1))
        
        if (json.PromoCodeId) {
            let promoExist = await knex(PROMOCODES).select("CurrentCount").where("PromoCodeId", "=", json.PromoCodeId);
            if (promoExist.length > 0) {
                let promoCountInc = await knex(PROMOCODES)
                    .update({
                        CurrentCount: promoExist[0].CurrentCount + 1,
                        LastUpdated: zone.getLastUpdate()
                    })
                    .where("PromoCodeId", "=", json.PromoCodeId)
            }
        }
        //console.log(bookingInserted)
        var deletedSpecialRequest = await knex(BOOKING_SPECIAL_REQUEST)
            .where("BookingId", "=", bookingInserted)
            .delete().
            modify(function(qb){
               //console.log( qb.toSQL().toNative())
            });
            //console.log(deletedSpecialRequest)
        // if (!deletedSpecialRequest) {
        //     throw new Error(MESSAGE.SPECIAL_REQUEST_UPDATE_SWW);
        // }
        if (json.SpecialRequest && json.SpecialRequest.length > 0) {
            let preDefinedRequest=[]
            let reqToAdd=[]
            for (let reqIndex = 0; reqIndex < json.SpecialRequest.length; reqIndex++) {
                if(typeof (json.SpecialRequest[reqIndex]) == "number"){
                    
                    
                    //console.log(json.SpecialRequest[reqIndex])
                    preDefinedRequest.push(json.SpecialRequest[reqIndex])
                    //console.log("if")
                }else{
                    //console.log("else")
                    let requestData={
                        SpecialRequestName:json.SpecialRequest[reqIndex],
                        IsUSerDefined:1,
                        ...zone.getCreateUpdate()
                    }
                    let addedRequest = await knex(SPECIAL_REQUEST).insert(requestData) 
                    preDefinedRequest.push(addedRequest[0])
                }
            }
            for (let reqIndex = 0; reqIndex < preDefinedRequest.length; reqIndex++) {
                reqToAdd.push({
                    BookingId:bookingInserted,
                    SpecialRequestId:preDefinedRequest[reqIndex],
                    ...zone.getCreateUpdate()
                })
            }
            let addedBookingRequest = await knex(BOOKING_SPECIAL_REQUEST).insert(reqToAdd) 


            // if(json.AdminNotes){
            //     dataSubmit.AdminNotes=json.AdminNotes
            //     let requestData={
            //         AdminNotes: json.AdminNotes,
            //         BookingId:bookingInserted,
            //         ...zone.getCreateUpdate()
            //     }
            //     let addedNotes = await knex(BOOKING_EXTRA).insert(requestData)
            // }
            
        }
        // //console.log(performance.now()+" - perf2")
        // Generate Events on google calendar
        let finalEvents = [];
        //console.log("AXIOSSS")
        eventsData.forEach(config => {
            const description = config.Products.toString();
            finalEvents.push({
                ...config,
                summary: userName + ", Booking #" + bookingInserted,
                description
            })
        });
        // make random id
        for (let ev = 0; ev < finalEvents.length; ev++) {
            const event = finalEvents[ev];
            delete event.StaffId;
            const inserted = await calendar.events.insert({
                auth: oAuth2Client,
                calendarId: "primary",
                resource: event
            });
            const eventInserted = await knex(BOOKING_PRODUCTS)
                .whereIn("BookingProductId", event.BookingProductId)
                .update({
                    EventId: inserted.data.id,
                    LastUpdated: zone.getLastUpdate()
                })
        }

        let markToDispatched = [];
        for (let dispInc = 0; dispInc < autoDispatchNotifyStaff.length; dispInc++) {
            const staff = autoDispatchNotifyStaff[dispInc];
            let dispatchFound = markToDispatched.find(f => f === staff.DispatchId);
            if (!dispatchFound) {
                markToDispatched.push(staff.DispatchId);
            }
        }
        if (markToDispatched.length) {
            let marked = await knex(BOOKING_PRODUCT_DISPATCH)
                .whereIn("DispatchId", markToDispatched)
                .update({
                    Status: DISPATCH_STATUS.DISPATCHED
                })
        }

        // response = await this.bookings(knex, null, event.headers['api-client']);
        // send push notification to staff
        let perf3 = performance.now()
        //console.log("Insert promo caal event"+ (perf3 - perf2))
       
        //send push notification to staff
        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingStaffNotification = getLambdaNameByInstance() + "-bookingStaffNotification";
            console.log(bookingStaffNotification)
            lambda.invoke({
                FunctionName: bookingStaffNotification,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: bookingInserted
                })
            }, function (err, data) {
                if (err) {
                    //console.log(err);
                } else {
                    //console.log('Lambda_Push said ' + data.Payload);
                }
            });

            // await holdfor10secs();
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            //console.log(error)
        }
        
        // Code to insert the Admin notes.
        try {
            if (json && json.AdminNotes&& json.AdminNotes.trim()) {
                // insert extras row.
                let insertObj = {
                    BookingId: `${bookingInserted}`,
                    AdminNotes: json.AdminNotes.trim(),
                    ...zone.getCreateUpdate()
                }
                const adminNotesInserted = await knex(BOOKING_EXTRA).insert(insertObj);
                //console.log(`Admin notes inseted: ${adminNotesInserted}`);
            }
        } catch (error) {
            //console.log(error);
        }
//code to send push to user
        try {
            if(json.UserId!=null){
                let lambda = new AWS.Lambda();
            // send booking confirmation email
            let sendUserBookingPush = getLambdaNameByInstance() + "-sendUserBookingPush";
            lambda.invoke({
                FunctionName: sendUserBookingPush,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: bookingInserted
                })
            }, function (err, data) {
                if (err) {
                    //console.log(err);
                } else {
                    //console.log('Lambda_B said ' + data.Payload);
                }
            });
            }
            

           
        } catch (error) {
            //console.log(error)
        }

    //    CO2-T757 commented code to send confirmation email as it will be send after payment is done

        // try {
        //     let lambda = new AWS.Lambda();
        //     // send booking confirmation email
        //     let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
        //     console.log(bookingNotifier)
        //     lambda.invoke({
        //         FunctionName: bookingNotifier,
        //         InvocationType: 'Event',
        //         LogType: 'Tail',
        //         Payload: JSON.stringify({
        //             FromCMS: true,
        //             BookingId: bookingInserted
        //         })
        //     }, function (err, data) {
        //         if (err) {
        //             console.log(err);
        //         } else {
        //             //console.log('Lambda_B said ' + data.Payload);
        //         }
        //     });

        //     // await holdfor10secs();
        //     // //console.log(caller);
        //     //console.log("after lambda hit");
        // } catch (error) {
        //     console.log(error)
        // }
        // let perf4 = performance.now()

        // code block to send the organisation email
        if(json.OrganisationLocationId){
            try {
                let lambda = new AWS.Lambda();
                // send booking confirmation email
                let bookingConfirmation = getLambdaNameByInstance() + "-sendOrganisationConfEmail";
                console.log(bookingConfirmation)
                lambda.invoke({
                    FunctionName: bookingConfirmation,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        FromCMS: true,
                        BookingId: bookingInserted
                    })
                }, function (err, data) {
                    if (err) {
                        console.log(err);
                    } else {
                        //console.log('Lambda_Push said ' + data.Payload);
                    }
                });
    
                // await holdfor10secs();
                // //console.log(caller);
                //console.log("after lambda hit");
            } catch (error) {
                console.log(error)
            }
        }
       

        // call lambda to save the staff earning for each treatment
        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingRateCalculation = getLambdaNameByInstance() + "-calculateBookingStaffRate";
            console.log(bookingRateCalculation)
            lambda.invoke({
                FunctionName: bookingRateCalculation,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: bookingInserted
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    //console.log('Lambda_Push said ' + data.Payload);
                }
            });

            // await holdfor10secs();
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            console.log(error)
        }
        //console.log("Push and notes insert"+ (perf4 - perf3))
        //code to create invoice for the customer and send payment link
        if(dataSubmit.PaymentType==1 || dataSubmit.PaymentType==2){
            try{
                if(json.InvoiceEmail){
                    dataSubmit.InvoiceEmail=json.InvoiceEmail
                }
                dataSubmit.Products=products;
                dataSubmit.Name=json.Name
                dataSubmit.OnlyCopy=json.OnlyCopy
                const invoice=await createInvoice(dataSubmit,userId,bookingInserted)
                response.Invoice=invoice;
                //console.log("code to create invoice")
                if(invoice){
                    var invoiceData = {
                        InvoiceUrl: invoice.hosted_invoice_url,
                        ...zone.getLastUpdate()
            
            
                    }
            
                    var updated = await knex(BOOKINGS)
                        .where("BookingId", "=", bookingInserted)
                        .update({
                            ...invoiceData
                        })
                }
            }
            catch (error) {
                console.log(error);
                await knex.destroy();
                if(error.Status && error.Status==424){
                    return {
                        statusCode: 424,
                        headers: {
                            ...Headers,
                            Message: error.message
                        }
                    }
                }else{
                    return {
                        statusCode: 424,
                        headers: {
                            ...Headers,
                            Message: MESSAGE.INVOICE_NOT_CREATED
                        }
                    }
                }
                
            }
        }
       
        let perf5 = performance.now()
        //console.log("Send Invoice"+ (perf5 - perf4))
        await holdfor1secs()

        // Save log for create
        await saveLog(knex,json.AdminId,BOOKINGS,bookingInserted,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.updateBookingCMS = async event => {
    /**
     * API Objective: Update a booking to new one configured from CMS.
     * Working:
     * 1. Check for required data.
     * 2. Validate each product configuration.
     * 3. Check amount accuracy and product/add-on configuration for conflict of new products only.
     * 4. Do staff allocation from available staff in products
     * 5. Insert all data to DB
     * 6. Update existing booking status to cancelled and insert its successor booking id
     * 7. Configure events for booking staff
     * 8. Fetch previous bookings events and delete them from google calendar
     * 9. Insert events to google calendar
     * 10. Return booking list
     */
    let knex, connected = false, response={};

    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if(json.OrganisationLocationId){
            if (
                // (
                //     // !json.UserId &&
                //      !json.Email) ||
                // !json.Name || typeof json.Name !== "string" ||
                !json.BookedBy || typeof json.BookedBy !== "string" ||
                !json.FullAddress || typeof json.FullAddress !== "string" ||
                // !json.Street || typeof json.Street !== "string" ||
                // !json.HouseNumber || typeof json.HouseNumber !== "string" ||
                // !json.Amount || typeof json.Amount !== "number" ||
                // !json.ReachOutTime || typeof json.ReachOutTime !== "number" ||
                !json.DateTime || typeof json.DateTime !== "string" ||
                json.PaidPrice ==null ||  typeof json.PaidPrice !== "number" ||
                !json.Products ||
                typeof json.Products !== 'object' ||
                json.Products.length === 0
                // typeof json.Elevator !== "number" || json.Elevator < 0 || json.Elevator > 1
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        }else{
            if (
                !json.BookingId || typeof json.BookingId !== "number" ||
                // !json.Street || typeof json.Street !== "string" ||
                !json.BookedBy || typeof json.BookedBy !== "string" ||
                !json.FullAddress || typeof json.FullAddress !== "string" ||
                !json.HouseNumber || typeof json.HouseNumber !== "string" ||
                !json.Amount || typeof json.Amount !== "number" ||
                json.ReachOutTime== null || json.ReachOutTime==undefined || typeof json.ReachOutTime !== "number" ||
                !json.DateTime || typeof json.DateTime !== "string" ||
                json.PaidPrice ==null || typeof json.PaidPrice !== "number" ||
                !json.Products ||
                typeof json.Products !== 'object' ||
                json.Products.length === 0 ||
                typeof json.Elevator !== "number" || json.Elevator < 0 || json.Elevator > 1
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        }
        
        let reminder = 0
        if(json.ReachOutTime>0) {
            json.ReachOutTime % 5;
        }
        if (reminder > 0) {
            let toAdd = 5 - reminder;
            json.ReachOutTime += toAdd;
        }

        let dateTime = moment(json.DateTime).toDate();
        let products = [];
        products = json.Products;
        let eventsData = [];
        let productNames = [];
        let productToFetch = [];
        let addOnToFetch = [];
        let isNewBooking = json.IsNewBooking ? true : false;

        // Validate each product configuration
        STAFF_CURRENT_SCHEDULE = [];
        products.forEach(product => {
            if (
                !product.ProductId ||
                !product.Name ||
                !product.CategoryId ||
                !product.StartTime ||
                !product.Duration ||
                !product.Amount ||
                // !product.AvailableStaff ||
                // product.AvailableStaff.length <= 0 ||
                !product.PreparationTime ||
                typeof product.Therapist !== "number" ||
                product.Therapist < 0 || product.Therapist > 2
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const found = productToFetch.find(f => f === product.ProductId);
            if (!found) {
                productToFetch.push(product.ProductId)
            }
            product.AvailableStaff.forEach(staff => {
                if (!staff.StaffId || !staff.GoogleEmail) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
                if (!staffFound) {
                    STAFF_CURRENT_SCHEDULE.push({
                        StaffId: staff.StaffId,
                        GoogleEmail: staff.GoogleEmail
                    })
                }
            });
            if (product.AddOns.length > 0) {
                product.AddOns.forEach(addOn => {
                    if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                    const found = addOnToFetch.find(f => f === addOn.AddOnId);
                    if (!found) {
                        addOnToFetch.push(addOn.AddOnId);
                    }
                });
            }
            if (product.Guest) {
                if (!product.Guest.Name || !product.Guest.Contact) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            }
            // let StaffData = product.AvailableStaff[0];                      //allocate staff for this product.
            // product.StaffId = StaffData.StaffId;
            // product.StaffEmail = StaffData.GoogleEmail;
            productNames.push(product.Name);
        });
        knex = require("knex")(con);
        connected = true;
  /****************************
         * Check organisation and insert else throw error
         ****************************/
        // create variables for address fields
        // let housenumber=json.HouseNumber?json.HouseNumber:null
        // let zip=json.Zip?json.Zip:null
        // let elevator=json.Elevator?(json.Elevator==1)?1:0:0
        // let reachOutTime=json.ReachOutTime?json.ReachOutTime:null
        // let distance=json.Distance?json.Distance:null
        // let street=json.Street?json.Street:null
        // let city=json.City?json.City:null

        if(json.OrganisationLocationId){
            let organisationData=await organisations(knex, json.OrganisationLocationId);
            if(organisationData.length){
                organisation =organisationData[0]
                //console.log("organisation",organisation)
                json.HouseNumber=organisation.HouseNumber
                json.Zip=organisation.Zip
                json.Elevator=organisation.Elevator?1:0
                json.ReachOutTime=organisation.ReachOutTime
                json.Distance=organisation.Distance
                 json.Street=organisation.Street
                 json.City=organisation.City

            }else{
                throw new Error(MESSAGE.INVALID_ORGANISATION);

            }
        }
        // check if booking exist or not.
        const bookingExistData = await knex(BOOKINGS).select("BookingId", "UserId", "BookingProvider", "DateTime","Status").where("BookingId", "=", json.BookingId);
        if (bookingExistData.length <= 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: MESSAGE.BOOKING_NOT_AVAILABLE
                }
            }
        }

        const bookingData = bookingExistData[0];
        let existDateTime = moment(bookingData.DateTime);
        let newDateTime = moment(json.DateTime)
        // if (!newDateTime.isSame(existDateTime)) {
        //     json.IsPushNotification = true;
        // }
        // Check amount accuracy and product/add-on configuration of new products only
        let totalDuration = 0;
        let calculatedAmount = 0;
        try {
            const proDurationFetched = await knex
                .select(
                    PRODUCTS + ".ProductId",
                    PRODUCTS + ".PreparationTime",
                    PRODUCT_DURATIONS + ".Duration",
                    PRODUCT_DURATIONS + ".Amount"
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
                .whereIn(PRODUCTS + ".ProductId", productToFetch)
                .andWhere(PRODUCTS + ".Deleted", "=", 0)

            const addOnFetched = await knex(ADDONS)
                .select("AddOnId", "Duration", "Amount")
                .whereIn("AddOnId", addOnToFetch)
                .andWhere("Deleted", "=", 0);

            products.forEach(product => {
                const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
                if ((!found || found.Amount !== product.Amount) && !product.IsAlreadyExist) {
                    throw new Error(MESSAGE.INVALID_PRODUCT_CONFIG);
                }
                product.TotalDuration = found.Duration;
                product.TotalAmount = found.Amount;
                calculatedAmount += found.Amount;
                product.AddOns.forEach(addOn => {
                    const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
                    if ((!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) && !product.IsAlreadyExist) {
                        throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
                    }
                    //console.log("found")
                    //console.log(found)
                    calculatedAmount += found.Amount;
                    product.TotalDuration += found.Duration;
                    product.TotalAmount += found.Amount;
                });
            });
           
            if(json.TravelFee){
                //console.log("calculatedAmount")
                calculatedAmount += json.TravelFee;
            }
            //console.log(calculatedAmount)
            if (calculatedAmount !== json.Amount) {
                throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
            }
            if (json.PromoCode && json.PromoAmount) {
                calculatedAmount -= json.PromoAmount;
            }
            calculatedAmount=Math.max(calculatedAmount,0)
            if (calculatedAmount !== json.PaidPrice) {
                throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
            }
        } catch (error) {
            //console.log(error);
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: error.message
                }
            }
        }
        // await getStaffCurrentICSchedule(knex, moment(json.DateTime));
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            let dispatchId = uuidv4();
            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                product.DispatchId = null;
                product.StaffId = product.AvailableStaff[0].StaffId;
                product.StaffEmail = product.AvailableStaff[0].GoogleEmail;
                let staffProductData = await knex(STAFF_PRODUCT)
                    .select("ProductId", "Rate")
                    .where("StaffId", "=", product.StaffId)
                    .andWhere("ProductId", "=", product.ProductId);
                let staffRate = staffProductData[0];
                // product.StaffRate = staffRate.Rate;
                if(staffRate){
                    product.StaffRate = staffRate.Rate;
                }else{
                    product.StaffRate=0
                }
            } else {
                // booking to be dispatched.
                if (product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH) {
                    product.DispatchId = dispatchId;
                    let manualStaffList = [];
                    product.AvailableStaff.forEach(element => {
                        manualStaffList.push({
                            DispatchId: dispatchId,
                            StaffId: element.StaffId,
                            StaffEmail: element.GoogleEmail,
                            Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                            ...zone.getCreateUpdate()
                        });
                    });
                    product.DispatchList = manualStaffList;
                    product.StaffId = null;
                } else {
                    let prevProdICStaff = null;
                    if (prodInc === 1) {
                        if (products[0].StaffId && product.SameTime) {
                            prevProdICStaff = products[0].StaffId;
                        }
                    }
                    let finalDispatch = await dispatchBookingCMS({
                        knex,
                        staffList: product.AvailableStaff,
                        dispatchId,
                        productStart: moment(product.StartTime),
                        productEnd: moment(product.StartTime).add(product.TotalDuration, "minute"),
                        prevProdICStaff
                    });
                    // //console.log(finalDispatch);
                    switch (finalDispatch.type) {
                        case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                            /**
                             * Set product dispatch type to direct assignment.
                             * Assign the staff directly to product.
                             */
                            product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                            product.DispatchId = null;
                            product.StaffId = finalDispatch.staffId;
                            product.StaffEmail = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === finalDispatch.staffId).GoogleEmail;
                            let staffProductData = await knex(STAFF_PRODUCT)
                                .select("ProductId", "Rate")
                                .where("StaffId", "=", product.StaffId)
                                .andWhere("ProductId", "=", product.ProductId);
                            let staffRate = staffProductData[0];
                            product.StaffRate = staffRate.Rate;
                            break;
                        }
                        case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                            /**
                             * Set product dispatch type to direct assignment.
                             * Set the product dispatch id.
                             * Send the notification to given staff list.
                             */
                            product.DispatchType = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                            product.DispatchId = dispatchId;
                            product.DispatchList = finalDispatch.staffList;
                            product.StaffId = null;
                            break;
                        }
                        default: {
                            throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
                        }
                    }
                }
            }
        }

        /**
         * If the force save flag is not set, do this:
         * Allocate staff in all products based on available staff.
         * In case of single product just loop over all staff & check their availability, select the available one.
         * In case of two products: try to check staff availability based on same index they came from time-slot.
         * If staff is exhausted then return 410
         */

        // if (!json.ForceStaffAllot) {
        //     for (let staffInc = 0; staffInc < 1; staffInc++) {
        //         const staffOne = products[0].AvailableStaff[staffInc];
        //         let staffAvailable = false;
        //         const isStaffAvailable = await staffCheck(knex, {
        //             StaffId: staffOne.StaffId,
        //             Duration: products[0].TotalDuration + json.ReachOutTime,      // here reach out time is for return time
        //             StartTime: new moment(products[0].StartTime).subtract(products[0].PreparationTime + json.ReachOutTime, "minute").utc().format(),
        //             Events: json.Events
        //         });
        //         staffAvailable = isStaffAvailable.IsAvailable;
        //         //console.log(staffAvailable)
        //         if (products.length > 1) {
        //             const staffTwo = products[1].AvailableStaff[staffInc];
        //             const isStaffTwoAvailable = await staffCheck(knex, {
        //                 StaffId: staffTwo.StaffId,
        //                 Duration: products[1].TotalDuration + json.ReachOutTime,
        //                 StartTime: new moment(products[1].StartTime).subtract(products[1].PreparationTime + json.ReachOutTime, "minute").utc().format(),
        //                 Events: json.Events
        //             });
        //             staffAvailable = isStaffTwoAvailable.IsAvailable;
        //             if (staffAvailable) {
        //                 products.forEach((product, index) => {
        //                     switch (index) {
        //                         case 0:
        //                             product.StaffId = staffOne.StaffId;
        //                             product.StaffEmail = staffOne.GoogleEmail;
        //                             break;
        //                         case 1:
        //                             product.StaffId = staffTwo.StaffId;
        //                             product.StaffEmail = staffTwo.GoogleEmail;
        //                             break;
        //                     }
        //                 });
        //                 break;
        //             }
        //         }
        //         if (staffAvailable) {
        //             products[0].StaffId = staffOne.StaffId;
        //             products[0].StaffEmail = staffOne.GoogleEmail;
        //             break;
        //         }
        //     }
        // } else {
        //     products.forEach(element => {
        //         element.StaffId = element.AvailableStaff[0].StaffId;
        //         element.StaffEmail = element.AvailableStaff[0].GoogleEmail;
        //     });
        // }

        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            // if ((!product.StaffId || !product.StaffEmail) && !json.ForceStaffAllot) {
            //     return {
            //         statusCode: 410,
            //         headers: {
            //             ...Headers,
            //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
            //         }
            //     }
            // }
            if (prodInc === 0) {
                totalDuration += product.TotalDuration;
                //console.log("totalDuration"+totalDuration)
            } else {
                if (product.SameTime) {
                    if (product.TotalDuration >= products[0].TotalDuration) {
                        totalDuration = product.TotalDuration;
                        totalDuration = product.TotalDuration;
                    }
                    //console.log("totalDuration1"+totalDuration)
                    //console.log("product.TotalDuration"+product.TotalDuration)
                } else if (products[0].StaffId === product.StaffId) {
                    totalDuration += product.PreparationTime + product.TotalDuration;
                    //console.log("totalDuration2"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                    //console.log("product.PreparationTime"+product.PreparationTime)
                } else {
                    totalDuration += product.TotalDuration;
                    //console.log("totalDuration3"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                }
            }
        }

        // let onlyStaffUpdate = await checkBookingDetail(knex, json.BookingId, json);
        let autoDispatchNotifyStaff = [];
        let bookingFirstProTime = getBookingStartTime(products);
        STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);
        if (!momentz.tz(bookingFirstProTime, process.env.STAFF_ZONE).isSame(momentz.tz(bookingData.DateTime, process.env.STAFF_ZONE))) {
            //console.log("time changed")
            json.IsPushNotification = true;
        } else {
            //console.log("time not changed")
        }

         /****************************
         * Check user info is available otherwise create new user
         ****************************/
          let userId = json.UserId ? json.UserId : null;
          let userName = json.Name;
          if(Object.keys(json.Userdata).length!=0){
            if (!userId) {
                let emailExist = await knex(USERS).select("UserId", "Name").where("Email", "=", json.Email);
                if (emailExist.length > 0) {
                    userId = emailExist[0].UserId;
                    userName = emailExist[0].Name;
                }
            }
            if (!userId) {
                let user=json.Userdata
                if (
                    !user.Name 
                  //   !user.Email ||
                  //   !user.Contact ||
                  //   typeof user.Gender !== "number" || user.Gender < 0 || user.Gender > 1||
                  //   typeof user.Elevator !== "number" || user.Elevator < 0 || user.Elevator > 1||
                  //   typeof user.Therapist !== "number" || user.Therapist < 0 || user.Therapist > 2||
                  //   typeof user.PreferredLanguage !== "number" || user.PreferredLanguage < 0 ||
                  //   typeof user.ClientSource  !== "number" || user.ClientSource < 0 ||
                  //   !user.Zip ||
                  //   !user.HouseNumber ||
                  //   !user.Notes ||
                  //   !user.DOB
                    
                ) {
                    throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
                }
    
                //console.log("user")
                const userInserted = await knex(USERS).insert(
                    {
                        FromCMS: 1,
                        Name: user.Name,
                        Email: user.Email,
                        ImagePath: user.ImagePath ? user.ImagePath : null,
                        Contact: user.Contact,
                        Gender: user.Gender,
                        Therapist: user.Therapist,
                        Street: user.Street? user.Street : null,
                        HouseNumber: user.HouseNumber,
                        Floor: user.Floor ? user.Floor : null,
                        City: user.City ? user.City : null,
                        Zip: user.Zip ? user.Zip : null,
                        DOB: user.DOB ? new Date(user.DOB) :  null,
                        Distance: user.Distance ? user.Distance : null,
                        ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                        PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                        ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                        Elevator: user.Elevator ? 1 : 0,
                        Notes: user.Notes,
                        FullAddress : user.FullAddress?user.FullAddress:null,
                        ...zone.getCreateUpdate()
                    }
                )
                userId = userInserted[0];
            }
            else{
               

             
              if(json.userUpdated){
                  let user=json.Userdata
              if (
                  !user.Name 
                  // !user.Email ||
                  // !user.Contact ||
                  // typeof user.Gender !== "number" || user.Gender < 0 || user.Gender > 1||
                  // // typeof user.Elevator !== "number" || user.Elevator < 0 || user.Elevator > 1||
                  // typeof user.Therapist !== "number" || user.Therapist < 0 || user.Therapist > 2||
                  // typeof user.PreferredLanguage !== "number" || user.PreferredLanguage < 0 ||
                  // typeof user.ClientSource  !== "number" || user.ClientSource < 0 ||
                  // !user.Zip ||
                  // !user.HouseNumber ||
                  // !user.DOB 
                 
                  
                  
              ) {
                  throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
              }
              if(json.saveUserDetailRecord){
                await knex(USERS)
              .update({
                  FromCMS: 1,
                      Name: user.Name,
                      Email: user.Email,
                      ImagePath: user.ImagePath ? user.ImagePath : null,
                      Contact: user.Contact,
                      Gender: user.Gender,
                      Therapist: user.Therapist,
                      Street: user.Street? user.Street : null,
                      HouseNumber: user.HouseNumber,
                      Floor: user.Floor ? user.Floor : null,
                      City: user.City ? user.City : null,
                      Zip: user.Zip ? user.Zip : null,
                      DOB: user.DOB ? new Date(user.DOB) :  null,
                      Distance: user.Distance ? user.Distance : null,
                      ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                      PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                      ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                      Elevator: user.Elevator ? 1 : 0,
                      Notes: user.Notes,
                      FullAddress : user.FullAddress?user.FullAddress:null,
                      LastUpdated: zone.getLastUpdate()
              })
              .where("UserId", "=", json.UserId)

              }else{
                await knex(USERS)
              .update({
                  FromCMS: 1,
                      Name: user.Name,
                      Email: user.Email,
                      ImagePath: user.ImagePath ? user.ImagePath : null,
                      Contact: user.Contact,
                      Gender: user.Gender,
                      Therapist: user.Therapist,
                      DOB: user.DOB ? new Date(user.DOB) :  null,
                      PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                      ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                      Notes: user.Notes,
                      LastUpdated: zone.getLastUpdate()
              })
              .where("UserId", "=", json.UserId)
              }
              await knex(BOOKINGS)
                        .update({
                            UserId:json.UserId,
                            LastUpdated: zone.getLastUpdate(),
                        })
                        .where("UserId", "=", json.UserId)
                        .modify(queryBuilder => {
                    
                    console.log(queryBuilder.toSQL().toNative())
                });
              //console.log("user")
  
              
              }
            
          }
          }
          

       


        let bookingInserted;
        let isNewBookingFromDraft=false
        if(bookingData.Status==BOOKING_STATUS.DRAFT){
            // need to create a new booking from draft.
            const dataSubmit = {
                BookingProvider: bookingData.BookingProvider,
                UserId: userId,
                Street: json.Street,
                HouseNumber: json.HouseNumber,
                Floor: json.Floor ? json.Floor : null,
                City: json.City ? json.City : null,
                Zip: json.Zip ? json.Zip : null,
                Distance: json.Distance ? json.Distance : null,
                Elevator: json.Elevator,
                Amount: json.Amount,
                Duration: totalDuration,
                DateTime: moment(bookingFirstProTime).toDate(),
                ReachOutTime: json.ReachOutTime,
                PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
                PromoCode: json.PromoCode ? json.PromoCode : null,
                PromoAmount: json.PromoAmount ? json.PromoAmount : null,
                PaidPrice: json.PaidPrice,
                PaymentStatus: json.PaymentStatus ? json.PaymentStatus : BOOKING_PAYMENT_STATUS.MANUAL,
                TransactionId: null,                                        //updated after successfull payment
                TransactionDate: null,                                      //updated after successfull payment
                Status: BOOKING_STATUS.CONFIRMED,
                PredecessorBookingId: json.BookingId,
                SuccessorBookingId: null,
                SystemPhase: SYSTEM_PHASE.PHASE_TWO,
                Deleted: 0,
                TravelFee: json.TravelFee ? json.TravelFee : 0,
                BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
                PaymentType: json.PaymentType ? json.PaymentType : 0,
                OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
                BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
                BookedBy: json.BookedBy,
                FullAddress:json.FullAddress,
                ...zone.getCreateUpdate()
            };
            let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
            if (bookingResult.length === 0) {
                throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
            }
            bookingInserted = bookingResult[0];
            isNewBookingFromDraft=true
             //now we have BookingId for further operations
            // update existing booking status to cancelled and insert its successor booking id
            const prevBookingUpdated = await knex(BOOKINGS)
                .where("BookingId", "=", json.BookingId)
                .update({
                    Status: BOOKING_STATUS.CANCELLED_DRAFT,
                    SuccessorBookingId: bookingInserted
                })
        }else{
            if (isNewBooking) {
                // need to create a new booking.
                const dataSubmit = {
                    BookingProvider: bookingData.BookingProvider,
                    UserId: userId,
                    Street: json.Street,
                    HouseNumber: json.HouseNumber,
                    Floor: json.Floor ? json.Floor : null,
                    City: json.City ? json.City : null,
                    Zip: json.Zip ? json.Zip : null,
                    Distance: json.Distance ? json.Distance : null,
                    Elevator: json.Elevator,
                    Amount: json.Amount,
                    Duration: totalDuration,
                    DateTime: moment(bookingFirstProTime).toDate(),
                    ReachOutTime: json.ReachOutTime,
                    PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
                    PromoCode: json.PromoCode ? json.PromoCode : null,
                    PromoAmount: json.PromoAmount ? json.PromoAmount : null,
                    PaidPrice: json.PaidPrice,
                    PaymentStatus: json.PaymentStatus ? json.PaymentStatus : BOOKING_PAYMENT_STATUS.MANUAL,
                    TransactionId: null,                                        //updated after successfull payment
                    TransactionDate: null,                                      //updated after successfull payment
                    Status: BOOKING_STATUS.CONFIRMED,
                    PredecessorBookingId: json.BookingId,
                    SuccessorBookingId: null,
                    SystemPhase: SYSTEM_PHASE.PHASE_TWO,
                    Deleted: 0,
                    TravelFee: json.TravelFee ? json.TravelFee : 0,
                    BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
                    PaymentType: json.PaymentType ? json.PaymentType : 0,
                    OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
                    BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
                    BookedBy: json.BookedBy,
                    FullAddress:json.FullAddress,
                    ...zone.getCreateUpdate()
                };
                let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
                if (bookingResult.length === 0) {
                    throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
                }
                bookingInserted = bookingResult[0];                         //now we have BookingId for further operations
                // update existing booking status to cancelled and insert its successor booking id
                const prevBookingUpdated = await knex(BOOKINGS)
                    .where("BookingId", "=", json.BookingId)
                    .update({
                        Status: BOOKING_STATUS.UPDATED_TO_NEW,
                        SuccessorBookingId: bookingInserted
                    })
            } else {
                //console.log("// this is a booking not update case.")
                // this is a booking update case.
                let bookingUpdated = await knex(BOOKINGS)
                    .where("BookingId", "=", json.BookingId)
                    .update({
                        Street: json.Street,
                        HouseNumber: json.HouseNumber,
                        Floor: json.Floor ? json.Floor : null,
                        City: json.City ? json.City : null,
                        Zip: json.Zip ? json.Zip : null,
                        Elevator: json.Elevator,
                        DateTime: moment(bookingFirstProTime).toDate(),
                        Distance: json.Distance ? json.Distance : null,
                        LastUpdated: zone.getLastUpdate(),
                        TravelFee: json.TravelFee ? json.TravelFee : 0,
                        UserId: userId,
                        BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
                        PaymentType: json.PaymentType ? json.PaymentType : 0,
                        OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
                        BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
                        BookedBy: json.BookedBy,
                        FullAddress:json.FullAddress
                    })
                bookingInserted = json.BookingId;
            }
        }
        

        let pushProductNames = [];
        // Insert new booking products and addons
        for (let index = 0; index < products.length; index++) {
            let product = products[index];
            let guestId = 0;
            let bookingProductId = null;
            const nameFound = pushProductNames.find(f => f === product.Name);
            if (!nameFound) {
                pushProductNames.push(product.Name);
            }
            if (isNewBooking || isNewBookingFromDraft) {
                if (product.Guest) {
                    const guest = product.Guest;
                    const guestInsert = await knex(GUESTS)
                        .insert({
                            UserId: bookingData.UserId,
                            BookingId: bookingInserted,
                            ...guest,
                            ...zone.getCreateUpdate()
                        })
                    guestId = guestInsert[0];
                }
                // const nameFound = pushProductNames.find(f => f === product.Name);
                // if (!nameFound) {
                //     pushProductNames.push(product.Name);
                // }
                const productInserted = await knex(BOOKING_PRODUCTS)
                    .insert({
                        BookingId: bookingInserted,
                        Product: product.Name,
                        ProductId: product.ProductId,
                        CategoryId: product.CategoryId,
                        Duration: product.Duration,
                        Amount: product.Amount,
                        PreparationTime: product.PreparationTime,
                        StaffId: product.StaffId ? product.StaffId : null,
                        UserId: !product.Guest ? bookingData.UserId : null,
                        GuestId: product.Guest ? guestId : null,
                        SameTime: product.SameTime,
                        StartTime: new moment(product.StartTime).toDate(),
                        Therapist: product.Therapist,
                        ForceStaffAllot: json.ForceStaffAllot ? 1 : 0, DispatchType: product.DispatchType,
                        Status: BOOKING_PRODUCT_STATUS.NOT_STARTED,
                        DispatchId: product.DispatchId,
                        StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                        DiscountedAmount: product.DiscountedAmount ? product.DiscountedAmount: 0,
                        Discount: product.Discount ? product.Discount: 0,
                        ...zone.getCreateUpdate()
                    });
                bookingProductId = productInserted[0];

            } else {
                //console.log("product")
                //console.log(product)
                let prodUpdated = await knex(BOOKING_PRODUCTS)
                    .where("BookingProductId", "=", product.BookingProductId)
                    .update({
                        DispatchType: product.DispatchType,
                        DispatchId: null,
                        StartTime: new moment(product.StartTime).toDate(),
                        StaffId: product.StaffId ? product.StaffId : null,
                        StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                        ForceStaffAllot: json.ForceStaffAllot ? 1 : 0, DispatchType: product.DispatchType,
                        LastUpdated: zone.getLastUpdate()
                    });
                bookingProductId = product.BookingProductId;
            }

            if (
                product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH ||
                product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH
            ) {
                // Insert the staffList to dispatch and save this staff for automatic dispatch notification.
                let productDispatchList = [];
                product.DispatchList.forEach(staff => {
                    productDispatchList.push({
                        DispatchId: product.DispatchId,
                        StaffId: staff.StaffId,
                        Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                        ...zone.getCreateUpdate()
                    });
                    if (product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH) {
                        let stFound = STAFF_CURRENT_SCHEDULE.find(sts => sts.StaffId === staff.StaffId);
                        autoDispatchNotifyStaff.push({
                            StaffId: stFound.StaffId,
                            FcmToken: stFound.FcmToken,
                            DateTime: product.StartTime,
                            DispatchId: product.DispatchId
                        });
                    }
                });
                if (!isNewBooking && !isNewBookingFromDraft) {
                    // Delete the existing dispatch records if exist.
                    let existRecs = await knex(BOOKING_PRODUCTS)
                        .select("DispatchId")
                        .where("BookingProductId", "=", product.BookingProductId);
                    if (existRecs[0].DispatchId) {
                        let recsDeleted = await knex(BOOKING_PRODUCT_DISPATCH)
                            .where("DispatchId", "=", existRecs[0].DispatchId)
                            .del();
                    }
                }
                let insertedDispatchList = await knex(BOOKING_PRODUCT_DISPATCH).insert(productDispatchList);
            }

            if (isNewBooking || isNewBookingFromDraft) {
                if (product.Extras && product.Extras.length > 0) {
                    for (let extInc = 0; extInc < product.Extras.length; extInc++) {
                        const extra = product.Extras[extInc];
                        let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
                            .insert({
                                BookingProductId: bookingProductId,
                                ExtraTitle: extra.ExtraTitle,
                                ExtraValue: extra.ExtraValue,
                                ...zone.getCreateUpdate()
                            })

                    }
                }

                if (product.AddOns.length > 0) {
                    let AddOns = product.AddOns;
                    for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                        const addOn = AddOns[addOnIndex];
                        let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
                            .insert({
                                BookingId: bookingInserted,
                                BookingProductId: bookingProductId,
                                AddOnId: addOn.AddOnId,
                                AddOn: addOn.Name,
                                Duration: addOn.Duration,
                                Amount: addOn.Amount,
                                BookingAddOnPaymentId: null,
                                Status: BOOKING_PRODUCT_ADD_ON_STATUS.NOT_STARTED,
                                StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
                                ...zone.getCreateUpdate()
                            })
                    }
                }
            }

            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                // Events configuration
                if (index === 0) {
                    let startTime = new moment(product.StartTime).utc();
                    let endTime = new moment(product.StartTime).utc();
                    endTime.add(product.TotalDuration, "minute");
                    let eventObj = {
                        StaffId: product.StaffId,
                        start: {
                            dateTime: startTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        end: {
                            dateTime: endTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        attendees: [
                            { email: process.env.EMAIL },
                            { email: product.StaffEmail }
                        ],
                        Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                        BookingProductId: [bookingProductId],
                        extendedProperties: {
                            shared: {
                                'BookingId': bookingInserted,
                                'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                'ReturnTime': json.ReachOutTime
                            }
                        }
                    }
                    eventsData.push(eventObj);
                } else {
                    let found = eventsData.find(sta => sta.StaffId === product.StaffId);        //create staff entry for events if not exists already
                    if (found) {
                        found.end.dateTime = new moment(found.end.dateTime)
                            .add(product.PreparationTime + product.TotalDuration, "minute").toDate();
                        found.Products.push(product.Name + " (" + product.TotalDuration + " mins)")
                        found.BookingProductId.push(bookingProductId);
                    } else {
                        let startTime = new moment(product.StartTime).utc();
                        let endTime = new moment(product.StartTime).utc();
                        endTime.add(product.TotalDuration, "minute");
                        let eventObj = {
                            StaffId: product.StaffId,
                            start: {
                                dateTime: startTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            attendees: [
                                { email: process.env.EMAIL },
                                { email: product.StaffEmail }
                            ],
                            Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                            BookingProductId: [bookingProductId],
                            extendedProperties: {
                                shared: {
                                    'BookingId': bookingInserted,
                                    'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                    'ReturnTime': json.ReachOutTime
                                }
                            }
                        }
                        eventsData.push(eventObj);
                    }
                }
            }
        }

        //Insert Special request
        // Fetch eventIds of previous booking from DB & delete them from calendar
        const bookingEvents = await knex(BOOKING_PRODUCTS).select("EventId").where("BookingId", "=", json.BookingId);
        for (let evInc = 0; evInc < bookingEvents.length; evInc++) {
            const event = bookingEvents[evInc];
            if (!event.EventId) {
                continue;
            }
            try {
                const deleted = await calendar.events.delete({
                    calendarId: "primary",
                    eventId: event.EventId
                })
            } catch (error) {
                //console.log(error);
            }
        }

        // Generate Events on google calendar
        let finalEvents = [];
        eventsData.forEach(config => {
            const description = config.Products.toString();
            finalEvents.push({
                ...config,
                summary: json.Name + ", Booking #" + bookingInserted,
                description
            })
        });
        for (let ev = 0; ev < finalEvents.length; ev++) {
            const event = finalEvents[ev];
            const inserted = await calendar.events.insert({
                auth: oAuth2Client,
                calendarId: "primary",
                resource: event
            });
            const eventInserted = await knex(BOOKING_PRODUCTS)
                .whereIn("BookingProductId", event.BookingProductId)
                .update({
                    EventId: inserted.data.id,
                    LastUpdated: zone.getLastUpdate()
                })
        }

        let markToDispatched = [];
        for (let dispInc = 0; dispInc < autoDispatchNotifyStaff.length; dispInc++) {
            const staff = autoDispatchNotifyStaff[dispInc];
            let dispatchFound = markToDispatched.find(f => f === staff.DispatchId);
            if (!dispatchFound) {
                markToDispatched.push(staff.DispatchId);
            }
        }
        if (markToDispatched.length) {
            let marked = await knex(BOOKING_PRODUCT_DISPATCH)
                .whereIn("DispatchId", markToDispatched)
                .update({
                    Status: DISPATCH_STATUS.DISPATCHED
                })
        }
        let bookingID=(isNewBooking || isNewBookingFromDraft)?bookingInserted:json.BookingId
        //console.log(bookingInserted)
            var deletedSpecialRequest = await knex(BOOKING_SPECIAL_REQUEST)
                .where("BookingId", "=", bookingInserted)
                .delete().
                modify(function(qb){
                   //console.log( qb.toSQL().toNative())
                });
                //console.log(deletedSpecialRequest)

        if (json.SpecialRequest.length > 0) {
            let preDefinedRequest=[]
            let reqToAdd=[]
            for (let reqIndex = 0; reqIndex < json.SpecialRequest.length; reqIndex++) {
                if(typeof (json.SpecialRequest[reqIndex]) == "number"){
                    
                    
                    //console.log(json.SpecialRequest[reqIndex])
                    preDefinedRequest.push(json.SpecialRequest[reqIndex])
                    //console.log("if")
                }else{
                    //console.log("else")
                    let requestData={
                        SpecialRequestName:json.SpecialRequest[reqIndex],
                        IsUSerDefined:1,
                        ...zone.getCreateUpdate()
                    }
                    let addedRequest = await knex(SPECIAL_REQUEST).insert(requestData) 
                    preDefinedRequest.push(addedRequest[0])
                }
            }
            for (let reqIndex = 0; reqIndex < preDefinedRequest.length; reqIndex++) {
                reqToAdd.push({
                    BookingId:bookingID,
                    SpecialRequestId:preDefinedRequest[reqIndex],
                    ...zone.getCreateUpdate()
                })
            }
            let addedBookingRequest = await knex(BOOKING_SPECIAL_REQUEST).insert(reqToAdd) 
            
        }


        if(json.AdminNotes){
            let bookingExtra = await knex(BOOKING_EXTRA)
                .select("AdminNotes","BookingExtraId")
                .where("BookingId", "=", bookingID);
            if(bookingExtra.length >0){
                let updateAdminNotes = await knex(BOOKING_EXTRA)
                .update({
                    AdminNotes: json.AdminNotes.trim(),
                    LastUpdated: zone.getLastUpdate()
                })
                .where("BookingExtraId", "=", bookingExtra[0].BookingExtraId)
            }else{
                let requestData={
                    AdminNotes: json.AdminNotes.trim(),
                    BookingId:bookingID,
                    ...zone.getCreateUpdate()
                }
                let addedNotes = await knex(BOOKING_EXTRA).insert(requestData) 
            }
        }else{
            json.AdminNotes='';
            let bookingExtra = await knex(BOOKING_EXTRA)
                .select("AdminNotes","BookingExtraId")
                .where("BookingId", "=", bookingID);
                if(bookingExtra.length >0){
                    let updateAdminNotes = await knex(BOOKING_EXTRA)
                .update({
                    AdminNotes: json.AdminNotes,
                    LastUpdated: zone.getLastUpdate()
                })
                .where("BookingExtraId", "=", bookingExtra[0].BookingExtraId)
                }
            
        }

        

        // response = await this.bookings(knex, null, event.headers['api-client']);
        try {
            if (json.IsPushNotification) {
                //console.log("send push");
                let userFcm = await knex(USERS).select("FcmToken").where("UserId", "=", bookingData.UserId);
                // const title = "Booking Updated";
                const title = PUSH.TITLE.BOOKING_UPDATED_F_CMS;
                const description = `As per request, your booking scheduled on ${momentz.tz(bookingFirstProTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)} for ${pushProductNames.toString()} is updated.`;
                const newMessage = {
                    UserId: bookingData.UserId,
                    Title: title,
                    Description: description,
                    Date: moment().utc().toDate(),
                    ...zone.getCreateUpdate()
                }
                const userMessageInserted = await knex(USER_MESSAGES).insert(newMessage);
                if (userFcm[0].FcmToken) {
                    const message = {
                        token: userFcm[0].FcmToken,
                        notification: {
                            title: title,
                            body: description,
                        },
                        data: {
                            BookingId: `${bookingInserted}`,
                            ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                        }
                    }
                    const userApp = InitializeFirebase();
                    const sentNotifications = await userApp.messaging().send(message);
                    //console.log(sentNotifications)
                }
            }
        } catch (error) {
            //console.log(error);
        }

        // Send push to therapist for previous and new staff all
        let staffPushNotify = [];
        try {
            let prevBookStaff = await knex
                .select(
                    BOOKING_PRODUCTS + ".StaffId",
                    STAFF + ".FcmToken"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
                .where(BOOKING_PRODUCTS + ".BookingId", "=", json.BookingId);

            let newBookingStaff = await knex
                .select(
                    BOOKING_PRODUCTS + ".StaffId",
                    STAFF + ".FcmToken"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
                .where(BOOKING_PRODUCTS + ".BookingId", "=", bookingInserted);
            prevBookStaff.forEach(element => {
                const found = staffPushNotify.find(f => f.StaffId === element.StaffId);
                if (!found) {
                    staffPushNotify.push({
                        StaffId: element.StaffId,
                        FcmToken: element.FcmToken
                    })
                }
            });
            newBookingStaff.forEach(element => {
                const found = staffPushNotify.find(f => f.StaffId === element.StaffId);
                if (!found) {
                    staffPushNotify.push({
                        StaffId: element.StaffId,
                        FcmToken: element.FcmToken
                    })
                }
            });

            // send push notification to staff
            for (let pushInc = 0; pushInc < staffPushNotify.length; pushInc++) {
                const element = staffPushNotify[pushInc];
                if (element.StaffId) {
                    // let title = `Booking updated`;
                    let title = PUSH.TITLE.BOOKING_UPDATED_F_CMS;
                    let description = `The booking #${json.BookingId} is updated, scheduled on ${momentz.tz(bookingFirstProTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                    // insert staff specific message in DB
                    const msgInsert = await knex(STAFF_MESSAGES).insert({
                        StaffId: element.StaffId,
                        Title: title,
                        Description: description,
                        ImagePath: null,
                        Tag: 1,
                        Date: moment().toDate(),
                        ...zone.getCreateUpdate()
                    })
                    try {
                        if (element.FcmToken) {
                            const message = {
                                token: element.FcmToken,
                                notification: {
                                    title,
                                    body: description
                                },
                                data: {
                                    BookingId: `${bookingInserted}`,
                                    DateTime: moment(json.DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                    ScreenName: PUSH.SCREEN.BOOKINGS,
                                    TimeZone: process.env.STAFF_ZONE
                                }
                            }
                            //console.log(message);
                            const therapistApp = InitializeFirebaseTherapist();
                            const sentNotifications = await therapistApp.messaging().send(message);
                            //console.log(sentNotifications)
                        }
                    } catch (error) {
                        //console.log(error)
                    }
                }
            }


        } catch (error) {
            //console.log(error)
        }

        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingRateCalculation = getLambdaNameByInstance() + "-calculateBookingStaffRate";
            console.log(bookingRateCalculation)
            lambda.invoke({
                FunctionName: bookingRateCalculation,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: bookingID
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    //console.log('Lambda_Push said ' + data.Payload);
                }
            });

            // await holdfor10secs();
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            console.log(error)
        }

        //create invoice and void previous if unpaid. If Object has IsNewInvoice true then new will be created
        const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
        if(json.VoidInvoice){
            let bookingInvoice = await knex(BOOKING_INVOICE_DATA)
                .select("*")
                .where("BookingId", "=", json.BookingId)
                .andWhere("InvoiceStripeStatus", "=", 'open');
                if(bookingInvoice.length>0){
                    //console.log(bookingInvoice)
                    const invoice= await retrieveStripeInvoice(stripe,bookingInvoice[0].InvoiceId)
                    //console.log(invoice)
                    if(invoice.status=='open'){
                        const voidInvoice= await voidStripeInvoice(stripe,bookingInvoice[0].InvoiceId)
                        //console.log(voidInvoice)
                    }
                    
                }
        }
        if(json.IsNewInvoice){
            try{
            
                const invoice=await createInvoice(json,bookingData.UserId,bookingInserted)
                response.Invoice=invoice
                if(invoice){
                    var invoiceData = {
                        InvoiceUrl: invoice.hosted_invoice_url,
                        ...zone.getLastUpdate()
            
            
                    }
            
                    var updated = await knex(BOOKINGS)
                        .where("BookingId", "=", bookingInserted)
                        .update({
                            ...invoiceData
                        })
                }
            }
            catch (error) {
                //console.log(error);
                await knex.destroy();
                if(error.Status && error.Status==424){
                    return {
                        statusCode: 424,
                        headers: {
                            ...Headers,
                            Message: error.message
                        }
                    }
                }else{
                    return {
                        statusCode: 424,
                        headers: {
                            ...Headers,
                            Message: MESSAGE.INVOICE_NOT_CREATED
                        }
                    }
                }
            }
        }
        try{
            if(json.ResendInvoice){
                let bookingInvoice = await knex(BOOKING_INVOICE_DATA)
                .select("*")
                .where("BookingId", "=", json.BookingId)
                .andWhere("InvoiceStripeStatus", "=", 'open');
                if(bookingInvoice.length>0){
                    //console.log(bookingInvoice)
                    const invoice= await retrieveStripeInvoice(stripe,bookingInvoice[0].InvoiceId)
                    if(invoice){
                        await sendCustomInvoiceEmail(invoice,json)
                        response.Invoice=invoice
                    }

                    
                } 
            }
        }
        catch (error) {
            await knex.destroy();
            //console.log(error);

            let err = new Error(MESSAGE.INVOICE_NOT_CREATED);
            err.Status = 424;
            throw err;
        }
        // Save log for update
        await saveLog(knex,json.AdminId,BOOKINGS,json.BookingId,LOG_ACTION_TYPE.UPDATE)
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

const checkBookingDetail = async (knex, bookingId, updatedBooking) => {
    let onlyStaffUpdate = true;
    let existBookingDetail = await bookingDetail(knex, bookingId);
    if (
        existBookingDetail.Street !== updatedBooking.Street ||
        !moment(existBookingDetail.DateTime).isSame(moment(updatedBooking.DateTime)) ||
        existBookingDetail.Amount !== updatedBooking.Amount
    ) {
        onlyStaffUpdate = false;
    }
    existBookingDetail.Products.forEach(product => {

    });
    //console.log(existBookingDetail);
    //console.log(updatedBooking);
    return onlyStaffUpdate;
}

module.exports.cancelBooking = async event => {
    /**
     * API Objective: Cancel a booking on admin behalf
     * Working:
     * 1. Check for required data.
     * 2. First check if booking satisfy cancellation requirements.
     * 3. Fetch booking and all its staff with calendar events.
     * 4. Mark the booking status 7-Cancelled Manually.
     * 5. Delete the calendar events if any.
     * 6. Free the staff from booking, if its CurrentBookingId === booking to be cancelled.
     */

    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var connected = false;
        var knex = require("knex")(con);
        connected = true;
        const bookingId = json.BookingId;
        let bookingExistStatus = await knex(BOOKINGS).select("BookingId", "UserId", "DateTime", "Status").where("BookingId", "=", bookingId)
        STAFF_ZONE = zone.getStaffZone(bookingExistStatus[0].DateTime);
        let notAllowedBookings = [...BOOKING_NOT_ALLOWED_TO_CANCEL];
        const bookingStatus = bookingExistStatus[0].Status;
        const bookingStatusData = BOOKING_STATUS_DESC.find(f => f.code === bookingStatus);
        if (notAllowedBookings.includes(bookingStatus)) {
            throw new Error(`Booking with Status - "${bookingStatusData.name}" can't be cancelled`);
        }

        let updateObj = {
            Status: BOOKING_STATUS.CANCELLED_MANUALLY,
            CancelBookingReason:json.CancelBookingReason,
            CancelBookingNotes:json.CancelBookingNotes,
            LastUpdated: zone.getLastUpdate()
        }
        let bookingCancelled = await knex(BOOKINGS).where("BookingId", "=", bookingId).update(updateObj)
        .modify(queryBuilder => {
            queryBuilder.toSQL().toNative()
        });
        let prodUpdObj = {
            Status: BOOKING_PRODUCT_STATUS.CANCELLED_MANUALLY,
            LastUpdated: zone.getLastUpdate()
        }
        let productStatusCancelled = await knex(BOOKING_PRODUCTS).where("BookingId", "=", bookingId).update(prodUpdObj);
        let addOnObj = {
            Status: BOOKING_PRODUCT_ADD_ON_STATUS.CANCELLED_MANUALLY,
            LastUpdated: zone.getLastUpdate()
        }
        let addOnStatusCancelled = await knex(BOOKING_PRODUCT_ADDONS).where("BookingId", "=", bookingId).update(addOnObj);

        let bookingStaff = await knex(BOOKING_PRODUCTS)
            .select(
                "StaffId",
                "EventId"
            )
            .where("BookingId", "=", bookingId);
        let staffPushNotify = [];
        for (let evInc = 0; evInc < bookingStaff.length; evInc++) {
            const staffEvents = bookingStaff[evInc];
            if (staffEvents.StaffId) {
                let staffStatus = await knex(STAFF).select("CurrentBookingId", "FcmToken").where("StaffId", "=", staffEvents.StaffId);
                const pushStFound = staffPushNotify.find(f => f.StaffId === staffEvents.StaffId);
                if (!pushStFound) {
                    staffPushNotify.push({
                        StaffId: staffEvents.StaffId,
                        FcmToken: staffStatus && staffStatus[0] ? staffStatus[0].FcmToken : null
                    })
                }
                if (staffStatus && staffStatus[0] && staffStatus[0].CurrentBookingId === bookingId) {
                    //console.log("staff in booking");
                    // free the staff and remove CurrentBookingId
                    let updateObj = {
                        Status: STAFF_STATUS.AVAILABLE,
                        CurrentBookingId: null,
                        LastUpdated: zone.getLastUpdate()
                    }
                    let staffFreed = await knex(STAFF).where("StaffId", "=", staffEvents.StaffId)
                        .update(updateObj)
                }
                try {
                    let eventDeleted = await calendar.events.delete({
                        calendarId: 'primary',
                        auth: oAuth2Client,
                        eventId: staffEvents.EventId
                    });
                } catch (error) {
                    // event might be already deleted
                    //console.log(error.message);
                }
            }
        }
        if(bookingExistStatus[0].UserId){
            await knex(USER_MESSAGES).insert({
                UserId: bookingExistStatus[0].UserId,
                Title: PUSH.TITLE.BOOKING_CANCELLED_F_CMS,
                Description: `The booking scheduled on ${momentz.tz(bookingExistStatus[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)} is cancelled, If not requested by you please contact support.`,
                ImagePath: null,
                Date: moment().toDate(),
                ...zone.getCreateUpdate()
            })
    
            let userFcmToken = await knex(USERS).select("FcmToken").where("UserId", "=", bookingExistStatus[0].UserId);
            if (userFcmToken.length > 0) {
                let token = userFcmToken[0].FcmToken;
                if (token) {
                    const message = {
                        token,
                        notification: {
                            title: PUSH.TITLE.BOOKING_CANCELLED_F_CMS,
                            body: `The booking scheduled on ${momentz.tz(bookingExistStatus[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)} is cancelled, If not requested by you please contact support.`
                        },
                        data: {
                            ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                        }
                    }
                    try {
                        const admin = InitializeFirebase();
                        const sentNotification = await admin.messaging().send(message);
                        //console.log(sentNotification)
                    } catch (error) {
                        //console.log(error);
                    }
                }
            }
        }
        

        // send push to staff
        for (let pushInc = 0; pushInc < staffPushNotify.length; pushInc++) {
            const element = staffPushNotify[pushInc];
            let title = PUSH.TITLE.BOOKING_CANCELLED_F_CMS;
            let description = `The booking #${json.BookingId} scheduled on ${momentz.tz(bookingExistStatus[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)} is cancelled`;
            // insert staff specific message in DB
            const msgInsert = await knex(STAFF_MESSAGES).insert({
                StaffId: element.StaffId,
                Title: title,
                Description: description,
                ImagePath: null,
                Tag: 1,
                Date: moment().toDate(),
                ...zone.getCreateUpdate()
            })
            try {
                if (element.FcmToken) {
                    const message = {
                        token: element.FcmToken,
                        notification: {
                            title,
                            body: description
                        },
                        data: {
                            BookingId: `${json.BookingId}`,
                            ScreenName: PUSH.SCREEN.MESSAGES
                        }
                    }
                    //console.log(message);
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotifications = await therapistApp.messaging().send(message);
                    //console.log(sentNotifications)
                }
            } catch (error) {
                //console.log(error)
            }

        }

        // var bookingList = await this.bookings(knex, null, "web");
        
        // Save log for delete
        await saveLog(knex,json.AdminId,BOOKINGS,bookingId,LOG_ACTION_TYPE.DELETE)

        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_CANCELLED
        },
        // body: setPayloadData(event, {
        //     Data: bookingList
        // })
    }
}

module.exports.bookingBadgeCount = async event => {
    let knex, connected = false, bookingCount;
    try {
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.LastBookingCheck
            // typeof json.LastBookingId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;

        let newBookings = await knex(BOOKINGS).count("BookingId").where("Created", ">", moment(json.LastBookingCheck).utc().toDate());
        bookingCount = {
            BookingCount: newBookings[0]['count(`BookingId`)']
        }

        // if (json.GetCurBCount) {
        //     let lastBId = await knex(BOOKINGS).max("BookingId");
        //     bookingCount = {
        //         LastBId: lastBId[0]['max(`BookingId`)']
        //     }
        // } else {
        //     let newBookings = await knex(BOOKINGS)
        //         .count("BookingId")
        //         .whereIn("Status", BOOKINGS_FOR_CMS)
        //         .andWhere("BookingId", ">", json.LastBookingId)
        //     bookingCount = {
        //         BookingCount: newBookings[0]['count(`BookingId`)']
        //     }
        // }
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BADGE_CHECK_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingCount
        })
    }
}

module.exports.getStripeObject = async event => {
    try {

        const json = event.body ? getPayloadData(event) : null;
        console.log(JSON.stringify({
            json
        }, null, 2));
        if (
            !json ||
            !json.Type ||
            !json.ObjectId
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        let returnData;
        if (json.Type === "Charge") {
            const charge = await stripe.charges.retrieve(json.ObjectId);
            returnData = charge
        }
        if (json.Type === "PaymentIntent") {
            const paymentIntent = await stripe.paymentIntents.retrieve(json.ObjectId);
            returnData = paymentIntent;
        }
        if (json.Type === "PaymentMethod") {
            const paymentMethod = await stripe.paymentMethods.retrieve(json.ObjectId);
            returnData = paymentMethod;
        }
        if (json.Type === "Customer") {
            const customer = await stripe.customers.retrieve(json.ObjectId);
            returnData = customer;
        }
        return {
            statusCode: 200,
            headers: {
                ...Headers,
                message: MESSAGE.OBJECT_FETCH_SUCCESS
            },
            body: setPayloadData(event, {
                Data: returnData
            })
        }
    } catch (error) {
        //console.log(error)
    }
}

module.exports.updateBookingExtra = async event => {
    let knex, connected = false, bookingData;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const bookingId = json.BookingId;
        knex = require("knex")(con);
        connected = true;
        const bookingExist = await knex(BOOKINGS).select("BookingId", "Status").where("BookingId", "=", bookingId);
        if (bookingExist.length === 0) {
            throw new Error(MESSAGE.SOMETHING_WENT_WRONG);
        }
        const bookingExtraExist = await knex(BOOKING_EXTRA).select("*").where("BookingId", "=", bookingId);
        if (bookingExtraExist.length === 0) {
            // need to insert extras row.
            let insertObj = {
                BookingId: bookingId,
                AdminNotes: json.AdminNotes.trim(),
                ...zone.getCreateUpdate()
            }
            const adminNotesInserted = await knex(BOOKING_EXTRA).insert(insertObj);
        } else {
            // update extras
            let updateObj = {
                AdminNotes: json.AdminNotes.trim(),
                LastUpdated: zone.getLastUpdate()
            }
            const adminNotesUpdated = await knex(BOOKING_EXTRA)
                .where("BookingId", "=", bookingId)
                .update(updateObj);
        }

        bookingData = await bookingDetail(knex, bookingId, event.headers['platform']);
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_EXTRAS_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingData
        })
    }
}

module.exports.notifyPreBooking = async event => {
    /**
     * Function Objective: notify user for booking before 15 mins.
     * Working: 
     * 1. Fetch confirmed bookings which are starting in next 15 mins.
     * 2. Send push to the user if not already sent & user has FcmToken.
     */
    let knex, connected = false, notifiedBookings = [];
    try {
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        knex = require("knex")(con);
        connected = true;
        let curTime = moment();
        let startTime = moment().add(24, "hour");
        let preNotifyTime = moment().add(3, "hour");
        //console.log(startTime);
        //console.log(preNotifyTime);
        // let curTime = moment("11/01/2021 10:15", "DD/MM/YYYY HH:mm");
        // let startTime = moment("11/01/2021 10:15", "DD/MM/YYYY HH:mm").add(15, "minute");        
        let bookingsToNotify = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".UserNotifiedPreBooking",
                BOOKINGS + ".Created",
                USERS + ".FcmToken"
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .where(BOOKINGS + ".Status", "=", BOOKING_STATUS.CONFIRMED)
            .andWhere(BOOKINGS + ".DateTime", ">=", curTime.toDate())
            .andWhere(BOOKINGS + ".DateTime", "<=", startTime.toDate())
            .andWhere(BOOKINGS + ".UserNotifiedPreBooking", "<", BOOKING_NOTIFICATION.THREE_HOUR_NOTIFIED);
        console.log(bookingsToNotify);
        if (bookingsToNotify.length > 0) {
            for (let bookingInc = 0; bookingInc < bookingsToNotify.length; bookingInc++) {
                const booking = bookingsToNotify[bookingInc];
                STAFF_ZONE = zone.getStaffZone(booking.DateTime);
                switch (booking.UserNotifiedPreBooking) {
                    case 0: {
                        // no notifications sent, send full day notification
                        console.log("sending 24hrs notification, Booking #" + booking.BookingId);
                        const title = `Upcoming Booking`;
                        const description = `You have a booking starting on ${momentz.tz(booking.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                        await knex(USER_MESSAGES).insert({
                            UserId: booking.UserId,
                            Title: title,
                            Description: description,
                            ImagePath: null,
                            Date: moment().toDate(),
                            ...zone.getCreateUpdate()
                        });
                        const userNotified = await knex(BOOKINGS)
                            .where("BookingId", "=", booking.BookingId)
                            .update({
                                UserNotifiedPreBooking: BOOKING_NOTIFICATION.FULL_DAY_NOTIFIED,
                                LastUpdated: zone.getLastUpdate()
                            })
                        if (booking.FcmToken) {
                            const message = {
                                token: booking.FcmToken,
                                notification: {
                                    title,
                                    body: description
                                },
                                data: {
                                    BookingId: `${booking.BookingId}`,
                                    ScreenName: "Booking Detail"
                                }
                            }
                            try {
                                notifiedBookings.push(booking.BookingId);
                                const userApp = InitializeFirebase();
                                const sentNotifications = await userApp.messaging().send(message);
                                //console.log(sentNotifications);
                            } catch (error) {
                                //console.log(error);
                            }
                        }
                        //console.log(moment(booking.DateTime).subtract(48, 'hours'));
                        //console.log(moment(booking.Created));
                        // if (moment(booking.DateTime).subtract(48, 'hours').isAfter(moment(booking.Created))) {
                        //     //console.log("send 24hr email notification, BOOKING #" + booking.BookingId);
                        //     try {
                        //         // send booking confirmation email
                        //         let lambda = new AWS.Lambda();
                        //         let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
                        //         lambda.invoke({
                        //             FunctionName: bookingNotifier,
                        //             InvocationType: 'Event',
                        //             LogType: 'Tail',
                        //             Payload: JSON.stringify({
                        //                 BookingId: booking.BookingId,
                        //                 UpcomingBooking: true
                        //             })
                        //         }, function (err, data) {
                        //             if (err) {
                        //                 //console.log(err);
                        //             } else {
                        //                 //console.log('Lambda_B said ' + data.Payload);
                        //             }
                        //         });

                        //         await holdfor10secs();
                        //     } catch (error) {
                        //         //console.log(error);
                        //     }
                        // }
                        break;
                    }
                    case 1: {
                        // full day notification already sent, check if booking start time is in next 30 mins, then send half hour notification
                        if (moment(booking.DateTime).isBefore(preNotifyTime)) {
                            console.log("sending 3 hour notification");
                            console.log("BOOKING #" + booking.BookingId);
                            const title = `Upcoming Booking`;
                            const description = `You have a booking starting on ${momentz.tz(booking.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                            await knex(USER_MESSAGES).insert({
                                UserId: booking.UserId,
                                Title: title,
                                Description: description,
                                ImagePath: null,
                                Date: moment().toDate(),
                                ...zone.getCreateUpdate()
                            });
                            const userNotified = await knex(BOOKINGS)
                                .where("BookingId", "=", booking.BookingId)
                                .update({
                                    UserNotifiedPreBooking: BOOKING_NOTIFICATION.THREE_HOUR_NOTIFIED,
                                    LastUpdated: zone.getLastUpdate()
                                })
                            if (booking.FcmToken) {
                                const message = {
                                    token: booking.FcmToken,
                                    notification: {
                                        title: `Upcoming Booking`,
                                        body: `You have a booking starting at ${momentz.tz(booking.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm + " " + DATE_TIME_FORMAT.z)}`
                                    },
                                    data: {
                                        BookingId: `${booking.BookingId}`,
                                        ScreenName: "Booking Detail"
                                    }
                                }
                                try {
                                    notifiedBookings.push(booking.BookingId);
                                    const userApp = InitializeFirebase();
                                    const sentNotifications = await userApp.messaging().send(message);
                                    //console.log(sentNotifications);
                                } catch (error) {
                                    //console.log(error);
                                }
                            }
                        }
                        break;
                    }
                    case 2: {
                        // all the notifications are sent, do nothing
                        break;
                    }
                }

            }
        }

        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 500,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.CRON_SUCCESS
        },
        body: JSON.stringify({
            Data: notifiedBookings
        })
    }
}

module.exports.getTip = async event => {
    let knex, connected = false, tipData;
    try {
        tipData = [];
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Month || typeof json.Month !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        let monthStart = moment(json.Month, DATE_TIME_FORMAT.MMLYYYY).startOf("month").toDate();
        let monthEnd = moment(json.Month, DATE_TIME_FORMAT.MMLYYYY).endOf("month").toDate();
        let tipRawData = await knex
            .select(
                BOOKING_TIPS + ".BookingTipId",
                BOOKING_TIPS + ".BookingId",
                BOOKING_TIPS + ".UserId",
                BOOKING_TIPS + ".TipAmount",
                BOOKING_PRODUCTS + ".StaffId",
                STAFF + ".Name as StaffName",
                USERS + ".Name as UserName",
                USERS + ".Archive"
            )
            .from(BOOKING_TIPS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKING_TIPS + ".BookingId")
            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
            .leftJoin(USERS, USERS + ".UserId", BOOKING_TIPS + ".UserId")
            .where(BOOKING_TIPS + ".PaymentStatus", "=", BOOKING_TIP_PAYMENT_STATUS.SUCCEEDED)
            .andWhere(BOOKING_TIPS + ".Created", ">=", monthStart)
            .andWhere(BOOKING_TIPS + ".Created", "<=", monthEnd);
        for (let tipInc = 0; tipInc < tipRawData.length; tipInc++) {
            const tip = tipRawData[tipInc];
            const found = tipData.find(f => f.BookingTipId === tip.BookingTipId);
            if (!found) {
                let tipObj = {
                    BookingTipId: tip.BookingTipId,
                    BookingId: tip.BookingId,
                    User: {
                        UserId: tip.UserId,
                        Name: tip.UserName,
                        Archive: tip.Archive
                    },
                    TipAmount: tip.TipAmount,
                    Staff: [
                        {
                            StaffId: tip.StaffId,
                            Name: tip.StaffName
                        }
                    ]
                }
                tipData.push(tipObj);
            } else {
                const staffFound = found.Staff.find(f => f.StaffId === tip.StaffId);
                if (!staffFound) {
                    found.Staff.push({
                        StaffId: tip.StaffId,
                        Name: tip.StaffName
                    })
                }
            }
        }
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.TIP_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: tipData
        })
    }
}

module.exports.updateGlobalDispatchSettings = async (event) => {
    let knex, connected = false, response = {};
    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.GlobalDispatchDefault !== "number" || json.GlobalDispatchDefault < 0 || json.GlobalDispatchDefault > 1 ||
            typeof json.InstantConfirmation !== "number" || json.InstantConfirmation < 0 || json.InstantConfirmation > 1 ||
            typeof json.IsFilterApplied !== "boolean" ||
            typeof json.DispatchFilters !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        await knex(BOOKING_PREFERENCE)
            .where("BookingPreferenceId", "=", 1)
            .update({
                GlobalDispatchDefault: json.GlobalDispatchDefault,
                InstantConfirmation: json.InstantConfirmation,
                IsFilterApplied: json.IsFilterApplied ? 1 : 0,
                IsPriorityActive: json.IsPriorityActive ? 1 : 0
            })

        if (json.IsFilterApplied) {
            for (let filInc = 0; filInc < json.DispatchFilters.length; filInc++) {
                const filter = json.DispatchFilters[filInc];
                await knex(DISPATCH_FILTERS)
                    .where("DispatchFilterId", "=", filter.DispatchFilterId)
                    .update({
                        IsActive: filter.IsActive ? 1 : 0
                    });
                if (filter.DispatchFilterId === ENUM_DISPATCH_FILTERS.GROUP.Id) {
                    // first mark all staff groups as not used in filter.
                    // mark the given staff groups as used in filter.
                    await knex(STAFF_GROUP)
                        .update({
                            IsUsedInFilter: 0,
                            Priority: 0
                        });
                    for (let grpInc = 0; grpInc < filter.ActiveStaffGroupsId.length; grpInc++) {
                        const group = filter.ActiveStaffGroupsId[grpInc];
                        //console.log(group)
                        await knex(STAFF_GROUP)
                            .where("StaffGroupId", "=", group)
                            .update({
                                IsUsedInFilter: 1,
                                Priority: json.IsPriorityActive ? grpInc + 1 : 0
                            })
                    }
                }
            }
        } else {
            // Disable all active filters, update all staff groups as inactive with 0 priority.
            await knex(DISPATCH_FILTERS)
                .update({
                    IsActive: 0
                });
            await knex(STAFF_GROUP)
                .update({
                    IsUsedInFilter: 0,
                    Priority: 0
                });
        }

        // Need to implement logs saving.
        response.GlobalDispatchSettings = await this.getGlobalDispatchSettings(knex);

        // knex.destroy().then(() => { });
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.DISPATCH_SETTING_UPDATED
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.updateBookingDispatchSettings = async (event) => {
    let knex, connected = false, response = [];
    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId ||
            !json.Products
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        json.Products.forEach(product => {
            if (
                !product.BookingProductId ||
                typeof product.DispatchType !== "number"
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            if (
                product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH &&
                !product.ManualStaffId
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });

        knex = require("knex")(con);
        connected = true;
        let dispatchNotify = [], bookingId = json.BookingId;

        for (let prInc = 0; prInc < json.Products.length; prInc++) {
            const product = json.Products[prInc];
            let bookingProductData = await knex(BOOKING_PRODUCTS)
                .select("BookingProductId", "StaffId", "EventId", "Duration", "StartTime", "ProductId", "DispatchType", "DispatchId", "PreparationTime", "Therapist")
                .where("BookingProductId", "=", product.BookingProductId);
            STAFF_ZONE = zone.getStaffZone(bookingProductData[0].StartTime);
            let bookingProductDetail = bookingProductData[0];
            if (bookingProductDetail.StaffId && bookingProductDetail.EventId) {
                // Send push notification to staff and delete the event.
                let title = PUSH.TITLE.BOOKING_CANCELLED_F_CMS;
                let description = `The booking #${json.BookingId} scheduled on ${momentz.tz(bookingProductDetail.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + DATE_TIME_FORMAT.z)} is cancelled.`;
                // insert staff specific message in DB
                try {
                    const msgInsert = await knex(STAFF_MESSAGES).insert({
                        StaffId: bookingProductDetail.StaffId,
                        Title: title,
                        Description: description,
                        ImagePath: null,
                        Tag: 1,
                        Date: moment().toDate(),
                        ...zone.getCreateUpdate()
                    })
                    let staffFcm = await knex(STAFF).select("FcmToken").where("StaffId", "=", bookingProductDetail.StaffId);
                    if (staffFcm && staffFcm[0].FcmToken) {
                        const message = {
                            token: staffFcm[0].FcmToken,
                            notification: {
                                title,
                                body: description
                            },
                            data: {
                                ScreenName: PUSH.SCREEN.MESSAGES
                            }
                        }
                        //console.log(message);
                        const therapistApp = InitializeFirebaseTherapist();
                        const sentNotifications = await therapistApp.messaging().send(message);
                        //console.log(sentNotifications)
                    }
                    await calendar.events.delete({
                        calendarId: 'primary',
                        auth: oAuth2Client,
                        eventId: bookingProductDetail.EventId
                    });
                } catch (error) {
                    //console.log(error);
                }
            }
            // No staff have accepted yet
            await knex(BOOKING_PRODUCTS)
                .where("BookingProductId", "=", product.BookingProductId)
                .update({
                    StaffId: null,
                    EventId: null,
                    StaffAmount: null,
                    DispatchType: product.DispatchType,
                    LastUpdated: zone.getLastUpdate()
                })

            switch (product.DispatchType) {
                case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                    /**
                     * Automatic Dispatch
                     * 1. Get the product total duration (with its add-ons).
                     * 2. Collect the staff which can cater the product & have rate.
                     * 3. Remove the existing dispatch list for this product.
                     * 4. For each staff - check if its available for that time.
                     * 5. Now we have list of staff which we can dispatch to.
                     * 6. Check global system dispatch settings
                     *      Automatic - call dispatchBookingCMS() - this will dispatch according to settings.
                     *      Manual - dispatch to this newly generated list.
                     */

                    let finalAvailStaff = [];
                    let dispatchId = bookingProductDetail.DispatchId;
                    if (!dispatchId) {
                        dispatchId = uuidv4();
                    }

                    //  1. Get the product total duration (with its add-ons).
                    let existAddOns = await knex
                        .select(
                            BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                            BOOKING_PRODUCT_ADDONS + ".Duration"
                        )
                        .from(BOOKING_PRODUCT_ADDONS)
                        .where(BOOKING_PRODUCT_ADDONS + ".BookingProductId", "=", product.BookingProductId);
                    let productTotalDuration = bookingProductDetail.Duration;
                    existAddOns.forEach(addOn => {
                        productTotalDuration += addOn.Duration;
                    });
                    let bookingReachOut = await knex(BOOKINGS).select("ReachOutTime").where("BookingId", "=", bookingId);
                    let totalReachOut = bookingReachOut[0].ReachOutTime + bookingProductDetail.PreparationTime;

                    // 2. Collect the staff which can cater the product & have rate.
                    let availStaff = await knex
                        .select(
                            STAFF_PRODUCT + ".StaffId",
                            STAFF_PRODUCT + ".ProductId",
                            STAFF + ".StaffId",
                            STAFF + ".GoogleEmail"
                        )
                        .from(STAFF_PRODUCT)
                        .leftJoin(STAFF, STAFF + ".StaffId", STAFF_PRODUCT + ".StaffId")
                        .where(STAFF_PRODUCT + ".ProductId", "=", bookingProductDetail.ProductId)
                        .whereNotNull(STAFF_PRODUCT + ".Rate")
                        .andWhere(STAFF + ".Deleted", "=", parseInt(process.env.DELETE_FLAG))
                        .modify(qb => {
                            switch (bookingProductDetail.Therapist) {
                                case THERAPIST_PREF.MALE: {
                                    qb.where(STAFF + ".Gender", "=", THERAPIST_PREF.MALE)
                                    break;
                                }
                                case THERAPIST_PREF.FEMALE: {
                                    qb.where(STAFF + ".Gender", "=", THERAPIST_PREF.FEMALE)
                                    break;
                                }
                                default:
                                    break;
                            }
                        })

                    // 3. Remove the existing dispatch list for this product.
                    await knex(BOOKING_PRODUCT_DISPATCH)
                        .where("DispatchId", "=", bookingProductDetail.DispatchId)
                        .del();
                    // .update({
                    //     Status: DISPATCH_STATUS.DISPATCHED,
                    //     LastUpdated: zone.getLastUpdate()
                    // });

                    // 4. For each staff - check if its available for that time.
                    STAFF_CURRENT_SCHEDULE = [];
                    for (let staffInc = 0; staffInc < availStaff.length; staffInc++) {
                        const staff = availStaff[staffInc];
                        if (staff.ProductId !== bookingProductDetail.ProductId) {
                            continue;
                        }
                        let checkStaff = await staffCheck(knex, {
                            StaffId: staff.StaffId,
                            StartTime: bookingProductDetail.StartTime,
                            Duration: productTotalDuration,
                            ReachOut: totalReachOut
                        });
                        if (checkStaff.IsAvailable) {
                            finalAvailStaff.push({
                                StaffId: staff.StaffId,
                                GoogleEmail: staff.GoogleEmail
                            })
                            STAFF_CURRENT_SCHEDULE.push({
                                StaffId: staff.StaffId,
                                GoogleEmail: staff.GoogleEmail
                            })
                        }
                    }
                    await getStaffCurrentICSchedule(knex, bookingProductDetail.StartTime);

                    // 5. Now we have list of staff which we can dispatch to.

                    // 6. Check global system dispatch settings
                    let globalDispatchSettings = await knex(BOOKING_PREFERENCE).select("GlobalDispatchDefault");
                    switch (globalDispatchSettings[0].GlobalDispatchDefault) {
                        case GLOBAL_DISPATCH_SETTING.AUTOMATIC_DISPATCH: {
                            // Automatic - call dispatchBookingCMS() - this will dispatch according to settings.
                            let finalDispatch = await dispatchBookingCMS({
                                knex,
                                staffList: finalAvailStaff,
                                dispatchId: dispatchId,
                                productStart: moment(bookingProductDetail.StartTime),
                                productEnd: moment(bookingProductDetail.StartTime).add(productTotalDuration, "minute"),
                                prevProdICStaff: null
                            });
                            //console.log(finalDispatch)
                            switch (finalDispatch.type) {
                                case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                                    /**
                                     * Set product dispatch type to direct assignment.
                                     * Assign the product to this staff.
                                     * Create its google event and then insert eventId in product.
                                     * Insert StaffAmount in product and addOns.
                                     * Send notification for Instant confirmation.
                                     */

                                    let staffProductData = await knex(STAFF_PRODUCT)
                                        .select("ProductId", "Rate")
                                        .where("StaffId", "=", finalDispatch.staffId)
                                        .andWhere("ProductId", "=", bookingProductDetail.ProductId);
                                    let prodAssigned = await knex(BOOKING_PRODUCTS)
                                        .where(BOOKING_PRODUCTS + ".BookingProductId", "=", bookingProductDetail.BookingProductId)
                                        .update({
                                            DispatchType: PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT,
                                            StaffId: finalDispatch.staffId,
                                            EventId: null, // insert after generating event on google calendar.
                                            StaffAmount: getAmountForTreatment(bookingProductDetail.Duration, staffProductData[0].Rate),
                                            LastUpdated: zone.getLastUpdate()
                                        });
                                    for (let index = 0; index < existAddOns.length; index++) {
                                        const addOn = existAddOns[index];
                                        let addOnUpd = await knex(BOOKING_PRODUCT_ADDONS)
                                            .where("BookingProductAddOnId", "=", addOn.BookingProductAddOnId)
                                            .update({
                                                StaffAmount: getAmountForTreatment(addOn.Duration, staffProductData[0].Rate),
                                                LastUpdated: zone.getLastUpdate()
                                            })
                                    }

                                    try {
                                        let title = `New booking #${bookingId} received`;
                                        let description = `You have been allotted a new booking, scheduled on ${momentz.tz(bookingProductDetail.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                                        // insert staff specific message in DB
                                        const msgInsert = await knex(STAFF_MESSAGES).insert({
                                            StaffId: finalDispatch.staffId,
                                            Title: title,
                                            Description: description,
                                            ImagePath: null,
                                            Date: moment().toDate(),
                                            ...zone.getCreateUpdate()
                                        })
                                        let staffFcm = await knex(STAFF).select("FcmToken").where("StaffId", "=", finalDispatch.staffId)
                                        if (staffFcm[0].FcmToken) {
                                            const message = {
                                                token: staffFcm[0].FcmToken,
                                                notification: {
                                                    title,
                                                    body: description
                                                },
                                                data: {
                                                    BookingId: `${bookingId}`,
                                                    DateTime: moment(bookingProductDetail.StartTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                                    ScreenName: PUSH.SCREEN.BOOKINGS,
                                                    TimeZone: process.env.STAFF_ZONE
                                                }
                                            }
                                            //console.log(message);
                                            const therapistApp = InitializeFirebaseTherapist();
                                            const sentNotifications = await therapistApp.messaging().send(message);
                                            //console.log(sentNotifications)
                                        }
                                    } catch (error) {
                                        //console.log(error)
                                    }

                                    break;
                                }
                                case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                                    /**
                                     * If dispatch staff list exist then dispatch auto, otherwise manual dispatch.
                                     * Insert the product dispatch list.
                                     * Insert product dispatch id.
                                     * Send the notification to given staff list for booking offer.
                                     */
                                    if (finalDispatch.staffList.length) {
                                        await knex(BOOKING_PRODUCTS)
                                            .where("BookingProductId", "=", bookingProductDetail.BookingProductId)
                                            .update({
                                                DispatchId: dispatchId,
                                                LastUpdated: zone.getLastUpdate()
                                            })
                                        let dispatchList = [];
                                        finalDispatch.staffList.forEach(staff => {
                                            dispatchList.push({
                                                DispatchId: dispatchId,
                                                StaffId: staff.StaffId,
                                                Status: DISPATCH_STATUS.DISPATCHED,
                                                ...zone.getCreateUpdate()
                                            })
                                        });
                                        await knex(BOOKING_PRODUCT_DISPATCH).insert(dispatchList);
                                        let staffDispatched = await knex
                                            .select(
                                                BOOKING_PRODUCT_DISPATCH + ".StaffId",
                                                STAFF + ".FcmToken"
                                            )
                                            .from(BOOKING_PRODUCT_DISPATCH)
                                            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCT_DISPATCH + ".StaffId")
                                            .where(BOOKING_PRODUCT_DISPATCH + ".DispatchId", "=", dispatchId);
                                        staffDispatched.forEach(staff => {
                                            let staffFound = dispatchNotify.find(f => f.StaffId === staff.StaffId);
                                            if (!staffFound && staff.FcmToken) {
                                                dispatchNotify.push({
                                                    StaffId: staff.StaffId,
                                                    FcmToken: staff.FcmToken,
                                                    DateTime: bookingProductDetail.StartTime
                                                });
                                            }
                                        });
                                    } else {
                                        await knex(BOOKING_PRODUCTS)
                                            .where("BookingProductId", "=", bookingProductDetail.BookingProductId)
                                            .update({
                                                DispatchType: PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH,
                                                DispatchId: null,
                                                StaffId: null,
                                                EventId: null,
                                                LastUpdated: zone.getLastUpdate()
                                            })
                                    }
                                    break;
                                }
                                default: {
                                    break;
                                }
                            }
                            break;
                        }
                        case GLOBAL_DISPATCH_SETTING.MANUAL_DISPATCH: {
                            // Current setting is manual, but dispatch the booking to given staff list as its particular booking dispatch update.
                            await knex(BOOKING_PRODUCTS)
                                .where("BookingProductId", "=", bookingProductDetail.BookingProductId)
                                .update({
                                    DispatchId: dispatchId,
                                    LastUpdated: zone.getLastUpdate()
                                })
                            let dispatchList = [];
                            finalAvailStaff.forEach(staff => {
                                dispatchList.push({
                                    DispatchId: dispatchId,
                                    StaffId: staff.StaffId,
                                    Status: DISPATCH_STATUS.DISPATCHED,
                                    ...zone.getCreateUpdate()
                                })
                            });
                            await knex(BOOKING_PRODUCT_DISPATCH).insert(dispatchList);
                            let staffDispatched = await knex
                                .select(
                                    BOOKING_PRODUCT_DISPATCH + ".StaffId",
                                    STAFF + ".FcmToken"
                                )
                                .from(BOOKING_PRODUCT_DISPATCH)
                                .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCT_DISPATCH + ".StaffId")
                                .where(BOOKING_PRODUCT_DISPATCH + ".DispatchId", "=", dispatchId);
                            staffDispatched.forEach(staff => {
                                let staffFound = dispatchNotify.find(f => f.StaffId === staff.StaffId);
                                if (!staffFound && staff.FcmToken) {
                                    dispatchNotify.push({
                                        StaffId: staff.StaffId,
                                        FcmToken: staff.FcmToken,
                                        DateTime: bookingProductDetail.StartTime
                                    });
                                }
                            });
                            break;
                        }
                        default:
                            break;
                    }
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH: {
                    await knex(BOOKING_PRODUCT_DISPATCH)
                        .where("DispatchId", "=", bookingProductDetail.DispatchId)
                        .update({
                            Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                            LastUpdated: zone.getLastUpdate()
                        });
                    let dispatchExist = await knex(BOOKING_PRODUCT_DISPATCH)
                        .select("StaffId")
                        .where("DispatchId", "=", bookingProductDetail.DispatchId)
                        .andWhere("StaffId", "=", product.ManualStaffId);
                    if (dispatchExist.length && dispatchExist[0].StaffId === product.ManualStaffId) {
                        await knex(BOOKING_PRODUCT_DISPATCH)
                            .where("DispatchId", "=", bookingProductDetail.DispatchId)
                            .andWhere("StaffId", "=", product.ManualStaffId)
                            .update({
                                Status: DISPATCH_STATUS.DISPATCHED,
                                LastUpdated: zone.getLastUpdate()
                            });
                        let staffFcm = await knex(STAFF).select("FcmToken").where("StaffId", "=", product.ManualStaffId);
                        if (staffFcm[0].FcmToken) {
                            dispatchNotify.push({
                                StaffId: product.ManualStaffId,
                                FcmToken: staffFcm[0].FcmToken,
                                DateTime: bookingProductDetail.StartTime
                            });
                        }
                    } else {
                        let dispatchId = bookingProductDetail.DispatchId;
                        if (!dispatchId) {
                            dispatchId = uuidv4();
                            await knex(BOOKING_PRODUCTS)
                                .where("BookingProductId", "=", product.BookingProductId)
                                .update({
                                    DispatchId: dispatchId,
                                    LastUpdated: zone.getLastUpdate()
                                })
                        }
                        await knex(BOOKING_PRODUCT_DISPATCH)
                            .insert({
                                DispatchId: dispatchId,
                                StaffId: product.ManualStaffId,
                                Status: DISPATCH_STATUS.DISPATCHED,
                                ...zone.getCreateUpdate()
                            })
                    }
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                    // We don't need to update anything, admin cannot directly re-assign without updating booking.
                    break;
                }
                default:
                    break;
            }
        }
        // response = await this.bookings(knex, null, event.headers['api-client']);

        // knex.destroy().then(() => { });
        await knex.destroy();
        try {
            for (let dInc = 0; dInc < dispatchNotify.length; dInc++) {
                const staffPush = dispatchNotify[dInc];
                const message = {
                    token: staffPush.FcmToken,
                    notification: {
                        title: "You have a booking offer",
                        body: `You have got a new booking request for ${momentz.tz(staffPush.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.DD_MMM_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`,
                    },
                    data: {
                        BookingId: `${json.BookingId}`,
                        ScreenName: PUSH.SCREEN.INCOMING_REQUEST
                    }
                }
                try {
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotification = await therapistApp.messaging().send(message);
                    //console.log(sentNotification)
                } catch (error) {
                    //console.log(error);
                }
            }
        } catch (error) {
            //console.log(error)
        }
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.DISPATCH_SETTING_UPDATED
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.notifyAdminUnfillBooking = async (event) => {
    /**
     * Function Objective: notify admin for unfilled bookings.
     * Working: 
     * 1. Fetch confirmed bookings from today which are unfilled in the system.
     * 2. Collect bookings which are unfilled and send single mail for all.
     * 3. Collect urgent bookings sms too for unfilled bookings.
     */
    let knex, connected = false, response = [];
    try {
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        knex = require("knex")(con);
        connected = true;
        let bookingsToNotify = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Created",
                USERS + ".Name",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_EXTRA + ".UnfillNotification",
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(BOOKING_EXTRA, BOOKING_EXTRA + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .whereNull(BOOKING_PRODUCTS + ".StaffId")
            .whereIn(BOOKINGS + ".Status", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING]);
        let unfilledBookings = [];
        bookingsToNotify.forEach(booking => {
            let found = unfilledBookings.find(f => f.BookingId === booking.BookingId);
            if (!found) {
                unfilledBookings.push({
                    BookingId: booking.BookingId,
                    Created: booking.Created,
                    DateTime: booking.DateTime,
                    UnfillNotification: booking.UnfillNotification,
                    Name: booking.Name
                })
            }
        });
        if (bookingsToNotify.length > 0) {
            let notifyAdmins = await knex(ADMIN_NOTIFICATION_CONTACT).select("*").where("Deleted", "=", 0);
            let markBookings = [];
            for (let bookingInc = 0; bookingInc < unfilledBookings.length; bookingInc++) {
                const booking = unfilledBookings[bookingInc];
                STAFF_ZONE = zone.getStaffZone(booking.DateTime);
                let newCount = getNotificationCount(booking.DateTime, booking.Created);
                if (newCount) {
                    if (newCount > 3) {
                        // consider booking for sending email and sms both.
                        if (newCount !== booking.UnfillNotification) {
                            markBookings.push({
                                BookingId: booking.BookingId,
                                DateTime: momentz.tz(booking.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z),
                                UnfillNotification: newCount,
                                SendSMS: true,
                                Name: booking.Name
                            })
                        }
                    } else {
                        // consider booking for sending email only.
                        if (newCount !== booking.UnfillNotification) {
                            markBookings.push({
                                BookingId: booking.BookingId,
                                DateTime: momentz.tz(booking.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z),
                                UnfillNotification: newCount,
                                SendSMS: false,
                                Name: booking.Name
                            })
                        }
                    }
                }
            }
            response = markBookings;
            if (markBookings.length) {
                let toMails = [];
                for (let adInc = 0; adInc < notifyAdmins.length; adInc++) {
                    const adminContact = notifyAdmins[adInc];
                    switch (adminContact.Type) {
                        case 0: {
                            toMails.push(adminContact.Value);
                            break;
                        }
                        case 1: {
                            let smsStr = `COCON - \n There are few unfilled bookings which needs to be considered urgently, as they are about to start. Please refer the list: \n`;
                            let anyUrgent = false;
                            for (let boInc = 0; boInc < markBookings.length; boInc++) {
                                const booking = markBookings[boInc];
                                if (booking.SendSMS) {
                                    smsStr += `${booking.BookingId} - ${booking.DateTime} \n`;
                                    anyUrgent = true;
                                }
                            }
                            if (anyUrgent) {
                                smsStr += `Please view the list of bookings on below link \n`;
                                smsStr += process.env.CMS_URL;
                                let messageSent = await twilioClient.messages.create({
                                    from: process.env.TWILIO_PHONE_NUMBER,
                                    to: adminContact.Value,
                                    body: smsStr
                                });
                                //console.log(messageSent);
                            }
                            break;
                        }
                    }
                }
                if (toMails.length) {
                    let newHtm = `
                        <div style="background-color: #ffffff;width:100%;padding:1%;font-family: Raleway, sans-serif;color: #3a312d;letter-spacing: 1px">
                            <div style="width: 100%;">
                                <div style="width: 100%;text-align: center;">
                                    <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
                                </div>
                                <div style="width: 100%;text-align: center;">
                                    <h1 style="color: #514844;font-weight: 500;letter-spacing: 0.5px;font-size: 30px;margin-top: 5px;">COCON</h1>
                                </div>
                                <div>
                                    <h4 style="font-weight: 500;font-size: 17px;">Hi there,</h4>
                                    <h4 style="font-weight: 500;font-size: 17px;">Here is a list of some unfilled bookings in the system, please do the needfull.</h4>
                                </div>
                                <div style="font-weight: 400;color:#756e6b">
                                    <div style="width: 60%;padding:10px 0px;">
                                        <table style="margin-top: 0px;width: 100%;border-collapse: collapse;border-top: solid #e4ddd7 1px;border-bottom: solid #e4ddd7 1px;">
                                        `;
                    for (let boInc = 0; boInc < markBookings.length; boInc++) {
                        const booking = markBookings[boInc];
                        newHtm += `
                                            <tr style="width: 100%">
                                                <td style="width: 40%;padding-top: 9px;">
                                                    <div style="font-size: 15px;vertical-align: middle;padding: 0px 5px 0px 5px;">
                                                        <p style="padding: 0px 0px 10px 15px;">${booking.DateTime}</p>
                                                    </div>
                                                </td>
                                                <td style="width: 30%;text-align: center;padding-top: 10px;">
                                                    <div style="font-size: 15px;vertical-align: middle;padding: 0px 0px 0.05px 0px;">
                                                        <p>#${booking.BookingId}</p>
                                                    </div>
                                                </td>
                                                <td style="width: 30%;text-align: center;padding-top: 10px;">
                                                    <div style="font-size: 15px;vertical-align: middle;padding: 0px 0px 0.05px 0px;">
                                                        <p>
                                                            ${booking.Name}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                        `;
                    }
                    newHtm += `
                                        </table>
                                    </div>
                                </div>
                                <div style="margin-top: 10px;font-family: Raleway, sans-serif">
                                    <a href="${process.env.CMS_URL}#/booking"><button style="font-size: 15px;cursor: pointer;font-family: Raleway, sans-serif;margin: 10px 0px;background-color: rgba(255, 255, 255, 0);padding: 15px 25px;border: solid #ccc5c1 1px;border-radius: 10px;letter-spacing: 1px;color: #3a312d">VIEW BOOKINGS</button></a>
                                    <h4 style="font-weight: 500;font-size: 18px;font-family: spectral;">COCON Company</h4>
                                    <p style="margin-top: 35px;font-style: italic;font-family: spectral;">This is an automated email sent from an unmonitored mailbox. Please do not reply to it.</p>
                                </div>
                            </div>
                        </div>
                    `;
                    let htm = `
                        <div style="padding: 24px; background-color: #e5ddd84d; display: flex; justify-content: center;color: #3a312d;font-family: Raleway, sans-serif;">
                            <div style="width: 100%;background-color: #e5ddd8;padding: 0px 24px 24px; border-radius: 8px;">
                                <div style="text-align: center;padding: 24px;font-size: 27px;color: #524944;">
                                    COCON
                                </div>
                                <div>
                                    <p>Hi there,</p>
                                    <p>Here is a list of some unfilled bookings in the system, please do the needfull.</p>
                                </div>
                                <div>
                                    <table style="border-collapse: collapse;color: #3a312d;">
                                        <tr style="background-color: #a1887c9e;">
                                            <th style="padding: 8px; text-align: left;">Booking #</th>
                                            <th style="padding: 8px; text-align: left;">Date</th>
                                        </tr>
                            `;
                    for (let boInc = 0; boInc < markBookings.length; boInc++) {
                        const booking = markBookings[boInc];
                        htm += `
                                        <tr style="background-color: #a1887c2e;">
                                            <td style="padding: 8px;">${booking.BookingId}</td>
                                            <td style="padding: 8px;">${booking.DateTime}</td>
                                        </tr>
                                `;
                    }
                    htm += `
                                    </table>
                                </div>
                                <p>Please view the list of bookings on below link: <br/> ${process.env.CMS_URL}</p>
                                <br />
                                <div>
                                    <span>Regards</span>
                                    <br />
                                    <span>COCON Company</span>
                                    <br />
                                    <br />
                                </div>
                            </div>
                        </div>
                            `;
                    mailHtm = htm;
                    let mailOptions = {
                        from: process.env.EMAIL,
                        to: toMails.join(", "),
                        subject: "Unfilled Bookings",
                        html: newHtm
                    }
                    let smtpTransport = nodemailer.createTransport({
                        service: "gmail",
                        auth: {
                            type: "OAuth2",
                            user: process.env.EMAIL,
                            clientId: process.env.CLIENT_ID,
                            clientSecret: process.env.CLIENT_SECRET,
                            refreshToken: process.env.REFRESH_TOKEN,
                            // accessToken: accessToken.token,
                        }
                    })
                    let sendingMail = await sendMail(smtpTransport, mailOptions);
                    //console.log(sendingMail);
                }

                for (let bUpInc = 0; bUpInc < markBookings.length; bUpInc++) {
                    const booking = markBookings[bUpInc];
                    let extraExist = await knex(BOOKING_EXTRA).select("BookingId").where("BookingId", "=", booking.BookingId);
                    if (!extraExist.length) {
                        let inserted = await knex(BOOKING_EXTRA)
                            .insert({
                                BookingId: booking.BookingId,
                                AdminNotes: "",
                                UnfillNotification: booking.UnfillNotification,
                                ...zone.getCreateUpdate()
                            });
                    } else {
                        let updated = await knex(BOOKING_EXTRA)
                            .where("BookingId", "=", booking.BookingId)
                            .update({
                                UnfillNotification: booking.UnfillNotification,
                                LastUpdated: zone.getLastUpdate()
                            });
                    }
                }
            }
        }
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 500,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.CRON_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

const sendMail = async (transporter, mailOptions) => {
    return new Promise(function (resolve, reject) {
        transporter.sendMail(mailOptions, function (err, info) {
            if (err) {
                reject(err);
            } else {
                resolve(info);
            }
        })
    });
}

const getNotificationCount = (dateTime, created) => {
    let newNotifyCount = 0;
    let curTime = moment();
    let orderTime = moment(created);
    let serveTime = moment(dateTime);
    if (serveTime.diff(curTime, "minutes") <= 90) {
        let diff = serveTime.diff(curTime, "minutes");
        if (diff <= 45) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.FORTY_FIVE_MIN;
        } else if (diff > 45 && diff <= 60) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.SIXTY_MIN;
        } else if (diff > 60 && diff <= 90) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.NINETY_MIN;
        }
    } else {
        let diff = curTime.diff(orderTime, "minutes");
        if (diff >= 180 && diff < 360) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.THREE_HOUR;
        } else if (diff >= 360 && diff < 720) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.SIX_HOUR;
        } else if (diff > 720) {
            newNotifyCount = ADMIN_UNFILL_NOTIFICATION.TWELVE_HOUR;
        }
    }
    return newNotifyCount;
}

module.exports.bookingConfNotifier = async (event) => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        console.log(json)
        knex = require("knex")(con);
        connected = true;
        let bookingRaw = await bookingDetail(knex, json.BookingId);
        console.log("bookingRaw",bookingRaw)
        let productNames = ""
        let productsDescription = ""
        bookingRaw.Products.forEach((product, index) => {
            // Normal product names for subject line
            productNames += product.ProductName;
            if (index < bookingRaw.Products.length - 1) {
                productNames += ", ";
            }
            // Calculate the product total duration
            var productDuration = product.Duration;
            product.AddOns.map(addOn => {
                productDuration = productDuration + addOn.Duration
            });
            product.TotalDuration = productDuration
            // Prepare product name and timing string
            productsDescription += `${product.ProductName} - ${productDuration}m (${momentz.tz(product.StartTime, process.env.STAFF_ZONE).format('HH:mm')} - ${momentz.tz(product.StartTime, process.env.STAFF_ZONE).add(product.TotalDuration, "minute").format('HH:mm')})`;
            if (index < bookingRaw.Products.length - 1) {
                productsDescription += ", <br/>";
            }
        });
        
        let firstName = bookingRaw.UserName.split(" ");
       
        let bookingDateTime = momentz.tz(bookingRaw.DateTime, process.env.STAFF_ZONE).format("dddd, MMM DD YYYY, HH:mm" + " " + DATE_TIME_FORMAT.z);
        let bookingAddress = (bookingRaw.Floor ? bookingRaw.Floor + ", " : "") + (bookingRaw.Street?bookingRaw.Street+" ":"") + (bookingRaw.HouseNumber ? bookingRaw.HouseNumber + ", " : "")+ (bookingRaw.City ? ", " + bookingRaw.City : "") + (bookingRaw.Zip ? ", " + bookingRaw.Zip : "");
        if (json.UpcomingBooking) {
            console.log("here")
            let emailHtm = `
            <div>
                <div>
                    <p>Hi ${firstName[0]},</p>
                    <p>
                        Your booking details are as follows:<br/>
                        <span style="font-weight: bold">${productsDescription}</span> with COCON <span style="font-weight: bold">${bookingDateTime}</span> at:<br/> <span style="font-weight: bold">${bookingAddress}</span>
                    </p>
                    <p>Your Ambassador will bring everything needed to you. We look forward to serving you!</p>
                </div>
                <div>
                    Some tips from our <a href="https://coconcompany.com/faq/">website</a> to help you prepare for the treatment:
                    <ul>
                        <li>Please be ready <span style="text-decoration: underline">10 minutes before the start-time</span> to allow us to setup and start on time. Kindly note that we may need to shorten the time of the treatment if we're unable to start on time.</li>
                        <li>Attire: We recommend that you're ready in a robe in your underwear. Your Ambassador will give you privacy to position your body under the sheets.</li>
                        <li>Prepare a place to accommodate the massage table. (2m x 2m)</li>
                        <li>While we try our best to dry your feet, we recommend having slippers ready or a towel if your floor is sensitive to oils.</li>
                        <li>Stay hydrated! We recommend having a glass of water before your treatment starts.</li>
                        <li>At home, ensure a comfortable temperature that allows you to fully relax.</li>
                    </ul>
                    Thank you, and if you have any questions you can reply to this email.
                    Ilona - COCON Customer Care
                </div>
                
                <div>
                    <p style="color:rgb(153,153,153)">COCON Company BV</p>
                    <img width="100px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email_full.png">
                    <br/>
                    <a style="color:rgb(153,153,153);" href="www.coconcompany.com">
                        www.coconcompany.com
                    </a>
                    <p>Mobile +31 6 3338 8321</p>
                </div>
                <div>
                    <a href="https://apps.apple.com/nl/app/cocon/id1516229591?l=en" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://apps.apple.com/nl/app/cocon/id1516229591?l%3Den&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw1mgdaPzEo3AwJCr9x7ESO7"><img src="https://ci5.googleusercontent.com/proxy/BKZbpzqKA6BgLuJQYxD4GvXNfMqPQg6v-lbfjzlEY3FtKJz92YUvQ-jjI6oKiGxU1y5pxbfXH3fViK05Zt4FxagtUe-RzZZSayI0LWt65NRP1DrqbZ96hYcaoPC0_l_N1OZW_trba02DJOrxLay2gaW3hZvzZffoB9_5bzJbqXYvWXy38gkkDeiJpHNnL0-CI3XU9FsIvZAtXKEjvQ=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1KpBT3YXhBT3R6LkmBDx9lKaeCsGZg0PP&amp;revid=0B1KzZhdJB-M_c0JiRUgyS3ZJQzVUczMwZ3E2aHFmL0Z1QVdFPQ" width="96" height="31" class="CToWUd"></a>
                    <a href="https://play.google.com/store/apps/details?id=com.cocon.coconapp" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://play.google.com/store/apps/details?id%3Dcom.cocon.coconapp&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw2bzE5EHD6VKApeyrad9i3N"><img src="https://ci6.googleusercontent.com/proxy/-oHmVQTNsR0h3KP-iIRYyPO4CwZ--CXfg854AojZdwYd7oOAY0hC9Ck20rUHZDmwNVzgD37PVnUAr-K-EkDqYqd9ZeezP2_di4upVKyUKBZ-yreJt1Ece26VzlEsWzPfcLBWlU09sGGknucLtRXzx5X7JVhtozzWBfXlVLFaUxyNG0nd-dwn3UD6ahQTFyYQsQJPy5MGiw4PZM0n2w=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1n2tlCa8DBS2eFcsM9WR0cwB_YpUOsuxV&amp;revid=0B1KzZhdJB-M_YTdHTUxraVhQRFJCTWUzZFdWN3c3dU1JOU9nPQ" width="96" height="31" style="font-family:Arial,Helvetica,sans-serif;color:rgb(32,33,36)" class="CToWUd"></a>
                </div>
                <div style="color: rgb(102,102,102);font-family: Optima;font-size: x-small;">
                    The information contained in this e-mail may be confidential and is intended solely for the attention and use of the named addressee(s). The use or distribution of this information by others than the named addressee(s) is not allowed. If you are not the intended recipient, please notify the sender and delete this e-mail message. COCON Company B.V. is registered at the Chamber of Commerce under number 76264580.
                </div>
            </div>
            `;
            let toMails = [bookingRaw.UserEmail];
            let mailOptions = {
                from: process.env.EMAIL,
                to: toMails.join(", "),
                subject: `Upcoming Booking - ${productNames} at ${bookingDateTime}`,
                html: emailHtm
            }
            let smtpTransport = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: process.env.EMAIL,
                    clientId: process.env.CLIENT_ID,
                    clientSecret: process.env.CLIENT_SECRET,
                    refreshToken: process.env.REFRESH_TOKEN,
                    // accessToken: accessToken.token,
                }
            })
            let sendingMail = await sendMail(smtpTransport, mailOptions);
        } else {
            console.log("here i else")
            let emailHtm = `
            <div>
                <div>
                    <p>Hi ${firstName[0]},</p>`;
            if (!json.FromCMS) {
                emailHtm += `<p>Thank you very much, we have received your payment.</p>`;
            } else {
                emailHtm += `A new booking has been created on your behalf, please contact support if not requested by you.`;
            }
            emailHtm += `
                    <p>
                        Your booking details are as follows:<br/>
                        <span style="font-weight: bold">${productsDescription}</span> with COCON <span style="font-weight: bold">${bookingDateTime}</span> at: <span style="font-weight: bold">${bookingAddress}</span>
                    </p>
                    <p>Your Ambassador will bring everything needed to you. We look forward to serving you!</p>
                </div>
                <div>
                    Some tips from our <a href="https://coconcompany.com/faq/">website</a> to help you prepare for the treatment:
                    <ul>
                        <li>Please be ready <span style="text-decoration: underline">10 minutes before the start-time</span> to allow us to setup and start on time. Kindly note that we may need to shorten the time of the treatment if we're unable to start on time.</li>
                        <li>Attire: We recommend that you're ready in a robe in your underwear. Your Ambassador will give you privacy to position your body under the sheets.</li>
                        <li>Prepare a place to accommodate the massage table. (2m x 2m)</li>
                        <li>While we try our best to dry your feet, we recommend having slippers ready or a towel if your floor is sensitive to oils.</li>
                        <li>Stay hydrated! We recommend having a glass of water before your treatment starts.</li>
                        <li>At home, ensure a comfortable temperature that allows you to fully relax.</li>
                    </ul>
                    Thank you, and if you have any questions you can reply to this email.
                    Ilona - COCON Customer Care
                </div>
                
                <div>
                    <p style="color:rgb(153,153,153)">COCON Company BV</p>
                    <img width="100px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email_full.png">
                    <br/>
                    <a style="color:rgb(153,153,153);" href="www.coconcompany.com">
                        www.coconcompany.com
                    </a>
                    <p>Mobile +31 6 3338 8321</p>
                </div>
                <div>
                    <a href="https://apps.apple.com/nl/app/cocon/id1516229591?l=en" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://apps.apple.com/nl/app/cocon/id1516229591?l%3Den&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw1mgdaPzEo3AwJCr9x7ESO7"><img src="https://ci5.googleusercontent.com/proxy/BKZbpzqKA6BgLuJQYxD4GvXNfMqPQg6v-lbfjzlEY3FtKJz92YUvQ-jjI6oKiGxU1y5pxbfXH3fViK05Zt4FxagtUe-RzZZSayI0LWt65NRP1DrqbZ96hYcaoPC0_l_N1OZW_trba02DJOrxLay2gaW3hZvzZffoB9_5bzJbqXYvWXy38gkkDeiJpHNnL0-CI3XU9FsIvZAtXKEjvQ=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1KpBT3YXhBT3R6LkmBDx9lKaeCsGZg0PP&amp;revid=0B1KzZhdJB-M_c0JiRUgyS3ZJQzVUczMwZ3E2aHFmL0Z1QVdFPQ" width="96" height="31" class="CToWUd"></a>
                    <a href="https://play.google.com/store/apps/details?id=com.cocon.coconapp" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://play.google.com/store/apps/details?id%3Dcom.cocon.coconapp&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw2bzE5EHD6VKApeyrad9i3N"><img src="https://ci6.googleusercontent.com/proxy/-oHmVQTNsR0h3KP-iIRYyPO4CwZ--CXfg854AojZdwYd7oOAY0hC9Ck20rUHZDmwNVzgD37PVnUAr-K-EkDqYqd9ZeezP2_di4upVKyUKBZ-yreJt1Ece26VzlEsWzPfcLBWlU09sGGknucLtRXzx5X7JVhtozzWBfXlVLFaUxyNG0nd-dwn3UD6ahQTFyYQsQJPy5MGiw4PZM0n2w=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1n2tlCa8DBS2eFcsM9WR0cwB_YpUOsuxV&amp;revid=0B1KzZhdJB-M_YTdHTUxraVhQRFJCTWUzZFdWN3c3dU1JOU9nPQ" width="96" height="31" style="font-family:Arial,Helvetica,sans-serif;color:rgb(32,33,36)" class="CToWUd"></a>
                </div>
                <div style="color: rgb(102,102,102);font-family: Optima;font-size: x-small;">
                    The information contained in this e-mail may be confidential and is intended solely for the attention and use of the named addressee(s). The use or distribution of this information by others than the named addressee(s) is not allowed. If you are not the intended recipient, please notify the sender and delete this e-mail message. COCON Company B.V. is registered at the Chamber of Commerce under number 76264580.
                </div>
            </div>
            `;
            let toMails = [bookingRaw.UserEmail];
            let mailOptions = {
                from: process.env.EMAIL,
                to: toMails.join(", "),
                subject: `COCON Booking Confirmation - ${productNames} at ${bookingDateTime}`,
                html: emailHtm
            }
            let smtpTransport = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: process.env.EMAIL,
                    clientId: process.env.CLIENT_ID,
                    clientSecret: process.env.CLIENT_SECRET,
                    refreshToken: process.env.REFRESH_TOKEN,
                    // accessToken: accessToken.token,
                }
            })
            let sendingMail = await sendMail(smtpTransport, mailOptions);
            //console.log(sendingMail);
        }
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}

module.exports.dispatchNotifier = async (event) => {
    let knex, connected = false;
    try {
        // //console.log(event);
        const json = event //.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        switch (json.Type) {
            case 0: {
                let dispatchNotify = await knex
                    .select(
                        BOOKING_PRODUCTS + ".StartTime",
                        BOOKING_PRODUCTS + ".DispatchType",
                        BOOKING_PRODUCTS + ".DispatchId",
                        BOOKING_PRODUCT_DISPATCH + ".StaffId as DispatchStaffId",
                        STAFF + ".FcmToken"
                    )
                    .from(BOOKING_PRODUCTS)
                    .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                    .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCT_DISPATCH + ".StaffId")
                    .where(BOOKING_PRODUCTS + ".BookingId", "=", json.BookingId)
                    .whereNull(BOOKING_PRODUCTS + ".StaffId")
                    .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
                //console.log(dispatchNotify);
                let notified = [];
                const therapistApp = InitializeFirebaseTherapist();
                for (let pushInc = 0; pushInc < dispatchNotify.length; pushInc++) {
                    const pro = dispatchNotify[pushInc];
                    if (!pro.StaffId && pro.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH && pro.DispatchStaffId && pro.FcmToken) {
                        let alreadySent = notified.find(f => f === pro.DispatchStaffId);
                        STAFF_ZONE = zone.getStaffZone(pro.StartTime);
                        if (alreadySent) {
                            continue;
                        }
                        let title = `You have a booking offer.`;
                        let description = `You have got a new booking request for ${momentz.tz(pro.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                        const message = {
                            token: pro.FcmToken,
                            notification: {
                                title,
                                body: description
                            },
                            data: {
                                BookingId: `${json.BookingId}`,
                                ScreenName: PUSH.SCREEN.INCOMING_REQUEST,
                                TimeZone: process.env.STAFF_ZONE
                            }
                        }
                        //console.log(message);
                        const sentNotifications = await therapistApp.messaging().send(message);
                        //console.log(sentNotifications)
                        notified.push(pro.DispatchStaffId);
                    }
                }

                try {
                    // Send email to admin for new booking
                    var bookingRaw = await bookingDetail(knex, json.BookingId);
                    bookingRaw.Products = bookingRaw.Products.map(product => {
                        var productDuration = product.Duration;
                        product.AddOns.map(addOn => {
                            productDuration = productDuration + addOn.Duration
                        });
                        product.TotalDuration = productDuration
                        return product
                    });

                    let addressString = (bookingRaw.Floor ? bookingRaw.Floor + ", " : "") + bookingRaw.Street + (bookingRaw.HouseNumber ? bookingRaw.HouseNumber + " " : "")+(bookingRaw.City ? ", " + bookingRaw.City : "") + (bookingRaw.Zip ? ", " + bookingRaw.Zip : "");
                    let newHtm = `
                        <div style="
                            background-color: #ffffff;
                            width: 100%;
                            padding: 1%;
                            font-family: Raleway, sans-serif;
                            color: #3a312d;
                            letter-spacing: 1px;
                        ">
                        <div style="width: 100%">
                            <div style="width: 100%; text-align: center">
                                <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
                            </div>
                            <div style="width: 100%; text-align: center">
                                <h1 style="
                                    color: #514844;
                                    font-weight: 500;
                                    letter-spacing: 0.5px;
                                    font-size: 30px;
                                    margin-top: 5px;
                                    ">
                                    COCON
                                </h1>
                            </div>
                            <div>
                                <h4 style="font-weight: 500; font-size: 17px">Hi there,</h4>
                                <h4 style="font-weight: 500; font-size: 17px">`;
                    switch (bookingRaw.PaymentStatus) {
                        case BOOKING_PAYMENT_STATUS.SUCCEEDED:
                            newHtm += "A new booking has been confirmed in the system."
                            break;
                        case BOOKING_PAYMENT_STATUS.CANCELLED:
                            newHtm += "A booking payment has been cancelled."
                            break;
                        case BOOKING_PAYMENT_STATUS.FAILED:
                            newHtm += "A booking payment has been failed."
                            break;
                        default:
                            break;
                    }
                    newHtm += `                                    
                                </h4>
                            </div>
                            <div style="font-weight: 500">
                            <div style="
                                margin: 30px 0px;
                                width: 70%;
                                border: solid #ccc5c1 1px;
                                border-radius: 10px;
                                padding: 20px;
                                box-shadow: 0 4px 8px 0 #ccc5c1, 0 6px 20px 0 #ccc5c1;
                                ">
                                <div style="color: #756e6b">
                                <div style="text-align: center">
                                    <h2 style="margin: 13px; font-weight: 400; font-size: 25px">
                                        ${bookingRaw.UserName}, ${bookingRaw.UserGenderKey}
                                    </h2>
                                </div>
                                <div style="text-align: center">
                                    <h5 style="margin: 9px; font-weight: 300; font-size: 15px">
                                    <img width="11px"
                                        src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/location.png">
                                        ${addressString}
                                    </h5>
                                    <h5 style="margin: 9px; font-weight: 300; font-size: 15px">
                                    <img width="11px"
                                        src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/calendar.png">
                                        ${momentz.tz(bookingRaw.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}
                                    </h5>
                                </div>
                                </div>
                                <table style="
                                    margin-top: 30px;
                                    width: 100%;
                                    border-collapse: collapse;
                                    font-weight: 400;
                                ">
                                <tbody>`;

                    for (let prInc = 0; prInc < bookingRaw.Products.length; prInc++) {
                        const product = bookingRaw.Products[prInc];
                        newHtm += `
                                    <tr style="width: 100%; border-top: solid #e4ddd7 1px">
                                    <td style="width: 50%; padding: 9px 0px 0px 15px">
                                        <div style="font-size: 13px; padding: 0px 5px 0px 5px">
                                            <p>${product.ProductName}</p>
                                        </div>
                                        <div style="font-size: 13px; padding: 0px 5px 5px 13px;font-family: spectral">
                                        `;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p><span style="margin: 0px 7px">+</span>${addOn.AddOn}</p>
                            `;
                        });

                        if (product.Extras.length) {
                            newHtm += `<p style="margin: 9px; font-weight: 300; font-size: 15px">
                            <img width="11px"
                                src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/my_booking.png">
                                ${product.Extras.join(", ")}
                            </p>`
                        }

                        newHtm += `
                                        </div>
                                    </td>
                                    <td style="width: 25%; text-align: center; vertical-align: top; font-family: spectral">
                                        <div style="font-size: 15px;">
                                            <p>${product.Duration}m (${momentz.tz(product.StartTime, process.env.STAFF_ZONE).format('HH:mm')} - ${momentz.tz(product.StartTime, process.env.STAFF_ZONE).add(product.TotalDuration, "minute").format('HH:mm')})</p>
                                        </div>
                                        <div style="
                                            font-size: 15px;
                                            vertical-align: middle;
                                            padding: 0px 5px 5px 5px;
                                        ">`;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p>${addOn.Duration}m</p>
                            `;
                        });
                        newHtm += `
                                        </div>
                                    </td>
                                    <td style="
                                        width: 25%;
                                        text-align: right;
                                        vertical-align: top;
                                        padding: 0px 15px 0px 0px;
                                        ">
                                        <div style="
                                            font-size: 15px;
                                            vertical-align: middle;
                                        ">
                                        <p>
                                            <img width="11px"
                                            src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/euro-dark.png"
                                            style="position: relative; top: 2px">
                                            ${product.Amount}
                                        </p>
                                        </div>
                                        <div style="
                                            text-align: right;
                                            font-size: 15px;
                                            vertical-align: middle;
                                            padding: 0px 0px 5px 5px;
                                        ">
                                        `;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p>
                                                <img width="11px"
                                                src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/euro-dark.png"
                                                style="position: relative; top: 2px">
                                                ${addOn.Amount}
                                            </p>
                            `;
                        });
                        newHtm += `                                        
                                        </div>
                                    </td>
                                    </tr>
                        `;
                    }

                    newHtm += `
                                    <tr style="width: 100%; border-top: solid #e4ddd7 1px">
                                        <td colspan="2" style="width: 75%; padding-top: 9px">
                                            <div style="vertical-align: bottom; padding: 0px 5px 0px 5px">
                                            <p style="font-size: 10px; margin-top: 8px">Notes</p>
                                            <p style="font-size: 12px">
                                                ${bookingRaw.UserNotes ? bookingRaw.UserNotes : ""}
                                            </p>
                                            </div>
                                        </td>
                                        <!-- column for total amount -->
                                        <td style="width: 25%;text-align: right;padding: 10px 15px 0px 0px;vertical-align: top;">
                                            <div style="font-size: 25px;">
                                                <p style="color:#6e594e;font-weight: 500;">
                                                `;

                    if (bookingRaw.PaymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED) {
                        newHtm += `<span style="font-size: 10px;vertical-align: middle;background-color: #e4ddd7;padding: 6px;border-radius: 3px;letter-spacing: 1px">PAID</span>`;
                    }
                    newHtm += `
                                                    
                                                    <span>
                                                    <img width="16px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/euro-dark.png" style="
                                position: relative;
                                top: 4px;
                            ">
                                                    ${bookingRaw.Amount}
                                                    </span>
                                                </p>
                                            </div>
                                        </td>
                                        </tr>
                                </tbody>
                                </table>
                            </div>
                            </div>
                            <!-- footer section -->
                            <div style="margin-top: 10px; font-family: Raleway, sans-serif">
                                <a href="${process.env.CMS_URL}#/booking"><button style="
                                        font-size: 15px;
                                        cursor: pointer;
                                        font-family: Raleway, sans-serif;
                                        margin: 10px 0px;
                                        background-color: rgba(255, 255, 255, 0);
                                        padding: 15px 25px;
                                        border: solid #ccc5c1 1px;
                                        border-radius: 10px;
                                        letter-spacing: 1px;
                                        color: #a18f88;
                                    ">
                                    VIEW BOOKINGS
                                    </button></a>
                                <h4 style="font-weight: 500; font-size: 18px; font-family: spectral">
                                    COCON Company
                                </h4>
                                <p style="margin-top: 35px; font-style: italic; font-family: spectral">
                                    This is an automated email sent from an unmonitored mailbox. Please do
                                    not reply to it.
                                </p>
                            </div>
                        </div>
                        </div>
                    `;
                    let notifyAdmins = await knex(ADMIN_NOTIFICATION_CONTACT).select("Value").where("Deleted", "=", 0).andWhere("Type", "=", 0);
                    let toMails = [];
                    notifyAdmins.forEach(ad => toMails.push(ad.Value));
                    let mailSubject = "";
                    switch (bookingRaw.PaymentStatus) {
                        case BOOKING_PAYMENT_STATUS.SUCCEEDED:
                            mailSubject = `New Booking #${bookingRaw.BookingId} confirmed`;
                            break;
                        case BOOKING_PAYMENT_STATUS.CANCELLED:
                            mailSubject = `Booking #${bookingRaw.BookingId} payment cancelled`;
                            break;
                        case BOOKING_PAYMENT_STATUS.FAILED:
                            mailSubject = `Booking #${bookingRaw.BookingId} payment failed`;
                            break;
                        case BOOKING_PAYMENT_STATUS.NOT_REQUIRED:
                            mailSubject = `New Booking #${bookingRaw.BookingId} confirmed`;
                            break;
                        default:
                            mailSubject = `New Booking #${bookingRaw.BookingId} arrived`;
                            break;
                    }
                    let mailOptions = {
                        from: process.env.EMAIL,
                        to: toMails.join(", "),
                        subject: mailSubject,
                        html: newHtm
                    }
                    let smtpTransport = nodemailer.createTransport({
                        service: "gmail",
                        auth: {
                            type: "OAuth2",
                            user: process.env.EMAIL,
                            clientId: process.env.CLIENT_ID,
                            clientSecret: process.env.CLIENT_SECRET,
                            refreshToken: process.env.REFRESH_TOKEN,
                            // accessToken: accessToken.token,
                        }
                    })
                    let sendingMail = await sendMail(smtpTransport, mailOptions);
                    //console.log(sendingMail);
                } catch (error) {
                    console.log(error);
                }

                break;
            }
            case 1: {
                await holdfor5mins();
                let bookingDetail = await knex
                    .select(
                        BOOKINGS + ".BookingId",
                        BOOKINGS + ".DateTime",
                        BOOKINGS + ".UserId",
                        USERS + ".FcmToken",
                        BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                        BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                        BOOKING_PRODUCT_ADDONS + ".RequestStatus",
                        BOOKING_PRODUCT_ADDONS + ".ExtraNotified",
                    )
                    .from(BOOKINGS)
                    .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                    .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingId", BOOKINGS + ".BookingId")
                    .where(BOOKINGS + ".BookingId", "=", json.BookingId)
                //console.log(bookingDetail);
                let toNotify = [];
                bookingDetail.forEach(addOn => {
                    if (
                        addOn.ExtraAddOn === 1 &&
                        addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED &&
                        addOn.ExtraNotified === 0
                    ) {
                        toNotify.push(addOn.BookingProductAddOnId);
                    }
                });
                if (toNotify.length) {
                    try {
                        await knex(USER_MESSAGES).insert({
                            UserId: bookingDetail[0].UserId,
                            Title: "Add-ons accepted, make payment",
                            Description: `One or more add-ons for your booking on ${momentz.tz(bookingDetail[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)} are accepted, please complete the payment.`,
                            ImagePath: null,
                            Date: moment().toDate(),
                            ...zone.getCreateUpdate()
                        });
                        if (bookingDetail[0].FcmToken) {
                            STAFF_ZONE = zone.getStaffZone(bookingDetail[0].DateTime);
                            const message = {
                                token: bookingDetail[0].FcmToken,
                                notification: {
                                    title: "Add-ons accepted, make payment",
                                    body: `One or more add-ons for your booking on ${momentz.tz(bookingDetail[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)} are accepted, please complete the payment.`
                                },
                                data: {
                                    BookingId: `${json.BookingId}`,
                                    ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                                }
                            }
                            const userApp = InitializeFirebase();
                            const sentNotification = await userApp.messaging().send(message);
                            //console.log(sentNotification)
                        }
                    } catch (error) {
                        //console.log(error);
                    }
                    await knex(BOOKING_PRODUCT_ADDONS)
                        .whereIn("BookingProductAddOnId", toNotify)
                        .update({
                            ExtraNotified: 1,
                            LastUpdated: zone.getLastUpdate()
                        })
                }
                break;
            }
            default: {
                //console.log("no default implementation")
                break;
            }
        }
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
    }
    return {
        statusCode: 200
    }
}

module.exports.bookingDispatcher = async (event) => {
    /**
     * Objective: Dispatch the bookings(which are auto dispatched) to staff when schedule updated.
     * Working: 
     * 1. Fetch all the unfilled bookings
     *    a) which are auto dispatched and
     *    b) whose products are as per staff skill and
     *    c) not dispatched to this staff.
     * 2. Check global dispatch settings
     *    a) Automatic dispatch: 
     *          - Group filter applied - if staff group active then try dispatch else not.
     *          - Group filter not applied - dispatch after schedule check
     *    b) Manual dispatch:
     *          - If booking in auto dispatch then dispatch to this staff also after schedule check.
     * 3. For each booking
     *    a) If its in staff schedule - then dispatch to this staff.
     *    b) if not in schedule - leave it.
     * 
     * ** Ultimately we are not dispatching if global system is auto dispatch with group filters and staff group is not active in filters.
     */

    let knex, connected = false, response;
    try {
        const json = event //.body ? getPayloadData(event) : null;
        if (!json || !json.StaffId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        let staffId = json.StaffId;
        let staffSkills = await knex(STAFF_PRODUCT).select("ProductId", "Rate").where("StaffId", "=", staffId);
        let prodSkills = [];
        staffSkills.forEach(product => {
            if (product.Rate) {
                prodSkills.push(product.ProductId);
            }
        });
        //console.log("prodSkills");
        //console.log(prodSkills);
        let unfilledAutoBookings = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".ReachOutTime",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".CategoryId",
                BOOKING_PRODUCTS + ".ProductId",
                BOOKING_PRODUCTS + ".DispatchId",
                BOOKING_PRODUCTS + ".Duration",
                BOOKING_PRODUCTS + ".PreparationTime",
                BOOKING_PRODUCTS + ".StartTime"
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .whereIn(BOOKINGS + ".Status", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING])
            .where(BOOKING_PRODUCTS + ".DispatchType", "=", PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH)
            .whereIn(BOOKING_PRODUCTS + ".ProductId", prodSkills)
            .whereNull(BOOKING_PRODUCTS + ".StaffId")
            .where(BOOKINGS + ".DateTime", ">", moment().toDate())
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
        let availableBookings = [];
        for (let unfillInc = 0; unfillInc < unfilledAutoBookings.length; unfillInc++) {
            const booking = unfilledAutoBookings[unfillInc];
            let dispatchList = await knex(BOOKING_PRODUCT_DISPATCH)
                .select("StaffId", "Status")
                .where("DispatchId", "=", booking.DispatchId)
                .andWhere("StaffId", "=", staffId);
            if (dispatchList.length) {
                if (dispatchList[0].Status === DISPATCH_STATUS.DISPATCHED) {
                    continue;
                }
            }
            availableBookings.push(booking);
        }

        //console.log(availableBookings)
        let globalSettings = await this.getGlobalDispatchSettings(knex);
        response = [];
        let considerStaff = true;
        if (globalSettings.globalDispatchSettings[0].GlobalDispatchDefault === GLOBAL_DISPATCH_SETTING.AUTOMATIC_DISPATCH) {
            if (globalSettings.globalDispatchSettings[0].IsFilterApplied) {
                let groupFilter = globalSettings.globalDispatchFilters.find(f => f.DispatchFilterId === ENUM_DISPATCH_FILTERS.GROUP.Id);
                if (groupFilter && groupFilter.IsActive) {
                    let staffGroupRaw = await knex(STAFF).select("StaffGroupId").where("StaffId", "=", staffId);
                    if (!staffGroupRaw || !staffGroupRaw[0].StaffGroupId) {
                        //console.log("Staff does not have any group assigned");
                        considerStaff = false;
                    } else {
                        let groupFound = globalSettings.activeStaffGroups.find(f => f.StaffGroupId === staffGroupRaw[0].StaffGroupId);
                        if (!groupFound) {
                            //console.log("Staff Group is not selected in filters");
                            considerStaff = false;
                        }
                    }
                }
            } else {
                //console.log("Global auto dispatch filters not applied.")
            }
        } else {
            //console.log("Global Manual dispatch")
        }

        if (considerStaff) {
            for (let resInc = 0; resInc < availableBookings.length; resInc++) {
                const booking = availableBookings[resInc];
                let finalDuration = booking.Duration;
                let addOns = await knex(BOOKING_PRODUCT_ADDONS)
                    .select("BookingProductAddOnId", "Duration")
                    .where("BookingProductId", "=", booking.BookingProductId);
                addOns.forEach(addOn => {
                    finalDuration += addOn.Duration;
                });
                let staffAvailability = await staffCheck(knex, {
                    StaffId: staffId,
                    StartTime: booking.StartTime,
                    Duration: finalDuration,
                    ReachOut: booking.ReachOutTime + booking.PreparationTime
                })
                if (staffAvailability.IsAvailable) {
                    let dispatchRecExist = await knex(BOOKING_PRODUCT_DISPATCH)
                        .select("BookingProductDispatchId")
                        .where("DispatchId", "=", booking.DispatchId)
                        .andWhere("StaffId", "=", staffId);

                    if (dispatchRecExist.length) {
                        await knex(BOOKING_PRODUCT_DISPATCH)
                            .where("BookingProductDispatchId", "=", dispatchRecExist[0].BookingProductDispatchId)
                            .update({
                                Status: DISPATCH_STATUS.DISPATCHED,
                                LastUpdated: zone.getLastUpdate()
                            })
                    } else {
                        await knex(BOOKING_PRODUCT_DISPATCH).insert({
                            DispatchId: booking.DispatchId,
                            StaffId: staffId,
                            Status: DISPATCH_STATUS.DISPATCHED,
                            ...zone.getCreateUpdate()
                        })
                    }
                    response.push(booking.BookingId);
                }
            }
        }

        if (response.length) {
            // send push to staff
            try {
                let title = `You have booking offers`;
                let description = `You have got ${response.length} booking offer(s), please see the incoming requests for more detail`;
                // insert staff specific message in DB
                const msgInsert = await knex(STAFF_MESSAGES).insert({
                    StaffId: staffId,
                    Title: title,
                    Description: description,
                    ImagePath: null,
                    Date: moment().toDate(),
                    ...zone.getCreateUpdate()
                })

                let staffFcm = await knex(STAFF).select("FcmToken").where("StaffId", "=", staffId);
                if (staffFcm[0].FcmToken) {
                    const message = {
                        token: staffFcm[0].FcmToken,
                        notification: {
                            title,
                            body: description
                        },
                        data: {
                            ScreenName: PUSH.SCREEN.INCOMING_REQUEST
                        }
                    }
                    //console.log(message);
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotifications = await therapistApp.messaging().send(message);
                    //console.log(sentNotifications)
                }
            } catch (error) {
                //console.log(error)
            }
        }
        await knex.destroy();

    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
    }
    return {
        statusCode: 200
        // headers: {
        //     ...Headers,
        // },
        // body: setPayloadData(event, response)
    }
}

const holdfor5mins = () => {
    return new Promise((resolve, reject) => {
        setInterval(() => {
            //console.log("1 min passed");
        }, 60000);
        setTimeout(() => {
            //console.log("3 mins passed");
            resolve();
        }, 180000);
    })
}

const holdfor10secs = () => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            //console.log("5 secs passed");
            resolve();
        }, 5000);
    })
}
const holdfor1secs = () => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            //console.log("1 secs passed");
            resolve();
        }, 1000);
    })
}

module.exports.bookingLapseNInconclusive = async (event) => {
    let markedBookings = [];
    let knex = require("knex")(con);
    try {
        let lapsInconCheck = [
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.ON_GOING
        ];
        let bookingsData = await knex
            .select(
                BOOKINGS + '.BookingId',
                BOOKINGS + '.Duration',
                BOOKINGS + '.DateTime',
                BOOKINGS + '.Status',
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus'
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
            .whereIn(BOOKINGS + ".Status", lapsInconCheck);
        let finalData = [];
        for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
            const booking = bookingsData[bookingInc];
            booking.StatusName = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name;
            const found = finalData.find(book => book.BookingId === booking.BookingId);
            if (!found) {
                let objToPush = {
                    BookingId: booking.BookingId,
                    Duration: booking.Duration,
                    DateTime: booking.DateTime,
                    Status: booking.Status,
                    StatusName: booking.StatusName,
                    Products: [],
                }
                let prodPushObj = {
                    BookingProductId: booking.BookingProductId,
                    Status: booking.BookingProductStatus,
                    StaffId: booking.StaffId
                }
                objToPush.Products.push(prodPushObj);
                finalData.push(objToPush);
            } else {
                let prodPushObj = {
                    BookingProductId: booking.BookingProductId,
                    Status: booking.BookingProductStatus,
                    StaffId: booking.StaffId
                }
                found.Products.push(prodPushObj)
            }
            if (booking.Status !== BOOKING_STATUS.COMPLETED && booking.Status !== BOOKING_STATUS.LAPSED) {
                let bookingBufferEndTime = moment(booking.DateTime)
                    .add(booking.Duration, "minute")
                    .add(STATUS_WAIT_TIME, "minute");
                let currentTime = moment();
                if (
                    bookingBufferEndTime.isBefore(currentTime) ||
                    bookingBufferEndTime.isSame(currentTime)
                ) {
                    const PROD_STAFF_CONFLICT = [
                        BOOKING_PRODUCT_STATUS.ON_GOING,
                        BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN,
                        BOOKING_PRODUCT_STATUS.NOT_STARTED
                    ];
                    if (PROD_STAFF_CONFLICT.includes(booking.BookingProductStatus)) {
                        if (
                            booking.BookingProductStatus === BOOKING_PRODUCT_STATUS.ON_GOING ||
                            booking.BookingProductStatus === BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN
                        ) {
                            let prodStatusUpdated = await knex(BOOKING_PRODUCTS)
                                .where("BookingProductId", "=", booking.BookingProductId)
                                .update({
                                    Status: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                                    LastUpdated: zone.getLastUpdate()
                                })
                        }
                        const found = finalData.find(f => f.BookingId === booking.BookingId);
                        let bookingUpdated = await knex(BOOKINGS)
                            .where("BookingId", "=", found.BookingId)
                            .update({
                                Status: BOOKING_STATUS.INCONCLUSIVE,
                                LastUpdated: zone.getLastUpdate()
                            })
                        found.Status = BOOKING_STATUS.INCONCLUSIVE;
                        let staffStatus = await knex(STAFF)
                            .select("Status", "CurrentBookingId")
                            .where("StaffId", "=", booking.StaffId);
                        let staffData = staffStatus[0];
                        if (staffData && staffData.CurrentBookingId === booking.BookingId) {
                            // free the staff
                            let staffStatusUpdated = await knex(STAFF)
                                .where("StaffId", "=", booking.StaffId)
                                .update({
                                    Status: STAFF_STATUS.AVAILABLE,
                                    CurrentBookingId: null,
                                    LastUpdated: zone.getLastUpdate()
                                })
                        }
                        markedBookings.push({
                            BookingId: booking.BookingId,
                            NewStatus: BOOKING_STATUS.INCONCLUSIVE
                        });
                    }
                }
            }
        }
        const PROD_STATUS_LAPSE_CHECK = [
            BOOKING_PRODUCT_STATUS.ON_GOING,
            BOOKING_PRODUCT_STATUS.COMPLETED,
            BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN
        ]
        for (let book = 0; book < finalData.length; book++) {
            const booking = finalData[book];
            if (booking.Status === BOOKING_STATUS.CONFIRMED) {
                let doLapse = true;
                for (let prodInc = 0; prodInc < booking.Products.length; prodInc++) {
                    const prodStatus = booking.Products[prodInc];
                    if (PROD_STATUS_LAPSE_CHECK.includes(prodStatus.Status)) {
                        doLapse = false;
                        break;
                    }
                }
                if (doLapse) {
                    const currentTime = moment();
                    const bookingTime = moment(booking.DateTime);
                    bookingTime.add(booking.Duration, "minute");
                    bookingTime.add(LAPSED_WAIT_TIME, "minute");                           // buffer minutes for status update after booking is completed
                    if (currentTime.isAfter(bookingTime)) {
                        const statusUpdated = await knex(BOOKINGS).where("BookingId", "=", booking.BookingId)
                            .update({
                                Status: BOOKING_STATUS.LAPSED,
                                LastUpdated: zone.getLastUpdate()
                            })
                        booking.Status = BOOKING_STATUS.LAPSED;
                        markedBookings.push({
                            BookingId: booking.BookingId,
                            NewStatus: BOOKING_STATUS.LAPSED
                        });
                    }
                }
            }
        }
        //console.log(markedBookings)
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        await knex.destroy();
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            Data: markedBookings
        })
    }
}
module.exports.updateBookingDraft = async event => {
    /**
     * API Objective: Create a booking configured from CMS.
     * Working:
     * 1. Check for required data.
     * 2. Validate each product configuration
     * 3. Check amount accuracy and product/add-on configuration for conflict
     * 4. Do staff allocation from available staff in products
     * 5. Check if user already exist, else register new one.
     * 6. Insert all data to DB
     * 9. Return booking list
     */
    let knex, connected = false, response;

    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // if (
        //     (!json.UserId && !json.Email) ||
        //     !json.Name || typeof json.Name !== "string" ||
        //     !json.Street || typeof json.Street !== "string" ||
        //     !json.Amount || typeof json.Amount !== "number" ||
        //     !json.ReachOutTime || typeof json.ReachOutTime !== "number" ||
        //     !json.DateTime || typeof json.DateTime !== "string" ||
        //     !json.PaidPrice || typeof json.PaidPrice !== "number" ||
        //     !json.Products ||
        //     typeof json.Products !== 'object' ||
        //     json.Products.length === 0 ||
        //     typeof json.Elevator !== "number" || json.Elevator < 0 || json.Elevator > 1
        // ) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }

        if (!json) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        let reminder = json.ReachOutTime % 5;
        if (reminder > 0) {
            let toAdd = 5 - reminder;
            json.ReachOutTime += toAdd;
        }

        knex = require("knex")(con);
        connected = true;

          /****************************
         * Check organisation and insert else throw error
         ****************************/
        // create variables for address fields
        // let housenumber=json.HouseNumber?json.HouseNumber:null
        // let zip=json.Zip?json.Zip:null
        // let elevator=json.Elevator?(json.Elevator==1)?1:0:0
        // let reachOutTime=json.ReachOutTime?json.ReachOutTime:null
        // let distance=json.Distance?json.Distance:null
        // let street=json.Street?json.Street:null
        // let city=json.City?json.City:null

        if(json.OrganisationLocationId){
            let organisationData=await organisations(knex, json.OrganisationLocationId);
            if(organisationData.length){
                organisation =organisationData[0]
                //console.log("organisation",organisation)
                json.HouseNumber=organisation.HouseNumber
                json.Zip=organisation.Zip
                json.Elevator=organisation.Elevator?1:0
                json.ReachOutTime=organisation.ReachOutTime
                json.Distance=organisation.Distance
                 json.Street=organisation.Street
                 json.City=organisation.City

            }else{
                throw new Error(MESSAGE.INVALID_ORGANISATION);

            }
        }

        /******************************************************************************
         * Check draft already exists and remove the product configuration.
         ******************************************************************************/ 
        const hasBookingId = json.BookingId || typeof json.BookingId === "number";
        if (hasBookingId) {
            // check if booking exist or not.
            const bookingExistData = await knex(BOOKINGS).select("BookingId", "Status").where("BookingId", "=", json.BookingId);
            if (bookingExistData.length <= 0) {
                return {
                    statusCode: 404,
                    headers: {
                        ...Headers,
                        message: MESSAGE.BOOKING_NOT_AVAILABLE
                    }
                }
            } else {
                // Check booking status is draft
                const bookingData = bookingExistData[0];
                if (bookingData.Status !== BOOKING_STATUS.DRAFT) {
                    return {
                        statusCode: 404,
                        headers: {
                            ...Headers,
                            message: MESSAGE.BOOKING_NOT_A_DRAFT
                        }
                    }
                }
            }
            
            // Delete the BookingProduct Extras, if there is any
            //Step1: Fetch the BookingProductId first
            let existRecs = await knex(BOOKING_PRODUCTS)
            .select("BookingProductId")
            .where("BookingId", "=", json.BookingId);
            const bookingProductIds = existRecs.map(record => record.BookingProductId);

            //Step2:  Delete Product extras
            let prodExtrasDeleted = await knex(BOOKING_PRODUCT_EXTRA)
                .whereIn("BookingProductId", bookingProductIds)
                .del();

            //Step3:  Delete Product
            let productDeleted = await knex(BOOKING_PRODUCTS)
                .where("BookingId", "=", json.BookingId)
                .del();

            //Step3:  Delete Product Add-on
            let productAddonDeleted = await knex(BOOKING_PRODUCT_ADDONS)
                .where("BookingId", "=", json.BookingId)
                .del();
        }

        /******************************************************************************
         * Start the input data validation and store the data.
         ******************************************************************************/ 
        let products = [];
        products = json.Products;
        let productNames = [];
        let productToFetch = [];
        let addOnToFetch = [];

        // Validate each product configuration
        STAFF_CURRENT_SCHEDULE = [];
        let totalDuration = 0;
        const hasProducts = json.Products && json.Products.length != 0;
        //console.log("hasProducts : ", hasProducts)
        if (hasProducts) {
            products.forEach(product => {
                if (
                    !product.ProductId ||
                    !product.Name ||
                    !product.CategoryId 
                    // !product.StartTime ||
                    // !product.Duration ||
                    // !product.Amount ||
                    // !product.AvailableStaff ||
                    // product.AvailableStaff.length <= 0 ||
                    // typeof product.Therapist !== "number" ||
                    // product.Therapist < 0 || product.Therapist > 2
                ) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                const found = productToFetch.find(f => f === product.ProductId);
                if (!found) {
                    productToFetch.push(product.ProductId)
                }
                product.AvailableStaff.forEach(staff => {
                    if (!staff.StaffId || !staff.GoogleEmail) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                    let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
                    if (!staffFound) {
                        STAFF_CURRENT_SCHEDULE.push({
                            StaffId: staff.StaffId,
                            GoogleEmail: staff.GoogleEmail
                        })
                    }
                });
                if (product.AddOns.length > 0) {
                    product.AddOns.forEach(addOn => {
                        if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
                            throw new Error(MESSAGE.REQ_DATA_ERROR);
                        }
                        const found = addOnToFetch.find(f => f === addOn.AddOnId);
                        if (!found) {
                            addOnToFetch.push(addOn.AddOnId);
                        }
                    });
                }
                if (product.Guest) {
                    if (!product.Guest.Name || !product.Guest.Contact) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                }
                productNames.push(product.Name);
            });


            
            /*****************************************
             * Check amount accuracy and product/add-on configuration
             *****************************************/ 
            let calculatedAmount = 0;
            try {
                const proDurationFetched = await knex
                    .select(
                        PRODUCTS + ".ProductId",
                        PRODUCTS + ".PreparationTime",
                        PRODUCT_DURATIONS + ".Duration",
                        PRODUCT_DURATIONS + ".Amount"
                    )
                    .from(PRODUCTS)
                    .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
                    .whereIn(PRODUCTS + ".ProductId", productToFetch)
                    .andWhere(PRODUCTS + ".Deleted", "=", 0)

                const addOnFetched = await knex(ADDONS)
                    .select("AddOnId", "Duration", "Amount")
                    .whereIn("AddOnId", addOnToFetch)
                    .andWhere("Deleted", "=", 0);

                products.forEach(product => {
                    const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
                    // if (!found || found.Amount !== product.Amount) {
                    //     found=[]
                    // }
                    product.TotalDuration = (found &&found.Duration)?found.Duration:0;
                    product.TotalAmount = (found &&found.Amount)?found.Amount:0;
                    calculatedAmount += (found &&found.Amount)?found.Amount:0;
                    product.AddOns.forEach(addOn => {
                        const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
                        // if (!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) {
                        //     found=[]
                        // }
                        calculatedAmount += (found && found.Amount)?found.Amount:0;
                        product.TotalDuration += (found &&found.Duration)?found.Duration:0;
                        product.TotalAmount += (found &&found.Amount)?found.Amount:0;
                    });
                    product.PreparationTime = (found &&found.PreparationTime)?found.PreparationTime:0;
                });
                if(json.TravelFee){
                    //console.log("calculatedAmount")
                    calculatedAmount += json.TravelFee;
                }
                if (calculatedAmount !== json.Amount) {
                    throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
                }
                if (json.PromoCode && json.PromoAmount) {
                    calculatedAmount -= json.PromoAmount;
                }
                calculatedAmount=Math.max(calculatedAmount,0)
                if (calculatedAmount !== json.PaidPrice) {
                    throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
                }
            } catch (error) {
                //console.log(error);
                return {
                    statusCode: 409,
                    headers: {
                        ...Headers,
                        Message: error.message
                    }
                }
            }
            
            /****************************
            * Save the therapists selected by Amdin via Direct assignment
            ****************************/
            for (let prodInc = 0; prodInc < products.length; prodInc++) {
                const product = products[prodInc];
                if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                    product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                    product.DispatchId = null;
                    product.StaffId = (product.AvailableStaff[0])?product.AvailableStaff[0].StaffId:null;
                    product.StaffEmail = (product.AvailableStaff[0])?product.AvailableStaff[0].GoogleEmail:null;
                    let staffProductData = await knex(STAFF_PRODUCT)
                        .select("ProductId", "Rate")
                        .where("StaffId", "=", product.StaffId)
                        .andWhere("ProductId", "=", product.ProductId);
                    let staffRate = staffProductData[0];
                    // product.StaffRate = staffRate.Rate;
                    if(staffRate){
                        product.StaffRate = staffRate.Rate;
                    }else{
                        product.StaffRate=0
                    }
                }
            }

            /****************************
            * Get Total booking duration 
            ****************************/
            const startTimes = products.map(product => moment(product.StartTime));
            //console.log(startTimes)
            const bookingStartTime = moment.min(startTimes);
            const bookingLastTreatmentST = moment.max(startTimes);
            //console.log(bookingStartTime)
            //console.log(bookingLastTreatmentST)
            let maxDurationOfLastProd = 0;
            for (let prodInc = 0; prodInc < products.length; prodInc++) {
                const product = products[prodInc];
                //console.log(product)
                if (moment(product.StartTime).isSame(bookingLastTreatmentST)) {
                    if (product.Duration > maxDurationOfLastProd) {
                        maxDurationOfLastProd = product.Duration;
                    }
                }
                //console.log(maxDurationOfLastProd)
            }
            //console.log("maxDurationOfLastProd"+maxDurationOfLastProd)
            //console.log(bookingStartTime)
            //console.log(bookingLastTreatmentST)
            bookingLastTreatmentST.add(maxDurationOfLastProd, 'minutes');
            const bookingEndTime= bookingLastTreatmentST
            //console.log(bookingLastTreatmentST)
            
            //console.log("bookingStartTime")
            //console.log(bookingStartTime)
            //console.log(bookingEndTime)
            totalDuration = bookingEndTime.diff(bookingStartTime, 'minutes')
            //console.log("total"+totalDuration)
            totalDuration=(isNaN(totalDuration))?0:totalDuration
        }

         /****************************
         * Get Total booking duration 
         ****************************/
         totalDuration=0
         for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            // if ((!product.StaffId || !product.StaffEmail) && !json.ForceStaffAllot) {
            //     return {
            //         statusCode: 410,
            //         headers: {
            //             ...Headers,
            //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
            //         }
            //     }
            // }
            if (prodInc === 0) {
                totalDuration += product.TotalDuration;
                //console.log("totalDuration"+totalDuration)
            } else {
                if (product.SameTime) {
                    if (product.TotalDuration >= products[0].TotalDuration) {
                        totalDuration = product.TotalDuration;
                        totalDuration = product.TotalDuration;
                    }
                    //console.log("totalDuration1"+totalDuration)
                    //console.log("product.TotalDuration"+product.TotalDuration)
                } else if (products[0].StaffId === product.StaffId) {
                    totalDuration += product.PreparationTime + product.TotalDuration;
                    //console.log("totalDuration2"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                    //console.log("product.PreparationTime"+product.PreparationTime)
                } else {
                    totalDuration += product.TotalDuration;
                    //console.log("totalDuration3"+totalDuration)
                    //console.log("product.TotalDuration;"+product.TotalDuration)
                }
            }
        }

        let userId = json.UserId ? json.UserId : null;
        let userName = json.Name;
        if (!userId && json.Email) {
            let emailExist = await knex(USERS).select("UserId", "Name").where("Email", "=", json.Email);
            if (emailExist.length > 0) {
                userId = emailExist[0].UserId;
                userName = emailExist[0].Name;
            }
        }
        // if (!userId && userName) {
        //     //NOTE: except the Name field all other information is optional.
        //     const userInserted = await knex(USERS).insert(
        //         {
        //             FromCMS: 1,
        //             Name: json.Name,
        //             Email: json.Email ? json.Email : null,
        //             ImagePath: json.ImagePath ? json.ImagePath : null,
        //             Contact: json.Contact ? json.Contact: null,
        //             HouseNumber: json.HouseNumber ? json.HouseNumber : null,
        //             Gender: json.Gender ? json.Gender :  null,
        //             Therapist: json.Therapist ? json.Therapist : THERAPIST_PREF.EITHER,
        //             Street: json.Street ? json.Street: null,
        //             Floor: json.Floor ? json.Floor : null,
        //             City: json.City ? json.City : null,
        //             Zip: json.Zip ? json.Zip : null,
        //             DOB: json.DOB ? new Date(json.DOB) :  null,
        //             PreferredLanguage: json.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
        //             ClientSource: json.ClientSource || CLIENT_SOURCE.WALKIN,
        //             Elevator: json.Elevator ? 1 : 0,
        //             Notes: json.Notes?json.Notes:'',
        //             ...zone.getCreateUpdate()
        //         }
        //     )
        //     userId = userInserted[0];
        //     //console.log("user Inserted");
        // } else {
        //     //console.log('user not inserted');
        // }
        if (!userId && userName) {
            let user=json.Userdata
           
            if (
                !user.Name ||
                !user.Email
                
               
                
                
            ) {
                throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
            }

            //console.log("user")
            const userInserted = await knex(USERS).insert(
                {
                    FromCMS: 1,
                    Name: user.Name?user.Name:null,
                    Email: user.Email,
                    ImagePath: user.ImagePath ? user.ImagePath : null,
                    Contact: user.Contact?user.Contact:null,
                    Gender: user.Gender?user.Gender:null,
                    Therapist: user.Therapist?user.Therapist:null,
                    Street: user.Street? user.Street : null,
                    HouseNumber: user.HouseNumber?user.HouseNumber:null,
                    Floor: user.Floor ? user.Floor : null,
                    City: user.City ? user.City : null,
                    Zip: user.Zip ? user.Zip : null,
                    DOB: user.DOB ? new Date(user.DOB) :  null,
                    Distance: user.Distance ? user.Distance : null,
                    ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                    PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                    ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                    Elevator: user.Elevator ? 1 : 0,
                    Notes: user.Notes?user.Notes:'',
                    FullAddress : user.FullAddress?user.FullAddress:null,
                    ...zone.getCreateUpdate()
                }
            )
            userId = userInserted[0];
        }
        else{
           

           
            if(json.userUpdated){
                let user=json.Userdata
            if (
                !user.Name 
                // !user.Email ||
                // !user.Contact ||
                // typeof user.Gender !== "number" || user.Gender < 0 || user.Gender > 1||
                // // typeof user.Elevator !== "number" || user.Elevator < 0 || user.Elevator > 1||
                // typeof user.Therapist !== "number" || user.Therapist < 0 || user.Therapist > 2||
                // typeof user.PreferredLanguage !== "number" || user.PreferredLanguage < 0 ||
                // typeof user.ClientSource  !== "number" || user.ClientSource < 0 ||
                // !user.Zip ||
                // !user.HouseNumber ||
                // !user.DOB 
               
                
                
            ) {
                throw new Error(MESSAGE.REQ_DATA_USER_ERROR);
            }
            if(json.saveUserDetailRecord){
                await knex(USERS)
            .update({
                FromCMS: 1,
                    Name: user.Name,
                    Email: user.Email,
                    ImagePath: user.ImagePath ? user.ImagePath : null,
                    Contact: user.Contact,
                    Gender: user.Gender,
                    Therapist: user.Therapist,
                    Street: user.Street? user.Street : null,
                    HouseNumber: user.HouseNumber,
                    Floor: user.Floor ? user.Floor : null,
                    City: user.City ? user.City : null,
                    Zip: user.Zip ? user.Zip : null,
                    DOB: user.DOB ? new Date(user.DOB) :  null,
                    Distance: user.Distance ? user.Distance : null,
                    ReachOutTime: user.ReachOutTime ? user.ReachOutTime : null,
                    PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                    ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                    Elevator: user.Elevator ? 1 : 0,
                    Notes: user.Notes,
                    FullAddress : user.FullAddress?user.FullAddress:null,
                    LastUpdated: zone.getLastUpdate()
            })
            .where("UserId", "=", json.UserId)
            //console.log("user")

            }else{
                await knex(USERS)
            .update({
                FromCMS: 1,
                    Name: user.Name,
                    Email: user.Email,
                    ImagePath: user.ImagePath ? user.ImagePath : null,
                    Contact: user.Contact,
                    Gender: user.Gender,
                    Therapist: user.Therapist,
                    DOB: user.DOB ? new Date(user.DOB) :  null,
                    PreferredLanguage: user.PreferredLanguage || PREFERRED_LANGUAGE.ENGLISH,
                    ClientSource: user.ClientSource || CLIENT_SOURCE.WALKIN,
                    Notes: user.Notes,
                    LastUpdated: zone.getLastUpdate()
            })
            .where("UserId", "=", json.UserId)
            //console.log("user")
            }
            
            await knex(BOOKINGS)
            .update({
                UserId:json.UserId,
                LastUpdated: zone.getLastUpdate(),
            })
            .where("UserId", "=", json.UserId)
            .modify(queryBuilder => {
        
        console.log(queryBuilder.toSQL().toNative())
    });
            
            }
        
        }

        let bookingFirstProTime = json.DateTime;
        if (hasProducts) {
            bookingFirstProTime = getBookingStartTime(products);
        }
        STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);
        let bookingInserted;

        if (hasBookingId) {
            // Update Existing Booking
            //console.log("This is a draft booking update case.")
            // this is a booking update case.
            const dataUpdate = {
                BookingProvider: parseInt(process.env.BOOKING_PROVIDER_CMS),
                UserId: userId,
                Street: json.Street ? json.Street : null,
                HouseNumber: json.HouseNumber ? json.HouseNumber : null,
                Floor: json.Floor ? json.Floor : null,
                City: json.City ? json.City : null,
                Zip: json.Zip ? json.Zip : null,
                Distance: json.Distance ? json.Distance : null,
                Elevator: json.Elevator || 0,
                Amount: json.Amount,
                Duration: totalDuration,
                DateTime: (moment(bookingFirstProTime).isValid())?moment(bookingFirstProTime).toDate():moment(json.DateTime).startOf("day").toDate(),
                ReachOutTime: json.ReachOutTime || 0,
                PromoCode: json.PromoCode ? json.PromoCode : null,
                PromoAmount: json.PromoAmount ? json.PromoAmount : null,
                PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
                PaidPrice: json.PaidPrice,
                PaymentStatus: BOOKING_PAYMENT_STATUS.MANUAL,                    // make payment status manual
                TransactionId: null,                                             // not known as payment is manual
                TransactionDate: null,                                           // not known as payment is manual
                Status: BOOKING_STATUS.DRAFT,                                // make booking status confirmed
                PredecessorBookingId: null,
                SuccessorBookingId: null,
                SystemPhase: SYSTEM_PHASE.PHASE_TWO,
                Deleted: 0,
                TravelFee: json.TravelFee ? json.TravelFee : 0,
                PaymentType: json.PaymentType? json.PaymentType:0,
                BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
                OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
                BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
                BookedBy: json.BookedBy?json.BookedBy:'',
                FullAddress:json.FullAddress,
            LastUpdated: zone.getLastUpdate()
            };
            dataUpdate.PaymentStatus=(json.PaymentType==0)?BOOKING_PAYMENT_STATUS.MANUAL:BOOKING_PAYMENT_STATUS.PENDING
            let bookingUpdated = await knex(BOOKINGS)
                .where("BookingId", "=", json.BookingId)
                .update(dataUpdate)
            bookingInserted = json.BookingId;

        } else {
            // New booking creation
            //console.log(moment(bookingFirstProTime).toDate())
            const dataSubmit = {
                BookingProvider: parseInt(process.env.BOOKING_PROVIDER_CMS),
                UserId: userId,
                Street: json.Street ? json.Street : null,
                HouseNumber: json.HouseNumber ? json.HouseNumber : null,
                Floor: json.Floor ? json.Floor : null,
                City: json.City ? json.City : null,
                Zip: json.Zip ? json.Zip : null,
                Distance: json.Distance ? json.Distance : null,
                Elevator: json.Elevator || 0,
                Amount: json.Amount,
                Duration: totalDuration,
                DateTime: (moment(bookingFirstProTime).isValid())?moment(bookingFirstProTime).toDate():moment(json.DateTime).startOf("day").toDate(),
                ReachOutTime: json.ReachOutTime || 0,
                PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
                PromoCode: json.PromoCode ? json.PromoCode : null,
                PromoAmount: json.PromoAmount ? json.PromoAmount : null,
                PaidPrice: json.PaidPrice,
                PaymentStatus: BOOKING_PAYMENT_STATUS.MANUAL,                    // make payment status manual
                TransactionId: null,                                             // not known as payment is manual
                TransactionDate: null,                                           // not known as payment is manual
                Status: BOOKING_STATUS.DRAFT,                                // make booking status confirmed
                PredecessorBookingId: null,
                SuccessorBookingId: null,
                SystemPhase: SYSTEM_PHASE.PHASE_TWO,
                Deleted: 0,
                TravelFee: json.TravelFee ? json.TravelFee : 0,
            PaymentType: json.PaymentType? json.PaymentType:0,
            BookingChannelId: json.BookingChannelId ? json.BookingChannelId : null,
            OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
            BookingBusinessType: json.OrganisationLocationId ? BOOKING_BUSINESS_TYPE.B2B : BOOKING_BUSINESS_TYPE.B2C,
            BookedBy: json.BookedBy?json.BookedBy:'',
            FullAddress:json.FullAddress,
                ...zone.getCreateUpdate()
            };
            dataSubmit.PaymentStatus=(json.PaymentType==0)?BOOKING_PAYMENT_STATUS.MANUAL:BOOKING_PAYMENT_STATUS.PENDING
            let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
            if (bookingResult.length === 0) {
                throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
            }
            bookingInserted = bookingResult[0];
            //console.log(bookingInserted);
        }
        //console.log("Here we go for  products : ")
        //console.log(hasProducts)
        //console.log(products)
        if (hasProducts) {
            //console.log("Here we go for  products : ")
            //console.log(hasProducts)
            //now we have BookingId for further operations
            for (let index = 0; index < products.length; index++) {
                let product = products[index];
                const productInserted = await knex(BOOKING_PRODUCTS)
                    .insert({
                        BookingId: bookingInserted,
                        Product: product.Name,
                        ProductId: product.ProductId,
                        CategoryId: product.CategoryId,
                        Duration: product.Duration,
                        Amount: product.Amount,
                        PreparationTime: product.PreparationTime,
                        StaffId: product.StaffId ? product.StaffId : null,
                        UserId: userId,
                        GuestId: null,
                        SameTime: product.SameTime, 
                        StartTime: new moment(product.StartTime).toDate(),
                        Therapist: product.Therapist,
                        ForceStaffAllot: json.ForceStaffAllot ? 1 : 0,
                        Status: BOOKING_PRODUCT_STATUS.NOT_STARTED,
                        DispatchType: product.DispatchType,
                        DispatchId: product.DispatchId,
                        StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                        DiscountedAmount: product.DiscountedAmount ? product.DiscountedAmount : 0,
                        Discount: product.Discount ? product.Discount : 0,
                        ...zone.getCreateUpdate()
                    });
                let bookingProductId = productInserted[0];

                if (product.Extras && product.Extras.length > 0) {
                    for (let extInc = 0; extInc < product.Extras.length; extInc++) {
                        const extra = product.Extras[extInc];
                        let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
                            .insert({
                                BookingProductId: bookingProductId,
                                ExtraTitle: extra.ExtraTitle,
                                ExtraValue: extra.ExtraValue,
                                ...zone.getCreateUpdate()
                            })

                    }
                }

                if (product.AddOns.length > 0) {
                    let AddOns = product.AddOns;
                    for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                        const addOn = AddOns[addOnIndex];
                        let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
                            .insert({
                                BookingId: bookingInserted,
                                BookingProductId: bookingProductId,
                                AddOnId: addOn.AddOnId,
                                AddOn: addOn.Name,
                                Duration: addOn.Duration,
                                Amount: addOn.Amount,
                                BookingAddOnPaymentId: null,
                                Status: BOOKING_PRODUCT_ADD_ON_STATUS.NOT_STARTED,
                                StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
                                ...zone.getCreateUpdate()
                            })
                    }
                }
            }
        }

        /*******************************************
         * Code to insert the Admin notes.
         *****************************************/ 
        try {
            var deletedSpecialRequest = await knex(BOOKING_SPECIAL_REQUEST)
                .where("BookingId", "=", bookingInserted)
                .delete().
                modify(function(qb){
                   //console.log( qb.toSQL().toNative())
                });
                //console.log(deletedSpecialRequest)
            // if (!deletedSpecialRequest) {
            //     throw new Error(MESSAGE.SPECIAL_REQUEST_UPDATE_SWW);
            // }
            if (json.SpecialRequest && json.SpecialRequest.length > 0) {
                let preDefinedRequest=[]
                let reqToAdd=[]
                for (let reqIndex = 0; reqIndex < json.SpecialRequest.length; reqIndex++) {
                    if(typeof (json.SpecialRequest[reqIndex]) == "number"){
                        
                        
                        //console.log(json.SpecialRequest[reqIndex])
                        preDefinedRequest.push(json.SpecialRequest[reqIndex])
                        //console.log("if")
                    }else{
                        //console.log("else")
                        let requestData={
                            SpecialRequestName:json.SpecialRequest[reqIndex],
                            IsUSerDefined:1,
                            ...zone.getCreateUpdate()
                        }
                        let addedRequest = await knex(SPECIAL_REQUEST).insert(requestData) 
                        preDefinedRequest.push(addedRequest[0])
                    }
                }
                for (let reqIndex = 0; reqIndex < preDefinedRequest.length; reqIndex++) {
                    reqToAdd.push({
                        BookingId:bookingInserted,
                        SpecialRequestId:preDefinedRequest[reqIndex],
                        ...zone.getCreateUpdate()
                    })
                }
                let addedBookingRequest = await knex(BOOKING_SPECIAL_REQUEST).insert(reqToAdd) 

                
            }
            
            if (json && json.AdminNotes && json.AdminNotes.trim()) {
                if (hasBookingId) {
                    // update extras row.
                    let extraExist = await knex(BOOKING_EXTRA).select("*").where("BookingId", "=", bookingInserted);
                    if(extraExist.length>0){
                        let updateObj = {
                            AdminNotes: json.AdminNotes.trim(),
                            LastUpdated: zone.getLastUpdate()
                        }
                        const adminNotesUpdated = await knex(BOOKING_EXTRA).where("BookingId", "=", bookingInserted).update(updateObj);
                        //console.log(`Admin notes updated: ${adminNotesUpdated}`);
                    }else{
                        let insertObj = {
                            BookingId: `${bookingInserted}`,
                            AdminNotes: json.AdminNotes.trim(),
                            ...zone.getCreateUpdate()
                        }
                        const adminNotesInserted = await knex(BOOKING_EXTRA).insert(insertObj);
                        //console.log(`Admin notes inseted: ${adminNotesInserted}`);
                    }
                    
                } else {
                    // insert extras row.
                    let insertObj = {
                        BookingId: `${bookingInserted}`,
                        AdminNotes: json.AdminNotes.trim(),
                        ...zone.getCreateUpdate()
                    }
                    const adminNotesInserted = await knex(BOOKING_EXTRA).insert(insertObj);
                    //console.log(`Admin notes inseted: ${adminNotesInserted}`);
                }
            }else{
                if (hasBookingId) {
                    // update extras row.
                    let extraExist = await knex(BOOKING_EXTRA).select("*").where("BookingId", "=", bookingInserted);
                    if(extraExist.length>0){
                        let updateObj = {
                            AdminNotes: '',
                            LastUpdated: zone.getLastUpdate()
                        }
                        const adminNotesUpdated = await knex(BOOKING_EXTRA).where("BookingId", "=", bookingInserted).update(updateObj);
                        //console.log(`Admin notes updated: ${adminNotesUpdated}`);
                    }
                    
                }
            }
        } catch (error) {
            //console.log(error);
        }
        if(hasBookingId){
            // Save log for create
        await saveLog(knex,json.AdminId,BOOKINGS,bookingInserted,LOG_ACTION_TYPE.UPDATE)
        }else{
             // Save log for create
        await saveLog(knex,json.AdminId,BOOKINGS,bookingInserted,LOG_ACTION_TYPE.CREATE)
        }
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_DRAFT_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.deleteBookingDraft = async event => {
    /**
     * API Objective: Cancel a booking on admin behalf
     * Working:
     * 1. Check for required data.
     * 2. Delete the draft
     */

    try {
        let isHeadersValid = checkHeaders(event.headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var connected = false;
        var knex = require("knex")(con);
        connected = true;
        const bookingId = json.BookingId;
        //Step intial:  Delete Booking
        let bookingDeleted = await knex(BOOKINGS)
            .where("BookingId", "=", bookingId)
            .del();
        // Delete the BookingProduct Extras, if there is any
        //Step1: Fetch the BookingProductId first
        let existRecs = await knex(BOOKING_PRODUCTS)
        .select("BookingProductId")
        .where("BookingId", "=", json.BookingId);
        const bookingProductIds = existRecs.map(record => record.BookingProductId);

        //Step2:  Delete Product extras
        let prodExtrasDeleted = await knex(BOOKING_PRODUCT_EXTRA)
            .whereIn("BookingProductId", bookingProductIds)
            .del();

        //Step3:  Delete Product
        let productDeleted = await knex(BOOKING_PRODUCTS)
            .where("BookingId", "=", json.BookingId)
            .del();

        //Step3:  Delete Product Add-on
        let productAddonDeleted = await knex(BOOKING_PRODUCT_ADDONS)
            .where("BookingId", "=", json.BookingId)
            .del();
        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_DRAFT_DELETED
        },
        body: setPayloadData(event, {})
    }
}

const createInvoice = async (bookingObj, userId,bookingId) => {
    /**
     * API Objective: to create an Invoice after the booking data is saved for a booking
     * Working:
        1. Send booking data to Stripe API to create the invoice.
     */
    const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
    let CustomerId ,InvoiceId,SendCustomEmail
    let knex, connected = false, response,InvoiceData;
    let finalize  = {}
    try {
        knex = require("knex")(con);
        
        //fetch if customer's stripe Id is present else create a new customer on Stripe.
        let userExist = await knex(USERS).select("*").where("UserId", "=", userId);
        if (userExist[0].CustomerId) {
            CustomerId = userExist[0].CustomerId
            //console.log(bookingObj.InvoiceEmail)
            //console.log(userExist[0].Email)
            if(bookingObj.InvoiceEmail==userExist[0].Email){
                
                // //console.log(CustomerId)
                SendCustomEmail=false;
            }else{
                SendCustomEmail=true;
            }
            
        } else {
            if(bookingObj.InvoiceEmail==userExist[0].Email){
                
                // //console.log(CustomerId)
                SendCustomEmail=false;
                var customerData = await createStripeCustomerInvoice(stripe, userExist[0], knex,bookingObj);
                CustomerId = customerData.id
            }else{
                var customerData = await createStripeCustomerInvoice(stripe, userExist[0], knex);
                CustomerId = customerData.id
                SendCustomEmail=true;
            }
            //create a new customer on stripe
            
        }

        try {

            var invoice = await createStripeInvoice(stripe, bookingObj, CustomerId,bookingId);
            InvoiceId  = invoice.id
           
            // //console.log(products)
            for (let index = 0; index < bookingObj.Products.length; index++) {
                let product=bookingObj.Products[index];
                // //console.log("Inside the item function")
                var invoiceItem = await createStripeInvoiceItem(stripe, product,bookingObj, CustomerId,InvoiceId,"product");
                // //console.log("Inside the item function")
                if(product.AddOns.length >0){
                    for (let index = 0; index < product.AddOns.length; index++){
                        var invoiceItem = await createStripeInvoiceItem(stripe, product.AddOns[index],bookingObj, CustomerId,InvoiceId,"add-on");
                    }
                }
            }
            if(bookingObj.TravelFee>0){
                var invoiceItem = await createStripeInvoiceItem(stripe, null,bookingObj, CustomerId,InvoiceId,"travelfee");
            }
            
            if(InvoiceId){
                //console.log("before finalize")
                 finalize= await finalizeStripeInvoice(stripe,InvoiceId);
                if(finalize){
                    //console.log("after finalize")
                    //console.log(SendCustomEmail)

                    if(SendCustomEmail){
                        if(bookingObj.OnlyCopy==false){
                             //console.log("inside custom ")
                        await sendCustomInvoiceEmail(finalize,bookingObj)
                        }
                       
                        let invoiceInserted = await knex(BOOKING_INVOICE_DATA)
                                .insert({
                                    BookingId: bookingId,
                                    InvoiceEmail: bookingObj.InvoiceEmail,
                                    InvoiceId: finalize.id,
                                    InvoiceStripeStatus:finalize.status,
                                    ...zone.getCreateUpdate()
                                })

                    }else{
                        if(bookingObj.OnlyCopy==false){
                            const sentInvoice= await sendStripeInvoice(stripe,InvoiceId)
                        }
                            
                        let invoiceInserted = await knex(BOOKING_INVOICE_DATA)
                                .insert({
                                    BookingId: bookingId,
                                    InvoiceEmail: finalize.customer_email,
                                    InvoiceId: finalize.id,
                                    InvoiceStripeStatus:finalize.status,
                                    ...zone.getCreateUpdate()
                                })
                        }
                        
                    
                   
                }
            }
        

            
            
           

           

            await knex.destroy();
            //  

        } catch (error) {
            await knex.destroy();
            console.log(error);

            let err = new Error(MESSAGE.INVOICE_NOT_CREATED);
            err.Status = 424;
            throw err;
        }

    } catch (error) {
        console.log(error)
        let err = new Error(MESSAGE.INVOICE_NOT_CREATED);
        err.Status = 424;
        throw err;
    }
   return finalize
}

const createStripeInvoiceItem = async (stripe, item,bookingObj,customerId,invoiceId,type) => {
    try{
        switch (type) {
            case "product":
                const prodinvoiceItem = await stripe.invoiceItems.create({
                    customer: customerId,
                    invoice: invoiceId,
                    amount: parseInt(item.Amount) * 100,
                    currency: CURRENCY,
                    description: item.Name
                });
                break;
            case "add-on":
                const addoninvoiceItem = await stripe.invoiceItems.create({
                    customer: customerId,
                    invoice: invoiceId,
                    amount: parseInt(item.Amount) * 100,
                    currency: CURRENCY,
                    description: item.Name
                });
                break;
            case "travelfee":
                const travelinvoiceItem = await stripe.invoiceItems.create({
                    customer: customerId,
                    invoice: invoiceId,
                    amount: parseInt(bookingObj.TravelFee) * 100,
                    currency: CURRENCY,
                    description: "Travel Fee"
                });
                break
        }
        
        // //console.log(invoiceItem)
        // //console.log("invoiceItem")
        // return invoiceItem
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}

const createStripeInvoice = async (stripe, bookingObj,customerId,bookingId) => {
    try{
        let coupon;
        if(bookingObj.PromoCode){
            coupon= await createStripeCoupon(stripe,bookingObj,customerId)
        }
        // let bookingDate=
        let due_days= moment(bookingObj.DateTime).endOf("day").diff(moment().endOf("day"), "days"); 
        if(due_days <1){
            due_days=1
        }
        console.log("date",moment(bookingObj.DateTime).endOf("day"))
        console.log("moment",moment().endOf("day"))
        console.log("diff", moment(bookingObj.DateTime).endOf("day").diff(moment().endOf("day"), "days"))
        let invoiceOj={
            customer: customerId,
            collection_method: "send_invoice",
            days_until_due: due_days,
            pending_invoice_items_behavior:'exclude',
            currency:CURRENCY,
            auto_advance:false,
            description:"Booking Id #"+bookingId,
            metadata: {
                "BookingId": bookingId
            },
            
        }
        if(coupon){
            invoiceOj.discounts=[{
                coupon: coupon.id
              }]
        }
        // //console.log(coupon)
        console.log(invoiceOj)
        const invoice = await stripe.invoices.create({
            ...invoiceOj

        });
        // //console.log(invoice)
        return invoice
    }
    catch(error){
        //console.log(error)
        throw new Error(error.message)
    }
}

const createStripeCoupon = async (stripe, bookingObj,customerId) => {
    try{
        const coupon = await stripe.coupons.create({
                amount_off: parseInt(bookingObj.PromoAmount)*100,
                currency: CURRENCY,
                duration:"once",
                name:bookingObj.PromoCode
              });
            //   //console.log(coupon)
        return coupon
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}
const finalizeStripeInvoice = async (stripe, InvoiceId) => {
    try{
            const finalizeInvoice = await stripe.invoices.finalizeInvoice(
                InvoiceId
              );
        return finalizeInvoice
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}
const sendStripeInvoice = async (stripe, InvoiceId) => {
    try{
        const sentInvoice = await stripe.invoices.sendInvoice(
            InvoiceId);
        
        return sentInvoice
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}
const retrieveStripeInvoice = async (stripe, InvoiceId) => {
    try{
        const invoice = await stripe.invoices.retrieve(
            InvoiceId
          );
        // //console.log(invoice)
        return invoice
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}
const voidStripeInvoice = async (stripe, InvoiceId) => {
    try{
        let knex = require("knex")(con);
        const invoice = await stripe.invoices.voidInvoice(
            InvoiceId
          );
          let updateObj={
            InvoiceStripeStatus:invoice.status,
            LastUpdated: zone.getLastUpdate()
          }
          const invoiceVoid = await knex(BOOKING_INVOICE_DATA).where("InvoiceId", "=", InvoiceId).update(updateObj);
        // //console.log(invoice)
        return invoice
    }
    catch(error){
        //console.log(error.message)
        throw new Error(error.message)
    }
}
const sendCustomInvoiceEmailOld = async (Invoice, bookingRaw) => {
  try{  


//console.log(bookingRaw.Name)
                    let addressString = (bookingRaw.Floor ? bookingRaw.Floor + ", " : "") + (bookingRaw.Street ? bookingRaw.Street + " " : "") + (bookingRaw.HouseNumber ? bookingRaw.HouseNumber + " " : "")+(bookingRaw.City ? ", " + bookingRaw.City : "") + (bookingRaw.Zip ? ", " + bookingRaw.Zip : "");
                    let newHtm = `
                        <div style="
                            background-color: #ffffff;
                            width: 100%;
                            padding: 1%;
                            font-family: Raleway, sans-serif;
                            color: #3a312d;
                            letter-spacing: 1px;
                        ">
                        <div style="width: 100%">
                            <div style="width: 100%; text-align: center">
                                <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
                            </div>
                            <div style="width: 100%; text-align: center">
                                <h1 style="
                                    color: #514844;
                                    font-weight: 500;
                                    letter-spacing: 0.5px;
                                    font-size: 30px;
                                    margin-top: 5px;
                                    ">
                                    COCON
                                </h1>
                            </div>
                            <div>
                                <h4 style="font-weight: 500; font-size: 17px">Hi there,</h4>
                                <h4 style="font-weight: 500; font-size: 17px">`;
                                newHtm += "A new invoice has been generated."
                   
                    newHtm += `                                    
                                </h4>
                            </div>
                            <div style="font-weight: 500">
                            <div style="
                                margin: 30px 0px;
                                width: 70%;
                                border: solid #ccc5c1 1px;
                                border-radius: 10px;
                                padding: 20px;
                                box-shadow: 0 4px 8px 0 #ccc5c1, 0 6px 20px 0 #ccc5c1;
                                ">
                                <div style="color: #756e6b">
                                <div style="text-align: center">
                                    <h2 style="margin: 13px; font-weight: 400; font-size: 25px">
                                        ${bookingRaw.Name}
                                    </h2>
                                </div>
                                <div style="text-align: center">
                                    <h5 style="margin: 9px; font-weight: 300; font-size: 15px">
                                    <img width="11px"
                                        src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/location.png">
                                        ${addressString}
                                    </h5>
                                    <h5 style="margin: 9px; font-weight: 300; font-size: 15px">
                                    <img width="11px"
                                        src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/calendar.png">
                                        ${momentz.tz(bookingRaw.DateTime, process.env.STAFF_ZONE).format("dddd, MMM DD YYYY, HH:mm" + " " + DATE_TIME_FORMAT.z)}
                                    </h5>
                                </div>
                                </div>
                                <table style="
                                    margin-top: 30px;
                                    width: 100%;
                                    border-collapse: collapse;
                                    font-weight: 400;
                                ">
                                <tbody>`;

                    for (let prInc = 0; prInc < bookingRaw.Products.length; prInc++) {
                        const product = bookingRaw.Products[prInc];
                        newHtm += `
                                    <tr style="width: 100%; border-top: solid #e4ddd7 1px">
                                    <td style="width: 50%; padding: 9px 0px 0px 15px">
                                        <div style="font-size: 13px; padding: 0px 5px 0px 5px">
                                            <p>${product.Name}</p>
                                        </div>
                                        <div style="font-size: 13px; padding: 0px 5px 5px 13px;font-family: spectral">
                                        `;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p><span style="margin: 0px 7px">+</span>${addOn.Name}</p>
                            `;
                        });
                        if(bookingRaw.TravelFee){
                            newHtm+=`<div style="font-size: 13px; padding: 0px 5px 0px 5px">
                        <p>Travel Fee</p>
                    </div>`
                        }
                        
                        newHtm += `
                                        </div>
                                    </td>
                                    <td style="width: 25%; padding-top: 10px; text-align: center;font-family: spectral">
                                        <div style="font-size: 15px;">
                                            <p>${product.Duration}m</p>
                                        </div>
                                        <div style="
                                            font-size: 15px;
                                            vertical-align: middle;
                                            padding: 0px 5px 5px 5px;
                                        ">`;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p>${addOn.Duration}m</p>
                            `;
                        });
                        newHtm += `
                                        </div>
                                    </td>
                                    <td style="
                                        width: 25%;
                                        text-align: right;
                                        padding: 10px 15px 0px 0px;
                                        ">
                                        <div style="
                                            font-size: 15px;
                                            vertical-align: middle;
                                        ">
                                        <p>
                                        €${product.Amount}
                                        </p>
                                        </div>
                                        <div style="
                                            text-align: right;
                                            font-size: 15px;
                                            vertical-align: middle;
                                            padding: 0px 0px 5px 5px;
                                        ">
                                        `;
                        product.AddOns.forEach(addOn => {
                            newHtm += `
                                            <p>
                                            €${addOn.Amount}
                                            </p>
                            `;
                        });
                        newHtm += `                                        
                                        </div> `;
                            newHtm+=`<div style="
                            font-size: 15px;
                            vertical-align: middle;
                        ">`
                        if(bookingRaw.TravelFee){
                            newHtm+=`<p>
                            €${bookingRaw.TravelFee}
                            </p>`
                        }
                        
                        newHtm+=` </div>
                    
                                    </td>
                                    </tr>
                        `;
                    }
                    
                    newHtm += `
                                    <tr style="width: 100%; border-top: solid #e4ddd7 1px">
                                        <td colspan="2" style="width: 75%; padding-top: 9px">
                                            <div style="vertical-align: bottom; padding: 0px 5px 0px 5px">`
                                            if(bookingRaw.AdminNotes){
                                                newHtm+=`
                                            <p style="font-size: 10px; margin-top: 8px">Notes</p>
                                            <p style="font-size: 12px">
                                                ${bookingRaw.AdminNotes ? bookingRaw.AdminNotes : "-"}
                                            </p>`
                                        }
                                          newHtm+=`  
                    
                                            </div>
                                        </td>
                                        <!-- column for total amount -->
                                        <td style="width: 25%;text-align: right;padding: 10px 15px 0px 0px;vertical-align: top;">
                                            <div style="font-size: 25px;">
                                                <p style="margin-bottom:0px;color:#6e594e;font-weight: 500;">
                                                `;

                    
                    newHtm += `
                                                    
                                                    <span>
                                                    
                                                    €${bookingRaw.Amount}
                                                    </span>
                                                </p>
                                            </div>
                                        </td>
                                        </tr>`
                                        if(bookingRaw.PromoCode){
                                            newHtm+=` <tr style="width: 100%;">
                                            <td colspan="1" style="width: 50%; padding-top: 9px"></td>
                                            <!-- column for promocode amount -->
                                            <td style="width: 25%;text-align: right;padding: 10px 15px 0px 0px;vertical-align: top;">
                                            <div style="font-size: 20px;">
                                                <p style="margin-bottom:0px; color:#6e594e;font-weight: 500;"></p>`;
                                                newHtm+=`
                                                <span>
                                                    
                                                    ${bookingRaw.PromoCode}
                                                    </span>
                                                </p>
                                                </div>
                                                </td>`
                                                
                                        newHtm+=`<td style="width: 25%;text-align: right;padding: 10px 15px 0px 0px;vertical-align: top;">
                                            <div style="font-size: 20px;">
                                                <p style="margin-bottom:0px; color:#6e594e;font-weight: 500;"></p>`;
                                                newHtm+=`
                                                <span>
                                                    
                                                    €${bookingRaw.PromoAmount}
                                                    </span>
                                                </p>
                                                </div>
                                                </td>
                                                </tr>  `
                                                newHtm+=`<tr style="width: 100%;">
                                                <td colspan="1" style="width: 75%; padding-top: 9px"></td>
                                                <!-- column for promocode amount -->
                                                <td style="width: 25%;text-align: right;padding: 10px 15px 0px 0px;vertical-align: top;">
                                                <div style="font-size: 25px;">
                                                    <p style="margin-bottom:0px; color:#6e594e;font-weight: 500;"></p>`
                                                    newHtm+=`
                                                    <span>
                                                        
                                                        ${bookingRaw.PaidPrice}
                                                        </span>
                                                    </p>
                                                    </div>
                                                    </td></tr>`
                                        }
                                
                                newHtm+=`</tbody>
                                </table>
                            </div>
                            </div>
                            <!-- footer section -->
                            <div style="margin-top: 10px; font-family: Raleway, sans-serif">
                                <a href="${Invoice.hosted_invoice_url}"><button style="
                                        font-size: 15px;
                                        cursor: pointer;
                                        font-family: Raleway, sans-serif;
                                        margin: 10px 0px;
                                        background-color: rgba(255, 255, 255, 0);
                                        padding: 15px 25px;
                                        border: solid #ccc5c1 1px;
                                        border-radius: 10px;
                                        letter-spacing: 1px;
                                        color: #a18f88;
                                    ">
                                    View and Pay Invoice
                                    </button></a>
                                <h4 style="font-weight: 500; font-size: 18px; font-family: spectral">
                                    COCON Company
                                </h4>
                                <p style="margin-top: 35px; font-style: italic; font-family: spectral">
                                    This is an automated email sent from an unmonitored mailbox. Please do
                                    not reply to it.
                                </p>
                            </div>
                        </div>
                        </div>
                    `;
//console.log(newHtm);
    let toMails = [bookingRaw.InvoiceEmail]
    mailOptions = {
        from: process.env.EMAIL,
        to: toMails,
        subject: "New invoice has been generated",
        html: newHtm
    }

    let smtpTransport = nodemailer.createTransport({
        service: "gmail",
        auth: {
            type: "OAuth2",
            user: process.env.EMAIL,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN,
            // accessToken: accessToken.token,
        }
    })
    let sendingMail = await sendMail(smtpTransport, mailOptions);
    //console.log(sendingMail);
} catch (err) {
   //console.log(err)
   let error = new Error(MESSAGE.INVOICE_NOT_SENT);
   error.Status = 424;
   throw error;
}
    
}

const sendCustomInvoiceEmail = async (Invoice, bookingRaw) => {
    try{  
  
  
  //console.log(bookingRaw)
  let firstName = bookingRaw.Name.split(" ");
                      let addressString = (bookingRaw.Floor ? bookingRaw.Floor + ", " : "") + (bookingRaw.Street ? bookingRaw.Street + " " : "") + (bookingRaw.HouseNumber ? bookingRaw.HouseNumber + " " : "")+(bookingRaw.City ? ", " + bookingRaw.City : "") + (bookingRaw.Zip ? ", " + bookingRaw.Zip : "");
                      let newHtm = `
                          <div style="
                              background-color: #ffffff;
                              width: 100%;
                              padding: 1%;
                              font-family: Raleway, sans-serif;
                              color: #3a312d;
                              letter-spacing: 1px;
                          ">
                          <div style="width: 100%">
                              <div style="width: 100%; text-align: center">
                                  <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
                              </div>
                              <div style="width: 100%; text-align: center">
                                  <h1 style="
                                      color: #514844;
                                      font-weight: 500;
                                      letter-spacing: 0.5px;
                                      font-size: 30px;
                                      margin-top: 5px;
                                      ">
                                      COCON
                                  </h1>
                              </div>
                              <div>
                                  <h4 style="font-weight: 500; font-size: 17px">Hi ${bookingRaw.Name},</h4>
                                  <h4 style="font-weight: 500; font-size: 17px">`;
                                  newHtm += "A new booking invoice has been created on your behalf, please contact support if not requested by you.<br/>"
                                  newHtm += "Your booking invoice details are as follows:<br/>"
                                  
                     
                      newHtm += `                                    
                                  </h4>
                              </div>
                              <div style="font-weight: 500">
                              <div style="
                                  margin: 30px 0px;
                                  width: 70%;
                                  border: solid #ccc5c1 1px;
                                  border-radius: 10px;
                                  padding: 20px;
                                  box-shadow: 0 4px 8px 0 #ccc5c1, 0 6px 20px 0 #ccc5c1;
                                  ">
                                  <div style="color: #756e6b">
                                  <div style="text-align: center">
                                      <h2 style="margin: 13px; font-weight: 400; font-size: 25px">
                                          ${firstName[0]}
                                      </h2>
                                  </div>
                                  <div style="text-align: center">
                                      <h5 style="margin: 9px; font-weight: 300; font-size: 15px">
                                      <img width="11px"
                                          src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/icons/location.png">
                                          ${addressString}
                                      </h5>
                                      
                                  </div>
                                  </div>
                                  <table cellspacing ="25" style="margin-top: 30px; width: 100%; border-collapse:collapse">
                                  <thead>
                <th width="60%"> </th>
                <th width="15%"> </th>
                <th width="15%"> </th>
            </thead>
            <tbody style="font-family: Raleway,sans-serif; color: ##756e6b;">`;
  
                      for (let prInc = 0; prInc < bookingRaw.Products.length; prInc++) {
                          const product = bookingRaw.Products[prInc];
                          if(prInc==0){
                            newHtm+=`<tr style="border-top: solid #e4ddd7 1px;">`
                          }else{
                            newHtm+=`<tr>`
                          }
                          newHtm += `
                          <td style="font-size: 15px; padding-top: 10px">${product.Name}</td>
                          <td style="font-size: 15px; text-align: center">${product.Duration}m</td>
                          <td style="font-size: 15px;text-align: right">€${product.Amount}</td>
                          </tr>`;

                          product.AddOns.forEach(addOn => {
                              newHtm += `
                              <tr>
                          <td style="font-size: 15px; padding-top: 7px "><span style="margin: 0px 7px">+</span>${addOn.Name}</td>
                          <td style="font-size: 15px; text-align: center">${addOn.Duration}m</td>
                          <td style="font-size: 15px; text-align: right">€${addOn.Amount}m</td>
                          </tr>
                              `;
                          })
                        };
                          if(bookingRaw.TravelFee){
                              newHtm+=`<tr>
                              <td style="font-size: 15px ;padding-top: 10px ;padding-bottom: 10px">Travel Fee</td>
                              <td style="font-size: 15px; text-align: center"></td>
                              <td style="font-size: 15px; text-align: right">€${bookingRaw.TravelFee}</td>
                              </tr>`
                          }
                          if(!bookingRaw.PromoCode){
                            newHtm+=`<tr style="border-top: solid #e4ddd7 1px">`
                            if(bookingRaw.AdminNotes){
                                newHtm+=`<td style="font-size: 15px;padding-top: 10px ;">Notes: ${bookingRaw.AdminNotes}</td>
                                <td style="text-align: center"></td>`
                            }else{
                                newHtm+=`<td style="font-size: 15px;padding-top: 10px ;"></td>
                                <td style="text-align: center"></td>`
                            }
                            newHtm+=`
                            <td style="font-size: 15px; text-align: right">€${bookingRaw.Amount}</td>
                            </tr>`
                        }else{
                            newHtm+=`<tr style="border-top: solid #e4ddd7 1px">`
                            newHtm+=`
                            <td style="font-size: 15px;padding-top: 10px ;"></td>
                                <td style="text-align: center"></td>
                            <td style="font-size: 15px; text-align: right">€${bookingRaw.Amount}</td>
                            </tr>`
                            newHtm+=`<tr>`
                            newHtm+=`
                            <td style="font-size: 15px;padding-top: 10px ;"></td>
                            <td style="font-size: 15px; text-align: center">${bookingRaw.PromoCode}</td>
                            <td style="font-size: 15px; text-align: right">- €${bookingRaw.PromoAmount}</td>
                            </tr>`;
                            newHtm+=`<tr>`
                            if(bookingRaw.AdminNotes){
                                newHtm+=`<td style="font-size: 15px;padding-top: 10px ;">Notes: ${bookingRaw.AdminNotes}</td>
                                <td style="text-align: center"></td>`
                            }else{
                                newHtm+=`<td style="font-size: 15px;padding-top: 10px ;"></td>
                                <td style="text-align: center"></td>`
                            }
                            newHtm+=`

                            <td style="font-size: 15px; text-align: right;padding-top: 10px ;">€${bookingRaw.PaidPrice}</td>
                            </tr>`;
                        }

                                  
                                  newHtm+=`</tbody>
                                  </table>
                              </div>
                              </div>
                              <!-- footer section -->
                              <div style="margin-top: 10px; font-family: Raleway, sans-serif">
                                  <a href="${Invoice.hosted_invoice_url}"><button style="
                                          font-size: 15px;
                                          cursor: pointer;
                                          font-family: Raleway, sans-serif;
                                          margin: 10px 0px;
                                          background-color: rgba(255, 255, 255, 0);
                                          padding: 15px 25px;
                                          border: solid #ccc5c1 1px;
                                          border-radius: 10px;
                                          letter-spacing: 1px;
                                          color: #a18f88;
                                      ">
                                      View and Pay Invoice
                                      </button></a>
                                  <h4 style="font-weight: 500; font-size: 18px; font-family: spectral">
                                      COCON Company
                                  </h4>
                                  <p style="margin-top: 35px; font-style: italic; font-family: spectral">
                                      This is an automated email sent from an unmonitored mailbox. Please do
                                      not reply to it.
                                  </p>
                              </div>
                          </div>
                          </div>
                      `;
  //console.log(newHtm);
      let toMails = [bookingRaw.InvoiceEmail]
      mailOptions = {
          from: process.env.EMAIL,
          to: toMails,
          subject: "New invoice has been generated",
          html: newHtm
      }
  
      let smtpTransport = nodemailer.createTransport({
          service: "gmail",
          auth: {
              type: "OAuth2",
              user: process.env.EMAIL,
              clientId: process.env.CLIENT_ID,
              clientSecret: process.env.CLIENT_SECRET,
              refreshToken: process.env.REFRESH_TOKEN,
              // accessToken: accessToken.token,
          }
      })
      let sendingMail = await sendMail(smtpTransport, mailOptions);
      //console.log(sendingMail);
  } catch (err) {
     //console.log(err)
     let error = new Error(MESSAGE.INVOICE_NOT_SENT);
     error.Status = 424;
     throw error;
  }
      
  }

const getPromoCodeDetail = async(promocodeId) => {
    try {
        
        var connected = false;
        
        var knex = require("knex")(con);
        var promoCodeData = await knex
            .select(
                PROMOCODES + '.PromoCodeId',
                PROMOCODES + '.Code',
                PROMOCODES + '.Type',
                PROMOCODES + '.Mode',
                PROMOCODES + '.StartDate',
                PROMOCODES + '.EndDate',
                PROMOCODES + '.Value',
                PROMOCODES + '.MaxAmount',
                PROMOCODES + '.MinPurchaseAmount',
                PROMOCODES + '.Class',
                PROMOCODES + '.RedeemCount',
                PROMOCODES + '.CurrentCount',
                PROMOCODE_CATEGORIES + '.CategoryId',
                knex.raw(`DATE_FORMAT(StartDate, '%d %m %Y') AS your_date`)
            ).from(PROMOCODES)
            .leftJoin(PROMOCODE_CATEGORIES, PROMOCODE_CATEGORIES + '.PromoCodeId', PROMOCODES + '.PromoCodeId')
            .modify(queryBuilder => {
                queryBuilder.where(PROMOCODES + ".PromoCodeId", promocodeId)
                
            })

        var finalData = [];
        
        promoCodeData.forEach(promo => {
            const found = finalData.find(pr => pr.PromoCodeId === promo.PromoCodeId);
            if (!found) {
                let categories = [];
                if (promo.CategoryId) {
                    categories.push(promo.CategoryId)
                }
                
                finalData.push({
                    PromoCodeId: promo.PromoCodeId,
                    Code: promo.Code,
                    Type: promo.Type,
                    Mode: promo.Mode,
                    StartDate: promo.StartDate,
                    EndDate: promo.EndDate,
                    Value: promo.Value,
                    MaxAmount: promo.MaxAmount,
                    MinPurchaseAmount: promo.MinPurchaseAmount,
                    Class: promo.Class,
                    RedeemCount: promo.RedeemCount ? promo.RedeemCount : null,
                    CurrentCount: promo.CurrentCount ? promo.CurrentCount : 0,
                    Categories: categories,
                    your_date: promo.your_date
                })
            } else {
                if (promo.CategoryId) {
                    found.Categories.push(promo.CategoryId);
                }
            }
        });
        await knex.destroy();
    } catch (err) {
        //console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            Error: err.message
        }
    }

    return finalData[0]
}

module.exports.stripeInvoiceWebhook = async (event) => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.data.object.metadata && !json.data.object.metadata.BookingId) {
            //console.log(json);
            return {
                statusCode: 200,
                headers: {
                    ...Headers
                }
            }
        }
        let bookingId; let status=0
        var knex = require("knex")(con);
        if (json.type === 'invoice.paid') {
            let data = json.data;
            bookingId = data.object.metadata.BookingId;
            paymentStatus = 1;
            if (typeof data.object.metadata.BookingId === 'string') {
                bookingId = parseInt(data.object.metadata.BookingId);
            }
            
        }
        if (json.type === 'invoice.payment_failed') {
            let data = json.data;
            bookingId = data.object.metadata.BookingId;
            paymentStatus = 3;
            if (typeof data.object.metadata.BookingId === 'string') {
                bookingId = parseInt(data.object.metadata.BookingId);
            }
            
        }
        

        let updateObj = {
            PaymentStatus: paymentStatus,
            LastUpdated: zone.getLastUpdate()
        }
        //console.log(updateObj)
        let bookUpdated = await knex(BOOKINGS).where("BookingId", "=", bookingId)
                .update(updateObj);
        //console.log("before exit");
        if(paymentStatus==1){
            try {
                let lambda = new AWS.Lambda();
                let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
                lambda.invoke({
                    FunctionName: lambdaName,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        Type: 0,
                        BookingId: bookingId
                    })
                }, function (err, data) {
                    if (err) {
                        //console.log(err);
                    } else {
                        //console.log('Lambda_B said ' + data.Payload);
                    }
                });
                // await holdfor10secs();
                if (paymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED) {
                    // send booking confirmation email
                    let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
                    console.log(bookingNotifier)
                    lambda.invoke({
                        FunctionName: bookingNotifier,
                        InvocationType: 'Event',
                        LogType: 'Tail',
                        Payload: JSON.stringify({
                            BookingId: bookingId
                        })
                    }, function (err, data) {
                        if (err) {
                            //console.log(err);
                        } else {
                            //console.log('Lambda_B said ' + data.Payload);
                        }
                    });
                    await holdfor10secs();
                }
            } catch (error) {
                console.log(error)
            }
        }
        await knex.destroy();
    } catch (error) {
        //console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers
        }
    }
    //console.log('sdfsdfdsf');
}
module.exports.bookingStaffNotification = async (event) => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        bookingInserted= json.BookingId
        let bookingStaff = await knex
        .distinct()
        .select(
            BOOKING_PRODUCTS + ".*",
            STAFF + ".FcmToken"
        )
        .from(BOOKING_PRODUCTS)
        .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
        .where(BOOKING_PRODUCTS + ".BookingId", "=", json.BookingId);
        if(bookingStaff.length){
            for (let pushInc = 0; pushInc < bookingStaff.length; pushInc++) {
                const element = bookingStaff[pushInc];
                if (element.StaffId) {
                    try {
                        let title = `New booking #${bookingInserted} received`;
                        let description = `You have been allotted a new booking, scheduled on ${momentz.tz(element.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                        // insert staff specific message in DB
                        const msgInsert = await knex(STAFF_MESSAGES).insert({
                            StaffId: element.StaffId,
                            Title: title,
                            Description: description,
                            ImagePath: null,
                            Date: moment().toDate(),
                            ...zone.getCreateUpdate()
                        })
                        if (element.FcmToken) {
                            const message = {
                                token: element.FcmToken,
                                notification: {
                                    title,
                                    body: description
                                },
                                data: {
                                    BookingId: `${bookingInserted}`,
                                    DateTime: moment(element.StartTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                    ScreenName: PUSH.SCREEN.BOOKINGS
                                }
                            }
                            //console.log(message);
                            const therapistApp = InitializeFirebaseTherapist();
                            const sentNotifications = await therapistApp.messaging().send(message);
                            //console.log(sentNotifications)
                        }
                    } catch (error) {
                        //console.log(error)
                    }
                }
            }
        }
      
        
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}
module.exports.sendUserBookingPush = async (event) => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        bookingInserted = json.BookingId

        // send push to user
        try {
            let userFcmData = await knex(USERS)
                .select(User+".FcmToken")
                .select(BOOKING+".*")
                .leftJoin(BOOKING, BOOKING + ".UserId", User + ".UserId")
                .where(BOOKING + ".BookingId", "=", json.BookingId);
            let userFcmToken = userFcmData[0].FcmToken;
            // configure message
            const title = PUSH.TITLE.NEW_BOOKING_F_CMS;
            const description = `A new booking has been created on your behalf, scheduled on ${momentz.tz(userFcmToken.StartTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYY_HHcmm + " " + DATE_TIME_FORMAT.z)}, Please contact support if not requested by you.`;
            const msgInsert = await knex(USER_MESSAGES).insert({
                UserId: userId,
                Title: title,
                Description: description,
                ImagePath: null,
                Date: moment().toDate(),
                ...zone.getCreateUpdate()
            })
            if (userFcmToken) {
                const message = {
                    token: userFcmToken,
                    notification: {
                        title,
                        body: description
                    },
                    data: {
                        BookingId: `${bookingInserted}`,
                        ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                    }
                }
                //console.log(message);
                const userApp = InitializeFirebase();
                const sentNotifications = await userApp.messaging().send(message);
                //console.log(sentNotifications)
            }
        } catch (error) {
            //console.log(error);
        }

        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}

// module.exports.saveTempBooking = async event => {
//     let eventsCreated = [];
//     let agPromoId = null;
//     let bookingCreatedId = null;
//     let knex, connected = false, bookingData;
//     try {
//         const headers = event.headers;
//         // //console.log(headers);
//         let isHeadersValid = checkHeaders(headers)
//         if (!isHeadersValid) {
//             return {
//                 statusCode: 401,
//                 headers: {
//                     ...Headers,
//                     Message: MESSAGE.INVALID_HEADERS
//                 }
//             }
//         }
//         // let tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
//         // if (tokenValid.statusCode !== 200) {
//         //     return {
//         //         statusCode: tokenValid.statusCode,
//         //         headers: {
//         //             ...Headers,
//         //             message: tokenValid.message
//         //         }
//         //     }
//         // }
//         const json = event.body ? getPayloadData(event) : null;
//         // //console.log(JSON.stringify({
//         //     json
//         // }, null, 2));
//         if (
//             !json.UserId || typeof json.UserId !== "number" ||
//             !json.Street || typeof json.Street !== "string" ||
//             // !json.HouseNumber || typeof json.HouseNumber !== "string" ||
//             !json.Amount || typeof json.Amount !== "number" ||
//             !json.DateTime || typeof json.DateTime !== "string" ||
//             typeof json.PaidPrice !== "number" || json.PaidPrice < 0 ||
//             !json.Products || typeof json.Products !== 'object' ||
//             !json.ReachOutTime || typeof json.ReachOutTime !== "number" ||
//             json.Products.length === 0
//         ) {
//             throw new Error(MESSAGE.REQ_DATA_ERROR);
//         }

//         // Below code to check payment method is commented as per new stripe approach

//         // if (json.PaidPrice > 0) {
//         //     if (
//         //         json.PaymentMethod < 0 || typeof json.PaymentMethod !== "number" ||
//         //         json.PaymentMethod > 1
//         //     ) {
//         //         throw new Error(MESSAGE.REQ_DATA_ERROR);
//         //     }
//         //     if (json.PaymentMethod === 1 && !json.BankKey) {
//         //         throw new Error(MESSAGE.REQ_DATA_ERROR);
//         //     }
//         // }

//         let reminder = json.ReachOutTime % 5;
//         if (reminder > 0) {
//             let toAdd = 5 - reminder;
//             json.ReachOutTime += toAdd;
//         }

//         // if (json.PromoCodeId && (!json.PromoCode || !json.PromoAmount)) {
//         //     throw new Error(MESSAGE.REQ_DATA_ERROR);
//         // }
//         let dateTime = moment(json.DateTime).utc().toDate();
//         const UserId = json.UserId;
//         let products = [];
//         products = json.Products;
//         let eventsData = [];
//         let productNames = [];
//         let productToFetch = [];
//         let addOnToFetch = [];

//         // Validate each product configuration
//         STAFF_CURRENT_SCHEDULE = [];
//         products.forEach((product) => {
//             if (
//                 !product.ProductId || typeof product.ProductId !== "number" ||
//                 !product.CategoryId || typeof product.CategoryId !== "number" ||
//                 !product.Name || typeof product.Name !== "string" ||
//                 !product.StartTime || typeof product.StartTime !== "string" ||
//                 !product.Duration || typeof product.Duration !== "number" ||
//                 !product.Amount || typeof product.Amount !== "number" ||
//                 !product.AvailableStaff || typeof product.AvailableStaff !== "object" ||
//                 product.AvailableStaff.length <= 0 ||
//                 typeof product.Therapist !== "number" ||
//                 product.Therapist < 0 || product.Therapist > 2
//             ) {
//                 throw new Error(MESSAGE.REQ_DATA_ERROR);
//             }
//             const found = productToFetch.find(f => f === product.ProductId);
//             if (!found) {
//                 productToFetch.push(product.ProductId)
//             }
//             product.AvailableStaff.forEach(staff => {
//                 if (!staff.StaffId || !staff.GoogleEmail) {
//                     throw new Error(MESSAGE.REQ_DATA_ERROR);
//                 }
//                 let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
//                 if (!staffFound) {
//                     STAFF_CURRENT_SCHEDULE.push({
//                         StaffId: staff.StaffId,
//                         GoogleEmail: staff.GoogleEmail
//                     })
//                 }
//             });
//             if (product.AddOns.length > 0) {
//                 product.AddOns.forEach(addOn => {
//                     if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
//                         throw new Error(MESSAGE.REQ_DATA_ERROR);
//                     }
//                     const found = addOnToFetch.find(f => f === addOn.AddOnId);
//                     if (!found) {
//                         addOnToFetch.push(addOn.AddOnId);
//                     }
//                 });
//             }
//             if (product.Guest) {
//                 if (!product.Guest.Name || !product.Guest.Contact) {
//                     throw new Error(MESSAGE.REQ_DATA_ERROR);
//                 }
//             }
//             productNames.push(product.Name);
//         });

//         knex = require("knex")(con);
//         connected = true;
//         const userData = await knex(USERS)
//             .select("UserId", "Email", "Name", "CustomerId", "ReachOutTime", "FcmToken")
//             .where("UserId", "=", UserId);
//         if (userData.length <= 0) {
//             throw new Error(MESSAGE.USER_NOT_EXIST);
//         }
//         let totalDuration = 0;
//         // Check amount accuracy and product/add-on configuration
//         let calculatedAmount = 0;
//         try {
//             let proDurationFetched = await knex
//                 .select(
//                     PRODUCTS + ".ProductId",
//                     PRODUCTS + ".PreparationTime",
//                     PRODUCT_DURATIONS + ".Duration",
//                     PRODUCT_DURATIONS + ".Amount"
//                 )
//                 .from(PRODUCTS)
//                 .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
//                 .whereIn(PRODUCTS + ".ProductId", productToFetch)
//                 .andWhere(PRODUCTS + ".Deleted", "=", 0)
//             let addOnFetched = await knex(ADDONS)
//                 .select("AddOnId", "Duration", "Amount")
//                 .whereIn("AddOnId", addOnToFetch)
//                 .andWhere("Deleted", "=", 0);
//             products.forEach((product, index) => {
//                 const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
//                 if (!found || found.Amount !== product.Amount) {
//                     throw new Error(MESSAGE.INVALID_PRODUCT_CONFIG);
//                 }
//                 product.TotalDuration = found.Duration;
//                 product.TotalAmount = found.Amount;
//                 calculatedAmount += found.Amount;
//                 product.AddOns.forEach(addOn => {
//                     const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
//                     if (!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) {
//                         throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
//                     }
//                     calculatedAmount += found.Amount;
//                     product.TotalDuration += found.Duration;
//                     product.TotalAmount += found.Amount;
//                 });
//                 product.PreparationTime = found.PreparationTime;
//             });
//             if (calculatedAmount !== json.Amount) {
//                 throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
//             }
//             if (json.PromoCode && json.PromoAmount) {
//                 calculatedAmount -= json.PromoAmount;
//                 calculatedAmount = calculatedAmount < 0 ? 0 : calculatedAmount;
//             }
//             calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));
//             if (calculatedAmount !== json.PaidPrice) {
//                 throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
//             }
//         } catch (error) {
//             //console.log(error);
//             return {
//                 statusCode: 409,
//                 headers: {
//                     ...Headers,
//                     Message: error.message
//                 }
//             }
//         }
//         calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));

//         await getStaffCurrentICSchedule(knex, moment(json.DateTime));
//         /**
//          * Handling dispatch for same time and back2back conditions.
//          */
//         for (let prodInc = 0; prodInc < products.length; prodInc++) {
//             const product = products[prodInc];
//             let dispatchId = uuidv4();
//             let prevProdICStaff = null;
//             if (prodInc === 1) {
//                 if (products[0].StaffId && product.SameTime) {
//                     prevProdICStaff = products[0].StaffId;
//                 }
//             }
//             let finalDispatch = await dispatchBooking({
//                 knex,
//                 staffList: product.AvailableStaff,
//                 dispatchId,
//                 productStart: moment(product.StartTime),
//                 productEnd: moment(product.StartTime).add(product.TotalDuration, "minute"),
//                 prevProdICStaff
//             });
//             // //console.log(finalDispatch);
//             switch (finalDispatch.type) {
//                 case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
//                     /**
//                      * Set product dispatch type to direct assignment.
//                      * Assign the staff directly to product.
//                      */
//                     product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
//                     product.DispatchId = null;
//                     product.StaffId = finalDispatch.staffId;
//                     product.StaffEmail = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === finalDispatch.staffId).GoogleEmail;
//                     let staffProductData = await knex(STAFF_PRODUCT)
//                         .select("ProductId", "Rate")
//                         .where("StaffId", "=", product.StaffId)
//                         .andWhere("ProductId", "=", product.ProductId);
//                     let staffRate = staffProductData[0];
//                     product.StaffRate = staffRate.Rate;
//                     break;
//                 }
//                 case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
//                     /**
//                      * Set product dispatch type to direct assignment.
//                      * Set the product dispatch id.
//                      * Send the notification to given staff list.
//                      */
//                     if (finalDispatch.staffList.length) {
//                         product.DispatchType = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
//                         product.DispatchId = dispatchId;
//                         product.DispatchList = finalDispatch.staffList;
//                         product.StaffId = null;
//                     } else {
//                         product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
//                         product.DispatchId = "";
//                         product.DispatchList = [];
//                         product.StaffId = null;
//                     }
//                     break;
//                 }
//                 case PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH: {
//                     /**
//                      * Booking is to be dispatched manually by admin.
//                      * Record already inserted by dispatch function.
//                      * Also no need to send notification to staff.
//                      */
//                     product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
//                     product.DispatchId = dispatchId;
//                     product.DispatchList = finalDispatch.staffList;
//                     product.StaffId = null;
//                     break;
//                 }
//                 default: {
//                     throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
//                 }
//             }
//         }

//         /**
//          * Allocate staff in all products based on available staff.
//          * In case of single product just loop over all staff & check their availability, select the available one.
//          * In case of two products: try to check staff availability based on same index they came from time-slot.
//          * If staff is exhausted then return 410
//          */

//         // for (let staffInc = 0; staffInc < products[0].AvailableStaff.length; staffInc++) {
//         //     const staffOne = products[0].AvailableStaff[staffInc];
//         //     let staffAvailable = false;
//         //     const isStaffAvailable = await staffCheck(knex, {
//         //         StaffId: staffOne.StaffId,
//         //         Duration: products[0].TotalDuration + json.ReachOutTime,
//         //         StartTime: new moment(products[0].StartTime).subtract(products[0].PreparationTime + json.ReachOutTime, "minute").utc().format()
//         //     });
//         //     staffAvailable = isStaffAvailable.IsAvailable;
//         //     if (products.length > 1) {
//         //         const staffTwo = products[1].AvailableStaff[staffInc];
//         //         const isStaffTwoAvailable = await staffCheck(knex, {
//         //             StaffId: staffTwo.StaffId,
//         //             Duration: products[1].TotalDuration + json.ReachOutTime,
//         //             StartTime: new moment(products[1].StartTime).subtract(products[1].PreparationTime + json.ReachOutTime, "minute").utc().format()
//         //         });
//         //         staffAvailable = isStaffTwoAvailable.IsAvailable;
//         //         if (staffAvailable) {
//         //             products.forEach((product, index) => {
//         //                 switch (index) {
//         //                     case 0:
//         //                         product.StaffId = staffOne.StaffId;
//         //                         product.StaffEmail = staffOne.GoogleEmail;
//         //                         break;
//         //                     case 1:
//         //                         product.StaffId = staffTwo.StaffId;
//         //                         product.StaffEmail = staffTwo.GoogleEmail;
//         //                         break;
//         //                 }
//         //             });
//         //             break;
//         //         }
//         //     }
//         //     if (staffAvailable) {
//         //         products[0].StaffId = staffOne.StaffId;
//         //         products[0].StaffEmail = staffOne.GoogleEmail;
//         //         break;
//         //     }
//         // }
//         for (let prodInc = 0; prodInc < products.length; prodInc++) {
//             const product = products[prodInc];
//             // if (!product.StaffId || !product.StaffEmail) {
//             //     return {
//             //         statusCode: 410,
//             //         headers: {
//             //             ...Headers,
//             //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
//             //         }
//             //     }
//             // }
//             if (prodInc === 0) {
//                 totalDuration += product.TotalDuration;
//             } else {
//                 if (product.SameTime) {
//                     if (product.TotalDuration >= products[0].TotalDuration) {
//                         totalDuration = product.TotalDuration;
//                     }
//                 } else if (products[0].StaffId === product.StaffId) {
//                     totalDuration += product.PreparationTime + product.TotalDuration;
//                 } else {
//                     totalDuration += product.TotalDuration;
//                 }
//             }
//         }

//         let drctAssgnStaffNotify = [];

//         if (json.Floor && typeof json.Floor === "string" && json.Floor.length > 30) {
//             json.Floor = json.Floor.substr(0, 30);
//         }

//         let bookingFirstProTime = getBookingStartTime(products);
//         STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);
//         const dataSubmit = {
//             BookingProvider: parseInt(process.env.BOOKING_PROVIDER_APP),
//             UserId,
//             Street: json.Street,
//             HouseNumber: json.HouseNumber,
//             Floor: json.Floor ? json.Floor : null,
//             City: json.City ? json.City : null,
//             Zip: json.Zip ? json.Zip : null,
//             Elevator: json.Elevator ? 1 : 0,
//             Amount: json.Amount,
//             Duration: totalDuration,
//             DateTime: moment(bookingFirstProTime).toDate(),
//             ReachOutTime: json.ReachOutTime,
//             PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
//             AGPromoCodeId: null,
//             PromoCode: json.PromoCode ? json.PromoCode : null,
//             PromoAmount: json.PromoAmount ? json.PromoAmount : null,
//             PaidPrice: json.PaidPrice,
//             PaymentStatus: json.PaidPrice === 0 ? BOOKING_PAYMENT_STATUS.NOT_REQUIRED : BOOKING_PAYMENT_STATUS.INITIATED,
//             TransactionId: null,                                        //updated after successfull payment
//             TransactionDate: null,                                      //updated after successfull payment
//             Status: json.PaidPrice === 0 ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.TEMP_BOOKING,
//             PredecessorBookingId: null,
//             SuccessorBookingId: null,
//             SystemPhase: SYSTEM_PHASE.PHASE_TWO,
//             Deleted: 0,
//             ...zone.getCreateUpdate()
//         };
//         //console.log("dataSubmit");
//         //console.log(dataSubmit);
//         let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
//         if (bookingResult.length === 0) {
//             throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
//         }
//         let bookingInserted = bookingResult[0];                         //now we have BookingId for further operations
//         bookingCreatedId = bookingInserted;
//         let autoDispatchNotifyStaff = [];
//         let promoExist=[]
//         let discountToValidate=0
//         let totalAmountByCategory=0
//         if (json.PromoCodeId) {
//              promoExist = await knex(PROMOCODES).select("*").where("PromoCodeId", "=", json.PromoCodeId);
//             if (promoExist.length > 0) {
//                 let promoCountInc = await knex(PROMOCODES)
//                     .update({
//                         CurrentCount: promoExist[0].CurrentCount + 1,
//                         LastUpdated: zone.getLastUpdate()
//                     })
//                     .where("PromoCodeId", "=", json.PromoCodeId)
//                 let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
//                 console.log("promoCats")
//                 console.log(promoCats)
//                 console.log("promoExist[0].Type")
//                 console.log(promoExist[0])
//                 if(promoExist[0].Type==1){
                    
//                     for (let index = 0; index < products.length; index++) {
//                         let product = products[index];
    
//                         let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
//                         console.log("catFound")
//                          console.log(catFound)
//                          console.log("totalAmountByCategory1",totalAmountByCategory)
                         
//                         if(catFound){
//                             totalAmountByCategory+=product.Amount
//                             if (product.AddOns.length > 0) {
//                                 let AddOns = product.AddOns;
//                                 for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
//                                     const addOn = AddOns[addOnIndex];
//                                     totalAmountByCategory+=addOn.Amount
//                                     console.log("totalAmountByCategory2",totalAmountByCategory)
//                             }
//                         }
                        
//                     }
//                     console.log("totalAmountByCategory3",totalAmountByCategory)
//                     discountToValidate=totalAmountByCategory;
//                     switch(promoExist[0].Mode){
//                       case 0:
//                         discount=(promoExist[0].Value*totalAmountByCategory)/100;
//                         break;
//                       case 1:
//                         discount=promoExist[0].Value;
//                         break;
//                       default:
//                         discount=promoExist[0].Value
//                         break;
                
//                     }
                        
//                 }
//                 }
               
                
           
//         }
//     }


//         for (let index = 0; index < products.length; index++) {
//             let product = products[index];
//             let guestInsert;
//             if (product.Guest) {
//                 let guest = product.Guest;
//                 guestInsert = await knex(GUESTS)
//                     .insert({
//                         UserId,
//                         BookingId: bookingInserted,
//                         ...guest,
//                         ...zone.getCreateUpdate()
//                     })
//             }
            
//             let totalProdAmount=product.Amount
//             let productInserted  = await knex(BOOKING_PRODUCTS)
//                 .insert({
//                     BookingId: bookingInserted,
//                     Product: product.Name,
//                     ProductId: product.ProductId,
//                     CategoryId: product.CategoryId,
//                     Duration: product.Duration,
//                     Amount: product.Amount,
//                     PreparationTime: product.PreparationTime,
//                     StaffId: product.StaffId ? product.StaffId : null,
//                     UserId: !product.Guest ? UserId : null,
//                     GuestId: product.Guest ? guestInsert[0] : null,
//                     SameTime: product.SameTime,
//                     StartTime: new moment(product.StartTime).toDate(),
//                     Therapist: product.Therapist,
//                     ForceStaffAllot: 0,
//                     Status: 0,
//                     DispatchType: product.DispatchType,
//                     DispatchId: product.DispatchId,
//                     StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
//                     ...zone.getCreateUpdate()
//                 });
//             let bookingProductId = productInserted[0];

//             if (
//                 product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH ||
//                 product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH
//             ) {
//                 // Insert the staffList to dispatch and save this staff for automatic dispatch notification.
//                 let productDispatchList = [];
//                 product.DispatchList.forEach(staff => {
//                     productDispatchList.push({
//                         DispatchId: product.DispatchId,
//                         StaffId: staff.StaffId,
//                         Status: DISPATCH_STATUS.READY_TO_DISPATCH,
//                         ...zone.getCreateUpdate()
//                     });
//                     if (product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH) {
//                         let stFound = STAFF_CURRENT_SCHEDULE.find(sts => sts.StaffId === staff.StaffId);
//                         autoDispatchNotifyStaff.push({
//                             StaffId: stFound.StaffId,
//                             FcmToken: stFound.FcmToken,
//                             DateTime: product.StartTime,
//                             DispatchId: product.DispatchId
//                         });
//                     }
//                 });
//                 let insertedDispatchList = await knex(BOOKING_PRODUCT_DISPATCH).insert(productDispatchList);
//             }

//             if (product.Extras && product.Extras.length > 0) {
//                 for (let extInc = 0; extInc < product.Extras.length; extInc++) {
//                     const extra = product.Extras[extInc];
//                     let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
//                         .insert({
//                             BookingProductId: bookingProductId,
//                             ExtraTitle: extra.ExtraTitle,
//                             ExtraValue: extra.ExtraValue,
//                             ...zone.getCreateUpdate()
//                         })

//                 }
//             }

//             if (product.AddOns.length > 0) {
//                 let AddOns = product.AddOns;
//                 for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
//                     const addOn = AddOns[addOnIndex];
//                     totalProdAmount+=addOn.Amount
//                     let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
//                         .insert({
//                             BookingId: bookingInserted,
//                             BookingProductId: bookingProductId,
//                             AddOnId: addOn.AddOnId,
//                             AddOn: addOn.Name,
//                             Duration: addOn.Duration,
//                             Amount: addOn.Amount,
//                             BookingAddOnPaymentId: null,
//                             StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
//                             ...zone.getCreateUpdate()
//                         })
//                 }
//             }
//             let ProdDiscountedAmount=totalProdAmount
//             let ProdDiscounted=0
//             if(promoExist.length > 0){
//                 ProdDiscountedAmount=totalProdAmount
//                 ProdDiscounted=0
//                 if(promoExist[0].Type==0){
//                     //console.log("booking")
//                      ProdDiscountedAmount=totalProdAmount
//                      ProdDiscounted=0
//                 }else{
//                     let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
//                     let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
//                     if(catFound){
//                         let PromoAmount=json.PromoAmount
//                         if (promoExist[0].Mode == 0 && json.PromoAmount==discountToValidate) {
//                             //percent
//                             //console.log("cat per")
//                             let prodAmt = totalProdAmount
//                             let prodDiscount = (promoExist[0].Value * prodAmt) / 100;
//                             let prodDiscountedAmount = prodAmt - prodDiscount
//                             ProdDiscountedAmount=prodDiscountedAmount
//                             ProdDiscounted=prodDiscount
//                         } else {
//                             //fix
//                             console.log("cat fix")
//                             console.log(totalAmountByCategory)
//                             console.log("json.PromoAmount",json.PromoAmount)
//                             console.log("totalProdAmount",totalProdAmount)
                            

//                             let discountInPercent = (json.PromoAmount / totalAmountByCategory) * 100
//                             let prodAmt = totalProdAmount
//                             let prodDiscount = (discountInPercent * prodAmt) / 100;
//                             let prodDiscountedAmount = prodAmt - prodDiscount
//                             console.log("prodDiscount",prodDiscount)
//                             console.log("prodDiscountedAmount",prodDiscountedAmount)
//                             //console.log("prodAmt"+prodAmt)
//                             //console.log("prodDiscountedAmount"+prodDiscountedAmount)
//                             //console.log("prodDiscount"+prodDiscount)
//                             ProdDiscountedAmount=prodDiscountedAmount
//                             ProdDiscounted=prodDiscount
//                         }
//                     }else{
//                         //console.log("no promo on cat")
//                          ProdDiscountedAmount=totalProdAmount
//                          ProdDiscounted=0
//                     }

//                 }
                
            

//             }else{
//                 //console.log("else")
//                 ProdDiscountedAmount=totalProdAmount
//                 ProdDiscounted=0
//             }
//             const discountAmountUpdated = await knex(BOOKING_PRODUCTS)
//                 .where("BookingProductId", bookingProductId)
//                 .update({
//                     DiscountedAmount: ProdDiscountedAmount,
//                     Discount: ProdDiscounted
//                 })
//                 .modify(function (queryBuilder) {
//                     console.log(queryBuilder.toSQL().toNative())
                    
//                 });
//                 //console.log("amtUp"+discountAmountUpdated)
//         }

//             if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
//                 // Events configuration
//                 if (index === 0) {
//                     let startTime = new moment(product.StartTime).utc();
//                     let endTime = new moment(product.StartTime).utc();
//                     endTime.add(product.TotalDuration, "minute");
//                     let eventObj = {
//                         StaffId: product.StaffId,
//                         start: {
//                             dateTime: startTime.toDate(),
//                             timeZone: process.env.TIME_ZONE
//                         },
//                         end: {
//                             dateTime: endTime.toDate(),
//                             timeZone: process.env.TIME_ZONE
//                         },
//                         attendees: [
//                             { email: process.env.EMAIL },
//                             { email: product.StaffEmail }
//                         ],
//                         Products: [product.Name + " (" + product.TotalDuration + " mins)"],
//                         BookingProductId: [bookingProductId],
//                         extendedProperties: {
//                             shared: {
//                                 'BookingId': bookingInserted,
//                                 'ReachOutTime': json.ReachOutTime + product.PreparationTime,
//                                 'ReturnTime': json.ReachOutTime
//                             }
//                         }
//                     }
//                     eventsData.push(eventObj);
//                 } else {
//                     let found = eventsData.find(sta => sta.StaffId === product.StaffId);        //create staff entry for events if not exists already
//                     if (found) {
//                         found.end.dateTime = new moment(found.end.dateTime)
//                             .add(product.PreparationTime + product.TotalDuration, "minute").toDate();
//                         found.Products.push(product.Name + " (" + product.TotalDuration + " mins)")
//                         found.BookingProductId.push(bookingProductId);
//                     } else {
//                         let startTime = new moment(product.StartTime).utc();
//                         let endTime = new moment(product.StartTime).utc();
//                         endTime.add(product.TotalDuration, "minute");
//                         let eventObj = {
//                             StaffId: product.StaffId,
//                             start: {
//                                 dateTime: startTime,
//                                 timeZone: process.env.TIME_ZONE
//                             },
//                             end: {
//                                 dateTime: endTime,
//                                 timeZone: process.env.TIME_ZONE
//                             },
//                             attendees: [
//                                 { email: process.env.EMAIL },
//                                 { email: product.StaffEmail }
//                             ],
//                             Products: [product.Name + " (" + product.TotalDuration + " mins)"],
//                             BookingProductId: [bookingProductId],
//                             extendedProperties: {
//                                 shared: {
//                                     'BookingId': bookingInserted,
//                                     'ReachOutTime': json.ReachOutTime + product.PreparationTime,
//                                     'ReturnTime': json.ReachOutTime
//                                 }
//                             }
//                         }
//                         eventsData.push(eventObj);
//                     }
//                 }

//                 // Push configuration
//                 const pushStaffFound = drctAssgnStaffNotify.find(f => f.StaffId === product.StaffId);
//                 if (!pushStaffFound) {
//                     // let staffFcmToken = await knex(STAFF)
//                     //     .select("StaffId", "FcmToken")
//                     //     .where("StaffId", "=", product.StaffId);
//                     // let staffData = staffFcmToken[0];
//                     // let pushStaffObj = {
//                     //     StaffId: staffData.StaffId,
//                     //     FcmToken: staffData.FcmToken,
//                     //     DateTime: product.StartTime
//                     // }
//                     // staffPushNotify.push(pushStaffObj);
//                     let staffFcm = STAFF_CURRENT_SCHEDULE.find(st => st.StaffId === product.StaffId);
//                     let pushStaffObj = {
//                         StaffId: staffFcm.StaffId,
//                         FcmToken: staffFcm.FcmToken,
//                         DateTime: product.StartTime
//                     }
//                     drctAssgnStaffNotify.push(pushStaffObj);
//                 }
//             }
        
        

//         const userExist = userData[0];
//         // Generate Events on google calendar
//         let finalEvents = [];
//         eventsData.forEach(config => {
//             let description = config.Products.toString();
//             finalEvents.push({
//                 ...config,
//                 summary: userExist.Name + ", Booking #" + bookingInserted,
//                 description
//             })
//         });
// // commenting code for new stripe approach
//         // for (let ev = 0; ev < finalEvents.length; ev++) {
//         //     const event = finalEvents[ev];
//         //     delete event.StaffId;
//         //     const inserted = await calendar.events.insert({
//         //         auth: oAuth2Client,
//         //         calendarId: "primary",
//         //         resource: event
//         //     });
//         //     const eventInserted = await knex(BOOKING_PRODUCTS)
//         //         .whereIn("BookingProductId", event.BookingProductId)
//         //         .update({
//         //             EventId: inserted.data.id,
//         //             LastUpdated: zone.getLastUpdate()
//         //         })
//         //     eventsCreated.push(inserted.data.id);
//         // }

//         // var bookingData;

//         if (json.PaidPrice > 0) {

//             // Initiate payment procedure.
//             let stripeAmount = Math.round(calculatedAmount * 100);
//             //console.log(`stripeAmount: ${stripeAmount}`);
//             let description = "Cocon Booking #" + bookingInserted + ", Products: " + productNames.toString();
//             let customer_id = userExist.CustomerId;
//             let customerEmail = userExist.Email;
//             let isCreated = false;
//             let customerDataArray;
//             if (!customer_id) {
//                 let customerData = await createStripeCustomer(stripe, userExist, knex);
//                 //console.log(customerData);
//                 customer_id = customerData.id;
//                 isCreated = true;
//                 customerDataArray=customerData
//             }
//             try {
//                 if (!isCreated) {
//                     const customerExist = await stripe.customers.retrieve(customer_id);
//                     //console.log(customerExist)
//                     customer_id = customerExist.id;
//                     customerDataArray=customerExist
//                 }
//             } catch (error) {
//                 //console.log(error);
//                 let customerData = await createStripeCustomer(stripe, userExist, knex);
//                 customerDataArray=customerData
//                 //console.log(customerData)
//                 customer_id = customerData.id;
//             }
//             let paymentIntent;
//             let EphemeralKey = await stripe.ephemeralKeys.create(
//                 {customer:customer_id},
//                 {apiVersion:'2020-08-27'})
//             if (json.SaveCard) {
//                 paymentIntent = await stripe.paymentIntents.create({
//                     amount: stripeAmount,
//                     currency: CURRENCY_CODE,
//                     customer: customer_id,
//                     description,
//                     metadata: {
//                         "BookingId": bookingInserted
//                     },
//                     receipt_email: customerEmail,
//                     // setup_future_usage: 'on_session',
//                     payment_method_types: ['card','ideal']
//                 });
//             } else {
//                 paymentIntent = await stripe.paymentIntents.create({
//                     amount: stripeAmount,
//                     currency: CURRENCY_CODE,
//                     customer: customer_id,
//                     description,
//                     metadata: {
//                         "BookingId": bookingInserted
//                     },
//                     receipt_email: customerEmail,
//                     payment_method_types: ['card','ideal']
//                 });
//             }
//             //console.log(paymentIntent);
//             // commenting code for new stripe apporach
//             // let bookingIntentInsert = await knex(BOOKINGS).where("BookingId", "=", bookingInserted)
//             //     .update({
//             //         PaymentIntent: paymentIntent.id
//             //     })

//             // if (json.PaymentMethod === 1) {
//             //     const paymentMethod = await stripe.paymentMethods.create({
//             //         type: "ideal",
//             //         ideal: {
//             //             bank: json.BankKey
//             //         }
//             //     })
//             //     bookingData = {
//             //         BookingId: bookingInserted,
//             //         ClientSecret: paymentIntent.client_secret,
//             //         PaymentMethod: paymentMethod
//             //     }
//             // } else {
//             //     bookingData = {
//             //         BookingId: bookingInserted,
//             //         ClientSecret: paymentIntent.client_secret
//             //     }
//             // }
//             bookingData = {
//                         BookingId: bookingInserted,
//                         ClientSecret: paymentIntent.client_secret,
//                         PaymentIntent: paymentIntent,
//                         Customer: customerDataArray,
//                         EphemeralKey:EphemeralKey
//                     }
//         } else {
//             bookingData = {
//                 BookingId: bookingInserted
//             }
//             try {
//                 let lambda = new AWS.Lambda();
//                 let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
//                 lambda.invoke({
//                     FunctionName: lambdaName,
//                     InvocationType: 'Event',
//                     LogType: 'Tail',
//                     Payload: JSON.stringify({
//                         Type: 0,
//                         BookingId: bookingInserted
//                     })
//                 }, function (err, data) {
//                     if (err) {
//                         //console.log(err);
//                     } else {
//                         //console.log('Lambda_B said ' + data.Payload);
//                     }
//                 });

//                 // send booking confirmation email
//                 let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
//                 lambda.invoke({
//                     FunctionName: bookingNotifier,
//                     InvocationType: 'Event',
//                     LogType: 'Tail',
//                     Payload: JSON.stringify({
//                         BookingId: bookingInserted
//                     })
//                 }, function (err, data) {
//                     if (err) {
//                         //console.log(err);
//                     } else {
//                         //console.log('Lambda_B said ' + data.Payload);
//                     }
//                 });

//                 await holdfor10secs();
//                 // //console.log(caller);
//                 //console.log("after lambda hit");
//             } catch (error) {
//                 //console.log(error)
//             }
//         }

//         // coomenting code for Auto generate remaining amount promo code as per new strippe approach
//         try {
//             if (json.PromoCodeId && json.RemainingAmount) {
//                 /**
//                  * 1. Generate a random name for AG promo.
//                  * 2. Generate the promo code with class AG
//                  * 3. send push notification to user
//                  * 4. create a user specific message
//                  */
//                 let remAmount = Math.round(json.RemainingAmount);
//                 let promoExistData = await knex(PROMOCODES)
//                     .select("PromoCodeId", "Type", "StartDate", "EndDate", "MinPurchaseAmount")
//                     .where("PromoCodeId", "=", json.PromoCodeId);
//                 let promoExistDetail = promoExistData.length > 0 ? promoExistData[0] : null;
//                 if (remAmount >= parseInt(process.env.MIN_REMAINING_VALUE) && promoExistDetail) {
//                     let codeName = null;
//                     for (let chNamInc = 0; chNamInc < 5; chNamInc++) {
//                         let newName = makeid(7);
//                         let exist = await knex(PROMOCODES).select("PromoCodeId").where("Code", "=", newName);
//                         if (exist.length === 0) {
//                             codeName = newName;
//                             break;
//                         }
//                     }
//                     if (codeName) {
//                         let promoIns = {
//                             Code: codeName,
//                             Type: promoExistDetail.Type,
//                             Mode: 1,
//                             StartDate: moment(promoExistDetail.StartDate).toDate(),
//                             EndDate: moment(promoExistDetail.EndDate).toDate(),
//                             Value: remAmount,
//                             MaxAmount: remAmount,
//                             MinPurchaseAmount: 5,
//                             Class: 1,
//                             RedeemCount: 1,
//                             CurrentCount: 0,
//                             Status:PROMO_STATUS.TEMP,
//                             ...zone.getCreateUpdate()
//                         }
//                         let promoInserted = await knex(PROMOCODES).insert(promoIns);
//                         agPromoId = promoInserted[0];
//                         let bookingAgPUp = await knex(BOOKINGS).where("BookingId", "=", bookingInserted).update({
//                             AGPromoCodeId: promoInserted[0]
//                         })
//                         if (promoIns.Type === 1) {
//                             let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
//                             for (let catInc = 0; catInc < promoCats.length; catInc++) {
//                                 let category = promoCats[catInc];
//                                 let obj = {
//                                     PromoCodeId: promoInserted[0],
//                                     CategoryId: category.CategoryId,
//                                     ...zone.getCreateUpdate()
//                                 }
//                                 let catInserted = await knex(PROMOCODE_CATEGORIES).insert(obj);
//                             }
//                         }
//                         /**
//                          * send ag promo push if any
//                          */
//                         if (json.PaidPrice === 0) {
//                             try {
//                                 // let title = `New promo code received`;
//                                 let title = PUSH.TITLE.AG_PROMO_RECEIVED;
//                                 let description = `New promo code: ${codeName} of amount €${remAmount} valid till ${momentz.tz(promoIns.EndDate, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DDC_YYYY + " z")}`;
//                                 let token = userExist.FcmToken ? userExist.FcmToken : null;
//                                 const msgInsert = await knex(USER_MESSAGES).insert({
//                                     UserId: userExist.UserId,
//                                     Title: title,
//                                     Description: description,
//                                     ImagePath: null,
//                                     Date: moment().toDate(),
//                                     ...zone.getCreateUpdate()
//                                 })
//                                 if (token) {
//                                     const message = {
//                                         token,
//                                         notification: {
//                                             title: title,
//                                             body: description
//                                         },
//                                         data: {
//                                             ScreenName: PUSH.SCREEN.MESSAGES
//                                         }
//                                     }
//                                     try {
//                                         const userApp = InitializeFirebase();
//                                         const sentNotification = await userApp.messaging().send(message);
//                                         //console.log(sentNotification)
//                                     } catch (error) {
//                                         //console.log(error);
//                                     }
//                                 }
//                             } catch (error) {
//                                 //console.log(error);
//                             }
//                         }
//                     }
//                 }

//             }
//         } catch (error) {
//             //console.log(error);
//         }

//         //console.log("drctAssgnStaffNotify");
//         //console.log(drctAssgnStaffNotify);
//         // send push notification to staff - For direct assignment.
//          // commenting code as per new strippe approach
//         // for (let pushInc = 0; pushInc < drctAssgnStaffNotify.length; pushInc++) {
//         //     try {
//         //         const element = drctAssgnStaffNotify[pushInc];
//         //         let title = `New booking #${bookingInserted} received`;
//         //         let description = `You have been allotted a new booking, scheduled on ${momentz.tz(element.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " z")}`;
//         //         // insert staff specific message in DB
//         //         const msgInsert = await knex(STAFF_MESSAGES).insert({
//         //             StaffId: element.StaffId,
//         //             Title: title,
//         //             Description: description,
//         //             ImagePath: null,
//         //             Date: moment().toDate(),
//         //             ...zone.getCreateUpdate()
//         //         })
//         //         if (element.FcmToken) {
//         //             const message = {
//         //                 token: element.FcmToken,
//         //                 notification: {
//         //                     title,
//         //                     body: description
//         //                 },
//         //                 data: {
//         //                     BookingId: `${bookingInserted}`,
//         //                     DateTime: moment(element.DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
//         //                     ScreenName: PUSH.SCREEN.BOOKINGS,
//         //                     TimeZone: process.env.STAFF_ZONE
//         //                 }
//         //             }
//         //             //console.log(message);
//         //             const therapistApp = InitializeFirebaseTherapist();
//         //             const sentNotifications = await therapistApp.messaging().send(message);
//         //             //console.log(sentNotifications)
//         //         }
//         //     } catch (error) {
//         //         //console.log(error)
//         //     }
//         // }

//         /**
//          * The dispatch notification should be in different lambda 
//          * Because it might take time to send notification to all available staff
//          */
//         // let notifierLambda = new aws.Lambda(); 
//         // notifierLambda.invoke({
//         //     FunctionName: "autoDispatchNotifier",
//         //     InvocationType: "Event",
//         //     Payload: autoDispatchNotifyStaff
//         // }, function (err, data) {
//         //     //console.log(data);
//         // })
//         let markToDispatched = [];
//         for (let dispInc = 0; dispInc < autoDispatchNotifyStaff.length; dispInc++) {
//             const staff = autoDispatchNotifyStaff[dispInc];
//             let dispatchFound = markToDispatched.find(f => f === staff.DispatchId);
//             if (!dispatchFound) {
//                 markToDispatched.push(staff.DispatchId);
//             }
//         }
//         if (markToDispatched.length) {
//             let marked = await knex(BOOKING_PRODUCT_DISPATCH)
//                 .whereIn("DispatchId", markToDispatched)
//                 .update({
//                     Status: DISPATCH_STATUS.DISPATCHED
//                 })
//         }
//         await knex.destroy();
//         // for (let pushInc = 0; pushInc < autoDispatchNotifyStaff.length; pushInc++) {
//         //     try {
//         //         const element = autoDispatchNotifyStaff[pushInc];
//         //         if (element.FcmToken) {
//         //             let title = `You have a booking offer.`;
//         //             let description = `You have got a new booking request for ${moment(element.DateTime).utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm)}`;
//         //             const message = {
//         //                 token: element.FcmToken,
//         //                 notification: {
//         //                     title,
//         //                     body: description
//         //                 },
//         //                 data: {
//         //                     BookingId: `${bookingInserted}`,
//         //                     ScreenName: PUSH.SCREEN.INCOMING_REQUEST
//         //                 }
//         //             }
//         //             //console.log(message);
//         //             const therapistApp = InitializeFirebaseTherapist();
//         //             const sentNotifications = await therapistApp.messaging().send(message);
//         //             //console.log(sentNotifications)
//         //         }
//         //     } catch (error) {
//         //         //console.log(error)
//         //     }
//         // }

//         // send notification for automatic dispatch
//     } catch (error) {
//         //console.log(error);
//         /**
//          * Rollback the booking by updating status'
//          * 1. Booking status: CANCELLED
//          * 2. Payment status: FAILED
//          * 3. Delete the events if generated already
//          * 4. Delete the auto generated promo if already created.
//          */
//         if (bookingCreatedId) {
//             //console.log("rollback initiated");
//             let bookingRollbObj = {
//                 Status: BOOKING_STATUS.CANCELLED,
//                 PaymentStatus: BOOKING_PAYMENT_STATUS.FAILED,
//                 LastUpdated: zone.getLastUpdate()
//             }
//             let bookingRollbacked = await knex(BOOKINGS)
//                 .where("BookingId", "=", bookingCreatedId)
//                 .update(bookingRollbObj);
//             for (let evInc = 0; evInc < eventsCreated.length; evInc++) {
//                 let eventId = eventsCreated[evInc];
//                 //console.log(`EventId: ${eventId}`)
//                 try {
//                     await calendar.events.delete({
//                         calendarId: 'primary',
//                         auth: oAuth2Client,
//                         eventId: eventId
//                     });
//                 } catch (error) {
//                     // event might be already deleted
//                     //console.log(error.message);
//                 }
//             }
//             if (agPromoId) {
//                 let agPromoDeleted = await knex(PROMOCODES).where("PromoCodeId", "=", agPromoId).del();
//                 let agPromoCatDeleted = await knex(PROMOCODE_CATEGORIES).where("PromoCodeId", "=", agPromoId).del();
//             }
//         } else {
//             //console.log("rollback not required");
//         }
//         if (connected) {
//             await knex.destroy();
//         }
//         return {
//             statusCode: 400,
//             headers: {
//                 ...Headers,
//                 Message: error.message
//             }
//         }
//     }

//     //console.log(bookingData);
//     return {
//         statusCode: 200,
//         headers: {
//             ...Headers,
//             Message: MESSAGE.BOOKING_SAVE_SUCCESS
//         },
//         body: setPayloadData(event, {
//             Data: bookingData
//         })
//     }
// }

module.exports.saveTempBooking = async event => {
    let eventsCreated = [];
    let agPromoId = null;
    let bookingCreatedId = null;
    let knex, connected = false, bookingData;
    try {
        const headers = event.headers;
        // //console.log(headers);
        let isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        // let tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        // if (tokenValid.statusCode !== 200) {
        //     return {
        //         statusCode: tokenValid.statusCode,
        //         headers: {
        //             ...Headers,
        //             message: tokenValid.message
        //         }
        //     }
        // }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json.UserId || typeof json.UserId !== "number" ||
            !json.Street || typeof json.Street !== "string" ||
            // !json.HouseNumber || typeof json.HouseNumber !== "string" ||
            !json.Amount || typeof json.Amount !== "number" ||
            !json.DateTime || typeof json.DateTime !== "string" ||
            typeof json.PaidPrice !== "number" || json.PaidPrice < 0 ||
            !json.Products || typeof json.Products !== 'object' ||
            json.ReachOutTime== null || json.ReachOutTime==undefined || typeof json.ReachOutTime !== "number" ||
            json.Products.length === 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        if (
            headers['platform'] === "ios" &&
            compareVersions.compare(event.headers['api-version'], '1.4.8', '>')
        ) {
            if (json.Zip) {
                let ServiceZipcode = await knex(SERVICE_ZIPCODE).select('ServiceZipCodeId', 'Zipcode');

                let serviceZipFound = ServiceZipcode.findIndex(f => json.Zip.toLowerCase().replace(/ /g, '').includes(f.Zipcode.toLowerCase().replace(/ /g, '')));
                if (serviceZipFound == -1) {
                    return {
                        statusCode: 406,
                        headers: {
                            ...Headers,
                            Message: MESSAGE.ZIP_INVALID,
                        }
                    }
                }
            }
        }
        if (
            headers['platform'] === "android" &&
            compareVersions.compare(event.headers['api-version'], '1.4.9', '>')
        ) {
            if (json.Zip) {
                let ServiceZipcode = await knex(SERVICE_ZIPCODE).select('ServiceZipCodeId', 'Zipcode');

                let serviceZipFound = ServiceZipcode.findIndex(f => json.Zip.toLowerCase().replace(/ /g, '').includes(f.Zipcode.toLowerCase().replace(/ /g, '')));
                if (serviceZipFound == -1) {
                    return {
                        statusCode: 406,
                        headers: {
                            ...Headers,
                            Message: MESSAGE.ZIP_INVALID,
                        }
                    }
                }
            }

        }
        
        

        if (json.PaidPrice > 0) {
            // if (
            //     json.PaymentMethod < 0 || typeof json.PaymentMethod !== "number" ||
            //     json.PaymentMethod > 1
            // ) {
            //     throw new Error(MESSAGE.REQ_DATA_ERROR);
            // }
            // if (json.PaymentMethod === 1 && !json.BankKey) {
            //     throw new Error(MESSAGE.REQ_DATA_ERROR);
            // }
        }

        let reminder = 0
        if(json.ReachOutTime>0)
        {json.ReachOutTime % 5;}
        if (reminder > 0) {
            let toAdd = 5 - reminder;
            json.ReachOutTime += toAdd;
        }

        // if (json.PromoCodeId && (!json.PromoCode || !json.PromoAmount)) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
        let dateTime = moment(json.DateTime).utc().toDate();
        const UserId = json.UserId;
        let products = [];
        products = json.Products;
        let eventsData = [];
        let productNames = [];
        let productToFetch = [];
        let addOnToFetch = [];

        // Validate each product configuration
        STAFF_CURRENT_SCHEDULE = [];
        products.forEach((product) => {
            if (
                !product.ProductId || typeof product.ProductId !== "number" ||
                !product.CategoryId || typeof product.CategoryId !== "number" ||
                !product.Name || typeof product.Name !== "string" ||
                !product.StartTime || typeof product.StartTime !== "string" ||
                !product.Duration || typeof product.Duration !== "number" ||
                !product.Amount || typeof product.Amount !== "number" ||
                !product.AvailableStaff || typeof product.AvailableStaff !== "object" ||
                product.AvailableStaff.length <= 0 ||
                typeof product.Therapist !== "number" ||
                product.Therapist < 0 || product.Therapist > 2
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            const found = productToFetch.find(f => f === product.ProductId);
            if (!found) {
                productToFetch.push(product.ProductId)
            }
            product.AvailableStaff.forEach(staff => {
                if (!staff.StaffId || !staff.GoogleEmail) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                let staffFound = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === staff.StaffId);
                if (!staffFound) {
                    STAFF_CURRENT_SCHEDULE.push({
                        StaffId: staff.StaffId,
                        GoogleEmail: staff.GoogleEmail
                    })
                }
            });
            if (product.AddOns.length > 0) {
                product.AddOns.forEach(addOn => {
                    if (!addOn.AddOnId || !addOn.Name || !addOn.Duration || !addOn.Amount) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                    const found = addOnToFetch.find(f => f === addOn.AddOnId);
                    if (!found) {
                        addOnToFetch.push(addOn.AddOnId);
                    }
                });
            }
            if (product.Guest) {
                if (!product.Guest.Name || !product.Guest.Contact) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            }
            productNames.push(product.Name);
        });

       
        const userData = await knex(USERS)
            .select("UserId", "Email", "Name", "CustomerId", "ReachOutTime", "FcmToken")
            .where("UserId", "=", UserId);
        if (userData.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_EXIST);
        }
        let totalDuration = 0;
        // Check amount accuracy and product/add-on configuration
        let calculatedAmount = 0;
        try {
            let proDurationFetched = await knex
                .select(
                    PRODUCTS + ".ProductId",
                    PRODUCTS + ".PreparationTime",
                    PRODUCT_DURATIONS + ".Duration",
                    PRODUCT_DURATIONS + ".Amount"
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + ".ProductId", PRODUCTS + ".ProductId")
                .whereIn(PRODUCTS + ".ProductId", productToFetch)
                .andWhere(PRODUCTS + ".Deleted", "=", 0)
            let addOnFetched = await knex(ADDONS)
                .select("AddOnId", "Duration", "Amount")
                .whereIn("AddOnId", addOnToFetch)
                .andWhere("Deleted", "=", 0);
            products.forEach((product, index) => {
                const found = proDurationFetched.find(f => f.ProductId === product.ProductId && f.Duration === product.Duration);
                if (!found || found.Amount !== product.Amount) {
                    throw new Error(MESSAGE.INVALID_PRODUCT_CONFIG);
                }
                product.TotalDuration = found.Duration;
                product.TotalAmount = found.Amount;
                calculatedAmount += found.Amount;
                product.AddOns.forEach(addOn => {
                    const found = addOnFetched.find(f => f.AddOnId === addOn.AddOnId);
                    if (!found || found.Duration !== addOn.Duration || found.Amount !== addOn.Amount) {
                        throw new Error(MESSAGE.INVALID_ADDON_CONFIG);
                    }
                    calculatedAmount += found.Amount;
                    product.TotalDuration += found.Duration;
                    product.TotalAmount += found.Amount;
                });
                product.PreparationTime = found.PreparationTime;
            });
            if (calculatedAmount !== json.Amount) {
                throw new Error(MESSAGE.INVALID_BOOKING_AMOUNT);
            }
            if (json.PromoCode && json.PromoAmount) {
                calculatedAmount -= json.PromoAmount;
                calculatedAmount = calculatedAmount < 0 ? 0 : calculatedAmount;
            }
            calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));
            if (calculatedAmount !== json.PaidPrice) {
                throw new Error(MESSAGE.INVALID_BOOK_PAID_AMOUNT);
            }
        } catch (error) {
            //console.log(error);
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: error.message
                }
            }
        }
        calculatedAmount = Number.parseFloat(Number(calculatedAmount).toFixed(2));

        await getStaffCurrentICSchedule(knex, moment(json.DateTime));
        /**
         * Handling dispatch for same time and back2back conditions.
         */
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            let dispatchId = uuidv4();
            let prevProdICStaff = null;
            if (prodInc === 1) {
                if (products[0].StaffId && product.SameTime) {
                    prevProdICStaff = products[0].StaffId;
                }
            }
            let finalDispatch = await dispatchBooking({
                knex,
                staffList: product.AvailableStaff,
                dispatchId,
                productStart: moment(product.StartTime),
                productEnd: moment(product.StartTime).add(product.TotalDuration, "minute"),
                prevProdICStaff
            });
            // //console.log(finalDispatch);
            switch (finalDispatch.type) {
                case PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT: {
                    /**
                     * Set product dispatch type to direct assignment.
                     * Assign the staff directly to product.
                     */
                    product.DispatchType = PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT;
                    product.DispatchId = null;
                    product.StaffId = finalDispatch.staffId;
                    product.StaffEmail = STAFF_CURRENT_SCHEDULE.find(f => f.StaffId === finalDispatch.staffId).GoogleEmail;
                    let staffProductData = await knex(STAFF_PRODUCT)
                        .select("ProductId", "Rate")
                        .where("StaffId", "=", product.StaffId)
                        .andWhere("ProductId", "=", product.ProductId);
                    let staffRate = staffProductData[0];
                    product.StaffRate = staffRate.Rate;
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH: {
                    /**
                     * Set product dispatch type to direct assignment.
                     * Set the product dispatch id.
                     * Send the notification to given staff list.
                     */
                    if (finalDispatch.staffList.length) {
                        product.DispatchType = PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH;
                        product.DispatchId = dispatchId;
                        product.DispatchList = finalDispatch.staffList;
                        product.StaffId = null;
                    } else {
                        product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
                        product.DispatchId = "";
                        product.DispatchList = [];
                        product.StaffId = null;
                    }
                    break;
                }
                case PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH: {
                    /**
                     * Booking is to be dispatched manually by admin.
                     * Record already inserted by dispatch function.
                     * Also no need to send notification to staff.
                     */
                    product.DispatchType = PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH;
                    product.DispatchId = dispatchId;
                    product.DispatchList = finalDispatch.staffList;
                    product.StaffId = null;
                    break;
                }
                default: {
                    throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
                }
            }
        }

        /**
         * Allocate staff in all products based on available staff.
         * In case of single product just loop over all staff & check their availability, select the available one.
         * In case of two products: try to check staff availability based on same index they came from time-slot.
         * If staff is exhausted then return 410
         */

        // for (let staffInc = 0; staffInc < products[0].AvailableStaff.length; staffInc++) {
        //     const staffOne = products[0].AvailableStaff[staffInc];
        //     let staffAvailable = false;
        //     const isStaffAvailable = await staffCheck(knex, {
        //         StaffId: staffOne.StaffId,
        //         Duration: products[0].TotalDuration + json.ReachOutTime,
        //         StartTime: new moment(products[0].StartTime).subtract(products[0].PreparationTime + json.ReachOutTime, "minute").utc().format()
        //     });
        //     staffAvailable = isStaffAvailable.IsAvailable;
        //     if (products.length > 1) {
        //         const staffTwo = products[1].AvailableStaff[staffInc];
        //         const isStaffTwoAvailable = await staffCheck(knex, {
        //             StaffId: staffTwo.StaffId,
        //             Duration: products[1].TotalDuration + json.ReachOutTime,
        //             StartTime: new moment(products[1].StartTime).subtract(products[1].PreparationTime + json.ReachOutTime, "minute").utc().format()
        //         });
        //         staffAvailable = isStaffTwoAvailable.IsAvailable;
        //         if (staffAvailable) {
        //             products.forEach((product, index) => {
        //                 switch (index) {
        //                     case 0:
        //                         product.StaffId = staffOne.StaffId;
        //                         product.StaffEmail = staffOne.GoogleEmail;
        //                         break;
        //                     case 1:
        //                         product.StaffId = staffTwo.StaffId;
        //                         product.StaffEmail = staffTwo.GoogleEmail;
        //                         break;
        //                 }
        //             });
        //             break;
        //         }
        //     }
        //     if (staffAvailable) {
        //         products[0].StaffId = staffOne.StaffId;
        //         products[0].StaffEmail = staffOne.GoogleEmail;
        //         break;
        //     }
        // }
        for (let prodInc = 0; prodInc < products.length; prodInc++) {
            const product = products[prodInc];
            // if (!product.StaffId || !product.StaffEmail) {
            //     return {
            //         statusCode: 410,
            //         headers: {
            //             ...Headers,
            //             Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
            //         }
            //     }
            // }
            if (prodInc === 0) {
                totalDuration += product.TotalDuration;
            } else {
                if (product.SameTime) {
                    if (product.TotalDuration >= products[0].TotalDuration) {
                        totalDuration = product.TotalDuration;
                    }
                } else if (products[0].StaffId === product.StaffId) {
                    totalDuration += product.PreparationTime + product.TotalDuration;
                } else {
                    totalDuration += product.TotalDuration;
                }
            }
        }

        let drctAssgnStaffNotify = [];

        if (json.Floor && typeof json.Floor === "string" && json.Floor.length > 30) {
            json.Floor = json.Floor.substr(0, 30);
        }

        let bookingFirstProTime = getBookingStartTime(products);
        STAFF_ZONE = zone.getStaffZone(bookingFirstProTime);
        if(!json.HouseNumber){
            try{
                const options = {
                    method: "GET",
                    uri: process.env.GOOGLE_MAPS_GEOCODE,
                    qs: {
                        address: ((json.Street) ? json.Street : '') + " " + ((json.HouseNumber)?json.HouseNumber:"") + ","+ json.Zip+ " " + ((json.City) ? json.City : ''),
                        key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
                        
                    }
                }
                const request = require("request-promise");
                let result = await request(options);
                let object = JSON.parse(result);
                console.log(JSON.stringify(object))
                if (object.status=='OK' && object.results.length>0) {
                    const addressComponents = object.results[0].address_components;
                console.log(JSON.stringify(addressComponents))
                // Extract required components like street, city, etc.
                let street, city;
    
                for (const component of addressComponents) {
                    if (component.types.includes('street_number')) {
                        json.HouseNumber = component.long_name;
                    }
                }
                console.log(object)
                }
                

            }
            catch (error) {
                console.error('Error fetching data:', error);
                return null;
            }
        }
            
        
        const dataSubmit = {
            BookingProvider: parseInt(process.env.BOOKING_PROVIDER_APP),
            UserId,
            Street: json.Street,
            HouseNumber: json.HouseNumber,
            Floor: json.Floor ? json.Floor : null,
            City: json.City ? json.City : null,
            Zip: json.Zip ? json.Zip : null,
            Elevator: json.Elevator ? 1 : 0,
            Amount: json.Amount,
            Duration: totalDuration,
            DateTime: moment(bookingFirstProTime).toDate(),
            ReachOutTime: json.ReachOutTime,
            FullAddress: ((json.Street) ? json.Street : '') + " " + ((json.HouseNumber)?json.HouseNumber:"") + ","+ json.Zip+ " " + ((json.City) ? json.City : ''),
            PromoCodeId: json.PromoCodeId ? json.PromoCodeId : null,
            AGPromoCodeId: null,
            PromoCode: json.PromoCode ? json.PromoCode : null,
            PromoAmount: json.PromoAmount ? json.PromoAmount : null,
            PaidPrice: json.PaidPrice,
            PaymentStatus: json.PaidPrice === 0 ? BOOKING_PAYMENT_STATUS.NOT_REQUIRED : BOOKING_PAYMENT_STATUS.INITIATED,
            TransactionId: null,                                        //updated after successfull payment
            TransactionDate: null,                                      //updated after successfull payment
            Status: json.PaidPrice === 0 ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.NEW,
            PredecessorBookingId: null,
            SuccessorBookingId: null,
            SystemPhase: SYSTEM_PHASE.PHASE_TWO,
            Deleted: 0,
            PaymentType: json.PaymentType? json.PaymentType:0,
            ...zone.getCreateUpdate()
        };
        console.log("dataSubmit");
        console.log(dataSubmit);
        let bookingResult = await knex(BOOKINGS).insert(dataSubmit)     //insert booking basic details to get BookingId
        if (bookingResult.length === 0) {
            throw new Error(MESSAGE.BOOKING_SAVE_FAILED);
        }
        let bookingInserted = bookingResult[0];                         //now we have BookingId for further operations
        bookingCreatedId = bookingInserted;
        let autoDispatchNotifyStaff = [];
        let promoExist=[]
        let discountToValidate=0
        let totalAmountByCategory=0
        if (json.PromoCodeId) {
             promoExist = await knex(PROMOCODES).select("*").where("PromoCodeId", "=", json.PromoCodeId);
            if (promoExist.length > 0) {
                let promoCountInc = await knex(PROMOCODES)
                    .update({
                        CurrentCount: promoExist[0].CurrentCount + 1,
                        LastUpdated: zone.getLastUpdate()
                    })
                    .where("PromoCodeId", "=", json.PromoCodeId)
                let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                console.log("promoCats")
                console.log(promoCats)
                console.log("promoExist[0].Type")
                console.log(promoExist[0])
                if(promoExist[0].Type==1){
                    
                    for (let index = 0; index < products.length; index++) {
                        let product = products[index];
    
                        let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
                        console.log("catFound")
                         console.log(catFound)
                         console.log("totalAmountByCategory1",totalAmountByCategory)
                         
                        if(catFound){
                            totalAmountByCategory+=product.Amount
                            if (product.AddOns.length > 0) {
                                let AddOns = product.AddOns;
                                for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                                    const addOn = AddOns[addOnIndex];
                                    totalAmountByCategory+=addOn.Amount
                                    console.log("totalAmountByCategory2",totalAmountByCategory)
                            }
                        }
                        
                    }
                    console.log("totalAmountByCategory3",totalAmountByCategory)
                    discountToValidate=totalAmountByCategory;
                    switch(promoExist[0].Mode){
                      case 0:
                        discount=(promoExist[0].Value*totalAmountByCategory)/100;
                        break;
                      case 1:
                        discount=promoExist[0].Value;
                        break;
                      default:
                        discount=promoExist[0].Value
                        break;
                
                    }
                        
                }
                }
               
                
           
        }
    }


        for (let index = 0; index < products.length; index++) {
            let product = products[index];
            let guestInsert;
            if (product.Guest) {
                let guest = product.Guest;
                guestInsert = await knex(GUESTS)
                    .insert({
                        UserId,
                        BookingId: bookingInserted,
                        ...guest,
                        ...zone.getCreateUpdate()
                    })
            }
            
            let totalProdAmount=product.Amount
            let productInserted = await knex(BOOKING_PRODUCTS)
                .insert({
                    BookingId: bookingInserted,
                    Product: product.Name,
                    ProductId: product.ProductId,
                    CategoryId: product.CategoryId,
                    Duration: product.Duration,
                    Amount: product.Amount,
                    PreparationTime: product.PreparationTime,
                    StaffId: product.StaffId ? product.StaffId : null,
                    UserId: !product.Guest ? UserId : null,
                    GuestId: product.Guest ? guestInsert[0] : null,
                    SameTime: product.SameTime,
                    StartTime: new moment(product.StartTime).toDate(),
                    Therapist: product.Therapist,
                    ForceStaffAllot: 0,
                    Status: 0,
                    DispatchType: product.DispatchType,
                    DispatchId: product.DispatchId,
                    StaffAmount: product.StaffId ? getAmountForTreatment(product.Duration, product.StaffRate) : null,
                    ...zone.getCreateUpdate()
                });
            let bookingProductId = productInserted[0];

            if (
                product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH ||
                product.DispatchType === PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH
            ) {
                // Insert the staffList to dispatch and save this staff for automatic dispatch notification.
                let productDispatchList = [];
                product.DispatchList.forEach(staff => {
                    productDispatchList.push({
                        DispatchId: product.DispatchId,
                        StaffId: staff.StaffId,
                        Status: DISPATCH_STATUS.READY_TO_DISPATCH,
                        ...zone.getCreateUpdate()
                    });
                    if (product.DispatchType === PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH) {
                        let stFound = STAFF_CURRENT_SCHEDULE.find(sts => sts.StaffId === staff.StaffId);
                        autoDispatchNotifyStaff.push({
                            StaffId: stFound.StaffId,
                            FcmToken: stFound.FcmToken,
                            DateTime: product.StartTime,
                            DispatchId: product.DispatchId
                        });
                    }
                });
                let insertedDispatchList = await knex(BOOKING_PRODUCT_DISPATCH).insert(productDispatchList);
            }

            if (product.Extras && product.Extras.length > 0) {
                for (let extInc = 0; extInc < product.Extras.length; extInc++) {
                    const extra = product.Extras[extInc];
                    let extraInserted = await knex(BOOKING_PRODUCT_EXTRA)
                        .insert({
                            BookingProductId: bookingProductId,
                            ExtraTitle: extra.ExtraTitle,
                            ExtraValue: extra.ExtraValue,
                            ...zone.getCreateUpdate()
                        })

                }
            }

            if (product.AddOns.length > 0) {
                let AddOns = product.AddOns;
                for (let addOnIndex = 0; addOnIndex < AddOns.length; addOnIndex++) {
                    const addOn = AddOns[addOnIndex];
                    totalProdAmount+=addOn.Amount
                    let addOnInsert = await knex(BOOKING_PRODUCT_ADDONS)
                        .insert({
                            BookingId: bookingInserted,
                            BookingProductId: bookingProductId,
                            AddOnId: addOn.AddOnId,
                            AddOn: addOn.Name,
                            Duration: addOn.Duration,
                            Amount: addOn.Amount,
                            BookingAddOnPaymentId: null,
                            StaffAmount: product.StaffId ? getAmountForTreatment(addOn.Duration, product.StaffRate) : null,
                            ...zone.getCreateUpdate()
                        })
                }
            }
            let ProdDiscountedAmount=totalProdAmount
            let ProdDiscounted=0
            if(promoExist.length > 0){
                ProdDiscountedAmount=totalProdAmount
                ProdDiscounted=0
                if(promoExist[0].Type==0){
                    //console.log("booking")
                     ProdDiscountedAmount=totalProdAmount
                     ProdDiscounted=0
                }else{
                    let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                    let catFound=promoCats.find(cat => cat.CategoryId === product.CategoryId);
                    if(catFound){
                        let PromoAmount=json.PromoAmount
                        if (promoExist[0].Mode == 0 && json.PromoAmount==discountToValidate) {
                            //percent
                            //console.log("cat per")
                            let prodAmt = totalProdAmount
                            let prodDiscount = (promoExist[0].Value * prodAmt) / 100;
                            let prodDiscountedAmount = prodAmt - prodDiscount
                            ProdDiscountedAmount=prodDiscountedAmount
                            ProdDiscounted=prodDiscount
                        } else {
                            //fix
                            console.log("cat fix")
                            console.log(totalAmountByCategory)
                            console.log("json.PromoAmount",json.PromoAmount)
                            console.log("totalProdAmount",totalProdAmount)
                            

                            let discountInPercent = (json.PromoAmount / totalAmountByCategory) * 100
                            let prodAmt = totalProdAmount
                            let prodDiscount = (discountInPercent * prodAmt) / 100;
                            let prodDiscountedAmount = prodAmt - prodDiscount
                            console.log("prodDiscount",prodDiscount)
                            console.log("prodDiscountedAmount",prodDiscountedAmount)
                            //console.log("prodAmt"+prodAmt)
                            //console.log("prodDiscountedAmount"+prodDiscountedAmount)
                            //console.log("prodDiscount"+prodDiscount)
                            ProdDiscountedAmount=prodDiscountedAmount
                            ProdDiscounted=prodDiscount
                        }
                    }else{
                        //console.log("no promo on cat")
                         ProdDiscountedAmount=totalProdAmount
                         ProdDiscounted=0
                    }

                }
                
            

            }else{
                //console.log("else")
                ProdDiscountedAmount=totalProdAmount
                ProdDiscounted=0
            }
            const discountAmountUpdated = await knex(BOOKING_PRODUCTS)
                .where("BookingProductId", bookingProductId)
                .update({
                    DiscountedAmount: ProdDiscountedAmount,
                    Discount: ProdDiscounted
                })
                .modify(function (queryBuilder) {
                    console.log(queryBuilder.toSQL().toNative())
                    
                });
                //console.log("amtUp"+discountAmountUpdated)
        }

            if (product.DispatchType === PRODUCT_DISPATCH_TYPE.DIRECT_ASSIGNMENT) {
                // Events configuration
                if (index === 0) {
                    let startTime = new moment(product.StartTime).utc();
                    let endTime = new moment(product.StartTime).utc();
                    endTime.add(product.TotalDuration, "minute");
                    let eventObj = {
                        StaffId: product.StaffId,
                        start: {
                            dateTime: startTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        end: {
                            dateTime: endTime.toDate(),
                            timeZone: process.env.TIME_ZONE
                        },
                        attendees: [
                            { email: process.env.EMAIL },
                            { email: product.StaffEmail }
                        ],
                        Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                        BookingProductId: [bookingProductId],
                        extendedProperties: {
                            shared: {
                                'BookingId': bookingInserted,
                                'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                'ReturnTime': json.ReachOutTime
                            }
                        }
                    }
                    eventsData.push(eventObj);
                } else {
                    let found = eventsData.find(sta => sta.StaffId === product.StaffId);        //create staff entry for events if not exists already
                    if (found) {
                        found.end.dateTime = new moment(found.end.dateTime)
                            .add(product.PreparationTime + product.TotalDuration, "minute").toDate();
                        found.Products.push(product.Name + " (" + product.TotalDuration + " mins)")
                        found.BookingProductId.push(bookingProductId);
                    } else {
                        let startTime = new moment(product.StartTime).utc();
                        let endTime = new moment(product.StartTime).utc();
                        endTime.add(product.TotalDuration, "minute");
                        let eventObj = {
                            StaffId: product.StaffId,
                            start: {
                                dateTime: startTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: process.env.TIME_ZONE
                            },
                            attendees: [
                                { email: process.env.EMAIL },
                                { email: product.StaffEmail }
                            ],
                            Products: [product.Name + " (" + product.TotalDuration + " mins)"],
                            BookingProductId: [bookingProductId],
                            extendedProperties: {
                                shared: {
                                    'BookingId': bookingInserted,
                                    'ReachOutTime': json.ReachOutTime + product.PreparationTime,
                                    'ReturnTime': json.ReachOutTime
                                }
                            }
                        }
                        eventsData.push(eventObj);
                    }
                }

                // Push configuration
                const pushStaffFound = drctAssgnStaffNotify.find(f => f.StaffId === product.StaffId);
                if (!pushStaffFound) {
                    // let staffFcmToken = await knex(STAFF)
                    //     .select("StaffId", "FcmToken")
                    //     .where("StaffId", "=", product.StaffId);
                    // let staffData = staffFcmToken[0];
                    // let pushStaffObj = {
                    //     StaffId: staffData.StaffId,
                    //     FcmToken: staffData.FcmToken,
                    //     DateTime: product.StartTime
                    // }
                    // staffPushNotify.push(pushStaffObj);
                    let staffFcm = STAFF_CURRENT_SCHEDULE.find(st => st.StaffId === product.StaffId);
                    let pushStaffObj = {
                        StaffId: staffFcm.StaffId,
                        FcmToken: staffFcm.FcmToken,
                        DateTime: product.StartTime
                    }
                    drctAssgnStaffNotify.push(pushStaffObj);
                }
            }
        
        

        const userExist = userData[0];
        // Generate Events on google calendar
        let finalEvents = [];
        eventsData.forEach(config => {
            let description = config.Products.toString();
            finalEvents.push({
                ...config,
                summary: userExist.Name + ", Booking #" + bookingInserted,
                description
            })
        });

        for (let ev = 0; ev < finalEvents.length; ev++) {
            const event = finalEvents[ev];
            delete event.StaffId;
            const inserted = await calendar.events.insert({
                auth: oAuth2Client,
                calendarId: "primary",
                resource: event
            });
            const eventInserted = await knex(BOOKING_PRODUCTS)
                .whereIn("BookingProductId", event.BookingProductId)
                .update({
                    EventId: inserted.data.id,
                    LastUpdated: zone.getLastUpdate()
                })
            eventsCreated.push(inserted.data.id);
        }

        // var bookingData;

        if (json.PaidPrice > 0) {
            // Initiate payment procedure.
            let stripeAmount = Math.round(calculatedAmount * 100);
            //console.log(`stripeAmount: ${stripeAmount}`);
            let description = "Cocon Booking #" + bookingInserted + ", Products: " + productNames.toString();
            let customer_id = userExist.CustomerId;
            let customerEmail = userExist.Email;
            let isCreated = false;
            let stripeCustomer
            if (!customer_id) {
                let customerData = await createStripeCustomer(stripe, userExist, knex);
                //console.log(customerData);
                customer_id = customerData.id;
                isCreated = true;
                stripeCustomer=customerData
            }
            try {
                if (!isCreated) {
                    const customerExist = await stripe.customers.retrieve(customer_id);
                    //console.log(customerExist)
                    customer_id = customerExist.id;
                    stripeCustomer=customerExist
                }
            } catch (error) {
                //console.log(error);
                let customerData = await createStripeCustomer(stripe, userExist, knex);
                //console.log(customerData)
                customer_id = customerData.id;
                stripeCustomer=customerData
            }
            let paymentIntent;
            let EphemeralKey = await stripe.ephemeralKeys.create(
                {customer:customer_id},
                {apiVersion:'2020-08-27'})
            if (json.SaveCard) {
                paymentIntent = await stripe.paymentIntents.create({
                    amount: stripeAmount,
                    currency: CURRENCY_CODE,
                    customer: customer_id,
                    description,
                    metadata: {
                        "BookingId": bookingInserted
                    },
                    receipt_email: customerEmail,
                    // automatic_payment_methods: {enabled: true},
                    payment_method_options: {
                        card: {
                          setup_future_usage: 'on_session',
                        }
                    },
                    // setup_future_usage: 'on_session',
                    payment_method_types: ['card','ideal']
                });
            } else {
                paymentIntent = await stripe.paymentIntents.create({
                    amount: stripeAmount,
                    currency: CURRENCY_CODE,
                    customer: customer_id,
                    description,
                    metadata: {
                        "BookingId": bookingInserted
                    },
                    receipt_email: customerEmail,
                    payment_method_options: {
                        card: {
                          setup_future_usage: 'on_session',
                        }
                    },
                    payment_method_types: ['card','ideal']

                    // automatic_payment_methods: {enabled: true},
                });
            }
            //console.log(paymentIntent);
            let bookingIntentInsert = await knex(BOOKINGS).where("BookingId", "=", bookingInserted)
                .update({
                    PaymentIntent: paymentIntent.id
                })
                bookingData = {
                    BookingId: bookingInserted,
                    ClientSecret: paymentIntent.client_secret,
                    PaymentIntent: paymentIntent,
                    EphemeralKey:EphemeralKey,
                    Customer:stripeCustomer
                }
            // if (json.PaymentMethod === 1) {
            //     // const paymentMethod = await stripe.paymentMethods.create({
            //     //     type: "ideal",
            //     //     ideal: {
            //     //         bank: json.BankKey
            //     //     }
            //     // })
            //     bookingData = {
            //         BookingId: bookingInserted,
            //         ClientSecret: paymentIntent.client_secret,
            //         PaymentIntent: paymentIntent
            //     }
            // } else {
            //     bookingData = {
            //         BookingId: bookingInserted,
            //         ClientSecret: paymentIntent.client_secret
            //     }
            // }
        } else {
            bookingData = {
                BookingId: bookingInserted
            }
            try {
                let lambda = new AWS.Lambda();
                let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
                lambda.invoke({
                    FunctionName: lambdaName,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        Type: 0,
                        BookingId: bookingInserted
                    })
                }, function (err, data) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('Lambda_B said ' + data.Payload);
                    }
                });

                // send booking confirmation email
                let bookingNotifier = getLambdaNameByInstance() + "-bookingConfNotifier";
                lambda.invoke({
                    FunctionName: bookingNotifier,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        BookingId: bookingInserted
                    })
                }, function (err, data) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('Lambda_B said ' + data.Payload);
                    }
                });

                await holdfor10secs();
                // //console.log(caller);
                console.log("after lambda hit");
            } catch (error) {
                console.log(error)
            }
        }

        // Auto generate remaining amount promo code
        try {
            if (json.PromoCodeId && json.RemainingAmount) {
                /**
                 * 1. Generate a random name for AG promo.
                 * 2. Generate the promo code with class AG
                 * 3. send push notification to user
                 * 4. create a user specific message
                 */
                let remAmount = Math.round(json.RemainingAmount);
                let promoExistData = await knex(PROMOCODES)
                    .select("PromoCodeId", "Type", "StartDate", "EndDate", "MinPurchaseAmount")
                    .where("PromoCodeId", "=", json.PromoCodeId);
                let promoExistDetail = promoExistData.length > 0 ? promoExistData[0] : null;
                if (remAmount >= parseInt(process.env.MIN_REMAINING_VALUE) && promoExistDetail) {
                    let codeName = null;
                    for (let chNamInc = 0; chNamInc < 5; chNamInc++) {
                        let newName = makeid(7);
                        let exist = await knex(PROMOCODES).select("PromoCodeId").where("Code", "=", newName);
                        if (exist.length === 0) {
                            codeName = newName;
                            break;
                        }
                    }
                    if (codeName) {
                        let promoIns = {
                            Code: codeName,
                            Type: promoExistDetail.Type,
                            Mode: 1,
                            StartDate: moment(promoExistDetail.StartDate).toDate(),
                            EndDate: moment(promoExistDetail.EndDate).toDate(),
                            Value: remAmount,
                            MaxAmount: remAmount,
                            MinPurchaseAmount: 5,
                            Class: 1,
                            RedeemCount: 1,
                            CurrentCount: 0,
                            ...zone.getCreateUpdate()
                        }
                        let promoInserted = await knex(PROMOCODES).insert(promoIns);
                        agPromoId = promoInserted[0];
                        let bookingAgPUp = await knex(BOOKINGS).where("BookingId", "=", bookingInserted).update({
                            AGPromoCodeId: promoInserted[0]
                        })
                        if (promoIns.Type === 1) {
                            let promoCats = await knex(PROMOCODE_CATEGORIES).select("CategoryId").where("PromoCodeId", "=", json.PromoCodeId);
                            for (let catInc = 0; catInc < promoCats.length; catInc++) {
                                let category = promoCats[catInc];
                                let obj = {
                                    PromoCodeId: promoInserted[0],
                                    CategoryId: category.CategoryId,
                                    ...zone.getCreateUpdate()
                                }
                                let catInserted = await knex(PROMOCODE_CATEGORIES).insert(obj);
                            }
                        }
                        /**
                         * send ag promo push if any
                         */
                        if (json.PaidPrice === 0) {
                            try {
                                // let title = `New promo code received`;
                                let title = PUSH.TITLE.AG_PROMO_RECEIVED;
                                let description = `New promo code: ${codeName} of amount €${remAmount} valid till ${momentz.tz(promoIns.EndDate, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DDC_YYYY + " z")}`;
                                let token = userExist.FcmToken ? userExist.FcmToken : null;
                                const msgInsert = await knex(USER_MESSAGES).insert({
                                    UserId: userExist.UserId,
                                    Title: title,
                                    Description: description,
                                    ImagePath: null,
                                    Date: moment().toDate(),
                                    ...zone.getCreateUpdate()
                                })
                                if (token) {
                                    const message = {
                                        token,
                                        notification: {
                                            title: title,
                                            body: description
                                        },
                                        data: {
                                            ScreenName: PUSH.SCREEN.MESSAGES
                                        }
                                    }
                                    try {
                                        const userApp = InitializeFirebase();
                                        const sentNotification = await userApp.messaging().send(message);
                                        //console.log(sentNotification)
                                    } catch (error) {
                                        //console.log(error);
                                    }
                                }
                            } catch (error) {
                                //console.log(error);
                            }
                        }
                    }
                }

            }
        } catch (error) {
            console.log(error);
        }

        //console.log("drctAssgnStaffNotify");
        //console.log(drctAssgnStaffNotify);
        // send push notification to staff - For direct assignment.
        for (let pushInc = 0; pushInc < drctAssgnStaffNotify.length; pushInc++) {
            try {
                const element = drctAssgnStaffNotify[pushInc];
                let title = `New booking #${bookingInserted} received`;
                let description = `You have been allotted a new booking, scheduled on ${momentz.tz(element.DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " z")}`;
                // insert staff specific message in DB
                const msgInsert = await knex(STAFF_MESSAGES).insert({
                    StaffId: element.StaffId,
                    Title: title,
                    Description: description,
                    ImagePath: null,
                    Date: moment().toDate(),
                    ...zone.getCreateUpdate()
                })
                if (element.FcmToken) {
                    const message = {
                        token: element.FcmToken,
                        notification: {
                            title,
                            body: description
                        },
                        data: {
                            BookingId: `${bookingInserted}`,
                            DateTime: moment(element.DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                            ScreenName: PUSH.SCREEN.BOOKINGS,
                            TimeZone: process.env.STAFF_ZONE
                        }
                    }
                    //console.log(message);
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotifications = await therapistApp.messaging().send(message);
                    console.log(sentNotifications)
                }
            } catch (error) {
                console.log(error)
            }
        }

        try {
            let lambda = new AWS.Lambda();
            // send booking confirmation email
            let bookingRateCalculation = getLambdaNameByInstance() + "-calculateBookingStaffRate";
            console.log(bookingRateCalculation)
            lambda.invoke({
                FunctionName: bookingRateCalculation,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    FromCMS: true,
                    BookingId: bookingInserted
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    //console.log('Lambda_Push said ' + data.Payload);
                }
            });

            // await holdfor10secs();
            // //console.log(caller);
            //console.log("after lambda hit");
        } catch (error) {
            console.log(error)
        }
        /**
         * The dispatch notification should be in different lambda 
         * Because it might take time to send notification to all available staff
         */
        // let notifierLambda = new aws.Lambda(); 
        // notifierLambda.invoke({
        //     FunctionName: "autoDispatchNotifier",
        //     InvocationType: "Event",
        //     Payload: autoDispatchNotifyStaff
        // }, function (err, data) {
        //     //console.log(data);
        // })
        let markToDispatched = [];
        for (let dispInc = 0; dispInc < autoDispatchNotifyStaff.length; dispInc++) {
            const staff = autoDispatchNotifyStaff[dispInc];
            let dispatchFound = markToDispatched.find(f => f === staff.DispatchId);
            if (!dispatchFound) {
                markToDispatched.push(staff.DispatchId);
            }
        }
        if (markToDispatched.length) {
            let marked = await knex(BOOKING_PRODUCT_DISPATCH)
                .whereIn("DispatchId", markToDispatched)
                .update({
                    Status: DISPATCH_STATUS.DISPATCHED
                })
        }
        await knex.destroy();
        // for (let pushInc = 0; pushInc < autoDispatchNotifyStaff.length; pushInc++) {
        //     try {
        //         const element = autoDispatchNotifyStaff[pushInc];
        //         if (element.FcmToken) {
        //             let title = `You have a booking offer.`;
        //             let description = `You have got a new booking request for ${moment(element.DateTime).utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm)}`;
        //             const message = {
        //                 token: element.FcmToken,
        //                 notification: {
        //                     title,
        //                     body: description
        //                 },
        //                 data: {
        //                     BookingId: `${bookingInserted}`,
        //                     ScreenName: PUSH.SCREEN.INCOMING_REQUEST
        //                 }
        //             }
        //             //console.log(message);
        //             const therapistApp = InitializeFirebaseTherapist();
        //             const sentNotifications = await therapistApp.messaging().send(message);
        //             //console.log(sentNotifications)
        //         }
        //     } catch (error) {
        //         //console.log(error)
        //     }
        // }

        // send notification for automatic dispatch
    } catch (error) {
        //console.log(error);
        /**
         * Rollback the booking by updating status'
         * 1. Booking status: CANCELLED
         * 2. Payment status: FAILED
         * 3. Delete the events if generated already
         * 4. Delete the auto generated promo if already created.
         */
        if (bookingCreatedId) {
            //console.log("rollback initiated");
            let bookingRollbObj = {
                Status: BOOKING_STATUS.CANCELLED,
                PaymentStatus: BOOKING_PAYMENT_STATUS.FAILED,
                LastUpdated: zone.getLastUpdate()
            }
            let bookingRollbacked = await knex(BOOKINGS)
                .where("BookingId", "=", bookingCreatedId)
                .update(bookingRollbObj);
            for (let evInc = 0; evInc < eventsCreated.length; evInc++) {
                let eventId = eventsCreated[evInc];
                //console.log(`EventId: ${eventId}`)
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        auth: oAuth2Client,
                        eventId: eventId
                    });
                } catch (error) {
                    // event might be already deleted
                    //console.log(error.message);
                }
            }
            if (agPromoId) {
                let agPromoDeleted = await knex(PROMOCODES).where("PromoCodeId", "=", agPromoId).del();
                let agPromoCatDeleted = await knex(PROMOCODE_CATEGORIES).where("PromoCodeId", "=", agPromoId).del();
            }
        } else {
            //console.log("rollback not required");
        }
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }

    //console.log(bookingData);
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.BOOKING_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingData
        })
    }
}


// const updateBookingConfirmStatus = async (knex, bookingId) => {
//     try{
//         let bookingData = await knex(BOOKINGS)
//         .select("*")
//         .where("BookingId", "=", bookingId);
//         // console.log(bookingCurrentData)
//         // console.log(bookingCurrentData.Status)
//         console.log(BOOKING_STATUS.TEMP_BOOKING)
//         let bookingCurrentData=bookingData[0]
//     if (bookingCurrentData.Status == BOOKING_STATUS.TEMP_BOOKING) {
//         console.log("in")
//         const statusUpdate= await knex(BOOKINGS)
//             .where("BookingId", "=", bookingId)
//             .update({
//                 Status: BOOKING_STATUS.CONFIRMED,
//             });
//             console.log(statusUpdate)
//            if(bookingCurrentData.AGPromoCodeId){
//             const promoUpdate= await knex(PROMOCODES)
//             .where("PrmocodeId", "=", bookingCurrentData.AGPromoCodeId)
//             .update({
//                 Status: PROMO_STATUS.CONFIRMED,
//             });
//             console.log(promoUpdate)
//            }
          

//     }

//     }catch (error) {
//         console.log(error)
//         return {
//             Error: error.message
//         }
//     }
    
// }

// module.exports.confirmTempBooking = async event => {
//     var responseBody = {};
//     try {
//         const knex = require("knex")(con);
//         const json = event.body ? getPayloadData(event) : null;
//         if (
//             !json ||
//             !json.BookingId || typeof json.BookingId !== "number"
//         ) {
//             throw new Error(MESSAGE.REQ_DATA_ERROR);
//         }
//         var updateBooking = await updateBookingConfirmStatus(knex, json.BookingId);

//         responseBody = {
//             Data: [],
//         };

//         await knex.destroy();
//     } catch (error) {
//         console.log(error);
//         return {
//             statusCode: 400,
//             headers: {
//                 ...Headers,
//                 Message: error.message
//             }
//         }
//     }
//     return {
//         statusCode: 200,
//         headers: {
//             ...Headers,
//             Message: MESSAGE.BOOKING_STATUS_UPDATE_SUCCESS
//         },
//         body: setPayloadData(event, responseBody)
//     }
// }

// Created for new stripe integration with officual Stripe SDK
module.exports.saveTipNew = async event => {
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            !json.UserId || typeof json.UserId !== "number" ||
            !json.TipAmount || typeof json.TipAmount !== "number" ||
            json.PaymentMethod < 0 || typeof json.PaymentMethod !== "number" ||
            json.PaymentMethod > 1
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        // if (json.PaymentMethod === 1 && !json.BankKey) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
        var knex = require("knex")(con);
        const userData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                USERS + ".CustomerId",
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .where(BOOKINGS + ".BookingId", json.BookingId)
        if (userData.length <= 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        const userExist = userData[0];
        const tipExist = await knex(BOOKING_TIPS).select("BookingTipId", "PaymentStatus").where("BookingId", "=", json.BookingId);
        if (tipExist.length > 0 && tipExist.PaymentStatus === 1) {
            throw new Error(MESSAGE.TIP_ALREADY_GIVEN);
        }
        const tipInserted = await knex(BOOKING_TIPS)
            .insert({
                BookingId: json.BookingId,
                UserId: json.UserId,
                TipAmount: json.TipAmount,
                PaymentStatus: 0,
                TransactionId: null,
                TransactionDate: null,
                ...zone.getCreateUpdate()
            })
        if (tipInserted.length <= 0) {
            throw new Error(MESSAGE.TIP_SAVE_FAILED);
        }
        await knex.destroy();
        const tipId = tipInserted[0];

        // Initiate payment procedure.
        var description = "Tip #" + tipId + " for Cocon Booking #" + json.BookingId;
        var customer_id = userExist.CustomerId;
        var isCreated = false;
        var stripeCustomer;
        const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
        if (!customer_id) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            stripeCustomer=customerData
            //console.log(customerData);
            customer_id = customerData.id;
            isCreated = true;
        }
        try {
            if (!isCreated) {
                const customerExist = await stripe.customers.retrieve(customer_id);
                //console.log(customerExist);
                customer_id = customerExist.id;
                stripeCustomer=customerExist
            }
        } catch (error) {
            //console.log(error);
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            //console.log(customerData);
            customer_id = customerData.id;
            stripeCustomer=customerData
        }

        if (json.SaveCard) {
            var paymentIntent = await stripe.paymentIntents.create({
                amount: json.TipAmount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingTipId": tipId
                },
                // setup_future_usage: 'on_session',
                payment_method_types: ['card','ideal'],
                payment_method_options: {
                    card: {
                      setup_future_usage: 'on_session',
                    }
                }
                
            });
        } else {
            var paymentIntent = await stripe.paymentIntents.create({
                amount: json.TipAmount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingTipId": tipId
                },
                payment_method_types:['card','ideal']
            });
        }
        let EphemeralKey = await stripe.ephemeralKeys.create(
            {customer:customer_id},
            {apiVersion:'2020-08-27'})
        //console.log(paymentIntent);
        var tipData = {
            BookingId: json.BookingId,
            BookingTipId: tipId,
            ClientSecret: paymentIntent.client_secret,
            PaymentIntent: paymentIntent,
            EphemeralKey:EphemeralKey,
            Customer:stripeCustomer
        }
        //console.log(tipData)

    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.TIP_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: tipData
        })
    }
}

module.exports.captureAddOnPaymentNew = async event => {
    let knex, connected = false, response;
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingId ||
            !json.UserId ||
            !json.Amount ||
            !json.AddOns
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let totalAmount = 0;
        json.AddOns.forEach(addOn => {
            if (
                !addOn.BookingProductId ||
                !addOn.BookingProductAddOnId ||
                !addOn.Amount
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            totalAmount += addOn.Amount;
        });

        if (totalAmount !== json.Amount) {
            throw new Error(MESSAGE.INVALID_TOTAL_AMOUNT);
        }

        knex = require("knex")(con);
        let bookingExist = await knex
            .select(
                USERS + ".UserId",
                USERS + ".CustomerId",
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId as BookingUser",
                BOOKINGS + ".PaymentStatus",
            )
            .from(USERS)
            .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", json.BookingId)
            .where(USERS + ".UserId", "=", json.UserId)
        if (bookingExist.length <= 0) {
            throw new Error(MESSAGE.BOOKING_NOT_AVAILABLE);
        }
        const bookingData = bookingExist[0];
        if (bookingData.UserId !== bookingData.BookingUser) {
            throw new Error("Booking" + json.BookingId + " does not exist for UserId" + json.UserId)
        }
        let allowedPaymentStatus = [
            BOOKING_PAYMENT_STATUS.SUCCEEDED,
            BOOKING_PAYMENT_STATUS.MANUAL,
            BOOKING_PAYMENT_STATUS.NOT_REQUIRED
        ];
        if (!allowedPaymentStatus.includes(bookingData.PaymentStatus)) {
            throw new Error(MESSAGE.BOOKING_PAY_FIRST);
        }

        let addOnCaptureInsert = await knex(BOOKING_ADDON_PAYMENTS).insert({
            BookingId: json.BookingId,
            UserId: json.UserId,
            Amount: json.Amount,
            PaymentStatus: ADDON_PAYMENTS_STATUS.INITIATED,
            TransactionId: null,
            TransactionDate: null,
            ...zone.getCreateUpdate()
        })
        let bookingAddOnPaymentId = addOnCaptureInsert[0];
        let bookingProductAddOnIds = [];
        json.AddOns.forEach(element => {
            bookingProductAddOnIds.push(element.BookingProductAddOnId);
        });
        let paymentIdAttached = await knex(BOOKING_PRODUCT_ADDONS)
            .whereIn("BookingProductAddOnId", bookingProductAddOnIds)
            .update({
                BookingAddOnPaymentId: bookingAddOnPaymentId,
                LastUpdated: zone.getLastUpdate()
            })

        // initiate payment procedure
        var description = "Cocon Booking #" + json.BookingId + " for extra Add-ons";
        var customer_id = bookingData.CustomerId;
        var isCreated = false;
        var stripeCustomer
        if (!customer_id) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            customer_id = customerData.id;
            isCreated = true;
            stripeCustomer = customerData;
        }
        try {
            if (!isCreated) {
                const customerExist = await stripe.customers.retrieve(customer_id);
                customer_id = customerExist.id;
                stripeCustomer = customerExist;
            }
        } catch (error) {
            var customerData = await createStripeCustomer(stripe, userExist, knex);
            customer_id = customerData.id;
            stripeCustomer = customerData;
        }
        var paymentIntent;
        let EphemeralKey = await stripe.ephemeralKeys.create(
            {customer:customer_id},
            {apiVersion:'2020-08-27'})
        if (json.SaveCard) {
            paymentIntent = await stripe.paymentIntents.create({
                amount: json.Amount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingAddOnPaymentId": bookingAddOnPaymentId
                },
                // setup_future_usage: 'on_session',
                payment_method_types: ['card',"ideal"],
                
            });
        } else {
            paymentIntent = await stripe.paymentIntents.create({
                amount: json.Amount * 100,
                currency: CURRENCY_CODE,
                customer: customer_id,
                description,
                metadata: {
                    "BookingId": json.BookingId,
                    "BookingAddOnPaymentId": bookingAddOnPaymentId
                },
                payment_method_types: ['card',"ideal"],
            });
        }
        //console.log(paymentIntent)
        let intentInserted = await knex(BOOKING_ADDON_PAYMENTS)
            .where("BookingAddOnPaymentId", "=", bookingAddOnPaymentId)
            .update({
                PaymentIntent: paymentIntent.id
            })
        let addOnData = {
            BookingAddOnPaymentId: bookingAddOnPaymentId,
            ClientSecret: paymentIntent.client_secret,
            PaymentIntent : paymentIntent,
            Customer:stripeCustomer,
            EphemeralKey:EphemeralKey
        };
        
        //console.log(addOnData);
        response = addOnData;
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_STATUS_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }

    
}
module.exports.calculateBookingStaffRate = async (event) => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        console.log(json)
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        let bookingProduct = await knex(BOOKING_PRODUCTS).select("*").where("BookingId", "=", json.BookingId);
        console.log(bookingProduct)
       
        if (bookingProduct.length > 0) {
            for (let inc = 0; inc < bookingProduct.length; inc++) {
                let product = bookingProduct[inc]
                const weekdayNumber = product.StartTime.getDay();

                // Convert the weekday number to the corresponding weekday name
                const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const weekdayName = weekdays[weekdayNumber];
                let startTime = moment(product.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                console.log(startTime)
                let addOnsData = await knex(BOOKING_PRODUCT_ADDONS)
                    .select(
                        "BookingProductAddOnId",
                        "AddOn",
                        "Duration",
                        "ExtraAddOn",
                        "StaffAmount",
                        "BookingAddOnPaymentId",
                        "RequestStatus",
                    )
                    .where("BookingProductId", "=", product.BookingProductId);

                let totalDuration = product.Duration
                console.log(addOnsData);
                if (addOnsData.length > 0) {
                    addOnsData.forEach(addOn => {
                        if (!addOn.ExtraAddOn) {
                            totalDuration += addOn.Duration
                        } else {
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                totalDuration += addOn.Duration;
                            }
                        }
                    });
                }
                console.log(totalDuration);
                let endTime = moment(product.StartTime).add(totalDuration, "minutes").tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)

                // get hourly rate

                let hourlyRate=  await knex(CATEGORY_HOURLY_RATE).select("*")
                                    .where("CategoryId", "=", product.CategoryId)
                                    .andWhere(function () {
                                        this.orWhere(function(){
                                            this.where(`StartTime`, "<=", startTime)
                                            this.andWhere(`EndTime`, ">=", startTime)
                                        })
                                        this.orWhere(function(){
                                            this.where(`StartTime`, "<=", endTime)
                                            this.where(`EndTime`, ">=", endTime)
                                        })
                                    })
                                    .orderBy('StartTime', 'asc')
                                    .modify(queryBuilder => {
                
                console.log(queryBuilder.toSQL().toNative())
            })
            let finalCalc=0
            let rateApplied=[]
            
                console.log(hourlyRate)
                if (hourlyRate.length > 0) {
                    hourlyRate.forEach(rateData => {
                        let dayRate=weekdayName+'Rate'
                        let hourRate=rateData[dayRate]
                        console.log("hourRate",hourRate)
                        let perMinuteRate=hourRate/60
                        // let rateStart = moment(rateData.StartTime,DATE_TIME_FORMAT.HHcmmcss).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                        // let rateEnd = moment(rateData.EndTime,DATE_TIME_FORMAT.HHcmmcss).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                        let rateStart = momentz.tz(rateData.StartTime,DATE_TIME_FORMAT.HHcmmcss, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                        let rateEnd = momentz.tz(rateData.EndTime,DATE_TIME_FORMAT.HHcmmcss, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                        console.log(rateStart)
                        console.log(rateEnd)
                        console.log(moment(rateStart,DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(startTime,DATE_TIME_FORMAT.HHcmm)))
                        console.log(moment(rateEnd,DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(endTime,DATE_TIME_FORMAT.HHcmm)))
                        if( moment(rateStart,DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(startTime,DATE_TIME_FORMAT.HHcmm)) && moment(rateEnd,DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(startTime,DATE_TIME_FORMAT.HHcmm))){
                            // start time is in between check if end time is also in between or calculate the minutes
                            if(moment(rateStart,DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(endTime,DATE_TIME_FORMAT.HHcmm)) && moment(rateEnd,DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(endTime,DATE_TIME_FORMAT.HHcmm))){
                                console.log("block is in range")
                                //block is in range
                                let totalMinutes=totalDuration
                                finalCalc+=perMinuteRate*totalMinutes
                                console.log("totalMinutes",totalMinutes)
                                console.log("finalCalc",finalCalc)
                                console.log("perMinuteRate",perMinuteRate)
                                let rateAppliedObj={
                                    BookingProductId:product.BookingProductId,
                                    Rate:hourRate,
                                    ...zone.getCreateUpdate()
                                }
                                rateApplied.push(rateAppliedObj)
                            } else {
                                //only start time is in range
                                console.log("only start time is in range")
                                let startMoment = moment(startTime, DATE_TIME_FORMAT.HHcmm);
                                let endMoment = moment(rateEnd,DATE_TIME_FORMAT.HHcmm)
                                let totalMinutes = endMoment.diff(startMoment, 'minutes');
                                finalCalc+=perMinuteRate*totalMinutes 
                                console.log("totalMinutes",totalMinutes)
                                console.log("finalCalc",finalCalc)
                                console.log("perMinuteRate",perMinuteRate)
                                let rateAppliedObj={
                                    BookingProductId:product.BookingProductId,
                                    Rate:hourRate,
                                    ...zone.getCreateUpdate()
                                }
                                rateApplied.push(rateAppliedObj)

                            }
                        }else{
                             //only end time is in range
                             console.log("only end time is in range")
                             let startMoment = moment(rateStart,DATE_TIME_FORMAT.HHcmm)
                                let endMoment = moment(endTime, 'HH:mm');
                                let totalMinutes = endMoment.diff(startMoment, 'minutes');
                                finalCalc+=perMinuteRate*totalMinutes 
                                console.log("totalMinutes",totalMinutes)
                                console.log("finalCalc",finalCalc)
                                console.log("perMinuteRate",perMinuteRate)
                                let rateAppliedObj={
                                    BookingProductId:product.BookingProductId,
                                    Rate:hourRate,
                                    ...zone.getCreateUpdate()
                                }
                                rateApplied.push(rateAppliedObj)
                        }
                    });
                }else{
                    finalCalc=0
                }
                let updated = await knex(BOOKING_PRODUCTS)
                .where("BookingProductId", "=", product.BookingProductId)
                .update({
                    StaffEarning: parseFloat(finalCalc.toFixed(2)),
                    LastUpdated: zone.getLastUpdate()
                });
                if(rateApplied.length > 0){
                    const insertAppliedRate = await knex(BOOKING_PRODUCT_APPLIED_RATE).insert(rateApplied)
                }
                console.log("finalCalc",parseFloat(finalCalc.toFixed(2)))
            }
        }
        
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}

module.exports.notifyPreBookingEmail = async event => {
    /**
     * Function Objective: notify user for booking before 15 mins.
     * Working: 
     * 1. Fetch confirmed bookings which are starting in next 15 mins.
     * 2. Send push to the user if not already sent & user has FcmToken.
     */
    let knex, connected = false, notifiedBookings = [];
    try {
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        knex = require("knex")(con);
        connected = true;
        let curTime = moment();
        let startTime = moment().add(24, "hour");
        let preNotifyTime = moment().add(3, "hour");
        //console.log(startTime);
        //console.log(preNotifyTime);
        // let curTime = moment("11/01/2021 10:15", "DD/MM/YYYY HH:mm");
        // let startTime = moment("11/01/2021 10:15", "DD/MM/YYYY HH:mm").add(15, "minute");        
        let bookingsToNotify = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".UserNotifiedPreBookingEmail",
                BOOKINGS + ".Created",
                BOOKINGS + '.Street',
                BOOKINGS + '.HouseNumber',
                BOOKINGS + '.Floor',
                BOOKINGS + '.City',
                BOOKINGS + '.Zip',
                BOOKINGS + '.Elevator',
                BOOKINGS + '.Distance',
                USERS + ".FcmToken",
                USERS + ".Email",
                USERS + ".Name"
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .where(BOOKINGS + ".Status", "=", BOOKING_STATUS.CONFIRMED)
            .andWhere(BOOKINGS + ".DateTime", ">=", curTime.toDate())
            .andWhere(BOOKINGS + ".DateTime", "<=", startTime.toDate())
            .andWhere(BOOKINGS + ".UserNotifiedPreBookingEmail", "<", BOOKING_NOTIFICATION.THREE_HOUR_NOTIFIED)
            .modify(function(qb){
           console.log( qb.toSQL().toNative())
        });
        console.log("bookingsToNotify",bookingsToNotify);
        if (bookingsToNotify.length > 0) {
            for (let bookingInc = 0; bookingInc < bookingsToNotify.length; bookingInc++) {
                const booking = bookingsToNotify[bookingInc];
                STAFF_ZONE = zone.getStaffZone(booking.DateTime);
                let products = await knex(BOOKING_PRODUCTS).select("*")
                    .where("BookingId", "=", booking.BookingId)
                switch (booking.UserNotifiedPreBookingEmail) {
                    case 0: {
                        // no notifications sent, send full day notification
                        console.log("sending 24hrs email notification, Booking #" + booking.BookingId);

                        const userNotified = await knex(BOOKINGS)
                            .where("BookingId", "=", booking.BookingId)
                            .update({
                                UserNotifiedPreBookingEmail: BOOKING_NOTIFICATION.FULL_DAY_NOTIFIED,
                                LastUpdated: zone.getLastUpdate()
                            })

                        //console.log(moment(booking.DateTime).subtract(48, 'hours'));
                        //console.log(moment(booking.Created));
                        if (moment(booking.DateTime).subtract(48, 'hours').isAfter(moment(booking.Created))) {
                            //console.log("send 24hr email notification, BOOKING #" + booking.BookingId);
                            try {
                                let emailHtm = `
            <div>
                <div>
                    <p>Hi ${booking.Name},</p>`;
                                emailHtm += `<p>This is a reminder for your upcoming booking with COCON.</p>`;
                                emailHtm += `
                    <p>
                        Your booking details are as follows:<br/>
                        <ul>`
                                for (let inc = 0; inc < products.length; inc++) {
                                    let bookingDateTime = momentz.tz(products[inc].StartTime, process.env.STAFF_ZONE).format("dddd, MMM DD YYYY, HH:mm" + " " + DATE_TIME_FORMAT.z);

                                    let bookingAddress = (booking.Floor ? booking.Floor + ", " : "") + (booking.Street ? booking.Street + " " : "") + (booking.HouseNumber ? booking.HouseNumber + ", " : "") + (booking.City ? ", " + booking.City : "") + (booking.Zip ? ", " + booking.Zip : "");
                                    emailHtm += `<li> 
                            <span style="font-weight: bold">${products[inc].Product}</span> with COCON <span style="font-weight: bold">${bookingDateTime}</span> at:<br/> <span style="font-weight: bold">${bookingAddress}</span>
                            </li>`
                                }

                                emailHtm += `</ul>
                    </p>
                    
                </div>
                <div>
                    
                    Thank you, and if you have any questions you can reply to this email.
                    Ilona - COCON Customer Care
                </div>
                
                <div>
                    <p style="color:rgb(153,153,153)">COCON Company BV</p>
                    <img width="100px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email_full.png">
                    <br/>
                    <a style="color:rgb(153,153,153);" href="www.coconcompany.com">
                        www.coconcompany.com
                    </a>
                    <p>Mobile +31 6 3338 8321</p>
                </div>
                <div>
                    <a href="https://apps.apple.com/nl/app/cocon/id1516229591?l=en" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://apps.apple.com/nl/app/cocon/id1516229591?l%3Den&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw1mgdaPzEo3AwJCr9x7ESO7"><img src="https://ci5.googleusercontent.com/proxy/BKZbpzqKA6BgLuJQYxD4GvXNfMqPQg6v-lbfjzlEY3FtKJz92YUvQ-jjI6oKiGxU1y5pxbfXH3fViK05Zt4FxagtUe-RzZZSayI0LWt65NRP1DrqbZ96hYcaoPC0_l_N1OZW_trba02DJOrxLay2gaW3hZvzZffoB9_5bzJbqXYvWXy38gkkDeiJpHNnL0-CI3XU9FsIvZAtXKEjvQ=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1KpBT3YXhBT3R6LkmBDx9lKaeCsGZg0PP&amp;revid=0B1KzZhdJB-M_c0JiRUgyS3ZJQzVUczMwZ3E2aHFmL0Z1QVdFPQ" width="96" height="31" class="CToWUd"></a>
                    <a href="https://play.google.com/store/apps/details?id=com.cocon.coconapp" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://play.google.com/store/apps/details?id%3Dcom.cocon.coconapp&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw2bzE5EHD6VKApeyrad9i3N"><img src="https://ci6.googleusercontent.com/proxy/-oHmVQTNsR0h3KP-iIRYyPO4CwZ--CXfg854AojZdwYd7oOAY0hC9Ck20rUHZDmwNVzgD37PVnUAr-K-EkDqYqd9ZeezP2_di4upVKyUKBZ-yreJt1Ece26VzlEsWzPfcLBWlU09sGGknucLtRXzx5X7JVhtozzWBfXlVLFaUxyNG0nd-dwn3UD6ahQTFyYQsQJPy5MGiw4PZM0n2w=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1n2tlCa8DBS2eFcsM9WR0cwB_YpUOsuxV&amp;revid=0B1KzZhdJB-M_YTdHTUxraVhQRFJCTWUzZFdWN3c3dU1JOU9nPQ" width="96" height="31" style="font-family:Arial,Helvetica,sans-serif;color:rgb(32,33,36)" class="CToWUd"></a>
                </div>
                <div style="color: rgb(102,102,102);font-family: Optima;font-size: x-small;">
                    The information contained in this e-mail may be confidential and is intended solely for the attention and use of the named addressee(s). The use or distribution of this information by others than the named addressee(s) is not allowed. If you are not the intended recipient, please notify the sender and delete this e-mail message. COCON Company B.V. is registered at the Chamber of Commerce under number 76264580.
                </div>
            </div>
            `;
                                let toMails = [booking.Email];
                                let mailOptions = {
                                    from: process.env.EMAIL,
                                    to: toMails.join(", "),
                                    subject: `Upcoming booking with COCON`,
                                    html: emailHtm
                                }
                                let smtpTransport = nodemailer.createTransport({
                                    service: "gmail",
                                    auth: {
                                        type: "OAuth2",
                                        user: process.env.EMAIL,
                                        clientId: process.env.CLIENT_ID,
                                        clientSecret: process.env.CLIENT_SECRET,
                                        refreshToken: process.env.REFRESH_TOKEN,
                                        // accessToken: accessToken.token,
                                    }
                                })
                                console.log("emailHtm",emailHtm);
                                let sendingMail = await sendMail(smtpTransport, mailOptions);

                                await holdfor10secs();
                            } catch (error) {
                                //console.log(error);
                            }
                        }
                        break;
                    }
                    case 1: {
                        // full day notification already sent, check if booking start time is in next 30 mins, then send half hour notification
                        if (moment(booking.DateTime).isBefore(preNotifyTime)) {
                            console.log("sending 3 hour notification");
                            console.log("BOOKING #" + booking.BookingId);
                            try {
                                let emailHtm = `
            <div>
                <div>
                    <p>Hi ${booking.Name},</p>`;
                                emailHtm += `<p>This is a reminder for your upcoming booking with COCON.</p>`;
                                emailHtm += `
                    <p>
                        Your booking details are as follows:<br/>
                        <ul>`
                                for (let inc = 0; inc < products.length; inc++) {
                                    let bookingDateTime = momentz.tz(products[inc].StartTime, process.env.STAFF_ZONE).format("dddd, MMM DD YYYY, HH:mm" + " " + DATE_TIME_FORMAT.z);
                                    let bookingAddress = (booking.Floor ? booking.Floor + ", " : "") + (booking.Street ? booking.Street + " " : "") + (booking.HouseNumber ? booking.HouseNumber + ", " : "") + (booking.City ? ", " + booking.City : "") + (booking.Zip ? ", " + booking.Zip : "");
                                    emailHtm += `<li> 
                            <span style="font-weight: bold">${products[inc].Product}</span> with COCON <span style="font-weight: bold">${bookingDateTime}</span> at:<br/> <span style="font-weight: bold">${bookingAddress}</span>
                            </li>`
                                }

                                emailHtm += `</ul>
                    </p>
                    
                </div>
                <div>
                    
                    Thank you, and if you have any questions you can reply to this email.
                    Ilona - COCON Customer Care
                </div>
                
                <div>
                    <p style="color:rgb(153,153,153)">COCON Company BV</p>
                    <img width="100px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email_full.png">
                    <br/>
                    <a style="color:rgb(153,153,153);" href="www.coconcompany.com">
                        www.coconcompany.com
                    </a>
                    <p>Mobile +31 6 3338 8321</p>
                </div>
                <div>
                    <a href="https://apps.apple.com/nl/app/cocon/id1516229591?l=en" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://apps.apple.com/nl/app/cocon/id1516229591?l%3Den&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw1mgdaPzEo3AwJCr9x7ESO7"><img src="https://ci5.googleusercontent.com/proxy/BKZbpzqKA6BgLuJQYxD4GvXNfMqPQg6v-lbfjzlEY3FtKJz92YUvQ-jjI6oKiGxU1y5pxbfXH3fViK05Zt4FxagtUe-RzZZSayI0LWt65NRP1DrqbZ96hYcaoPC0_l_N1OZW_trba02DJOrxLay2gaW3hZvzZffoB9_5bzJbqXYvWXy38gkkDeiJpHNnL0-CI3XU9FsIvZAtXKEjvQ=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1KpBT3YXhBT3R6LkmBDx9lKaeCsGZg0PP&amp;revid=0B1KzZhdJB-M_c0JiRUgyS3ZJQzVUczMwZ3E2aHFmL0Z1QVdFPQ" width="96" height="31" class="CToWUd"></a>
                    <a href="https://play.google.com/store/apps/details?id=com.cocon.coconapp" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://play.google.com/store/apps/details?id%3Dcom.cocon.coconapp&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw2bzE5EHD6VKApeyrad9i3N"><img src="https://ci6.googleusercontent.com/proxy/-oHmVQTNsR0h3KP-iIRYyPO4CwZ--CXfg854AojZdwYd7oOAY0hC9Ck20rUHZDmwNVzgD37PVnUAr-K-EkDqYqd9ZeezP2_di4upVKyUKBZ-yreJt1Ece26VzlEsWzPfcLBWlU09sGGknucLtRXzx5X7JVhtozzWBfXlVLFaUxyNG0nd-dwn3UD6ahQTFyYQsQJPy5MGiw4PZM0n2w=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1n2tlCa8DBS2eFcsM9WR0cwB_YpUOsuxV&amp;revid=0B1KzZhdJB-M_YTdHTUxraVhQRFJCTWUzZFdWN3c3dU1JOU9nPQ" width="96" height="31" style="font-family:Arial,Helvetica,sans-serif;color:rgb(32,33,36)" class="CToWUd"></a>
                </div>
                <div style="color: rgb(102,102,102);font-family: Optima;font-size: x-small;">
                    The information contained in this e-mail may be confidential and is intended solely for the attention and use of the named addressee(s). The use or distribution of this information by others than the named addressee(s) is not allowed. If you are not the intended recipient, please notify the sender and delete this e-mail message. COCON Company B.V. is registered at the Chamber of Commerce under number 76264580.
                </div>
            </div>
            `;
                                let toMails = [booking.Email];
                                let mailOptions = {
                                    from: process.env.EMAIL,
                                    to: toMails.join(", "),
                                    subject: `Upcoming booking with COCON`,
                                    html: emailHtm
                                }
                                let smtpTransport = nodemailer.createTransport({
                                    service: "gmail",
                                    auth: {
                                        type: "OAuth2",
                                        user: process.env.EMAIL,
                                        clientId: process.env.CLIENT_ID,
                                        clientSecret: process.env.CLIENT_SECRET,
                                        refreshToken: process.env.REFRESH_TOKEN,
                                        // accessToken: accessToken.token,
                                    }
                                })
                                console.log("emailHtm",emailHtm);
                                let sendingMail = await sendMail(smtpTransport, mailOptions);
                                //console.log(sendingMail);

                                await holdfor10secs();
                            } catch (error) {
                                //console.log(error);
                            }

                            const userNotified = await knex(BOOKINGS)
                                .where("BookingId", "=", booking.BookingId)
                                .update({
                                    UserNotifiedPreBookingEmail: BOOKING_NOTIFICATION.THREE_HOUR_NOTIFIED,
                                    LastUpdated: zone.getLastUpdate()
                                })

                        }
                        break;
                    }
                    case 2: {
                        // all the notifications are sent, do nothing
                        break;
                    }
                }

            }
        }

        await knex.destroy();
    } catch (error) {
        //console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 500,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.CRON_SUCCESS
        },
        body: JSON.stringify({
            Data: notifiedBookings
        })
    }
}

module.exports.calculateAddonStaffRate = async (event) => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        console.log(json)
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        let bookingProduct = await knex(BOOKING_PRODUCTS).select("*").where("BookingId", "=", json.BookingId);
        console.log(bookingProduct)
        let updateObj=[] 
        let rateApplied = [] 
        if (bookingProduct.length > 0) {
            for (let inc = 0; inc < bookingProduct.length; inc++) {
                let product = bookingProduct[inc]
                const weekdayNumber = product.StartTime.getDay();

                // Convert the weekday number to the corresponding weekday name
                const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const weekdayName = weekdays[weekdayNumber];
                let startTime = moment(product.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                let addOnsData = await knex(BOOKING_PRODUCT_ADDONS)
                    .select(
                        "BookingProductAddOnId",
                        "BookingProductId",
                        "AddOn",
                        "Duration",
                        "ExtraAddOn",
                        "StaffAmount",
                        "BookingAddOnPaymentId",
                        "RequestStatus",
                    )
                    .where("BookingProductId", "=", product.BookingProductId);

                let totalDuration = product.Duration
                let AddonToCalculate=[]
                console.log(addOnsData);
                if (addOnsData.length > 0) {
                    addOnsData.forEach(addOn => {
                        if (!addOn.ExtraAddOn) {
                            totalDuration += addOn.Duration
                        } else {
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                totalDuration += addOn.Duration;
                            }else if(addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING){
                                AddonToCalculate.push(addOn)
                            }
                        }
                    });
                }
                console.log(totalDuration);
                let bookingEndTime = moment(product.StartTime).add(totalDuration, "minutes").tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                console.log("bookingEndTime",bookingEndTime)
                
            
            // loop over to calculate staff earning for each requested Add-on, the calculation will consider the accepted add-on and booking duration only
            
            console.log("AddonToCalculate",AddonToCalculate)  
            if(AddonToCalculate.length > 0 ){
               let  hourlyRate = await knex(CATEGORY_HOURLY_RATE).select("*")
                        .where("CategoryId", "=", product.CategoryId)
                        .orderBy('StartTime', 'asc')
                        .modify(queryBuilder => {

                            console.log(queryBuilder.toSQL().toNative())
                        })
               try{
                AddonToCalculate.forEach(async addOnData => {
                    let finalCalc = 0
                    let rateApplied = []
                    let addOnStartTime = bookingEndTime
                    let duration = addOnData.Duration
                    // let addOnEndTime = moment(moment(addOnStartTime,DATE_TIME_FORMAT.HHcmm)).add(duration, "minutes").tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                    let addOnEndTime = momentz.tz(addOnStartTime,DATE_TIME_FORMAT.HHcmmcss, process.env.STAFF_ZONE).add(duration, "minutes").format(DATE_TIME_FORMAT.HHcmm)
                    // get hourly rate
                    console.log(addOnStartTime)
                    console.log(addOnEndTime)
                   
                    
                   try{
                    console.log("hpurlyRate",hourlyRate)
                    if (hourlyRate.length > 0) {
                        hourlyRate.forEach(rateData => {
                            let dayRate = weekdayName + 'Rate'
                            let hourRate = rateData[dayRate]
                            console.log("hourRate", hourRate)
                            let perMinuteRate = hourRate / 60
                            // let rateStart = moment(rateData.StartTime, DATE_TIME_FORMAT.HHcmmcss).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                            // let rateEnd = moment(rateData.EndTime, DATE_TIME_FORMAT.HHcmmcss).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                            
                            let rateStart = momentz.tz(rateData.StartTime,DATE_TIME_FORMAT.HHcmmcss, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                        let rateEnd = momentz.tz(rateData.EndTime,DATE_TIME_FORMAT.HHcmmcss, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                            console.log("start",rateStart)
                            console.log("start",rateEnd)
                            if (moment(rateStart, DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(addOnStartTime, DATE_TIME_FORMAT.HHcmm)) && moment(rateEnd, DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(addOnStartTime, DATE_TIME_FORMAT.HHcmm))) {
                                // start time is in between check if end time is also in between or calculate the minutes
                                if (moment(rateStart, DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(addOnEndTime, DATE_TIME_FORMAT.HHcmm)) && moment(rateEnd, DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(addOnEndTime, DATE_TIME_FORMAT.HHcmm))) {
                                    console.log("block is in range")
                                    //block is in range
                                    let totalMinutes = duration
                                    finalCalc += perMinuteRate * totalMinutes
                                    console.log("totalMinutes", totalMinutes)
                                    console.log("finalCalc", finalCalc)
                                    console.log("perMinuteRate", perMinuteRate)
                                    let rateAppliedObj = {
                                        BookingProductAddOnId: addOnData.BookingProductAddOnId,
                                        BookingProductId: addOnData.BookingProductId,
                                        Rate: hourRate,
                                        ...zone.getCreateUpdate()
                                    }
                                    rateApplied.push(rateAppliedObj)
                                } else {
                                    //only start time is in range
                                    console.log("only start time is in range")
                                    let startMoment = moment(addOnStartTime, DATE_TIME_FORMAT.HHcmm);
                                    let endMoment = moment(rateEnd, DATE_TIME_FORMAT.HHcmm)
                                    console.log("startM",startMoment)
                                console.log("endMoment",endMoment)
                                    let totalMinutes = endMoment.diff(startMoment, 'minutes');
                                    finalCalc += perMinuteRate * totalMinutes
                                    console.log("totalMinutes", totalMinutes)
                                    console.log("finalCalc", finalCalc)
                                    console.log("perMinuteRate", perMinuteRate)
                                    let rateAppliedObj = {
                                        BookingProductAddOnId: addOnData.BookingProductAddOnId,
                                        BookingProductId: addOnData.BookingProductId,
                                        Rate: hourRate,
                                        ...zone.getCreateUpdate()
                                    }
                                    rateApplied.push(rateAppliedObj)

                                }
                            } else {
                                if (moment(rateStart, DATE_TIME_FORMAT.HHcmm).isSameOrBefore(moment(addOnEndTime, DATE_TIME_FORMAT.HHcmm)) && 
                                moment(rateEnd, DATE_TIME_FORMAT.HHcmm).isSameOrAfter(moment(addOnEndTime, DATE_TIME_FORMAT.HHcmm))) {
                                    console.log("only end time is in range")
                                let startMoment = moment(rateStart, DATE_TIME_FORMAT.HHcmm)
                                let endMoment = moment(addOnEndTime, 'HH:mm');
                                console.log("startM",startMoment)
                                console.log("endMoment",endMoment)
                                let totalMinutes = endMoment.diff(startMoment, 'minutes');
                                finalCalc += perMinuteRate * totalMinutes
                                console.log("totalMinutes", totalMinutes)
                                console.log("finalCalc", finalCalc)
                                console.log("perMinuteRate", perMinuteRate)
                                let rateAppliedObj = {
                                    BookingProductAddOnId: addOnData.BookingProductAddOnId,
                                    BookingProductId: addOnData.BookingProductId,
                                    Rate: hourRate,
                                    ...zone.getCreateUpdate()
                                }
                                rateApplied.push(rateAppliedObj)
                                }else{
                                    console.log("no range")
                                    finalCalc += 0
                                // console.log("totalMinutes", totalMinutes)
                                console.log("finalCalc", finalCalc)
                                console.log("perMinuteRate", perMinuteRate)
                                let rateAppliedObj = {
                                    BookingProductAddOnId: addOnData.BookingProductAddOnId,
                                    BookingProductId: addOnData.BookingProductId,
                                    Rate: 0,
                                    ...zone.getCreateUpdate()
                                }
                                rateApplied.push(rateAppliedObj)
                                }
                                //only end time is in range
                                
                            }
                        });
                    } else {
                        finalCalc = 0
                    }
                    
                    console.log("finalCalc", parseFloat(finalCalc.toFixed(2)))
                    updateObj.push({
                        BookingProductAddOnId: addOnData.BookingProductAddOnId,
                        StaffEarning: parseFloat(finalCalc.toFixed(2)),
                        LastUpdated: zone.getLastUpdate()
                    })
                   }catch(error){
                    console.log(error)
                   }


                })
                 console.log("updateObj",updateObj)
                console.log("updateObj",updateObj)
                    // Run update queries in a loop
                
                   
               }catch(error){
                console.log(error)
               }
            }
               
                // console.log("finalCalc",parseFloat(finalCalc.toFixed(2)))
            }
            try {
                if (updateObj.length > 0) {
                   await updateObjects(knex,updateObj);
                }
                    
                    console.log('All updates completed successfully');
                 
            
       

        if(rateApplied.length > 0){
            const insertAppliedRate = await knex(BOOKING_PRODUCT_APPLIED_RATE).insert(rateApplied)
        }
    }
        catch (error) {
            console.error('Error updating rows:', error);
        } finally {
            // Close the database connection
            knex.destroy();
        }
        }
        
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}
async function updateObjects(knex, objects) {
    try {
        for (const obj of objects) {
            // Assuming 'knex' is your Knex instance
            await knex(BOOKING_PRODUCT_ADDONS)
            .where("BookingProductAddOnId", "=", obj.BookingProductAddOnId)
            .update({
                StaffEarning: obj.StaffEarning,
                LastUpdated: zone.getLastUpdate()
            });
        }
    } catch (error) {
        console.error('Error updating objects:', error);
    }
}


module.exports.sendOrganisationConfEmail = async event => {
    let knex, connected = false;
    try {
        // const json = event.body ? getPayloadData(event) : null;
        const json = event;
        if (!json || !json.BookingId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR)
        }
        knex = require("knex")(con);
        connected = true;
        let bookingRaw = await bookingDetail(knex, json.BookingId);
        let productNames = ""
        let productsDescription = ""
        bookingRaw.Products.forEach((product, index) => {
            // Normal product names for subject line
            productNames += product.ProductName;
            if (index < bookingRaw.Products.length - 1) {
                productNames += ", ";
            }
            // Calculate the product total duration
            var productDuration = product.Duration;
            product.AddOns.map(addOn => {
                productDuration = productDuration + addOn.Duration
            });
            product.TotalDuration = productDuration
            // Prepare product name and timing string
            productsDescription += `${product.ProductName} - ${productDuration}m (${momentz.tz(product.StartTime, process.env.STAFF_ZONE).format('HH:mm')} - ${momentz.tz(product.StartTime, process.env.STAFF_ZONE).add(product.TotalDuration, "minute").format('HH:mm')})`;
            if (index < bookingRaw.Products.length - 1) {
                productsDescription += ", <br/>";
            }
        });
        
        
       
        let bookingDateTime = momentz.tz(bookingRaw.DateTime, process.env.STAFF_ZONE).format("dddd, MMM DD YYYY, HH:mm" + " " + DATE_TIME_FORMAT.z);
        let bookingAddress = (bookingRaw.Floor ? bookingRaw.Floor + ", " : "") + (bookingRaw.Street?bookingRaw.Street+" ":"") + (bookingRaw.HouseNumber ? bookingRaw.HouseNumber + ", " : "")+ (bookingRaw.City ? ", " + bookingRaw.City : "") + (bookingRaw.Zip ? ", " + bookingRaw.Zip : "");
        
            let emailHtm = `
            <div>
                <div>
                    <p>Hi ${bookingRaw.OrganisationName},</p>`;
            
                emailHtm += `A new booking has been created on your behalf, please contact support if not requested by you.`;
            
            emailHtm += `
                    <p>
                        Your booking details are as follows:<br/>
                        <span style="font-weight: bold">${productsDescription}</span> with COCON <span style="font-weight: bold">${bookingDateTime}</span></span>
                    </p>
                   
                </div>
                <div>
                    Thank you, and if you have any questions you can reply to this email.
                    Ilona - COCON Customer Care
                </div>
                
                <div>
                    <p style="color:rgb(153,153,153)">COCON Company BV</p>
                    <img width="100px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email_full.png">
                    <br/>
                    <a style="color:rgb(153,153,153);" href="www.coconcompany.com">
                        www.coconcompany.com
                    </a>
                    <p>Mobile +31 6 3338 8321</p>
                </div>
                <div>
                    <a href="https://apps.apple.com/nl/app/cocon/id1516229591?l=en" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://apps.apple.com/nl/app/cocon/id1516229591?l%3Den&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw1mgdaPzEo3AwJCr9x7ESO7"><img src="https://ci5.googleusercontent.com/proxy/BKZbpzqKA6BgLuJQYxD4GvXNfMqPQg6v-lbfjzlEY3FtKJz92YUvQ-jjI6oKiGxU1y5pxbfXH3fViK05Zt4FxagtUe-RzZZSayI0LWt65NRP1DrqbZ96hYcaoPC0_l_N1OZW_trba02DJOrxLay2gaW3hZvzZffoB9_5bzJbqXYvWXy38gkkDeiJpHNnL0-CI3XU9FsIvZAtXKEjvQ=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1KpBT3YXhBT3R6LkmBDx9lKaeCsGZg0PP&amp;revid=0B1KzZhdJB-M_c0JiRUgyS3ZJQzVUczMwZ3E2aHFmL0Z1QVdFPQ" width="96" height="31" class="CToWUd"></a>
                    <a href="https://play.google.com/store/apps/details?id=com.cocon.coconapp" style="color:rgb(17,85,204)" target="_blank" data-saferedirecturl="https://www.google.com/url?q=https://play.google.com/store/apps/details?id%3Dcom.cocon.coconapp&amp;source=gmail&amp;ust=1652526207931000&amp;usg=AOvVaw2bzE5EHD6VKApeyrad9i3N"><img src="https://ci6.googleusercontent.com/proxy/-oHmVQTNsR0h3KP-iIRYyPO4CwZ--CXfg854AojZdwYd7oOAY0hC9Ck20rUHZDmwNVzgD37PVnUAr-K-EkDqYqd9ZeezP2_di4upVKyUKBZ-yreJt1Ece26VzlEsWzPfcLBWlU09sGGknucLtRXzx5X7JVhtozzWBfXlVLFaUxyNG0nd-dwn3UD6ahQTFyYQsQJPy5MGiw4PZM0n2w=s0-d-e1-ft#https://docs.google.com/uc?export=download&amp;id=1n2tlCa8DBS2eFcsM9WR0cwB_YpUOsuxV&amp;revid=0B1KzZhdJB-M_YTdHTUxraVhQRFJCTWUzZFdWN3c3dU1JOU9nPQ" width="96" height="31" style="font-family:Arial,Helvetica,sans-serif;color:rgb(32,33,36)" class="CToWUd"></a>
                </div>
                <div style="color: rgb(102,102,102);font-family: Optima;font-size: x-small;">
                    The information contained in this e-mail may be confidential and is intended solely for the attention and use of the named addressee(s). The use or distribution of this information by others than the named addressee(s) is not allowed. If you are not the intended recipient, please notify the sender and delete this e-mail message. COCON Company B.V. is registered at the Chamber of Commerce under number 76264580.
                </div>
            </div>
            `;
            let toMails = [bookingRaw.OrganisationEmail];
            let mailOptions = {
                from: process.env.EMAIL,
                to: toMails.join(", "),
                subject: `COCON Booking Confirmation - ${productNames} at ${bookingDateTime}`,
                html: emailHtm
            }
            let smtpTransport = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: process.env.EMAIL,
                    clientId: process.env.CLIENT_ID,
                    clientSecret: process.env.CLIENT_SECRET,
                    refreshToken: process.env.REFRESH_TOKEN,
                    // accessToken: accessToken.token,
                }
            })
            let sendingMail = await sendMail(smtpTransport, mailOptions);
            //console.log(sendingMail);
        
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        //console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}

module.exports.setBookingComplete = async (event) => {
   
    let knex = require("knex")(con);
    connected = true;
    try {
        let todayStart = moment().startOf("day").toDate();
        let bookingsToComplete=[]
        let statusNotToInclude = [
            BOOKING_STATUS.CANCELLED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.UPDATED_TO_NEW,
            BOOKING_STATUS.CANCELLED_MANUALLY,
            BOOKING_STATUS.INCONCLUSIVE,
            BOOKING_STATUS.DRAFT,
            BOOKING_STATUS.CANCELLED_DRAFT,
            BOOKING_STATUS.TEMP_BOOKING,
            BOOKING_STATUS.COMPLETED,
        ];
        let bookingsData = await knex
            .select(
                BOOKINGS + '.BookingId',
                BOOKINGS + '.PaymentStatus',
                BOOKINGS + '.OrganisationLocationId',
            )
            .from(BOOKINGS)
            .whereNotIn(BOOKINGS + ".Status", statusNotToInclude)
            .where(BOOKINGS + ".DateTime", "<", todayStart)
            .modify(qb => {
                    
                console.log(console.log(qb.toSQL().toNative()));
            })
            console.log(bookingsData)
        if (bookingsData.length > 0) {

            bookingsData.forEach(booking => {
                if(booking.OrganisationLocationId){
                    bookingsToComplete.push(booking.BookingId)
                }else{
                    if(booking.PaymentStatus==BOOKING_PAYMENT_STATUS.SUCCEEDED || booking.PaymentStatus==BOOKING_PAYMENT_STATUS.NOT_REQUIRED){
                        bookingsToComplete.push(booking.BookingId)
                    }
                }

            })
            // const idArray = bookingsData.map(booking => booking.BookingId);
            console.log(bookingsToComplete)
            let updateObj = {
                Status: BOOKING_STATUS.COMPLETED,
                LastUpdated: zone.getLastUpdate()

            }
            let updateProductObj = {
                Status: BOOKING_PRODUCT_STATUS.COMPLETED,
                LastUpdated: zone.getLastUpdate()

            }
            let updateAddonObj = {
                Status: BOOKING_PRODUCT_ADD_ON_STATUS.COMPLETED,
                LastUpdated: zone.getLastUpdate()

            }
            let bookingUpdated = await knex(BOOKINGS)
                .whereIn("BookingId", bookingsToComplete)
                .update(updateObj);

            let bookingProdUpdated = await knex(BOOKING_PRODUCTS)
                .whereIn("BookingId", bookingsToComplete)
                .update(updateProductObj);
            
            let bookingAddonUpdated = await knex(BOOKING_PRODUCT_ADDONS)
                .whereIn("BookingId", bookingsToComplete)
                .update(updateAddonObj);
        }
        else {
            console.log("Nothing to update")
        }



    }
    catch (error) {
        if (connected) {
            await knex.destroy();
        }
        console.log(error);
        return {
            statusCode: RESPONSE_CODE.BAD_REQUEST
        }
    }
    return {
        statusCode: RESPONSE_CODE.SUCCESS
    }
}