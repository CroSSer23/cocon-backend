const { verifyAccessToken, verifyAnonymousToken } = require("./authorize")
const { Headers } = require("../header");
const { con } = require("../db");
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const compareVersions = require('compare-versions');
const {
    STAFF,
    CENTER,
    CATEGORIES,
    STAFF_BLOCK_TIME,
    STAFF_CATEGORY,
    STAFF_SCHEDULE,
    BOOKINGS,
    BOOKING_PRODUCTS,
    BOOKING_PRODUCT_EXTRA,
    USERS,
    GUESTS,
    BOOKING_PRODUCT_ADDONS,
    BOOKING_ADDON_PAYMENTS,
    MESSAGES,
    STAFF_MESSAGES,
    STAFF_VACATIONS,
    STAFF_REGISTRATION,
    STAFF_METADATA,
    STAFF_GROUP,
    STAFF_PRODUCT,
    PRODUCTS,
    PRODUCT_TRANSLATIONS,
    BOOKING_PRODUCT_DISPATCH,
    USER_MESSAGES,
    SOS_CONTACT,
    PRODUCT_DURATIONS,
    ADDON_CATEGORY,
    ADDONS,
    BOOKING_EXTRA,
    BOOKING_SPECIAL_REQUEST,
    STAFF_ORGANISATION,
    ORGANISATION_LOCATION,
    ADMIN_NOTIFICATION_CONTACT,
    STAFF_ACCOUNT_DELETE_FEEDBACK,
    SPECIAL_REQUEST
} = require("../tables");
const zone = require("../zone");
const DELETE_FLAG = 0;
const {
    InitializeFirebase,
    InitializeFirebaseTherapist,
    validateEmail,
    checkHeaders,
    getInstanceURL,
    getPayloadData,
    setPayloadData,
    getLambdaNameByInstance
} = require("../util");

const {
    STAFF_STATUS,
    BOOKING_STATUS,
    BOOKING_PRODUCT_STATUS,
    BOOKING_PRODUCT_ADD_ON_STATUS,
    BOOKING_PAYMENT_STATUS,
    VACATION_STATUS,
    DISPATCH_STATUS,
    ADDON_REQUEST_STATUS,
    BOOKING_PAYMENT_STATUS_DESC,
    BOOKING_STATUS_DESC,
    BOOKING_PRODUCT_STATUS_DESC
} = require("../status");
const {
    VACATION_TEMPLATE,
    SHOW_OUTSIDE_OFFERS,
    AUTO_ACCEPT_ADDON_REQUEST,
    REGISTERED_FROM,
    STAFF_SCHEDULE_TYPE,
    ENUM_DISPATCH_FILTERS,
    PRODUCT_DISPATCH_TYPE,
    MESSAGE_TAG,
    SOS_CONTACT_TYPE,
    DELETE_ENUM,
    STAFF_FILTERS,
    API_CLIENT,
    THERAPIST_PREF,
    LOG_ACTION_TYPE
} = require("../enum");
const { MESSAGE, DATE_TIME_FORMAT, PUSH, OTHERS} = require("../strings");
const { saveLog, } = require("../helpers/common.js");

const moment = require("moment");
const momentz = require("moment-timezone");
const STAFF_MESSAGES_TYPES = [1, 2];

// const STATUS_WAIT_TIME = 120   //minutes
const STATUS_WAIT_TIME = parseInt(process.env.STATUS_WAIT_TIME);  //minutes

const BOOKING_STAFF_CONFLICT_ALLOWED = [
    BOOKING_STATUS.ON_GOING,
    BOOKING_STATUS.CONFIRMED
]

const TYPE = {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN: process.env.REFRESH_TOKEN_TYPE,
    ANONYMOUS_TOKEN: process.env.ANONYMOUS_TOKEN_TYPE
}

const WEEK = [
    {
        Code: 1,
        Day: "Monday",
        DateStart: "MondayStartDate",
        DateEnd: "MondayEndDate",
        DayStart: "MondayStartTime",
        DayEnd: "MondayEndTime",
        Block: "MondayBlockTimeId"
    },
    {
        Code: 2,
        Day: "Tuesday",
        DateStart: "TuesdayStartDate",
        DateEnd: "TuesdayEndDate",
        DayStart: "TuesdayStartTime",
        DayEnd: "TuesdayEndTime",
        Block: "TuesdayBlockTimeId"
    },
    {
        Code: 3,
        Day: "Wednesday",
        DateStart: "WednesdayStartDate",
        DateEnd: "WednesdayEndDate",
        DayStart: "WednesdayStartTime",
        DayEnd: "WednesdayEndTime",
        Block: "WednesdayBlockTimeId"
    },
    {
        Code: 4,
        Day: "Thursday",
        DateStart: "ThursdayStartDate",
        DateEnd: "ThursdayEndDate",
        DayStart: "ThursdayStartTime",
        DayEnd: "ThursdayEndTime",
        Block: "ThursdayBlockTimeId"
    },
    {
        Code: 5,
        Day: "Friday",
        DateStart: "FridayStartDate",
        DateEnd: "FridayEndDate",
        DayStart: "FridayStartTime",
        DayEnd: "FridayEndTime",
        Block: "FridayBlockTimeId"
    },
    {
        Code: 6,
        Day: "Saturday",
        DateStart: "SaturdayStartDate",
        DateEnd: "SaturdayEndDate",
        DayStart: "SaturdayStartTime",
        DayEnd: "SaturdayEndTime",
        Block: "SaturdayBlockTimeId"
    },
    {
        Code: 0,
        Day: "Sunday",
        DateStart: "SundayStartDate",
        DateEnd: "SundayEndDate",
        DayStart: "SundayStartTime",
        DayEnd: "SundayEndTime",
        Block: "SundayBlockTimeId"
    },
]

const { google } = require("googleapis");
const { getDayTimesGOnIC } = require("./timeSlotNew");
// const { bookingStaffNotification } = require("./bookings");
const { cloneDeep, result } = require("lodash");
const { OAuth2 } = google.auth;
const oAuth2Client = new OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET);
oAuth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
});
const calendar = google.calendar({
    version: "v3",
    auth: oAuth2Client
});

const twilioClient = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    {
        region: ""
    }
);
// const currentZone = process.env.STAFF_ZONE;
// const STAFF_ZONE = momentz().tz(currentZone).format(DATE_TIME_FORMAT.Z);
// const STAFF_ZONE = zone.getStaffZone();
let STAFF_ZONE;
const LANGUAGE=1
const DELETED = 0;
const AUTOMATIC_BLOCKTIME_BUFFER = parseInt(process.env.AUTOMATIC_BLOCKTIME_BUFFER);
let AWS = require('aws-sdk');




AWS.config.region = 'us-east-2';





const THER_REF = "therapist/";
const THER_MESSAGE_REF = "messages/therapist/";

const staff = async (knex, staffId = null, criteria=null,staffIds=null,ignoreLimit=false) => {
    const {
        pagination,
        filters,
        search,
        lastUpdated,
        currentIds,
        organisationLocationId
    } = criteria ? criteria : { pagination: { Size: 20, Number: 0 } };
    var pageStaffs = [];
    try {
        if (!staffId && !search) {
            // Get staff ids according to pagination
            pageStaffs = await knex
                .select(STAFF + ".StaffId")
                .from(STAFF)
                .leftJoin(STAFF_CATEGORY, STAFF_CATEGORY + ".StaffId", STAFF + ".StaffId")
                .leftJoin(CATEGORIES, CATEGORIES + ".CategoryId", STAFF_CATEGORY + ".CategoryId")
                .leftJoin(STAFF_PRODUCT, STAFF_PRODUCT + ".StaffCategoryId", STAFF_CATEGORY + ".StaffCategoryId")
                .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", STAFF + ".StaffId")
                .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF + ".StaffId")
                .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", STAFF_ORGANISATION + ".OrganisationLocationId")
                .where(STAFF + ".Deleted", "=", DELETE_FLAG)
                .orderBy(STAFF + ".Created", "desc")
                .groupBy(STAFF + ".StaffId")
                .modify(queryBuilder => {
                    if (filters && filters.length) {
                        let genderFilter = filters.find(f => f.Key === STAFF_FILTERS.GENDER.KEY);
                        if (genderFilter && genderFilter.Values && genderFilter.Values.length) {
                            queryBuilder.where(STAFF + ".Gender", "=", genderFilter.Values[0])
                        }
                        let specialityFilter = filters.find(f => f.Key === STAFF_FILTERS.SPECIALITY.KEY);
                        if (specialityFilter && specialityFilter.Values && specialityFilter.Values.length) {
                            queryBuilder.whereIn(STAFF_CATEGORY + ".CategoryId", specialityFilter.Values)
                        }
                    }

                    if(!ignoreLimit){
                        queryBuilder.limit(pagination.Size);
                    }
                    if (pagination.Number > 1) {
                        let offset = pagination.Size * (pagination.Number - 1);
                        queryBuilder.offset(offset)
                    }
                    if(organisationLocationId){
                        queryBuilder.where(STAFF_ORGANISATION + ".OrganisationLocationId", "=", organisationLocationId)
                    }
                    console.log(queryBuilder.toSQL().toNative())
                });
            pageStaffs = pageStaffs.map(staff => staff.StaffId);
        }
        console.log("pageStaffs",pageStaffs)
        let staffData = await knex
            .select(
                STAFF + ".StaffId",
                STAFF + ".Name",
                STAFF + ".Gender",
                STAFF + ".Contact",
                STAFF + ".Address",
                STAFF + ".GoogleEmail",
                STAFF + ".ImagePath",
                STAFF + ".FcmToken",
                STAFF + ".DeviceId",
                STAFF + ".LastMessageRead",
                STAFF + ".TotalRatings",
                STAFF + ".AverageRating",
                STAFF + ".TipReceived",
                STAFF + ".Status",
                STAFF + ".Zip",
                STAFF + ".City",
                STAFF + ".COCONRating",
                STAFF + ".StaffType",
                STAFF + ".StaffGroupId",
                STAFF + ".GoogleId",
                STAFF + ".FacebookId",
                STAFF + ".AppleIdentifier",
                STAFF + ".CompanyName",
                STAFF + ".IbanNumber",
                STAFF + ".KvkNumber",
                STAFF_METADATA + ".Rank",
                STAFF_METADATA + ".ShowOutsideOffers",
                STAFF_METADATA + ".AutoAcceptAddonRequest",
                STAFF_METADATA + ".IsAddEditScheduleEnable",
                STAFF_CATEGORY + ".StaffCategoryId",
                STAFF_CATEGORY + ".CategoryId",
                STAFF_CATEGORY + ".Rate as CategoryRate",
                CATEGORIES + ".Name as CategoryName",
                STAFF_PRODUCT + ".StaffProductId",
                STAFF_PRODUCT + ".Rate as ProductRate",
                STAFF_PRODUCT + ".ProductId",
                STAFF_GROUP + ".Name as GroupName",
                STAFF+".Sequence",
                STAFF_ORGANISATION+".OrganisationLocationId",
                ORGANISATION_LOCATION+".Name as OrganisationName",
            )
            .from(STAFF)
            .leftJoin(STAFF_CATEGORY, STAFF_CATEGORY + ".StaffId", STAFF + ".StaffId")
            .leftJoin(CATEGORIES, CATEGORIES + ".CategoryId", STAFF_CATEGORY + ".CategoryId")
            .leftJoin(STAFF_PRODUCT, STAFF_PRODUCT + ".StaffCategoryId", STAFF_CATEGORY + ".StaffCategoryId")
            .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", STAFF + ".StaffId")
            .leftJoin(STAFF_GROUP, STAFF_GROUP + ".StaffGroupId", STAFF + ".StaffGroupId")
            .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF + ".StaffId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", STAFF_ORGANISATION + ".OrganisationLocationId")
            .where(STAFF + ".Deleted", "=", DELETE_FLAG)
            .modify(queryBuilder => {
                if (staffId) {
                    queryBuilder.andWhere(STAFF + '.StaffId', "=", staffId)
                } else {
                    if (search) {
                        queryBuilder.andWhere(function () {
                            this.where(STAFF + ".Name", "like", `%${search}%`)
                                .orWhere(STAFF + ".Contact", "like", `%${search}%`)
                                .orWhere(STAFF + ".GoogleEmail", "like", `%${search}%`)
                                .orWhere(STAFF + ".Address", "like", `%${search}%`)
                        })
                        queryBuilder.orderBy(STAFF + ".Created", "desc")
                        if(organisationLocationId){
                            queryBuilder.where(STAFF_ORGANISATION + ".OrganisationLocationId", "=", organisationLocationId)
                        }
                    }
                    if (!search) {
                        // For pagination
                        queryBuilder.whereIn(STAFF + ".StaffId", pageStaffs);
                        if (lastUpdated && currentIds) {
                            // check for mismatched ids fetch to fetch those staff as well
                            var missedStaffsIds = pageStaffs.filter(function (n) {
                                return !this.has(n)
                            }, new Set(currentIds)
                            );
                            queryBuilder.where(STAFF + ".LastUpdated", ">", lastUpdated)
                            queryBuilder.orWhereIn(STAFF + ".StaffId", missedStaffsIds)
                            queryBuilder.orderBy(STAFF + ".Created", "desc")
                        }
                    }
                    if(staffIds && staffIds.length>0){
                        queryBuilder.whereIn(STAFF + ".StaffId", staffIds)
                        queryBuilder.orderBy(STAFF + ".Sequence", "asc")
                    }else{
                        queryBuilder.orderBy(STAFF + ".Sequence", "asc")
                    }
                    

                    console.log(queryBuilder.toSQL().toNative())
                }
            })
            // console.log(staffData)

        var finalData = [];
        for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
            const staff = staffData[staffInc];
            const found = finalData.find(s => s.StaffId === staff.StaffId);
            if (!found) {
                var categories = [];
                if (staff.StaffCategoryId) {
                    categories = [{
                        StaffCategoryId: staff.StaffCategoryId,
                        CategoryId: staff.CategoryId,
                        CategoryName: staff.CategoryName,
                        CategoryRate: staff.CategoryRate,
                        Products: staff.ProductId ? [{
                            ProductId: staff.ProductId,
                            Rate: staff.ProductRate
                        }] : [],
                    }];
                }
                let objToPush = {
                    StaffId: staff.StaffId,
                    Name: staff.Name,
                    Gender: staff.Gender,
                    Contact: staff.Contact,
                    Address: staff.Address,
                    GoogleEmail: staff.GoogleEmail,
                    Categories: categories,
                    ImagePath: staff.ImagePath,
                    ImageURL: null,
                    FcmToken: staff.FcmToken,
                    DeviceId: staff.DeviceId,
                    LastMessageRead: staff.LastMessageRead,
                    TotalRatings: staff.TotalRatings,
                    AverageRating: staff.AverageRating,
                    TipReceived: staff.TipReceived,
                    Status: staff.Status,
                    Zip: staff.Zip,
                    COCONRating: staff.COCONRating,
                    StaffType: staff.StaffType,
                    CategoryIds: staff.CategoryId ? [staff.CategoryId] : [],
                    StaffGroupId: staff.StaffGroupId,
                    GroupName: staff.GroupName,
                    City: staff.City,
                    Rank: staff.Rank,
                    ShowOutsideOffers: staff.ShowOutsideOffers ? true : false,
                    AutoAcceptAddonRequest: staff.AutoAcceptAddonRequest ? true : false,
                    Sequence: staff.Sequence,
                    GoogleId: staff.GoogleId,
                    FacebookId: staff.FacebookId,
                    AppleIdentifier: staff.AppleIdentifier,
                    IsAddEditScheduleEnable:staff.IsAddEditScheduleEnable,
                    CompanyName:staff.CompanyName,
                    IbanNumber:staff.IbanNumber,
                    KvkNumber:staff.KvkNumber,
                    // ProductIds: staff.ProductId ? [staff.ProductId] : [],
                }
                switch (objToPush.Status) {
                    case 0: objToPush.StatusName = "Available"
                        break;
                    case 1: objToPush.StatusName = "Checked In"
                        break;
                    case 2: objToPush.StatusName = "In Treatment"
                        break;
                    case 3: objToPush.StatusName = "Late"
                        break;
                }
                if (objToPush.ImagePath) {
                    objToPush.ImageURL = process.env.BUCKET_URL + objToPush.ImagePath;
                }
                objToPush.Organisations=[]
                objToPush.OrganisationsNames=[]
                if(staff.OrganisationLocationId){
                   
                    objToPush.Organisations.push(staff.OrganisationLocationId)
                    objToPush.OrganisationsNames.push(staff.OrganisationName)
                }
                finalData.push(objToPush);
            } else {
                const categoryFound = found.Categories.find(f => f.CategoryId === staff.CategoryId);
                if (!categoryFound) {
                    found.Categories.push({
                        StaffCategoryId: staff.StaffCategoryId,
                        CategoryId: staff.CategoryId,
                        CategoryName: staff.CategoryName,
                        CategoryRate: staff.CategoryRate,
                        Products: staff.ProductId ? [{
                            ProductId: staff.ProductId,
                            Rate: staff.ProductRate
                        }] : [],
                    })
                    found.CategoryIds.push(staff.CategoryId)
                } else {
                    // Check whether there is productId in staff record
                    if (staff.ProductId) {
                        // const productFound = found.ProductIds.find(id => id === staff.ProductId);
                        // if (!productFound) {
                        //     found.ProductIds.push(staff.ProductId)
                        // }
                        const productFound = categoryFound.Products.find(p => p.ProductId === staff.ProductId);
                        if (!productFound) {
                            categoryFound.Products.push({
                                ProductId: staff.ProductId,
                                Rate: staff.ProductRate
                            });
                        }
                    }

                }
                if(staff.OrganisationLocationId){
                    
                    const orgFound = found.Organisations.find(f => f=== staff.OrganisationLocationId);
                    
                    if(!orgFound){
                        found.Organisations.push(staff.OrganisationLocationId)
                        found.OrganisationsNames.push(staff.OrganisationName)
                    }
                    
                }
            }
        }

    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }

    if (staffId) {
        // Case when only one staff record is requested
        return finalData;
    } else {
        // Case when CMS calling for staff listing, basically for multiple staffs
        return {
            data: finalData,
            currentIds: pageStaffs
        };
    }
}

module.exports.getStaff = async event => {
    var responseBody = {};
    try {
        const knex = require("knex")(con);
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.Pagination || typeof json.Pagination !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var staffData = await staff(knex, null, {
            pagination: json.Pagination,
            filters: json.Filters,
            search: json.Search,
            lastUpdated: json.LastUpdated,
            currentIds: json.CurrentIds,
            organisationLocationId:json.OrganisationLocationId?json.OrganisationLocationId:null
        });
        if (staffData.Error) {
            await knex.destroy();
            throw new Error(staffData.Error);
        }

        responseBody = {
            Data: staffData.data,
            CurrentIds: staffData.currentIds,
            LastUpdated: moment().utc().format(),
            TotalItems: !json.Search ? await getStaffCount(knex, json.Filters,json.OrganisationLocationId) : 0,
            Pagination: {
                ...json.Pagination
            }
        };

        await knex.destroy();
    } catch (error) {
        console.log(error);
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_FETCH_SUCCESS
        },
        body: setPayloadData(event, responseBody)
    }
}

const getStaffCount = async (knex, filters,organisationLocationId) => {
    console.log(organisationLocationId,"organisationLocationId")
    let staffData = await knex
        .count(
            STAFF + ".StaffId"
        )
        .from(STAFF)
        .leftJoin(STAFF_CATEGORY, STAFF_CATEGORY + ".StaffId", STAFF + ".StaffId")
        .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF + ".StaffId")
        .where(STAFF + ".Deleted", "=", DELETE_FLAG)
        .groupBy(STAFF + ".StaffId")
        .modify(queryBuilder => {
            if (filters && filters.length) {
                let genderFilter = filters.find(f => f.Key === STAFF_FILTERS.GENDER.KEY);
                if (genderFilter && genderFilter.Values && genderFilter.Values.length) {
                    queryBuilder.where(STAFF + ".Gender", "=", genderFilter.Values[0])
                }
                let specialityFilter = filters.find(f => f.Key === STAFF_FILTERS.SPECIALITY.KEY);
                if (specialityFilter && specialityFilter.Values && specialityFilter.Values.length) {
                    queryBuilder.whereIn(STAFF_CATEGORY + ".CategoryId", specialityFilter.Values)
                }
                
                
            }
            if(organisationLocationId){
                queryBuilder.where(STAFF_ORGANISATION + ".OrganisationLocationId", "=", organisationLocationId)
            }
            console.log( queryBuilder.toSQL().toNative())
        });
    return staffData.length;
}

module.exports.newStaff = async event => {
    /**
     * API Objective: register new staff in system.
     * Working:
     * 1. Validate the input data.
     * 2. Verify unique email against existing data.
     * 3. Insert staff basic details and categories.
     * 4. Return with staff list.
     */
    let knex, connected = false, response;
    try {
        const headers = event.headers;
        // console.log(headers);
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        // Check for the input parameters according to the platform which called this api
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            // Check for required field from request and there data type
            if (
                !json ||
                !json.Name || typeof json.Name !== "string" ||
                !json.GoogleEmail || typeof json.GoogleEmail !== "string" ||
                !json.RegistrationCode || typeof json.RegistrationCode !== "string" ||
                typeof json.Provider !== 'number' ||
                json.Provider < 0 ||
                json.Provider > 2 ||
                !json.ProviderIdentifier
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        } else if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            // Check for required field from request and there data type
            if (
                !json ||
                !json.Name || typeof json.Name !== "string" ||
                !json.Contact ||
                json.Gender > 1 || json.Gender < 0 || typeof json.Gender !== "number" ||
                !json.GoogleEmail || typeof json.GoogleEmail !== "string" ||
                !json.Categories || typeof json.Categories !== "object" ||
                json.Categories.length === 0 ||
                !json.StaffGroupId ||
                !json.Rank
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            // Check whether skill product and rate per treatment hour is there or not
            json.Categories.forEach(element => {
                if (!element || !element.Products.length) {
                    throw new Error(MESSAGE.INVALID_CATEGORY);
                }
            });
        }

        // Common validation goes here
        if (!validateEmail(json.GoogleEmail)) {
            throw new Error(MESSAGE.INVALID_EMAIL);
        }

        knex = require("knex")(con);
        connected = true;
        let staffExist = await knex(STAFF).select("StaffId", "Deleted").where("GoogleEmail", "=", json.GoogleEmail);
        let staffMailAllExist = false;
        if (staffExist.length > 0) {
            for (let staffInc = 0; staffInc < staffExist.length; staffInc++) {
                const staff = staffExist[staffInc];
                if (staff.Deleted === DELETE_FLAG) {
                    staffMailAllExist = true;
                }
            }
        }

        if (staffMailAllExist) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.STAFF_EMAIL_ALREADY_EXIST

                }
            }
        }
        let staffId;
        var newStaffId = null;
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            // Check the registration code is not used.
            var registrationData = await knex(STAFF_REGISTRATION)
                .select()
                .where("RegistrationCode", "=", json.RegistrationCode);

            if (registrationData[0].IsRegCodeUsed) {
                // Case when code is already used, return error
                knex.destroy();
                return {
                    statusCode: 410,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.REGISTRATION_CODE_USED
                    }
                }
            }
            let deviceId = headers['device-id'];
            // Insert data in "Staff" table
            const obj = {
                Name: json.Name,
                GoogleEmail: json.GoogleEmail,
                FcmToken: json.FcmToken ? json.FcmToken : null,
                ImagePath: json.ImagePath ? json.ImagePath : null,
                DeviceId: deviceId,
                Platform: headers['platform'],
                GoogleId: json.Provider === 0 ? json.ProviderIdentifier : null,
                FacebookId: json.Provider === 1 ? json.ProviderIdentifier : null,
                AppleIdentifier: json.Provider === 2 ? json.ProviderIdentifier : null,
                StaffType: 1, // 0-In house, 1-Freelancer,
                CompanyName: json.CompanyName ?json.CompanyName:'',
                IbanNumber: json.IbanNumber ?json.IbanNumber:'',
                KvkNumber: json.KvkNumber ?json.KvkNumber:'',
                ...zone.getCreateUpdate()
            }
            const insertedStaff = await knex(STAFF).insert(obj)
            if (insertedStaff.length <= 0) {
                throw new Error(MESSAGE.STAFF_SAVE_FAILED);
            }
            const staffId = insertedStaff[0];
            newStaffId = staffId;

            // Insert data in staffMetadata table
            const staffMetadata = {
                StaffId: staffId,
                ShowOutsideOffers: SHOW_OUTSIDE_OFFERS.NOT_SHOW,
                AutoAcceptAddonRequest: AUTO_ACCEPT_ADDON_REQUEST.DO_NOT_ACCEPT,
                StaffRegistrationId: registrationData[0].StaffRegistrationId,
                RegisteredFrom: REGISTERED_FROM.APP,
                Rank: 5, // Default rank
                ...zone.getCreateUpdate()
            }
            const insertedStaffMetadata = await knex(STAFF_METADATA).insert(staffMetadata)
            if (insertedStaffMetadata.length <= 0) {
                throw new Error(MESSAGE.STAFF_METADATA_SAVE_FAILED);
            }

            // After using the Registration code
            // now we need to update the IsRegCodeUsed flag
            let updated = await knex(STAFF_REGISTRATION)
                .where("StaffRegistrationId", "=", registrationData[0].StaffRegistrationId)
                .update({
                    IsRegCodeUsed: 1,
                    LastUpdated: zone.getLastUpdate()
                });
            console.log("IsRegCodeUsed updated: ", updated);
            let staffDetail = await staff(knex, newStaffId);
            response = staffDetail[0];

            // Create AccessToken and RefreshToken and update refresh token in db.
            response.AccessToken = await this.createTokenStaff(response.StaffId, deviceId);
            response.RefreshToken = await createRefreshTokenStaff(response.StaffId, deviceId);
            response.UnreadMessageCount = 0;
            response.LastMessageRead = null;
            let updateObj = {
                RefreshToken: ""
            }
            updateObj.RefreshToken = response.RefreshToken;
            let updatedRefTok = await knex(STAFF).where("StaffId", "=", response.StaffId).update(updateObj);

        } else if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            // Insert data in Staff table 
            const obj = {
                Name: json.Name,
                Gender: json.Gender,
                Contact: json.Contact,
                Address: json.Address ? json.Address : null,
                Zip: json.Zip ? json.Zip : null,
                City: json.City ? json.City : null,
                StaffGroupId: json.StaffGroupId,
                GoogleEmail: json.GoogleEmail,
                StaffType: 1, // 0-In house, 1-Freelancer,
                CompanyName: json.CompanyName ?json.CompanyName:'',
                IbanNumber: json.IbanNumber ?json.IbanNumber:'',
                KvkNumber: json.KvkNumber ?json.KvkNumber:'',
                ...zone.getCreateUpdate()
            }
            const insertedStaff = await knex(STAFF).insert(obj)
            if (insertedStaff.length <= 0) {
                throw new Error(MESSAGE.STAFF_SAVE_FAILED);
            }
            staffId = insertedStaff[0];

            // insert categories & products of staff
            var products = [];
            for (let i = 0; i < json.Categories.length; i++) {
                let category = json.Categories[i];
                let categoryDataObj = {
                    StaffId: staffId,
                    CategoryId: category.CategoryId,
                    Rate: category.Rate,
                    ...zone.getCreateUpdate()
                };
                const categoryInserted = await knex(STAFF_CATEGORY).insert(categoryDataObj);
                console.log("categoryInserted : ", categoryInserted);
                if (!categoryInserted) {
                    throw new Error(MESSAGE.STAFF_CREATE_SWW);
                }

                category.Products.forEach(product => {
                    products.push({
                        StaffId: staffId,
                        StaffCategoryId: categoryInserted[0],
                        ProductId: product.ProductId,
                        Rate: product.Rate,
                        ...zone.getCreateUpdate()
                    })
                });
            }

            console.log("final products to enter: ", products);
            const productInserted = await knex(STAFF_PRODUCT).insert(products);
            if (!productInserted) {
                throw new Error(MESSAGE.STAFF_CREATE_SWW);
            }

            // Insert data in staffMetadata table
            const staffMetadata = {
                StaffId: staffId,
                ShowOutsideOffers: SHOW_OUTSIDE_OFFERS.NOT_SHOW,
                AutoAcceptAddonRequest: AUTO_ACCEPT_ADDON_REQUEST.DO_NOT_ACCEPT,
                StaffRegistrationId: null,
                RegisteredFrom: REGISTERED_FROM.CMS,
                Rank: json.Rank, // Default rank
                ...zone.getCreateUpdate()
            }
            const insertedStaffMetadata = await knex(STAFF_METADATA).insert(staffMetadata)
            if (insertedStaffMetadata.length <= 0) {
                throw new Error(MESSAGE.STAFF_METADATA_SAVE_FAILED);
            }

            const maxSeq =await knex(STAFF).max('Sequence', { as: 'max_seq' })
            console.log(maxSeq)
            if (maxSeq.length >= 0) {
                console.log(maxSeq)
                let updateSeq=maxSeq[0].max_seq
                console.log(updateSeq)
                await knex("Staff")
                .where("StaffId", "=", staffId)
                .update({
                    Sequence: updateSeq+1,
                });
            }

            // Insert data in stafforganisation table if organisations are selected
            if(json.Organisations && json.Organisations.length){
                let organisations=json.Organisations
                let staffOrganisationData=[]
                organisations.forEach(orgId => {
                    let tempStaffData={
                        StaffId:staffId,
                        OrganisationLocationId:orgId,
                        ...zone.getCreateUpdate()
                    }
                    staffOrganisationData.push(tempStaffData);
                })
                const insertStaffOrganisation = await knex(STAFF_ORGANISATION).insert(staffOrganisationData)
            if (insertStaffOrganisation.length <= 0) {
                throw new Error(MESSAGE.STAFF_METADATA_SAVE_FAILED);
            }

            }
            await saveLog(knex,json.AdminId,STAFF,staffId,LOG_ACTION_TYPE.CREATE)

        }

        // Here newStaffId will be null in case of CMS calls this API
        // if therapist app calls this API then newly staff id will be in newStaffId
        // Because we need to send only one therapist data when registered through app
        // var staffData = await staff(knex, newStaffId);
        // if (staffData.Error) {
        //     throw new Error(staffData.Error);
        // }

        // Save log for create
       
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_SAVE_SUCCESS
        },
        body: setPayloadData(event, response)
    }
}

module.exports.updateStaff = async event => {
    /**
     * API Objective: update staff basic details.
     * Working:
     * 1. Verify headers, token (if hit by ambassador app).
     * 2. Validate the input data.
     * 3. If hit by ambassador app, update limited detail and return with same staff detail.
     * 4. Update staff basic detail, if any.
     * 5. Update staff category if changed.
     * 6. Return with staff list for CMS.
     */
    let knex, connected = false, response;
    try {
        const headers = event.headers;
        // console.log(headers);
        let isHeadersValid = checkHeaders(headers);
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
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
        }
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));

        /******** Data validation goes here **********/
        // Check for required field from request and there data type
        if (
            headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST &&
            compareVersions.compare(event.headers['api-version'], '1.3.2', '<=')
        ) {
            if (
                !json ||
                !json.StaffId || typeof json.StaffId !== "number"
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            knex = require("knex")(con);
            connected = true;
            const existData = await staff(knex, json.StaffId);
            if (existData.Error) {
                throw new Error(existData.Error);
            }
            const existStaff = existData[0];
            let updateObj = {};
            if (json.Name && typeof json.Name === 'string' && json.Name.trim() !== "") {
                if (json.Name !== existStaff.Name) {
                    updateObj.Name = json.Name.trim();
                }
            }
            if (json.ImagePath && typeof json.ImagePath === 'string' && json.ImagePath.trim() !== "") {
                if (json.ImagePath !== existStaff.ImagePath) {
                    updateObj.ImagePath = json.ImagePath.trim();
                }
            }
            if (json.Contact) {
                if (json.Contact !== existStaff.Contact) {
                    updateObj.Contact = json.Contact;
                }
            }
            if (!moment(existStaff.LastMessageRead).isSame(json.LastMessageRead)) {
                updateObj.LastMessageRead = moment(json.LastMessageRead).utc().toDate()
            }
            if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                updateObj.LastUpdated = zone.getLastUpdate();
                let staffUpdated = await knex(STAFF).where("StaffId", "=", json.StaffId).update(updateObj);
                if (!staffUpdated) {
                    throw new Error(MESSAGE.STAFF_UPDATE_FAILED);
                }
            }
            const staffFinalData = await staff(knex, json.StaffId);
            let staffData = staffFinalData[0];
            staffData.UnreadMessageCount = 0;
            // Calculate UnreadMessageCount
            if (staffData.LastMessageRead) {
                const countString = "count(*)";
                let lastTimeStamp = moment(staffData.LastMessageRead).utc().toDate();
                let commonMessages = await knex(MESSAGES)
                    .select(knex.raw('count(*)'))
                    .whereIn("Type", STAFF_MESSAGES_TYPES)
                    .andWhere("Date", ">", lastTimeStamp);
                let specificMessages = await knex(STAFF_MESSAGES)
                    .select(knex.raw('count(*)'))
                    .where("Date", ">", lastTimeStamp)
                    .andWhere("StaffId", "=", staffData.StaffId);
                staffData.UnreadMessageCount = commonMessages[0][countString] + specificMessages[0][countString];
            }
            await knex.destroy();
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    Message: MESSAGE.STAFF_UPDATE_SUCCESS
                },
                body: setPayloadData(event, {
                    Data: staffData
                })
            }
        }

        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.Name || typeof json.Name !== "string" || json.Name.trim() === "" ||
            !json.Contact ||
            json.Gender > 1 || json.Gender < 0 || typeof json.Gender !== "number" ||
            !json.GoogleEmail || typeof json.GoogleEmail !== "string" || json.GoogleEmail.trim() === "" 
            // !json.Categories || typeof json.Categories !== "object" ||
            // json.Categories.length === 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        // Check whether skill product and rate per treatment hour is there or not
        if(json.Categories.length){
            json.Categories.forEach(element => {
                if (!element || !element.Products.length) {
                    throw new Error(MESSAGE.INVALID_CATEGORY);
                }
            });
        }
        

        if (!validateEmail(json.GoogleEmail)) {
            throw new Error(MESSAGE.INVALID_EMAIL);
        }

        // Check for the input parameters according to the platform which called this api
        if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            // Check for required field from request and there data type
            if (
                !json.StaffGroupId ||
                !json.Rank
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            // check rates is there for every category admin have selected for therapist, in CMS
            // json.Categories.forEach(element => {
            //     if (!element.Rate) {
            //         throw new Error(MESSAGE.INVALID_CATEGORY);
            //     }
            //     element.Products.forEach(pro => {
            //         if (!pro.Rate) {
            //             throw new Error(MESSAGE.INVALID_CATEGORY);
            //         }
            //     });
            // });
        }
        /********************************************************************/
        const staffId = json.StaffId;

        knex = require("knex")(con);
        connected = true;
        // Get data of existing staff
        const existData = await staff(knex, json.StaffId);
        if (existData.Error) {
            throw new Error(existData.Error);
        }
        const existStaff = existData[0];

        let updateObj = {};
        if (json.Name !== existStaff.Name) {
            updateObj.Name = json.Name.trim();
        }
        if (json.ImagePath && typeof json.ImagePath === 'string' && json.ImagePath.trim() !== "") {
            if (json.ImagePath !== existStaff.ImagePath) {
                updateObj.ImagePath = json.ImagePath.trim();
            }
        }
        if (json.GoogleEmail !== existStaff.GoogleEmail) {
            updateObj.GoogleEmail = json.GoogleEmail.trim();
        }
        if (json.Contact !== existStaff.Contact) {
            updateObj.Contact = json.Contact;
        }
        if (json.Gender !== existStaff.Gender) {
            updateObj.Gender = json.Gender;
        }
        if (json.Address !== existStaff.Address) {
            updateObj.Address = json.Address;
        }
        if (json.Zip !== existStaff.Zip) {
            updateObj.Zip = json.Zip;
        }
        if (json.City !== existStaff.City) {
            updateObj.City = json.City;
        }

        if (json.CompanyName !== existStaff.CompanyName) {
            updateObj.CompanyName = json.CompanyName;
        }
        if (json.IbanNumber !== existStaff.IbanNumber) {
            updateObj.IbanNumber = json.IbanNumber;
        }
        if (json.KvkNumber !== existStaff.KvkNumber) {
            updateObj.KvkNumber = json.KvkNumber;
        }
        if (json.LastMessageRead && !moment(existStaff.LastMessageRead).isSame(json.LastMessageRead)) {
            updateObj.LastMessageRead = moment(json.LastMessageRead).utc().toDate()
        }

        // categories update handling
        // update categories of staff, first check if there are new categories
        let deletedCategories = [];
        if(json.Categories){
           
        existStaff.Categories.forEach(cat => {
            const found = json.Categories.find(f => f.CategoryId === cat.CategoryId);
            if (!found) {
                deletedCategories.push(cat.StaffCategoryId);
            }
        });
        }
        

        if (event.headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                updateObj.LastUpdated = zone.getLastUpdate();
                let staffUpdated = await knex(STAFF).where("StaffId", "=", json.StaffId).update(updateObj);
                if (!staffUpdated) {
                    throw new Error(MESSAGE.STAFF_UPDATE_FAILED);
                }
            }
            let metaUpdate = {
                LastUpdated: zone.getLastUpdate()
            }
            if (typeof json.ShowOutsideOffers === "boolean") {
                metaUpdate.ShowOutsideOffers = json.ShowOutsideOffers ? true : false;
            }
            if (typeof json.AutoAcceptAddonRequest === "boolean") {
                metaUpdate.AutoAcceptAddonRequest = json.AutoAcceptAddonRequest;
            }
            if (Object.keys(metaUpdate).length !== 0 && metaUpdate.constructor === Object) {
                let exist = await knex(STAFF_METADATA).select("StaffId", "Rank").where("StaffId", "=", json.StaffId);
                if (exist.length > 0) {
                    let staffMetaUpdated = await knex(STAFF_METADATA)
                        .where("StaffId", "=", json.StaffId)
                        .update(metaUpdate);
                } else {
                    // Create staff meta row.
                    let staffMetaRank = await knex(STAFF_METADATA)
                        .insert({
                            StaffId: json.StaffId,
                            ...metaUpdate,
                            ...zone.getCreateUpdate()
                        })
                }
            }

            // Handle categories and products skills
            /**
             * Insert new categories if any.
             * Update all the products again.
             * Delete the categories if any.
             * Just don't update the category rate if already exist.
             */
            if (deletedCategories.length > 0) {
                const staffCatDeleted = await knex(STAFF_CATEGORY)
                    .whereIn("StaffCategoryId", deletedCategories)
                    .del();
            }

            const staffProdDeleted = await knex(STAFF_PRODUCT)
                .where("StaffId", json.StaffId)
                .del();

            // insert categories & products of staff
            let productsToInsert = [];
            for (let i = 0; i < json.Categories.length; i++) {
                let category = json.Categories[i];
                category.Rate = null;
                let categoryInserted;
                const found = existStaff.Categories.find(f => f.CategoryId === category.CategoryId);
                if (!found) {
                    let categoryDataObj = {
                        StaffId: json.StaffId,
                        CategoryId: category.CategoryId,
                        Rate: null,
                        ...zone.getCreateUpdate()
                    };
                    categoryInserted = await knex(STAFF_CATEGORY).insert(categoryDataObj);
                    if (!categoryInserted) {
                        throw new Error(MESSAGE.STAFF_CREATE_SWW);
                    }
                } else {
                    categoryInserted = [found.StaffCategoryId];
                    category.Rate = found.CategoryRate;
                }
                category.Products.forEach(product => {
                    productsToInsert.push({
                        StaffId: json.StaffId,
                        StaffCategoryId: categoryInserted[0],
                        ProductId: product.ProductId,
                        Rate: category.Rate,
                        ...zone.getCreateUpdate()
                    })
                });
            }
            await knex(STAFF_PRODUCT).insert(productsToInsert);

            const staffFinalData = await staff(knex, json.StaffId);
            let staffData = staffFinalData[0];
            staffData.UnreadMessageCount = 0;
            // Calculate UnreadMessageCount
            if (staffData.LastMessageRead) {
                const countString = "count(*)";
                let lastTimeStamp = moment(staffData.LastMessageRead).utc().toDate();
                let commonMessages = await knex(MESSAGES)
                    .select(knex.raw('count(*)'))
                    .whereIn("Type", STAFF_MESSAGES_TYPES)
                    .andWhere("Date", ">", lastTimeStamp);
                let specificMessages = await knex(STAFF_MESSAGES)
                    .select(knex.raw('count(*)'))
                    .where("Date", ">", lastTimeStamp)
                    .andWhere("StaffId", "=", staffData.StaffId);
                staffData.UnreadMessageCount = commonMessages[0][countString] + specificMessages[0][countString];
            }
            await knex.destroy();
            try {
                let lambda = new AWS.Lambda();
                let lambdaName = getLambdaNameByInstance() + "-bookingDispatcher";
                console.log(lambdaName);
                lambda.invoke({
                    FunctionName: lambdaName,
                    InvocationType: 'Event',
                    LogType: 'Tail',
                    Payload: JSON.stringify({
                        StaffId: staffId
                    })
                }, function (err, data) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('Lambda hit ' + data.Payload);
                    }
                });
                await holdfor10secs();
            } catch (error) {
                console.log(error)
            }
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    Message: MESSAGE.STAFF_UPDATE_SUCCESS
                },
                body: setPayloadData(event, {
                    Data: staffData
                })
            }
        } else if (event.headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {

            if (typeof json.COCONRating === "number") {
                updateObj.COCONRating = json.COCONRating;
            }
            updateObj.StaffGroupId = json.StaffGroupId;

            // check that updated email id exists in our system or not
            // If already exists with some other account then we need to through error
            // that, multiple account can't have same email id, email id already used.            
            let staffExist = await knex(STAFF).select("Deleted", "StaffId").where("GoogleEmail", "=", json.GoogleEmail);
            if (staffExist.length > 0) {
                for (let staffInc = 0; staffInc < staffExist.length; staffInc++) {
                    const staff = staffExist[staffInc];
                    if (staff.StaffId !== json.StaffId && staff.Deleted === 0) {
                        throw new Error(MESSAGE.STAFF_EMAIL_ALREADY_EXIST);
                    }
                }
            }

            if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                updateObj.LastUpdated = zone.getLastUpdate();
                let staffUpdated = await knex(STAFF).where("StaffId", "=", json.StaffId).update(updateObj);
                if (!staffUpdated) {
                    await knex.destroy();
                    throw new Error(MESSAGE.STAFF_UPDATE_FAILED);
                }
            }

            if (json.Rank) {
                let exist = await knex(STAFF_METADATA).select("StaffId", "Rank").where("StaffId", "=", json.StaffId);
                if (exist.length > 0) {
                    if (exist[0].Rank !== json.StaffId) {
                        let staffRankUpdated = await knex(STAFF_METADATA)
                            .where("StaffId", "=", json.StaffId)
                            .update({
                                Rank: json.Rank
                            })
                    }
                } else {
                    // Create staff meta row.
                    let staffMetaRank = await knex(STAFF_METADATA)
                        .insert({
                            StaffId: json.StaffId,
                            Rank: json.Rank,
                            ...zone.getCreateUpdate()
                        })
                }
            }

            const staffCatDeleted = await knex(STAFF_CATEGORY)
                .where("StaffId", json.StaffId)
                .del();

            const staffProdDeleted = await knex(STAFF_PRODUCT)
                .where("StaffId", json.StaffId)
                .del();

            // insert categories & products of staff
            let productsToInsert = [];
            for (let i = 0; i < json.Categories.length; i++) {
                let category = json.Categories[i];
                let categoryInserted;
                let categoryDataObj = {
                    StaffId: json.StaffId,
                    CategoryId: category.CategoryId,
                    Rate: category.Rate ? category.Rate : null,
                    ...zone.getCreateUpdate()
                };
                categoryInserted = await knex(STAFF_CATEGORY).insert(categoryDataObj);
                if (!categoryInserted) {
                    throw new Error(MESSAGE.STAFF_CREATE_SWW);
                }
                category.Products.forEach(product => {
                    productsToInsert.push({
                        StaffId: json.StaffId,
                        StaffCategoryId: categoryInserted[0],
                        ProductId: product.ProductId,
                        Rate: product.Rate,
                        ...zone.getCreateUpdate()
                    })
                });
            }
            await knex(STAFF_PRODUCT).insert(productsToInsert);

            // send push in skills update
            if (json.SendPush) {
                try {
                // let inserted = await knex(STAFF_MESSAGES).insert({
                //     StaffId: staffId,
                //     Title: "Skills updated",
                //     Description: "The product based skills are updated by admin.",
                //     Date: moment().toDate(),
                //     ImagePath: null,
                //     Tag: MESSAGE_TAG.IMPORTANT,
                //     ...zone.getCreateUpdate()
                // })
                // if (existStaff.FcmToken) {
                //     const message = {
                //         token: existStaff.FcmToken,
                //         notification: {
                //             title: "Skills updated",
                //             body: `The product based skills are updated by admin.`
                //         },
                //         data: {
                //             ScreenName: PUSH.SCREEN.SKILLS
                //         }
                //     }
                //     const therapistApp = InitializeFirebaseTherapist();
                //     const sentNotification = await therapistApp.messaging().send(message);
                //     console.log(sentNotification)
                // }

                
                    let lambda = new AWS.Lambda();
                    let lambdaName = getLambdaNameByInstance() + "-bookingDispatcher";
                    console.log(lambdaName);
                    lambda.invoke({
                        FunctionName: lambdaName,
                        InvocationType: 'Event',
                        LogType: 'Tail',
                        Payload: JSON.stringify({
                            StaffId: staffId
                        })
                    }, function (err, data) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log('Lambda hit ' + data.Payload);
                        }
                    });
                    await holdfor10secs();
                } catch (error) {
                    console.log(error)
                }
            }

            // delete existing organisations
            var deleteOrganisations = await knex(STAFF_ORGANISATION)
                .where("StaffId", "=", json.StaffId)
                .delete().
                modify(function(qb){
                   console.log( qb.toSQL().toNative())
                });
            // Insert data in stafforganisation table if organisations are selected
            if(json.Organisations.length){
                let organisations=json.Organisations
                let staffOrganisationData=[]
                organisations.forEach(orgId => {
                    let tempStaffData={
                        StaffId:staffId,
                        OrganisationLocationId:orgId,
                        ...zone.getCreateUpdate()
                    }
                    staffOrganisationData.push(tempStaffData);
                })
                const insertStaffOrganisation = await knex(STAFF_ORGANISATION).insert(staffOrganisationData)
            if (insertStaffOrganisation.length <= 0) {
                throw new Error(MESSAGE.STAFF_METADATA_SAVE_FAILED);
            }

            }
        }

          // Save log for update
          await saveLog(knex,json.AdminId,STAFF,json.StaffId,LOG_ACTION_TYPE.UPDATE)


        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_UPDATE_SUCCESS
        },
        body: setPayloadData(event, response)
    }
}

module.exports.deleteStaff = async event => {
    var response = {};
    try {


        const json = event.body ? getPayloadData(event) : null;

        if (
            !json ||
            !json.DeleteStaff ||
            json.DeleteStaff.length <= 0 
            // !json.Pagination || typeof json.Pagination !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        var connected = true;
        var staffDeleted = await knex(STAFF).whereIn("StaffId", json.DeleteStaff)
            .update({
                Deleted: 1,
            })
        var deleteOrganisations = await knex(STAFF_ORGANISATION)
            .whereIn("StaffId", json.DeleteStaff)
            .delete().
            modify(function (qb) {
                console.log(qb.toSQL().toNative())
            });

        // Save log for delete
        for (let staff = 0; staff < json.DeleteStaff.length; staff++) {
            await saveLog(knex,json.AdminId,STAFF,json.DeleteStaff[staff],LOG_ACTION_TYPE.DELETE)
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_DELETE_SUCCESS
        },
        body: setPayloadData(event, response)
    }
}

module.exports.checkStaffAvailability = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.StartTime || typeof json.StartTime !== "string" ||
            !json.Duration || typeof json.Duration !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        var staffAvailability = await this.staffCheck(knex, json);
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_AVAIL_CHECKED
        },
        body: setPayloadData(event, {
            Data: staffAvailability
        })
    }
}

module.exports.staffCheck = async (knex, json) => {
    console.log(json);
    const staffData = await staff(knex, json.StaffId);
    if (staffData.length <= 0) {
        throw new Error(MESSAGE.STAFF_NOT_AVAILABLE);
    }
    const staffExist = staffData[0];
    STAFF_ZONE = zone.getStaffZone(json.StartTime);
    console.log(STAFF_ZONE)
    const selectedDate = moment(json.StartTime).format(DATE_TIME_FORMAT.MMLDDLYYYY);
    let staffDayWorking = await this.staffDaySchedule(knex, json.StaffId, moment(json.StartTime));

    console.log('staffDayWorking : ', staffDayWorking)

    let staffAvailability = {
        IsAvailable: true
    };

    if (!staffDayWorking.IsWorking) {
        staffAvailability.IsAvailable = false;
        console.log("not a working day");
        return staffAvailability;
    }
    let finalTimings = getDayTimesGOnIC(selectedDate, staffDayWorking.GeneralOffer.DayStart ? staffDayWorking.GeneralOffer : {}, staffDayWorking.InstantConfirmation.DayStart ? staffDayWorking.InstantConfirmation : {});
    // console.log("finalTimings:", finalTimings)
    staffDayWorking.DayStart = finalTimings.DayStart;
    staffDayWorking.DayEnd = finalTimings.DayEnd;
    let staffEvents = [];
    if (finalTimings.Blocks.length) {
        finalTimings.Blocks.forEach(block => {
            staffEvents.push({
                startTime: moment(block.startTime),
                endTime: moment(block.endTime)
            });
        });
    }
    // console.log("staffEvents:", staffEvents)
    // console.log("staffDayWorking.BlockTime:", staffDayWorking.BlockTime)
    staffDayWorking.BlockTime && staffDayWorking.BlockTime.Blocks ? staffDayWorking.BlockTime.Blocks.forEach(block => {
        staffEvents.push({
            startTime: moment(selectedDate + " " + block.StartTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z),
            endTime: moment(selectedDate + " " + block.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z),
            type:0
        })
    }) : true;
    // console.log("staffEvents now:", staffEvents)
    const dayStart = moment(selectedDate + " " + staffDayWorking.DayStart + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
    const dayEnd = moment(selectedDate + " " + staffDayWorking.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
    const reqStart = moment(json.StartTime);
    var reqEnd = moment(reqStart).add(json.Duration, "minute");
    // console.log("reqStart before");
    // console.log(reqStart);
    let isStartSchedule = false
    // if (json.ReachOutTime) {
    //     // reqStart.add(json.ReachOutTime, "minutes");
    //     if (dayStart.isSame(reqStart) || reqStart.diff(dayStart, "minutes") <= json.ReachOutTime) {
    //         reqEnd = moment(reqStart).add(json.Duration, "minute").subtract(json.ReachOutTime, "minute");
    //         isStartSchedule = true
    //     } else {
    //         reqStart.subtract(json.ReachOutTime, "minutes");
    //         reqEnd = moment(reqStart).add(json.Duration, "minute");
    //     }
    // }else{
    //     reqEnd = moment(reqStart).add(json.Duration, "minute");
    // }
    // if (json.ReachOutTime) {
    //     reqEnd.add(json.ReachOutTime, "minutes");
    // }
    // console.log(staffDayWorking);
    console.log("dayStart");
    console.log(dayStart);
    console.log("dayEnd");
    console.log(dayEnd);
    console.log("request timing")
    console.log(reqStart);
    console.log(reqEnd);

    if (
        !(
            reqStart.isBetween(dayStart, dayEnd, "minute", "[]") &&
            reqEnd.isBetween(dayStart, dayEnd, "minute", "[]")
        )
    ) {
        console.log('from day timing');
        staffAvailability.IsAvailable = false;
        return staffAvailability;
    }

    // First check vacations.
    let staffVacation = await this.getTodayVacation({
        knex,
        date: json.StartTime,
        staffId: [json.StaffId]
    })
    for (let vacInc = 0; vacInc < staffVacation.length; vacInc++) {
        const vacation = staffVacation[vacInc];
        if (vacation.StaffId === json.StaffId) {
            if (vacation.Template === VACATION_TEMPLATE.FULL_DAY) {
                staffExist.OnVacation = true;
                break;
            } else {
                let pushObj = {
                    id: vacation.EventId,
                    startTime: moment(vacation.StartTime),
                    endTime: moment(vacation.EndTime)
                }
                staffEvents.push(pushObj);
            }
        }
    }
    if (staffExist.OnVacation) {
        console.log("Staff on full day vacation");
        staffAvailability.IsAvailable = false;
        return staffAvailability;
    }
    // Fetch booking events.

    // let minTime = moment(json.StartTime).startOf("day");
    // let maxTime = moment(json.StartTime).add(120, "minute");
    // let fetchedEvents = await calendar.events.list({
    //     calendarId: "primary",
    //     timeMin: minTime.toDate(),
    //     timeMax: maxTime.toDate(),
    //     timeZone: "UTC",
    //     singleEvents: true
    // })
    let fetchedEvents = await this.getTodayBookingEvents({ knex: knex, date: selectedDate });
    console.log("fetchedEvents : ", fetchedEvents)
    for (let eveInc = 0; eveInc < fetchedEvents.length; eveInc++) {
        const event = fetchedEvents[eveInc];
        console.log(JSON.stringify(event))
        if (json.Events && json.Events.includes(event.id)) {
            continue;
        }
        if (event.attendees) {
            console.log("in If")
            
            const attendee = event.attendees.filter(att => att.email !== process.env.EMAIL)[0];
            console.log(attendee.email)
            console.log( staffExist.GoogleEmail)
            if (attendee.email === staffExist.GoogleEmail) {
                console.log("in If 2d")
                if (event.recurringEventId) {
                    // this is a recurring event check start date, if its same as requ, then its a vacation
                    if (event.start.date) {
                        const recEvStart = moment(event.start.date, DATE_TIME_FORMAT.YYYYdaMMdaDD);
                        const bookDate = moment(selectedDate, DATE_TIME_FORMAT.MMLDDLYYYY);
                        if (recEvStart.isSame(bookDate)) {
                            staffExist.OnVacation = true;
                            break;
                        }
                    }
                } else if (event.start.date) {
                    // This is a single full day event
                    staffExist.OnVacation = true;
                    break;
                }
                let pushObj = {
                    id: event.id,
                    startTime: moment(event.start.dateTime),
                    endTime: moment(event.end.dateTime),
                    organisationLocationId: event.organisationLocationId,
                    ReachOutTime: event.ReachOutTime,
                    PreparationTime:event.PreparationTime,
                    type: 1
                }

                // commented for the new availability logic 02/05/24
                // if (event.extendedProperties && event.extendedProperties.shared.ReachOutTime) {
                //     const toSub = parseInt(event.extendedProperties.shared.ReachOutTime) + parseInt(process.env.BUFFER_BEFORE);
                //     pushObj.startTime = moment(event.start.dateTime).subtract(toSub, "minute");
                // }
                // if (event.extendedProperties && event.extendedProperties.shared.ReturnTime) {
                //     const toAdd = parseInt(event.extendedProperties.shared.ReturnTime) + parseInt(process.env.BUFFER_AFTER);
                //     pushObj.endTime = moment(event.end.dateTime).add(toAdd, "minute");
                // }
                staffEvents.push(pushObj);
            }
        }
    }

    staffEvents.sort((a, b) => {
        return a.startTime - b.startTime;
    })


    //find next and previous event from timeslot
    let previousObject = {};
    let nextObject = {};
    let previousObjectIndex = null;
    let nextObjectIndex = null;

    for (let i = 0; i < staffEvents.length; i++) {
        const currentObject = staffEvents[i];
        const currentObjectIndex = i;
        console.log("current", currentObject)
        console.log("reqStart", reqStart)
        // Check if the current object's start time is greater than the given time
        if (currentObject.startTime > reqStart) {
            nextObject = currentObject;
            nextObjectIndex = currentObjectIndex;
            break; // Stop the loop once we find the next object
        }

        previousObject = currentObject;
        previousObjectIndex = currentObjectIndex;
    }
    console.log("previousObject", previousObject)
    console.log("previousObjectIndex", previousObjectIndex)
    console.log("nextObject", nextObject)
    console.log("nextObjectIndex", nextObjectIndex)


// commented for the new availability logic 02/05/24

    //ignore reachout time and reset start and end time if same organisation or no events
    if (previousObject.type == 1) {
        //reachout time in json is addition of reachout time amd prep time
        staffEvents[previousObjectIndex].endTime.add(AUTOMATIC_BLOCKTIME_BUFFER, "minutes")
        console.log("in")
        console.log("reqStart", reqStart)
        console.log("reqEnd", reqEnd)
    } 

    if (nextObject.type == 1) {
        //reachout time in json is addition of reachout time amd prep time
        reqEnd.add(AUTOMATIC_BLOCKTIME_BUFFER, "minute")
       
        console.log("in next")
        console.log("reqEnd", reqEnd)
        }  
    // else {
    //     console.log("in else")
    //     console.log("Object.keys(previousObject).length",Object.keys(previousObject).length)
    //     console.log("previousObject.OrganisationLocationId",previousObject.organisationLocationId)
    //     console.log("isStartSchedule",isStartSchedule)
    //     console.log("json.OrganisationLocationId",json.organisationLocationId)
    //     if (Object.keys(previousObject).length == 0 || previousObject.organisationLocationId == json.OrganisationLocationId && isStartSchedule == false) {
    //         //ignore reachout time from request time. reachout time in json is addition of reachout time amd prep time
    //         reqStart.add(json.ReachOutTime, "minutes").subtract(json.PreparationTime,"minutes")
    //         // duration = duration - reachOutTime

    //         if (Object.keys(previousObject).length != 0) {
    //             //ignore return time from just prev booking
    //             staffEvents[previousObjectIndex].endTime.subtract(staffEvents[previousObjectIndex].ReachOutTime, "minutes")
    //             console.log("in1")
    //             console.log("reqStart", reqStart)
    //             console.log("reqEnd", reqEnd)

    //         }

    //     }
    // }
    // if (nextObject.type == 0) {
    //     reqEnd.subtract(json.ReachOutTime, "minutes").add(json.PreparationTime,"minutes")
    //     // staffEvents[nextObjectIndex].endTime.subtract(staffEvents[nextObjectIndex].reachOutTime, "minutes").subtract(parseInt(process.env.BUFFER_AFTER),"minutes")
    //     console.log("subtract reachout, prep and buffer")
    // } else {
    //     console.log(nextObject.length)
    //     if (Object.keys(nextObject).length === 0 || nextObject.OrganisationLocationId == json.OrganisationLocationId) {
    //         reqEnd.subtract(json.ReachOutTime, "minutes").add(json.PreparationTime,"minutes")
    //         if (Object.keys(nextObject).length != 0) {
    //             //ignore reachout time from just next booking
    //             staffEvents[nextObjectIndex].startTime.add(staffEvents[nextObjectIndex].ReachOutTime, "minutes")
    //             // duration = duration - staffEvents[nextObjectIndex].reachOutTime

    //         }
    //         console.log("in2")
    //         console.log("reqStart", reqStart)
    //         console.log("reqEnd", reqEnd)
    //     }
    // }

    console.log("reqStart", reqStart)
    console.log("reqEnd", reqEnd)


    // reqEnd.add(AUTOMATIC_BLOCKTIME_BUFFER, "minutes")
    console.log("reqEnd", reqEnd)
    for (let evInc = 0; evInc < staffEvents.length; evInc++) {
        const event = staffEvents[evInc];
        console.log("event: " + evInc);
        console.log(event)
        if (
            event.startTime.isBetween(reqStart, reqEnd, "minute", "[)") ||
            event.endTime.isBetween(reqStart, reqEnd, "minute", "(]")
        ) {
            staffAvailability.IsAvailable = false;
            console.log("not available due to event between request")
            break;
        }
        if (
            (
                event.startTime.isBefore(reqStart) ||
                event.startTime.isSame(reqStart)
            ) &&
            (
                event.endTime.isAfter(reqStart) ||
                event.endTime.isBetween(reqStart, reqEnd, "minute", "(]")
            )
        ) {
            staffAvailability.IsAvailable = false;
            console.log("not available due to event overlapping the request");
            break;
        }
    }
    return staffAvailability;
}

const checkOutSideSchedule = async (knex, json) => {
    STAFF_ZONE = zone.getStaffZone(json.StartTime);
    const selectedDate = moment(json.StartTime).format(DATE_TIME_FORMAT.MMLDDLYYYY);
    let staffDayWorking = await this.staffDaySchedule(knex, json.StaffId, moment(json.StartTime));
    let staffAvailability = {
        IsAvailable: true
    };

    if (!staffDayWorking.IsWorking) {
        staffAvailability.IsAvailable = false;
        console.log("not a working day");
        return staffAvailability;
    }
    let finalTimings = getDayTimesGOnIC(selectedDate, staffDayWorking.GeneralOffer.DayStart ? staffDayWorking.GeneralOffer : {}, staffDayWorking.InstantConfirmation.DayStart ? staffDayWorking.InstantConfirmation : {});
    staffDayWorking.DayStart = finalTimings.DayStart;
    staffDayWorking.DayEnd = finalTimings.DayEnd;
    let staffEvents = [];
    if (finalTimings.Blocks.length) {
        finalTimings.Blocks.forEach(block => {
            staffEvents.push({
                startTime: moment(selectedDate + " " + block.StartTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z),
                endTime: moment(selectedDate + " " + block.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z)
            });
        });
    }
    staffDayWorking.BlockTime && staffDayWorking.BlockTime.Blocks ? staffDayWorking.BlockTime.Blocks.forEach(block => {
        staffEvents.push({
            startTime: moment(selectedDate + " " + block.StartTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z),
            endTime: moment(selectedDate + " " + block.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z)
        })
    }) : true;
    const dayStart = moment(selectedDate + " " + staffDayWorking.DayStart + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
    const dayEnd = moment(selectedDate + " " + staffDayWorking.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
    const reqStart = moment(json.StartTime);
    const reqEnd = moment(json.StartTime).add(json.Duration, "minute");
    if (
        !(
            reqStart.isBetween(dayStart, dayEnd, "minute", "[]") &&
            reqEnd.isBetween(dayStart, dayEnd, "minute", "[]")
        )
    ) {
        console.log('not in day timing');
        staffAvailability.IsAvailable = false;
        return staffAvailability;
    }
    return staffAvailability;
}

// Function to calculate the payable amount to therapist for the treatment
// AddOn payable amount will also be calculated by this function.
// duration: in minutes.
// rate: rate per treatment hour per category
module.exports.getAmountForTreatment = (duration, rate) => {
    let amount = (duration / 60) * rate;
    // return Math.round(amount);
    return parseFloat(Number.parseFloat(amount).toFixed(2));
}

module.exports.getRateForTreatment = (duration, amount) => {
    let rate = (60 / duration) * amount;
    return parseFloat(Number.parseFloat(rate).toFixed(2));
}

module.exports.getStaffBookingOld = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        const reqBookingId = json.BookingId ? json.BookingId : null;

        //  First select booking Ids where this staff is available
        var connected = true;
        var knex = require("knex")(con);
        connected = true;
        let bookingsToReturn = [];
        if (!reqBookingId) {
            let staffBookingsMeta = await knex
                .select(
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StaffId",
                    BOOKING_PRODUCTS + ".BookingId",
                    BOOKINGS + ".DateTime",
                    BOOKINGS + ".Status",
                    BOOKINGS + ".PaymentStatus",
                    BOOKINGS + ".Deleted"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
                .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                .modify(qb => {
                    if (json.Date) {
                        let dayStart = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf("day").toDate();
                        let dayEnd = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY).endOf("day").toDate();
                        qb.andWhere(BOOKINGS + ".DateTime", ">=", dayStart)
                        qb.andWhere(BOOKINGS + ".DateTime", "<=", dayEnd)
                    }
                })

            /**
             * filter out the bookingWithProduct, which should now includes only those bookings to be returned
             *  filtering could be based on DateTime, Status, PaymentStatus, etc.
             */
            let past24HrStamp = moment().startOf("day");
            bookingsToReturn = staffBookingsMeta.filter(book => {
                let bookingTime = new moment(book.DateTime);
                if (
                    bookingTime.isBefore(past24HrStamp) &&
                    !json.Date
                ) {
                    return false;
                }
                if (
                    (
                        book.Status === BOOKING_STATUS.COMPLETED ||
                        book.Status === BOOKING_STATUS.ON_GOING ||
                        book.Status === BOOKING_STATUS.CONFIRMED ||
                        book.Status === BOOKING_STATUS.LAPSED ||
                        book.Status === BOOKING_STATUS.CANCELLED_MANUALLY ||
                        book.Status === BOOKING_STATUS.INCONCLUSIVE
                    ) &&
                    (
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED ||
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.MANUAL ||
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.NOT_REQUIRED
                    ) &&
                    (
                        book.Deleted === DELETE_FLAG
                    )
                ) {
                    return true;
                } else {
                    return false;
                }
            })
        }

        // Bookings to fetch
        let bookingsToFetch = [];
        bookingsToReturn.forEach(a => {
            bookingsToFetch.push(a.BookingId);
        });

        let categoryColors = await knex(CATEGORIES).select("CategoryId", "ColorCode");

        // Fetch final booking details which are found after
        let rawData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".BookingProvider",
                BOOKINGS + ".UserId as BookingUserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Duration",
                BOOKINGS + ".Street",
                BOOKINGS + ".HouseNumber",
                BOOKINGS + ".Floor",
                BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".Status",
                BOOKINGS + ".PaymentStatus",
                BOOKINGS + ".ReachOutTime",
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.StartTime',
                BOOKING_PRODUCTS + '.UserId as ProductUserId',
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.StaffAmount',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.CheckInTime',
                BOOKING_PRODUCTS + '.RealStartTime',
                BOOKING_PRODUCTS + '.RealFinishTime',
                BOOKING_PRODUCTS + '.CheckOutTime',
                BOOKING_PRODUCTS + '.StaffNotes',
                BOOKING_PRODUCTS + '.CategoryId',
                BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                SPECIAL_REQUEST + ".SpecialRequestName",

            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(BOOKING_SPECIAL_REQUEST, BOOKINGS + ".BookingId", BOOKING_SPECIAL_REQUEST + ".BookingId")
            .leftJoin(SPECIAL_REQUEST, SPECIAL_REQUEST + ".SpecialRequestId", BOOKING_SPECIAL_REQUEST + ".SpecialRequestId")
            .orderBy(BOOKINGS + ".DateTime", "asc")
            .modify(qb => {
                if (json.BookingId) {
                    qb.where(BOOKINGS + ".BookingId", "=", json.BookingId)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
                } else {
                    qb.whereIn(BOOKINGS + ".BookingId", bookingsToFetch)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
                }
            })

        // let staffCategoryData = await knex(STAFF_CATEGORY).select("*").where('StaffId', "=", staffId);
        // let staffProductData = await knex(STAFF_PRODUCT).select("ProductId", "Rate").where("StaffId", "=", staffId);
        let bookingStatusConflict = [];
        // format the data to return
        var finalData = [];
        for (let formatInc = 0; formatInc < rawData.length; formatInc++) {
            const raw = rawData[formatInc];
            if (raw.StaffId === staffId) {
                // Staff category data for therapist payable amount calculation
                // const scData = staffCategoryData.find(category => category.CategoryId === raw.CategoryId);
                // const scProdData = staffProductData.find(product => product.ProductId === raw.ProductId);
                // check booking id already exists in the final array
                const found = finalData.find(f => f.BookingId === raw.BookingId);
                if (!found) {
                    let pushObj = {
                        BookingId: raw.BookingId,
                        BookingProvider: raw.BookingProvider,
                        UserId: raw.BookingUserId,
                        UserName: null,
                        UserGender: null,
                        UserNotes: null,
                        CoconNotes: null,
                        Contact: null,
                        ImagePath: null,
                        ImageURL: null,
                        DateTime: raw.StartTime,
                        Duration: 0,
                        EndTime: "",
                        Street: raw.Street,
                        HouseNumber: raw.HouseNumber,
                        Floor: raw.Floor,
                        City: raw.City,
                        Zip: raw.Zip,
                        Elevator: raw.Elevator,
                        Status: raw.Status,
                        PaymentStatus: raw.PaymentStatus,
                        ReachOutTime: raw.ReachOutTime,
                        ReturnTime: raw.ReachOutTime,
                        Products: [],
                        SpecialRequest: [],
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        },
                        ShowCheckInQRCode: true
                    }
                    const userDetail = await knex
                        .select("Name", "Gender", "Notes", "Contact", "ImagePath", "CoconNotes")
                        .modify(queryBuilder => {
                            queryBuilder.from(USERS).where("UserId", "=", raw.BookingUserId)
                        })
                    const rootUserData = userDetail[0];
                    pushObj.UserGender = rootUserData.Gender;
                    pushObj.UserName = rootUserData.Name;
                    pushObj.UserNotes = rootUserData.Notes;
                    pushObj.CoconNotes = rootUserData.CoconNotes;
                    pushObj.Contact = rootUserData.Contact;
                    if (rootUserData.ImagePath) {
                        pushObj.ImagePath = rootUserData.ImagePath;
                        pushObj.ImageURL = process.env.BUCKET_URL + rootUserData.ImagePath;
                    }
                    if (reqBookingId) {
                        let userAppRegistered = await knex(USERS)
                            .select("GoogleId", "FacebookId", "AppleId", "FromCMS")
                            .where("UserId", "=", raw.BookingUserId);
                        let userDetail = userAppRegistered[0];
                        if (
                            !userDetail.GoogleId &&
                            !userDetail.FacebookId &&
                            !userDetail.AppleId &&
                            userDetail.FromCMS
                        ) {
                            pushObj.ShowCheckInQRCode = false;
                        }
                    }
                    let productObj = {
                        BookingProductId: raw.BookingProductId,
                        ProductName: raw.ProductName,
                        Duration: raw.ProductDuration,
                        PreparationTime: raw.PreparationTime,
                        StartTime: raw.StartTime,
                        Guest: null,
                        Myself: raw.ProductGuest ? false : true,
                        SameTime: raw.SameTime === 1 ? true : false,
                        Status: raw.BookingProductStatus,
                        CheckInTime: raw.CheckInTime,
                        RealStartTime: raw.RealStartTime,
                        RealFinishTime: raw.RealFinishTime,
                        CheckOutTime: raw.CheckOutTime,
                        AddOns: [],
                        StaffNotes: raw.StaffNotes,
                        Extras: [],
                        Amount: raw.StaffAmount,
                        ColorCode: ""
                        // Amount: getAmountForTreatment(raw.ProductDuration, scProdData.Rate),
                    }
                    let prodCat = categoryColors.find(f => f.CategoryId === raw.CategoryId);
                    productObj.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : "";
                    if (raw.ProductGuest) {
                        let guestDataArr = await knex(GUESTS)
                            .select("Name", "Contact", "Relation", "Gender", "Notes")
                            .where("GuestId", "=", raw.ProductGuest);
                        let guestData = guestDataArr[0];
                        productObj.Guest = { ...guestData, ImagePath: null, ImageURL: null };
                    }

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
                        .where("BookingProductId", "=", raw.BookingProductId);
                    let finalAddOns = [];
                    for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                        const addOn = addOnsData[adInc];
                        if (!addOn.ExtraAddOn) {
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                            })
                        } else if (
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                        ) {
                            let paymentStatus = null;
                            let staffAmount = 0;
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                if (addOn.BookingAddOnPaymentId) {
                                    let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                    if (paymentStats.length) {
                                        paymentStatus = paymentStats[0].PaymentStatus;
                                    }
                                }
                                staffAmount = addOn.StaffAmount;
                            } else {
                                let rate = this.getRateForTreatment(raw.ProductDuration, raw.StaffAmount);
                                staffAmount = this.getAmountForTreatment(addOn.Duration, rate);
                                console.log(staffAmount)
                            }
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: staffAmount,
                                RequestStatus: addOn.RequestStatus,
                                PaymentStatus: paymentStatus
                            })
                        }
                    }
                    // addOnsData = addOnsData.map(addOn => {
                    //     if (!addOn.ExtraAddOn)
                    //         return {
                    //             ...addOn,
                    //             // Amount: getAmountForTreatment(addOn.Duration, scData.Rate),
                    //             Amount: addOn.StaffAmount
                    //         };
                    // });
                    productObj.AddOns = finalAddOns;
                    let extrasData = await knex(BOOKING_PRODUCT_EXTRA)
                        .select("ExtraValue")
                        .where("BookingProductId", "=", raw.BookingProductId);
                    extrasData.forEach(extra => {
                        productObj.Extras.push(extra.ExtraValue);
                    });
                    pushObj.Products.push(productObj);
                    if (raw.BookingSpecialRequestId) {
                        // product.TotalDuration += booking.AddOnAmount;
                        pushObj.SpecialRequest.push({
                            BookingSpecialRequestId: raw.BookingSpecialRequestId,
                            SpecialRequestId: raw.SpecialRequestId,
                            SpecialRequestName: raw.SpecialRequestName,
                            
                        })
                    }
                    finalData.push(pushObj);
                } else {
                    let productObj = {
                        BookingProductId: raw.BookingProductId,
                        ProductName: raw.ProductName,
                        Duration: raw.ProductDuration,
                        PreparationTime: raw.PreparationTime,
                        StartTime: raw.StartTime,
                        Guest: null,
                        Myself: raw.ProductGuest ? false : true,
                        SameTime: raw.SameTime === 1 ? true : false,
                        Status: raw.BookingProductStatus,
                        CheckInTime: raw.CheckInTime,
                        RealStartTime: raw.RealStartTime,
                        RealFinishTime: raw.RealFinishTime,
                        CheckOutTime: raw.CheckOutTime,
                        AddOns: [],
                        StaffNotes: raw.StaffNotes,
                        Amount: raw.StaffAmount,
                        ColorCode: ""
                        // Amount: getAmountForTreatment(raw.ProductDuration, scProdData.Rate),
                    }
                    let prodCat = categoryColors.find(f => f.CategoryId === raw.CategoryId);
                    productObj.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : "";

                    if (raw.ProductGuest) {
                        let guestDataArr = await knex(GUESTS).select("Name", "Contact", "Relation", "Gender", "Notes").where("GuestId", "=", raw.ProductGuest);
                        let guestData = guestDataArr[0];
                        productObj.Guest = { ...guestData };
                    }

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
                        .where("BookingProductId", "=", raw.BookingProductId);
                    let finalAddOns = [];
                    for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                        const addOn = addOnsData[adInc];
                        if (!addOn.ExtraAddOn) {
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                            })
                        } else if (
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                        ) {
                            let paymentStatus = null;
                            let staffAmount = 0;
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                if (addOn.BookingAddOnPaymentId) {
                                    let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                    if (paymentStats.length) {
                                        paymentStatus = paymentStats[0].PaymentStatus;
                                    }
                                }
                                staffAmount = addOn.StaffAmount;
                            } else {
                                let rate = this.getRateForTreatment(raw.ProductDuration, raw.StaffAmount);
                                staffAmount = this.getAmountForTreatment(addOn.Duration, rate);
                                console.log(staffAmount)
                            }
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: staffAmount,
                                RequestStatus: addOn.RequestStatus,
                                PaymentStatus: paymentStatus
                            })
                        }
                    }
                    // addOnsData = addOnsData.map(addOn => {
                    //     if (!addOn.ExtraAddOn)
                    //         return {
                    //             ...addOn,
                    //             // Amount: getAmountForTreatment(addOn.Duration, scData.Rate),
                    //             Amount: addOn.StaffAmount
                    //         };
                    // });
                    productObj.AddOns = finalAddOns;

                    found.Products.push(productObj);


                    if (raw.BookingSpecialRequestId) {
                        let reqExist = found.SpecialRequest.find(f => f.BookingSpecialRequestId === raw.BookingSpecialRequestId);
                        if(!reqExist){
                            found.SpecialRequest.push({
                                BookingSpecialRequestId: raw.BookingSpecialRequestId,
                                SpecialRequestId: raw.SpecialRequestId,
                                SpecialRequestName: raw.SpecialRequestName,
                                
                            })
    
                        }
                        
                    }
                }

                // if (raw.Status !== BOOKING_STATUS.COMPLETED && raw.Status !== BOOKING_STATUS.LAPSED) {
                //     let bookingBufferEndTime = moment(raw.DateTime)
                //         .add(raw.Duration, "minute")
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
                //         if (PROD_STAFF_CONFLICT.includes(raw.BookingProductStatus)) {
                //             let prodStatusUpdated = await knex(BOOKING_PRODUCTS)
                //                 .where("BookingProductId", "=", raw.BookingProductId)
                //                 .update({
                //                     Status: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             const found = finalData.find(f => f.BookingId === raw.BookingId);
                //             const prodFound = found.Products.find(f => f.BookingProductId === raw.BookingProductId);
                //             prodFound.Status = BOOKING_PRODUCT_STATUS.INCONCLUSIVE;
                //             let bookingUpdated = await knex(BOOKINGS)
                //                 .where("BookingId", "=", found.BookingId)
                //                 .update({
                //                     Status: BOOKING_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             found.Status = BOOKING_STATUS.INCONCLUSIVE;
                //             let staffStatus = await knex(STAFF)
                //                 .select("Status", "CurrentBookingId")
                //                 .where("StaffId", "=", staffId);
                //             let staffData = staffStatus[0];
                //             if (staffData.CurrentBookingId === raw.BookingId) {
                //                 // free the staff
                //                 let staffStatusUpdated = await knex(STAFF)
                //                     .where("StaffId", "=", staffId)
                //                     .update({
                //                         Status: STAFF_STATUS.AVAILABLE,
                //                         CurrentBookingId: null,
                //                         LastUpdated: zone.getLastUpdate()
                //                     })
                //             }
                //         }
                //     }
                // }
            }
        }
        for (let bookingInc = 0; bookingInc < finalData.length; bookingInc++) {
            const booking = finalData[bookingInc];
            let totalDuration = 0;
            booking.Products.forEach((product, index) => {
                if (index > 0) {
                    totalDuration += product.PreparationTime;
                }
                totalDuration += product.Duration;
                product.AddOns.forEach(addOn => {
                    if (!addOn.ExtraAddOn) {
                        totalDuration += addOn.Duration
                    } else {
                        if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                            totalDuration += addOn.Duration;
                        }
                    }
                });
            });
            booking.Duration = totalDuration;
            booking.EndTime = moment(booking.DateTime).add(totalDuration, "minutes").utc().format();
        }
        // for (let bProInc = 0; bProInc < finalData.length; bProInc++) {
        // const booking = finalData[bProInc];
        // for (let prodInc = 0; prodInc < booking.Products.length; prodInc++) {
        // const product = booking.Products[prodInc];
        //         let prodUpdated = await knex(BOOKING_PRODUCTS)
        //             .where("BookingProductId", "=", product.BookingProductId)
        //             .update({
        //                 Status: product.Status,
        //                 LastUpdated: zone.getLastUpdate()
        //             })
        //         const prodFound = bookingFound.Products.find(f => f.BookingProductId === product.BookingProductId);
        //         prodFound.Status = product.Status;
        // }
        //     let bookingStatusUpdated = await knex(BOOKINGS)
        //         .where("BookingId", "=", booking.BookingId)
        //         .update({
        //             Status: booking.Status,
        //             LastUpdated: zone.getLastUpdate()
        //         })
        //     bookingFound.Status = booking.Status;
        //     // free the staff
        //     let staffFreed = await knex(STAFF)
        //         .where("StaffId", "=", staffId)
        //         .update({
        //             Status: STAFF_STATUS.AVAILABLE,
        //             CurrentBookingId: null,
        //             LastUpdated: zone.getLastUpdate()
        //         })
        // }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_BOOKING_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalData
        })
    }
}

module.exports.getStaffBooking = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        const reqBookingId = json.BookingId ? json.BookingId : null;

        //  First select booking Ids where this staff is available
        var connected = true;
        var knex = require("knex")(con);
        connected = true;
        let bookingsToReturn = [];
        if (!reqBookingId) {
            let staffBookingsMeta = await knex
                .select(
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StaffId",
                    BOOKING_PRODUCTS + ".BookingId",
                    BOOKINGS + ".DateTime",
                    BOOKINGS + ".Status",
                    BOOKINGS + ".PaymentStatus",
                    BOOKINGS + ".Deleted"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
                .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                .modify(qb => {
                    if (json.Date) {
                        let dayStart = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf("day").toDate();
                        let dayEnd = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY).endOf("day").toDate();
                        qb.andWhere(BOOKINGS + ".DateTime", ">=", dayStart)
                        qb.andWhere(BOOKINGS + ".DateTime", "<=", dayEnd)
                    }
                })

            /**
             * filter out the bookingWithProduct, which should now includes only those bookings to be returned
             *  filtering could be based on DateTime, Status, PaymentStatus, etc.
             */
            let past24HrStamp = moment().startOf("day");
            bookingsToReturn = staffBookingsMeta.filter(book => {
                let bookingTime = new moment(book.DateTime);
                if (
                    bookingTime.isBefore(past24HrStamp) &&
                    !json.Date
                ) {
                    return false;
                }
                if (
                    (
                        book.Status === BOOKING_STATUS.COMPLETED ||
                        book.Status === BOOKING_STATUS.ON_GOING ||
                        book.Status === BOOKING_STATUS.CONFIRMED ||
                        book.Status === BOOKING_STATUS.LAPSED ||
                        book.Status === BOOKING_STATUS.CANCELLED_MANUALLY ||
                        book.Status === BOOKING_STATUS.INCONCLUSIVE
                    ) &&
                    (
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.SUCCEEDED ||
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.MANUAL ||
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.NOT_REQUIRED||
                        book.PaymentStatus === BOOKING_PAYMENT_STATUS.PENDING
                    ) &&
                    (
                        book.Deleted === DELETE_FLAG
                    )
                ) {
                    return true;
                } else {
                    return false;
                }
            })
        }

        // Bookings to fetch
        let bookingsToFetch = [];
        bookingsToReturn.forEach(a => {
            bookingsToFetch.push(a.BookingId);
        });

        let categoryColors = await knex(CATEGORIES).select("CategoryId", "ColorCode");

        // Fetch final booking details which are found after
        let rawData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".BookingProvider",
                BOOKINGS + ".UserId as BookingUserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Duration",
                BOOKINGS + ".Street",
                BOOKINGS + ".HouseNumber",
                BOOKINGS + ".Floor",
                BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".Status",
                BOOKINGS + ".PaymentStatus",
                BOOKINGS + ".ReachOutTime",
                BOOKINGS + ".ReachOutTime",
                BOOKING_EXTRA + '.AdminNotes',
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.StartTime',
                BOOKING_PRODUCTS + '.UserId as ProductUserId',
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.StaffAmount',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.CheckInTime',
                BOOKING_PRODUCTS + '.RealStartTime',
                BOOKING_PRODUCTS + '.RealFinishTime',
                BOOKING_PRODUCTS + '.CheckOutTime',
                BOOKING_PRODUCTS + '.StaffNotes',
                BOOKING_PRODUCTS + '.CategoryId',
                BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                SPECIAL_REQUEST + ".SpecialRequestName",
                ORGANISATION_LOCATION+".Name as OrganisationName"

            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(BOOKING_SPECIAL_REQUEST, BOOKINGS + ".BookingId", BOOKING_SPECIAL_REQUEST + ".BookingId")
            .leftJoin(SPECIAL_REQUEST, SPECIAL_REQUEST + ".SpecialRequestId", BOOKING_SPECIAL_REQUEST + ".SpecialRequestId")
            .leftJoin(BOOKING_EXTRA, BOOKING_EXTRA + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .orderBy(BOOKINGS + ".DateTime", "asc")
            .modify(qb => {
                if (json.BookingId) {
                    qb.where(BOOKINGS + ".BookingId", "=", json.BookingId)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
                } else {
                    qb.whereIn(BOOKINGS + ".BookingId", bookingsToFetch)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
                }
            })

        // let staffCategoryData = await knex(STAFF_CATEGORY).select("*").where('StaffId', "=", staffId);
        // let staffProductData = await knex(STAFF_PRODUCT).select("ProductId", "Rate").where("StaffId", "=", staffId);
        let bookingStatusConflict = [];
        // format the data to return
        var finalData = [];
        for (let formatInc = 0; formatInc < rawData.length; formatInc++) {
            const raw = rawData[formatInc];
            if (raw.StaffId === staffId) {
                // Staff category data for therapist payable amount calculation
                // const scData = staffCategoryData.find(category => category.CategoryId === raw.CategoryId);
                // const scProdData = staffProductData.find(product => product.ProductId === raw.ProductId);
                // check booking id already exists in the final array
                const found = finalData.find(f => f.BookingProductId === raw.BookingProductId);
                console.log(found)
                if (!found) {
                    let pushObj = {
                        BookingId: raw.BookingId,
                        BookingProvider: raw.BookingProvider,
                        UserId: raw.BookingUserId,
                        UserName: null,
                        UserGender: null,
                        UserNotes: null,
                        CoconNotes: null,
                        Contact: null,
                        ImagePath: null,
                        ImageURL: null,
                        DateTime: raw.StartTime,
                        Duration: 0,
                        EndTime: "",
                        Street: raw.Street,
                        HouseNumber: raw.HouseNumber,
                        Floor: raw.Floor,
                        City: raw.City,
                        Zip: raw.Zip,
                        Elevator: raw.Elevator,
                        Status: raw.Status,
                        PaymentStatus: raw.PaymentStatus,
                        ReachOutTime: raw.ReachOutTime,
                        ReturnTime: raw.ReachOutTime,
                        Products: [],
                        SpecialRequest: [],
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        },
                        ShowCheckInQRCode: true,
                        BookingProductId: raw.BookingProductId,
                        AdminNotes: raw.AdminNotes ? raw.AdminNotes : null,
                        OrganisationName:raw.OrganisationName?raw.OrganisationName:null
                    }
                    if(raw.BookingUserId){
                        const userDetail = await knex
                        .select("Name", "Gender", "Notes", "Contact", "ImagePath", "CoconNotes","TherapistNotes")
                        .modify(queryBuilder => {
                            queryBuilder.from(USERS).where("UserId", "=", raw.BookingUserId)
                        })
                    const rootUserData = userDetail[0];
                    pushObj.UserGender = rootUserData.Gender;
                    pushObj.UserName = rootUserData.Name;
                    pushObj.UserNotes = rootUserData.Notes;
                    pushObj.CoconNotes = rootUserData.CoconNotes;
                    pushObj.Contact = rootUserData.Contact;
                    pushObj.TherapistNotes = rootUserData.TherapistNotes;
                    if (rootUserData.ImagePath) {
                        pushObj.ImagePath = rootUserData.ImagePath;
                        pushObj.ImageURL = process.env.BUCKET_URL + rootUserData.ImagePath;
                    }
                    if (reqBookingId) {
                        let userAppRegistered = await knex(USERS)
                            .select("GoogleId", "FacebookId", "AppleId", "FromCMS")
                            .where("UserId", "=", raw.BookingUserId);
                        let userDetail = userAppRegistered[0];
                        if (
                            !userDetail.GoogleId &&
                            !userDetail.FacebookId &&
                            !userDetail.AppleId &&
                            userDetail.FromCMS
                        ) {
                            pushObj.ShowCheckInQRCode = false;
                        }
                    }
                    }else{
                        pushObj.UserName = 'Guest' 
                        pushObj.UserGender = 0;
                        pushObj.UserId = 1;
                    }
                    
                    let productObj = {
                        BookingProductId: raw.BookingProductId,
                        ProductName: raw.ProductName,
                        Duration: raw.ProductDuration,
                        PreparationTime: raw.PreparationTime,
                        StartTime: raw.StartTime,
                        Guest: null,
                        Myself: raw.ProductGuest ? false : true,
                        SameTime: raw.SameTime === 1 ? true : false,
                        Status: raw.BookingProductStatus,
                        CheckInTime: raw.CheckInTime,
                        RealStartTime: raw.RealStartTime,
                        RealFinishTime: raw.RealFinishTime,
                        CheckOutTime: raw.CheckOutTime,
                        AddOns: [],
                        StaffNotes: raw.StaffNotes,
                        Extras: [],
                        Amount: raw.StaffAmount,
                        ColorCode: ""
                        // Amount: getAmountForTreatment(raw.ProductDuration, scProdData.Rate),
                    }
                    let prodCat = categoryColors.find(f => f.CategoryId === raw.CategoryId);
                    productObj.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : "";
                    if (raw.ProductGuest) {
                        let guestDataArr = await knex(GUESTS)
                            .select("Name", "Contact", "Relation", "Gender", "Notes")
                            .where("GuestId", "=", raw.ProductGuest);
                        let guestData = guestDataArr[0];
                        productObj.Guest = { ...guestData, ImagePath: null, ImageURL: null };
                    }

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
                        .where("BookingProductId", "=", raw.BookingProductId);
                    let finalAddOns = [];
                    for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                        const addOn = addOnsData[adInc];
                        if (!addOn.ExtraAddOn) {
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                            })
                        } else if (
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                        ) {
                            let paymentStatus = null;
                            let staffAmount = 0;
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                if (addOn.BookingAddOnPaymentId) {
                                    let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                    if (paymentStats.length) {
                                        paymentStatus = paymentStats[0].PaymentStatus;
                                    }
                                }
                                staffAmount = addOn.StaffAmount;
                            } else {
                                let rate = this.getRateForTreatment(raw.ProductDuration, raw.StaffAmount);
                                staffAmount = this.getAmountForTreatment(addOn.Duration, rate);
                                console.log(staffAmount)
                            }
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: staffAmount,
                                RequestStatus: addOn.RequestStatus,
                                PaymentStatus: paymentStatus
                            })
                        }
                    }
                    // addOnsData = addOnsData.map(addOn => {
                    //     if (!addOn.ExtraAddOn)
                    //         return {
                    //             ...addOn,
                    //             // Amount: getAmountForTreatment(addOn.Duration, scData.Rate),
                    //             Amount: addOn.StaffAmount
                    //         };
                    // });
                    productObj.AddOns = finalAddOns;
                    let extrasData = await knex(BOOKING_PRODUCT_EXTRA)
                        .select("ExtraValue")
                        .where("BookingProductId", "=", raw.BookingProductId);
                    extrasData.forEach(extra => {
                        productObj.Extras.push(extra.ExtraValue);
                    });
                    pushObj.Products.push(productObj);
                    if (raw.BookingSpecialRequestId) {
                        // product.TotalDuration += booking.AddOnAmount;
                        pushObj.SpecialRequest.push({
                            BookingSpecialRequestId: raw.BookingSpecialRequestId,
                            SpecialRequestId: raw.SpecialRequestId,
                            SpecialRequestName: raw.SpecialRequestName,
                            
                        })
                    }
                    finalData.push(pushObj);
                } else {
                    // let productObj = {
                    //     BookingProductId: raw.BookingProductId,
                    //     ProductName: raw.ProductName,
                    //     Duration: raw.ProductDuration,
                    //     PreparationTime: raw.PreparationTime,
                    //     StartTime: raw.StartTime,
                    //     Guest: null,
                    //     Myself: raw.ProductGuest ? false : true,
                    //     SameTime: raw.SameTime === 1 ? true : false,
                    //     Status: raw.BookingProductStatus,
                    //     CheckInTime: raw.CheckInTime,
                    //     RealStartTime: raw.RealStartTime,
                    //     RealFinishTime: raw.RealFinishTime,
                    //     CheckOutTime: raw.CheckOutTime,
                    //     AddOns: [],
                    //     StaffNotes: raw.StaffNotes,
                    //     Amount: raw.StaffAmount,
                    //     ColorCode: ""
                    //     // Amount: getAmountForTreatment(raw.ProductDuration, scProdData.Rate),
                    // }
                    // let prodCat = categoryColors.find(f => f.CategoryId === raw.CategoryId);
                    // productObj.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : "";

                    // if (raw.ProductGuest) {
                    //     let guestDataArr = await knex(GUESTS).select("Name", "Contact", "Relation", "Gender", "Notes").where("GuestId", "=", raw.ProductGuest);
                    //     let guestData = guestDataArr[0];
                    //     productObj.Guest = { ...guestData };
                    // }

                    // let addOnsData = await knex(BOOKING_PRODUCT_ADDONS)
                    //     .select(
                    //         "BookingProductAddOnId",
                    //         "AddOn",
                    //         "Duration",
                    //         "ExtraAddOn",
                    //         "StaffAmount",
                    //         "BookingAddOnPaymentId",
                    //         "RequestStatus",
                    //     )
                    //     .where("BookingProductId", "=", raw.BookingProductId);
                    // let finalAddOns = [];
                    // for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                    //     const addOn = addOnsData[adInc];
                    //     if (!addOn.ExtraAddOn) {
                    //         finalAddOns.push({
                    //             BookingProductAddOnId: addOn.BookingProductAddOnId,
                    //             AddOn: addOn.AddOn,
                    //             Duration: addOn.Duration,
                    //             ExtraAddOn: addOn.ExtraAddOn,
                    //             Amount: addOn.StaffAmount,
                    //             RequestStatus: addOn.RequestStatus,
                    //         })
                    //     } else if (
                    //         addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                    //         addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                    //     ) {
                    //         let paymentStatus = null;
                    //         let staffAmount = 0;
                    //         if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                    //             if (addOn.BookingAddOnPaymentId) {
                    //                 let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                    //                 if (paymentStats.length) {
                    //                     paymentStatus = paymentStats[0].PaymentStatus;
                    //                 }
                    //             }
                    //             staffAmount = addOn.StaffAmount;
                    //         } else {
                    //             let rate = this.getRateForTreatment(raw.ProductDuration, raw.StaffAmount);
                    //             staffAmount = this.getAmountForTreatment(addOn.Duration, rate);
                    //             console.log(staffAmount)
                    //         }
                    //         finalAddOns.push({
                    //             BookingProductAddOnId: addOn.BookingProductAddOnId,
                    //             AddOn: addOn.AddOn,
                    //             Duration: addOn.Duration,
                    //             ExtraAddOn: addOn.ExtraAddOn,
                    //             Amount: staffAmount,
                    //             RequestStatus: addOn.RequestStatus,
                    //             PaymentStatus: paymentStatus
                    //         })
                    //     }
                    // }
                    // // addOnsData = addOnsData.map(addOn => {
                    // //     if (!addOn.ExtraAddOn)
                    // //         return {
                    // //             ...addOn,
                    // //             // Amount: getAmountForTreatment(addOn.Duration, scData.Rate),
                    // //             Amount: addOn.StaffAmount
                    // //         };
                    // // });
                    // productObj.AddOns = finalAddOns;

                    // found.Products.push(productObj);


                    if (raw.BookingSpecialRequestId) {
                        let reqExist = found.SpecialRequest.find(f => f.BookingSpecialRequestId === raw.BookingSpecialRequestId);
                        if(!reqExist){
                            found.SpecialRequest.push({
                                BookingSpecialRequestId: raw.BookingSpecialRequestId,
                                SpecialRequestId: raw.SpecialRequestId,
                                SpecialRequestName: raw.SpecialRequestName,
                                
                            })
    
                        }
                        
                    }
                }

                // if (raw.Status !== BOOKING_STATUS.COMPLETED && raw.Status !== BOOKING_STATUS.LAPSED) {
                //     let bookingBufferEndTime = moment(raw.DateTime)
                //         .add(raw.Duration, "minute")
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
                //         if (PROD_STAFF_CONFLICT.includes(raw.BookingProductStatus)) {
                //             let prodStatusUpdated = await knex(BOOKING_PRODUCTS)
                //                 .where("BookingProductId", "=", raw.BookingProductId)
                //                 .update({
                //                     Status: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             const found = finalData.find(f => f.BookingId === raw.BookingId);
                //             const prodFound = found.Products.find(f => f.BookingProductId === raw.BookingProductId);
                //             prodFound.Status = BOOKING_PRODUCT_STATUS.INCONCLUSIVE;
                //             let bookingUpdated = await knex(BOOKINGS)
                //                 .where("BookingId", "=", found.BookingId)
                //                 .update({
                //                     Status: BOOKING_STATUS.INCONCLUSIVE,
                //                     LastUpdated: zone.getLastUpdate()
                //                 })
                //             found.Status = BOOKING_STATUS.INCONCLUSIVE;
                //             let staffStatus = await knex(STAFF)
                //                 .select("Status", "CurrentBookingId")
                //                 .where("StaffId", "=", staffId);
                //             let staffData = staffStatus[0];
                //             if (staffData.CurrentBookingId === raw.BookingId) {
                //                 // free the staff
                //                 let staffStatusUpdated = await knex(STAFF)
                //                     .where("StaffId", "=", staffId)
                //                     .update({
                //                         Status: STAFF_STATUS.AVAILABLE,
                //                         CurrentBookingId: null,
                //                         LastUpdated: zone.getLastUpdate()
                //                     })
                //             }
                //         }
                //     }
                // }
            }
        }
        for (let bookingInc = 0; bookingInc < finalData.length; bookingInc++) {
            const booking = finalData[bookingInc];
            let totalDuration = 0;
            booking.Products.forEach((product, index) => {
                if (index > 0) {
                    totalDuration += product.PreparationTime;
                }
                totalDuration += product.Duration;
                product.AddOns.forEach(addOn => {
                    if (!addOn.ExtraAddOn) {
                        totalDuration += addOn.Duration
                    } else {
                        if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                            totalDuration += addOn.Duration;
                        }
                    }
                });
            });
            booking.Duration = totalDuration;
            booking.EndTime = moment(booking.DateTime).add(totalDuration, "minutes").utc().format();
        }
        // for (let bProInc = 0; bProInc < finalData.length; bProInc++) {
        // const booking = finalData[bProInc];
        // for (let prodInc = 0; prodInc < booking.Products.length; prodInc++) {
        // const product = booking.Products[prodInc];
        //         let prodUpdated = await knex(BOOKING_PRODUCTS)
        //             .where("BookingProductId", "=", product.BookingProductId)
        //             .update({
        //                 Status: product.Status,
        //                 LastUpdated: zone.getLastUpdate()
        //             })
        //         const prodFound = bookingFound.Products.find(f => f.BookingProductId === product.BookingProductId);
        //         prodFound.Status = product.Status;
        // }
        //     let bookingStatusUpdated = await knex(BOOKINGS)
        //         .where("BookingId", "=", booking.BookingId)
        //         .update({
        //             Status: booking.Status,
        //             LastUpdated: zone.getLastUpdate()
        //         })
        //     bookingFound.Status = booking.Status;
        //     // free the staff
        //     let staffFreed = await knex(STAFF)
        //         .where("StaffId", "=", staffId)
        //         .update({
        //             Status: STAFF_STATUS.AVAILABLE,
        //             CurrentBookingId: null,
        //             LastUpdated: zone.getLastUpdate()
        //         })
        // }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_BOOKING_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalData
        })
    }
}
module.exports.updateBookingStatus = async event => {
    /**
     * API Objective: update booking, product, staff status based on events.
     * Working:
     * 1. Check for required data.
     * 2. Based on event type update status'.
     * 3. Each event working is written in their respective type.
     */
    let knex;
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            !json.Event || typeof json.Event !== "object" ||
            typeof json.Event.Type !== "number" ||
            !json.Event.Data || typeof json.Event.Data !== "object" ||
            !json.Event.Data.DateTime || typeof json.Event.Data.DateTime !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        const bookingId = json.BookingId;
        const eventObject = json.Event;
        const data = eventObject.Data;
        let dateTime = data.DateTime;
        const dateTimeMoment = moment(data.DateTime);
        if (!dateTimeMoment.isValid) {
            throw new Error(MESSAGE.INVALID_DATETIME);
        }
        dateTime = dateTimeMoment.toDate();
        STAFF_ZONE = zone.getStaffZone(dateTimeMoment.format());
        knex = require("knex")(con);
        let staffRawData = await knex(STAFF).select("Name").where("StaffId", "=", staffId);
        let staffData = staffRawData[0];
        connected = true;
        switch (eventObject.Type) {
            case 0: {
                /**
                 * Check In
                 * 1. Update staff status to CHECKED_IN
                 * 2. Insert check in time to all products of this staff in this booking
                 * 3. Update booking product status to STAFF_CHECKED_IN
                 */

                //  check if staff already checked in throw error
                // try {
                //     let staffAlreadyCheckedIn = await knex(STAFF).select("Status").where("StaffId", "=", staffId);
                //     if (staffAlreadyCheckedIn[0].Status === STAFF_STATUS.CHECKED_IN) {
                //         throw new Error("Staff already in other booking");
                //     }
                // } catch (error) {
                //     return {
                //         statusCode: 409,
                //         headers: {
                //             ...Headers,
                //             Message: error.message
                //         }
                //     }
                // }
                let staffStatusUpdated = await knex(STAFF)
                    .where("StaffId", "=", staffId)
                    .update({
                        Status: STAFF_STATUS.CHECKED_IN,
                        CurrentBookingId: bookingId,
                        LastUpdated: zone.getLastUpdate()
                    })
                let bookingProductsUpdated = await knex(BOOKING_PRODUCTS)
                    .where("BookingId", "=", bookingId)
                    .andWhere("StaffId", "=", staffId)
                    .update({
                        CheckInTime: dateTime,
                        Status: BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN,
                        LastUpdated: zone.getLastUpdate()
                    })

                // Send push to user app
                try {
                    let bookingUser = await knex
                        .select(
                            BOOKINGS + ".BookingId",
                            BOOKINGS + ".UserId",
                            USERS + ".FcmToken"
                        )
                        .from(BOOKINGS)
                        .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                        .where(BOOKINGS + ".BookingId", "=", bookingId)
                    let bookingUserData = bookingUser[0];
                    let title = PUSH.TITLE.STAFF_CHECK_IN;
                    let description = `Therapist is checked-in for booking scheduled on ${momentz.tz(dateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                    // insert staff specific message in DB
                    const msgInsert = await knex(USER_MESSAGES).insert({
                        UserId: bookingUserData.UserId,
                        Title: title,
                        Description: description,
                        ImagePath: null,
                        Date: moment().toDate(),
                        ...zone.getCreateUpdate()
                    })
                    if (bookingUserData.FcmToken) {
                        const message = {
                            token: bookingUserData.FcmToken,
                            notification: {
                                title,
                                body: description
                            },
                            data: {
                                BookingId: `${bookingId}`,
                                ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                            }
                        }
                        console.log(message);
                        const userApp = InitializeFirebase();
                        const sentNotifications = await userApp.messaging().send(message);
                        console.log(sentNotifications)
                    }
                } catch (error) {
                    console.log(error);
                }
                break;
            }
            case 1: {
                /**
                 * Product Start
                 * 1. Update BOOKING status to ON_GOING.
                 * 2. Update STAFF status to IN_TREATMENT.
                 * 3. Update PRODUCT status to ON_GOING.
                 * 4. Update PRODUCT RealStartTime with given time
                 * 5. Update ADD-ON status ON_GOING
                 */
                if (
                    typeof data.BookingProductId !== "number" ||
                    !data.BookingProductId
                ) {
                    throw new Error(MESSAGE.BOOKING_PRODUCT_ID_REQ);
                }
                let bookingStatusOnGoing = await knex(BOOKINGS)
                    .where("BookingId", "=", bookingId)
                    .update({
                        Status: BOOKING_STATUS.ON_GOING,
                        LastUpdated: zone.getLastUpdate()
                    });
                let prodUpObj = {
                    Status: BOOKING_PRODUCT_STATUS.ON_GOING,
                    RealStartTime: dateTime,
                    LastUpdated: zone.getLastUpdate()
                }
                if (data.Notes) {
                    prodUpObj.StaffNotes = data.Notes;
                }
                let bookingProductStarted = await knex(BOOKING_PRODUCTS)
                    .where("BookingProductId", "=", data.BookingProductId)
                    .andWhere("StaffId", "=", staffId)
                    .update(prodUpObj)
                let bookProductAddOnStarted = await knex(BOOKING_PRODUCT_ADDONS)
                    .where("BookingProductId", "=", data.BookingProductId)
                    .update({
                        Status: BOOKING_PRODUCT_ADD_ON_STATUS.ON_GOING,
                        LastUpdated: zone.getLastUpdate()
                    })
                let staffStatusInTreatment = await knex(STAFF)
                    .where("StaffId", "=", staffId)
                    .update({
                        Status: STAFF_STATUS.IN_TREATMENT,
                        CurrentBookingId: bookingId,
                        LastUpdated: zone.getLastUpdate()
                    })
                break;
            }
            case 2: {
                /**
                 * Product Finish
                 * 1. Update PRODUCT status to COMPLETED
                 * 2. Update STAFF status to CHECKED_IN.
                 * 3. Check all other products of this bookings, if all products are complete then update BOOKING status to COMPLETED.                 * 
                 */
                if (
                    typeof data.BookingProductId !== "number" ||
                    !data.BookingProductId
                ) {
                    throw new Error(MESSAGE.BOOKING_PRODUCT_ID_REQ);
                }
                let prodUpObj = {
                    Status: BOOKING_PRODUCT_STATUS.COMPLETED,
                    RealFinishTime: dateTime,
                    LastUpdated: zone.getLastUpdate()
                };
                if (data.Notes) {
                    prodUpObj.StaffNotes = data.Notes;
                }
                let bookingProductFinish = await knex(BOOKING_PRODUCTS)
                    .where("BookingProductId", "=", data.BookingProductId)
                    .andWhere("StaffId", "=", staffId)
                    .update(prodUpObj);
                let bookProductAddOnFinish = await knex(BOOKING_PRODUCT_ADDONS)
                    .where("BookingProductId", "=", data.BookingProductId)
                    .update({
                        Status: BOOKING_PRODUCT_ADD_ON_STATUS.COMPLETED,
                        LastUpdated: zone.getLastUpdate()
                    })

                let statusStatusCheckIn = await knex(STAFF)
                    .where("StaffId", "=", staffId)
                    .update({
                        Status: STAFF_STATUS.CHECKED_IN,
                        LastUpdated: zone.getLastUpdate()
                    });

                let bookingProductsStatus = await knex(BOOKING_PRODUCTS)
                    .select("BookingProductId", "Status").where("BookingId", "=", bookingId);
                const allCompleted = bookingProductsStatus.every(pro => pro.Status === BOOKING_PRODUCT_STATUS.COMPLETED);
                for (let bproInc = 0; bproInc < bookingProductsStatus.length; bproInc++) {
                    const productStatus = bookingProductsStatus[bproInc];
                    if (productStatus.Status === BOOKING_PRODUCT_STATUS.INCONCLUSIVE) {
                        // mark booking inconclusive;
                        let bookingInconclusive = await knex(BOOKINGS)
                            .where("BookingId", "=", bookingId)
                            .update({
                                Status: BOOKING_STATUS.INCONCLUSIVE,
                                LastUpdated: zone.getLastUpdate()
                            })
                        break;
                    }

                }
                if (allCompleted) {
                    let bookingCompleted = await knex(BOOKINGS)
                        .where("BookingId", "=", bookingId)
                        .update({
                            Status: BOOKING_STATUS.COMPLETED,
                            LastUpdated: zone.getLastUpdate()
                        })
                }
                break;
            }
            case 3: {
                /**
                 * Staff Check out
                 * 1. Update Check out time in PRODUCTS, and Notes if any.
                 * 2. Update STAFF status to AVAILABLE, and CurrentBookingId to null.
                 * 3. Update all incompleted products of this staff and booking to Inconclusive
                 */
                let updateObj = {};
                updateObj.CheckOutTime = dateTime;
                updateObj.LastUpdated = zone.getLastUpdate();
                if (data.Notes) {
                    updateObj.StaffNotes = data.Notes.trim();
                }

                let productCheckOutUpdated = await knex(BOOKING_PRODUCTS)
                    .where("BookingId", "=", bookingId)
                    .andWhere("StaffId", "=", staffId)
                    .update(updateObj);
                let staffStatusAvailable = await knex(STAFF)
                    .where("StaffId", "=", staffId)
                    .update({
                        Status: STAFF_STATUS.AVAILABLE,
                        CurrentBookingId: null,
                        LastUpdated: zone.getLastUpdate()
                    });

                let existProducts = await knex(BOOKING_PRODUCTS)
                    .select("BookingProductId", "RealStartTime", "RealFinishTime", "Status", "StaffId")
                    .where("BookingId", "=", bookingId)
                    .andWhere("StaffId", "=", staffId);
                let updateBookingStatus = false;
                for (let prodInc = 0; prodInc < existProducts.length; prodInc++) {
                    const product = existProducts[prodInc];
                    if (product.Status !== BOOKING_PRODUCT_STATUS.COMPLETED) {
                        let prodUpObj = {
                            Status: BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                            LastUpdated: zone.getLastUpdate()
                        }
                        let productStatusUpdated = await knex(BOOKING_PRODUCTS)
                            .where("BookingProductId", "=", product.BookingProductId)
                            .update(prodUpObj);
                        updateBookingStatus = true;
                    }
                }
                if (updateBookingStatus) {
                    let bookingUpObj = {
                        Status: BOOKING_STATUS.INCONCLUSIVE,
                        LastUpdated: zone.getLastUpdate()
                    }
                    let bookingStatusUpdated = await knex(BOOKINGS)
                        .where("BookingId", "=", bookingId)
                        .update(bookingUpObj)
                }

                // Send push to user app
                try {
                    let bookingUser = await knex
                        .select(
                            BOOKINGS + ".BookingId",
                            BOOKINGS + ".UserId",
                            USERS + ".FcmToken"
                        )
                        .from(BOOKINGS)
                        .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                        .where(BOOKINGS + ".BookingId", "=", bookingId)
                    let bookingUserData = bookingUser[0];
                    let title = PUSH.TITLE.STAFF_CHECK_OUT;
                    let description = `Therapist is checked-out from your location on ${momentz.tz(dateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                    // insert staff specific message in DB
                    const msgInsert = await knex(USER_MESSAGES).insert({
                        UserId: bookingUserData.UserId,
                        Title: title,
                        Description: description,
                        ImagePath: null,
                        Date: moment().toDate(),
                        ...zone.getCreateUpdate()
                    })
                    if (bookingUserData.FcmToken) {
                        const message = {
                            token: bookingUserData.FcmToken,
                            notification: {
                                title,
                                body: description
                            },
                            data: {
                                BookingId: `${bookingId}`,
                                ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                            }
                        }
                        console.log(message);
                        const userApp = InitializeFirebase();
                        const sentNotifications = await userApp.messaging().send(message);
                        console.log(sentNotifications)
                    }
                } catch (error) {
                    console.log(error);
                }

                // if (!otherStaffExist && currentBooking[0].Status !== BOOKING_STATUS.COMPLETED) {
                //     let updatedProducts = await knex(BOOKING_PRODUCTS)
                //         .select("BookingProductId", "RealStartTime", "RealFinishTime", "Status", "StaffId")
                //         .where("StaffId", "=", staffId)
                //         .andWhere("BookingId", "=", bookingId);
                //     let allProdFinished = updatedProducts.every(f => f.Status === BOOKING_PRODUCT_STATUS.COMPLETED);
                //     if (!allProdFinished) {
                //         let bookingUpObj = {
                //             Status: BOOKING_STATUS.PARTIALLY_PERFORMED,
                //             LastUpdated: zone.getLastUpdate()
                //         }
                //         // case 14 not single product is performed or even started
                //         let allProdNotPerformed = updatedProducts.every(f =>
                //             f.Status === BOOKING_PRODUCT_STATUS.NOT_STARTED ||
                //             f.Status === BOOKING_PRODUCT_STATUS.NOT_PERFORMED ||
                //             f.Status === BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN
                //         )
                //         if (allProdNotPerformed) {
                //             bookingUpObj.Status = BOOKING_STATUS.NOT_PERFORMED;
                //         }
                //         let bookingStatusUpdated = await knex(BOOKINGS)
                //             .where("BookingId", "=", bookingId)
                //             .update(bookingUpObj)
                //     }
                // } else if (currentBooking[0].Status !== BOOKING_STATUS.COMPLETED) {
                //     // fetch other staff current status in this booking
                //     // if other staff is also checked out, then update the booking status according to products status;
                //     let otherStaffData = await knex(STAFF).select("Status", "CurrentBookingId").where("StaffId", "=", otherStaffId);
                //     let otherStaffStatus = otherStaffData[0];
                //     if (
                //         !(
                //             (
                //                 otherStaffStatus.Status === STAFF_STATUS.CHECKED_IN ||
                //                 otherStaffStatus.Status === STAFF_STATUS.IN_TREATMENT
                //             ) &&
                //             otherStaffStatus.CurrentBookingId === bookingId
                //         )
                //     ) {
                //         // now update booking status from its products status
                //         let latestProdStatus = await knex(BOOKING_PRODUCTS)
                //             .select("BookingProductId", "Status")
                //             .where("BookingId", "=", bookingId);
                //         let bookingUpObj = {
                //             Status: currentBooking[0].Status,
                //             LastUpdated: zone.getLastUpdate()
                //         }
                //         let prodStatusCheck = [
                //             BOOKING_PRODUCT_STATUS.NOT_STARTED,
                //             BOOKING_PRODUCT_STATUS.ON_GOING,
                //             BOOKING_PRODUCT_STATUS.STAFF_CHECKED_IN,
                //             BOOKING_PRODUCT_STATUS.NOT_PERFORMED,
                //             BOOKING_PRODUCT_STATUS.NOT_COMPLETED
                //         ]
                //         latestProdStatus.forEach(element => {
                //             if (prodStatusCheck.includes(element.Status)) {
                //                 bookingUpObj.Status = BOOKING_STATUS.PARTIALLY_PERFORMED;
                //             }
                //         });
                //         let bookingStatusUpdated = await knex(BOOKINGS)
                //             .where("BookingId", "=", bookingId)
                //             .update(bookingUpObj)
                //     }
                // }
                break;
            }
            case 4: {
                /**
                 * Staff Notes update only
                 * Update STAFF Notes for all PRODUCTS in current booking for this staff
                 */
                if (!data.Notes) {
                    throw new Error(MESSAGE.NOTES_REQUIRED);
                }
                let coconNotesUpdated = await updateCoconNotes({
                    knex,
                    bookingId,
                    notes: data.Notes.trim(),
                    staffName: staffData.Name,
                    editMode: data.EditMode ? data.EditMode : false
                });
                const updateObj = {
                    StaffNotes: data.Notes.trim(),
                    LastUpdated: zone.getLastUpdate()
                }
                let staffNotesUpdated = await knex(BOOKING_PRODUCTS)
                    .where("BookingId", "=", bookingId)
                    .andWhere("StaffId", "=", staffId)
                    .update(updateObj);
            }
        }

        // Fetch final booking details which are found after
        let rawData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".BookingProvider",
                BOOKINGS + ".UserId as BookingUserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Street",
                BOOKINGS + ".HouseNumber",
                BOOKINGS + ".Floor",
                BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".Status",
                BOOKINGS + ".PaymentStatus",
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.StartTime',
                BOOKING_PRODUCTS + '.UserId as ProductUserId',
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.CheckInTime',
                BOOKING_PRODUCTS + '.RealStartTime',
                BOOKING_PRODUCTS + '.RealFinishTime',
                BOOKING_PRODUCTS + '.CheckOutTime',
                BOOKING_PRODUCTS + '.StaffNotes'
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .where(BOOKINGS + ".BookingId", "=", bookingId)
            .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
            .orderBy(BOOKINGS + ".DateTime", "asc")

        // format the data to return
        var finalData = [];
        for (let formatInc = 0; formatInc < rawData.length; formatInc++) {
            const raw = rawData[formatInc];
            if (raw.StaffId === staffId) {
                const found = finalData.find(f => f.BookingId === raw.BookingId);
                if (!found) {
                    let pushObj = {
                        BookingId: raw.BookingId,
                        BookingProvider: raw.BookingProvider,
                        UserId: raw.BookingUserId,
                        UserName: null,
                        UserGender: null,
                        UserNotes: null,
                        Contact: null,
                        ImagePath: null,
                        ImageURL: null,
                        DateTime: raw.StartTime,
                        Street: raw.Street,
                        HouseNumber: raw.HouseNumber,
                        Floor: raw.Floor,
                        City: raw.City,
                        Zip: raw.Zip,
                        Elevator: raw.Elevator,
                        Status: raw.Status,
                        PaymentStatus: raw.PaymentStatus,
                        Products: [],
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        }
                    }
                    const userDetail = await knex
                        .select("Name", "Gender", "Notes", "Contact", "ImagePath", "CoconNotes")
                        .modify(queryBuilder => {
                            queryBuilder.from(USERS).where("UserId", "=", raw.BookingUserId)
                        })
                    const rootUserData = userDetail[0];
                    pushObj.UserGender = rootUserData.Gender;
                    pushObj.UserName = rootUserData.Name;
                    pushObj.UserNotes = rootUserData.Notes;
                    pushObj.CoconNotes = rootUserData.CoconNotes;
                    pushObj.Contact = rootUserData.Contact;
                    if (rootUserData.ImagePath) {
                        pushObj.ImagePath = rootUserData.ImagePath;
                        pushObj.ImageURL = process.env.BUCKET_URL + rootUserData.ImagePath;
                    }
                    let productObj = {
                        BookingProductId: raw.BookingProductId,
                        ProductName: raw.ProductName,
                        Duration: raw.ProductDuration,
                        PreparationTime: raw.PreparationTime,
                        StartTime: raw.StartTime,
                        Guest: null,
                        Myself: raw.ProductGuest ? false : true,
                        SameTime: raw.SameTime === 1 ? true : false,
                        Status: raw.BookingProductStatus,
                        CheckInTime: raw.CheckInTime,
                        RealStartTime: raw.RealStartTime,
                        RealFinishTime: raw.RealFinishTime,
                        CheckOutTime: raw.CheckOutTime,
                        AddOns: [],
                        StaffNotes: raw.StaffNotes,
                        Extras: []
                    }
                    if (raw.ProductGuest) {
                        let guestDataArr = await knex(GUESTS).select("Name", "Contact", "Relation", "Gender", "Notes").where("GuestId", "=", raw.ProductGuest);
                        let guestData = guestDataArr[0];
                        productObj.Guest = { ...guestData, ImagePath: null, ImageURL: null };
                    }
                    // let addOnsData = await knex(BOOKING_PRODUCT_ADDONS)
                    //     .select(
                    //         "AddOn",
                    //         "Duration",
                    //         "StaffAmount",
                    //         "Duration"
                    //     )
                    //     .where("BookingProductId", "=", raw.BookingProductId);
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
                        .where("BookingProductId", "=", raw.BookingProductId);
                    let finalAddOns = [];
                    for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                        const addOn = addOnsData[adInc];
                        if (!addOn.ExtraAddOn) {
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                            })
                        } else if (
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                        ) {
                            let paymentStatus = null;
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                if (addOn.BookingAddOnPaymentId) {
                                    let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                    if (paymentStats.length) {
                                        paymentStatus = paymentStats[0].PaymentStatus;
                                    }
                                }
                            }
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                                PaymentStatus: paymentStatus
                            })
                        }
                    }
                    productObj.AddOns = finalAddOns;
                    let extrasData = await knex(BOOKING_PRODUCT_EXTRA)
                        .select("ExtraValue")
                        .where("BookingProductId", "=", raw.BookingProductId);
                    extrasData.forEach(extra => {
                        productObj.Extras.push(extra.ExtraValue);
                    });
                    pushObj.Products.push(productObj);
                    finalData.push(pushObj);
                } else {
                    let productObj = {
                        BookingProductId: raw.BookingProductId,
                        ProductName: raw.ProductName,
                        Duration: raw.ProductDuration,
                        PreparationTime: raw.PreparationTime,
                        StartTime: raw.StartTime,
                        Guest: null,
                        Myself: raw.ProductGuest ? false : true,
                        SameTime: raw.SameTime === 1 ? true : false,
                        Status: raw.BookingProductStatus,
                        CheckInTime: raw.CheckInTime,
                        RealStartTime: raw.RealStartTime,
                        RealFinishTime: raw.RealFinishTime,
                        CheckOutTime: raw.CheckOutTime,
                        AddOns: [],
                        StaffNotes: raw.StaffNotes
                    }
                    if (raw.ProductGuest) {
                        let guestDataArr = await knex(GUESTS).select("Name", "Contact", "Relation", "Gender", "Notes").where("GuestId", "=", raw.ProductGuest);
                        let guestData = guestDataArr[0];
                        productObj.Guest = { ...guestData };
                    }
                    // let addOnsData = await knex(BOOKING_PRODUCT_ADDONS)
                    //     .select(
                    //         "AddOn",
                    //         "Duration"
                    //     )
                    //     .where("BookingProductId", "=", raw.BookingProductId);
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
                        .where("BookingProductId", "=", raw.BookingProductId);
                    let finalAddOns = [];
                    for (let adInc = 0; adInc < addOnsData.length; adInc++) {
                        const addOn = addOnsData[adInc];
                        if (!addOn.ExtraAddOn) {
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                            })
                        } else if (
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING ||
                            addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED
                        ) {
                            let paymentStatus = null;
                            if (addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                if (addOn.BookingAddOnPaymentId) {
                                    let paymentStats = await knex(BOOKING_ADDON_PAYMENTS).select("PaymentStatus").where("BookingAddOnPaymentId", "=", addOn.BookingAddOnPaymentId);
                                    if (paymentStats.length) {
                                        paymentStatus = paymentStats[0].PaymentStatus;
                                    }
                                }
                            }
                            finalAddOns.push({
                                BookingProductAddOnId: addOn.BookingProductAddOnId,
                                AddOn: addOn.AddOn,
                                Duration: addOn.Duration,
                                ExtraAddOn: addOn.ExtraAddOn,
                                Amount: addOn.StaffAmount,
                                RequestStatus: addOn.RequestStatus,
                                PaymentStatus: paymentStatus
                            })
                        }
                    }
                    productObj.AddOns = finalAddOns;
                    found.Products.push(productObj);
                }
            }
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.THERAPIST_EVENT_SAVED_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalData
        })
    }
}

const updateCoconNotes = async ({
    knex,
    bookingId,
    notes,
    staffName,
    editMode = false
}) => {
    if (notes) {
        let exist = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                USERS + ".CoconNotes"
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + '.UserId')
            .where(BOOKINGS + ".BookingId", "=", bookingId);
        let existNotes = exist[0];
        let coconNotes = existNotes.CoconNotes;
        let newNotes = "";
        let staffString = `[${moment().utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.DD_MMM_YYYY)}: ${staffName}]`;
        if (!editMode) {
            // Just append the notes at the end of CoconNotes
            newNotes = coconNotes ? coconNotes + `\n${staffString} ${notes}` : `${staffString} ${notes}`;
        } else {
            let findString = staffString;
            if (coconNotes.includes(findString)) {
                let existString = coconNotes.split(findString);
                newNotes = existString[0] + findString + " " + notes;
                let remainingString = existString[1].split("[");
                if (remainingString.length > 1) {
                    newNotes += `\n[`;
                    for (let strInc = 1; strInc < remainingString.length; strInc++) {
                        const element = remainingString[strInc];
                        newNotes += element;
                    }
                }
            } else {
                newNotes = coconNotes + `\n${findString} - ${notes}`;
            }
        }

        let updated = await knex(USERS)
            .where("UserId", "=", existNotes.UserId)
            .update({
                CoconNotes: newNotes,
                LastUpdated: zone.getLastUpdate()
            })
    }
}

module.exports.sendRegistrationCode = async event => {
    let knex, connected = false, response;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            (typeof json.Email === "string" && !json.Email) ||
            (typeof json.Phone === "string" && !json.Phone)
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.Email && !validateEmail(json.Email)) {
            throw new Error(MESSAGE.INVALID_EMAIL);
        }
        // Random code generate
        knex = require("knex")(con);
        connected = true;
        let registrationCode = "0000";
        // check that same registration code already exists in the database
        while (true) {
            registrationCode = `${Math.floor(1000 + Math.random() * 9000)}`;
            let registrationData = await knex(STAFF_REGISTRATION)
                .select()
                .where("RegistrationCode", "=", registrationCode);
            if (!registrationData ||
                !registrationData.length ||
                registrationData[0].IsRegCodeUsed) {
                // break the loop when found registration code is unique
                // Means, newly created registration code don't exist in database or it is already used.
                break;
            }
        }

        // Create new record for newly created registration code
        let dataObj = {
            Phone: json.Phone,
            Email: json.Email,
            RegistrationCode: registrationCode,
            IsRegCodeUsed: 0,
            ...zone.getCreateUpdate()
        };
        let insertedRegistrationCode = await knex(STAFF_REGISTRATION).insert(dataObj)
        if (dataObj.Email) {
            let mailOptions = {
                from: process.env.EMAIL,
                to: dataObj.Email,
                subject: "COCON Ambassador Registration",
                html: `
                    <div style="background-color: #ffffff;width:100%;padding:15px;font-family: Raleway, sans-serif;color: #3a312d;letter-spacing: 1px">
                        <div style="width: 100%;">
                            <div style="width: 100%;text-align: center;">
                                <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
                            </div>
                            <div style="width: 100%;text-align: center;">
                                <h1 style="color: #514844;font-weight: 500;letter-spacing: 0.5px;font-size: 30px;margin-top: 5px;">COCON</h1>
                            </div>
                            <div>
                                <h4 style="font-weight: 500;font-size: 17px;">Hi there,</h4>
                                <h4 style="font-weight: 500;font-size: 17px;">Please use the following code to register through the app</h4>
                            </div>
                            <div style="margin: 50px 0px">
                                <span style="background-color: #ebe4e0;padding: 13px 45px;font-size: 40px;font-weight: 500;border-radius: 10px;letter-spacing: 10px;color: #514844;font-family: spectral;">${registrationCode}</span>
                            </div>
                            <div style="margin-top: 10px;font-family: Raleway, sans-serif">
                                <p style="font-weight: 500;font-size: 15px;">Steps to register: </p>
                                <ul style="font-weight: 500;font-size: 15px;">
                                    <li style="margin-top: 8px;">Select "Register By Code"</li>
                                    <li style="margin-top: 8px;">Enter the Code</li>
                                    <li style="margin-top: 8px;">Complete the signup process via one of these Apple, Google or Facebook.</li>
                                </ul>
                                <h4 style="font-weight: 500;font-size: 18px;font-family: spectral;">COCON Company</h4>
                                <p style="margin-top: 35px;font-style: italic;font-family: spectral;letter-spacing:0px">This is an automated email sent from an unmonitored mailbox. Please do not reply to it.</p>
                            </div>
                        </div>
                    </div>
                `
            }
            // let accessToken = await oAuth2Client.getAccessToken();
            // console.log(accessToken);
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
            console.log(sendingMail);
        }

        if (dataObj.Phone) {
            let messageSent = await twilioClient.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: dataObj.Phone,
                body: `Hi there,\nPlease use the code ${registrationCode} to register as a COCON Ambassador.\nRegards\nCOCON Company`
            })
            console.log(messageSent);
        }

        // Destroy the database object once all done.
        // knex.destroy().then(() => { });
        await knex.destroy();
        response = registrationCode;
    } catch (error) {
        console.log(error);
        if (connected) {
            // knex.destroy().then(() => { });
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
    // Return object on success
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.REGISTRATION_CODE_SENT
        },
        body: setPayloadData(event, {
            Data: {
                RegistrationCode: response,
            }
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

module.exports.checkRegistrationCode = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json ||
            !json.RegistrationCode ||
            typeof json.RegistrationCode !== "string") {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        // check and get the registration code from the database
        const knex = require("knex")(con);
        var registrationData = await knex(STAFF_REGISTRATION)
            .select()
            .where("RegistrationCode", "=", json.RegistrationCode);
        console.log(registrationData);
        await knex.destroy();
        if (!registrationData || !registrationData.length) {
            // Case when code not found
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    Message: MESSAGE.REGISTRATION_CODE_NOT_FOUND
                }
            }
        } else if (registrationData[0].IsRegCodeUsed) {
            // Case when code is already used
            return {
                statusCode: 410,
                headers: {
                    ...Headers,
                    Message: MESSAGE.REGISTRATION_CODE_USED
                }
            }
        }
        let codeCreated = moment(registrationData[0].Created);
        let curDate = moment();
        if (codeCreated.isBefore(curDate.subtract(72, "hours"))) {
            return {
                statusCode: 406,
                headers: {
                    ...Headers,
                    Message: MESSAGE.REGISTRATION_CODE_EXPIRED,
                }
            }
        }

    } catch (error) {
        // Case when any error come while process
        knex.destroy();
        console.log(error);
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    // Return object on success
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.REGISTRATION_CODE_VALID
        },
        body: setPayloadData(event, {
            Data: registrationData
        })
    }
}

module.exports.staffLogin = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        console.log(JSON.stringify({
            json
        }, null, 2));
        if (
            !json ||
            (
                json.Provider !== 2 &&
                !json.Email
            ) ||
            (
                json.Provider === 2 &&
                !json.ProviderIdentifier
            )
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (!event.headers['device-id']) {
            throw new Error(MESSAGE.DEVICE_ID_REQUIRED);
        }
        let deviceId = event.headers['device-id'];
        var connected = false;

        /**
         * Check the given email with staff DB,
         * 1. If email exist then subscribe the staff with two topics - all, therapist.
         * 2. Return the staff detail.
         * 3. Calculate and return staff message count
         */

        var knex = require("knex")(con);
        connected = true;
        let existStaffId = null;
        if (json.Provider === 2 && json.Email) {
            let staffExist = await knex(STAFF)
                .select("StaffId")
                .where("GoogleEmail", "=", json.Email)
                .andWhere("Deleted", "=", DELETE_FLAG);
            if (staffExist.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.USER_NOT_FOUND_TRY_AGAIN
                    }
                }
            } else {
                existStaffId = staffExist[0].StaffId;
                // Update provider identifier if it exist
                if (json.ProviderIdentifier) {
                    let staffUpdated = await knex(STAFF).where("StaffId", "=", existStaffId).update({
                        AppleIdentifier: json.ProviderIdentifier
                    })
                }
            }
        }
        if (json.Provider === 2 && !json.Email) {
            let provStaffExist = await knex(STAFF)
                .select("StaffId")
                .where("AppleIdentifier", "=", json.ProviderIdentifier)
                .andWhere("Deleted", "=", DELETE_FLAG);
            if (provStaffExist.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.USER_NOT_FOUND_TRY_AGAIN
                    }
                }
            } else {
                existStaffId = provStaffExist[0].StaffId;
            }
        }
        if (json.Provider !== 2) {
            let staffExist = await knex(STAFF)
                .select("StaffId")
                .where("GoogleEmail", "=", json.Email)
                .andWhere("Deleted", "=", DELETE_FLAG);
            if (staffExist.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.USER_NOT_FOUND_TRY_AGAIN
                    }
                }
            }
            if (json.ProviderIdentifier) {
                if(json.ProviderIdentifier==0){
                    let staffUpdated = await knex(STAFF).where("StaffId", "=", existStaffId).update({
                        GoogleId: json.ProviderIdentifier
                    })
                }else{
                    let staffUpdated = await knex(STAFF).where("StaffId", "=", existStaffId).update({
                        FacebookId: json.ProviderIdentifier
                    })
                }
                
            }
            existStaffId = staffExist[0].StaffId;
        }

        var staffData = await staff(knex, existStaffId);
        staffData = staffData[0];

        let updateObj = {
            DeviceId: deviceId,
            LastUpdated: zone.getLastUpdate()
        }

        if (json.FcmToken) {
            updateObj.FcmToken = json.FcmToken;
            try {
                const admin = InitializeFirebaseTherapist();
                console.log("trying to subscribe")
                let subscribe = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_THERAPIST);
                console.log(subscribe)
                let subscribeToAll = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_ALL);
            } catch (error) {
                console.log(error);
            }
            staffData.FcmToken = json.FcmToken;
        }

        // Create AccessToken and RefreshToken and update refresh token in db.
        staffData.AccessToken = await this.createTokenStaff(staffData.StaffId, deviceId);
        staffData.RefreshToken = await createRefreshTokenStaff(staffData.StaffId, deviceId);

        updateObj.RefreshToken = staffData.RefreshToken;
        let updated = await knex(STAFF).where("GoogleEmail", "=", json.Email).update(updateObj)

        // Calculate UnreadMessageCount
        staffData.UnreadMessageCount = 0;
        if (staffData.LastMessageRead) {
            const countString = "count(*)";
            let lastTimeStamp = moment(staffData.LastMessageRead).utc().toDate();
            let commonMessages = await knex(MESSAGES)
                .select(knex.raw('count(*)'))
                .whereIn("Type", STAFF_MESSAGES_TYPES)
                .andWhere("Date", ">", lastTimeStamp);
            let specificMessages = await knex(STAFF_MESSAGES)
                .select(knex.raw('count(*)'))
                .where("Date", ">", lastTimeStamp)
                .andWhere("StaffId", "=", staffData.StaffId);
            staffData.UnreadMessageCount = commonMessages[0][countString] + specificMessages[0][countString];
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_LOGIN_SUCCESS
        },
        body: setPayloadData(event, {
            Data: staffData
        })
    }
}

// create jwt access token for staff
module.exports.createTokenStaff = async (staffId, deviceId) => {
    const options = {
        expiresIn: parseInt(process.env.ACCESS_TOKEN_EXPIRE),
        subject: staffId.toString(),
        audience: process.env.AUDIENCE_THERAPIST,
        issuer: process.env.ISSUER
    }
    const payload = {
        Type: TYPE.ACCESS_TOKEN,
        DeviceId: deviceId
    }
    const token = jwt.sign({ payload }, process.env.JWT_SECRET, options);
    return token;
}

// create jwt refresh token for staff
const createRefreshTokenStaff = async (staffId, deviceId) => {
    const options = {
        expiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRE),
        subject: staffId.toString(),
        audience: process.env.AUDIENCE_THERAPIST,
        issuer: process.env.ISSUER
    }
    const payload = {
        Type: TYPE.REFRESH_TOKEN,
        DeviceId: deviceId
    }
    const refreshToken = jwt.sign({ payload }, process.env.JWT_SECRET, options);
    return refreshToken;
}

module.exports.getStaffDetail = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
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
        }
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            !json ||
            !json.StaffId
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        var staffData = await staff(knex, json.StaffId);
        staffData = staffData[0];
        staffData.UnreadMessageCount = 0;
        // Calculate UnreadMessageCount
        if (staffData.LastMessageRead && headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            const countString = "count(*)";
            let lastTimeStamp = moment(staffData.LastMessageRead).utc().toDate();
            let commonMessages = await knex(MESSAGES)
                .select(knex.raw('count(*)'))
                .whereIn("Type", STAFF_MESSAGES_TYPES)
                .andWhere("Date", ">", lastTimeStamp);
            let specificMessages = await knex(STAFF_MESSAGES)
                .select(knex.raw('count(*)'))
                .where("Date", ">", lastTimeStamp)
                .andWhere("StaffId", "=", staffData.StaffId);
            staffData.UnreadMessageCount = commonMessages[0][countString] + specificMessages[0][countString];
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_DETAIL_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: staffData
        })
    }
}

module.exports.requestVacation = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        let tokenValid;
        if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            tokenValid = await verifyAnonymousToken(headers['Authorization'], headers['api-client']);
        } else if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        } else {
            return {
                statusCode: 403,
                headers: {
                    ...Headers
                }
            }
        }
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.Vacation || typeof json.Vacation !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        const vacation = json.Vacation;
        if (
            typeof vacation.Template !== "number" ||
            !vacation.StartDate || typeof vacation.StartDate !== "string" ||
            !vacation.EndDate || typeof vacation.EndDate !== "string" ||
            (
                vacation.Template === 1 &&
                (
                    !vacation.StartTime || typeof vacation.StartTime !== "string" ||
                    !vacation.EndTime || typeof vacation.EndTime !== "string"
                )
            )
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        var connected = false;
        var vacationData = [];

        var knex = require("knex")(con);
        const staffExist = await knex
            .select(
                STAFF + ".Name",
                STAFF + ".GoogleEmail"
            )
            .from(STAFF)
            .where(STAFF + ".StaffId", "=", staffId)
            .andWhere(STAFF + ".Deleted", "=", DELETE_FLAG);
        if (staffExist.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: MESSAGE.STAFF_NOT_FOUND,
                }
            }
        }
        let forceCreate = false;
        if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS && json.ForceCreate) {
            forceCreate = true;
        }
        console.log(forceCreate);
        const BOOKING_CONFLICT_MESSAGE = MESSAGE.BOOKING_CONFLICT_MESSAGE;
        var bookingExistError = false;
        const existData = staffExist[0];
        const requestId = uuidv4();
        let vacationRequest = [];
        STAFF_ZONE = zone.getStaffZone(moment(vacation.StartDate + " 12:00", DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm).utc().format());
        const rangeStart = moment(vacation.StartDate + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_Z);
        const rangeEnd = moment(vacation.EndDate + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_Z);
        let differenceDay = 0;
        if (vacation.Template === 0) {
            /**
             * This is a full day request for single or multiple days.
             * Create time stamp using staff day start and day end timings for given range.
             */
            const differenceOfDays = rangeEnd.diff(rangeStart, "day");
            differenceDay = differenceOfDays;
            let count = 0;
            if (differenceOfDays > 0) {
                // there are multiple days request
                for (let dayInc = 0, currentDay = moment(rangeStart); dayInc <= differenceOfDays; dayInc++) {
                    if (currentDay.isBefore(rangeEnd) || currentDay.isSame(rangeEnd)) {
                        let startTime = moment(currentDay);
                        let endTime = moment(currentDay).add(1, "day").subtract(1, "minute");
                        let bookingExist = await checkBookingExist(knex, staffId, startTime, endTime, forceCreate, false);
                        if (bookingExist.isBookingExist) {
                            bookingExistError = true;
                            throw new Error(BOOKING_CONFLICT_MESSAGE);
                        }
                        let pushObj = {
                            StaffId: staffId,
                            RequestId: requestId,
                            Template: 0,
                            StartTime: startTime.toDate(),
                            EndTime: endTime.toDate(),
                            Notes: vacation.Notes ? vacation.Notes : null,
                            Status: VACATION_STATUS.ACCEPTED,
                            BookingProductIds: bookingExist.BookingProductIds,
                            ...zone.getCreateUpdate()
                        }
                        vacationRequest.push(pushObj);
                        currentDay.add(1, "day");
                        count++;
                    } else {
                        break;
                    }
                }
                vacationRequest.forEach(element => {
                    element.DayCount = count;
                });
            } else {
                let startTime = moment(rangeStart);
                let endTime = moment(rangeEnd).add(1, "day").subtract(1, "minute");
                let bookingExist = await checkBookingExist(knex, staffId, startTime, endTime, forceCreate, false);
                if (bookingExist.isBookingExist) {
                    bookingExistError = true;
                    throw new Error(BOOKING_CONFLICT_MESSAGE);
                }
                let pushObj = {
                    StaffId: staffId,
                    RequestId: requestId,
                    Template: 0,
                    StartTime: startTime.toDate(),
                    EndTime: endTime.toDate(),
                    Notes: vacation.Notes ? vacation.Notes : null,
                    Status: VACATION_STATUS.ACCEPTED,
                    DayCount: 1,
                    BookingProductIds: bookingExist.BookingProductIds,
                    ...zone.getCreateUpdate()
                }
                vacationRequest.push(pushObj);
            }
        } else if (vacation.Template === 1) {
            /**
             * This is a custom timing request for single or multiple days.
             * Create time stamp using given start and end times for given range.
             */
            const differenceOfDays = rangeEnd.diff(rangeStart, "day");
            differenceDay = differenceOfDays;
            let tempMoment = moment(vacation.StartDate + " " + vacation.StartTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z);
            let tempMomentEnd = moment(vacation.EndDate + " " + vacation.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z);
            let firstDayEnd = moment(vacation.StartDate + " " + vacation.EndTime + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z);
            let minuteDiff = firstDayEnd.diff(tempMoment, "minute");
            let count = 0;
            if (differenceOfDays > 0) {
                // there are multiple days request
                for (let dayInc = 0, currentDay = moment(tempMoment); dayInc <= differenceOfDays; dayInc++) {
                    if (currentDay.isBefore(tempMomentEnd) || currentDay.isSame(tempMomentEnd)) {
                        let startTime = moment(currentDay);
                        let endTime = moment(currentDay).add(minuteDiff, "minute");
                        let bookingExist = await checkBookingExist(knex, staffId, startTime, endTime, forceCreate, true);
                        if (bookingExist.isBookingExist) {
                            bookingExistError = true;
                            throw new Error(BOOKING_CONFLICT_MESSAGE);
                        }
                        let pushObj = {
                            StaffId: staffId,
                            RequestId: requestId,
                            Template: 1,
                            StartTime: startTime.toDate(),
                            EndTime: endTime.toDate(),
                            Notes: vacation.Notes ? vacation.Notes : null,
                            Status: VACATION_STATUS.ACCEPTED,
                            BookingProductIds: bookingExist.BookingProductIds,
                            ...zone.getCreateUpdate()
                        }
                        vacationRequest.push(pushObj);
                        currentDay.add(1, "day");
                        count++;
                    } else {
                        break;
                    }
                }
                vacationRequest.forEach(element => {
                    element.DayCount = count;
                });
            } else {
                let startTime = moment(tempMoment);
                let endTime = moment(tempMomentEnd);
                let bookingExist = await checkBookingExist(knex, staffId, startTime, endTime, forceCreate, true);
                if (bookingExist.isBookingExist) {
                    bookingExistError = true;
                    throw new Error(BOOKING_CONFLICT_MESSAGE);
                }
                let pushObj = {
                    StaffId: staffId,
                    RequestId: requestId,
                    Template: 1,
                    StartTime: startTime.toDate(),
                    EndTime: endTime.toDate(),
                    Notes: vacation.Notes ? vacation.Notes : null,
                    Status: VACATION_STATUS.ACCEPTED,
                    DayCount: 1,
                    BookingProductIds: bookingExist.BookingProductIds,
                    ...zone.getCreateUpdate()
                }
                vacationRequest.push(pushObj);
            }
        }
        // create events on calendar for vacations
        let eventsConfig = [];
        let description = `${existData.Name} on vacation`
        if (vacation.Template === 0) {
            if (differenceDay === 0) {
                description += ` for full day on ${vacation.StartDate}`
            } else {
                description += ` for full days from ${vacation.StartDate} to ${vacation.EndDate}`
            }
        } else {
            if (differenceDay === 0) {
                description += ` - ${vacation.StartDate} from ${vacation.StartTime} - ${vacation.EndTime}`
            } else {
                description += ` from ${vacation.StartDate} to ${vacation.EndDate} for ${vacation.StartTime} - ${vacation.EndTime}`
            }
        }
        let eventObj = {
            start: {
                dateTime: vacationRequest[0].StartTime,
                timeZone: process.env.TIME_ZONE
            },
            end: {
                dateTime: vacationRequest[0].EndTime,
                timeZone: process.env.TIME_ZONE
            },
            summary: `Vacation - ${existData.Name}`,
            description,
            attendees: [
                { email: process.env.EMAIL },
                { email: existData.GoogleEmail }
            ],
            extendedProperties: {
                shared: {
                    'RequestId': requestId,
                    'BookingProductIds': []
                }
            }
        }
        if (differenceDay > 0) {
            eventObj.recurrence = [`RRULE:FREQ=DAILY;UNTIL=${moment(vacationRequest[vacationRequest.length - 1].EndTime).utc().format(DATE_TIME_FORMAT.YYYYMMDDTHHMMSS)}Z`];
        }
        if (vacationRequest[0].Template === 0) {
            eventObj.start.date = moment(vacationRequest[0].EndTime).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);
            eventObj.end.date = moment(vacationRequest[0].EndTime).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);
            delete eventObj.start.dateTime;
            delete eventObj.end.dateTime;
        }
        let firstVacationId;
        for (let vacInc = 0; vacInc < vacationRequest.length; vacInc++) {
            const vacationItem = vacationRequest[vacInc];
            if (vacationItem.BookingProductIds) {
                eventObj.extendedProperties.shared.BookingProductIds.push(vacationItem.BookingProductIds)
            }
            delete vacationItem.BookingProductIds;
            let vacationsRequested = await knex(STAFF_VACATIONS).insert(vacationItem);
            if (vacInc === 0) {
                firstVacationId = vacationsRequested[0];
            }
        }
        eventObj.extendedProperties.shared.BookingProductIds.toString();
        console.log(eventObj);
        // for (let eveInc = 0; eveInc < eventsConfig.length; eveInc++) {
        //     const event = eventsConfig[eveInc];
        try {
            const inserted = await calendar.events.insert({
                auth: oAuth2Client,
                calendarId: "primary",
                resource: eventObj
            });
            // update event id in db for this request.
            let eventIdUpdated = await knex(STAFF_VACATIONS)
                .where("RequestId", "=", requestId)
                .andWhere("StaffId", "=", staffId)
                .update({
                    EventId: inserted.data.id,
                    LastUpdated: zone.getLastUpdate()
                })
        } catch (error) {
            console.log(error)
        }
        // }
        var vacationData = await vacations(knex, null, event.headers['api-client']);
        await knex.destroy();
    } catch (error) {
        console.log(error);
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: bookingExistError ? 416 : 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.VACATION_REQ_SUCCESS
        },
        body: setPayloadData(event, {
            Data: vacationData
        })
    }
}

const checkBookingExist = async (knex, staffId, startTime, endTime, forceCreate = false, customTiming = false) => {
    /**
     * Fetch booking products on given startTime
     * If any product in given startTime and endTime, then return true
     * else return false, means no booking in this request
     */
    const BOOKINGS_CONSIDERED_FOR_VACATION = [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.ON_GOING
    ]
    let isBookingExist = false;
    let bookingProductIds = [];
    if (!customTiming) {
        let bookingExist = await knex
            .select(
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".StartTime",
                BOOKING_PRODUCTS + ".StaffId",
                BOOKING_PRODUCTS + ".BookingId",
                BOOKINGS + ".Status as BookingStatus"
            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKINGS + '.BookingId', BOOKING_PRODUCTS + ".BookingId")
            .where(BOOKING_PRODUCTS + ".StartTime", ">=", startTime.toDate())
            .andWhere(BOOKING_PRODUCTS + ".StartTime", "<=", endTime.toDate())
            .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
        if (forceCreate) {
            bookingExist.forEach(element => {
                if (BOOKINGS_CONSIDERED_FOR_VACATION.includes(element.BookingStatus)) {
                    bookingProductIds.push(element.BookingProductId);
                }
            });
        }
        if (!forceCreate && bookingExist.length > 0) {
            for (let bookStatInc = 0; bookStatInc < bookingExist.length; bookStatInc++) {
                const bookingData = bookingExist[bookStatInc];
                if (BOOKINGS_CONSIDERED_FOR_VACATION.includes(bookingData.BookingStatus)) {
                    isBookingExist = true;
                    break;
                }
            }
        }
    } else {
        let dayStart = moment(startTime).startOf("day");
        let bookingExist = await knex
            .select(
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".BookingId",
                BOOKING_PRODUCTS + ".StartTime",
                BOOKING_PRODUCTS + ".Duration as ProductDuration",
                BOOKING_PRODUCTS + ".StaffId",
                BOOKINGS + ".ReachOutTime",
                BOOKINGS + ".Status as BookingStatus",
                BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration"
            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .where(BOOKING_PRODUCTS + ".StartTime", ">=", dayStart.toDate())
            .andWhere(BOOKING_PRODUCTS + ".StartTime", "<", endTime.toDate())
            .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
        let bookRawData = [];
        bookingExist.forEach(element => {
            const prodFound = bookRawData.find(f => f.BookingProductId === element.BookingProductId);
            if (!prodFound) {
                let pushObj = {
                    BookingProductId: element.BookingProductId,
                    StartTime: element.StartTime,
                    BookingId: element.BookingId,
                    Duration: element.ProductDuration,
                    StaffId: element.StaffId,
                    ReachOutTime: element.ReachOutTime,
                    BookingStatus: element.BookingStatus,
                    AddOns: []
                };
                if (element.AddOnDuration) {
                    pushObj.AddOns.push(element.AddOnDuration);
                }
                bookRawData.push(pushObj);
            }
        });
        for (let prodInc = 0; prodInc < bookRawData.length; prodInc++) {
            const e = bookRawData[prodInc];
            let duration = e.Duration;
            e.AddOns.forEach(a => {
                duration += a;
            });
            let prodStartTime = moment(e.StartTime);
            let prodEndTime = moment(e.StartTime);
            prodStartTime.subtract(e.ReachOutTime, "minute");
            prodEndTime.add(duration, "minute");
            prodEndTime.add(e.ReachOutTime, "minute");
            if (
                prodStartTime.isBetween(startTime, endTime, "[]") ||
                prodEndTime.isBetween(startTime, endTime, "[]")
            ) {
                if (BOOKINGS_CONSIDERED_FOR_VACATION.includes(e.BookingStatus)) {
                    isBookingExist = true;
                }
                if (forceCreate) {
                    if (BOOKINGS_CONSIDERED_FOR_VACATION.includes(e.BookingStatus)) {
                        bookingProductIds.push(e.BookingProductId);
                    }
                } else {
                    break;
                }
            }
        }
    }
    if (forceCreate) {
        let marked = await knex(BOOKING_PRODUCTS).whereIn("BookingProductId", bookingProductIds)
            .update({
                StaffVacConflict: 1,
                LastUpdated: zone.getLastUpdate()
            })
        isBookingExist = false;
    }
    return {
        isBookingExist,
        BookingProductIds: bookingProductIds
    };
}

module.exports.getVacation = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
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
        }
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            event.headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST &&
            (
                !json ||
                !json.StaffId ||
                typeof json.StaffId !== "number"
            )
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let staffId = null;
        if (json && json.StaffId) {
            staffId = json.StaffId;
        }
        var knex = require("knex")(con);
        connected = true;
        var vacationData = await vacations(knex, staffId, event.headers['api-client'], json && json.StaffId && json.ShowUpcoming ? json.ShowUpcoming : false);
        if (vacationData.Error) {
            throw new Error(vacationData.Error);
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.VACATION_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: vacationData
        })
    }
}

const vacations = async (knex, staffId = null, apiClient, showUpcomOnly = false) => {
    try {
        /**
         * Fetch vacations for staff, if staffId is provided then for particular staff
         */
        const vacationRawData = await knex
            .select(
                STAFF_VACATIONS + ".StaffId",
                STAFF_VACATIONS + ".StaffVacationId",
                STAFF_VACATIONS + ".RequestId",
                STAFF_VACATIONS + ".Template",
                STAFF_VACATIONS + ".StartTime",
                STAFF_VACATIONS + ".EndTime",
                STAFF_VACATIONS + ".Notes",
                STAFF_VACATIONS + ".Status",
                STAFF_VACATIONS + ".DayCount",
                STAFF_VACATIONS + ".Created",
                STAFF + ".Name"
            )
            .from(STAFF_VACATIONS)
            .leftJoin(STAFF, STAFF + ".StaffId", STAFF_VACATIONS + ".StaffId")
            .where(STAFF + ".Deleted", "=", DELETE_FLAG)
            .groupBy(STAFF_VACATIONS + ".RequestId")
            .orderBy(STAFF_VACATIONS + ".Created", "asc")
            .modify(qb => {
                if (staffId) {
                    qb.where(STAFF_VACATIONS + ".StaffId", "=", staffId)
                    if (showUpcomOnly) {
                        let start = moment().subtract(1, "day").startOf("day").toDate();
                        qb.whereIn(STAFF_VACATIONS + ".Status", [VACATION_STATUS.ACCEPTED, VACATION_STATUS.NEW])
                        qb.andWhere(STAFF_VACATIONS + ".StartTime", ">", start)
                    }
                }
            });
        var vacationData = [];
        for (vacInc = 0; vacInc < vacationRawData.length; vacInc++) {
            const vacation = vacationRawData[vacInc];
            const found = vacationData.find(f => f.RequestId === vacation.RequestId);
            if (!found) {
                let pushObj = {
                    RequestId: vacation.RequestId,
                    Template: vacation.Template,
                    TemplateName: "",
                    Vacations: [],
                    Status: vacation.Status,
                    StatusName: "",
                    StartDate: vacation.StartTime,
                    EndDate: vacation.EndTime,
                    Notes: vacation.Notes,
                    StaffId: vacation.StaffId,
                    StaffName: vacation.Name,
                    DayCount: vacation.DayCount,
                    Created: vacation.Created,
                    TimeZone: {
                        Zone: process.env.STAFF_ZONE
                    }
                }
                switch (pushObj.Status) {
                    case 0:
                        pushObj.StatusName = "New"
                        break;
                    case 1:
                        pushObj.StatusName = "Accepted"
                        break;
                    case 2:
                        pushObj.StatusName = "Rejected"
                        break;
                    case 3:
                        pushObj.StatusName = "Retreated"
                        break;
                }
                switch (pushObj.Template) {
                    case 0:
                        pushObj.TemplateName = "Full day"
                        break;
                    case 1:
                        pushObj.TemplateName = "Custom timing"
                        break;
                }
                if (vacation.DayCount > 1) {
                    let lastVacation = await knex(STAFF_VACATIONS)
                        .select("EndTime")
                        .where("RequestId", "=", pushObj.RequestId)
                        .andWhere("StaffVacationId", "=", vacation.StaffVacationId + (vacation.DayCount - 1))
                    pushObj.EndDate = lastVacation[lastVacation.length - 1].EndTime;
                }
                vacationData.push(pushObj);
            }
        }
        // vacationRawData.forEach(vacation => {
        // });
        // vacationData.forEach(vac => {
        //     vac.EndDate = vac.Vacations[vac.Vacations.length - 1].EndTime;
        // });
        vacationData.sort((a, b) => {
            let aCre = moment(a.Created);
            let bCre = moment(b.Created);
            if (aCre.isBefore(bCre)) {
                return 1;
            } else if (aCre.isAfter(bCre)) {
                return -1;
            } else {
                return 0;
            }
        })
    } catch (error) {
        return {
            Error: error.message
        }
    }
    return vacationData;
}

module.exports.retreatVacation = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId ||
            !json.RequestId
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        const requestId = json.RequestId;

        var knex = require("knex")(con);
        connected = true;
        const requestExistData = await knex(STAFF_VACATIONS)
            .select("EventId")
            .where("StaffId", "=", staffId)
            .andWhere("RequestId", "=", requestId)
        if (requestExistData.length <= 0) {
            throw new Error(MESSAGE.VAC_REQ_NOT_EXIST);
        }

        /**
         * Request exist
         * 1. Update all its vacation's status to 3-Retreated
         * 2. Delete all the vacation events in current request
         */
        let vacationStatusUpdated = await knex(STAFF_VACATIONS)
            .where("StaffId", "=", staffId)
            .andWhere("RequestId", "=", requestId)
            .update({
                Status: VACATION_STATUS.RETREATED
            })
        let deletedEvents = [];
        for (let vacInc = 0; vacInc < requestExistData.length; vacInc++) {
            const vacation = requestExistData[vacInc];
            try {
                const delFound = deletedEvents.find(f => f === vacation.EventId);
                if (!delFound) {
                    // get event detail
                    let eventDetail = await calendar.events.get({
                        calendarId: "primary",
                        auth: oAuth2Client,
                        eventId: vacation.EventId
                    })
                    if (
                        eventDetail &&
                        eventDetail.data &&
                        eventDetail.data.extendedProperties &&
                        eventDetail.data.extendedProperties.shared &&
                        eventDetail.data.extendedProperties.shared.BookingProductIds
                    ) {
                        let bookingProductsMarked = eventDetail.data.extendedProperties.shared.BookingProductIds;
                        if (bookingProductsMarked) {
                            let prods = bookingProductsMarked.split(",")
                            let newProducts = [];
                            prods.forEach(element => {
                                newProducts.push(parseInt(element));
                            });
                            let conflictRemoved = await knex(BOOKING_PRODUCTS).whereIn("BookingProductId", newProducts)
                                .update({
                                    StaffVacConflict: 0,
                                    LastUpdated: zone.getLastUpdate()
                                })
                        }
                    }
                    if (eventDetail.data) {
                        let deleted = await calendar.events.delete({
                            calendarId: "primary",
                            auth: oAuth2Client,
                            eventId: vacation.EventId
                        });
                        deletedEvents.push(vacation.EventId);
                    }
                }
            } catch (error) {
                console.log(error);
            }
        }
        var vacationData;
        if (event.headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            vacationData = await vacations(knex, staffId, event.headers['api-client']);
        }
        if (event.headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            vacationData = await vacations(knex, null, event.headers['api-client']);
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.VACATION_RETREAT_SUCCESS
        },
        body: setPayloadData(event, {
            Data: vacationData
        })
    }
}

module.exports.sendSOSMessage = async event => {
    let knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId ||
            !json.BookingId ||
            !json.Body
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;
        let sosMessageNums = await knex(SOS_CONTACT)
            .select("Contact")
            .where("Type", "=", SOS_CONTACT_TYPE.SMS)
            .andWhere("Deleted", "=", DELETE_ENUM.NOT_DELETED)
        for (let sosInc = 0; sosInc < sosMessageNums.length; sosInc++) {
            const number = sosMessageNums[sosInc];
            let messageSent = await twilioClient.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: number.Contact,
                body: json.Body
            })
            console.log("to: " + number.Contact);
            console.log(messageSent);
        }
        // let centerData = await knex(CENTER).select("SosContact", "SosContactSecondary");
        // let contactData = centerData[0];

        // let messageSent = await twilioClient.messages.create({
        //     from: process.env.TWILIO_PHONE_NUMBER,
        //     to: contactData.SosContact,
        //     body: json.Body
        // })

        // let messageSentSecondary = await twilioClient.messages.create({
        //     from: process.env.TWILIO_PHONE_NUMBER,
        //     to: contactData.SosContactSecondary,
        //     body: json.Body
        // })
        // console.log(messageSent);
        // console.log(messageSentSecondary);
        await knex.destroy();
    } catch (error) {
        console.log(error)
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.SOS_SENT_SUCCESS
        }
    }
}

module.exports.getTwilioAccessToken = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const accessToken = require('twilio').jwt.AccessToken;
        const voiceGrant = accessToken.VoiceGrant;

        // Used when generating any kind of tokens
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioApiKey = process.env.TWILIO_API_KEY;
        const twilioApiSecret = process.env.TWILIO_API_SECRET;

        // Used specifically for creating Voice tokens
        const outgoingApplicationSid = process.env.TWILIO_APPLICATION_SID;
        const identity = json.StaffId;

        // Create a "grant" which enables a client to use Voice as a given user
        const newVoiceGrant = new voiceGrant({
            outgoingApplicationSid: outgoingApplicationSid,
            incomingAllow: true, // Optional: add to allow incoming calls
        });

        // Create an access token which we will sign and return to the client,
        // containing the grant we just created
        const token = new accessToken(
            twilioAccountSid,
            twilioApiKey,
            twilioApiSecret,
            { identity: identity }
        );
        token.addGrant(newVoiceGrant);

        // Serialize the token to a JWT string
        var newAccessToken = token.toJwt();
    } catch (error) {
        console.log(error)
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.TWILIO_TOK_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: {
                AccessToken: newAccessToken
            }
        })
    }
}

module.exports.twilioCall = async event => {
    let knex, connected = false;
    try {
        knex = require("knex")(con);
        connected = true;
        let sosCallNum = await knex(SOS_CONTACT)
            .select("Contact")
            .where("Type", "=", SOS_CONTACT_TYPE.CALL)
            .andWhere("Deleted", "=", DELETE_ENUM.NOT_DELETED)
        await knex.destroy();

        if (sosCallNum) {
            const VoiceResponse = require("twilio").twiml.VoiceResponse;
            let twiMLCall = new VoiceResponse();
            twiMLCall.dial({
                callerId: process.env.TWILIO_PHONE_NUMBER
            }, sosCallNum[0].Contact);
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "text/xml"
                },
                body: twiMLCall.toString()
            }
        }
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/xml"
            }
        }
    } catch (error) {
        console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400
        }
    }
}

module.exports.updateStaffSchedule = async event => {
    /**
     * API Objective: update staff working schedule as per given details
     * Working:
     * 1. Validate required data based on Type.
     * 2. Find out week of selected date.
     * 3. Remaining working is specified in inline comments.
     */

    let knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        console.log(JSON.stringify({
            json
        }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.Schedule || typeof json.Schedule.RequestType !== "number" ||
            json.Schedule.RequestType < 0 || json.Schedule.RequestType > 2 ||
            typeof json.Schedule.ScheduleType !== "number" ||
            json.Schedule.ScheduleType < 0 || json.Schedule.ScheduleType > 2
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        const schedule = json.Schedule;
        console.log(schedule)
        const selectedDateRaw = schedule.Date;
        let scheduleIDLog;

        switch (schedule.RequestType) {  //0-create, 1-delete
            case 0: {
                if (
                    !selectedDateRaw || typeof selectedDateRaw !== "string" ||
                    !schedule.DayStartTime || typeof schedule.DayStartTime !== "string" ||
                    !schedule.DayEndTime || typeof schedule.DayEndTime !== "string"
                ) {
                    if (schedule.ScheduleType !== STAFF_SCHEDULE_TYPE.BLOCK_TIME) {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                }
                if (
                    schedule.ScheduleType === STAFF_SCHEDULE_TYPE.BLOCK_TIME &&
                    !schedule.BlockTime.length
                ) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                if (schedule.BlockTime && schedule.BlockTime.length > 0) {
                    schedule.BlockTime.forEach(element => {
                        if (
                            !element ||
                            // !element.Name || typeof element.Name !== "string" ||
                            !element.StartTime || typeof element.StartTime !== "string" ||
                            !element.EndTime || typeof element.EndTime !== "string"
                        ) {
                            throw new Error(MESSAGE.REQ_DATA_ERROR);
                        }
                    });
                }
                if (schedule.ScheduleType === STAFF_SCHEDULE_TYPE.BLOCK_TIME) {
                    schedule.DayStartTime = null;
                    schedule.DayEndTime = null;
                } else {
                    schedule.BlockTime = [];
                }
                break;
            }
            case 1: {
                if (
                    !selectedDateRaw || typeof selectedDateRaw !== "string" ||
                    !schedule.CurrentSchedular || typeof schedule.CurrentSchedular !== "string"
                ) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                if (schedule.Ongoing) {
                    if (typeof schedule.DeleteOngoing !== "boolean") {
                        throw new Error(MESSAGE.REQ_DATA_ERROR);
                    }
                }
                break;
            }
        }
        
        
        const selectedDay = moment(selectedDateRaw, DATE_TIME_FORMAT.DDLMMLYYYY);
        
        const selectedEndDay = schedule.EndDate
            ? moment(schedule.EndDate, DATE_TIME_FORMAT.DDLMMLYYYY)
            : null;
        const currentSchedularDate = schedule.CurrentSchedular
            ? moment(schedule.CurrentSchedular, DATE_TIME_FORMAT.DDLMMLYYYY)
            : null;
        if (!selectedDay.isValid()) {
            throw new Error(MESSAGE.INVALID_DATE);
        }
        if (selectedEndDay && !selectedEndDay.isValid()) {
            throw new Error(MESSAGE.INVALID_DATE);
        }
        if (currentSchedularDate && !currentSchedularDate.isValid) {
            throw new Error(MESSAGE.INVALID_DATE);
        }
        if (selectedEndDay && selectedEndDay.isBefore(selectedDay)) {
            throw new Error(MESSAGE.ENDDATE_BEFORE_START);
        }
        const weekDayNum = selectedDay.day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);
        knex = require("knex")(con);
        connected = true;
        let config = {
            DayStartTime: schedule.DayStartTime ? schedule.DayStartTime : null,
            DayEndTime: schedule.DayEndTime ? schedule.DayEndTime : null,
            BlockTime: schedule.BlockTime
        }
        switch (schedule.RequestType) {
            case 0: {
                /**
                 * insert request
                 */
                if (selectedEndDay) {
                    /**
                     * This is an schedule upto specific date.
                     * We need to remove any existing schedule in given range and insert this new schedule
                     */
                    console.log("insert specific date"); 
                
                    scheduleIDLog=await insertSchedule({
                        knex,
                        staffId,
                        scheduleType: schedule.ScheduleType,
                        selectedStartDate: selectedDay,
                        selectedEndDate: selectedEndDay,
                        ...config,
                        previousSchedularDate: currentSchedularDate
                    })
                    // await insertSchedule(knex, staffId, selectedDay, selectedEndDay, config, currentSchedularDate);
                    // if (currentSchedularDate) {
                    //     // A schedule already exist, we need to stop that schedule to last week and then update future schedule.
                    // } else {
                    //     // It doesn't have any previous schedule, we just need to update this schedule and its future schedule if needed.
                    //     await insertSchedule(knex, staffId, selectedDay, selectedEndDay, config);
                    // }
                } else {
                    /**
                     * This is an weekly ongoing schedule
                     * We need to delete any schedule which is after this date
                     * and insert this date schedule.
                     */
                    if (currentSchedularDate && !currentSchedularDate.isSame(selectedDay)) {
                        // A schedule already exist, we need to stop that schedule to last week and then update future schedule.
                        const prevSchData = await updatePrevSchedule(knex, staffId, selectedDay, currentSchedularDate, schedule.ScheduleType);
                    }
                    scheduleIDLog= await insertSchedule({
                        knex,
                        staffId,
                        scheduleType: schedule.ScheduleType,
                        selectedStartDate: selectedDay,
                        selectedEndDate: null,
                        ...config,
                        previousSchedularDate: null,
                    });
                }
                break;
            }
            case 1: {
                /**
                 * delete request
                 */
                let existScheduleData = await knex(STAFF_SCHEDULE)
                    .select(
                        `StaffScheduleId`,
                        `${weekDay.DateStart}`,
                        `${weekDay.DateEnd}`,
                        `${weekDay.DayStart}`,
                        `${weekDay.DayEnd}`,
                        `${weekDay.Block}`
                    )
                    .where("StaffId", "=", staffId)
                    .andWhere(`${weekDay.DateStart}`, "=", currentSchedularDate.toDate())
                    .andWhere("ScheduleType", "=", schedule.ScheduleType)
                let existDetail = existScheduleData[0];
                console.log("existScheduleData",existScheduleData)
                let existBlocks = [];
                if (existDetail[weekDay.Block]) {
                    existBlocks = await knex(STAFF_BLOCK_TIME)
                        .select("*")
                        .where("StaffId", "=", staffId)
                        .andWhere("BlockTimeId", "=", existDetail[weekDay.Block]);
                }
                if (schedule.DeleteOngoing) {
                    if (selectedDay.isSame(currentSchedularDate)) {
                        if (existDetail[weekDay.Block]) {
                            await deleteBlockTimes(knex, staffId, existDetail[weekDay.Block]);
                        }
                        let updateObj = {
                            ScheduleType: schedule.ScheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        updateObj[weekDay.DateStart] = null;
                        updateObj[weekDay.DateEnd] = null;
                        updateObj[weekDay.DayStart] = null;
                        updateObj[weekDay.DayEnd] = null;
                        updateObj[weekDay.Block] = null;
                        let updatedRec = await knex(STAFF_SCHEDULE)
                            .where("StaffId", "=", staffId)
                            .andWhere(`${weekDay.DateStart}`, "=", currentSchedularDate.toDate())
                            .andWhere("ScheduleType", "=", schedule.ScheduleType)
                            .update(updateObj);
                        await deleteEmptyWeekRecords(knex, staffId, existDetail.StaffScheduleId);
                    } else {
                        let newEndForPrevSch = moment(selectedDay).subtract(7, "day");
                        let prevEndUpdateObj = {
                            ScheduleType: schedule.ScheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        prevEndUpdateObj[weekDay.DateEnd] = newEndForPrevSch.toDate();
                        let prevUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffId", "=", staffId)
                            .andWhere("StaffScheduleId", "=", existDetail.StaffScheduleId)
                            .andWhere("ScheduleType", "=", schedule.ScheduleType)
                            .update(prevEndUpdateObj)
                        if (existDetail[weekDay.DateEnd]) {
                            // let prevOldEndDate = moment(existDetail[weekDay.DateEnd]);
                            // if (prevOldEndDate.isAfter(selectedDay)) {
                            //     let newRecStart = moment(selectedDay).add(7, "day");
                            //     let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY));
                            //     if (weekRecExist.length > 0) {
                            //         let existData = weekRecExist[0];
                            //         let dayInsertObj = {
                            //             LastUpdated: zone.getLastUpdate()
                            //         }
                            //         const blockTimeId = existData[weekDay.Block]
                            //             ? uuidv4()
                            //             : null;
                            //         if (blockTimeId) {
                            //             for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            //                 const block = existBlocks[blockInc];
                            //                 const blockObj = {
                            //                     BlockTimeId: blockTimeId,
                            //                     StaffId: staffId,
                            //                     Name: block.Name,
                            //                     StartTime: block.StartTime,
                            //                     EndTime: block.EndTime,
                            //                     ...zone.getCreateUpdate()
                            //                 }
                            //                 let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockObj);
                            //             }
                            //         }
                            //         dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                            //         dayInsertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                            //         dayInsertObj[weekDay.DayStart] = existData[weekDay.DayStart];
                            //         dayInsertObj[weekDay.DayEnd] = existData[weekDay.DayEnd];
                            //         dayInsertObj[weekDay.Block] = blockTimeId;
                            //         let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            //             .where("StaffScheduleId", "=", existData.StaffScheduleId)
                            //             .andWhere("StaffId", "=", staffId)
                            //             .update(dayInsertObj);
                            //     } else {
                            //         let insertObj = {
                            //             StaffId: staffId,
                            //             ...zone.getCreateUpdate()
                            //         }
                            //         const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                            //         if (blockTimeId) {
                            //             // insert blockTimes first
                            //             for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            //                 const block = existBlocks[blockInc];
                            //                 const blockObj = {
                            //                     BlockTimeId: blockTimeId,
                            //                     StaffId: staffId,
                            //                     Name: block.Name,
                            //                     StartTime: block.StartTime,
                            //                     EndTime: block.EndTime,
                            //                     ...zone.getCreateUpdate()
                            //                 }
                            //                 let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockObj);
                            //             }
                            //         }
                            //         insertObj[weekDay.DateStart] = newRecStart.toDate();
                            //         insertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                            //         insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                            //         insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                            //         insertObj[weekDay.Block] = blockTimeId;
                            //         let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                            //     }
                            // }
                        } else {
                            // // previous was an ongoing schedule maintain that.
                            // let newRecStart = moment(selectedDay).add(7, "day");
                            // // create new entry for upcoming schedule based on week record existence.
                            // let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY));
                            // if (weekRecExist.length > 0) {
                            //     let existData = weekRecExist[0];
                            //     let dayInsertObj = {
                            //         LastUpdated: zone.getLastUpdate()
                            //     }
                            //     const blockTimeId = existData[weekDay.Block]
                            //         ? uuidv4()
                            //         : null;
                            //     if (blockTimeId) {
                            //         for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            //             const block = existBlocks[blockInc];
                            //             const blockObj = {
                            //                 BlockTimeId: blockTimeId,
                            //                 StaffId: staffId,
                            //                 Name: block.Name,
                            //                 StartTime: block.StartTime,
                            //                 EndTime: block.EndTime,
                            //                 ...zone.getCreateUpdate()
                            //             }
                            //             let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockObj);
                            //         }
                            //     }
                            //     dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                            //     dayInsertObj[weekDay.DateEnd] = null;
                            //     dayInsertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                            //     dayInsertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                            //     dayInsertObj[weekDay.Block] = blockTimeId;
                            //     let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            //         .where("StaffScheduleId", "=", existData.StaffScheduleId)
                            //         .andWhere("StaffId", "=", staffId)
                            //         .update(dayInsertObj);
                            // } else {
                            //     let insertObj = {
                            //         StaffId: staffId,
                            //         ...zone.getCreateUpdate()
                            //     }
                            //     const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                            //     if (blockTimeId) {
                            //         // insert blockTimes first
                            //         for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            //             const block = existBlocks[blockInc];
                            //             const blockObj = {
                            //                 BlockTimeId: blockTimeId,
                            //                 StaffId: staffId,
                            //                 Name: block.Name,
                            //                 StartTime: block.StartTime,
                            //                 EndTime: block.EndTime,
                            //                 ...zone.getCreateUpdate()
                            //             }
                            //             let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockObj);
                            //         }
                            //     }
                            //     insertObj[weekDay.DateStart] = newRecStart.toDate();
                            //     insertObj[weekDay.DateEnd] = null;
                            //     insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                            //     insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                            //     insertObj[weekDay.Block] = blockTimeId;
                            //     let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                            // }
                        }
                    }
                } else {
                    if (selectedDay.isSame(currentSchedularDate)) {
                        if (existDetail[weekDay.Block]) {
                            await deleteBlockTimes(knex, staffId, existDetail[weekDay.Block]);
                        }
                        let updateObj = {
                            ScheduleType: schedule.ScheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        updateObj[weekDay.DateStart] = null;
                        updateObj[weekDay.DateEnd] = null;
                        updateObj[weekDay.DayStart] = null;
                        updateObj[weekDay.DayEnd] = null;
                        updateObj[weekDay.Block] = null;
                        let updatedRec = await knex(STAFF_SCHEDULE)
                            .where("StaffId", "=", staffId)
                            .andWhere(`${weekDay.DateStart}`, "=", currentSchedularDate.toDate())
                            .andWhere("ScheduleType", "=", schedule.ScheduleType)
                            .update(updateObj);
                        await deleteEmptyWeekRecords(knex, staffId, existDetail.StaffScheduleId);
                        if (existDetail[weekDay.DateEnd]) {
                            let prevOldEndDate = moment(existDetail[weekDay.DateEnd]);
                            if (prevOldEndDate.isAfter(selectedDay)) {
                                let newRecStart = moment(selectedDay).add(7, "day");
                                // create new entry for upcoming schedule based on week record existence.
                                let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY), schedule.ScheduleType);
                                if (weekRecExist.length > 0) {
                                    let existData = weekRecExist[0];
                                    let dayInsertObj = {
                                        ScheduleType: schedule.ScheduleType,
                                        LastUpdated: zone.getLastUpdate()
                                    }
                                    const blockTimeId = existData[weekDay.Block]
                                        ? uuidv4()
                                        : null;
                                    if (blockTimeId) {
                                        await deleteBlockTimes(knex, staffId, blockTimeId);
                                        let blocksArr = [];
                                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                            const block = existBlocks[blockInc];
                                            const blockObj = {
                                                BlockTimeId: blockTimeId,
                                                StaffId: staffId,
                                                Name: block.Name,
                                                StartTime: block.StartTime,
                                                EndTime: block.EndTime,
                                                ...zone.getCreateUpdate()
                                            }
                                            blocksArr.push(blockObj);
                                        }
                                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                    }
                                    dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                                    dayInsertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                                    dayInsertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                    dayInsertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                    dayInsertObj[weekDay.Block] = blockTimeId;
                                    let scheduleUpdated = await knex(STAFF_SCHEDULE)
                                        .where("StaffScheduleId", "=", existData.StaffScheduleId)
                                        .andWhere("StaffId", "=", staffId)
                                        .andWhere("ScheduleType", "=", schedule.ScheduleType)
                                        .update(dayInsertObj);
                                } else {
                                    let insertObj = {
                                        StaffId: staffId,
                                        ScheduleType: schedule.ScheduleType,
                                        ...zone.getCreateUpdate()
                                    }
                                    const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                                    if (blockTimeId) {
                                        // insert blockTimes first
                                        await deleteBlockTimes(knex, staffId, blockTimeId);
                                        let blocksArr = [];
                                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                            const block = existBlocks[blockInc];
                                            const blockObj = {
                                                BlockTimeId: blockTimeId,
                                                StaffId: staffId,
                                                Name: block.Name,
                                                StartTime: block.StartTime,
                                                EndTime: block.EndTime,
                                                ...zone.getCreateUpdate()
                                            }
                                            blocksArr.push(blockObj);
                                        }
                                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                    }
                                    insertObj[weekDay.DateStart] = newRecStart.toDate();
                                    insertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                                    insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                    insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                    insertObj[weekDay.Block] = blockTimeId;
                                    let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                                }
                            }
                        } else {
                            // previous was an ongoing schedule maintain that.
                            let newRecStart = moment(selectedDay).add(7, "day");
                            // create new entry for upcoming schedule based on week record existence.
                            let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY), schedule.ScheduleType);
                            if (weekRecExist.length > 0) {
                                let existData = weekRecExist[0];
                                let dayInsertObj = {
                                    ScheduleType: schedule.ScheduleType,
                                    LastUpdated: zone.getLastUpdate()
                                }
                                const blockTimeId = existData[weekDay.Block]
                                    ? uuidv4()
                                    : null;
                                if (blockTimeId) {
                                    await deleteBlockTimes(knex, staffId, blockTimeId);
                                    let blocksArr = [];
                                    for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                        const block = existBlocks[blockInc];
                                        const blockObj = {
                                            BlockTimeId: blockTimeId,
                                            StaffId: staffId,
                                            Name: block.Name,
                                            StartTime: block.StartTime,
                                            EndTime: block.EndTime,
                                            ...zone.getCreateUpdate()
                                        }
                                        blocksArr.push(blockObj);
                                    }
                                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                }
                                dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                                dayInsertObj[weekDay.DateEnd] = null;
                                dayInsertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                dayInsertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                dayInsertObj[weekDay.Block] = blockTimeId;
                                let scheduleUpdated = await knex(STAFF_SCHEDULE)
                                    .where("StaffScheduleId", "=", existData.StaffScheduleId)
                                    .andWhere("StaffId", "=", staffId)
                                    .andWhere("ScheduleType", "=", schedule.ScheduleType)
                                    .update(dayInsertObj);
                            } else {
                                let insertObj = {
                                    StaffId: staffId,
                                    ScheduleType: schedule.ScheduleType,
                                    ...zone.getCreateUpdate()
                                }
                                const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                                if (blockTimeId) {
                                    await deleteBlockTimes(knex, staffId, blockTimeId);
                                    // insert blockTimes first
                                    let blocksArr = [];
                                    for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                        const block = existBlocks[blockInc];
                                        const blockObj = {
                                            BlockTimeId: blockTimeId,
                                            StaffId: staffId,
                                            Name: block.Name,
                                            StartTime: block.StartTime,
                                            EndTime: block.EndTime,
                                            ...zone.getCreateUpdate()
                                        }
                                        blocksArr.push(blockObj);
                                    }
                                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                }
                                insertObj[weekDay.DateStart] = newRecStart.toDate();
                                insertObj[weekDay.DateEnd] = null;
                                insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                insertObj[weekDay.Block] = blockTimeId;
                                let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                            }
                        }
                    } else {
                        let newEndForPrevSch = moment(selectedDay).subtract(7, "day");
                        let prevEndUpdateObj = {
                            ScheduleType: schedule.ScheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        prevEndUpdateObj[weekDay.DateEnd] = newEndForPrevSch.toDate();
                        let prevUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffId", "=", staffId)
                            .andWhere("StaffScheduleId", "=", existDetail.StaffScheduleId)
                            .andWhere("ScheduleType", "=", schedule.ScheduleType)
                            .update(prevEndUpdateObj)
                        if (existDetail[weekDay.DateEnd]) {
                            let prevOldEndDate = moment(existDetail[weekDay.DateEnd]);
                            if (prevOldEndDate.isAfter(selectedDay)) {
                                let newRecStart = moment(selectedDay).add(7, "day");
                                // create new entry for upcoming schedule based on week record existence.
                                let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY), schedule.ScheduleType);
                                if (weekRecExist.length > 0) {
                                    let existData = weekRecExist[0];
                                    let dayInsertObj = {
                                        ScheduleType: schedule.ScheduleType,
                                        LastUpdated: zone.getLastUpdate()
                                    }
                                    const blockTimeId = existData[weekDay.Block]
                                        ? uuidv4()
                                        : null;
                                    if (blockTimeId) {
                                        await deleteBlockTimes(knex, staffId, blockTimeId);
                                        let blocksArr = [];
                                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                            const block = existBlocks[blockInc];
                                            const blockObj = {
                                                BlockTimeId: blockTimeId,
                                                StaffId: staffId,
                                                Name: block.Name,
                                                StartTime: block.StartTime,
                                                EndTime: block.EndTime,
                                                ...zone.getCreateUpdate()
                                            }
                                            blocksArr.push(blockObj)
                                        }
                                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                    }
                                    dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                                    dayInsertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                                    dayInsertObj[weekDay.DayStart] = existData[weekDay.DayStart];
                                    dayInsertObj[weekDay.DayEnd] = existData[weekDay.DayEnd];
                                    dayInsertObj[weekDay.Block] = blockTimeId;
                                    let scheduleUpdated = await knex(STAFF_SCHEDULE)
                                        .where("StaffScheduleId", "=", existData.StaffScheduleId)
                                        .andWhere("StaffId", "=", staffId)
                                        .andWhere("ScheduleType", "=", schedule.ScheduleType)
                                        .update(dayInsertObj);
                                } else {
                                    let insertObj = {
                                        StaffId: staffId,
                                        ScheduleType: schedule.ScheduleType,
                                        ...zone.getCreateUpdate()
                                    }
                                    const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                                    if (blockTimeId) {
                                        await deleteBlockTimes(knex, staffId, blockTimeId);
                                        // insert blockTimes first
                                        let blocksArr = [];
                                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                            const block = existBlocks[blockInc];
                                            const blockObj = {
                                                BlockTimeId: blockTimeId,
                                                StaffId: staffId,
                                                Name: block.Name,
                                                StartTime: block.StartTime,
                                                EndTime: block.EndTime,
                                                ...zone.getCreateUpdate()
                                            }
                                            blocksArr.push(blockObj);
                                        }
                                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                    }
                                    insertObj[weekDay.DateStart] = newRecStart.toDate();
                                    insertObj[weekDay.DateEnd] = prevOldEndDate.toDate();
                                    insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                    insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                    insertObj[weekDay.Block] = blockTimeId;
                                    let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                                }
                            }
                        } else {
                            // previous was an ongoing schedule maintain that.
                            // create new entry for upcoming schedule based on week record existence.
                            let newRecStart = moment(selectedDay).add(7, "day");
                            let weekRecExist = await findWeekRecord(knex, staffId, newRecStart.format(DATE_TIME_FORMAT.DDLMMLYYYY), schedule.ScheduleType);
                            if (weekRecExist.length > 0) {
                                let existData = weekRecExist[0];
                                let dayInsertObj = {
                                    ScheduleType: schedule.ScheduleType,
                                    LastUpdated: zone.getLastUpdate()
                                }
                                const blockTimeId = existData[weekDay.Block]
                                    ? uuidv4()
                                    : null;
                                if (blockTimeId) {
                                    await deleteBlockTimes(knex, staffId, blockTimeId);
                                    let blocksArr = [];
                                    for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                        const block = existBlocks[blockInc];
                                        const blockObj = {
                                            BlockTimeId: blockTimeId,
                                            StaffId: staffId,
                                            Name: block.Name,
                                            StartTime: block.StartTime,
                                            EndTime: block.EndTime,
                                            ...zone.getCreateUpdate()
                                        }
                                        blocksArr.push(blockObj)
                                    }
                                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                }
                                dayInsertObj[weekDay.DateStart] = newRecStart.toDate();
                                dayInsertObj[weekDay.DateEnd] = null;
                                dayInsertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                dayInsertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                dayInsertObj[weekDay.Block] = blockTimeId;
                                let scheduleUpdated = await knex(STAFF_SCHEDULE)
                                    .where("StaffScheduleId", "=", existData.StaffScheduleId)
                                    .andWhere("StaffId", "=", staffId)
                                    .andWhere("ScheduleType", "=", schedule.ScheduleType)
                                    .update(dayInsertObj);
                            } else {
                                let insertObj = {
                                    StaffId: staffId,
                                    ScheduleType: schedule.ScheduleType,
                                    ...zone.getCreateUpdate()
                                }
                                const blockTimeId = existBlocks.length > 0 ? uuidv4() : null;
                                if (blockTimeId) {
                                    await deleteBlockTimes(knex, staffId, blockTimeId);
                                    // insert blockTimes first
                                    let blocksArr = [];
                                    for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                                        const block = existBlocks[blockInc];
                                        const blockObj = {
                                            BlockTimeId: blockTimeId,
                                            StaffId: staffId,
                                            Name: block.Name,
                                            StartTime: block.StartTime,
                                            EndTime: block.EndTime,
                                            ...zone.getCreateUpdate()
                                        }
                                        blocksArr.push(blockObj)
                                    }
                                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
                                }
                                insertObj[weekDay.DateStart] = newRecStart.toDate();
                                insertObj[weekDay.DateEnd] = null;
                                insertObj[weekDay.DayStart] = existDetail[weekDay.DayStart];
                                insertObj[weekDay.DayEnd] = existDetail[weekDay.DayEnd];
                                insertObj[weekDay.Block] = blockTimeId;
                                let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                            }
                        }
                    }
                }
                scheduleIDLog=existDetail.StaffScheduleId
            }
        }

        // Send push notification to staff.
        if (event.headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
            try {
                let staffDetail = await knex(STAFF).select("StaffId", "FcmToken").where("StaffId", "=", staffId);
                const msgInsert = await knex(STAFF_MESSAGES).insert({
                    StaffId: staffDetail[0].StaffId,
                    Title: "Schedule updated",
                    Description: `The schedule for ${moment(selectedDateRaw, DATE_TIME_FORMAT.DDLMMLYYYY).format(DATE_TIME_FORMAT.MMM_DDC_YYYY)} has been updated.`,
                    ImagePath: null,
                    Tag: MESSAGE_TAG.IMPORTANT,
                    Date: moment().toDate(),
                    ...zone.getCreateUpdate()
                })
                if (staffDetail && staffDetail[0].FcmToken) {
                    const message = {
                        token: staffDetail[0].FcmToken,
                        notification: {
                            title: "Schedule updated",
                            body: `The schedule for ${moment(selectedDateRaw, DATE_TIME_FORMAT.DDLMMLYYYY).format(DATE_TIME_FORMAT.MMM_DDC_YYYY)} has been updated.`
                        },
                        data: {
                            DateTime: moment(selectedDateRaw, DATE_TIME_FORMAT.DDLMMLYYYY).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                            ScreenName: PUSH.SCREEN.MY_BOOKINGS
                        }
                    }
                    const therapistApp = InitializeFirebaseTherapist();
                    const sentNotification = await therapistApp.messaging().send(message);
                    console.log(sentNotification)
                }
            } catch (error) {
                console.log(error);
            }
        }
        try {
            let lambda = new AWS.Lambda();
            let lambdaName = getLambdaNameByInstance() + "-bookingDispatcher";
            console.log(lambdaName);
            lambda.invoke({
                FunctionName: lambdaName,
                InvocationType: 'Event',
                LogType: 'Tail',
                Payload: JSON.stringify({
                    StaffId: staffId
                })
            }, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    console.log('Lambda hit ' + data.Payload);
                }
            });
            // await holdfor10secs();
        } catch (error) {
            console.log(error)
        }
                   
        console.log("save",scheduleIDLog)
           // Save log for schedule create/update/delete
            switch(schedule.RequestType){
                case 0:
                    await saveLog(knex,json.AdminId,STAFF_SCHEDULE,scheduleIDLog,LOG_ACTION_TYPE.CREATE)
                    break;
                case 1:
                    await saveLog(knex,json.AdminId,STAFF_SCHEDULE,scheduleIDLog,LOG_ACTION_TYPE.DELETE)
                    break;
                default:
                    await saveLog(knex,json.AdminId,STAFF_SCHEDULE,scheduleIDLog,LOG_ACTION_TYPE.UPDATE)
                    break;
            }
           
        
        await knex.destroy();
        
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_SCH_UPDATE_SUCCESS
        }
        // body: JSON.stringify({
        //     Data: staffScheduleData
        // })
    }
}

const insertSchedule = async ({
    knex,
    staffId,
    scheduleType,
    selectedStartDate,
    selectedEndDate,
    DayStartTime,
    DayEndTime,
    BlockTime,
    previousSchedularDate
}) => {
    /**
     * If endDate is not given then remove all existing future schedule of this staff after startDate
     * and insert this new schedule
     * Note: startDate, endDate must be moment object if provided
     */
    const startDate = moment(selectedStartDate);
    const endDate = selectedEndDate ? moment(selectedEndDate) : null;
    const weekDayNum = startDate.day();
    const weekDay = WEEK.find(f => f.Code === weekDayNum);
    console.log("weekDay",weekDay)
    let scheduleIDLog=null
   console.log("staffId",staffId)
   console.log("scheduleType",scheduleType)
   console.log("selectedStartDate",selectedStartDate)
   console.log("selectedEndDate",selectedEndDate)
   console.log("DayStartTime",DayStartTime)
   console.log("DayEndTime",DayEndTime)
   console.log("BlockTime",BlockTime)
   console.log("previousSchedularDate",previousSchedularDate)
//    return false;
    if (!endDate) {
        // find all future schedule after this date and remove them with their blocktimes.
        let existFutureSchedule = await knex(STAFF_SCHEDULE)
            .select(
                `StaffScheduleId`,
                `${weekDay.DateStart}`,
                `${weekDay.Block}`
            )
            .where("StaffId", "=", staffId)
            .andWhere(`${weekDay.DateStart}`, ">", startDate.toDate())
            .andWhere("ScheduleType", "=", scheduleType)
        let deleteStaffScheduleIds=[]
        let deleteBlockTimeIds=[]
        for (exisInc = 0; exisInc < existFutureSchedule.length; exisInc++) {
            let element = existFutureSchedule[exisInc];
            /**
             * Update the week record, insert this day as null value
             * Delete its blocktimes if any
             */
            deleteStaffScheduleIds.push(element.StaffScheduleId)
            deleteBlockTimeIds.push(element[weekDay.Block])
           
        }
        await deleteScheduleBulk(knex, staffId, weekDay, deleteStaffScheduleIds, deleteBlockTimeIds);

        // insert the new schedule in its week entry if exist else create new entry.
        let weekRecordExist = await findWeekRecord(knex, staffId, startDate.format(DATE_TIME_FORMAT.DDLMMLYYYY), scheduleType);
        console.log("weekRecordExist",weekRecordExist);
        // return false
        if (weekRecordExist.length > 0) {
            let existData = weekRecordExist[0];
            let dayInsertObj = {
                ScheduleType: scheduleType,
                LastUpdated: zone.getLastUpdate()
            }
            const blockTimeId = existData[weekDay.Block]
                ? existData[weekDay.Block]
                : BlockTime.length > 0
                    ? uuidv4()
                    : null;
            if (blockTimeId) {
                // first remove existing blocks
                await deleteBlockTimes(knex, staffId, blockTimeId);
                // insert blockTimes first
                let blockbatchObj=[]
                for (let blockInc = 0; blockInc < BlockTime.length; blockInc++) {
                    const block = BlockTime[blockInc];
                    const blockObj = {
                        BlockTimeId: blockTimeId,
                        StaffId: staffId,
                        Name: block.Name,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime,
                        ...zone.getCreateUpdate()
                    }
                    blockbatchObj.push(blockObj)
                }
                if(blockbatchObj.length>0){
                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                }
               
            }
            dayInsertObj[weekDay.DateStart] = startDate.toDate();
            dayInsertObj[weekDay.DateEnd] = null;
            dayInsertObj[weekDay.DayStart] = DayStartTime;
            dayInsertObj[weekDay.DayEnd] = DayEndTime;
            dayInsertObj[weekDay.Block] = blockTimeId;
            let scheduleUpdated = await knex(STAFF_SCHEDULE)
                .where("StaffScheduleId", "=", existData.StaffScheduleId)
                .andWhere("StaffId", "=", staffId)
                .andWhere("ScheduleType", "=", scheduleType)
                .update(dayInsertObj);
                console.log("here10")
            scheduleIDLog=existData.StaffScheduleId;
        } else {
            let insertObj = {
                StaffId: staffId,
                ScheduleType: scheduleType,
                ...zone.getCreateUpdate()
            }
            const blockTimeId = BlockTime.length > 0 ? uuidv4() : null;
            if (blockTimeId) {
                await deleteBlockTimes(knex, staffId, blockTimeId);
                // insert blockTimes first
                let blockbatchObj=[]
                for (let blockInc = 0; blockInc < BlockTime.length; blockInc++) {
                    const block = BlockTime[blockInc];
                    const blockObj = {
                        BlockTimeId: blockTimeId,
                        StaffId: staffId,
                        Name: block.Name,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime,
                        ...zone.getCreateUpdate()
                    }
                    blockbatchObj.push(blockObj)
                    // let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockObj);
                }
                if(blockbatchObj.length>0){
                    let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                }
            }
            insertObj[weekDay.DateStart] = startDate.toDate();
            insertObj[weekDay.DateEnd] = null;
            insertObj[weekDay.DayStart] = DayStartTime;
            insertObj[weekDay.DayEnd] = DayEndTime;
            insertObj[weekDay.Block] = blockTimeId;
            let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
            console.log("here9")
            scheduleIDLog=scheduleInserted[0];
        }
    } else {
        if (previousSchedularDate) {
            const prevSchDate = moment(previousSchedularDate);
            let prevSchExistData = await knex(STAFF_SCHEDULE)
                .select(
                    "StaffScheduleId",
                    `${weekDay.DateStart}`,
                    `${weekDay.DateEnd}`,
                    `${weekDay.DayStart}`,
                    `${weekDay.DayEnd}`,
                    `${weekDay.Block}`
                )
                .where(`${weekDay.DateStart}`, "=", prevSchDate.toDate())
                .andWhere("StaffId", "=", staffId)
                .andWhere("ScheduleType", "=", scheduleType);
            let alreadyExistPrevData = prevSchExistData[0];
            if (prevSchDate.isSame(startDate)) {
                console.log("1")
                /**
                 * existing schedule start date is same as req start date 
                 * we need to continue existing schedule after given end date
                 * and if end date is less than existing schedule end date
                 * or existing scheduel is ongoing schedule
                 */
                let contExist = false;
                if (
                    !alreadyExistPrevData[weekDay.DateEnd]
                ) {
                    contExist = true;
                }
                if (
                    alreadyExistPrevData[weekDay.DateEnd] &&
                    moment(alreadyExistPrevData[weekDay.DateEnd]).isAfter(endDate)
                ) {
                    contExist = true;
                }
                if (contExist) {
                    console.log("2")
                    /**
                     * we need to continue the existing schedule which now starts after current end date and ends accordingly
                     */
                    let prevSchNewStart = moment(endDate).add(7, "day");
                    let prevNewEndDate = alreadyExistPrevData[weekDay.DateEnd]
                        ? moment(alreadyExistPrevData[weekDay.DateEnd])
                        : null;
                    let weekRecExist = await findWeekRecord(knex, staffId, prevSchNewStart, scheduleType);
                    const blockTimeId = alreadyExistPrevData[weekDay.Block] ? uuidv4() : null;
                    if (blockTimeId) {
                        let existBlocks = await knex(STAFF_BLOCK_TIME)
                            .select("*").where("StaffId", "=", staffId)
                            .andWhere("BlockTimeId", "=", alreadyExistPrevData[weekDay.Block]);
                        await deleteBlockTimes(knex, staffId, blockTimeId);
                        let blockbatchObj=[]
                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            const block = existBlocks[blockInc];
                            const blockObj = {
                                BlockTimeId: blockTimeId,
                                StaffId: staffId,
                                Name: block.Name,
                                StartTime: block.StartTime,
                                EndTime: block.EndTime,
                                ...zone.getCreateUpdate()
                            }
                           blockbatchObj.push(blockObj)
                        }
                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                        
                    }
                    if (weekRecExist.length > 0) {
                        console.log("13")
                        // just update week record
                        let nextWRExistData = weekRecExist[0];
                        let dayInsertObj = {
                            ScheduleType: scheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        dayInsertObj[weekDay.DateStart] = prevSchNewStart.toDate();
                        dayInsertObj[weekDay.DateEnd] = prevNewEndDate ? prevNewEndDate.toDate() : null;
                        dayInsertObj[weekDay.DayStart] = alreadyExistPrevData[weekDay.DayStart];
                        dayInsertObj[weekDay.DayEnd] = alreadyExistPrevData[weekDay.DayEnd];
                        dayInsertObj[weekDay.Block] = blockTimeId;
                        let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffScheduleId", "=", nextWRExistData.StaffScheduleId)
                            .andWhere("StaffId", "=", staffId)
                            .andWhere("ScheduleType", "=", scheduleType)
                            .update(dayInsertObj);
                            console.log("here8")
                            scheduleIDLog=nextWRExistData.StaffScheduleId;
                    } else {
                        console.log("4")
                        // create new week record
                        let insertObj = {
                            StaffId: staffId,
                            ScheduleType: scheduleType,
                            ...zone.getCreateUpdate()
                        }
                        insertObj[weekDay.DateStart] = prevSchNewStart.toDate();
                        insertObj[weekDay.DateEnd] = prevNewEndDate ? prevNewEndDate.toDate() : null;
                        insertObj[weekDay.DayStart] = alreadyExistPrevData[weekDay.DayStart];
                        insertObj[weekDay.DayEnd] = alreadyExistPrevData[weekDay.DayEnd];
                        insertObj[weekDay.Block] = blockTimeId;
                        let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                        console.log("here7")
                        scheduleIDLog=scheduleInserted[0];
                    }
                }
            } else if (prevSchDate.isBefore(startDate)) {
                console.log("5")
                /**
                 * existing schedule start before req start date
                 * stop this prev schedule to last week and make a new entry if its end date is greater then new schedule end date or was ongoing weekly
                 */
                let prevSchDetail = await updatePrevSchedule(knex, staffId, startDate, prevSchDate, scheduleType);
                if (!startDate.isSame(alreadyExistPrevData[weekDay.DateEnd])) {
                    let prevSchNewStart = moment(endDate).add(7, "day");
                    let prevNewEndDate = alreadyExistPrevData[weekDay.DateEnd]
                        ? moment(alreadyExistPrevData[weekDay.DateEnd])
                        : null;
                    let weekRecExist = await findWeekRecord(knex, staffId, prevSchNewStart, scheduleType);
                    const blockTimeId = alreadyExistPrevData[weekDay.Block] ? uuidv4() : null;
                    if (blockTimeId) {
                        let existBlocks = await knex(STAFF_BLOCK_TIME)
                            .select("*").where("StaffId", "=", staffId)
                            .andWhere("BlockTimeId", "=", alreadyExistPrevData[weekDay.Block]);
                        await deleteBlockTimes(knex, staffId, blockTimeId);
                        let blockbatchObj=[]
                        for (let blockInc = 0; blockInc < existBlocks.length; blockInc++) {
                            const block = existBlocks[blockInc];
                            const blockObj = {
                                BlockTimeId: blockTimeId,
                                StaffId: staffId,
                                Name: block.Name,
                                StartTime: block.StartTime,
                                EndTime: block.EndTime,
                                ...zone.getCreateUpdate()
                            }
                            blockbatchObj.push(blockObj)
                           
                        }
                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                    }
                    if (weekRecExist.length > 0) {
                        // just update week record
                        let nextWRExistData = weekRecExist[0];
                        let dayInsertObj = {
                            ScheduleType: scheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        dayInsertObj[weekDay.DateStart] = prevSchNewStart.toDate();
                        dayInsertObj[weekDay.DateEnd] = prevNewEndDate ? prevNewEndDate.toDate() : null;
                        dayInsertObj[weekDay.DayStart] = alreadyExistPrevData[weekDay.DayStart];
                        dayInsertObj[weekDay.DayEnd] = alreadyExistPrevData[weekDay.DayEnd];
                        dayInsertObj[weekDay.Block] = blockTimeId;
                        let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffScheduleId", "=", nextWRExistData.StaffScheduleId)
                            .andWhere("StaffId", "=", staffId)
                            .andWhere("ScheduleType", "=", scheduleType)
                            .update(dayInsertObj);
                            console.log("here6")
                            scheduleIDLog=nextWRExistData.StaffScheduleId;
                    } else {
                        // create new week record
                        let insertObj = {
                            StaffId: staffId,
                            ScheduleType: scheduleType,
                            ...zone.getCreateUpdate()
                        }
                        insertObj[weekDay.DateStart] = prevSchNewStart.toDate();
                        insertObj[weekDay.DateEnd] = prevNewEndDate ? prevNewEndDate.toDate() : null;
                        insertObj[weekDay.DayStart] = alreadyExistPrevData[weekDay.DayStart];
                        insertObj[weekDay.DayEnd] = alreadyExistPrevData[weekDay.DayEnd];
                        insertObj[weekDay.Block] = blockTimeId;
                        let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                        console.log("here7")
                        scheduleIDLog=scheduleInserted[0];
                    }
                }
            }
        }
        let existFutureSchedule = await knex(STAFF_SCHEDULE)
            .select(
                `StaffScheduleId`,
                `${weekDay.DateStart}`,
                `${weekDay.DateEnd}`,
                `${weekDay.DayStart}`,
                `${weekDay.DayEnd}`,
                `${weekDay.Block}`
            )
            .where("StaffId", "=", staffId)
            .andWhere(`${weekDay.DateStart}`, ">", startDate.toDate())
            .andWhere(`${weekDay.DateStart}`, "<=", endDate.toDate())
            .andWhere("ScheduleType", "=", scheduleType)
        existFutureSchedule.sort((a, b) => {
            const aStart = moment(a[weekDay.DateStart]);
            const bStart = moment(b[weekDay.DateStart]);
            if (bStart.isAfter(aStart)) {
                return -1;
            } else {
                return 1;
            }
        })
        console.log("loop start?")
        for (existInc = 0; existInc < existFutureSchedule.length; existInc++) {
           
            let element = existFutureSchedule[existInc];
            let elStart = moment(element[weekDay.DateStart]);
            if (element[weekDay.DateEnd]) {
                let elEnd = moment(element[weekDay.DateEnd]);
                if (elEnd.isBefore(endDate) || elEnd.isSame(endDate)) {
                    await deleteSchedule(knex, staffId, weekDay, element.StaffScheduleId, element[weekDay.Block]);
                } else {
                    let blocks = [];
                    if (element[weekDay.Block]) {
                        blocks = await knex(STAFF_BLOCK_TIME)
                            .select("*").where("StaffId", "=", staffId)
                            .andWhere("BlockTimeId", "=", element[weekDay.Block]);
                    }
                    // this particular schedule needs to be deleted,
                    await deleteSchedule(knex, staffId, weekDay, element.StaffScheduleId, element[weekDay.Block]);
                    // add new schedule which should start from next weekdate from endDate and ends at element's endDate
                    let nextWeekStartDate = moment(endDate).add(7, "day");
                    let existEndDate = moment(element[weekDay.DateEnd]);
                    let nextRecWeekExist = await findWeekRecord(knex, staffId, nextWeekStartDate.format(DATE_TIME_FORMAT.DDLMMLYYYY), scheduleType);

                    const blockTimeId = blocks.length > 0
                        ? uuidv4()
                        : null;
                    if (blockTimeId) {
                        await deleteBlockTimes(knex, staffId, blockTimeId);
                        // insert blockTimes first
                        let blockbatchObj=[]
                        for (let blockInc = 0; blockInc < blocks.length; blockInc++) {
                            const block = blocks[blockInc];
                            const blockObj = {
                                BlockTimeId: blockTimeId,
                                StaffId: staffId,
                                Name: block.Name,
                                StartTime: block.StartTime,
                                EndTime: block.EndTime,
                                ...zone.getCreateUpdate()
                            }
                            blockbatchObj.push(blockObj)
                        }
                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                    }
                    if (nextRecWeekExist.length > 0) {
                        // just update week record
                        let nextWRExistData = nextRecWeekExist[0];
                        let dayInsertObj = {
                            ScheduleType: scheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        dayInsertObj[weekDay.DateStart] = nextWeekStartDate.toDate();
                        dayInsertObj[weekDay.DateEnd] = existEndDate.toDate();
                        dayInsertObj[weekDay.DayStart] = element[weekDay.DayStart];
                        dayInsertObj[weekDay.DayEnd] = element[weekDay.DayEnd];
                        dayInsertObj[weekDay.Block] = blockTimeId;
                        let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffScheduleId", "=", nextWRExistData.StaffScheduleId)
                            .andWhere("StaffId", "=", staffId)
                            .andWhere("ScheduleType", "=", scheduleType)
                            .update(dayInsertObj);
                            console.log("here5")
                            scheduleIDLog=nextWRExistData.StaffScheduleId
                    } else {
                        // create new week record
                        let insertObj = {
                            StaffId: staffId,
                            ScheduleType: scheduleType,
                            ...zone.getCreateUpdate()
                        }
                        insertObj[weekDay.DateStart] = nextWeekStartDate.toDate();
                        insertObj[weekDay.DateEnd] = existEndDate.toDate();
                        insertObj[weekDay.DayStart] = element[weekDay.DayStart];
                        insertObj[weekDay.DayEnd] = element[weekDay.DayEnd];
                        insertObj[weekDay.Block] = blockTimeId;
                        let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                        console.log("here4")
                        scheduleIDLog=scheduleInserted[0]
                    }
                    break;
                }
            } else {
                if (endDate.isBefore(elStart)) {
                    break;
                } else {
                    let blocks = [];
                    if (element[weekDay.Block]) {
                        blocks = await knex(STAFF_BLOCK_TIME).select("*").where("StaffId", "=", staffId).andWhere("BlockTimeId", "=", element[weekDay.Block]);
                    }
                    // this particular schedule needs to be deleted,
                    await deleteSchedule(knex, staffId, weekDay, element.StaffScheduleId, element[weekDay.Block]);
                    let nextWeekStartDate = moment(endDate).add(7, "day");
                    let nextRecWeekExist = await findWeekRecord(knex, staffId, nextWeekStartDate.format(DATE_TIME_FORMAT.DDLMMLYYYY), scheduleType);

                    const blockTimeId = blocks.length > 0
                        ? uuidv4()
                        : null;
                    if (blockTimeId) {
                        await deleteBlockTimes(knex, staffId, blockTimeId);
                        // insert blockTimes first
                        let blockbatchObj=[]
                        for (let blockInc = 0; blockInc < blocks.length; blockInc++) {
                            const block = blocks[blockInc];
                            const blockObj = {
                                BlockTimeId: blockTimeId,
                                StaffId: staffId,
                                Name: block.Name,
                                StartTime: block.StartTime,
                                EndTime: block.EndTime,
                                ...zone.getCreateUpdate()
                            }
                            blockbatchObj.push(blockObj)
                        }
                        let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blockbatchObj);
                    }
                    if (nextRecWeekExist.length > 0) {
                        // just update week record
                        let nextWRExistData = nextRecWeekExist[0];
                        let dayInsertObj = {
                            ScheduleType: scheduleType,
                            LastUpdated: zone.getLastUpdate()
                        }
                        dayInsertObj[weekDay.DateStart] = nextWeekStartDate.toDate();
                        dayInsertObj[weekDay.DateEnd] = null;
                        dayInsertObj[weekDay.DayStart] = element[weekDay.DayStart];
                        dayInsertObj[weekDay.DayEnd] = element[weekDay.DayEnd];
                        dayInsertObj[weekDay.Block] = blockTimeId;
                        let scheduleUpdated = await knex(STAFF_SCHEDULE)
                            .where("StaffScheduleId", "=", nextWRExistData.StaffScheduleId)
                            .andWhere("StaffId", "=", staffId)
                            .andWhere("ScheduleType", "=", scheduleType)
                            .update(dayInsertObj);
                            scheduleIDLog=nextWRExistData.StaffScheduleId
                    } else {
                        // create new week record
                        let insertObj = {
                            StaffId: staffId,
                            ScheduleType: scheduleType,
                            ...zone.getCreateUpdate()
                        }
                        insertObj[weekDay.DateStart] = nextWeekStartDate.toDate();
                        insertObj[weekDay.DateEnd] = null;
                        insertObj[weekDay.DayStart] = element[weekDay.DayStart];
                        insertObj[weekDay.DayEnd] = element[weekDay.DayEnd];
                        insertObj[weekDay.Block] = blockTimeId;
                        let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
                        console.log("here3")
                        scheduleIDLog=scheduleInserted[0]
                    }
                    break;
                }
            }
        }
        // insert the new schedule in its week entry if exist else create new entry.
        let weekRecordExist = await findWeekRecord(knex, staffId, startDate.format(DATE_TIME_FORMAT.DDLMMLYYYY), scheduleType);
        if (weekRecordExist.length > 0) {
            let existData = weekRecordExist[0];
            let dayInsertObj = {
                ScheduleType: scheduleType,
                LastUpdated: zone.getLastUpdate()
            }
            const blockTimeId = existData[weekDay.Block]
                ? existData[weekDay.Block]
                : BlockTime.length > 0
                    ? uuidv4()
                    : null;
            if (blockTimeId) {
                await deleteBlockTimes(knex, staffId, blockTimeId);
                // insert blockTimes first
                let blocksArr = [];
                for (let blockInc = 0; blockInc < BlockTime.length; blockInc++) {
                    const block = BlockTime[blockInc];
                    const blockObj = {
                        BlockTimeId: blockTimeId,
                        StaffId: staffId,
                        Name: block.Name,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime,
                        ...zone.getCreateUpdate()
                    }
                    blocksArr.push(blockObj);
                }
                let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
            }
            dayInsertObj[weekDay.DateStart] = startDate.toDate();
            dayInsertObj[weekDay.DateEnd] = endDate.toDate();
            dayInsertObj[weekDay.DayStart] = DayStartTime;
            dayInsertObj[weekDay.DayEnd] = DayEndTime;
            dayInsertObj[weekDay.Block] = blockTimeId;
            let scheduleUpdated = await knex(STAFF_SCHEDULE)
                .where("StaffScheduleId", "=", existData.StaffScheduleId)
                .andWhere("StaffId", "=", staffId)
                .andWhere("ScheduleType", "=", scheduleType)
                .update(dayInsertObj);
                console.log("here2")
                scheduleIDLog=existData.StaffScheduleId
        } else {
            let insertObj = {
                StaffId: staffId,
                ScheduleType: scheduleType,
                ...zone.getCreateUpdate()
            }
            const blockTimeId = BlockTime.length > 0 ? uuidv4() : null;
            if (blockTimeId) {
                // insert blockTimes first
                await deleteBlockTimes(knex, staffId, blockTimeId);
                let blocksArr = [];
                for (let blockInc = 0; blockInc < BlockTime.length; blockInc++) {
                    const block = BlockTime[blockInc];
                    const blockObj = {
                        BlockTimeId: blockTimeId,
                        StaffId: staffId,
                        Name: block.Name,
                        StartTime: block.StartTime,
                        EndTime: block.EndTime,
                        ...zone.getCreateUpdate()
                    }
                    blocksArr.push(blockObj);
                }
                let blockInserted = await knex(STAFF_BLOCK_TIME).insert(blocksArr);
            }
            insertObj[weekDay.DateStart] = startDate.toDate();
            insertObj[weekDay.DateEnd] = endDate.toDate();
            insertObj[weekDay.DayStart] = DayStartTime;
            insertObj[weekDay.DayEnd] = DayEndTime;
            insertObj[weekDay.Block] = blockTimeId;
            let scheduleInserted = await knex(STAFF_SCHEDULE).insert(insertObj);
            console.log("here1")
            scheduleIDLog=scheduleInserted[0]
        }
    }
    console.log("scheduleIDLog",scheduleIDLog)
return scheduleIDLog;
}

const deleteSchedule = async (knex, staffId, weekDay, staffScheduleId, blockTimeId) => {
    
    let nullUpdObj = {
        LastUpdated: zone.getLastUpdate()
    }
    nullUpdObj[weekDay.DateStart] = null;
    nullUpdObj[weekDay.DateEnd] = null;
    nullUpdObj[weekDay.DayStart] = null;
    nullUpdObj[weekDay.DayEnd] = null;
    nullUpdObj[weekDay.Block] = null;
    let weekUpWithNulls = await knex(STAFF_SCHEDULE)
        .where("StaffId", "=", staffId)
        .andWhere("StaffScheduleId", "=", staffScheduleId)
        .update(nullUpdObj);
    await deleteBlockTimes(knex, staffId, blockTimeId);
    await deleteEmptyWeekRecords(knex, staffId, staffScheduleId);
}
const deleteScheduleBulk = async (knex, staffId, weekDay, staffScheduleIds, blockTimeIds) => {
    
    let nullUpdObj = {
        LastUpdated: zone.getLastUpdate()
    }
    nullUpdObj[weekDay.DateStart] = null;
    nullUpdObj[weekDay.DateEnd] = null;
    nullUpdObj[weekDay.DayStart] = null;
    nullUpdObj[weekDay.DayEnd] = null;
    nullUpdObj[weekDay.Block] = null;
    let weekUpWithNulls = await knex(STAFF_SCHEDULE)
        .andWhere("StaffId", "=", staffId)
        .whereIn("StaffScheduleId",staffScheduleIds)
        .update(nullUpdObj);
    await deleteBlockTimesBulk(knex, staffId, blockTimeIds);
    await deleteEmptyWeekRecordsBulk(knex, staffId, staffScheduleIds);
}
const updatePrevSchedule = async (knex, staffId, selectedStartDate, prevSchStartDate, scheduleType) => {
    const startDate = moment(selectedStartDate);
    const prevSchStart = moment(prevSchStartDate);
    const weekDayNum = startDate.day();
    const weekDay = WEEK.find(f => f.Code === weekDayNum);

    let prevSchExistData = await knex(STAFF_SCHEDULE)
        .select(
            "StaffScheduleId",
            `${weekDay.DateStart}`,
            `${weekDay.DateEnd}`,
            `${weekDay.DayStart}`,
            `${weekDay.DayEnd}`,
            `${weekDay.Block}`
        )
        .where(`${weekDay.DateStart}`, "=", prevSchStart.toDate())
        .andWhere("StaffId", "=", staffId)
        .andWhere("ScheduleType", "=", scheduleType);
    let prevSchDetail = prevSchExistData[0];
    let prevScheduleUpdateObj = {
        ScheduleType: scheduleType,
        LastUpdated: zone.getLastUpdate()
    }
    prevScheduleUpdateObj[weekDay.DateEnd] = moment(startDate).subtract(7, "day").toDate();
    let prevScheduleUpdated = await knex(STAFF_SCHEDULE)
        .where("StaffScheduleId", "=", prevSchDetail.StaffScheduleId)
        .andWhere("StaffId", "=", staffId)
        .andWhere("ScheduleType", "=", scheduleType)
        .update(prevScheduleUpdateObj);
    let prevDetailObj = {
        ScheduleType: scheduleType,
        StaffScheduleId: prevSchDetail.StaffScheduleId
    }
    prevDetailObj[weekDay.DateStart] = prevSchDetail[weekDay.DateStart];
    prevDetailObj[weekDay.DateEnd] = prevScheduleUpdateObj[weekDay.DateEnd];
    prevDetailObj[weekDay.DayStart] = prevSchDetail[weekDay.DayStart];
    prevDetailObj[weekDay.DayEnd] = prevSchDetail[weekDay.DayEnd];
    prevDetailObj[weekDay.Block] = prevSchDetail[weekDay.Block];
    prevDetailObj.OldEndDate = prevSchDetail[weekDay.DateEnd];
    return prevDetailObj;
}

const findWeekRecord = async (knex, staffId, date, scheduleType) => {
    console.log(staffId, date, scheduleType)
    /**
     * date should be formatted in DATE_TIME_FORMAT.DDLMMLYYYY
     */
    let weekEntry = [];
    try {
        let selectedDay;
        if (moment.isMoment(date)) {
            selectedDay = moment(date)
        } else {
            selectedDay = moment(date, DATE_TIME_FORMAT.DDLMMLYYYY);
        }
        const weekDayNum = selectedDay.day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);
        const currentWeek = getCurrentWeek(selectedDay);
        let week = Object.keys(currentWeek);
        // console.log("week",week)
        // console.log("currentWeek",currentWeek)
        // let entryExistData = await knex(STAFF_SCHEDULE).select("*"
        // )
        // .where("StaffId", "=", staffId)
        // .andWhere("ScheduleType", "=", scheduleType)
        // .andWhere(builder => {
        //     builder.where(`MondayStartDate`, "=", currentWeek['Monday'].toDate())
        //            .orWhere(`TuesdayStartDate`, "=", currentWeek['Tuesday'].toDate())
        //            .orWhere(`WednesdayStartDate`, "=", currentWeek['Wednesday'].toDate())
        //            .orWhere(`ThursdayStartDate`, "=", currentWeek['Thursday'].toDate())
        //            .orWhere(`FridayStartDate`, "=", currentWeek['Friday'].toDate())
        //            .orWhere(`SaturdayStartDate`, "=", currentWeek['Saturday'].toDate())
        //            .orWhere(`SundayStartDate`, "=", currentWeek['Sunday'].toDate())
        //   })
        //   console.log("entryExistData",entryExistData)
        //   let entryExist={}
        //   if(entryExistData.length>0){
        //     let existingEntry=entryExistData[0]
            
        //     for (weekDInc = 0; weekDInc < WEEK.length; weekDInc++) {
        //         let curDay = week[weekDInc];
        //         console.log("curDay",curDay)
        //         console.log("1",existingEntry[`${curDay}StartDate`])
        //             console.log("2",currentWeek[curDay].toDate())
        //         if( moment(existingEntry[`${curDay}StartDate`]).isSame(moment(currentWeek[curDay].toDate()))){
        //             console.log("IN",curDay)
                    
        //             entryExist['StaffScheduleId']=existingEntry['StaffScheduleId']
        //             entryExist[`${curDay}StartDate`]=existingEntry[`${curDay}StartDate`]
        //             entryExist[`${curDay}EndDate`]=existingEntry[`${curDay}EndDate`]
        //             entryExist[`${curDay}StartTime`]=existingEntry[`${curDay}StartTime`]
        //             entryExist[`${curDay}EndTime`]=existingEntry[`${curDay}EndTime`]
        //             entryExist[`${curDay}BlockTimeId`]=existingEntry[`${curDay}BlockTimeId`]
        //             break;
        //         }
        //     }
        //   }
        //   weekEntry=entryExist
        //   console.log("entryExist",entryExist)
        //   return false
        // Code commented after optimisation 04/12/23
        for (weekDInc = 0; weekDInc < week.length; weekDInc++) {
            let curDay = week[weekDInc];
            console.log("curDay",curDay)
            console.log("weekDInc",weekDInc)
            let entryExist = await knex(STAFF_SCHEDULE)
                .select(
                    "StaffScheduleId",
                    `${weekDay.DateStart}`,
                    `${weekDay.DateEnd}`,
                    `${weekDay.DayStart}`,
                    `${weekDay.DayEnd}`,
                    `${weekDay.Block}`
                )
                .where(`${curDay}StartDate`, "=", currentWeek[curDay].toDate())
                .andWhere("StaffId", "=", staffId)
                .andWhere("ScheduleType", "=", scheduleType)
                .modify(qb => {
                    
                    console.log(console.log(qb.toSQL().toNative()));
                })
                
            if (entryExist.length > 0) {
                
                weekEntry = entryExist;
                console.log("weekEntry",weekEntry)
                break;
            }
        }
    } catch (error) {
        return {
            Error: error.message
        }
    }
    // return false
    return weekEntry;
}

const getCurrentWeek = (selectedDate) => {
    const startDate = moment(selectedDate);
    const weekDayNum = startDate.day();
    return {
        Monday: moment(startDate).day(weekDayNum === 0 ? 1 - 7 : 1),
        Tuesday: moment(startDate).day(weekDayNum === 0 ? 2 - 7 : 2),
        Wednesday: moment(startDate).day(weekDayNum === 0 ? 3 - 7 : 3),
        Thursday: moment(startDate).day(weekDayNum === 0 ? 4 - 7 : 4),
        Friday: moment(startDate).day(weekDayNum === 0 ? 5 - 7 : 5),
        Saturday: moment(startDate).day(weekDayNum === 0 ? 6 - 7 : 6),
        Sunday: moment(startDate).day(weekDayNum === 0 ? 0 : 7)
    }
}

const deleteEmptyWeekRecords = async (knex, staffId, staffScheduleId) => {
    try {
        let emptyCheck = await knex(STAFF_SCHEDULE).select("*")
            .where("StaffScheduleId", "=", staffScheduleId)
            .andWhere("StaffId", "=", staffId);
        let emptyCheckData = emptyCheck[0];
        if (
            !emptyCheckData.MondayStartDate &&
            !emptyCheckData.TuesdayStartDate &&
            !emptyCheckData.WednesdayStartDate &&
            !emptyCheckData.ThursdayStartDate &&
            !emptyCheckData.FridayStartDate &&
            !emptyCheckData.SaturdayStartDate &&
            !emptyCheckData.SundayStartDate
        ) {
            let emptyDeleted = await knex(STAFF_SCHEDULE)
                .where("StaffScheduleId", "=", staffScheduleId)
                .andWhere("StaffId", "=", staffId)
                .del();
        }
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        }
    }
}

const deleteEmptyWeekRecordsBulk = async (knex, staffId, staffScheduleIds) => {
    try {
        let emptyCheck = await knex(STAFF_SCHEDULE).select("*")
            .whereIn("StaffScheduleId", staffScheduleIds)
            .andWhere("StaffId", "=", staffId);
            if(emptyCheck.length>0){
                let delSchId=[]
                for (let schInc = 0; schInc < emptyCheck.length; schInc++) {
                    const sch = emptyCheck[schInc];
                    if (
                        !sch.MondayStartDate &&
                        !sch.TuesdayStartDate &&
                        !sch.WednesdayStartDate &&
                        !sch.ThursdayStartDate &&
                        !sch.FridayStartDate &&
                        !sch.SaturdayStartDate &&
                        !sch.SundayStartDate
                    ) {
                        delSchId.push(staffScheduleId)
                    }
                }
                let emptyDeleted = await knex(STAFF_SCHEDULE)
                            .whereIn("StaffScheduleId", "=", staffScheduleId)
                            .andWhere("StaffId", "=", staffId)
                            .del();
            }
            
        // let emptyCheckData = emptyCheck[0];
        // if (
        //     !emptyCheckData.MondayStartDate &&
        //     !emptyCheckData.TuesdayStartDate &&
        //     !emptyCheckData.WednesdayStartDate &&
        //     !emptyCheckData.ThursdayStartDate &&
        //     !emptyCheckData.FridayStartDate &&
        //     !emptyCheckData.SaturdayStartDate &&
        //     !emptyCheckData.SundayStartDate
        // ) {
        //     let emptyDeleted = await knex(STAFF_SCHEDULE)
        //         .where("StaffScheduleId", "=", staffScheduleId)
        //         .andWhere("StaffId", "=", staffId)
        //         .del();
        // }
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        }
    }
}
const deleteBlockTimes = async (knex, staffId, blockTimeId) => {
    try {
        if (blockTimeId) {
            let existBlocksDeleted = await knex(STAFF_BLOCK_TIME)
                .where("StaffId", "=", staffId)
                .andWhere("BlockTimeId", "=", blockTimeId)
                .del();
        }
    } catch (error) {
        console.log(error);
    }
}
const deleteBlockTimesBulk = async (knex, staffId, blockTimeIds) => {
    try {
        if (blockTimeId) {
            let existBlocksDeleted = await knex(STAFF_BLOCK_TIME)
                .andWhere("StaffId", "=", staffId)
                .whereIn("BlockTimeId", blockTimeIds)
                .del();
        }
    } catch (error) {
        console.log(error);
    }
}
module.exports.getStaffSchedule = async event => {
    let knex, connected = false, response;
    try {
        const json = event.body ? getPayloadData(event) : null;
        console.log(json)
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StartDate || typeof json.StartDate !== "string" ||
            !json.EndDate || typeof json.EndDate !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        // validate date format
        let startValid = moment(json.StartDate, DATE_TIME_FORMAT.DDLMMLYYYY, true);
        let endValid = moment(json.EndDate, DATE_TIME_FORMAT.DDLMMLYYYY, true);
        if (!startValid.isValid() || !endValid.isValid()) {
            throw new Error(MESSAGE.INVALID_DATE);
        }
        knex = require("knex")(con);
        connected = true;
        response = await staffSchedule(knex, json.StartDate, json.EndDate, json.StaffId, json.Pagination,json.LastUpdated,json.CurrentIds);
        await knex.destroy();
        finalResponse = {
            Data: response.staffList,
            TotalItems: !json.Search ? response.count : 0,
            Pagination: {
                ...json.Pagination
            },
            AllStaffIds:response.allStaffId,
            LastUpdated: moment().utc().format(),
        }
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_SCH_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            ...finalResponse
        })
    }
}

const staffSchedule = async (knex, startDate, endDate, staffId, pagination,lastUpdated,currentIds) => {
    try {
        console.log(pagination)
        const selectedDay = moment(startDate, DATE_TIME_FORMAT.DDLMMLYYYY);
        const currentWeek = getCurrentWeek(selectedDay);
        const curWeekDates = [
            {
                DayCode: "Monday",
                Date: currentWeek.Monday
            },
            {
                DayCode: "Tuesday",
                Date: currentWeek.Tuesday
            },
            {
                DayCode: "Wednesday",
                Date: currentWeek.Wednesday
            },
            {
                DayCode: "Thursday",
                Date: currentWeek.Thursday
            },
            {
                DayCode: "Friday",
                Date: currentWeek.Friday
            },
            {
                DayCode: "Saturday",
                Date: currentWeek.Saturday
            },
            {
                DayCode: "Sunday",
                Date: currentWeek.Sunday
            },
        ];
        const staffListCount = await knex(STAFF)
            .select(
                "StaffId",
                "Name",
                "GoogleEmail"
            )
            .modify(qb => {
                if (staffId) {
                    qb.where("StaffId", "=", staffId)
                        .andWhere("Deleted", "=", DELETE_FLAG)
                } else {
                    qb.where("Deleted", "=", DELETE_FLAG)

                }
            })
            let staffList=[]
        if(!lastUpdated){
            // fetch staff list
         staffList = await knex(STAFF)
        .select(
            "StaffId",
            "Name",
            "GoogleEmail"
        )
        .modify(qb => {
            if (staffId) {
                qb.where("StaffId", "=", staffId)
                    .andWhere("Deleted", "=", DELETE_FLAG)
            } else {
                qb.where("Deleted", "=", DELETE_FLAG)
                qb.limit(pagination.Size);
                if (pagination.Number > 1) {
                    let offset = pagination.Size * (pagination.Number - 1);
                    qb.offset(offset)
                }
                
            }
            console.log(console.log(qb.toSQL().toNative()));
        })

        }
        
        if (lastUpdated) {
            // fetch staff list
             staffList = await knex(STAFF)
                .select(
                    STAFF+".StaffId",
                    "Name",
                    "GoogleEmail"
                )
                .leftJoin(STAFF_SCHEDULE, STAFF_SCHEDULE + '.StaffId', STAFF + '.StaffId')
                .modify(qb => {
                    
                        qb.where("Deleted", "=", DELETE_FLAG)
                        qb.andWhere(function(){
                            this.where(STAFF + ".LastUpdated", ">", lastUpdated)
                            this.orWhere(STAFF_SCHEDULE + ".LastUpdated", ">", lastUpdated)
                        })
                        

                    
                    console.log(console.log(qb.toSQL().toNative()));
                })
            // staffListUpdated.forEach((sch, index) => {
            //     const index = staffList.findIndex(staff => staff.StaffId === sch.StaffId);
            //     if (index !== -1) {
            //         // Object found in array2, update with data from array1
            //         staffList[index] = { ...staffList[index], ...sch };
            //     } else {
            //         // Object not found in array2, add a new one
            //         staffList.push({ ...sch });
            //     }
            // })
        }
            
        const promises = [];
        console.log(staffList)
        for (let staffInc = 0; staffInc < staffList.length; staffInc++) {
            const staff = staffList[staffInc];
            staff.Schedule = {};
            for (let curDayInc = 0; curDayInc < curWeekDates.length; curDayInc++) {
                const day = curWeekDates[curDayInc];
                promises.push(this.staffDaySchedule(knex, staff.StaffId, day.Date).then(data => {
                    staff.Schedule[day.DayCode] = data
                }));
            }
        }
        await Promise.all(promises);
        let allStaffId=[]
        for (let staffInc = 0; staffInc < staffListCount.length; staffInc++) {
            allStaffId.push(staffListCount[staffInc].StaffId)
        }
        return { 'staffList': staffList, 'count': staffListCount.length,'allStaffId': allStaffId};
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }
}

// module.exports.staffDaySchedule = async (knex, staffId, date) => {
//     /**
//      * Function Objective: Fetch working of given staff on given date.
//      * Working:
//      */

//     /**
//      * parameters:
//      * 1. knex - connection object.
//      * 2. staffId - staff whose schedule to fetch.
//      * 3. date - to find schedule on this date (must be moment object)
//      */

//     try {
//         var generalOffers, instantConfirmation, blockTimes;
//         const promises = [];
//         promises.push(this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.GENERAL_OFFER).then(data => {
//             generalOffers = data;
//         }));
//         promises.push(this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION).then(data => {
//             instantConfirmation = data;
//         }));
//         promises.push(this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.BLOCK_TIME).then(data => {
//             blockTimes = data;
//         }));
//         await Promise.all(promises);

//         let working = {
//             Date: generalOffers.Date,
//             DayCode: generalOffers.DayCode,
//             IsWorking: generalOffers.IsWorking || instantConfirmation.IsWorking ? true : false,
//             GeneralOffer: {
//                 // IsWorking: generalOffers.IsWorking,
//                 DayStart: generalOffers.DayStart,
//                 DayEnd: generalOffers.DayEnd,
//                 CurrentSchedular: generalOffers.CurrentSchedular,
//                 CurrentScheduleEnd: generalOffers.CurrentScheduleEnd
//             },
//             InstantConfirmation: {
//                 // IsWorking: instantConfirmation.IsWorking,
//                 DayStart: instantConfirmation.DayStart,
//                 DayEnd: instantConfirmation.DayEnd,
//                 CurrentSchedular: instantConfirmation.CurrentSchedular,
//                 CurrentScheduleEnd: instantConfirmation.CurrentScheduleEnd
//             },
//             BlockTime: {
//                 Blocks: blockTimes.Block,
//                 CurrentSchedular: blockTimes.CurrentSchedular,
//                 CurrentScheduleEnd: blockTimes.CurrentScheduleEnd
//             }
//         }
//         return working;
//     } catch (error) {
//         return {
//             Error: error.message
//         }
//     }
// }

module.exports.staffDaySchedule = async (knex, staffId, date, includeIC=true) => {
    /**
     * Function Objective: Fetch working of given staff on given date.
     * Working:
     */

    /**
     * parameters:
     * 1. knex - connection object.
     * 2. staffId - staff whose schedule to fetch.
     * 3. date - to find schedule on this date (must be moment object)
     * 4. includeIC - bool to indicate whether IC data needed in response or not
     */

    try {
        const generalOffers = await this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.GENERAL_OFFER);
        const blockTimes = await this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.BLOCK_TIME);
        let working = {
            Date: generalOffers.Date,
            DayCode: generalOffers.DayCode,
            IsWorking: generalOffers.IsWorking ? true : false,
            GeneralOffer: {
                // IsWorking: generalOffers.IsWorking,
                DayStart: generalOffers.DayStart,
                DayEnd: generalOffers.DayEnd,
                CurrentSchedular: generalOffers.CurrentSchedular,
                CurrentScheduleEnd: generalOffers.CurrentScheduleEnd
            },
            BlockTime: {
                Blocks: blockTimes.Block,
                CurrentSchedular: blockTimes.CurrentSchedular,
                CurrentScheduleEnd: blockTimes.CurrentScheduleEnd
            }
        }

        if (includeIC) {
            const instantConfirmation = await this.getStaffDayScheduleByType(knex, staffId, date, STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION);
            working.IsWorking = working.IsWorking || instantConfirmation.IsWorking ? true : false;
            working.InstantConfirmation = {
                // IsWorking: instantConfirmation.IsWorking,
                DayStart: instantConfirmation.DayStart,
                DayEnd: instantConfirmation.DayEnd,
                CurrentSchedular: instantConfirmation.CurrentSchedular,
                CurrentScheduleEnd: instantConfirmation.CurrentScheduleEnd
            };
        }

        return working;
    } catch (error) {
        return {
            Error: error.message
        }
    }
}
module.exports.getStaffDaySchedule = async (knex, date,includeIC=false) => {
    try {
        let selectedDate = moment(date).startOf("day");
        console.log(selectedDate);
        const weekDayNum = moment(selectedDate).day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);
        let dayObject = {
            Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
            DayCode: weekDay.Day,
            IsWorking: false
        }
        let scheduleType=[0,2]
        if(includeIC){
            scheduleType.push(1);
        }
        // find day direct entry.
        // let whereClause = {
        //     // StaffId: staffId,
        //     ScheduleType: scheduleType
        // }
        let whereClause={};
        whereClause[weekDay.DateStart] = selectedDate.toDate();

        // whereClause1[weekDay.DateStart+'<'] = selectedDate.toDate();
        // whereClause1[weekDay.DateEnd+'>='] = selectedDate.toDate();
        
        let entryExist = await knex(STAFF_SCHEDULE)
            .select(
                "StaffScheduleId",
                STAFF_SCHEDULE+".StaffId",
                "ScheduleType",
                `${weekDay.DateStart}`,
                `${weekDay.DateEnd}`,
                `${weekDay.DayStart}`,
                `${weekDay.DayEnd}`,
                `${weekDay.Block}`,
                STAFF_BLOCK_TIME+".StaffBlocKTimeId",
                STAFF_BLOCK_TIME+".BlocKTimeId",
                STAFF_BLOCK_TIME+".Name",
                STAFF_BLOCK_TIME+".StartTime",
                STAFF_BLOCK_TIME+".EndTime"
            )
            .leftJoin(STAFF_BLOCK_TIME, STAFF_BLOCK_TIME + ".BlockTimeId", STAFF_SCHEDULE + "."+weekDay.Block)
            .where(function(){
                this.where(whereClause)
            // .andWhere(weekDay.DayStart, '!=', null)
            // .andWhere(weekDay.DayEnd, '!=', null)
            .orWhere(function () {

                this.where(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                    .andWhere(`${weekDay.DateEnd}`, ">=", selectedDate.toDate())
            })
            .orWhere(function () {

                this.where(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                    .whereNull(`${weekDay.DateEnd}`)
            })
            })
            
            .whereIn('ScheduleType',scheduleType)
            .modify(queryBuilder => {
                
                console.log(queryBuilder.toSQL().toNative())
            })
            // console.log(entryExist.length);
            return entryExist;
        if (entryExist.length > 0) {
            let existDetail = entryExist[0];
            dayObject.IsWorking = true;
            dayObject.DayStart = existDetail[weekDay.DayStart];
            dayObject.DayEnd = existDetail[weekDay.DayEnd];
            dayObject.CurrentSchedular = moment(existDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
            dayObject.CurrentScheduleEnd = existDetail[weekDay.DateEnd]
                ? moment(existDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                : null;
            dayObject.Block = [];
            if (existDetail[weekDay.Block]) {
                const whereBlocks = {
                    BlockTimeId: existDetail[weekDay.Block],
                    StaffId: staffId
                }
                const blocks = await knex(STAFF_BLOCK_TIME)
                    .select(
                        "StaffBlocKTimeId",
                        "BlocKTimeId",
                        "Name",
                        "StartTime",
                        "EndTime"
                    )
                    .where(whereBlocks)
                // .where("BlockTimeId", "=", existDetail[weekDay.Block])
                // .andWhere("StaffId", "=", staffId)
                dayObject.Block = blocks;
            }
        } else {
            // direct entry not found, find schedule exist in specific dates schedule 
            let ongoingSpecDScheduleExist = await knex(STAFF_SCHEDULE)
                .select(
                    "StaffScheduleId",
                    `${weekDay.DateStart}`,
                    `${weekDay.DateEnd}`,
                    `${weekDay.DayStart}`,
                    `${weekDay.DayEnd}`,
                    `${weekDay.Block}`
                )
                .where("StaffId", "=", staffId)
                .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                .andWhere(`${weekDay.DateEnd}`, ">=", selectedDate.toDate())
                .andWhere("ScheduleType", "=", scheduleType);
            if (ongoingSpecDScheduleExist.length > 0) {
                let ongoingSchDetail = ongoingSpecDScheduleExist[0];
                dayObject.IsWorking = true;
                dayObject.DayStart = ongoingSchDetail[weekDay.DayStart];
                dayObject.DayEnd = ongoingSchDetail[weekDay.DayEnd];
                dayObject.CurrentSchedular = moment(ongoingSchDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                dayObject.CurrentScheduleEnd = ongoingSchDetail[weekDay.DateEnd]
                    ? moment(ongoingSchDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                    : null;
                dayObject.Block = [];
                if (ongoingSchDetail[weekDay.Block]) {
                    const whereBlocks = {
                        BlockTimeId: ongoingSchDetail[weekDay.Block],
                        StaffId: staffId
                    }
                    const blocks = await knex(STAFF_BLOCK_TIME)
                        .select(
                            "StaffBlocKTimeId",
                            "BlocKTimeId",
                            "Name",
                            "StartTime",
                            "EndTime"
                        )
                        .where(whereBlocks);
                    // .where("BlockTimeId", "=", ongoingSail[weekDay.Block])
                    // .andWhere("StaffId", "=", staffId)chDet
                    dayObject.Block = blocks;
                }
            } else {
                // specific weeks entry not found, find any ongoing schedule
                let ongoingScheduleExist = await knex(STAFF_SCHEDULE)
                    .select(
                        "StaffScheduleId",
                        `${weekDay.DateStart}`,
                        `${weekDay.DateEnd}`,
                        `${weekDay.DayStart}`,
                        `${weekDay.DayEnd}`,
                        `${weekDay.Block}`
                    )
                    .where("StaffId", "=", staffId)
                    .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                    .andWhere("ScheduleType", "=", scheduleType)
                    .havingNull(`${weekDay.DateEnd}`)
                if (ongoingScheduleExist.length > 0) {
                    let ongoingSchDetail = ongoingScheduleExist[0];
                    dayObject.IsWorking = true;
                    dayObject.DayStart = ongoingSchDetail[weekDay.DayStart];
                    dayObject.DayEnd = ongoingSchDetail[weekDay.DayEnd];
                    dayObject.CurrentSchedular = moment(ongoingSchDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                    dayObject.CurrentScheduleEnd = ongoingSchDetail[weekDay.DateEnd]
                        ? moment(ongoingSchDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                        : null;
                    dayObject.Block = [];
                    if (ongoingSchDetail[weekDay.Block]) {
                        const whereBlocks = {
                            BlockTimeId: ongoingSchDetail[weekDay.Block],
                            StaffId: staffId
                        }
                        const blocks = await knex(STAFF_BLOCK_TIME)
                            .select(
                                "StaffBlocKTimeId",
                                "BlocKTimeId",
                                "Name",
                                "StartTime",
                                "EndTime"
                            )
                            .where(whereBlocks);
                        // .where("BlockTimeId", "=", ongoingSchDetail[weekDay.Block])
                        // .andWhere("StaffId", "=", staffId)
                        dayObject.Block = blocks;
                    }
                }
            }
        }
        return dayObject;
    } catch (error) {
        console.log(error);
    }
}

module.exports.getStaffDayScheduleByType = async (knex, staffId, date, scheduleType) => {
    try {
        let selectedDate = moment(date).startOf("day");
        const weekDayNum = moment(selectedDate).day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);
        let dayObject = {
            Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
            DayCode: weekDay.Day,
            IsWorking: false
        }
        // find day direct entry.
        let whereClause = {
            StaffId: staffId,
            ScheduleType: scheduleType
        }
        whereClause[weekDay.DateStart] = selectedDate.toDate();
        let entryExist = await knex(STAFF_SCHEDULE)
            .select(
                "StaffScheduleId",
                `${weekDay.DateStart}`,
                `${weekDay.DateEnd}`,
                `${weekDay.DayStart}`,
                `${weekDay.DayEnd}`,
                `${weekDay.Block}`
            )
            // .where(`${weekDay.DateStart}`, "=", selectedDate.toDate())
            // .andWhere("StaffId", "=", staffId)
            // .andWhere("ScheduleType", "=", scheduleType);
            .where(whereClause);
        if (entryExist.length > 0) {
            let existDetail = entryExist[0];
            dayObject.IsWorking = true;
            dayObject.DayStart = existDetail[weekDay.DayStart];
            dayObject.DayEnd = existDetail[weekDay.DayEnd];
            dayObject.CurrentSchedular = moment(existDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
            dayObject.CurrentScheduleEnd = existDetail[weekDay.DateEnd]
                ? moment(existDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                : null;
            dayObject.Block = [];
            if (existDetail[weekDay.Block]) {
                const whereBlocks = {
                    BlockTimeId: existDetail[weekDay.Block],
                    StaffId: staffId
                }
                const blocks = await knex(STAFF_BLOCK_TIME)
                    .select(
                        "StaffBlocKTimeId",
                        "BlocKTimeId",
                        "Name",
                        "StartTime",
                        "EndTime"
                    )
                    .where(whereBlocks)
                // .where("BlockTimeId", "=", existDetail[weekDay.Block])
                // .andWhere("StaffId", "=", staffId)
                dayObject.Block = blocks;
            }
        } else {
            // direct entry not found, find schedule exist in specific dates schedule 
            let ongoingSpecDScheduleExist = await knex(STAFF_SCHEDULE)
                .select(
                    "StaffScheduleId",
                    `${weekDay.DateStart}`,
                    `${weekDay.DateEnd}`,
                    `${weekDay.DayStart}`,
                    `${weekDay.DayEnd}`,
                    `${weekDay.Block}`
                )
                .where("StaffId", "=", staffId)
                .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                .andWhere(`${weekDay.DateEnd}`, ">=", selectedDate.toDate())
                .andWhere("ScheduleType", "=", scheduleType);
            if (ongoingSpecDScheduleExist.length > 0) {
                let ongoingSchDetail = ongoingSpecDScheduleExist[0];
                dayObject.IsWorking = true;
                dayObject.DayStart = ongoingSchDetail[weekDay.DayStart];
                dayObject.DayEnd = ongoingSchDetail[weekDay.DayEnd];
                dayObject.CurrentSchedular = moment(ongoingSchDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                dayObject.CurrentScheduleEnd = ongoingSchDetail[weekDay.DateEnd]
                    ? moment(ongoingSchDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                    : null;
                dayObject.Block = [];
                if (ongoingSchDetail[weekDay.Block]) {
                    const whereBlocks = {
                        BlockTimeId: ongoingSchDetail[weekDay.Block],
                        StaffId: staffId
                    }
                    const blocks = await knex(STAFF_BLOCK_TIME)
                        .select(
                            "StaffBlocKTimeId",
                            "BlocKTimeId",
                            "Name",
                            "StartTime",
                            "EndTime"
                        )
                        .where(whereBlocks);
                    // .where("BlockTimeId", "=", ongoingSail[weekDay.Block])
                    // .andWhere("StaffId", "=", staffId)chDet
                    dayObject.Block = blocks;
                }
            } else {
                // specific weeks entry not found, find any ongoing schedule
                let ongoingScheduleExist = await knex(STAFF_SCHEDULE)
                    .select(
                        "StaffScheduleId",
                        `${weekDay.DateStart}`,
                        `${weekDay.DateEnd}`,
                        `${weekDay.DayStart}`,
                        `${weekDay.DayEnd}`,
                        `${weekDay.Block}`
                    )
                    .where("StaffId", "=", staffId)
                    .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
                    .andWhere("ScheduleType", "=", scheduleType)
                    .havingNull(`${weekDay.DateEnd}`)
                if (ongoingScheduleExist.length > 0) {
                    let ongoingSchDetail = ongoingScheduleExist[0];
                    dayObject.IsWorking = true;
                    dayObject.DayStart = ongoingSchDetail[weekDay.DayStart];
                    dayObject.DayEnd = ongoingSchDetail[weekDay.DayEnd];
                    dayObject.CurrentSchedular = moment(ongoingSchDetail[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                    dayObject.CurrentScheduleEnd = ongoingSchDetail[weekDay.DateEnd]
                        ? moment(ongoingSchDetail[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                        : null;
                    dayObject.Block = [];
                    if (ongoingSchDetail[weekDay.Block]) {
                        const whereBlocks = {
                            BlockTimeId: ongoingSchDetail[weekDay.Block],
                            StaffId: staffId
                        }
                        const blocks = await knex(STAFF_BLOCK_TIME)
                            .select(
                                "StaffBlocKTimeId",
                                "BlocKTimeId",
                                "Name",
                                "StartTime",
                                "EndTime"
                            )
                            .where(whereBlocks);
                        // .where("BlockTimeId", "=", ongoingSchDetail[weekDay.Block])
                        // .andWhere("StaffId", "=", staffId)
                        dayObject.Block = blocks;
                    }
                }
            }
        }
        return dayObject;
    } catch (error) {
        console.log(error);
    }
}

module.exports.staffLogout = async event => {
    let knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let staffId = json.StaffId;
        knex = require("knex")(con);
        connected = true;
        let staffExist = await knex(STAFF).select("FcmToken").where("StaffId", "=", staffId);
        if (staffExist.length <= 0) {
            throw new Error(MESSAGE.STAFF_NOT_FOUND);
        }
        let staffData = staffExist[0];
        if (staffData.FcmToken) {
            let updateObj = {
                FcmToken: null,
            }
            let staffUpdated = await knex(STAFF)
                .where("StaffId", "=", staffId)
                .update(updateObj);
            try {
                // Unsubscribe from topics - Staff, all.
                const admin = InitializeFirebaseTherapist();
                let unsubTherapist = await admin.messaging().unsubscribeFromTopic(staffData.FcmToken, process.env.BROADCAST_TOPIC_THERAPIST);
                let unsubscribeAll = await admin.messaging().unsubscribeFromTopic(staffData.FcmToken, process.env.BROADCAST_TOPIC_ALL);
            } catch (error) {
                console.log(error)
            }
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
            message: MESSAGE.LOGGED_OUT_SUCCESS
        }
    }
}

module.exports.getTodayVacation = async ({
    knex,
    date,
    staffId
}) => {
    /**
     * Function objective: For given staffs check if they are on vacation on given date.
     * Parameters:
     * knex - connection object.
     * date - date to check vacation for.
     * staffId - array of staffIds to check vacations for.
     */
    STAFF_ZONE = zone.getStaffZone(date);
    let startDate = moment(date).utcOffset(STAFF_ZONE).startOf("day").toDate();
    let endDate = moment(date).utcOffset(STAFF_ZONE).endOf("day").toDate();
    // let knex = require("knex")(con);
    let vacationsExist = await knex
        .select(
            STAFF_VACATIONS + ".StaffId",
            STAFF_VACATIONS + ".RequestId",
            STAFF_VACATIONS + ".Template",
            STAFF_VACATIONS + ".StartTime",
            STAFF_VACATIONS + ".EndTime",
            STAFF_VACATIONS + ".EventId",
            STAFF + ".GoogleEmail as StaffMail"
        )
        .from(STAFF_VACATIONS)
        .leftJoin(STAFF, STAFF + ".StaffId", STAFF_VACATIONS + ".StaffId")
        .where(STAFF_VACATIONS + ".Status", "=", VACATION_STATUS.ACCEPTED)
        .where(STAFF_VACATIONS + ".StartTime", ">=", startDate)
        .andWhere(STAFF_VACATIONS + ".EndTime", "<=", endDate)
        .whereIn(STAFF_VACATIONS + ".StaffId", staffId)
    return vacationsExist;
}

module.exports.getTodayBookingEvents = async ({
    knex,
    date
}) => {
    /**
     * Parameters: 
     * knex - connection object.
     * date - MM/DD/YYYY
     */

    let BOOKINGS_TO_CONSIDER = [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.ON_GOING,
        BOOKING_STATUS.LAPSED,
        BOOKING_STATUS.INCONCLUSIVE
    ]
    let todayBookings = await knex
        .select(
            BOOKING_PRODUCTS + ".BookingProductId",
            BOOKING_PRODUCTS + ".StaffId",
            BOOKING_PRODUCTS + ".StartTime",
            BOOKING_PRODUCTS + ".Duration as productDuration",
            BOOKING_PRODUCTS + ".PreparationTime",
            BOOKING_PRODUCTS + ".EventId",
            BOOKING_PRODUCT_ADDONS + ".Duration as addOnDuration",
            BOOKINGS + ".BookingId",
            BOOKINGS + ".ReachOutTime",
            BOOKINGS + ".OrganisationLocationId",
            STAFF + ".GoogleEmail as StaffMail"
        )
        .from(BOOKING_PRODUCTS)
        .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
        .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
        .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
        .where(BOOKINGS + ".DateTime", ">=", moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day').toDate())
        .andWhere(BOOKINGS + ".DateTime", "<=", moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).endOf('day').toDate())
        .whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER);
    let events = [];
    // todayBookings.forEach(booking => {
    //     let evFound = events.find(e => e.id === booking.EventId);
    //     if (!evFound) {
    //         let eventObj = {
    //             id: booking.EventId,
    //             attendees: [
    //                 {
    //                     email: process.env.EMAIL
    //                 },
    //                 {
    //                     email: booking.StaffMail
    //                 }
    //             ],
    //             start: {
    //                 dateTime: moment(booking.StartTime).utc().format()
    //             },
    //             end: {
    //                 dateTime: moment(booking.StartTime)
    //                     .add(booking.productDuration, "minute")
    //                     .add(booking.addOnDuration ? booking.addOnDuration : 0, "minute")
    //                     .utc()
    //                     .format()
    //             },
    //             extendedProperties: {
    //                 shared: {
    //                     BookingId: booking.BookingId + "",
    //                     ReturnTime: booking.ReachOutTime + "",
    //                     ReachOutTime: booking.ReachOutTime + booking.PreparationTime + ""
    //                 }
    //             },
    //             bookingProductIds: [booking.BookingProductId]
    //         }
    //         events.push(eventObj);
    //     } else {
    //         let prodFound = evFound.bookingProductIds.find(f => f === booking.BookingProductId);
    //         if (!prodFound) {
    //             evFound.end.dateTime = moment(evFound.end.dateTime)
    //                 .add(booking.PreparationTime, "minute")
    //                 .add(booking.productDuration, "minute")
    //                 .add(booking.addOnDuration ? booking.addOnDuration : 0, "minute")
    //                 .utc()
    //                 .format();
    //             evFound.bookingProductIds.push(booking.BookingProductId);
    //         } else {
    //             evFound.end.dateTime = moment(evFound.end.dateTime)
    //                 .add(booking.addOnDuration ? booking.addOnDuration : 0, "minute")
    //                 .utc()
    //                 .format()
    //         }
    //     }
    // });

    todayBookings.forEach(booking => {
        let evFound = events.find(f => f.productId === booking.BookingProductId);
       if(!evFound){
        let eventObj = {
            id: booking.EventId,
            productId: booking.BookingProductId,
            attendees: [
                {
                    email: process.env.EMAIL
                },
                {
                    email: booking.StaffMail
                }
            ],
            start: {
                dateTime: moment(booking.StartTime).utc().format()
            },
            end: {
                dateTime: moment(booking.StartTime)
                    .add(booking.productDuration, "minute")
                    .add(booking.addOnDuration ? booking.addOnDuration : 0, "minute")
                    .utc()
                    .format()
            },
            extendedProperties: {
                shared: {
                    BookingId: booking.BookingId + "",
                    ReturnTime: booking.ReachOutTime + "",
                    ReachOutTime: booking.ReachOutTime + booking.PreparationTime + ""
                }
            },
            bookingProductIds: [booking.BookingProductId],
            organisationLocationId:booking.OrganisationLocationId,
            ReachOutTime:booking.ReachOutTime,
            PreparationTime:booking.PreparationTime,
            type:1
        }
        events.push(eventObj);
       }else{
        evFound.end.dateTime = moment(evFound.end.dateTime)
                    .add(booking.addOnDuration ? booking.addOnDuration : 0, "minute")
                    .utc()
                    .format()
       }
       
        
    });
    return events;
}

module.exports.getBookingOffers = async (event) => {
    let knex, connected = false, response, staffId;
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId ||
            typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        staffId = json.StaffId;
        knex = require("knex")(con);
        connected = true;

        let categoryColors = await knex(CATEGORIES).select("CategoryId", "ColorCode");

        let staffBookingOffers = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId as BookingUser",
                USERS + ".Name as UserName",
                USERS + ".Gender",
                USERS + ".ImagePath",
                // BOOKINGS + ".Street",
                // BOOKINGS + ".Floor",
                // BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".ReachOutTime",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".CategoryId",
                BOOKING_PRODUCTS + ".ProductId",
                BOOKING_PRODUCTS + ".Product",
                BOOKING_PRODUCTS + ".Duration as ProductDuration",
                BOOKING_PRODUCTS + ".Amount as ProductAmount",
                BOOKING_PRODUCTS + ".PreparationTime",
                BOOKING_PRODUCTS + ".StartTime as ProductStartTime",
                BOOKING_PRODUCTS + ".DispatchId",
                BOOKING_PRODUCTS + ".UserId as ProductUserId",
                BOOKING_PRODUCTS + ".GuestId",
                BOOKING_PRODUCTS + ".SameTime",
                BOOKING_PRODUCTS + ".StaffEarning",
                BOOKING_PRODUCT_EXTRA + ".ExtraValue",
                BOOKING_PRODUCT_DISPATCH + ".StaffId",
                BOOKING_PRODUCT_DISPATCH + ".Status",
                BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                BOOKING_PRODUCT_ADDONS + ".AddOnId",
                BOOKING_PRODUCT_ADDONS + ".AddOn",
                BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                BOOKING_PRODUCT_ADDONS + ".Amount as AddOnAmount",
                BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                SPECIAL_REQUEST + ".SpecialRequestName",
                ORGANISATION_LOCATION + ".Name as OrganisationName",
                ORGANISATION_LOCATION + ".OrganisationLocationId as OrganisationLocationId",
                
            
            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .leftJoin(BOOKING_PRODUCT_EXTRA, BOOKING_PRODUCT_EXTRA + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .leftJoin(BOOKING_SPECIAL_REQUEST, BOOKINGS + ".BookingId", BOOKING_SPECIAL_REQUEST + ".BookingId")
            .leftJoin(SPECIAL_REQUEST, SPECIAL_REQUEST + ".SpecialRequestId", BOOKING_SPECIAL_REQUEST + ".SpecialRequestId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .whereIn(BOOKINGS + ".Status", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING])
            .whereIn(BOOKING_PRODUCTS + ".DispatchType", [PRODUCT_DISPATCH_TYPE.AUTOMATIC_DISPATCH, PRODUCT_DISPATCH_TYPE.MANUAL_DISPATCH])
            .whereNull(BOOKING_PRODUCTS + ".StaffId")
            .where(BOOKING_PRODUCT_DISPATCH + ".StaffId", "=", staffId)
            .where(BOOKING_PRODUCT_DISPATCH + ".Status", "=", DISPATCH_STATUS.DISPATCHED)
            .where(BOOKINGS + ".DateTime", ">", moment().toDate())
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
        let bookingOffers = [];
        let staffCategoryData = [], staffProductData = [];
        staffCategoryData = await knex.select().table(STAFF_CATEGORY).where('StaffId', staffId);
        staffProductData = await knex(STAFF_PRODUCT).select("ProductId", "Rate").where("StaffId", "=", staffId);

        let offerDates = [];
        // Staff category data for therapist payable amount calculation
        for (let bookingInc = 0; bookingInc < staffBookingOffers.length; bookingInc++) {
            const booking = staffBookingOffers[bookingInc];
            const found = bookingOffers.find(book => book.BookingProductId === booking.BookingProductId);
            // const scData = staffCategoryData.find(category => category.CategoryId === booking.CategoryId);
            // const scProdData = staffProductData.find(pro => pro.ProductId === booking.ProductId);
            // if (!scData || !scData.Rate || !scProdData || !scProdData.Rate) {
            //     continue;
            // }
            if (!found) {
                let objToPush = {
                    BookingId: booking.BookingId,
                    BookingProductId: booking.BookingProductId,
                    UserId: booking.BookingUser?booking.BookingUser:(booking.OrganisationLocationId)?-1:null,
                    UserName: booking.UserName?booking.UserName:'Guest',
                    Gender: booking.Gender?booking.Gender:0,
                    // Street: booking.Street,
                    ImagePath: booking.ImagePath ? booking.ImagePath : "",
                    ImageURL: booking.ImagePath ? process.env.BUCKET_URL + booking.ImagePath : "",
                    // Floor: booking.Floor ? booking.Floor : null,
                    // City: booking.City ? booking.City : null,
                    Zip: booking.Zip ? booking.Zip : null,
                    Elevator: booking.Elevator,
                    ReturnTime: booking.ReachOutTime,
                    ReachOutTime: booking.ReachOutTime,
                    Products: [],
                    SpecialRequest:[],
                    OrganisationName:booking.OrganisationName?booking.OrganisationName:null
                }
                let product = {
                    BookingProductId: booking.BookingProductId,
                    Product: booking.Product,
                    Duration: booking.ProductDuration,
                    // TotalDuration: booking.ProductDuration,
                    PreparationTime: booking.PreparationTime,
                    // Amount: this.getAmountForTreatment(booking.ProductDuration, scProdData.Rate),
                    Amount: booking.StaffEarning,
                    DispatchId: booking.DispatchId,
                    StartTime: booking.ProductStartTime,
                    Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                    SameTime: booking.SameTime,
                    // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                    UserId:booking.ProductUserId?booking.ProductUserId:(booking.OrganisationLocationId)?-1:null,
                    Guest: null,
                    ColorCode: "",
                    AddOns: []
                }
                let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : ""

                let offerDate = moment(product.StartTime).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                if (!offerDates.includes(offerDate)) {
                    offerDates.push(offerDate)
                }
                if (booking.GuestId) {
                    const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                        .where("GuestId", "=", booking.GuestId);
                    product.Guest = guestResult[0];
                }
                if (booking.BookingProductAddOnId) {
                    // product.TotalDuration += booking.AddOnAmount;
                    product.AddOns.push({
                        BookingProductAddOnId: booking.BookingProductAddOnId,
                        AddOnId: booking.AddOnId,
                        AddOn: booking.AddOn,
                        Duration: booking.AddOnDuration,
                        // Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                        Amount: 0 //beacuse the total is now calculated for the booking with new method
                    })
                }
                if (booking.BookingSpecialRequestId) {
                    // product.TotalDuration += booking.AddOnAmount;
                    objToPush.SpecialRequest.push({
                        BookingSpecialRequestId: booking.BookingSpecialRequestId,
                        SpecialRequestId: booking.SpecialRequestId,
                        SpecialRequestName: booking.SpecialRequestName,
                        
                    })
                }
                objToPush.Products.push(product);
                bookingOffers.push(objToPush);
            } else {
                let prodExist = found.Products.find(f => f.BookingProductId === booking.BookingProductId);
                if (!prodExist) {
                    let product = {
                        BookingProductId: booking.BookingProductId,
                        Product: booking.Product,
                        Duration: booking.ProductDuration,
                        // TotalDuration: booking.ProductDuration,
                        PreparationTime: booking.PreparationTime,
                        // Amount: this.getAmountForTreatment(booking.ProductDuration, scProdData.Rate),
                        Amount: booking.StaffEarning,
                        DispatchId: booking.DispatchId,
                        StartTime: booking.ProductStartTime,
                        Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                        SameTime: booking.SameTime,
                        // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                        UserId: booking.ProductUserId?booking.ProductUserId:(booking.OrganisationLocationId)?-1:null,
                        Guest: null,
                        ColorCode: "",
                        AddOns: [],
                        OrganisationName:booking.OrganisationName?booking.OrganisationName:null
                    }
                    let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                    product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : ""
                    if (booking.GuestId) {
                        const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                            .where("GuestId", "=", booking.GuestId);
                        product.Guest = guestResult[0];
                    }
                    if (booking.BookingProductAddOnId) {
                        // product.TotalDuration += booking.AddOnAmount;
                        product.AddOns.push({
                            BookingProductAddOnId: booking.BookingProductAddOnId,
                            AddOnId: booking.AddOnId,
                            AddOn: booking.AddOn,
                            Duration: booking.AddOnDuration,
                            // Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                            Amount: 0
                        })
                    }
                    found.Products.push(product);
                } else {
                    if (booking.BookingProductAddOnId) {
                        let addOnFound = prodExist.AddOns.find(f => f.BookingProductAddOnId === booking.BookingProductAddOnId);
                        if (!addOnFound) {
                            // prodExist.TotalDuration += booking.AddOnAmount;
                            prodExist.AddOns.push({
                                BookingProductAddOnId: booking.BookingProductAddOnId,
                                AddOnId: booking.AddOnId,
                                AddOn: booking.AddOn,
                                Duration: booking.AddOnDuration,
                                // Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                                Amount: 0
                            })
                        }
                    }
                    if (booking.ExtraValue && !prodExist.Extras.find(ex => ex === booking.ExtraValue)) {
                        prodExist.Extras.push(booking.ExtraValue)
                    }
                }
                
                if (booking.BookingSpecialRequestId) {
                    let reqExist = found.SpecialRequest.find(f => f.BookingSpecialRequestId === booking.BookingSpecialRequestId);
                    if(!reqExist){
                        found.SpecialRequest.push({
                            BookingSpecialRequestId: booking.BookingSpecialRequestId,
                            SpecialRequestId: booking.SpecialRequestId,
                            SpecialRequestName: booking.SpecialRequestName,
                            
                        })

                    }
                    
                }
            }
        }

        for (let bookingInc = 0; bookingInc < bookingOffers.length; bookingInc++) {
            const booking = bookingOffers[bookingInc];
            if (booking.Products.length > 1 && (booking.Products[0].SameTime || booking.Products[1].SameTime)) {
                let newBooking = cloneDeep(booking);
                booking.Products.splice(1, 1);
                newBooking.Products.splice(0, 1);
                bookingOffers.splice(bookingInc + 1, 0, newBooking);
            }
        }

        for (let bookingInc = 0; bookingInc < bookingOffers.length; bookingInc++) {
            const booking = bookingOffers[bookingInc];
            booking.StartTime = moment(booking.Products[0].StartTime).utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
            let totalDuration = 0;
            booking.Products.forEach((product, index) => {
                if (index > 0) {
                    totalDuration += product.PreparationTime;
                }
                totalDuration += product.Duration;
                product.AddOns.forEach(addOn => {
                    totalDuration += addOn.Duration
                });
            });
            booking.Duration = totalDuration;
            booking.EndTime = moment(booking.StartTime).add(totalDuration, "minutes").utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
        }

        let finalBookingOffers = [];
        for (let bookInc = 0; bookInc < bookingOffers.length; bookInc++) {
            const booking = bookingOffers[bookInc];
            // let offerValid = true;
            let staffAvailability = await this.staffCheck(knex, {
                StaffId: staffId,
                StartTime: booking.StartTime,
                Duration: booking.Duration,
                ReachOut: booking.ReachOutTime,
                ReachOutTime: booking.ReachOutTime
            })
            if (staffAvailability.IsAvailable) {
                // offerValid = false;
                // bookingOffers.splice(bookInc, 1);
                booking.TimeZone = {
                    Zone: process.env.STAFF_ZONE
                }
                finalBookingOffers.push(booking);
            }
        }

        finalBookingOffers = finalBookingOffers.sort((a, b) => {
            let aStart = moment(a.StartTime);
            let bStart = moment(b.StartTime);
            if (aStart.isBefore(bStart)) {
                return -1;
            } else if (aStart.isSame(bStart)) {
                return 0;
            } else {
                return 1;
            }
        })

        let addOnRequests = [];
        let staffAddOnRequestsBookings = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                BOOKING_PRODUCT_ADDONS + ".RequestStatus",
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
            .where(BOOKING_PRODUCT_ADDONS + ".ExtraAddOn", "=", 1)
            .where(BOOKING_PRODUCT_ADDONS + ".RequestStatus", "=", ADDON_REQUEST_STATUS.PENDING)
            .whereIn(BOOKINGS + ".Status", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING])
            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc")

        if (staffAddOnRequestsBookings.length) {
            let pendingAddOnBookings = [];
            staffAddOnRequestsBookings.forEach(element => {
                pendingAddOnBookings.push(element.BookingId);
            });
            let staffAddOnRequests = await knex
                .select(
                    BOOKINGS + ".BookingId",
                    BOOKINGS + ".UserId as BookingUser",
                    USERS + ".Name as UserName",
                    USERS + ".Gender",
                    USERS + ".ImagePath",
                    BOOKINGS + ".Street",
                    BOOKINGS + ".HouseNumber",
                    BOOKINGS + ".Floor",
                    BOOKINGS + ".City",
                    BOOKINGS + ".Zip",
                    BOOKINGS + ".Elevator",
                    BOOKINGS + ".ReachOutTime",
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".CategoryId",
                    BOOKING_PRODUCTS + ".ProductId",
                    BOOKING_PRODUCTS + ".Product",
                    BOOKING_PRODUCTS + ".Duration as ProductDuration",
                    BOOKING_PRODUCTS + ".DispatchId",
                    BOOKING_PRODUCTS + ".UserId as ProductUserId",
                    BOOKING_PRODUCTS + ".GuestId",
                    BOOKING_PRODUCTS + ".Amount as ProductAmount",
                    BOOKING_PRODUCTS + ".StaffAmount as ProductStaffAmount",
                    BOOKING_PRODUCTS + ".PreparationTime",
                    BOOKING_PRODUCTS + ".StartTime as ProductStartTime",
                    BOOKING_PRODUCTS + ".StaffEarning",
                    BOOKING_PRODUCT_EXTRA + ".ExtraValue",
                    BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                    BOOKING_PRODUCT_ADDONS + ".AddOnId",
                    BOOKING_PRODUCT_ADDONS + ".AddOn",
                    BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                    BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                    BOOKING_PRODUCT_ADDONS + ".RequestStatus",
                    BOOKING_PRODUCT_ADDONS + ".Amount as AddOnAmount",
                    BOOKING_PRODUCT_ADDONS + ".StaffAmount as AddOnStaffAmount",
                    BOOKING_PRODUCT_ADDONS + ".StaffEarning as AddOnStaffEarning",
                    ORGANISATION_LOCATION+".Name as OrganisationName"
                )
                .from(BOOKINGS)
                .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                .leftJoin(BOOKING_PRODUCT_EXTRA, BOOKING_PRODUCT_EXTRA + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
                .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                // .where(BOOKING_PRODUCT_ADDONS + ".ExtraAddOn", "=", 1)
                // .where(BOOKING_PRODUCT_ADDONS + ".RequestStatus", "=", ADDON_REQUEST_STATUS.PENDING)
                .whereIn(BOOKINGS + ".BookingId", pendingAddOnBookings)
                .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc")
            for (let bookingInc = 0; bookingInc < staffAddOnRequests.length; bookingInc++) {
                const booking = staffAddOnRequests[bookingInc];
                const found = addOnRequests.find(book => book.BookingId === booking.BookingId);
                // const scData = staffCategoryData.find(category => category.CategoryId === booking.CategoryId);
                // const scProdData = staffProductData.find(pro => pro.ProductId === booking.ProductId);
                if (!found) {
                    let objToPush = {
                        BookingId: booking.BookingId,
                        // UserId: booking.BookingUser?booking.BookingUser:1,
                        UserId: booking.BookingUser?booking.BookingUser:(booking.OrganisationLocationId)?-1:null,
                        UserName: booking.UserName?booking.UserName:'Guest',
                        Gender: booking.Gender?booking.Gender:0,
                        Street: booking.Street,
                        ImagePath: booking.ImagePath ? booking.ImagePath : "",
                        ImageURL: booking.ImagePath ? process.env.BUCKET_URL + booking.ImagePath : "",
                        Floor: booking.Floor ? booking.Floor : null,
                        City: booking.City ? booking.City : null,
                        Zip: booking.Zip ? booking.Zip : null,
                        HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                        Elevator: booking.Elevator,
                        ReturnTime: booking.ReachOutTime,
                        Products: [],
                        OrganisationName: booking.OrganisationName ? booking.OrganisationName : null,
                    }
                    let product = {
                        BookingProductId: booking.BookingProductId,
                        Product: booking.Product,
                        Duration: booking.ProductDuration,
                        PreparationTime: booking.PreparationTime,
                        Amount: booking.StaffEarning,
                        DispatchId: booking.DispatchId,
                        StartTime: booking.ProductStartTime,
                        Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                        // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                        UserId: booking.ProductUserId ? booking.ProductUserId : (booking.OrganisationLocationId)?-1:null,
                        ExistAddOnsDur: 0,
                        Guest: null,
                        ColorCode: "",
                        AddOns: []
                    }
                    if (booking.GuestId) {
                        const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                            .where("GuestId", "=", booking.GuestId);
                        product.Guest = guestResult[0];
                    }
                    let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                    product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : ""

                    let offerDate = moment(product.StartTime).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                    if (!offerDates.includes(offerDate)) {
                        offerDates.push(offerDate)
                    }
                    if (booking.BookingProductAddOnId) {
                        if (booking.ExtraAddOn) {
                            switch (booking.RequestStatus) {
                                case ADDON_REQUEST_STATUS.PENDING: {
                                    // let productAppliedRate = this.getRateForTreatment(booking.ProductDuration, booking.ProductStaffAmount)
                                    product.AddOns.push({
                                        BookingProductAddOnId: booking.BookingProductAddOnId,
                                        AddOnId: booking.AddOnId,
                                        AddOn: booking.AddOn,
                                        Duration: booking.AddOnDuration,
                                        ExtraAddOn: booking.ExtraAddOn,
                                        RequestStatus: booking.RequestStatus,
                                        // Amount: this.getAmountForTreatment(booking.AddOnDuration, productAppliedRate)
                                        Amount: booking.AddOnStaffEarning
                                    })
                                    break;
                                }
                                // case ADDON_REQUEST_STATUS.ACCEPTED: {
                                //     product.AddOns.push({
                                //         BookingProductAddOnId: booking.BookingProductAddOnId,
                                //         AddOnId: booking.AddOnId,
                                //         AddOn: booking.AddOn,
                                //         Duration: booking.AddOnDuration,
                                //         ExtraAddOn: booking.ExtraAddOn,
                                //         RequestStatus: booking.RequestStatus,
                                //         Amount: booking.AddOnStaffAmount
                                //     })
                                //     break;
                                // }
                                default: break;
                            }
                        } else {
                            // product.AddOns.push({
                            //     BookingProductAddOnId: booking.BookingProductAddOnId,
                            //     AddOnId: booking.AddOnId,
                            //     AddOn: booking.AddOn,
                            //     Duration: booking.AddOnDuration,
                            //     ExtraAddOn: booking.ExtraAddOn,
                            //     RequestStatus: booking.RequestStatus,
                            //     Amount: booking.AddOnStaffAmount
                            // })
                        }
                    }
                    // let existingAddOns = await knex(BOOKING_PRODUCT_ADDONS).select("Duration").where("BookingProductId", "=", booking.BookingProductId).andWhere("ExtraAddOn", "=", 0);
                    // existingAddOns.forEach(element => {
                    //     product.ExistAddOnsDur += element.Duration
                    // });
                    objToPush.Products.push(product);
                    addOnRequests.push(objToPush);
                } else {
                    let prodExist = found.Products.find(f => f.BookingProductId === booking.BookingProductId);
                    if (!prodExist) {
                        let product = {
                            BookingProductId: booking.BookingProductId,
                            Product: booking.Product,
                            Duration: booking.ProductDuration,
                            // TotalDuration: booking.ProductDuration,
                            PreparationTime: booking.PreparationTime,
                            // Amount: this.getAmountForTreatment(booking.ProductDuration, scProdData.Rate),
                            Amount: booking.StaffEarning,
                            DispatchId: booking.DispatchId,
                            StartTime: booking.ProductStartTime,
                            // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                            UserId: booking.ProductUserId ? booking.ProductUserId : (booking.OrganisationLocationId)?-1:null,
                            Guest: null,
                            Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                            ColorCode: "",
                            ExistAddOnsDur: 0,
                            AddOns: [],
                            OrganisationName:booking.OrganisationName?booking.OrganisationName:null
                        }
                        if (booking.GuestId) {
                            const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                                .where("GuestId", "=", booking.GuestId);
                            product.Guest = guestResult[0];
                        }
                        let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                        product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : "";
                        if (booking.BookingProductAddOnId) {
                            if (booking.ExtraAddOn) {
                                switch (booking.RequestStatus) {
                                    case ADDON_REQUEST_STATUS.PENDING: {
                                        let productAppliedRate = this.getRateForTreatment(booking.ProductDuration, booking.ProductStaffAmount)
                                        product.AddOns.push({
                                            BookingProductAddOnId: booking.BookingProductAddOnId,
                                            AddOnId: booking.AddOnId,
                                            AddOn: booking.AddOn,
                                            Duration: booking.AddOnDuration,
                                            ExtraAddOn: booking.ExtraAddOn,
                                            RequestStatus: booking.RequestStatus,
                                            // Amount: this.getAmountForTreatment(booking.AddOnDuration, productAppliedRate)
                                            Amount: booking.AddOnStaffEarning
                                        })
                                        break;
                                    }
                                    case ADDON_REQUEST_STATUS.ACCEPTED: {
                                        // product.AddOns.push({
                                        //     BookingProductAddOnId: booking.BookingProductAddOnId,
                                        //     AddOnId: booking.AddOnId,
                                        //     AddOn: booking.AddOn,
                                        //     Duration: booking.AddOnDuration,
                                        //     ExtraAddOn: booking.ExtraAddOn,
                                        //     RequestStatus: booking.RequestStatus,
                                        //     Amount: booking.AddOnStaffAmount
                                        // })
                                        break;
                                    }
                                    default: break;
                                }
                            } else {
                                // product.AddOns.push({
                                //     BookingProductAddOnId: booking.BookingProductAddOnId,
                                //     AddOnId: booking.AddOnId,
                                //     AddOn: booking.AddOn,
                                //     Duration: booking.AddOnDuration,
                                //     ExtraAddOn: booking.ExtraAddOn,
                                //     RequestStatus: booking.RequestStatus,
                                //     Amount: booking.AddOnStaffAmount
                                // })
                            }
                        }
                        // let existingAddOns = await knex(BOOKING_PRODUCT_ADDONS).select("Duration").where("BookingProductId", "=", booking.BookingProductId).andWhere("ExtraAddOn", "=", 0);
                        // existingAddOns.forEach(element => {
                        //     product.ExistAddOnsDur += element.Duration
                        // });
                        found.Products.push(product);
                    } else {
                        if (booking.BookingProductAddOnId) {
                            let addOnFound = prodExist.AddOns.find(f => f.BookingProductAddOnId === booking.BookingProductAddOnId);
                            if (!addOnFound) {
                                if (booking.ExtraAddOn) {
                                    switch (booking.RequestStatus) {
                                        case ADDON_REQUEST_STATUS.PENDING: {
                                            let productAppliedRate = this.getRateForTreatment(booking.ProductDuration, booking.ProductStaffAmount)
                                            prodExist.AddOns.push({
                                                BookingProductAddOnId: booking.BookingProductAddOnId,
                                                AddOnId: booking.AddOnId,
                                                AddOn: booking.AddOn,
                                                Duration: booking.AddOnDuration,
                                                ExtraAddOn: booking.ExtraAddOn,
                                                RequestStatus: booking.RequestStatus,
                                                // Amount: this.getAmountForTreatment(booking.AddOnDuration, productAppliedRate)
                                                Amount: booking.AddOnStaffEarning
                                            })
                                            break;
                                        }
                                        case ADDON_REQUEST_STATUS.ACCEPTED: {
                                            // prodExist.AddOns.push({
                                            //     BookingProductAddOnId: booking.BookingProductAddOnId,
                                            //     AddOnId: booking.AddOnId,
                                            //     AddOn: booking.AddOn,
                                            //     Duration: booking.AddOnDuration,
                                            //     ExtraAddOn: booking.ExtraAddOn,
                                            //     RequestStatus: booking.RequestStatus,
                                            //     Amount: booking.AddOnStaffAmount
                                            // })
                                            break;
                                        }
                                        default: break;
                                    }
                                } else {
                                    // prodExist.AddOns.push({
                                    //     BookingProductAddOnId: booking.BookingProductAddOnId,
                                    //     AddOnId: booking.AddOnId,
                                    //     AddOn: booking.AddOn,
                                    //     Duration: booking.AddOnDuration,
                                    //     ExtraAddOn: booking.ExtraAddOn,
                                    //     RequestStatus: booking.RequestStatus,
                                    //     Amount: booking.AddOnStaffAmount
                                    // })
                                }
                            }
                        }
                        if (booking.ExtraValue && !prodExist.Extras.find(ex => ex === booking.ExtraValue)) {
                            prodExist.Extras.push(booking.ExtraValue)
                        }
                    }
                }
            }

            for (let bookingInc = 0; bookingInc < addOnRequests.length; bookingInc++) {
                const booking = addOnRequests[bookingInc];
                // booking.StartTime = booking.Products[0].StartTime;
                booking.StartTime = moment(booking.Products[0].StartTime).utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
                let totalDuration = 0;
                booking.Products.forEach((product, index) => {
                    if (index > 0) {
                        totalDuration += product.PreparationTime;
                    }
                    totalDuration += product.Duration //+ product.ExistAddOnsDur;
                    product.AddOns.forEach(addOn => {
                        if (!addOn.ExtraAddOn || (addOn.ExtraAddOn && addOn.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED)) {
                            totalDuration += addOn.Duration
                        }
                    });
                });
                booking.Duration = totalDuration;
                booking.EndTime = moment(booking.StartTime).add(totalDuration, "minutes").utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
                booking.TimeZone = {
                    Zone: process.env.STAFF_ZONE
                }
            }

            addOnRequests = addOnRequests.sort((a, b) => {
                let aStart = moment(a.StartTime);
                let bStart = moment(b.StartTime);
                if (aStart.isBefore(bStart)) {
                    return -1;
                } else if (aStart.isSame(bStart)) {
                    return 0;
                } else {
                    return 1;
                }
            })
        }

        let outsideOffers = [];

        let staffOutsideOn = await knex(STAFF_METADATA).select("ShowOutsideOffers").where("StaffId", "=", staffId);
        if (staffOutsideOn && staffOutsideOn[0].ShowOutsideOffers) {
            let staffSkills = await knex(STAFF_PRODUCT).select("ProductId", "Rate").where("StaffId", "=", staffId);
            let prods = []
            staffSkills.forEach(element => {
                if (element.Rate) {
                    prods.push(element.ProductId);
                }
            });
            let outOfProds = await knex
                .select(
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StartTime",
                    BOOKING_PRODUCTS + ".Duration",
                    BOOKING_PRODUCTS + ".DispatchId",
                    BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                    BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                    BOOKING_PRODUCT_DISPATCH + ".StaffId"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                .where(BOOKING_PRODUCTS + ".StartTime", ">", moment().toDate())
                .whereIn(BOOKING_PRODUCTS + ".ProductId", prods)
                .whereNull(BOOKING_PRODUCTS + ".StaffId")
            // .whereNot(BOOKING_PRODUCT_DISPATCH + ".StaffId", staffId);
            let finalOtherProds = [];
            let rejected = [];
            outOfProds.forEach(prod => {
                let found = finalOtherProds.find(f => f.BookingProductId === prod.BookingProductId);
                if (prod.StaffId === staffId) {
                    rejected.push(prod.BookingProductId);
                }
                if (!found) {
                    let dur = prod.Duration;
                    if (prod.AddOnDuration) {
                        dur += prod.AddOnDuration;
                    }
                    finalOtherProds.push({
                        BookingProductId: prod.BookingProductId,
                        StartTime: prod.StartTime,
                        Duration: dur
                    });
                } else {
                    if (prod.AddOnDuration) {
                        found.Duration = found.Duration + prod.AddOnDuration;
                    }
                }
            });
            finalOtherProds = finalOtherProds.filter(f => {
                let rej = true;
                if (rejected.includes(f.BookingProductId)) {
                    rej = false;
                }
                return rej;
            })
            let outOfferProds = [];
            for (let outCh = 0; outCh < finalOtherProds.length; outCh++) {
                const booProd = finalOtherProds[outCh];
                let staffAvailability = await checkOutSideSchedule(knex, {
                    StaffId: staffId,
                    StartTime: booProd.StartTime,
                    Duration: booProd.Duration
                });
                if (!staffAvailability.IsAvailable) {
                    // Booking don't fit schedule.
                    outOfferProds.push(booProd.BookingProductId);
                }
            }

            if (outOfferProds.length) {
                let outsideOffersData = await knex
                    .select(
                        BOOKINGS + ".BookingId",
                        BOOKINGS + ".UserId as BookingUser",
                        USERS + ".Name as UserName",
                        USERS + ".Gender",
                        USERS + ".ImagePath",
                        // BOOKINGS + ".Street",
                        // BOOKINGS + ".Floor",
                        // BOOKINGS + ".City",
                        BOOKINGS + ".Zip",
                        BOOKINGS + ".Elevator",
                        BOOKINGS + ".ReachOutTime",
                        BOOKING_PRODUCTS + ".BookingProductId",
                        BOOKING_PRODUCTS + ".CategoryId",
                        BOOKING_PRODUCTS + ".ProductId",
                        BOOKING_PRODUCTS + ".Product",
                        BOOKING_PRODUCTS + ".Duration as ProductDuration",
                        BOOKING_PRODUCTS + ".Amount as ProductAmount",
                        BOOKING_PRODUCTS + ".PreparationTime",
                        BOOKING_PRODUCTS + ".StartTime as ProductStartTime",
                        BOOKING_PRODUCTS + ".DispatchId",
                        BOOKING_PRODUCTS + ".UserId as ProductUserId",
                        BOOKING_PRODUCTS + ".GuestId",
                        BOOKING_PRODUCTS + ".SameTime",
                        BOOKING_PRODUCT_EXTRA + ".ExtraValue",
                        BOOKING_PRODUCT_DISPATCH + ".StaffId",
                        BOOKING_PRODUCT_DISPATCH + ".Status",
                        BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                        BOOKING_PRODUCT_ADDONS + ".AddOnId",
                        BOOKING_PRODUCT_ADDONS + ".AddOn",
                        BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                        BOOKING_PRODUCT_ADDONS + ".Amount as AddOnAmount",
                        BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                SPECIAL_REQUEST + ".SpecialRequestName",
                ORGANISATION_LOCATION + ".Name as OrganisationName",
                    )
                    .from(BOOKING_PRODUCTS)
                    .leftJoin(BOOKINGS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                    .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                    .leftJoin(BOOKING_SPECIAL_REQUEST, BOOKINGS + ".BookingId", BOOKING_SPECIAL_REQUEST + ".BookingId")
                    .leftJoin(SPECIAL_REQUEST, SPECIAL_REQUEST + ".SpecialRequestId", BOOKING_SPECIAL_REQUEST + ".SpecialRequestId")
                    .leftJoin(BOOKING_PRODUCT_EXTRA, BOOKING_PRODUCT_EXTRA + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                    .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
                    .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                    .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
                    .whereIn(BOOKINGS + ".Status", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING])
                    .whereIn(BOOKING_PRODUCTS + ".BookingProductId", outOfferProds)
                    .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");

                for (let bookingInc = 0; bookingInc < outsideOffersData.length; bookingInc++) {
                    const booking = outsideOffersData[bookingInc];
                    if (bookingOffers.find(f => f.BookingProductId === booking.BookingProductId)) {
                        continue;
                    }
                    const found = outsideOffers.find(book => book.BookingId === booking.BookingId);
                    const scData = staffCategoryData.find(category => category.CategoryId === booking.CategoryId);
                    const scProdData = staffProductData.find(pro => pro.ProductId === booking.ProductId);
                    if (!scData || !scData.Rate || !scProdData || !scProdData.Rate) {
                        continue;
                    }
                    if (!found) {
                        let objToPush = {
                            BookingId: booking.BookingId,
                            BookingProductId: booking.BookingProductId,
                            // UserId: booking.BookingUser?booking.BookingUser:1,
                            UserId: booking.BookingUser?booking.BookingUser:(booking.OrganisationLocationId)?-1:null,
                            UserName: booking.UserName?booking.UserName:'Guest',
                            Gender: booking.Gender?booking.Gender:0,
                            // Street: booking.Street,
                            ImagePath: booking.ImagePath ? booking.ImagePath : "",
                            ImageURL: booking.ImagePath ? process.env.BUCKET_URL + booking.ImagePath : "",
                            // Floor: booking.Floor ? booking.Floor : null,
                            // City: booking.City ? booking.City : null,
                            Zip: booking.Zip ? booking.Zip : null,
                            Elevator: booking.Elevator,
                            ReturnTime: booking.ReachOutTime,
                            Products: [],
                            SpecialRequest:[],
                            OrganisationName:booking.OrganisationName?booking.OrganisationName:null
                        }
                        let product = {
                            BookingProductId: booking.BookingProductId,
                            Product: booking.Product,
                            Duration: booking.ProductDuration,
                            // TotalDuration: booking.ProductDuration,
                            PreparationTime: booking.PreparationTime,
                            Amount: scProdData.Rate ? this.getAmountForTreatment(booking.ProductDuration, scProdData.Rate) : 0,
                            // Amount: booking.ProductStaffAmount,
                            DispatchId: booking.DispatchId,
                            StartTime: booking.ProductStartTime,
                            Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                            // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                            UserId: booking.ProductUserId ? booking.ProductUserId : (booking.OrganisationLocationId)?-1:null,
                            Guest: null,
                            ColorCode: "",
                            AddOns: []
                        }
                        if (booking.GuestId) {
                            const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                                .where("GuestId", "=", booking.GuestId);
                            product.Guest = guestResult[0];
                        }
                        let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                        product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : ""

                        // let offerDate = moment(product.StartTime).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                        // if (!offerDates.includes(offerDate)) {
                        //     offerDates.push(offerDate)
                        // }
                        if (booking.BookingProductAddOnId) {
                            // product.TotalDuration += booking.AddOnAmount;
                            product.AddOns.push({
                                BookingProductAddOnId: booking.BookingProductAddOnId,
                                AddOnId: booking.AddOnId,
                                AddOn: booking.AddOn,
                                Duration: booking.AddOnDuration,
                                Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                            })
                        }
                        objToPush.Products.push(product);
                        if (booking.BookingSpecialRequestId) {
                            // product.TotalDuration += booking.AddOnAmount;
                            objToPush.SpecialRequest.push({
                                BookingSpecialRequestId: booking.BookingSpecialRequestId,
                                SpecialRequestId: booking.SpecialRequestId,
                                SpecialRequestName: booking.SpecialRequestName,

                            })
                        }
                        outsideOffers.push(objToPush);

                       

                    } else {
                        let prodExist = found.Products.find(f => f.BookingProductId === booking.BookingProductId);
                        if (!prodExist) {
                            let product = {
                                BookingProductId: booking.BookingProductId,
                                Product: booking.Product,
                                Duration: booking.ProductDuration,
                                // TotalDuration: booking.ProductDuration,
                                PreparationTime: booking.PreparationTime,
                                Amount: this.getAmountForTreatment(booking.ProductDuration, scProdData.Rate),
                                // Amount: booking.ProductStaffAmount,
                                DispatchId: booking.DispatchId,
                                StartTime: booking.ProductStartTime,
                                // UserId: booking.ProductUserId ? booking.ProductUserId : null,
                                UserId: booking.ProductUserId ? booking.ProductUserId : (booking.OrganisationLocationId)?-1:null,
                                Guest: null,
                                Extras: booking.ExtraValue ? [booking.ExtraValue] : [],
                                ColorCode: "",
                                AddOns: [],
                                OrganisationName:booking.OrganisationName?booking.OrganisationName:null
                            }
                            if (booking.GuestId) {
                                const guestResult = await knex(GUESTS).select("Name", "Relation", "Contact", "Gender", "Notes")
                                    .where("GuestId", "=", booking.GuestId);
                                product.Guest = guestResult[0];
                            }
                            let prodCat = categoryColors.find(f => f.CategoryId === booking.CategoryId);
                            product.ColorCode = prodCat.ColorCode ? prodCat.ColorCode : ""
                            if (booking.BookingProductAddOnId) {
                                // product.TotalDuration += booking.AddOnAmount;
                                product.AddOns.push({
                                    BookingProductAddOnId: booking.BookingProductAddOnId,
                                    AddOnId: booking.AddOnId,
                                    AddOn: booking.AddOn,
                                    Duration: booking.AddOnDuration,
                                    Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                                })
                            }
                            found.Products.push(product);
                           
                        } else {
                            if (booking.BookingProductAddOnId) {
                                let addOnFound = prodExist.AddOns.find(f => f.BookingProductAddOnId === booking.BookingProductAddOnId);
                                if (!addOnFound) {
                                    // prodExist.TotalDuration += booking.AddOnAmount;
                                    prodExist.AddOns.push({
                                        BookingProductAddOnId: booking.BookingProductAddOnId,
                                        AddOnId: booking.AddOnId,
                                        AddOn: booking.AddOn,
                                        Duration: booking.AddOnDuration,
                                        Amount: this.getAmountForTreatment(booking.AddOnDuration, scData.Rate)
                                    })
                                }
                            }
                            if (booking.ExtraValue && !prodExist.Extras.find(ex => ex === booking.ExtraValue)) {
                                prodExist.Extras.push(booking.ExtraValue)
                            }

                            
                        }
                        if (booking.BookingSpecialRequestId) {
                            let reqExist = found.SpecialRequest.find(f => f.BookingSpecialRequestId === booking.BookingSpecialRequestId);
                            if (!reqExist) {
                                found.SpecialRequest.push({
                                    BookingSpecialRequestId: booking.BookingSpecialRequestId,
                                    SpecialRequestId: booking.SpecialRequestId,
                                    SpecialRequestName: booking.SpecialRequestName,

                                })

                            }

                        }
                    }
                }

                for (let bookingInc = 0; bookingInc < outsideOffers.length; bookingInc++) {
                    const booking = outsideOffers[bookingInc];
                    // booking.StartTime = booking.Products[0].StartTime;
                    booking.StartTime = moment(booking.Products[0].StartTime).utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
                    let totalDuration = 0;
                    booking.Products.forEach((product, index) => {
                        if (index > 0) {
                            totalDuration += product.PreparationTime;
                        }
                        totalDuration += product.Duration;
                        product.AddOns.forEach(addOn => {
                            totalDuration += addOn.Duration
                        });
                    });
                    booking.Duration = totalDuration;
                    booking.EndTime = moment(booking.StartTime).add(totalDuration, "minutes").utc().format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z;
                    booking.TimeZone = {
                        Zone: process.env.STAFF_ZONE
                    }
                }
                // outsideOffers = outsideOffers.filter(f => {
                //     let notInOffers = true;
                //     if (bookingOffers.find(o => o.BookingId === f.BookingId)) {
                //         notInOffers = false;
                //     }
                //     return notInOffers;
                // })
            }
        }

        response = {
            BookingOffers: finalBookingOffers,
            AddOnRequests: addOnRequests,
            BlockTimes: [],
            OutsideOffers: outsideOffers
        }

        // fetch offerDates block times.
        for (let ofdInc = 0; ofdInc < offerDates.length; ofdInc++) {
            const offerDate = offerDates[ofdInc];
            let blocks = await this.getStaffDayScheduleByType(knex, staffId, moment(offerDate, DATE_TIME_FORMAT.DDLMMLYYYY), STAFF_SCHEDULE_TYPE.BLOCK_TIME);
            if (blocks && blocks.Block && blocks.Block.length) {
                response.BlockTimes.push({
                    Date: offerDate,
                    Blocks: blocks.Block,
                    TimeZone: {
                        Zone: process.env.STAFF_ZONE
                    }
                });
            }
        }

        // knex.destroy().then(() => { });
        await knex.destroy();
    } catch (error) {
        console.log(error);
        if (connected) {
            // knex.destroy().then(() => { });
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_SCH_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.updateStRequestStatus = async (event) => {
    /**
     * API Objective: accept/reject staff booking or addOn offers.
     * RequestType: 0-Booking, 1-AddOn.
     * Working:
     */
    let knex, connected = false, response;
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number" ||
            !json.BookingId || typeof json.BookingId !== "number" ||
            typeof json.RequestType !== "number" ||
            json.RequestType < 0 || json.RequestType > 1 ||
            typeof json.IsAccepted !== "boolean" ||
            !json.Data || typeof json.Data !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        json.Data.forEach(data => {
            if (!data) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            if (json.RequestType === 0 && (!data.BookingProductId || !data.DispatchId)) {
                // Booking offer
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            if (json.RequestType === 1 && !data.BookingProductAddOnId) {
                // AddOn offer
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });
        const staffId = json.StaffId;
        const bookingId = json.BookingId;
        let requestData = json.Data;
        knex = require("knex")(con);
        switch (json.RequestType) {
            case 0: {
                // Booking Offer
                switch (json.IsAccepted) {
                    case true: {
                        /**
                         * Booking product is accepted
                         * 1. First check if the particular product is not yet assigned a staff.
                         * 2. Check the session - if staff is still available for this timing.
                         * 3. Create staff calendar event for this booking.
                         * 4. Assign the staff to related product.
                         * 5. Mark the dispatch status of staff to accepted.
                         * 6. Send acceptance notification to staff and insert to message list.
                         */

                        // 1. Check if any product is assigned a therapist already.
                        let bookingProductsSelected = [];
                        let productDispatchIds = [];
                        requestData.forEach(element => {
                            bookingProductsSelected.push(element.BookingProductId);
                            productDispatchIds.push(element.DispatchId);
                        });
                        let checkProdAssigned = await knex(BOOKING_PRODUCTS).select("BookingId", "StaffId").whereIn("BookingProductId", bookingProductsSelected);
                        let staffAlreadyAssigned = false;

                        let bookingStatus = await knex(BOOKINGS).select("Status").where("BookingId", "=", checkProdAssigned[0].BookingId);
                        if (![BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ON_GOING].includes(bookingStatus[0].Status)) {
                            staffAlreadyAssigned = true;
                        }
                        checkProdAssigned.forEach(element => {
                            if (element.StaffId !== null) {
                                staffAlreadyAssigned = true;
                            }
                        });


                        // Check if booking is still dispatched to him
                        for (let index = 0; index < requestData.length; index++) {
                            const product = requestData[index];
                            let stillDispatched = await knex(BOOKING_PRODUCT_DISPATCH).select("DispatchId", "StaffId", "Status")
                                .where("DispatchId", "=", product.DispatchId).andWhere("StaffId", "=", staffId);
                            if (stillDispatched[0].Status !== DISPATCH_STATUS.DISPATCHED) {
                                staffAlreadyAssigned = true;
                            }
                        }

                        if (staffAlreadyAssigned) {
                            return {
                                statusCode: 405,
                                headers: {
                                    ...Headers,
                                    Message: MESSAGE.PRODUCT_ALREADY_ACCEPTED
                                }
                            }
                            break;
                        }

                        // 2. Check session availability.
                        let startTime, duration = 0;
                        let startTimeData = await knex
                            .select(
                                BOOKING_PRODUCTS + ".BookingProductId",
                                BOOKING_PRODUCTS + ".ProductId",
                                BOOKING_PRODUCTS + ".Product",
                                BOOKING_PRODUCTS + ".PreparationTime",
                                BOOKING_PRODUCTS + ".StartTime",
                                BOOKING_PRODUCTS + ".Duration as ProductDuration",
                                BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                                BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                                BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                                BOOKING_PRODUCT_ADDONS + ".RequestStatus as AddOnRequestStatus",
                                BOOKINGS + ".BookingId",
                                BOOKINGS + ".ReachOutTime",
                                BOOKINGS + ".Created",
                            )
                            .from(BOOKING_PRODUCTS)
                            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                            .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
                            .whereIn(BOOKING_PRODUCTS + ".BookingProductId", bookingProductsSelected)
                            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
                        // set start time.
                        startTime = moment(startTimeData[0].StartTime);
                        let prods = [];
                        let totalReachOut = startTimeData[0].ReachOutTime;

                        let staffData = await knex(STAFF).select("GoogleEmail", "FcmToken").where("StaffId", "=", staffId);
                        let staffDetail = staffData[0];
                        let eventConfig = {
                            start: {
                                dateTime: startTime.toDate(),
                                timeZone: process.env.TIME_ZONE
                            },
                            end: {
                                dateTime: startTime.toDate(),
                                timeZone: process.env.TIME_ZONE
                            },
                            attendees: [
                                { email: process.env.EMAIL },
                                { email: staffDetail.GoogleEmail }
                            ],
                            Products: [],
                            extendedProperties: {
                                shared: {
                                    'BookingId': bookingId,
                                    'ReachOutTime': startTimeData[0].ReachOutTime + startTimeData[0].PreparationTime,
                                    'ReturnTime': startTimeData[0].ReachOutTime
                                }
                            },
                            description: "",
                            summary: ""
                        }
                        startTimeData.forEach((element, index) => {
                            let prodConsidered = prods.find(f => f.BookingProductId === element.BookingProductId);
                            if (!prodConsidered) {
                                let pushObj = {
                                    BookingProductId: element.BookingProductId,
                                    TotalDuration: element.ProductDuration,
                                    ProductId: element.ProductId,
                                    Duration: element.ProductDuration,
                                    BookingProductAddOns: []
                                }
                                if (index === 0) {
                                    totalReachOut += element.PreparationTime;
                                } else {
                                    pushObj.TotalDuration += element.PreparationTime;
                                }
                                if (element.BookingProductAddOnId) {
                                    if (element.ExtraAddOn) {
                                        if (element.AddOnRequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                            pushObj.TotalDuration += element.AddOnDuration;
                                            pushObj.BookingProductAddOns.push({
                                                BookingProductAddOnId: element.BookingProductAddOnId,
                                                Duration: element.AddOnDuration
                                            });
                                        }
                                    } else {
                                        pushObj.TotalDuration += element.AddOnDuration;
                                        pushObj.BookingProductAddOns.push({
                                            BookingProductAddOnId: element.BookingProductAddOnId,
                                            Duration: element.AddOnDuration
                                        });
                                    }
                                }
                                eventConfig.Products.push(element.Product + " (" + pushObj.TotalDuration + " mins)")
                                prods.push(pushObj);
                            } else {
                                if (element.BookingProductAddOnId) {
                                    let adConsidered = prodConsidered.BookingProductAddOns.find(f => f === element.BookingProductAddOnId);
                                    if (!adConsidered) {
                                        prodConsidered.TotalDuration += element.AddOnDuration;
                                        prodConsidered.BookingProductAddOns.push({
                                            BookingProductAddOnId: element.BookingProductAddOnId,
                                            Duration: element.AddOnDuration
                                        });
                                    }
                                }
                            }
                        });
                        prods.forEach(element => {
                            duration += element.TotalDuration;
                        });
                        // let daySchedule = await this.staffDaySchedule(knex, staffId, moment(startTime).startOf("day"));
                        // let dayFinalTiming = getDayTimesGOnIC(moment(startTime).startOf('day').format(DATE_TIME_FORMAT.MMLDDLYYYY), daySchedule.GeneralOffer.CurrentSchedular ? daySchedule.GeneralOffer : {}, daySchedule.InstantConfirmation.CurrentSchedular ? daySchedule.InstantConfirmation : {});
                        // let dayStartTiming = moment(startTime.format(DATE_TIME_FORMAT.DDLMMLYYYY) + " " + dayFinalTiming.DayStart + " " + STAFF_ZONE, DATE_TIME_FORMAT.DDLMMLYYYY + DATE_TIME_FORMAT.HHcmmcss + DATE_TIME_FORMAT.Z);
                        // let reachSubt = null;
                        // if (dayStartTiming.isSame(startTime)) {
                        //     reachSubt = totalReachOut;
                        // }
                        let staffAvailability = await this.staffCheck(knex, {
                            StaffId: staffId,
                            // StartTime: startTime.subtract(totalReachOut, "minute").format(),
                            StartTime: startTime.format(),
                            Duration: duration,
                            ReachOutTime: totalReachOut
                        });
                        if (!staffAvailability.IsAvailable || startTime.isBefore(moment())) {
                            return {
                                statusCode: 410,
                                headers: {
                                    ...Headers,
                                    Message: !staffAvailability.IsAvailable ? MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK : MESSAGE.CANNOT_ACCEPT_PAST_BOOKING
                                }
                            }
                        }

                        // 3. Create staff calendar event for this booking.
                        let userData = await knex
                            .select(
                                BOOKINGS + ".BookingId",
                                USERS + ".Name"
                            )
                            .from(BOOKINGS)
                            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                            .where(BOOKINGS + ".BookingId", "=", bookingId);
                        eventConfig.end.dateTime = moment(eventConfig.end.dateTime).add(duration, "minutes").toDate();
                        eventConfig.summary = userData[0].Name + ", Booking #" + bookingId;
                        eventConfig.description = eventConfig.Products.toString();
                        const eventCreated = await calendar.events.insert({
                            auth: oAuth2Client,
                            calendarId: "primary",
                            resource: eventConfig
                        });

                        // 4. Assign the staff to related product.
                        for (let index = 0; index < prods.length; index++) {
                            const product = prods[index];
                            let staffProductData = await knex(STAFF_PRODUCT)
                                .select("ProductId", "Rate")
                                .where("StaffId", "=", staffId)
                                .andWhere("ProductId", "=", product.ProductId);
                            let staffRate = staffProductData[0];
                            let diffAccepted = moment().diff(moment(startTimeData[0].Created), "minute");
                            let assigned = await knex(BOOKING_PRODUCTS)
                                .where("BookingProductId", product.BookingProductId)
                                .update({
                                    StaffId: staffId,
                                    EventId: eventCreated.data.id,
                                    StaffAmount: this.getAmountForTreatment(product.Duration, staffRate.Rate),
                                    AcceptedOn: moment().toDate(),
                                    DiffAccepted: diffAccepted ? diffAccepted : null,
                                    LastUpdated: zone.getLastUpdate()
                                });
                            for (let inc = 0; inc < product.BookingProductAddOns.length; inc++) {
                                const addOn = product.BookingProductAddOns[inc];
                                let updated = await knex(BOOKING_PRODUCT_ADDONS)
                                    .where("BookingProductAddOnId", "=", addOn.BookingProductAddOnId)
                                    .update({
                                        StaffAmount: this.getAmountForTreatment(addOn.Duration, staffRate.Rate)
                                    })

                            }
                        }

                        // 5. Mark the dispatch status of staff to accepted.
                        let statusMarked = await knex(BOOKING_PRODUCT_DISPATCH)
                            .whereIn("DispatchId", productDispatchIds)
                            .andWhere("StaffId", "=", staffId)
                            .update({
                                Status: DISPATCH_STATUS.ACCEPTED
                            });

                        STAFF_ZONE = zone.getStaffZone(startTime);
                        // 6. Send the notification to staff for accepting the booking.
                        try {
                            const title = `Booking #${bookingId} accepted.`;
                            const body = `You have accepted a booking offer, scheduled on ${momentz.tz(startTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;

                            // Insert to message list.
                            let inserted = await knex(STAFF_MESSAGES).insert({
                                StaffId: staffId,
                                Title: title,
                                Description: body,
                                Date: moment().toDate(),
                                ImagePath: null,
                                Tag: MESSAGE_TAG.IMPORTANT,
                                ...zone.getCreateUpdate()
                            })

                            // Collect staff fcmtoken and send acceptance notification.
                            if (staffDetail.FcmToken) {
                                const message = {
                                    token: staffDetail.FcmToken,
                                    notification: {
                                        title,
                                        body
                                    },
                                    data: {
                                        BookingId: `${bookingId}`,
                                        DateTime: moment(startTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                        ScreenName: PUSH.SCREEN.BOOKINGS,
                                        TimeZone: process.env.STAFF_ZONE
                                    }
                                }
                                const therapistApp = InitializeFirebaseTherapist();
                                const sentNotifications = await therapistApp.messaging().send(message);
                                console.log(sentNotifications);
                            }
                        } catch (error) {
                            console.log(error);
                        }

                        break;
                    }
                    case false: {
                        /**
                         * Booking product is rejected.
                         * 1. Mark all dispatch status for this staff for this product as rejected.
                         */
                        let bookingProductsSelected = [];
                        requestData.forEach(element => {
                            bookingProductsSelected.push(element.BookingProductId);
                        });
                        let dispatchIdsQr = await knex(BOOKING_PRODUCTS).select("DispatchId").whereIn("BookingProductId", bookingProductsSelected);
                        let dispatchIds = [];
                        if (dispatchIdsQr) {
                            dispatchIdsQr.forEach(element => {
                                dispatchIds.push(element.DispatchId);
                            });
                            if (dispatchIds.length) {
                                let marked = await knex(BOOKING_PRODUCT_DISPATCH)
                                    .whereIn("DispatchId", dispatchIds)
                                    .andWhere("StaffId", "=", staffId)
                                    .update({
                                        Status: DISPATCH_STATUS.REJECTED,
                                        LastUpdated: zone.getLastUpdate()
                                    })
                            }
                        }
                        break;
                    }
                }
                break;
            }
            case 1: {
                // AddOn Offer
                switch (json.IsAccepted) {
                    case true: {
                        /**
                         * Booking AddOn Request accepted.
                         * Working:
                         * 1. Get the add-on details, calculate the StaffAmount
                         * 2. Check the staff availability for processing add-on.
                         * 3. Mark the add-on request status to Accepted and insert StaffAmount.
                         * 4. Update the booking PaidPrice, Amount and Duration.
                         * 5. Update products startTime if required.
                         * 6. Updates the google calendar events for the staff.
                         * 7. Inform therapist app for add-on request accepted.
                         * 8. Inform the user app after 5mins, that some add-ons are accepted, do the payment.
                         */
                        let bookingProductsSelected = [];
                        requestData.forEach(element => {
                            bookingProductsSelected.push(element.BookingProductId);
                        });
                        // * 1. Get the add-on details, calculate the StaffAmount
                        let bookingDetail = await knex
                            .select(
                                BOOKINGS + ".BookingId",
                                BOOKINGS + ".UserId",
                                USERS + ".FcmToken",
                                BOOKINGS + ".Amount",
                                BOOKINGS + ".Duration",
                                BOOKINGS + ".DateTime",
                                BOOKINGS + ".PaidPrice",
                                BOOKING_PRODUCTS + ".BookingProductId",
                                // BOOKING_PRODUCTS + ".CategoryId",
                                BOOKING_PRODUCTS + ".StartTime",
                                // BOOKING_PRODUCTS + ".Amount as ProductAmount",
                                BOOKING_PRODUCTS + ".EventId",
                                BOOKING_PRODUCTS + ".Status as ProductStatus",
                                BOOKING_PRODUCTS + ".Duration as ProductDuration",
                                BOOKING_PRODUCTS + ".StaffAmount as ProductStaffAmount",
                                BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                                BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                                BOOKING_PRODUCT_ADDONS + ".Amount as AddOnAmount",
                                BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                                BOOKING_PRODUCT_ADDONS + ".RequestStatus"
                            )
                            .from(BOOKINGS)
                            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                            .where(BOOKINGS + ".BookingId", "=", bookingId)
                            .whereIn(BOOKING_PRODUCTS + ".BookingProductId", bookingProductsSelected)
                            .andWhere(BOOKING_PRODUCT_ADDONS + ".ExtraAddOn", "=", 1)
                            .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
                        let updatedBookingDuration = bookingDetail[0].Duration;
                        let updatedBookingAmount = bookingDetail[0].Amount;
                        let updatedPaidPrice = bookingDetail[0].PaidPrice;
                        // let productStarts = [];
                        if (bookingDetail.length) {
                            // * 2. Check session availability.
                            let escapeEvents = [];
                            let prodWiseAdds = [];
                            for (let adInc = 0; adInc < bookingDetail.length; adInc++) {
                                const addOn = bookingDetail[adInc];
                                let compProdStatus = [
                                    BOOKING_PRODUCT_STATUS.COMPLETED,
                                    BOOKING_PRODUCT_STATUS.CANCELLED,
                                    BOOKING_PRODUCT_STATUS.LAPSED,
                                    BOOKING_PRODUCT_STATUS.INCONCLUSIVE,
                                    BOOKING_PRODUCT_STATUS.CANCELLED_MANUALLY
                                ]
                                if (compProdStatus.includes(addOn.ProductStatus)) {
                                    let thisProdAddOns = requestData.filter(f => f.BookingProductId === addOn.BookingProductId);
                                    let bpaids = [];
                                    thisProdAddOns.forEach(element => {
                                        bpaids.push(element.BookingProductAddOnId);
                                    });
                                    let marked = await knex(BOOKING_PRODUCT_ADDONS).whereIn("BookingProductAddOnId", bpaids).update({
                                        RequestStatus: ADDON_REQUEST_STATUS.NOT_ACCEPTABLE,
                                        LastUpdated: zone.getLastUpdate()
                                    })
                                    return {
                                        statusCode: 410,
                                        headers: {
                                            ...Headers,
                                            Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
                                        }
                                    }
                                }
                                let prodIns = prodWiseAdds.find(f => f.BookingProductId === addOn.BookingProductId);
                                if (!prodIns) {
                                    let pushObj = {
                                        BookingProductId: addOn.BookingProductId,
                                        totalDurationReq: 0,
                                        EndTime: moment(addOn.StartTime).add(addOn.ProductDuration, "minutes")
                                    };
                                    let existAddOns = await knex(BOOKING_PRODUCT_ADDONS)
                                        .select("Duration", "ExtraAddOn", "RequestStatus")
                                        .where("BookingProductId", "=", addOn.BookingProductId);
                                    existAddOns.forEach(existAdds => {
                                        if (existAdds.ExtraAddOn) {
                                            if (existAdds.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                                pushObj.EndTime.add(existAdds.Duration, "minutes");
                                            }
                                        } else {
                                            pushObj.EndTime.add(existAdds.Duration, "minutes");
                                        }
                                    });
                                    if (addOn.ExtraAddOn) {
                                        if (addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING) {
                                            pushObj.totalDurationReq += addOn.AddOnDuration;
                                        }
                                    }
                                    prodWiseAdds.push(pushObj);
                                } else {
                                    if (addOn.ExtraAddOn) {
                                        if (addOn.RequestStatus === ADDON_REQUEST_STATUS.PENDING) {
                                            prodIns.totalDurationReq += addOn.AddOnDuration;
                                        }
                                    }
                                }
                                let evf = escapeEvents.find(f => f === addOn.EventId);
                                if (!evf) {
                                    escapeEvents.push(addOn.EventId);
                                }
                            }
                            for (let prIn = 0; prIn < prodWiseAdds.length; prIn++) {
                                const prod = prodWiseAdds[prIn];
                                let staffAvailability = await this.staffCheck(knex, {
                                    StaffId: staffId,
                                    StartTime: moment(prod.EndTime).format(),
                                    Duration: prod.totalDurationReq,
                                    Events: escapeEvents,
                                    ReachOutTime: null
                                });
                                if (!staffAvailability.IsAvailable) {
                                    return {
                                        statusCode: 410,
                                        headers: {
                                            ...Headers,
                                            Message: MESSAGE.STAFF_NOT_AVAILABLE_F_BOOK
                                        }
                                    }
                                }
                            }

                            // * 3. Mark the add-on request status to Accepted and insert StaffAmount.
                            for (let index = 0; index < bookingDetail.length; index++) {
                                const addOn = bookingDetail[index];
                                let existInRequest = requestData.find(f => f.BookingProductAddOnId === addOn.BookingProductAddOnId);
                                if (existInRequest) {
                                    // let productStartFound = productStarts.find(f => f.BookingProductId === addOn.BookingProductId);
                                    // if (!productStartFound) {
                                    //     productStarts.push({
                                    //         BookingProductId: addOn.BookingProductId,
                                    //         StartTime: addOn.ProductStartTime,
                                    //         SameTime: addOn.ProductSameTime
                                    //     })
                                    // }

                                    updatedBookingAmount += addOn.AddOnAmount;
                                    updatedBookingDuration += addOn.AddOnDuration;
                                    updatedPaidPrice += addOn.AddOnAmount;

                                    let rate = this.getRateForTreatment(addOn.ProductDuration, addOn.ProductStaffAmount);
                                    let updateObj = {
                                        StaffAmount: this.getAmountForTreatment(addOn.AddOnDuration, rate),
                                        RequestStatus: ADDON_REQUEST_STATUS.ACCEPTED,
                                        LastUpdated: zone.getLastUpdate()
                                    }

                                    await knex(BOOKING_PRODUCT_ADDONS)
                                        .where("BookingProductAddOnId", "=", addOn.BookingProductAddOnId)
                                        .update(updateObj)
                                }

                            }

                            // * 4. Mark the add-on request status to Accepted and insert StaffAmount.
                            let bookingUpdated = await knex(BOOKINGS)
                                .where("BookingId", "=", bookingId)
                                .update({
                                    Amount: updatedBookingAmount,
                                    Duration: updatedBookingDuration,
                                    PaidPrice: updatedPaidPrice,
                                    LastUpdated: zone.getLastUpdate()
                                })

                            // * 5. Update Product Start time if required.
                            let productDetail = await knex
                                .select(
                                    BOOKINGS + ".BookingId",
                                    BOOKING_PRODUCTS + ".BookingProductId",
                                    BOOKING_PRODUCTS + ".StartTime",
                                    BOOKING_PRODUCTS + ".Duration as ProductDuration",
                                    BOOKING_PRODUCTS + ".EventId",
                                    BOOKING_PRODUCTS + ".PreparationTime",
                                    BOOKING_PRODUCTS + ".SameTime",
                                    BOOKING_PRODUCTS + ".StaffId",
                                    BOOKING_PRODUCT_ADDONS + ".BookingProductAddOnId",
                                    BOOKING_PRODUCT_ADDONS + ".Duration as AddOnDuration",
                                    BOOKING_PRODUCT_ADDONS + ".ExtraAddOn",
                                    BOOKING_PRODUCT_ADDONS + ".RequestStatus"
                                )
                                .from(BOOKINGS)
                                .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                                .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
                                .where(BOOKINGS + ".BookingId", "=", bookingId)
                                .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                                .orderBy(BOOKING_PRODUCTS + ".BookingProductId", "asc");
                            let prodConfig = [];
                            productDetail.forEach(product => {
                                let found = prodConfig.find(f => f.BookingProductId === product.BookingProductId);
                                if (!found) {
                                    let pushObj = {
                                        BookingProductId: product.BookingProductId,
                                        StartTime: product.StartTime,
                                        Duration: product.ProductDuration,
                                        EventId: product.EventId,
                                        SameTime: product.SameTime,
                                        PreparationTime: product.PreparationTime,
                                        StaffId: product.StaffId
                                    }
                                    if (product.BookingProductAddOnId) {
                                        if (product.ExtraAddOn) {
                                            if (product.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                                pushObj.Duration += product.AddOnDuration;
                                            }
                                        } else {
                                            pushObj.Duration += product.AddOnDuration;
                                        }
                                    }
                                    prodConfig.push(pushObj);
                                } else {
                                    if (product.BookingProductAddOnId) {
                                        if (product.ExtraAddOn) {
                                            if (product.RequestStatus === ADDON_REQUEST_STATUS.ACCEPTED) {
                                                found.Duration += product.AddOnDuration;
                                            }
                                        } else {
                                            found.Duration += product.AddOnDuration;
                                        }
                                    }
                                }
                            });
                            prodConfig.forEach((product, index) => {
                                if (index > 0) {
                                    if (!product.SameTime && product.StaffId === prodConfig[0].StaffId) {
                                        product.StartTime = moment(prodConfig[0].EndTime).add(product.PreparationTime, "minutes");
                                        product.EndTime = moment(product.StartTime).add(product.Duration, "minutes");
                                    } else {
                                        product.StartTime = moment(product.StartTime);
                                        product.EndTime = moment(product.StartTime).add(product.Duration, "minutes");
                                    }
                                } else {
                                    product.EndTime = moment(product.StartTime).add(product.Duration, "minutes");
                                }
                            });
                            for (let prodInc = 0; prodInc < prodConfig.length; prodInc++) {
                                const product = prodConfig[prodInc];
                                // Updating product StartTime here
                                let prodUpdated = await knex(BOOKING_PRODUCTS)
                                    .where("BookingProductId", "=", product.BookingProductId)
                                    .update({
                                        StartTime: moment(product.StartTime).toDate(),
                                        LastUpdated: zone.getLastUpdate()
                                    });

                                // 6. Updates the google calendar events for the staff.
                                if (product.EventId) {
                                    const eventPatched = await calendar.events.patch({
                                        eventId: product.EventId,
                                        calendarId: "primary",
                                        requestBody: {
                                            start: {
                                                dateTime: product.StartTime,
                                                timeZone: process.env.TIME_ZONE
                                            },
                                            end: {
                                                dateTime: product.EndTime,
                                                timeZone: process.env.TIME_ZONE
                                            }
                                        }
                                    })
                                }
                            }

                            STAFF_ZONE = zone.getStaffZone(bookingDetail[0].DateTime);

                            // * 7. Inform therapist app for add-on request accepted.
                            try {
                                let staffDetail = await knex(STAFF).select("FcmToken").where("StaffId", "=", staffId);
                                if (staffDetail[0].FcmToken) {
                                    const message = {
                                        token: staffDetail[0].FcmToken,
                                        notification: {
                                            title: "Add-ons accepted.",
                                            body: `A new add-on is added to the booking #${bookingId} - ${momentz.tz(bookingDetail[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}.`
                                        },
                                        data: {
                                            BookingId: `${bookingId}`,
                                            DateTime: moment(bookingDetail[0].DateTime).format(DATE_TIME_FORMAT.ISO_FORMAT) + DATE_TIME_FORMAT.Z,
                                            ScreenName: PUSH.SCREEN.BOOKING_DETAIL,
                                            TimeZone: process.env.STAFF_ZONE
                                        }
                                    }
                                    console.log(message)
                                    const therapistApp = InitializeFirebaseTherapist();
                                    const sentNotification = await therapistApp.messaging().send(message);
                                    console.log(sentNotification)
                                }
                            } catch (error) {
                                console.log(error);
                            }

                            // * 8. Inform the user app after 5mins, that some add-ons are accepted, do the payment. Hit another lambda.
                            try {
                                let lambda = new AWS.Lambda();
                                let lambdaName = getLambdaNameByInstance() + "-dispatchNotifier";
                                console.log(lambdaName);
                                lambda.invoke({
                                    FunctionName: lambdaName,
                                    InvocationType: 'Event',
                                    LogType: 'Tail',
                                    Payload: JSON.stringify({
                                        Type: 1,
                                        BookingId: bookingId
                                    })
                                }, function (err, data) {
                                    if (err) {
                                        console.log(err);
                                    } else {
                                        console.log('Lambda hit ' + data.Payload);
                                    }
                                });
                                await holdfor10secs();
                            } catch (error) {
                                console.log(error)
                            }
                            // try {
                            //     if (bookingDetail[0].FcmToken) {
                            //         const message = {
                            //             token: bookingDetail[0].FcmToken,
                            //             notification: {
                            //                 title: "Add-ons accepted, make payment",
                            //                 body: `One or more add-ons for your booking on ${moment(bookingDetail[0].DateTime).utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm)} are accepted, please complete the payment.`
                            //             },
                            //             data: {
                            //                 ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                            //             }
                            //         }
                            //         const userApp = InitializeFirebase();
                            //         const sentNotification = await userApp.messaging().send(message);
                            //         console.log(sentNotification)
                            //     }
                            // } catch (error) {
                            //     console.log(error);
                            // }

                        } else {
                            throw new Error("Error reading add-on data.")
                        }
                        break;
                    }
                    case false: {
                        /**
                         * Booking add-on is rejected.
                         * 1. Mark the add-on request status to Rejected.
                         */
                        let bookingProductAddonIds = [];
                        requestData.forEach(data => {
                            bookingProductAddonIds.push(data.BookingProductAddOnId);
                        });
                        // let exist = await knex(BOOKING_PRODUCT_ADDONS)
                        //     .select("ExtraAddOn", "RequestStatus")
                        //     .whereIn("BookingProductAddOnId", bookingProductAddonIds);
                        // if (!exist) {
                        //     throw new Error("Booking product add-ons does not exist");
                        // }

                        let statusMarked = await knex(BOOKING_PRODUCT_ADDONS)
                            .whereIn("BookingProductAddOnId", bookingProductAddonIds)
                            .update({
                                RequestStatus: ADDON_REQUEST_STATUS.REJECTED,
                                LastUpdated: zone.getLastUpdate()
                            })

                        try {
                            let userFcm = await knex
                                .select(
                                    BOOKINGS + ".BookingId",
                                    BOOKINGS + ".DateTime",
                                    BOOKINGS + ".UserId",
                                    USERS + ".FcmToken"
                                )
                                .from(BOOKINGS)
                                .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                                .where(BOOKINGS + ".BookingId", "=", bookingId);
                            const title = "Add-on request declined";
                            const description = `The requested add-ons has been declined for booking on ${momentz.tz(userFcm[0].DateTime, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.DD_MMM_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}`;
                            await knex(USER_MESSAGES).insert({
                                UserId: userFcm[0].UserId,
                                Title: title,
                                Description: description,
                                ImagePath: null,
                                Date: moment().toDate(),
                                ...zone.getCreateUpdate()
                            });
                            if (userFcm && userFcm[0].FcmToken) {
                                const message = {
                                    token: userFcm[0].FcmToken,
                                    notification: {
                                        title,
                                        body: description
                                    },
                                    data: {
                                        BookingId: `${bookingId}`,
                                        ScreenName: PUSH.SCREEN.BOOKING_DETAIL
                                    }
                                }
                                console.log(message);
                                const userApp = InitializeFirebase();
                                const sentNotifications = await userApp.messaging().send(message);
                                console.log(sentNotifications)
                            }
                        } catch (error) {
                            console.log(error)
                        }

                        break;
                    }
                }
                break;
            }
            default: {
                throw new Error(MESSAGE.SWITCH_DEFAULT_UNHANDLED);
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
                    BookingId: bookingId
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
                    BookingId: bookingId
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
        // knex.destroy().then(() => console.log("disconnected!"));
        await knex.destroy();
    } catch (error) {
        console.log(error);
        if (connected) {
            // knex.destroy().then(() => { });
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.REQUEST_ACCEPTED
        }
    }
}

const holdfor10secs = () => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            console.log("5 mins passed");
            resolve();
        }, 5000);
    })
}

module.exports.migrateBlockHours = async event => {
    let knex, connected = false, response;
    try {
        knex = require('knex')(con);
        connected = true;
        let existingBlockHoursSchedule = await knex(STAFF_SCHEDULE).select("*")
            .whereNotNull("MondayBlockTimeId")
            .orWhereNotNull("TuesdayBlockTimeId")
            .orWhereNotNull("WednesdayBlockTimeId")
            .orWhereNotNull("ThursdayBlockTimeId")
            .orWhereNotNull("FridayBlockTimeId")
            .orWhereNotNull("SaturdayBlockTimeId")
            .orWhereNotNull("SundayBlockTimeId");

        for (let blockInc = 0; blockInc < existingBlockHoursSchedule.length; blockInc++) {
            const schedule = existingBlockHoursSchedule[blockInc];
            const staffId = schedule.StaffId;
            if (schedule.MondayStartDate && schedule.MondayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.MondayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            MondayStartDate: schedule.MondayStartDate,
                            MondayEndDate: schedule.MondayEndDate ? schedule.MondayEndDate : null,
                            MondayStartTime: null,
                            MondayEndTime: null,
                            MondayBlockTimeId: schedule.MondayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            MondayStartDate: schedule.MondayStartDate,
                            MondayEndDate: schedule.MondayEndDate ? schedule.MondayEndDate : null,
                            MondayStartTime: null,
                            MondayEndTime: null,
                            MondayBlockTimeId: schedule.MondayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        MondayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.TuesdayStartDate && schedule.TuesdayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.TuesdayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            TuesdayStartDate: schedule.TuesdayStartDate,
                            TuesdayEndDate: schedule.TuesdayEndDate ? schedule.TuesdayEndDate : null,
                            TuesdayStartTime: null,
                            TuesdayEndTime: null,
                            TuesdayBlockTimeId: schedule.TuesdayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            TuesdayStartDate: schedule.TuesdayStartDate,
                            TuesdayEndDate: schedule.TuesdayEndDate ? schedule.TuesdayEndDate : null,
                            TuesdayStartTime: null,
                            TuesdayEndTime: null,
                            TuesdayBlockTimeId: schedule.TuesdayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        TuesdayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.WednesdayStartDate && schedule.WednesdayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.WednesdayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            WednesdayStartDate: schedule.WednesdayStartDate,
                            WednesdayEndDate: schedule.WednesdayEndDate ? schedule.WednesdayEndDate : null,
                            WednesdayStartTime: null,
                            WednesdayEndTime: null,
                            WednesdayBlockTimeId: schedule.WednesdayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            WednesdayStartDate: schedule.WednesdayStartDate,
                            WednesdayEndDate: schedule.WednesdayEndDate ? schedule.WednesdayEndDate : null,
                            WednesdayStartTime: null,
                            WednesdayEndTime: null,
                            WednesdayBlockTimeId: schedule.WednesdayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        WednesdayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.ThursdayStartDate && schedule.ThursdayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.ThursdayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            ThursdayStartDate: schedule.ThursdayStartDate,
                            ThursdayEndDate: schedule.ThursdayEndDate ? schedule.ThursdayEndDate : null,
                            ThursdayStartTime: null,
                            ThursdayEndTime: null,
                            ThursdayBlockTimeId: schedule.ThursdayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            ThursdayStartDate: schedule.ThursdayStartDate,
                            ThursdayEndDate: schedule.ThursdayEndDate ? schedule.ThursdayEndDate : null,
                            ThursdayStartTime: null,
                            ThursdayEndTime: null,
                            ThursdayBlockTimeId: schedule.ThursdayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        ThursdayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.FridayStartDate && schedule.FridayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.FridayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            FridayStartDate: schedule.FridayStartDate,
                            FridayEndDate: schedule.FridayEndDate ? schedule.FridayEndDate : null,
                            FridayStartTime: null,
                            FridayEndTime: null,
                            FridayBlockTimeId: schedule.FridayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            FridayStartDate: schedule.FridayStartDate,
                            FridayEndDate: schedule.FridayEndDate ? schedule.FridayEndDate : null,
                            FridayStartTime: null,
                            FridayEndTime: null,
                            FridayBlockTimeId: schedule.FridayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        FridayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.SaturdayStartDate && schedule.SaturdayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.SaturdayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            SaturdayStartDate: schedule.SaturdayStartDate,
                            SaturdayEndDate: schedule.SaturdayEndDate ? schedule.SaturdayEndDate : null,
                            SaturdayStartTime: null,
                            SaturdayEndTime: null,
                            SaturdayBlockTimeId: schedule.SaturdayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            SaturdayStartDate: schedule.SaturdayStartDate,
                            SaturdayEndDate: schedule.SaturdayEndDate ? schedule.SaturdayEndDate : null,
                            SaturdayStartTime: null,
                            SaturdayEndTime: null,
                            SaturdayBlockTimeId: schedule.SaturdayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        SaturdayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
            if (schedule.SundayStartDate && schedule.SundayBlockTimeId) {
                let weekRecordExist = await findWeekRecord(
                    knex,
                    schedule.StaffId,
                    moment(schedule.SundayStartDate).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    STAFF_SCHEDULE_TYPE.BLOCK_TIME);
                if (weekRecordExist && weekRecordExist.length) {
                    let weekId = weekRecordExist[0].StaffScheduleId;
                    let blockRecordUpdated = await knex(STAFF_SCHEDULE)
                        .where("StaffScheduleId", "=", weekId)
                        .update({
                            SundayStartDate: schedule.SundayStartDate,
                            SundayEndDate: schedule.SundayEndDate ? schedule.SundayEndDate : null,
                            SundayStartTime: null,
                            SundayEndTime: null,
                            SundayBlockTimeId: schedule.SundayBlockTimeId,
                            LastUpdated: zone.getLastUpdate()
                        })
                } else {
                    let blockWeekRecordCreated = await knex(STAFF_SCHEDULE)
                        .insert({
                            StaffId: staffId,
                            ScheduleType: STAFF_SCHEDULE_TYPE.BLOCK_TIME,
                            SundayStartDate: schedule.SundayStartDate,
                            SundayEndDate: schedule.SundayEndDate ? schedule.SundayEndDate : null,
                            SundayStartTime: null,
                            SundayEndTime: null,
                            SundayBlockTimeId: schedule.SundayBlockTimeId,
                            ...zone.getCreateUpdate()
                        })
                }

                let blockIdRemovedFromGO = await knex(STAFF_SCHEDULE)
                    .where("StaffScheduleId", "=", schedule.StaffScheduleId)
                    .update({
                        SundayBlockTimeId: null,
                        LastUpdated: zone.getLastUpdate()
                    })
            }
        }
        await knex.destroy();
    } catch (error) {
        console.log(error)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 200,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers
        },
        body: JSON.stringify({
            Data: response
        })
    }
}

module.exports.getCalendarStaff = async event => {
    // console.log("heloo")
    try {
        const knex = require("knex")(con);
        
       
        const json = event.body ? getPayloadData(event) : null;
        if(json && json.StaffIds && json.StaffIds.length>0){
            var staffData = await staff(knex,null,null,json.StaffIds)
        }else{
            var staffData = await staff(knex,null,null,null,true);
        }
       
        if (staffData.Error) {
            await knex.destroy();
            throw new Error(staffData.Error);
        }

        // if date is available check for staff schedule
        var selectedDate = "";
        if (json && json.Date && typeof json.Date === "string") {
            // validate date format
            selectedDate = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY, true);
            if (!selectedDate.isValid()) {
                await knex.destroy();
                throw new Error(MESSAGE.INVALID_DATE);
            }
        } else {
            selectedDate = moment().format(DATE_TIME_FORMAT.MMLDDLYYYY);
        }
        

        // Below code fetch the Schedule of staff: GO schedule and block hours.
        // Also sets the bookings object empty
        const promises = [];
        
        // console.log(staffData.data.length)
        // // console.log(staffData.data)
        // console.log('staffData.data.length')
        selectedDate = moment(selectedDate).startOf("day");
        const weekDayNum = moment(selectedDate).day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);

        for (let count = 0; count < staffData.data.length; count++) {
            
            const staff = staffData.data[count];
            // // NOTE: staffDaySchedule: Last bool indicates "includeIC", means should calculate IC as well or not.
            // promises.push(this.staffDaySchedule(knex, staff.StaffId, selectedDate, false).then(schedule => {
            //     staff.Schedule = schedule;
            // }));
            // This code is here to avoid multiple for loop for staff object iteration and sets the empty Boookings attribute.
            staff.Bookings = [];
            staff.Schedule = {
                Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
                DayCode: weekDay.Day,
                IsWorking: false,
                GeneralOffer: {},
                BlockTime: {},
                InstantConfirmation: {},
            };
        }
        let AllScheduleData= await this.getStaffDaySchedule(knex, selectedDate, true)
        // console.log("newData")
        // console.log(AllScheduleData)
        
        if (AllScheduleData.length) {

            for (let count = 0; count < AllScheduleData.length; count++) {
                let schedule = AllScheduleData[count];
                console.log("******************************************")
                console.log("schedule")
                console.log(schedule)
                console.log("******************************************")
                const staffIndex = staffData.data.findIndex(staff => staff.StaffId === schedule.StaffId);
                console.log(staffIndex)
                console.log("******************************************")
                if (staffIndex != -1) {
                    // staffData.data[staffIndex].Schedule={}
                    let dayObject = {
                        Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
                        DayCode: weekDay.Day,
                        IsWorking: false,
                        InstantConfirmation: {},
                        GeneralOffer: {}
                    }
                    console.log(dayObject)
                    // dayObject.Block = [];
                    if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.GENERAL_OFFER) {
                        let scheduleObj=staffData.data[staffIndex].Schedule
                        scheduleObj.IsWorking = true;
                        // scheduleObj.BlockTime = staffData.data[staffIndex].Schedule.BlockTime;
                        // dayObject.InstantConfirmation = staffData.data[staffIndex].Schedule.InstantConfirmation;
                        scheduleObj.GeneralOffer = {
                            DayStart: schedule[weekDay.DayStart],
                            DayEnd: schedule[weekDay.DayEnd],
                            CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                            CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                : null
                        }
                        scheduleObj.DayStart = schedule[weekDay.DayStart];
                        scheduleObj.DayEnd = schedule[weekDay.DayEnd];
                        scheduleObj.CurrentSchedular = moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                        scheduleObj.CurrentScheduleEnd = schedule[weekDay.DateEnd]
                            ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                            : null;
                        console.log(scheduleObj)
                        staffData.data[staffIndex].Schedule = scheduleObj;
                    }
                    if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.BLOCK_TIME) {
                        // let scheduleObj=staffData.data[staffIndex].Schedule
                        // staffData.data[staffIndex].Schedule = dayObject;
                        if (staffData.data[staffIndex].Schedule.BlockTime && Object.keys(staffData.data[staffIndex].Schedule.BlockTime).length != 0) {
                            console.log("already block added")
                            console.log(JSON.stringify(staffData.data[staffIndex].Schedule.BlockTime))
                            let block = {

                                StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                                BlocKTimeId: schedule.BlocKTimeId,
                                Name: schedule.Name,
                                StartTime: schedule.StartTime,
                                EndTime: schedule.EndTime
                            }
                            staffData.data[staffIndex].Schedule.BlockTime.Blocks.push(block)
                            console.log(JSON.stringify(staffData.data[staffIndex].Schedule))
                        } else {
                            console.log("no block added")
                            console.log(JSON.stringify(staffData.data[staffIndex].Schedule.BlockTime))
                            let block = {

                                StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                                BlocKTimeId: schedule.BlocKTimeId,
                                Name: schedule.Name,
                                StartTime: schedule.StartTime,
                                EndTime: schedule.EndTime
                            }
                            let BlockTime = {
                                Blocks: [],
                                CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                                CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                    ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                    : null
                            }
                            staffData.data[staffIndex].Schedule.BlockTime = BlockTime
                            staffData.data[staffIndex].Schedule.BlockTime.Blocks.push(block)
                            console.log(JSON.stringify(staffData.data[staffIndex].Schedule))
                        }

                    }
                    if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION) {
                        let scheduleObj=staffData.data[staffIndex].Schedule
                        scheduleObj.IsWorking = true;
                        scheduleObj.InstantConfirmation = {
                            DayStart: schedule[weekDay.DayStart],
                            DayEnd: schedule[weekDay.DayEnd],
                            CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                            CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                : null
                        }
                        staffData.data[staffIndex].Schedule = scheduleObj;

                    }
                    console.log("staffData.data[staffIndex].Schedule")
                    console.log(staffData.data[staffIndex].Schedule)
                    
                    if(Object.keys(staffData.data[staffIndex].Schedule.GeneralOffer).length==0 && Object.keys(staffData.data[staffIndex].Schedule.InstantConfirmation).length==0){
                        // no schedule
                        
                    }else if(Object.keys(staffData.data[staffIndex].Schedule.GeneralOffer).length==0 && Object.keys(staffData.data[staffIndex].Schedule.InstantConfirmation).length!=0){
                        // take ic
                        console.log("here in ic")
                    // console.log(staffData)
                       let scheduleObj=staffData.data[staffIndex].Schedule
                       console.log(scheduleObj)
                       scheduleObj.IsWorking = true;
                       scheduleObj.DayStart = scheduleObj.InstantConfirmation.DayStart;
                       scheduleObj.DayEnd = scheduleObj.InstantConfirmation.DayEnd;
                       scheduleObj.CurrentSchedular = scheduleObj.InstantConfirmation.CurrentSchedular;
                       scheduleObj.CurrentScheduleEnd = scheduleObj.InstantConfirmation.CurrentScheduleEnd;
                            staffData.data[staffIndex].Schedule = scheduleObj;

                            console.log("end")
                            console.log(weekDay)
                            console.log(scheduleObj)
                    }
                    else if(Object.keys(staffData.data[staffIndex].Schedule.GeneralOffer).length!=0 && Object.keys(staffData.data[staffIndex].Schedule.InstantConfirmation).length==0){
                        // take GO
                        let scheduleObj=staffData.data[staffIndex].Schedule
                        scheduleObj.IsWorking = true;
                       scheduleObj.DayStart = scheduleObj.GeneralOffer.DayStart;
                       scheduleObj.DayEnd = scheduleObj.GeneralOffer.DayEnd;
                       scheduleObj.CurrentSchedular = scheduleObj.GeneralOffer.CurrentSchedular;
                       scheduleObj.CurrentScheduleEnd = scheduleObj.GeneralOffer.CurrentScheduleEnd;
                            staffData.data[staffIndex].Schedule = scheduleObj;
                    }
                    else {
                        // compare
                        //console.log("compare")
                        let scheduleObj = staffData.data[staffIndex].Schedule
                        scheduleObj.IsWorking = true;
                        let bookingDate = moment(scheduleObj.Date,DATE_TIME_FORMAT.DDLMMLYYYY).format(DATE_TIME_FORMAT.MMLDDLYYYY);
                        let generalOffer = scheduleObj.GeneralOffer
                        let instantConfirmation = scheduleObj.InstantConfirmation
                        let finalTimings = getDayTimesGOnIC(bookingDate, generalOffer.DayStart ? generalOffer : {}, instantConfirmation.DayStart ? instantConfirmation : {});
                        // console.log("finalTimings:", finalTimings)
                        scheduleObj.DayStart = finalTimings.DayStart;
                        scheduleObj.DayEnd = finalTimings.DayEnd;
                        if (finalTimings.Blocks.length) {
                            finalTimings.Blocks.forEach(blockDetail => {
                                if (scheduleObj.BlockTime && Object.keys(scheduleObj.BlockTime).length != 0) {
                                    let block = {
        
                                        Name:"Time gap between GO and IC schedule",
                                        StaffBlocKTimeId:blockDetail.StaffBlocKTimeId,
                                        BlocKTimeId: blockDetail.id,
                                        StartTime: moment(blockDetail.startTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm),
                                        EndTime: moment(blockDetail.endTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                                    }
                                    staffData.data[staffIndex].Schedule.BlockTime.Blocks.push(block)
                                } else {
                                    let block = {
                                        Name:"Time gap between GO and IC schedule",
                                        StaffBlocKTimeId:blockDetail.StaffBlocKTimeId,
                                        BlocKTimeId: blockDetail.id,
                                        StartTime: moment(blockDetail.startTime,STAFF_ZONE).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm),
                                        EndTime: moment(blockDetail.endTime,).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
                                    }
                                    let BlockTime = {
                                        Blocks: [],
                                        CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                                        CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                            ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                            : null
                                    }
                                    staffData.data[staffIndex].Schedule.BlockTime = BlockTime
                                    staffData.data[staffIndex].Schedule.BlockTime.Blocks.push(block)
                                }
                            });
                           
                           
                        }







                    }

                }

            }
        }
        console.log("staffData.data")
        console.log(staffData.data)
        // await Promise.all(promises);
        let ignoreBookings = json && json.IgnoreBookings;
        try{

        
        if(!ignoreBookings){
            console.log(staffData.data)
            // Below code fetch the bookings of staff for the date passed in API
            let bookings = await this.getBookingsForDate(knex, selectedDate);
            // console.log("bookings",bookings)
            // console.log(bookings)
            // return false
            bookings.sort((a, b) => a.StartTime - b.StartTime);
            for (let count = 0; count < bookings.length; count++) {
                
               
                const staffIndex = staffData.data.findIndex(staff => staff.StaffId === bookings[count].StaffId);
                console.log("******************************************************")
                console.log(bookings[count])
                console.log(staffIndex)
                 console.log("******************************************************")
                if(staffIndex!=-1){
                    const staff = staffData.data[staffIndex];
                    let bookingAry = staff.Bookings || [];
                    bookingAry = [...bookingAry, bookings[count]];
                    console.log("AUTOMATIC_BLOCKTIME_BUFFER",AUTOMATIC_BLOCKTIME_BUFFER)
                    let blockTime=AUTOMATIC_BLOCKTIME_BUFFER

                    staff.Bookings = bookingAry;
                    let scheduleObj=staff.Schedule
                    let booking=bookings[count]
                    let nextEvent=getNextEvent(scheduleObj.BlockTime,bookings,staff,booking)
                    if(nextEvent && Object.keys(nextEvent).length>0){
                        let bookingEndTime=moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").format(DATE_TIME_FORMAT.HHcmmcss)
                        let availabilityTime= moment(nextEvent.StartTime, DATE_TIME_FORMAT.HHcmmcss).diff(moment(bookingEndTime,DATE_TIME_FORMAT.HHcmmcss), "minute");
                        console.log("bookingEndTime",bookingEndTime)
                        console.log("availabilityTime",availabilityTime)
                        if(availabilityTime>AUTOMATIC_BLOCKTIME_BUFFER){
                            blockTime=AUTOMATIC_BLOCKTIME_BUFFER
                        }else{
                            blockTime=availabilityTime
                        }
                    }
                    console.log("nextEvent",nextEvent)
                    console.log("blockTime",blockTime)
                    if (scheduleObj.BlockTime && Object.keys(scheduleObj.BlockTime).length != 0) {
                        console.log("1")
                        // let blockstart = {

                        //     Name:OTHERS.AUTO_BLOCK,
                        //     StaffBlocKTimeId:'',
                        //     BlocKTimeId: '',
                        //     StartTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).subtract(booking.ReachOutTime+booking.PreparationTime, "minute").format(DATE_TIME_FORMAT.HHcmm),
                        //     EndTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm),
                        //     Type:1
                        // }
                        let blockend = {

                            Name:OTHERS.AUTO_BLOCK,
                            StaffBlocKTimeId:'',
                            BlocKTimeId: '',
                            StartTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").format(DATE_TIME_FORMAT.HHcmm),
                            EndTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").add(blockTime, "minute").format(DATE_TIME_FORMAT.HHcmm),
                            Type:1
                        }
                        // staff.Schedule.BlockTime.Blocks.push(blockstart)
                        staff.Schedule.BlockTime.Blocks.push(blockend)
                    } else {
                        console.log("123")
                        console.log(booking.StartTime)
                        console.log(booking.EndTime)
                        console.log(bookings[count])
                        // let blockstart = {

                        //     Name:OTHERS.AUTO_BLOCK,
                        //     StaffBlocKTimeId:'',
                        //     BlocKTimeId: '',
                        //     StartTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).subtract(booking.ReachOutTime+booking.PreparationTime, "minute").format(DATE_TIME_FORMAT.HHcmm),
                        //     EndTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm),
                        //     Type:1
                        // }
                        let blockend = {

                            Name:OTHERS.AUTO_BLOCK,
                            StaffBlocKTimeId:'',
                            BlocKTimeId: '',
                            StartTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").format(DATE_TIME_FORMAT.HHcmm),
                            EndTime: moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").add(blockTime, "minute").format(DATE_TIME_FORMAT.HHcmm),
                            Type:1
                        }
                        let BlockTime = {
                            Blocks: [],
                            CurrentSchedular: moment(scheduleObj[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                            CurrentScheduleEnd: scheduleObj[weekDay.DateEnd]
                                ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                : null
                        }
                        staff.Schedule.BlockTime = BlockTime
                        // staff.Schedule.BlockTime.Blocks.push(blockstart)
                        staff.Schedule.BlockTime.Blocks.push(blockend)
                    }
                    console.log(staff.Schedule.BlockTime.Blocks)
                }
            }
            
           
        }
    }catch(error){
        console.log(error); 
    }
        
        
        console.log("stop")
        // return false;

         if (json.IsWorking ==1) {
            staffData.data = staffData.data.filter(staff => {
                return ignoreBookings ? staff.Schedule.IsWorking : (staff.Schedule.IsWorking || staff.Bookings.length)
            })
         }
        //  console.log(staffData.data)
        await knex.destroy();
    } 
    catch (error) {
        console.log(error);
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            ...staffData
        })
    }
}


// Below function provides brief data of staffs
// Available filters: 1) therapist preference: (key: therapistPreference)
const getStaffsWithBriefData = async (knex, payload) => {
    let {
        staffId = null,
        staffIds = null,
        therapistPreference,
        OrganisationLocationId
    } = payload;
    try {
        let staffs = await knex
        .pluck(STAFF + ".StaffId")
        .from(STAFF)
        .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF + ".StaffId")
        .where(STAFF + ".Deleted", "=", DELETE_FLAG)
        .modify(queryBuilder => {
            if (therapistPreference != null && therapistPreference != THERAPIST_PREF.EITHER) {
                queryBuilder.andWhere(STAFF + '.Gender', "=", therapistPreference)
            }
            if (OrganisationLocationId != null && OrganisationLocationId) {
                queryBuilder.andWhere(STAFF_ORGANISATION + '.OrganisationLocationId', "=", OrganisationLocationId)
            }
        })
        // Assign the staff related to that organization.
        staffIds = staffs;
        console.log("staffIds : ", staffIds);

        let staffData = await knex
            .select(
                STAFF + ".StaffId",
                STAFF + ".Name",
                STAFF + ".Gender",
                STAFF + ".StaffType",
                STAFF + ".StaffGroupId",
                STAFF_CATEGORY + ".StaffCategoryId",
                STAFF_CATEGORY + ".CategoryId",
                CATEGORIES + ".Name as CategoryName",
                STAFF_PRODUCT + ".StaffProductId",
                STAFF_PRODUCT + ".ProductId",
                STAFF_GROUP + ".Name as GroupName",
            )
            .from(STAFF)
            .leftJoin(STAFF_CATEGORY, STAFF_CATEGORY + ".StaffId", STAFF + ".StaffId")
            .leftJoin(CATEGORIES, CATEGORIES + ".CategoryId", STAFF_CATEGORY + ".CategoryId")
            .leftJoin(STAFF_PRODUCT, STAFF_PRODUCT + ".StaffCategoryId", STAFF_CATEGORY + ".StaffCategoryId")
            .leftJoin(STAFF_GROUP, STAFF_GROUP + ".StaffGroupId", STAFF + ".StaffGroupId")
            .where(STAFF + ".Deleted", "=", DELETE_FLAG)
            .modify(queryBuilder => {
                if (staffId) {
                    queryBuilder.andWhere(STAFF + '.StaffId', "=", staffId)
                }  
                if(staffIds) {
                    // console.log("enter")
                    queryBuilder.whereIn(STAFF + ".StaffId", staffIds)
                }
            })

        var finalData = [];
        for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
            const staff = staffData[staffInc];
            const found = finalData.find(s => s.StaffId === staff.StaffId);
            if (!found) {
                var categories = [];
                if (staff.StaffCategoryId) {
                    categories = [{
                        StaffCategoryId: staff.StaffCategoryId,
                        CategoryId: staff.CategoryId,
                        CategoryName: staff.CategoryName,
                        Products: staff.ProductId ? [staff.ProductId] : [],
                    }];
                }
                let objToPush = {
                    StaffId: staff.StaffId,
                    Name: staff.Name,
                    Gender: staff.Gender,
                    Categories: categories,
                    StaffType: staff.StaffType,
                    CategoryIds: staff.CategoryId ? [staff.CategoryId] : [],
                    StaffGroupId: staff.StaffGroupId,
                    GroupName: staff.GroupName,
                    SkillProducts: staff.ProductId ? [staff.ProductId] : [],
                }
                finalData.push(objToPush);
            } else {
                const categoryFound = found.Categories.find(f => f.CategoryId === staff.CategoryId);
                if (!categoryFound) {
                    found.Categories.push({
                        StaffCategoryId: staff.StaffCategoryId,
                        CategoryId: staff.CategoryId,
                        CategoryName: staff.CategoryName,
                        Products: staff.ProductId ? [staff.ProductId] : [],
                    })
                    found.CategoryIds.push(staff.CategoryId)
                    found.SkillProducts.push(staff.ProductId)
                } else {
                    // Check whether there is productId in staff record
                    if (staff.ProductId) {
                        const productFound = categoryFound.Products.find(p => p === staff.ProductId);
                        if (!productFound) {
                            categoryFound.Products.push(staff.ProductId);
                            found.SkillProducts.push(staff.ProductId)
                        }
                    }

                }
            }
        }

    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }
    return finalData;
}

module.exports.getSelectedDayStaffsSchedule = async (knex, date, therapistFilter) => {

    // Get staffs data
    var staffData = await getStaffsWithBriefData(knex, therapistFilter);
    // console.log("staffData",staffData)
    // return;
    // Processing pre required data
    const selectedDate = moment(date).startOf("day");
    const weekDayNum = moment(selectedDate).day();
    const weekDay = WEEK.find(f => f.Code === weekDayNum);

    for (let count = 0; count < staffData.length; count++) {
        const staff = staffData[count];
        staff.Schedule = {
            IsWorking: false,
            GeneralOffer: {},
            InstantConfirmation: {},
            BlockTime: {},
            DayStart: '',
            DayEnd: '',
        };
    }

    let AllScheduleData = await this.getStaffDaySchedule(knex, selectedDate, true)
    console.log("AllScheduleData",AllScheduleData)
    console.log("AllScheduleDataLength",AllScheduleData.length)
    // return;
    if (AllScheduleData.length) {

        for (let count = 0; count < AllScheduleData.length; count++) {
            let schedule = AllScheduleData[count];

            const staffIndex = staffData.findIndex(staff => staff.StaffId === schedule.StaffId);
            // console.log(staffIndex)

            if (staffIndex != -1) {
                
                let dayObject = {
                    IsWorking: false,
                    DayStart: '',
                    DayEnd: '',
                }
                
                if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.GENERAL_OFFER) {
                    dayObject.IsWorking = true;
                    dayObject.BlockTime = staffData[staffIndex].Schedule.BlockTime;
                    dayObject.GeneralOffer = {
                        DayStart: schedule[weekDay.DayStart],
                        DayEnd: schedule[weekDay.DayEnd],
                        CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                        CurrentScheduleEnd: schedule[weekDay.DateEnd]
                            ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                            : null
                    }
                    dayObject.InstantConfirmation = staffData[staffIndex].Schedule.InstantConfirmation;
                    staffData[staffIndex].Schedule = dayObject;
                }
                if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION) {
                    dayObject.IsWorking = true;
                    dayObject.BlockTime = staffData[staffIndex].Schedule.BlockTime;
                    dayObject.InstantConfirmation = {
                        DayStart: schedule[weekDay.DayStart],
                        DayEnd: schedule[weekDay.DayEnd],
                        CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                        CurrentScheduleEnd: schedule[weekDay.DateEnd]
                            ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                            : null
                    }
                    dayObject.GeneralOffer = staffData[staffIndex].Schedule.GeneralOffer;
                    staffData[staffIndex].Schedule = dayObject;
                }
                if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.BLOCK_TIME) {
                    if (staffData[staffIndex].Schedule.BlockTime && Object.keys(staffData[staffIndex].Schedule.BlockTime).length != 0) {
                        let block = {
                            StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                            BlocKTimeId: schedule.BlocKTimeId,
                            Name: schedule.Name,
                            StartTime: schedule.StartTime,
                            EndTime: schedule.EndTime
                        }
                        staffData[staffIndex].Schedule.BlockTime.Blocks.push(block)
                    } else {
                        let block = {

                            StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                            BlocKTimeId: schedule.BlocKTimeId,
                            Name: schedule.Name,
                            StartTime: schedule.StartTime,
                            EndTime: schedule.EndTime
                        }
                        let BlockTime = {
                            Blocks: [],
                            CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                            CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                : null
                        }
                        staffData[staffIndex].Schedule.BlockTime = BlockTime
                        staffData[staffIndex].Schedule.BlockTime.Blocks.push(block)
                    }

                }
            }
        }
    }

    return staffData;
}

// module.exports.updateStaffSequence = async event => {
//     // console.log("heloo")
//     var responseBody = {};
//     try {
//         const knex = require("knex")(con);
//         const json = event.body ? getPayloadData(event) : null;
//         if (
//             !json ||
//             !json.OldSequence || typeof json.OldSequence!=="number"||
//             !json.NewSequence || typeof json.NewSequence!=="number"
//         ) {
//             throw new Error(MESSAGE.REQ_DATA_ERROR);
//         }
//         await knex(STAFF)
//                     .where("Sequence", "=", json.OldSequence)
//                     .update({
//                         Sequence: -1,
//                     }).modify(qb=>{
//                         console.log(qb.toSQL().toNative());
        
//                     });

                    
//         if(json.OldSequence <json.NewSequence){
//             //decrement all
//             await knex(STAFF).update({
//                 Sequence: knex.raw('?? - 1', ['Sequence'])
//               }).where('Sequence','>',json.OldSequence).andWhere('Sequence','<=',json.NewSequence).modify(qb=>{
//                 console.log(qb.toSQL().toNative());

//             });
          
//         }else{
//             //increment all
//             await knex(STAFF).update({
//                 Sequence: knex.raw('?? + 1', ['Sequence'])
//               }).where('Sequence','>=',json.NewSequence).andWhere('Sequence','<',json.OldSequence).modify(qb=>{
//                 console.log(qb.toSQL().toNative());

//             })
            
//         }
//         console.log(result)
//         await knex(STAFF)
//                     .where("Sequence", "=", -1)
//                     .update({
//                         Sequence: json.NewSequence,
//                     });
        
//         responseBody = {
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
//             Message: MESSAGE.STAFF_FETCH_SUCCESS
//         },
//         body: setPayloadData(event, responseBody)
//     }
    
// }

module.exports.updateStaffSequence = async event => {
    let knex, connected;
    try {
        const json = event.body ? getPayloadData(event) : null;
        console.log(JSON.stringify({
            json
        }, null, 2)); 
        if (
            !json ||
            !json.Order || typeof json.Order !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        let count = 1;
                for (let staffInc = 0; staffInc < json.Order.length; staffInc++) {
                    let staffId = json.Order[staffInc];
                    let countUpdated = await knex(STAFF).where("StaffId", "=", staffId)
                        .update({
                            Sequence: count
                        }).modify(qb => {
                           console.log(qb.toSQL().toNative())
                        })
                    count++;
                }
        
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
            message: MESSAGE.REORDERING_SUCCESS
        }
    }
    
}
,
module.exports.getStaffFilterList = async event => {
    let knex, connected, finalData;
    try {
        const json = event.body ? getPayloadData(event) : null;
        console.log(JSON.stringify({
            json
        }, null, 2));
        // if (
        //     !json ||
        //     !json.isWorking || typeof json.isWorking !== "string"||
        //     !json.selectedDate || typeof json.selectedDate !== "Date"
        // ) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
        knex = require("knex")(con);
        connected = true;
        let staffData = await knex
            .select(
                STAFF + ".StaffId",
                STAFF + ".Name",
                STAFF + ".GoogleEmail",
                STAFF_PRODUCT+".ProductId",
                STAFF_ORGANISATION+".OrganisationLocationId"
            )
            .from(STAFF)
            .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF + ".StaffId")
            .leftJoin(STAFF_GROUP, STAFF_GROUP + ".StaffGroupId", STAFF + ".StaffGroupId")
            .leftJoin(STAFF_PRODUCT, STAFF + ".StaffId", STAFF_PRODUCT + ".StaffId")
            .leftJoin(PRODUCTS, PRODUCTS + ".ProductId", STAFF_PRODUCT + ".ProductId")
            // .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", STAFF + ".StaffId")
            .where(STAFF + ".Deleted", "=", DELETE_FLAG)
            .modify(queryBuilder => {
                if (json && json.groups && json.groups.length > 0) {
                    queryBuilder.whereIn(STAFF + ".StaffGroupId", json.groups);
                }
                if (json && json.skills && json.skills.length > 0) {
                    queryBuilder.whereIn(STAFF_PRODUCT + ".ProductId", json.skills);
                }
                if (json && json.OrganisationLocationId && json.OrganisationLocationId.length > 0) {
                    queryBuilder.whereIn(STAFF_ORGANISATION + ".OrganisationLocationId", json.OrganisationLocationId);
                }
                if (json && json.searchValue && json.searchValue != '') {
                    queryBuilder.where(STAFF + ".Name", "like", `%${json.searchValue}%`)
                }
                console.log(queryBuilder.toSQL().toNative())
            })

        finalData = []
        staffData.forEach(staff => {
            let staffFound = finalData.find(f => f.StaffId === staff.StaffId);
            if (!staffFound) {
                staff.Skills=[staff.ProductId]
                staff.Organizations= staff.OrganisationLocationId ? [staff.OrganisationLocationId] : [];
                // Remove the below key from the object
                delete staff.OrganisationLocationId;
                // Push the final object in dataset
                finalData.push(staff)

            } else {

                if (!(staffFound.Skills.includes(staff.ProductId))) {
                    staffFound.Skills.push(staff.ProductId)
                }

                if (staff.OrganisationLocationId && (!(staffFound.Organizations.includes(staff.OrganisationLocationId)))) {
                    staffFound.Organizations.push(staff.OrganisationLocationId)
                }
            }
        });

      console.log(finalData); 
        var selectedDate = "";
        console.log(json)
        if (json && json.selectedDate) {
            // validate date format
            selectedDate = moment(json.selectedDate, DATE_TIME_FORMAT.MMLDDLYYYY, true);
            if (!selectedDate.isValid()) {
                await knex.destroy();
                throw new Error(MESSAGE.INVALID_DATE);
            }
        } else {
            selectedDate = moment().format(DATE_TIME_FORMAT.MMLDDLYYYY);
        }
        const weekDayNum = moment(selectedDate).day();
        const weekDay = WEEK.find(f => f.Code === weekDayNum);
        let AllScheduleData= await this.getStaffDaySchedule(knex, selectedDate, true)
        const promises = [];
        if (json && json.isWorking && json.isWorking == 1) {
            for (let count = 0; count < finalData.length; count++) {

                const staff = finalData[count];
                // NOTE: staffDaySchedule: Last bool indicates "includeIC", means should calculate IC as well or not.
                // promises.push(this.staffDaySchedule(knex, staff.StaffId, selectedDate, false).then(schedule => {
                //     staff.Schedule = schedule;
                // }));
                // This code is here to avoid multiple for loop for staff object iteration and sets the empty Boookings attribute.
                staff.Bookings = [];
                staff.Schedule = {
                    Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
                    DayCode: weekDay.Day,
                    IsWorking: false,
                    GeneralOffer: {},
                    BlockTime: {},
                    InstantConfirmation: {},
    };
            }
            if (AllScheduleData.length) {

                for (let count = 0; count < AllScheduleData.length; count++) {
                    let schedule = AllScheduleData[count];
                    console.log("staffData")
                    // console.log(staffData)
                    const staffIndex = finalData.findIndex(staff => staff.StaffId === schedule.StaffId);
                    // console.log(staffIndex)
    
                    if (staffIndex != -1) {
                        // staffData.data[staffIndex].Schedule={}
                        
                        // let dayObject = {
                        //     Date: selectedDate.format(DATE_TIME_FORMAT.DDLMMLYYYY),
                        //     DayCode: weekDay.Day,
                        //     IsWorking: false
                        // }
                        // console.log(staffData.data[staffIndex].Schedule.BlocKTime)
                        // dayObject.Block = [];
                        if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.GENERAL_OFFER) {
                            let scheduleObj=finalData[staffIndex].Schedule
                            scheduleObj.IsWorking = true;
                            // scheduleObj.BlockTime = finalData[staffIndex].Schedule.BlockTime;
                            scheduleObj.GeneralOffer = {
                                DayStart: schedule[weekDay.DayStart],
                                DayEnd: schedule[weekDay.DayEnd],
                                CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                                CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                    ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                    : null
                            }
                            scheduleObj.DayStart = schedule[weekDay.DayStart];
                            scheduleObj.DayEnd = schedule[weekDay.DayEnd];
                            scheduleObj.CurrentSchedular = moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY);
                            scheduleObj.CurrentScheduleEnd = schedule[weekDay.DateEnd]
                                ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                : null;
                            console.log(scheduleObj)
                            finalData[staffIndex].Schedule = scheduleObj;
                        }
                        if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.BLOCK_TIME) {
                            if (finalData[staffIndex].Schedule.BlockTime && Object.keys(finalData[staffIndex].Schedule.BlockTime).length != 0) {
                                let block = {
    
                                    StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                                    BlocKTimeId: schedule.BlocKTimeId,
                                    Name: schedule.Name,
                                    StartTime: schedule.StartTime,
                                    EndTime: schedule.EndTime
                                }
                                finalData[staffIndex].Schedule.BlockTime.Blocks.push(block)
                            } else {
                                let block = {
    
                                    StaffBlocKTimeId: schedule.StaffBlocKTimeId,
                                    BlocKTimeId: schedule.BlocKTimeId,
                                    Name: schedule.Name,
                                    StartTime: schedule.StartTime,
                                    EndTime: schedule.EndTime
                                }
                                let BlockTime = {
                                    Blocks: [],
                                    CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                                    CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                        ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                        : null
                                }
                                finalData[staffIndex].Schedule.BlockTime = BlockTime
                                finalData[staffIndex].Schedule.BlockTime.Blocks.push(block)
                            }
    
                        }
                        if (schedule.ScheduleType == STAFF_SCHEDULE_TYPE.INSTANT_CONFIRMATION) {
                            let scheduleObj=finalData[staffIndex].Schedule
                            scheduleObj.IsWorking = true;
                            scheduleObj.InstantConfirmation = {
                                DayStart: schedule[weekDay.DayStart],
                                DayEnd: schedule[weekDay.DayEnd],
                                CurrentSchedular: moment(schedule[weekDay.DateStart]).format(DATE_TIME_FORMAT.DDLMMLYYYY),
                                CurrentScheduleEnd: schedule[weekDay.DateEnd]
                                    ? moment(schedule[weekDay.DateEnd]).format(DATE_TIME_FORMAT.DDLMMLYYYY)
                                    : null
                            }
                            finalData[staffIndex].Schedule = scheduleObj;
    
                        }
    
    
                    }
    
                }
            }
            // console.log(staffData.data)
            // await Promise.all(promises);

            let ignoreBookings = json && json.IgnoreBookings;
            if(!ignoreBookings){
                // Below code fetch the bookings of staff for the date passed in API
                let bookings = await this.getBookingsForDate(knex, selectedDate);
                for (let count = 0; count < bookings.length; count++) {
                    const staffIndex = finalData.findIndex(staff => staff.StaffId === bookings[count].StaffId);
                    // console.log(staffIndex)

                    if (staffIndex != -1) {
                        const staff = finalData[staffIndex];
                        let bookingAry = staff.Bookings || [];
                        bookingAry = [...bookingAry, bookings[count]];
                        staff.Bookings = bookingAry;
                    }
                }
            }

            finalData = finalData.filter(staff => {
                return ignoreBookings ? staff.Schedule.IsWorking : (staff.Schedule.IsWorking || staff.Bookings.length)
            })

        }
        console.log(finalData);
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
            Message: MESSAGE.STAFF_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
           data: [...finalData]
        })
    }

}
const getBookingsForDate1 = async (knex, date) => {
    let BOOKINGS_TO_CONSIDER = [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.ON_GOING,
        BOOKING_STATUS.LAPSED,
        BOOKING_STATUS.INCONCLUSIVE
    ]
    let bookings = await knex
        .select(
            BOOKING_PRODUCTS + ".BookingProductId",
            BOOKING_PRODUCTS + ".StaffId",
            BOOKING_PRODUCTS + ".StartTime",
            BOOKING_PRODUCTS + ".Duration as productDuration",
            BOOKING_PRODUCTS + ".PreparationTime",
            BOOKING_PRODUCTS + ".EventId",
            BOOKING_PRODUCTS + ".Product",
            BOOKING_PRODUCTS + ".Amount as ProductAmount",
            BOOKING_PRODUCT_ADDONS + ".Duration as addOnDuration",
            BOOKINGS + ".BookingId",
            BOOKINGS + ".ReachOutTime",
            BOOKINGS + ".PaymentStatus",
            BOOKINGS + '.Street',
            BOOKINGS + '.Floor',
            BOOKINGS + '.City',
            BOOKINGS + '.Zip',
            BOOKINGS + '.HouseNumber',
            BOOKINGS + '.BookingProvider',
            STAFF + ".GoogleEmail as StaffMail",
            USERS + ".Name as UserName",
            USERS + ".UserId",
            USERS + ".Gender",
            USERS + ".Contact",
        )
        .from(BOOKING_PRODUCTS)
        .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
        .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
        .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
        .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
        .where(BOOKINGS + ".DateTime", ">=", moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day').toDate())
        .andWhere(BOOKINGS + ".DateTime", "<=", moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).endOf('day').toDate())
        .whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER);
    let finalData = []
    bookings.forEach(booking => {
        let bookingData = {
            ...booking
        }
        bookingData.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === booking.PaymentStatus).name;
        bookingData.AddressString = (booking.Floor ? booking.Floor + ", " : "") + booking.Street + (booking.HouseNumber ? booking.HouseNumber + ", " : "")+(booking.City ? ", " + booking.City : "") + (booking.Zip ? ", " + booking.Zip : "");
        finalData.push(bookingData);
    });
    return finalData;
}

module.exports.getBookingsForDate = async (knex, date, ignoreDraft = false) => {
    console.log("date",date)
    let BOOKINGS_TO_CONSIDER = [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.ON_GOING,
        BOOKING_STATUS.LAPSED,
        BOOKING_STATUS.INCONCLUSIVE,
    ]

    if (!ignoreDraft) {
        BOOKINGS_TO_CONSIDER.push(BOOKING_STATUS.DRAFT)
    }

    let bookingsData = await knex
        .select(
            BOOKINGS + '.BookingId',
            BOOKINGS + '.BookingProvider',
            BOOKINGS + '.UserId as BookingUser',
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
            BOOKINGS + '.Status',
            BOOKINGS + '.Created',
            BOOKINGS + '.ReachOutTime',
            BOOKINGS + '.OrganisationLocationId',
            BOOKINGS + '.BookedBy',
            BOOKINGS + '.FullAddress',
            BOOKING_PRODUCTS + '.BookingProductId',
            BOOKING_PRODUCTS + '.ProductId',
            BOOKING_PRODUCTS + '.Product',
            BOOKING_PRODUCTS + '.UserId',
            BOOKING_PRODUCTS + '.GuestId',
            BOOKING_PRODUCTS + '.StaffVacConflict',
            BOOKING_PRODUCTS + '.StaffId',
            BOOKING_PRODUCTS + '.StartTime',
            BOOKING_PRODUCTS + '.Status as BookingProductStatus',
            BOOKING_PRODUCTS + '.DispatchType',
            BOOKING_PRODUCTS + '.Amount',
            BOOKING_PRODUCTS + '.CategoryId',
            BOOKING_PRODUCTS + '.Duration',
            BOOKING_PRODUCTS + '.PreparationTime',
            BOOKING_PRODUCTS + '.DiscountedAmount',
            STAFF + ".Name as ProductStaffName",
            STAFF + ".GoogleEmail",
            USERS + '.Archive',
            USERS + '.Contact',
            USERS + '.Name',
            USERS + '.Email',
            USERS + '.ImagePath',
            USERS + '.Gender',
            USERS + '.CSNotes',
            USERS + '.TherapistNotes',
            BOOKING_EXTRA + ".AdminNotes",
            CATEGORIES + ".ColorCode",
            ORGANISATION_LOCATION + '.Name as OrganisationName'
        )
        .from(BOOKINGS)
        .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
        .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
        .leftJoin(CATEGORIES, BOOKING_PRODUCTS + '.CategoryId', CATEGORIES + '.CategoryId')
        .leftJoin(STAFF, STAFF + '.StaffId', BOOKING_PRODUCTS + '.StaffId')
        // .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
        .leftJoin(BOOKING_EXTRA, BOOKING_EXTRA + ".BookingId", BOOKINGS + ".BookingId")
         .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', BOOKINGS + '.OrganisationLocationId')
        .where(BOOKINGS + ".DateTime", ">=", momentz.tz(date, DATE_TIME_FORMAT.MMLDDLYYYY,process.env.STAFF_ZONE).startOf('day').utc().toDate())
        .andWhere(BOOKINGS + ".DateTime", "<=", momentz.tz(date, DATE_TIME_FORMAT.MMLDDLYYYY,process.env.STAFF_ZONE).endOf('day').utc().toDate())
        .whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER)
        
        .modify(function (queryBuilder) {
            // console.log(queryBuilder.toSQL().toNative())
            
        });
    // console.log("bookingsData",bookingsData)
    // console.log("bookingsData")
    // console.log(moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day').utc().toDate())
    // console.log( moment(date, DATE_TIME_FORMAT.MMLDDLYYYY).endOf('day').utc().toDate())
    // console.log(bookingsData)
    // return
    let finalData = [];
    for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
        const booking = bookingsData[bookingInc];
        // console.log("booking")
        // console.log(booking)
        booking.StatusName = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name;
        booking.AddressString=(booking.Floor ? booking.Floor + ", " : "") + (booking.Street ? booking.Street + ", " : "") + (booking.HouseNumber ? booking.HouseNumber + ", " : "")+ (booking.City ? booking.City + ", ": "") + (booking.Zip ? booking.Zip +", ": "");
        if (booking.ImagePath) {
            booking.ImageURL = process.env.BUCKET_URL + booking.ImagePath;
        }
        // console.log(booking)
        const found = finalData.find(book => book.BookingId === booking.BookingId);

        
        // // console.log(found)
        if (!found) {
            console.log("if")
            
            let objToPush = {
                BookingId: booking.BookingId,
                BookingProvider: booking.BookingProvider,
                UserId: booking.BookingUser,
                UserName: booking.Name,
                Email:booking.Email,
                Street: booking.Street,
                HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                Floor: booking.Floor ? booking.Floor : null,
                City: booking.City ? booking.City : null,
                Zip: booking.Zip ? booking.Zip : null,
                Elevator: booking.Elevator,
                Amount: booking.Amount,
                BookingProductId:booking.BookingProductId,
                StartTime:booking.StartTime,
                ReachOutTime:booking.ReachOutTime,
                productDuration: booking.Duration,
                DateTime: booking.DateTime,
                Status: booking.Status,
                StatusName: booking.StatusName,
                PaymentStatus: booking.PaymentStatus,
                PredecessorBookingId: booking.PredecessorBookingId,
                SuccessorBookingId: booking.SuccessorBookingId,
                LastUpdated: booking.LastUpdated,
                Gender:booking.Gender,
                Contact:booking.Contact,
                StaffId:booking.StaffId,
                BookingProductStatus: booking.BookingProductStatus,
                ProductId: booking.ProductId,
                Product: booking.Product,
                Name: booking.Product,
                StaffVacConflict: booking.StaffVacConflict,
                StaffName: booking.ProductStaffName,
                GoogleEmail: booking.GoogleEmail,
                DispatchType: booking.DispatchType,
                Myself: booking.UserId ? true : false,
                // Guest: booking.GuestId ? guestName[0].Name : "",
                // Status: booking.BookingProductStatus,
                StatusName: (booking.BookingProductStatus)?BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name:null,
                AddOns: [],
                // Duration: booking.Duration,
                // StartTime: booking.StartTime,
                // Amount: booking.Amount,
                CategoryId: booking.CategoryId,
                PreparationTime: booking.PreparationTime,
                Guests: [],
                // Products: [],
                
                Created: booking.Created,
                TimeZone: {
                    Zone: process.env.STAFF_ZONE
                },
                Archive: booking.Archive?booking.Archive:0,
                AddressString: booking.AddressString,
                ImageURL: booking.ImageURL,
                PaidPrice: booking.PaidPrice,
                ColorCode: booking.ColorCode,
                DiscountedAmount:booking.DiscountedAmount,
                AdminNotes:booking.AdminNotes,
                OrganisationLocationId:booking.OrganisationLocationId,
                BookedBy:booking.BookedBy,
                FullAddress:booking.FullAddress,
                CSNotes:booking.CSNotes,
                TherapistNotes:booking.TherapistNotes,
                OrganisationName:booking.OrganisationName,
            }
            if (objToPush.BookingProvider === parseInt(process.env.BOOKING_PROVIDER_CMS)) {
                objToPush.BookingProviderName = "CMS";
            } else {
                objToPush.BookingProviderName = "App";
            }
            let addOns = await knex(BOOKING_PRODUCT_ADDONS).select(
                BOOKING_PRODUCT_ADDONS + '.BookingProductAddOnId',
                BOOKING_PRODUCT_ADDONS + '.BookingProductId',
                BOOKING_PRODUCT_ADDONS + '.AddOnId',
                BOOKING_PRODUCT_ADDONS + '.AddOn',
                BOOKING_PRODUCT_ADDONS + '.Duration',
                BOOKING_PRODUCT_ADDONS + '.Amount',
            ).where("BookingProductId", "=", booking.BookingProductId);
            objToPush.AddOns=[...addOns]

            // objToPush.Guests.push(guestName[0].Name);
            objToPush.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).name;
            objToPush.PaymentStatusColor = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).color;
            let guestName;
            if (booking.GuestId) {
                guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                objToPush.Guests.push(guestName[0].Name);
            }
            if (booking.UserId) {
                objToPush.Myself = true;
            }

            let specialRequest = await knex
        .select(
            BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
            BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
        )
        .from(BOOKING_SPECIAL_REQUEST)
        .where("BookingId", "=", booking.BookingId);
        objToPush.SpecialRequest=specialRequest

        let totalUserBookings = await knex(BOOKINGS).count("BookingId")
            .whereIn("Status", BOOKINGS_TO_CONSIDER)
            .andWhere("UserId", "=", booking.UserId)
            objToPush.TotalUserBookings = totalUserBookings[0]['count(`BookingId`)']
            // let prodPushObj
            // try {
            //     // console.log(9027)
            //     // console.log(booking)
            //     prodPushObj = {
            //         BookingProductId: booking.BookingProductId,
            //         ProductId: booking.ProductId,
            //         Product: booking.Product,
            //         Name: booking.Product,
            //         StaffVacConflict: booking.StaffVacConflict,
            //         StaffId: booking.StaffId,
            //         StaffName: booking.ProductStaffName,
            //         GoogleEmail: booking.GoogleEmail,
            //         DispatchType: booking.DispatchType,
            //         Myself: booking.UserId ? true : false,
            //         Guest: booking.GuestId ? guestName[0].Name : "",
            //         Status: booking.BookingProductStatus,
            //         StatusName: BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name,
            //         AddOns: [],
            //         Duration:booking.Duration,
            //         StartTime:booking.StartTime,
            //         Amount:booking.Amount,
            //         CategoryId:booking.CategoryId,
            //         PreparationTime:booking.PreparationTime

            //     }
            //     let addOns = await knex(BOOKING_PRODUCT_ADDONS).select("*").where("BookingProductId", "=", booking.BookingProductId);
            //     prodPushObj.AddOns=[...addOns]
            // } catch (error) {
            //     console.log(error)
            // }
            let duration= await calculateProductDuration( objToPush.AddOns, booking.StartTime, booking.Duration);
            // objToPush.StartTime = moment( objToPush.StartTime,DATE_TIME_FORMAT.HHcmmcss).format(DATE_TIME_FORMAT.HHcmmcss);
            objToPush.ProdTotalDuration=duration
            objToPush.ProductCount=1
            finalData.push(objToPush);

            // if (apiClient === API_CLIENT.CMS) {
            //     /**
            //      * Check if booking products are auto dispatch or manual dispatch
            //      */
            //     if (booking.Status === BOOKING_STATUS.CONFIRMED) {
            //         let dispatches = await knex
            //             .select(
            //                 BOOKING_PRODUCTS + ".DispatchId",
            //                 BOOKING_PRODUCT_DISPATCH + ".StaffId",
            //                 BOOKING_PRODUCT_DISPATCH + ".Status"
            //             )
            //             .from(BOOKING_PRODUCTS)
            //             .leftJoin(BOOKING_PRODUCT_DISPATCH, BOOKING_PRODUCT_DISPATCH + ".DispatchId", BOOKING_PRODUCTS + ".DispatchId")
            //             .where(BOOKING_PRODUCTS + ".BookingProductId", "=", booking.BookingProductId);
            //             // console.log(prodPushObj)
            //         objToPush.DispatchList = []
            //         dispatches.forEach(dispatch => {
            //             if (dispatch.StaffId && dispatch.DispatchId) {
            //                 prodPushObj.DispatchList.push({
            //                     ...dispatch
            //                 })
            //             }
            //         });
            //     }
            // }
            // objToPush.Products.push(prodPushObj);
            
            // console.log("if final")
            // console.log(finalData)
        } else {
            // let prod1EndTime=moment(found.EndTime,DATE_TIME_FORMAT.HHcmmcss).format(DATE_TIME_FORMAT.HHcmmcss)
            // let prod2StartTime=moment(booking.StartTime).format(DATE_TIME_FORMAT.HHcmmcss)
            // console.log(prod1EndTime)
            // console.log(prod2StartTime)
            // console.log(found.StaffId)
            // console.log(booking.StaffId)
            // console.log(booking) 
            // let addOns = await knex(BOOKING_PRODUCT_ADDONS).select(
            //     BOOKING_PRODUCT_ADDONS + '.BookingProductAddOnId',
            //     BOOKING_PRODUCT_ADDONS + '.BookingProductId',
            //     BOOKING_PRODUCT_ADDONS + '.AddOnId',
            //     BOOKING_PRODUCT_ADDONS + '.AddOn',
            //     BOOKING_PRODUCT_ADDONS + '.Duration',
            //     BOOKING_PRODUCT_ADDONS + '.Amount',
            // ).where("BookingProductId", "=", booking.BookingProductId);
            // if( (moment(prod1EndTime,DATE_TIME_FORMAT.HHcmmcss)).isSame(moment(prod2StartTime,DATE_TIME_FORMAT.HHcmmcss)) && found.StaffId==booking.StaffId){
            //     console.log("i")
            //     let endtime= await calculateProductDuration( [...addOns], found.StartTime, booking.Duration);
            //     found.EndTime=endtime
            //     found.ProductCount=found.ProductCount+1
            //     console.log("i")
            // }else{
                console.log("else")
                let objToPush = {
                    BookingId: booking.BookingId,
                    BookingProvider: booking.BookingProvider,
                    UserId: booking.BookingUser,
                    UserName: booking.Name,
                    Email:booking.Email,
                    Street: booking.Street,
                    HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                    Floor: booking.Floor ? booking.Floor : null,
                    City: booking.City ? booking.City : null,
                    Zip: booking.Zip ? booking.Zip : null,
                    Elevator: booking.Elevator,
                    Amount: booking.Amount,
                    BookingProductId:booking.BookingProductId,
                    StartTime:booking.StartTime,
                    ReachOutTime:booking.ReachOutTime,
                    productDuration: booking.Duration,
                    DateTime: booking.DateTime,
                    Status: booking.Status,
                    StatusName: booking.StatusName,
                    PaymentStatus: booking.PaymentStatus,
                    PredecessorBookingId: booking.PredecessorBookingId,
                    SuccessorBookingId: booking.SuccessorBookingId,
                    LastUpdated: booking.LastUpdated,
                    Gender:booking.Gender,
                    Contact:booking.Contact,
                    StaffId:booking.StaffId,
                    BookingProductStatus: booking.BookingProductStatus,
                    ProductId: booking.ProductId,
                    Product: booking.Product,
                    Name: booking.Product,
                    StaffVacConflict: booking.StaffVacConflict,
                    StaffName: booking.ProductStaffName,
                    GoogleEmail: booking.GoogleEmail,
                    DispatchType: booking.DispatchType,
                    Myself: booking.UserId ? true : false,
                    // Guest: booking.GuestId ? guestName[0].Name : "",
                    // Status: booking.BookingProductStatus,
                    StatusName: (booking.BookingProductStatus)?BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name:null,
                    AddOns: [],
                    // Duration: booking.Duration,
                    // StartTime: booking.StartTime,
                    // Amount: booking.Amount,
                    CategoryId: booking.CategoryId,
                    PreparationTime: booking.PreparationTime,
                    Guests: [],
                    // Products: [],
                    
                    Created: booking.Created,
                    TimeZone: {
                        Zone: process.env.STAFF_ZONE
                    },
                    Archive: booking.Archive?booking.Archive:0,
                    ColorCode:booking.ColorCode,
                    AddressString: booking.AddressString,
                ImageURL: booking.ImageURL,
                PaidPrice: booking.PaidPrice,
                AddressString: booking.AddressString,
                DiscountedAmount:booking.DiscountedAmount,
                AdminNotes:booking.AdminNotes,
                OrganisationLocationId:booking.OrganisationLocationId,
                BookedBy:booking.BookedBy,
                FullAddress:booking.FullAddress,
                CSNotes:booking.CSNotes,
                TherapistNotes:booking.TherapistNotes,
                OrganisationName:booking.OrganisationName,
                }
                if (objToPush.BookingProvider === parseInt(process.env.BOOKING_PROVIDER_CMS)) {
                    objToPush.BookingProviderName = "CMS";
                } else {
                    objToPush.BookingProviderName = "App";
                }
                let addOns = await knex(BOOKING_PRODUCT_ADDONS).select(
                    BOOKING_PRODUCT_ADDONS + '.BookingProductAddOnId',
                    BOOKING_PRODUCT_ADDONS + '.BookingProductId',
                    BOOKING_PRODUCT_ADDONS + '.AddOnId',
                    BOOKING_PRODUCT_ADDONS + '.AddOn',
                    BOOKING_PRODUCT_ADDONS + '.Duration',
                    BOOKING_PRODUCT_ADDONS + '.Amount',
                ).where("BookingProductId", "=", booking.BookingProductId);
                objToPush.AddOns=[...addOns]
    
                // objToPush.Guests.push(guestName[0].Name);
                objToPush.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).name;
                objToPush.PaymentStatusColor = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).color;
                let guestName;
                if (booking.GuestId) {
                    guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                    objToPush.Guests.push(guestName[0].Name);
                }
                if (booking.UserId) {
                    objToPush.Myself = true;
                }

            let duration = await calculateProductDuration(objToPush.AddOns, booking.StartTime, booking.Duration);
            // objToPush.StartTime = moment(objToPush.StartTime, DATE_TIME_FORMAT.HHcmmcss).format(DATE_TIME_FORMAT.HHcmmcss);
            objToPush.ProdTotalDuration=duration
            objToPush.ProductCount = 1
            let specialRequest = await knex
                .select(
                    BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                    BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                )
                .from(BOOKING_SPECIAL_REQUEST)
                .where("BookingId", "=", booking.BookingId);
            objToPush.SpecialRequest = specialRequest

            let totalUserBookings = await knex(BOOKINGS).count("BookingId")
            .whereIn("Status", BOOKINGS_TO_CONSIDER)
            .andWhere("UserId", "=", booking.UserId)
            objToPush.TotalUserBookings = totalUserBookings[0]['count(`BookingId`)']
            finalData.push(objToPush);
            }
            
           
        // }
        
    }
    // console.log(finalData)
    // console.log("finalData")
    return finalData;
}

module.exports.getTreatment = async event => {
    let knex, connected = false, response = null;
    let finalProduct = [];CategoryArray=[]
    try {
        knex = require("knex")(con);
        let productData = await knex
            .select(
                PRODUCTS + '.ProductId',
                PRODUCTS + '.CategoryId',
                PRODUCTS + '.PreparationTime',
                PRODUCTS + '.ImagePath',
                PRODUCTS + '.ProductExtraMaxSelect',
                PRODUCTS + '.OrganisationLocationId',
                CATEGORIES + '.Name as Category',
                CATEGORIES + '.ColorCode',
                PRODUCT_TRANSLATIONS + '.LanguageId',
                PRODUCT_TRANSLATIONS + '.Name',
                PRODUCT_TRANSLATIONS + '.Description',
                PRODUCT_DURATIONS + '.Duration',
                PRODUCT_DURATIONS + '.Amount',
                PRODUCT_DURATIONS + '.ProductDurationId'
            )
            .from(PRODUCTS)
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', PRODUCTS + '.CategoryId')
            .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .where(PRODUCTS + '.Deleted', '=', DELETED)
            .orderBy(PRODUCTS + ".CurOrder", "asc")
            .modify((queryBuilder) => {
                queryBuilder.andWhere(PRODUCT_TRANSLATIONS + '.LanguageId', '=', LANGUAGE)
            })

        
        productData.forEach(product => {
            let found = finalProduct.find(pr => pr.ProductId === product.ProductId);
            if (!found) {
                let imageURL = null;
                if (product.ImagePath) {
                    imageURL = process.env.BUCKET_URL + product.ImagePath;
                }
                finalProduct.push({
                    ProductId: product.ProductId,
                    PreparationTime: product.PreparationTime,
                    CategoryId: product.CategoryId,
                    Category: product.Category,
                    ColorCode: product.ColorCode,
                    ImagePath: product.ImagePath,
                    ImageURL: imageURL,
                    ProductName:product.Name,
                    OrganisationLocationId:product.OrganisationLocationId,
                    Durations: [
                        {
                            Duration: product.Duration,
                            Amount: product.Amount,
                            ProductDurationId:product.ProductDurationId
                        }
                    ]
                })
            } else {
                let foundDuration = found.Durations.find(f => f.Duration === product.Duration);
                if (!foundDuration) {
                    found.Durations.push({
                        Duration: product.Duration,
                        Amount: product.Amount,
                        ProductDurationId:product.ProductDurationId
                    })
                }
            }
        });
        
       
        for (let count = 0; count < finalProduct.length; count++) {
            let durations = finalProduct[count].Durations.sort((a, b) => {
                return a.Duration - b.Duration
            })
            finalProduct[count].Durations = durations;
            finalProduct[count].AddOns= await addOnDetail(knex,finalProduct[count].CategoryId)
        }
        
        finalProduct.forEach(product => {
            let foundCategory = CategoryArray.find(f => f.CategoryId === product.CategoryId);
            console.log(foundCategory)
            if(!foundCategory){
                let obj={"CategoryId":product.CategoryId,
                        "CategoryName":product.Category,
                        "ColorCode": product.ColorCode,
                    "Products":[],
                "Organisations":[]}
                    obj.Products.push(product)
                    if(product.OrganisationLocationId){
                        obj.Organisations.push(product.OrganisationLocationId)
                    }
                    CategoryArray.push(obj)
            }else{
                console.log(foundCategory)
                foundCategory.Products.push(product)
                if(product.OrganisationLocationId){
                   
                    foundCategory.Organisations.push(product.OrganisationLocationId)
                    foundCategory.Organisations = [...new Set(foundCategory.Organisations)];
                }
                
            }
        })
  
        await knex.destroy();
    } catch (error) {
        await knex.destroy();
        console.log(error);
        return {
            Error: error.message
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: [...CategoryArray]
        })
    }
}

// Fetch the Details of given booking Id
const addOnDetail = async (knex, categoryId) => {

    try {
        var AddOns = await knex
            .select(
                ADDON_CATEGORY + '.AddOnId',
                ADDONS + '.Name',
                ADDONS + '.Duration',
                ADDONS + '.Amount',
                ADDONS + '.ImagePath',
            )
            .from(ADDON_CATEGORY)
            .leftJoin(ADDONS, ADDONS + '.AddOnId', ADDON_CATEGORY + '.AddOnId')
            .where(ADDON_CATEGORY + '.CategoryId', '=', categoryId)
            .andWhere(ADDONS + '.Deleted', '=', DELETE_FLAG)

        
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        };
    }

    return AddOns;
}
const calculateProductDuration=async(addOns,startTime,Duration)=>{
    
    startTime = momentz.tz(startTime,'UTC').format(DATE_TIME_FORMAT.HHcmmcss);
    let duration=Duration;
    addOns.forEach(addOn => {
        duration=duration+addOn.Duration
    });
    // endTime = moment(startTime,DATE_TIME_FORMAT.HHcmmcss).add(duration, "minute");
    endTime = momentz.tz(startTime,DATE_TIME_FORMAT.HHcmmcss,'UTC').add(duration, "minute").tz(process.env.STAFF_ZONE);
    
    return duration
}

module.exports.getUnfilledBookings = async event => {
    /**
     * Used by CMS on calendar view
     * returns all the unfilled bookings currently in the system with CONFIRMED status
     */
    let knex, connected = false, response;
    let finalData = [];
    try{
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
        knex = require("knex")(con);
        connected = true
        let BOOKINGS_TO_CONSIDER = [
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE,
            BOOKING_STATUS.DRAFT
        ]
        let bookingsData = await knex
        .select(
            BOOKINGS + '.BookingId',
            BOOKINGS + '.BookingProvider',
            BOOKINGS + '.UserId as BookingUser',
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
            BOOKINGS + '.Status',
            BOOKINGS + '.Created',
            BOOKINGS + '.ReachOutTime',
            BOOKINGS + '.OrganisationLocationId',
            BOOKINGS + '.BookedBy',
            BOOKINGS + '.FullAddress',
            BOOKING_PRODUCTS + '.BookingProductId',
            BOOKING_PRODUCTS + '.ProductId',
            BOOKING_PRODUCTS + '.Product',
            BOOKING_PRODUCTS + '.UserId',
            BOOKING_PRODUCTS + '.GuestId',
            BOOKING_PRODUCTS + '.StaffVacConflict',
            BOOKING_PRODUCTS + '.StaffId',
            BOOKING_PRODUCTS + '.StartTime',
            BOOKING_PRODUCTS + '.Status as BookingProductStatus',
            BOOKING_PRODUCTS + '.DispatchType',
            BOOKING_PRODUCTS + '.Amount',
            BOOKING_PRODUCTS + '.CategoryId',
            BOOKING_PRODUCTS + '.Duration',
            BOOKING_PRODUCTS + '.PreparationTime',
            BOOKING_PRODUCTS + '.DiscountedAmount',
            STAFF + ".Name as ProductStaffName",
            STAFF + ".GoogleEmail",
            USERS + '.Archive',
            USERS + '.Contact',
            USERS + '.Name',
            USERS + '.Email',
            USERS + '.ImagePath',
            USERS + '.Gender',
            // BOOKING_EXTRA + ".AdminNotes",
            CATEGORIES + ".ColorCode",
            ORGANISATION_LOCATION + '.Name as OrganisationName'
        )
        .from(BOOKINGS)
        .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
        .innerJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
        .leftJoin(CATEGORIES, BOOKING_PRODUCTS + '.CategoryId', CATEGORIES + '.CategoryId')
        .leftJoin(STAFF, STAFF + '.StaffId', BOOKING_PRODUCTS + '.StaffId')
         .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', BOOKINGS + '.OrganisationLocationId')
        .where(BOOKINGS + ".DateTime", ">=", momentz.tz(moment(), DATE_TIME_FORMAT.MMLDDLYYYY,process.env.STAFF_ZONE).startOf('day').utc().toDate())
       
       
        
        .modify(function (queryBuilder) {
            queryBuilder.whereNull(BOOKING_PRODUCTS + ".StaffId")
            queryBuilder.andWhere(BOOKINGS + ".Status", BOOKING_STATUS.CONFIRMED)
            console.log(queryBuilder.toSQL().toNative())
            
        });
   
    
    for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
        const booking = bookingsData[bookingInc];
        // console.log("booking")
        // console.log(booking)
        booking.StatusName = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name;
        booking.AddressString=(booking.Floor ? booking.Floor + ", " : "") + (booking.Street ? booking.Street + ", " : "") + (booking.HouseNumber ? booking.HouseNumber + ", " : "")+ (booking.City ? booking.City + ", ": "") + (booking.Zip ? booking.Zip +", ": "");
        if (booking.ImagePath) {
            booking.ImageURL = process.env.BUCKET_URL + booking.ImagePath;
        }
        console.log(booking)
        const found = finalData.find(book => book.BookingId === booking.BookingId);

        
        // // console.log(found)
        if (!found) {
            console.log("if")
            
            let objToPush = {
                BookingId: booking.BookingId,
                BookingProvider: booking.BookingProvider,
                UserId: booking.BookingUser,
                UserName: booking.Name,
                Email:booking.Email,
                Street: booking.Street,
                HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                Floor: booking.Floor ? booking.Floor : null,
                City: booking.City ? booking.City : null,
                Zip: booking.Zip ? booking.Zip : null,
                Elevator: booking.Elevator,
                Amount: booking.Amount,
                BookingProductId:booking.BookingProductId,
                StartTime:booking.StartTime,
                ReachOutTime:booking.ReachOutTime,
                productDuration: booking.Duration,
                DateTime: booking.DateTime,
                Status: booking.Status,
                StatusName: booking.StatusName,
                PaymentStatus: booking.PaymentStatus,
                PredecessorBookingId: booking.PredecessorBookingId,
                SuccessorBookingId: booking.SuccessorBookingId,
                LastUpdated: booking.LastUpdated,
                Gender:booking.Gender,
                Contact:booking.Contact,
                StaffId:booking.StaffId,
                BookingProductStatus: booking.BookingProductStatus,
                ProductId: booking.ProductId,
                Product: booking.Product,
                Name: booking.Product,
                StaffVacConflict: booking.StaffVacConflict,
                StaffName: booking.ProductStaffName,
                GoogleEmail: booking.GoogleEmail,
                DispatchType: booking.DispatchType,
                Myself: booking.UserId ? true : false,
                // Guest: booking.GuestId ? guestName[0].Name : "",
                // Status: booking.BookingProductStatus,
                StatusName: (booking.BookingProductStatus)?BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name:null,
                AddOns: [],
                // Duration: booking.Duration,
                // StartTime: booking.StartTime,
                // Amount: booking.Amount,
                CategoryId: booking.CategoryId,
                PreparationTime: booking.PreparationTime,
                Guests: [],
                // Products: [],
                
                Created: booking.Created,
                TimeZone: {
                    Zone: process.env.STAFF_ZONE
                },
                Archive: booking.Archive?booking.Archive:0,
                AddressString: booking.AddressString,
                ImageURL: booking.ImageURL,
                PaidPrice: booking.PaidPrice,
                ColorCode: booking.ColorCode,
                DiscountedAmount:booking.DiscountedAmount,
                AdminNotes:booking.AdminNotes,
                OrganisationLocationId:booking.OrganisationLocationId,
                BookedBy:booking.BookedBy,
                FullAddress:booking.FullAddress,
                  OrganisationName:booking.OrganisationName,
            }
            if (objToPush.BookingProvider === parseInt(process.env.BOOKING_PROVIDER_CMS)) {
                objToPush.BookingProviderName = "CMS";
            } else {
                objToPush.BookingProviderName = "App";
            }
            let addOns = await knex(BOOKING_PRODUCT_ADDONS).select(
                BOOKING_PRODUCT_ADDONS + '.BookingProductAddOnId',
                BOOKING_PRODUCT_ADDONS + '.BookingProductId',
                BOOKING_PRODUCT_ADDONS + '.AddOnId',
                BOOKING_PRODUCT_ADDONS + '.AddOn',
                BOOKING_PRODUCT_ADDONS + '.Duration',
                BOOKING_PRODUCT_ADDONS + '.Amount',
            ).where("BookingProductId", "=", booking.BookingProductId);
            objToPush.AddOns=[...addOns]

            // objToPush.Guests.push(guestName[0].Name);
            objToPush.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).name;
            objToPush.PaymentStatusColor = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).color;
            let guestName;
            if (booking.GuestId) {
                guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                objToPush.Guests.push(guestName[0].Name);
            }
            if (booking.UserId) {
                objToPush.Myself = true;
            }

            let specialRequest = await knex
        .select(
            BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
            BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
        )
        .from(BOOKING_SPECIAL_REQUEST)
        .where("BookingId", "=", booking.BookingId);
        objToPush.SpecialRequest=specialRequest

        let totalUserBookings = await knex(BOOKINGS).count("BookingId")
            .whereIn("Status", BOOKINGS_TO_CONSIDER)
            .andWhere("UserId", "=", booking.UserId)
            objToPush.TotalUserBookings = totalUserBookings[0]['count(`BookingId`)']
            
            let duration= await calculateProductDuration( objToPush.AddOns, booking.StartTime, booking.Duration);
            // objToPush.StartTime = moment( objToPush.StartTime,DATE_TIME_FORMAT.HHcmmcss).format(DATE_TIME_FORMAT.HHcmmcss);
            objToPush.ProdTotalDuration=duration
            objToPush.ProductCount=1
            finalData.push(objToPush);

            
        } else {
           
                console.log("else")
                let objToPush = {
                    BookingId: booking.BookingId,
                    BookingProvider: booking.BookingProvider,
                    UserId: booking.BookingUser,
                    UserName: booking.Name,
                    Email:booking.Email,
                    Street: booking.Street,
                    HouseNumber: booking.HouseNumber ? booking.HouseNumber : null,
                    Floor: booking.Floor ? booking.Floor : null,
                    City: booking.City ? booking.City : null,
                    Zip: booking.Zip ? booking.Zip : null,
                    Elevator: booking.Elevator,
                    Amount: booking.Amount,
                    BookingProductId:booking.BookingProductId,
                    StartTime:booking.StartTime,
                    ReachOutTime:booking.ReachOutTime,
                    productDuration: booking.Duration,
                    DateTime: booking.DateTime,
                    Status: booking.Status,
                    StatusName: booking.StatusName,
                    PaymentStatus: booking.PaymentStatus,
                    PredecessorBookingId: booking.PredecessorBookingId,
                    SuccessorBookingId: booking.SuccessorBookingId,
                    LastUpdated: booking.LastUpdated,
                    Gender:booking.Gender,
                    Contact:booking.Contact,
                    StaffId:booking.StaffId,
                    BookingProductStatus: booking.BookingProductStatus,
                    ProductId: booking.ProductId,
                    Product: booking.Product,
                    Name: booking.Product,
                    StaffVacConflict: booking.StaffVacConflict,
                    StaffName: booking.ProductStaffName,
                    GoogleEmail: booking.GoogleEmail,
                    DispatchType: booking.DispatchType,
                    Myself: booking.UserId ? true : false,
                    // Guest: booking.GuestId ? guestName[0].Name : "",
                    // Status: booking.BookingProductStatus,
                    StatusName: (booking.BookingProductStatus)?BOOKING_PRODUCT_STATUS_DESC.find(f => f.code === booking.BookingProductStatus).name:null,
                    AddOns: [],
                    // Duration: booking.Duration,
                    // StartTime: booking.StartTime,
                    // Amount: booking.Amount,
                    CategoryId: booking.CategoryId,
                    PreparationTime: booking.PreparationTime,
                    Guests: [],
                    // Products: [],
                    
                    Created: booking.Created,
                    TimeZone: {
                        Zone: process.env.STAFF_ZONE
                    },
                    Archive: booking.Archive?booking.Archive:0,
                    ColorCode:booking.ColorCode,
                    AddressString: booking.AddressString,
                ImageURL: booking.ImageURL,
                PaidPrice: booking.PaidPrice,
                AddressString: booking.AddressString,
                DiscountedAmount:booking.DiscountedAmount,
                AdminNotes:booking.AdminNotes,
                OrganisationLocationId:booking.OrganisationLocationId,
                BookedBy:booking.BookedBy,
                FullAddress:booking.FullAddress,
                OrganisationName:booking.OrganisationName,
                }
                if (objToPush.BookingProvider === parseInt(process.env.BOOKING_PROVIDER_CMS)) {
                    objToPush.BookingProviderName = "CMS";
                } else {
                    objToPush.BookingProviderName = "App";
                }
                let addOns = await knex(BOOKING_PRODUCT_ADDONS).select(
                    BOOKING_PRODUCT_ADDONS + '.BookingProductAddOnId',
                    BOOKING_PRODUCT_ADDONS + '.BookingProductId',
                    BOOKING_PRODUCT_ADDONS + '.AddOnId',
                    BOOKING_PRODUCT_ADDONS + '.AddOn',
                    BOOKING_PRODUCT_ADDONS + '.Duration',
                    BOOKING_PRODUCT_ADDONS + '.Amount',
                ).where("BookingProductId", "=", booking.BookingProductId);
                objToPush.AddOns=[...addOns]
    
                // objToPush.Guests.push(guestName[0].Name);
                objToPush.PaymentStatusName = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).name;
                objToPush.PaymentStatusColor = BOOKING_PAYMENT_STATUS_DESC.find(f => f.code === objToPush.PaymentStatus).color;
                let guestName;
                if (booking.GuestId) {
                    guestName = await knex(GUESTS).select("Name").where("GuestId", "=", booking.GuestId);
                    objToPush.Guests.push(guestName[0].Name);
                }
                if (booking.UserId) {
                    objToPush.Myself = true;
                }

            let duration = await calculateProductDuration(objToPush.AddOns, booking.StartTime, booking.Duration);
            // objToPush.StartTime = moment(objToPush.StartTime, DATE_TIME_FORMAT.HHcmmcss).format(DATE_TIME_FORMAT.HHcmmcss);
            objToPush.ProdTotalDuration=duration
            objToPush.ProductCount = 1
            let specialRequest = await knex
                .select(
                    BOOKING_SPECIAL_REQUEST + ".BookingSpecialRequestId",
                    BOOKING_SPECIAL_REQUEST + ".SpecialRequestId",
                )
                .from(BOOKING_SPECIAL_REQUEST)
                .where("BookingId", "=", booking.BookingId);
            objToPush.SpecialRequest = specialRequest

            let totalUserBookings = await knex(BOOKINGS).count("BookingId")
            .whereIn("Status", BOOKINGS_TO_CONSIDER)
            .andWhere("UserId", "=", booking.UserId)
            objToPush.TotalUserBookings = totalUserBookings[0]['count(`BookingId`)']
            finalData.push(objToPush);
            }
            
           
        // }
        
    }
   await knex.destroy();
   
    }
    catch (error) {
        console.log(error);
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
            Data: finalData
        })
    }
       
        
       
        
}

module.exports.updateBookingProductStaffTime = async event => {
    /**
     * Used by CMS on calendar view: updates booking product staff Id and timing on drag and drop from Calendar
     * returns success or error.
     */
    let knex, connected = false, response;
    let finalData = [];
    try{
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
            !json.BookingId ||
            !json.BookingProductId
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }


        knex = require("knex")(con);
        connected = true
        let updateObj={}
        if(json.StaffId){
            updateObj.StaffId=json.StaffId
        }
        if(json.StartTime){
            updateObj.StartTime=json.StartTime
        }
        const staffExist = await knex
            .select(
                STAFF + ".Name",
                STAFF + ".GoogleEmail"
            )
            .from(STAFF)
            .where(STAFF + ".StaffId", "=", json.StaffId)
            .andWhere(STAFF + ".Deleted", "=", DELETE_FLAG);
        if (staffExist.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: MESSAGE.STAFF_NOT_FOUND,
                }
            }
        }else{
            const bookingExist = await knex
            .select(
                BOOKINGS + ".BookingId"
            )
            .from(BOOKINGS)
            .where(BOOKINGS + ".BookingId", "=", json.BookingId)
            .where(BOOKINGS + ".Status", "=", BOOKING_STATUS.CONFIRMED)
            if (bookingExist.length === 0) {
                return {
                    statusCode: 404,
                    headers: {
                        ...Headers,
                        message: MESSAGE.INVALID_BOOKING,
                    }
                }
            }   
            let updated = await knex(BOOKING_PRODUCTS)
                .where("BookingProductId", "=", json.BookingProductId)
                .update({
                    ...updateObj,
                    LastUpdated: zone.getLastUpdate()
                });
            console.log("Treatment Updated: ", updated);

            const products = await knex
            .select(
               '*'
            )
            .from(BOOKING_PRODUCTS)
            .where(BOOKING_PRODUCTS + ".BookingId", "=", json.BookingId)

                // if(json.StartTime)
            const startTimes = products.map(product => moment(product.StartTime));
            console.log(startTimes)
         const bookingStartTime = moment.min(startTimes);
         console.log(bookingStartTime)
         let updatedBooking = await knex(BOOKINGS)
         .where("BookingId", "=", json.BookingId)
         .update({
            DateTime:moment(bookingStartTime).toDate(),
            LastUpdated: zone.getLastUpdate()
        });
         if(json.StaffId){
            //send push notification to staff
            console.log("send push")
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
                    BookingId: json.BookingId,
                    BookingProductId:json.BookingProductId

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

         }
        }

await knex.destroy()
        
  
   
    }
    catch (error) {
        console.log(error);
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
            Data: finalData
        })
    }
       
        
       
        
}

module.exports.updateCoconOrgForStaff = async event => {
    let knex, connected = false, response;
    knex = require("knex")(con);
    try {
       
            // Get staff ids according to pagination
           let Staff = await knex
                .select(STAFF + ".StaffId")
                .from(STAFF)
                .where(STAFF + ".Deleted", "=", DELETE_FLAG)
                
          
        
        let insertArray=[]
        for (let staffInc = 0; staffInc < Staff.length; staffInc++) {
            const staff = Staff[staffInc];
            const obj = {
                    StaffId:staff.StaffId,
                    OrganisationLocationId:-1,
                ...zone.getCreateUpdate()
            }
            insertArray.push(obj)

        }   
        console.log(insertArray)
        var insertedStaff = await knex(STAFF_ORGANISATION).insert(insertArray)
            if (insertedStaff.length <= 0) {
                throw new Error(MESSAGE.STAFF_SAVE_FAILED);
            }    
        console.log("insertedStaff : ", insertedStaff)
            await knex.destroy()
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: "Successfully, Updated Staff Organization bindings."
        },
        body: setPayloadData(event, {
            Data: insertedStaff
        })
    }
}

module.exports.deleteStaffAccount = async event => {
    /**
     * API Objective: set a staff as Archive (in case of delete account from therapist App)
     * Working:
     * 1. Update  info to null ( as per apple policy).
     * 2. Update CoconEditTime to current time for given user in DB.
     * 3. Unsubscribe staff from firebase and also delete user from firebase realtime database and its chat also
     * 4. Delete staff image from S3 bucket
     * 5. Delete staff stripe details and delete staff's stripe account
     */


    let knex, connected = false, response;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
       
        const StaffId = json.StaffId;
        knex = require("knex")(con);
        connected = true;
        var staffData = await staff(knex, json.StaffId);
        // console.log(userExist)
        if (staffData.length === 0) {
            throw new Error(MESSAGE.SWW_TRY_AGAIN);
        }
        let updateObj = {
    
            "GoogleId":null,
            "FacebookId":null,
            "AppleIdentifier":null,
            "Gender":null,
            "Contact":null,
            "ImagePath":null,
            "Address":null,
            "GoogleEmail":'',
            "ImagePath":null,
            "FcmToken":null,
            "City":null,
            "Zip":null,
            "DeviceId":null,
            "Platform":null,
            "Deleted":1,
        }
        
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            let staffDeleted = await knex(STAFF)
                .where("StaffId", "=", StaffId)
                .update(updateObj);
            
            //delete user from firebase database and its chat too
            
            const admin = InitializeFirebase();
            var db = admin.database();
            var therRef = db.ref(process.env.FIREBASE_BASE_REF+THER_REF); 
            var therMsgref = db.ref(process.env.FIREBASE_BASE_REF+THER_MESSAGE_REF); 
            
            therRef.child(staffData[0].StaffId).remove();
            therMsgref.child(staffData[0].StaffId).remove();

            //delete image from S3

            if (staffData[0].ImagePath) {
                var aws = require('aws-sdk');
                const s3 = new aws.S3({
                    accessKeyId: process.env.BUCKET_ACCESS_KEY,
                    secretAccessKey: process.env.BUCKET_SECRET,
                    region: process.env.BUCKET_REGION
                });
                const params = {
                    Bucket: process.env.BUCKET_NAME,
                    Key: staffData[0].ImagePath
                };

                var deleted = await s3.deleteObject(params).promise();
                if (!deleted) {
                    throw new Error(MESSAGE.IMAGE_NOT_DELETED);
                }
                
            }
            
            //delete fcm subscription 
            if (staffData[0].FcmToken) {
                // const admin = InitializeFirebase();
                let unsubUser = await admin.messaging().unsubscribeFromTopic(staffData[0].FcmToken, process.env.BROADCAST_TOPIC);
                let unsubscribeAll = await admin.messaging().unsubscribeFromTopic(staffData[0].FcmToken, process.env.BROADCAST_TOPIC_ALL);
            }
            
            
        }
        let upcomingBookings = await this.getStaffUpcomingBookings(knex, StaffId);
        console.log(upcomingBookings)
        // return false;
        if (upcomingBookings) {
            let bookingToMakeUnfilled = []
            upcomingBookings.forEach(booking => {
                bookingToMakeUnfilled.push(booking.BookingProductId);
            });
            console.log(bookingToMakeUnfilled)
        // return false;
            var updated = await knex(BOOKING_PRODUCTS)
            .whereIn("BookingProductId",bookingToMakeUnfilled)
            .update({
                "StaffId":null
            })
            await this.sendDeleteEmail(knex, upcomingBookings,staffData[0]);
        }

        
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
            message: MESSAGE.STAFF_DELETE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: []
        })
    }
}

module.exports.saveStaffAccountDeleteFeedback = async event => {
    let knex, connected = false, mailOptions;
    try {
        
        let mailOptions={}
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.IssueType !== "number" ||
            json.IssueType < 0||
            json.IssueType > 6 ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

       
         knex = require("knex")(con);
        
        connected = true;
        
        let insertedData = await knex(STAFF_ACCOUNT_DELETE_FEEDBACK)
            .insert({
                IssueType: json.IssueType,
                StaffId: json.StaffId,
                Feedback:(json.Feedback)?json.Feedback:"",
                ...zone.getCreateUpdate()
            })

        const feedbackId = insertedData[0];
        // let staff = await knex(STAFF).select("Name").where("StaffId", "=", json.StaffId);
        // let feedback = await knex(STAFF_ACCOUNT_DELETE_FEEDBACK).select("*").where("StaffAccountDeleteFeedbackId", "=", feedbackId);
    //     console.log(staff)
    //     console.log(feedback)
    //     let issueType=""
       
    //     switch (feedback[0].IssueType) {
    //         case 0:
    //             issueType = DELETE_REASON.SERVICE_ANYMORE;
    //             break;
    //         case 1:
    //             issueType = DELETE_REASON.HOW_IT_WORKS;
    //             break;
    //         case 2:
    //             issueType = DELETE_REASON.TECHNICAL_ISSUE;
    //             break;
    //         case 3:
    //             issueType = DELETE_REASON.FINDING_HARD;
    //             break;
    //         case 4:
    //             issueType = DELETE_REASON.ISSUE_WITH_SERVICE;
    //             break;
    //         case 5:
    //             issueType = DELETE_REASON.OTHER;
    //             break;

    //     }
    //     mailHtml=`<div style="background-color: #ffffff;width:100%;padding:1%;font-family: Raleway, sans-serif;color: #3a312d;letter-spacing: 1px">
    //     <div style="width: 100%;">
    //         <div style="width: 100%;text-align: center;">
    //             <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
    //         </div>
    //         <div style="width: 100%;text-align: center;">
    //             <h1 style="color: #514844;font-weight: 500;letter-spacing: 0.5px;font-size: 30px;margin-top: 5px;">COCON</h1>
    //         </div>
    //         <div>
    //             <h4 style="font-weight: 500;font-size: 17px;">Hi there,</h4>
    //             <h4 style="font-weight: 500;font-size: 17px;">This is to inform you that one of the COCON app users ${user[0].Name} has deleted their account.</h4>
    //         </div>
    //         <div>
    //             <h4 style="font-weight: 500;font-size: 17px;">Deletion time: ${momentz.tz(feedback[0].Created, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}</h4>
    //         </div>
    //         <div>
    //             <h4 style="font-weight: 500;font-size: 17px;">Reason: ${issueType}</h4>`;

    //             if(feedback[0].Feedback && feedback[0].Feedback!=''){
    //                 mailHtml+=`<h4 style="font-weight: 500;font-size: 17px;">User Feedback: ${feedback[0].Feedback}</h4>`;
    //             }
                
    //         mailHtml+=`</div>
            
    //         <div style="margin-top: 10px;font-family: Raleway, sans-serif">
                
    //             <h4 style="font-weight: 500;font-size: 18px;font-family: spectral;">COCON Company BV</h4>
                
    //         </div>
    //     </div>
    // </div>`
        
    // let notifyAdmins = await knex(ADMIN_NOTIFICATION_CONTACT).select("*").where("Deleted", "=", 0).andWhere("Type","=",0);
    // let toMails=[]
    // for (let adInc = 0; adInc < notifyAdmins.length; adInc++) {
    //     toMails.push(notifyAdmins[adInc].Value);
    // }
    // if(toMails.length){
    //     mailOptions = {
    //         from: process.env.EMAIL,
    //         to: toMails,
    //         subject: "User deleted",
    //         html: mailHtml
    //     }
    //     // let accessToken = await oAuth2Client.getAccessToken();
    //     // console.log(accessToken);
    //     let smtpTransport = nodemailer.createTransport({
    //         service: "gmail",
    //         auth: {
    //             type: "OAuth2",
    //             user: process.env.EMAIL,
    //             clientId: process.env.CLIENT_ID,
    //             clientSecret: process.env.CLIENT_SECRET,
    //             refreshToken: process.env.REFRESH_TOKEN,
    //             // accessToken: accessToken.token,
    //         }
    //     })
    //     let sendingMail = await sendMail(smtpTransport, mailOptions);
    //     console.log(sendingMail);

    // }

      
        await knex.destroy();
    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.FEEDBACK_SAVED_SUCCESS
        },
        body: setPayloadData(event,{
            Data: {}
        })
    }
}

module.exports.getStaffUpcomingBookings = async (knex, staffId, ignoreDraft = false) => {
    
    let BOOKINGS_TO_CONSIDER = [
        BOOKING_STATUS.CONFIRMED
    ]

    if (!ignoreDraft) {
        BOOKINGS_TO_CONSIDER.push(BOOKING_STATUS.DRAFT)
    }

    let bookingsData = await knex
        .select(
            BOOKINGS + '.BookingId',
            BOOKING_PRODUCTS + '.BookingProductId',
            BOOKING_PRODUCTS + '.ProductId',
            BOOKING_PRODUCTS + '.Product',
            BOOKING_PRODUCTS + '.StartTime',
        )
        .from(BOOKING_PRODUCTS)
        .leftJoin(BOOKINGS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
        .where(BOOKING_PRODUCTS + ".StartTime", ">=", momentz.tz(new Date(), DATE_TIME_FORMAT.MMLDDLYYYY,process.env.STAFF_ZONE).startOf('day').utc().toDate())
        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
        .whereIn(BOOKINGS + ".Status", BOOKINGS_TO_CONSIDER)
        
        .modify(function (queryBuilder) {
            console.log(queryBuilder.toSQL().toNative())
            
        });
    let finalData = [];
    for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
        const booking = bookingsData[bookingInc];
        
    }

    return bookingsData;
}
module.exports.sendDeleteEmail = async (knex, upcomingBookings,staffData) => {
    try{
        let html=`<div style="
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
                "> COCON </h1>
    </div>
    <div>
      <h4 style="font-weight: 500; font-size: 17px">Dear Admin,</h4>
      <h4 style="font-weight: 500; font-size: 17px">One of the therapist working with you, ${staffData.Name}(${staffData.GoogleEmail}) has opted to delete their Cocon Pro account. 
      <br />
      Please take note that all future treatments assigned to this therapist will now be listed as "Unfilled" and will open to assignment to any other therapist.</h4
      <p>`
      if(upcomingBookings.length){
        html+=`
        <span style="font-size:17px;font-weight: 500">The treatments that will be impacted are listed below:</span>
      </p>
      <p>
      <ol style="font-size:17px;font-weight: 500">`
for (let bookingInc = 0; bookingInc < upcomingBookings.length; bookingInc++) {
    const booking = upcomingBookings[bookingInc];
    html += `
    <li>
    ${booking.Product}(Booking Id: ${booking.BookingId})-${momentz.tz(booking.StartTime, 'ddd, MMM DD YYYY, HH:mm z', true, process.env.STAFF_ZONE)}
  </li>
            `;
}
html += ` </ol>
</p>`
      }
  html+=`   
<p>
        <span style="font-size:17px;font-weight: 500">To view all bookings made through CMS  kindly click <a href="${process.env.CMS_URL}#/booking">here</a>.</span>
      </p>
<p>
<span style="font-size:17px;font-weight: 500>Warm regards,</span>
<span style="font-size:17px;font-weight: 500>COCON Team</span>
</p>

</div>
</div>
</div>`
let notifyAdmins = await knex(ADMIN_NOTIFICATION_CONTACT).select("*").where("Deleted", "=", 0).andWhere("Type","=",0);
let toMails=[]
for (let adInc = 0; adInc < notifyAdmins.length; adInc++) {
    toMails.push(notifyAdmins[adInc].Value);
}
if(toMails.length){
    mailOptions = {
        from: process.env.EMAIL,
        to: toMails,
        subject: "Therapist account deleted",
        html: html
    }
    // let accessToken = await oAuth2Client.getAccessToken();
    // console.log(accessToken);
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
    console.log(sendingMail);

}

    }catch(error){
        console.log(error)
    }
}

module.exports.getStaffAvailability = async event => {
    let knex, connected = false, response;
    try {
        knex = require('knex')(con);
        const json = event.body ? getPayloadData(event) : null;
        console.log(json)
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StartDate || typeof json.StartDate !== "string" ||
            !json.EndDate || typeof json.EndDate !== "string"||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        // validate date format
        let startValid = moment(json.StartDate, DATE_TIME_FORMAT.DDLMMLYYYY, true);
        let endValid = moment(json.EndDate, DATE_TIME_FORMAT.DDLMMLYYYY, true);
        if (!startValid.isValid() || !endValid.isValid()) {
            throw new Error(MESSAGE.INVALID_DATE);
        }
        let currentDate = moment(json.StartDate, DATE_TIME_FORMAT.DDLMMLYYYY, true);
        const dates = [];
        let weekArray = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
        scheduleType=[0,1]
        while (currentDate.isSameOrBefore(moment(json.EndDate, DATE_TIME_FORMAT.DDLMMLYYYY, true))) {

            dates.push(currentDate.toDate());
            let selectedDate = moment(currentDate).startOf("day");
            let weekDayNum = moment(selectedDate).day();
            weekArray[weekDayNum].push(currentDate.toDate())
            currentDate = moment(currentDate, DATE_TIME_FORMAT.DDLMMLYYYY, true).add(1, "day");
        }

        console.log(weekArray);
        
        // find direct entry for the dates
        let directSchedule = await knex(STAFF_SCHEDULE)
            .select(
                "*"
            )
            .where("StaffId", "=", json.StaffId)
            .whereIn("ScheduleType", scheduleType )
            .andWhere(function () {

                this.whereIn(`MondayStartDate`, weekArray[1])
                    .orWhereIn(`TuesdayStartDate`, weekArray[2])
                    .orWhereIn(`WednesdayStartDate`, weekArray[3])
                    .orWhereIn(`ThursdayStartDate`, weekArray[4])
                    .orWhereIn(`FridayStartDate`, weekArray[5])
                    .orWhereIn(`SaturdayStartDate`, weekArray[6])
                    .orWhereIn(`SundayStartDate`, weekArray[0])
            })
            console.log(directSchedule)


            let specificDate = await knex(STAFF_SCHEDULE)
            .select(
                 "*"
            )
            .where("StaffId", "=", json.StaffId)
            .whereIn("ScheduleType", scheduleType )
            // .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
            // .andWhere(`${weekDay.DateEnd}`, ">=", selectedDate.toDate())
            // .andWhere("ScheduleType", "=", scheduleType)
            .andWhere(function () {

                for (let weekArrayCount = 0; weekArrayCount < weekArray[0].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`SundayStartDate`,"<",weekArray[0][weekArrayCount])
                        this.andWhere(`SundayEndDate`,">=",weekArray[0][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[1].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`MondayStartDate`,"<",weekArray[1][weekArrayCount])
                        this.andWhere(`MondayEndDate`,">=",weekArray[1][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[2].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`TuesdayStartDate`,"<",weekArray[2][weekArrayCount])
                        this.andWhere(`TuesdayEndDate`,">=",weekArray[2][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[3].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`WednesdayStartDate`,"<",weekArray[3][weekArrayCount])
                        this.andWhere(`WednesdayEndDate`,">=",weekArray[3][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[4].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`ThursdayStartDate`,"<",weekArray[4][weekArrayCount])
                        this.andWhere(`ThursdayEndDate`,">=",weekArray[4][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[5].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`FridayStartDate`,"<",weekArray[5][weekArrayCount])
                        this.andWhere(`FridayEndDate`,">=",weekArray[5][weekArrayCount])
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[6].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.where(`SaturdayStartDate`,"<",weekArray[6][weekArrayCount])
                        this.andWhere(`SaturdayEndDate`,">=",weekArray[6][weekArrayCount])
                    })
                }
            })
            .modify(queryBuilder => {
                console.log(queryBuilder.toSQL().toNative())
            });
        
            console.log(specificDate)
        
            let ongoingDate = await knex(STAFF_SCHEDULE)
            .select(
                 "*"
            )
            .where("StaffId", "=", json.StaffId)
            .whereIn("ScheduleType", scheduleType )
            // .andWhere(`${weekDay.DateStart}`, "<", selectedDate.toDate())
            // .andWhere(`${weekDay.DateEnd}`, ">=", selectedDate.toDate())
            // .andWhere("ScheduleType", "=", scheduleType)
            .andWhere(function () {

                for (let weekArrayCount = 0; weekArrayCount < weekArray[0].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`SundayEndDate`)
                        this.andWhere(`SundayStartDate`,"<",weekArray[0][weekArrayCount])
                        
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[1].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`MondayEndDate`)
                        this.andWhere(`MondayStartDate`,"<",weekArray[1][weekArrayCount])
                        
                       
                        
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[2].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`TuesdayEndDate`)
                        this.andWhere(`TuesdayStartDate`,"<",weekArray[2][weekArrayCount])
                        
                       
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[3].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`WednesdayEndDate`)
                        this.andWhere(`WednesdayStartDate`,"<",weekArray[3][weekArrayCount])
                        
                        
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[4].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`ThursdayEndDate`)
                        this.andWhere(`ThursdayStartDate`,"<",weekArray[4][weekArrayCount])
                        
                       
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[5].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`FridayEndDate`)
                        this.andWhere(`FridayStartDate`,"<",weekArray[5][weekArrayCount])
                        
                        
                    })
                }
                for (let weekArrayCount = 0; weekArrayCount < weekArray[6].length; weekArrayCount++) {
                    
                    this.orWhere(function(){
                        this.whereNull(`SaturdayEndDate`)
                        this.andWhere(`SaturdayStartDate`,"<",weekArray[6][weekArrayCount])
                        
                        
                    })
                }
            })
            .modify(queryBuilder => {
                console.log(queryBuilder.toSQL().toNative())
            });
        
            console.log(ongoingDate)
            
           
        let allScheduleData=directSchedule.concat(specificDate, ongoingDate);
        console.log("allScheduleData",allScheduleData)
        // return false;
        let availableDates=[]
        dates.forEach(date => {
            let weekDayNum = moment(date).day();
            let weekDay = WEEK.find(f => f.Code === weekDayNum);
            allScheduleData.forEach(sch=>{
                console.log(sch)
                console.log(weekDay)
                console.log("sch[weekDay.DateStart]",sch[weekDay.DateStart])
                if(sch[weekDay.DateStart] && moment(sch[weekDay.DateStart]).isSame(date)){
                    availableDates.push(date)
                }else if(sch[weekDay.DateStart] && sch[weekDay.DateEnd] && moment(sch[weekDay.DateStart]).isBefore(date) && moment(sch[weekDay.DateEnd]).isSameOrAfter(date)){
                    availableDates.push(date)
                }else if(sch[weekDay.DateStart] && moment(sch[weekDay.DateStart]).isBefore(date) && !sch[weekDay.DateEnd]){
                    availableDates.push(date)
                }
            })
        });
        console.log("availableDates",availableDates)
        await knex.destroy();
        finalResponse = {
            Data: availableDates
            
        }
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_SCH_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            ...finalResponse
        })
    }
}
module.exports.getStaffHistoricalBooking = async event => {
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"||
            !json.StartDate || typeof json.StartDate !== "string"||
            !json.EndDate || typeof json.EndDate !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        

        //  First select booking Ids where this staff is available
        var connected = true;
        var knex = require("knex")(con);
        connected = true;
        let bookingsToReturn = [];
    
            let staffBookingsMeta = await knex
                .select(
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StaffId",
                    BOOKING_PRODUCTS + ".BookingId",
                    BOOKINGS + ".DateTime",
                    BOOKINGS + ".Status",
                    BOOKINGS + ".PaymentStatus",
                    BOOKINGS + ".Deleted"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
                .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                .modify(qb => {
                    
                        let dayStart = moment(json.StartDate, DATE_TIME_FORMAT.MMLDDLYYYY).startOf("day").toDate();
                        let dayEnd = moment(json.EndDate, DATE_TIME_FORMAT.MMLDDLYYYY).endOf("day").toDate();
                        qb.andWhere(BOOKINGS + ".DateTime", ">=", dayStart)
                        qb.andWhere(BOOKINGS + ".DateTime", "<=", dayEnd)
                        console.log(qb.toSQL().toNative()) 
                    
                })

            /**
             * filter out the bookingWithProduct, which should now includes only those bookings to be returned
             *  filtering could be based on DateTime, Status, PaymentStatus, etc.
             */
            console.log(staffBookingsMeta)
            bookingsToReturn = staffBookingsMeta.filter(book => {
                console.log("book",book)
                
                if (
                    (
                        book.Status === BOOKING_STATUS.COMPLETED ||
                        book.Status === BOOKING_STATUS.LAPSED 
                        
                    ) &&
                    
                    (
                        book.Deleted === DELETE_FLAG
                    )
                ) {
                    console.log("true")
                    return true;
                } else {
                    console.log("true")
                    return false;
                }
            })
        

        // Bookings to fetch
        let bookingsToFetch = [];
        bookingsToReturn.forEach(a => {
            bookingsToFetch.push(a.BookingId);
        });

        console.log(bookingsToReturn)

        // Fetch final booking details which are found after
        let rawData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".BookingProvider",
                BOOKINGS + ".UserId as BookingUserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Duration",
                BOOKINGS + ".Street",
                BOOKINGS + ".HouseNumber",
                BOOKINGS + ".Floor",
                BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".Status",
                BOOKINGS + ".PaymentStatus",
                BOOKINGS + ".ReachOutTime",
                BOOKINGS + ".ReachOutTime",
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.StartTime',
                BOOKING_PRODUCTS + '.UserId as ProductUserId',
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.StaffAmount',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.CheckInTime',
                BOOKING_PRODUCTS + '.RealStartTime',
                BOOKING_PRODUCTS + '.RealFinishTime',
                BOOKING_PRODUCTS + '.CheckOutTime',
                BOOKING_PRODUCTS + '.StaffNotes',
                BOOKING_PRODUCTS + '.CategoryId',
                BOOKING_PRODUCTS + '.StaffEarning',
                ORGANISATION_LOCATION+".Name as OrganisationName",
                BOOKING_PRODUCT_ADDONS+".BookingProductAddOnId",
                BOOKING_PRODUCT_ADDONS+".Duration as AddOnDuration",
                BOOKING_PRODUCT_ADDONS+".AddOn"

            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .orderBy(BOOKINGS + ".DateTime", "asc")
            .modify(qb => {
                qb.whereIn(BOOKINGS + ".BookingId", bookingsToFetch)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                        // qb.andWhere(function () {
                        //     this.where(BOOKING_PRODUCT_ADDONS+`.ExtraAddon`, "=", 0)
                        //     this.orWhere(function(){
                        //         this.where(BOOKING_PRODUCT_ADDONS+`.ExtraAddon`, "=", 1)
                        //         this.andWhere(BOOKING_PRODUCT_ADDONS+`.RequestStatus`, "=", ADDON_REQUEST_STATUS.ACCEPTED)
                        //     })
                        // })
                        console.log(qb.toSQL().toNative())
            })

        console.log(rawData)
        // format the data to return
        var finalData = [];
        for (let formatInc = 0; formatInc < rawData.length; formatInc++) {
            const raw = rawData[formatInc];
            console.log("raw",raw)
            if (raw.StaffId === staffId) {
                
                const found = finalData.find(f => f.BookingProductId === raw.BookingProductId);
                console.log("found",found)
                if (!found) {
                    let pushObj = {
                        BookingId: raw.BookingId,
                        ProductName:raw.ProductName,
                        ProductDuration:raw.ProductDuration,
                        DateTime: raw.StartTime,
                        Duration: 0,
                        EndTime: "",
                        StaffEarning:raw.StaffEarning,
                        Status: raw.Status,
                        PaymentStatus: raw.PaymentStatus,
                        ReachOutTime: raw.ReachOutTime,
                        ReturnTime: raw.ReachOutTime,
                        Products: [],
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        },
                        BookingProductId: raw.BookingProductId,
                        
                        OrganisationName:raw.OrganisationName?raw.OrganisationName:null,
                        AddOns:[],
                        TotalDuration:raw.ProductDuration
                    }
                    if(raw.BookingProductAddOnId){
                        if(raw.ExtraAddOn==0 || (raw.ExtraAddOn==1 && raw.RequestStatus==ADDON_REQUEST_STATUS.ACCEPTED)){
                            let addOnObj = {
                                BookingProductAddOnId: raw.BookingProductAddOnId,
                                AddOnDuration: raw.AddOnDuration,
                                AddOn: raw.AddOn,
                            }
                            pushObj.TotalDuration+=raw.AddOnDuration
                            pushObj.AddOns.push(addOnObj)
                        }
                        
                    }
                    
                    finalData.push(pushObj);
                } else {
                    if(raw.ExtraAddOn==0 || (raw.ExtraAddOn==1 && raw.RequestStatus==ADDON_REQUEST_STATUS.ACCEPTED)){
                        let addOnObj = {
                            BookingProductAddOnId: raw.BookingProductAddOnId,
                            AddOnDuration: raw.AddOnDuration,
                            AddOn: raw.AddOn,
                        }
                        found.TotalDuration+=raw.AddOnDuration
                        found.AddOns.push(addOnObj)
                    }
                    

                       }
                }

                
        }
      
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_BOOKING_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalData
        })
    }
}
module.exports.getStaffHistoricalBookingTotal = async event => {
    let returnData=[]
    try {
        const headers = event.headers;
        let isHeadersValid = checkHeaders(headers);
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.StaffId || typeof json.StaffId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const staffId = json.StaffId;
        

        //  First select booking Ids where this staff is available
        var connected = true;
        var knex = require("knex")(con);
        connected = true;
        let bookingsToReturn = [];
    
            let staffBookingsMeta = await knex
                .select(
                    BOOKING_PRODUCTS + ".BookingProductId",
                    BOOKING_PRODUCTS + ".StaffId",
                    BOOKING_PRODUCTS + ".BookingId",
                    BOOKINGS + ".DateTime",
                    BOOKINGS + ".Status",
                    BOOKINGS + ".PaymentStatus",
                    BOOKINGS + ".Deleted"
                )
                .from(BOOKING_PRODUCTS)
                .leftJoin(BOOKINGS, BOOKINGS + ".BookingId", BOOKING_PRODUCTS + ".BookingId")
                .where(BOOKING_PRODUCTS + ".StaffId", "=", staffId)
                .whereNotNull(BOOKING_PRODUCTS + ".StaffEarning")
                .modify(qb => {
                    
                       
                        console.log(qb.toSQL().toNative()) 
                    
                })

            /**
             * filter out the bookingWithProduct, which should now includes only those bookings to be returned
             *  filtering could be based on DateTime, Status, PaymentStatus, etc.
             */
            console.log(staffBookingsMeta)
            bookingsToReturn = staffBookingsMeta.filter(book => {
                
                
                if (
                    (
                        book.Status === BOOKING_STATUS.COMPLETED ||
                        book.Status === BOOKING_STATUS.LAPSED 
                        
                    ) &&
                    
                    (
                        book.Deleted === DELETE_FLAG
                    )
                ) {
                    return true;
                } else {
                    return false;
                }
            })
        

        // Bookings to fetch
        let bookingsToFetch = [];
        bookingsToReturn.forEach(a => {
            bookingsToFetch.push(a.BookingId);
        });

        console.log(bookingsToReturn)

        // Fetch final booking details which are found after
        let rawData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".BookingProvider",
                BOOKINGS + ".UserId as BookingUserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Duration",
                BOOKINGS + ".Street",
                BOOKINGS + ".HouseNumber",
                BOOKINGS + ".Floor",
                BOOKINGS + ".City",
                BOOKINGS + ".Zip",
                BOOKINGS + ".Elevator",
                BOOKINGS + ".Status",
                BOOKINGS + ".PaymentStatus",
                BOOKINGS + ".ReachOutTime",
                BOOKINGS + ".ReachOutTime",
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.Product as ProductName',
                BOOKING_PRODUCTS + '.Duration as ProductDuration',
                BOOKING_PRODUCTS + '.PreparationTime',
                BOOKING_PRODUCTS + '.StartTime',
                BOOKING_PRODUCTS + '.UserId as ProductUserId',
                BOOKING_PRODUCTS + '.GuestId as ProductGuest',
                BOOKING_PRODUCTS + '.SameTime',
                BOOKING_PRODUCTS + '.StaffId',
                BOOKING_PRODUCTS + '.StaffAmount',
                BOOKING_PRODUCTS + '.Status as BookingProductStatus',
                BOOKING_PRODUCTS + '.CheckInTime',
                BOOKING_PRODUCTS + '.RealStartTime',
                BOOKING_PRODUCTS + '.RealFinishTime',
                BOOKING_PRODUCTS + '.CheckOutTime',
                BOOKING_PRODUCTS + '.StaffNotes',
                BOOKING_PRODUCTS + '.CategoryId',
                BOOKING_PRODUCTS + '.StaffEarning',
                ORGANISATION_LOCATION+".Name as OrganisationName",
                BOOKING_PRODUCT_ADDONS+".BookingProductAddOnId",
                BOOKING_PRODUCT_ADDONS+".Duration as AddOnDuration",
                BOOKING_PRODUCT_ADDONS+".AddOn"

            )
            .from(BOOKING_PRODUCTS)
            .leftJoin(BOOKINGS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", BOOKINGS + ".OrganisationLocationId")
            .leftJoin(BOOKING_PRODUCT_ADDONS, BOOKING_PRODUCT_ADDONS + ".BookingProductId", BOOKING_PRODUCTS + ".BookingProductId")
            .orderBy(BOOKINGS + ".DateTime", "asc")
            .modify(qb => {
                qb.whereIn(BOOKINGS + ".BookingId", bookingsToFetch)
                        .andWhere(BOOKING_PRODUCTS + ".StaffId", "=", staffId);
            })

        console.log(rawData)
        // format the data to return
        var finalData = [];
        let TotalEarning=0
        let TotalTreatments=[]
        let Bonus=0
        for (let formatInc = 0; formatInc < rawData.length; formatInc++) {
            const raw = rawData[formatInc];
            if (raw.StaffId === staffId) {
                
                const found = finalData.find(f => f.BookingProductId === raw.BookingProductId);
                console.log(found)
                if (!found) {
                    let pushObj = {
                        BookingId: raw.BookingId,
                        ProductName:raw.ProductName,
                        ProductDuration:raw.ProductDuration,
                        DateTime: raw.StartTime,
                        Duration: 0,
                        EndTime: "",
                        StaffEarning:raw.StaffEarning,
                        Status: raw.Status,
                        PaymentStatus: raw.PaymentStatus,
                        ReachOutTime: raw.ReachOutTime,
                        ReturnTime: raw.ReachOutTime,
                        Products: [],
                        TimeZone: {
                            Zone: process.env.STAFF_ZONE
                        },
                        BookingProductId: raw.BookingProductId,
                        
                        OrganisationName:raw.OrganisationName?raw.OrganisationName:null,
                        AddOns:[],
                        TotalDuration:raw.ProductDuration
                    }
                    if(raw.BookingProductAddOnId){
                        if(raw.ExtraAddOn==0 || (raw.ExtraAddOn==1 && raw.RequestStatus==ADDON_REQUEST_STATUS.ACCEPTED)){
                            let addOnObj = {
                                BookingProductAddOnId: raw.BookingProductAddOnId,
                                AddOnDuration: raw.AddOnDuration,
                                AddOn: raw.AddOn,
                            }
                            pushObj.TotalDuration+=raw.AddOnDuration
                            pushObj.AddOns.push(addOnObj)
                        }
                        
                    }
                    TotalEarning+=pushObj.StaffEarning
                    if(pushObj.TotalDuration>=45){
                        const treatFound = TotalTreatments.find(f=>f == pushObj.BookingProductId);
                        if(!treatFound){
                            TotalTreatments.push(pushObj.BookingProductId)
                        }
                    }
                    finalData.push(pushObj);
                } else {
                    if(raw.ExtraAddOn==0 || (raw.ExtraAddOn==1 && raw.RequestStatus==ADDON_REQUEST_STATUS.ACCEPTED)){
                        let addOnObj = {
                            BookingProductAddOnId: raw.BookingProductAddOnId,
                            AddOnDuration: raw.AddOnDuration,
                            AddOn: raw.AddOn,
                        }
                        found.TotalDuration+=raw.AddOnDuration
                        if(found.TotalDuration>=45){
                            const treatFound = TotalTreatments.find(f=> f == found.BookingProductId);
                            if(!treatFound){
                                TotalTreatments.push(found.BookingProductId)
                            }
                        }
                        found.AddOns.push(addOnObj)
                    }
                    

                       }
                }

                
        }
       
        if(TotalTreatments.length<40){
            Bonus=0

        }else if(TotalTreatments.length>= 40 && TotalTreatments.length<=55){
            Bonus=200
        }
        else if(TotalTreatments.length> 55 && TotalTreatments.length<=70){
            Bonus=310
        }
        else if(TotalTreatments.length> 70){
            Bonus=420
        }
        
        returnData={
            TotalEarning:parseFloat(TotalEarning.toFixed(2)),
            TotalTreatments:TotalTreatments,
            Bonus:Bonus,
        }
        await knex.destroy();
    } catch (error) {
        console.log(error);
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
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.STAFF_BOOKING_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: returnData
        })
    }
}
const getNextEvent =  (blockArray,bookings,staff,booking) =>{
    let overlappingBlock=[]
    let overlappingBooking=[]
    console.log("out")
    if(Object.keys(blockArray).length != 0 && blockArray.Blocks.length!=0){
        let blocks=blockArray.Blocks
        blocks.sort((a, b) => a.StartTime - b.StartTime);
        console.log("in block")
        console.log("booking",booking)
        
        for (let count = 0; count < blocks.length; count++) {
            let blockToCompare=blocks[count]
            console.log("blockToCompare",blockToCompare)
            let bookingEndTime=moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").add(AUTOMATIC_BLOCKTIME_BUFFER,"minute").format(DATE_TIME_FORMAT.HHcmmcss)
            let bookingStartTime=moment(booking.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmmcss)
            console.log("bookingEndTime",bookingEndTime)
            console.log("blockToCompare.StartTime",blockToCompare.StartTime)

            if(moment(blockToCompare.StartTime,DATE_TIME_FORMAT.HHcmmcss).isBefore(moment(bookingEndTime,DATE_TIME_FORMAT.HHcmmcss) )&& moment(blockToCompare.StartTime,DATE_TIME_FORMAT.HHcmmcss).isAfter(moment(bookingStartTime,DATE_TIME_FORMAT.HHcmmcss))){
                console.log("in if",bookingEndTime)
                overlappingBlock=blockToCompare
            }
        }
        

    }
    for (let count = 0; count < bookings.length; count++) {
        console.log("in book")
        let bookingToCompare=bookings[count]
        console.log("bookingToCompare",bookingToCompare)
        let bookingEndTime=moment(booking.StartTime).tz(process.env.STAFF_ZONE).add(booking.ProdTotalDuration,"minute").add(AUTOMATIC_BLOCKTIME_BUFFER,"minute")
        let bookingStartTime=moment(booking.StartTime)
        if((moment(bookingToCompare.StartTime).isBefore(moment(bookingEndTime)) 
        && moment(bookingToCompare.StartTime).isAfter(moment(bookingStartTime))
        &&( bookingToCompare.StaffId==staff.StaffId) 
    && booking.BookingId!=bookingToCompare.BookingId)){
            console.log("in if",bookingEndTime)
            console.log("booking.StaffId",booking.StaffId)
            console.log("staff.StaffId",staff.StaffId)
            console.log("booking.BookingId",booking.BookingId)
            console.log("bookingToCompare",bookingToCompare.BookingId)
            overlappingBooking=bookingToCompare
        }
    }
    console.log("overlappingBlock",overlappingBlock)
    console.log("overlappingBooking",overlappingBooking)
    if(Object.keys(overlappingBlock).length && Object.keys(overlappingBooking).length){
        let overlappingBookingStartTime=moment(overlappingBooking.StartTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.HHcmm)
        if(moment(overlappingBlock.StartTime).isBefore(moment(overlappingBookingStartTime))){
            console.log("1")
            return overlappingBlock
        }else{
            console.log("2")
            return overlappingBooking
        }
    }else{
        if(Object.keys(overlappingBlock).length){
            console.log("3")
            return overlappingBlock
        }else if(Object.keys(overlappingBooking).length){
            console.log("4")
            return overlappingBooking
        }
        else{
            console.log("6")
            return null
        }
    }

}