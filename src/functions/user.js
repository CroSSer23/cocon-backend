const { verifyRefreshToken } = require("./authorize")
const request = require("request-promise");
const jwt = require('jsonwebtoken');
const { con } = require("../db.js");
const { Headers } = require("../header");
const { BOOKINGS, BOOKING_EXTRA, USERS, ADMIN, PRODUCTS, STAFF, BOOKING_PRODUCTS, GUEST_USERS,ACCOUNT_DELETE_FEEDBACK,USER_MESSAGES,ADMIN_NOTIFICATION_CONTACT, RATINGS, BOOKING_TIPS,ORGANISATION_LOCATION } = require("../tables.js");
var moment = require("moment")
const momentz = require("moment-timezone");
const zone = require("../zone");
const { verifyAccessToken } = require("./authorize")
const { generatePassword } = require("./organisations")
const md5 = require("md5");
const { InitializeFirebase, checkHeaders, getPayloadData, setPayloadData, InitializeFirebaseTherapist } = require("../util.js");
const TYPE = {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN: process.env.REFRESH_TOKEN_TYPE,
    ANONYMOUS_TOKEN: process.env.ANONYMOUS_TOKEN_TYPE
}
const { saveLog, } = require("../helpers/common.js");
const { createTokenStaff } = require("./staff")

const {
    BOOKING_STATUS,BOOKING_STATUS_DESC
} = require("../status");
const STRIPE_SECRET = process.env.STRIPE_SECRET;
const { MESSAGE, DATE_TIME_FORMAT, PUSH,DELETE_REASON } = require("../strings");
const { USER_LIST_FILTERS, BINARY ,ADMIN_TYPE,LOG_ACTION_TYPE} = require("../enum");

const USER_SORT_KEYS = ['Name'];
const USER_REF = "users/";
const USER_MESSAGE_REF = "messages/user/";
const nodemailer = require('nodemailer');
const DELETED = 0;
const fetchUsers = async (knex, apiClient, {
    pagination,
    sort,
    filters,
    search,
    lastUpdated,
    currentIds
},fetchDeleted=false) => {
    let usersIds = await knex(USERS)
        .pluck("UserId")
        .select("Name","Email","Contact","Notes",knex.raw('REPLACE(CONCAT(COALESCE(Floor, \'\'), \'\, \', COALESCE(Street,\'\'), \'\, \', COALESCE(HouseNumber,\'\'), \'\, \', COALESCE(Zip,\'\'),\'\, \',COALESCE(City,\'\') ), \' \', \'\') as "searchAdrress"'))
        // .where("Archive", "=", 0)
        .modify(function (queryBuilder) {
            if(fetchDeleted===false){
                queryBuilder.where("Archive", "=", 0)
            }
            if (!search) {
                
                if (filters && filters.length) {
                    let genderFilter = filters.find(f => f.Key === USER_LIST_FILTERS.GENDER.KEY);
                    if (genderFilter && genderFilter.Values && genderFilter.Values.length) {
                        queryBuilder.where("Gender", "=", genderFilter.Values[0])
                    }
                    let signedUserFilter = filters.find(f => f.Key === USER_LIST_FILTERS.APP_SIGNED_UP.KEY);
                    if (signedUserFilter && signedUserFilter.Values && signedUserFilter.Values.length) {
                        switch (signedUserFilter.Values[0]) {
                            case USER_LIST_FILTERS.APP_SIGNED_UP.VALUES.CMS_ONLY: {
                                queryBuilder.where("FromCMS", "=", 1)
                                break;
                            }
                            case USER_LIST_FILTERS.APP_SIGNED_UP.VALUES.APP_USED: {                                
                                queryBuilder.where("FromCMS", "=", 0)
                                break;
                            }
                            default:
                                break;
                        }
                    }
                }
            } else {
                searchstr=search.replace(',','');
                let searchArray=searchstr.split(' ');
                let searchString=searchArray[0]
                searchArray.forEach(function(element,index){ 
                    console.log(index)
                    if(index!=0){
                        searchString+='|'+element
                    }
                });
                // queryBuilder.having(function() {
                //     this.having("Name", "like", `%${search}%`)
                //     .orHaving("Email", "like", `%${search}%`)
                //     .orHaving("Contact", "like", `%${search}%`)
                //     // .orWhere("Street", "REGEXP", `${searchString}`)
                //     .orHaving("Notes", "like", `%${search}%`)
                //     .orHaving("searchAdrress", "like", `%${search.replace(/ /g,'')}%`)
                    
                //     // .orWhere("Floor", "REGEXP", `${searchString}`)
                //     // .orWhere("City", "REGEXP", `${searchString}`)
                //     // .orWhere("Zip", "REGEXP", `${searchString}`)
                    
                //   })
                  queryBuilder.having(knex.raw("NAME like '%"+search+"%' OR Email like '%"+search+"%' OR Contact like '%"+search+"%' OR Notes like '%"+search+"%' OR searchAdrress like '%"+search.replace(/ /g,'')+"%'"));
            }
            if (sort.Key && USER_SORT_KEYS.includes(sort.Key)) {
                queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
            } else {
                queryBuilder.orderBy("Created", "desc")
            }
            if (!search) {
                queryBuilder.limit(pagination.Size);
                if (pagination.Number > 1) {
                    let offset = pagination.Size * (pagination.Number - 1);
                    queryBuilder.offset(offset)
                }
            }
           console.log(queryBuilder.toSQL().toNative()) 
        })
console.log(usersIds)
    let usersData = await knex(USERS)
        .select(
            USERS+".UserId",
            "GoogleId",
            "FacebookId",
            "AppleId",
            "Name",
            "Email",
            "Contact",
            "Gender",
            "ImagePath",
            "Street",
            "HouseNumber",
            "Floor",
            "City",
            "Zip",
            "Elevator",
            "Notes",
            "CoconNotes",
            "CSNotes",
            "TherapistNotes",
            "CoconNotes",
            "Therapist",
            USERS+".LastUpdated",
            "Archive",
            ACCOUNT_DELETE_FEEDBACK+".Created as DeletedDate"

        )
        .modify(function (queryBuilder) {
            queryBuilder.whereIn(USERS+".UserId", usersIds)
            if (lastUpdated && currentIds) {
                 // check for mismatched ids fetch to fetch those users as well
                 var missedUsersIds = usersIds.filter( function(n) { 
                    return !this.has(n) }, new Set(currentIds) 
                );
                queryBuilder.where(USERS+".LastUpdated", ">", lastUpdated)
                queryBuilder.orWhereIn(USERS+".UserId", missedUsersIds)
            }
            queryBuilder.leftJoin(ACCOUNT_DELETE_FEEDBACK, ACCOUNT_DELETE_FEEDBACK + '.UserId', USERS + ".UserId")
        })

    usersData.forEach(user => {
        switch (user.Therapist) {
            case 0: user.TherapistString = "Male";
                break;
            case 1: user.TherapistString = "Female";
                break;
            case 2: user.TherapistString = "Either";
                break;
        }
        if (user.ImagePath) {
            user.ImageURL = process.env.BUCKET_URL + user.ImagePath;
        }
    });
    return {
        data: usersData,
        currentIds: usersIds,
    };
}

const getItemCount = async (knex, filters,fetchDeleted=false) => {
    let usersData = await knex(USERS)
        .count(
            "UserId",
        )
        // .where("Archive", "=", 0)
        .modify(function (queryBuilder) {
            if(fetchDeleted===false){
                queryBuilder.where("Archive", "=", 0)
            }
            if (filters && filters.length) {
                let genderFilter = filters.find(f => f.Key === USER_LIST_FILTERS.GENDER.KEY);
                if (genderFilter && genderFilter.Values && genderFilter.Values.length) {
                    queryBuilder.where("Gender", "=", genderFilter.Values[0])
                }
                let signedUserFilter = filters.find(f => f.Key === USER_LIST_FILTERS.APP_SIGNED_UP.KEY);
                if (signedUserFilter && signedUserFilter.Values && signedUserFilter.Values.length) {
                    switch (signedUserFilter.Values[0]) {
                        case USER_LIST_FILTERS.APP_SIGNED_UP.VALUES.CMS_ONLY: {
                            queryBuilder.where("FromCMS", "=", 1)
                            break;
                        }
                        case USER_LIST_FILTERS.APP_SIGNED_UP.VALUES.APP_USED: {                                
                            queryBuilder.where("FromCMS", "=", 0)
                            break;
                        }
                        default:
                            break;
                    }
                }
            }
        })
    return usersData[0]['count(`UserId`)'];
}

// validates user email
const validateEmail = async email => {
    var valid;
    var mailformat = "^[_A-Za-z0-9-\\+]+(\\.[_A-Za-z0-9-]+)*@"
        + "[A-Za-z0-9-]+(\\.[A-Za-z0-9]+)*(\\.[A-Za-z]{2,})$";
    email.match(mailformat) ? valid = true : valid = false;
    return valid;
};

// create jwt access token for user
const createToken = async (UserId, DeviceId) => {
    const options = {
        expiresIn: parseInt(process.env.ACCESS_TOKEN_EXPIRE),
        subject: UserId.toString(),
        audience: process.env.AUDIENCE,
        issuer: process.env.ISSUER
    }
    const payload = {
        Type: TYPE.ACCESS_TOKEN,
        DeviceId
    }
    const token = jwt.sign({ payload }, process.env.JWT_SECRET, options);
    return token;
}

// create jwt access token for user
const createAnonymousToken = async (userType=null) => {
    const options = {
        expiresIn: parseInt(process.env.ANONYMOUS_TOKEN_EXPIRE),
        subject: "anonymous",
        audience: process.env.AUDIENCE,
        issuer: process.env.ISSUER
    }
    const payload = {
        Type: TYPE.ANONYMOUS_TOKEN,
        UserType:userType
    }
    var AnonymousToken = jwt.sign({ payload }, process.env.JWT_SECRET, options);
    return AnonymousToken;
}

// create jwt refresh token for user
const createRefreshToken = async (UserId, DeviceId) => {
    const options = {
        expiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRE),
        subject: UserId.toString(),
        audience: process.env.AUDIENCE,
        issuer: process.env.ISSUER
    }
    const payload = {
        Type: TYPE.REFRESH_TOKEN,
        DeviceId
    }
    const refreshToken = jwt.sign({ payload }, process.env.JWT_SECRET, options);
    return refreshToken;
}

// update refresh token in given user
const updateToken = async (UserId, RefreshToken, DeviceId, knex) => {
    try {
        var updated = await knex(USERS)
            .where("UserId", "=", UserId)
            .update({
                RefreshToken,
                DeviceId
            });
        if (!updated) {
            throw new Error(MESSAGE.TOKEN_NOT_UPDATED);
        }
        return RefreshToken;
    } catch (error) {
        return {
            Error: error.message
        }
    }
}

// create & return new accesstoken based on given refresh token
module.exports.getNewToken = async event => {
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.RefreshToken) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const verifyToken = await verifyRefreshToken(json.RefreshToken, headers['api-client']);
        if (verifyToken.statusCode !== 200) {
            return {
                statusCode: verifyToken.statusCode,
                headers: {
                    ...Headers,
                    message: verifyToken.message
                }
            }
        }
        var Data = {};
        if (headers['api-client'] === process.env.API_CLIENT_COCON_APP) {
            Data.AccessToken = await createToken(verifyToken.Subject, verifyToken.DeviceId);
        }
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            Data.AccessToken = await createTokenStaff(verifyToken.Subject, verifyToken.DeviceId);
        }
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
            Message: MESSAGE.TOKEN_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data
        })
    }
}

module.exports.getAnonymousToken = async event => {
    try {
        var AnonymousToken = await createAnonymousToken();
    } catch (error) {
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
            Message: MESSAGE.TOKEN_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: {
                AnonymousToken
            }
        })
    }
}

module.exports.getUser = async event => {
    let knex, connected = false, response = {
        Data: []
    };
    try {
        knex = require('knex')(con);
        const json = event.body ? getPayloadData(event) : null;
        if (!json) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.ListUserForBooking) {
            response.Data = await knex(USERS)
                .select(
                    "UserId",
                    "Name",
                    "Email",
                    "Zip",
                    "Distance",
                    "HouseNumber",
                    "Street",
                    "City",
                    "Latitude",
                    "Longitude",
                    "ReachOutTime"


                )
                .where("Archive", "=", 0)
                .orderBy("Created", "desc")
        } else if (json.UserId) {
            response.Data = await knex(USERS)
                .select(
                    "UserId",
                    "GoogleId",
                    "FacebookId",
                    "AppleId",
                    "Name",
                    "Email",
                    "Contact",
                    "Gender",
                    "ImagePath",
                    "Street",
                    "HouseNumber",
                    "Floor",
                    "City",
                    "Zip",
                    "Elevator",
                    "Notes",
                    "CoconNotes",
                    "Therapist",
                    "ReachOutTime"
                )
                .where("Archive", "=", 0)
                .andWhere("UserId", "=", json.UserId)
                .orderBy("Created", "desc")
            response.Data.forEach(user => {
                switch (user.Therapist) {
                    case 0: user.TherapistString = "Male";
                        break;
                    case 1: user.TherapistString = "Female";
                        break;
                    case 2: user.TherapistString = "Either";
                        break;
                }
                if (user.ImagePath) {
                    user.ImageURL = process.env.BUCKET_URL + user.ImagePath;
                }
            });
        } else {
            let fetchDeleted=true;
            let finalData = await fetchUsers(knex, event.headers['api-client'], {
                pagination: json.Pagination,
                filters: json.Filters,
                sort: json.Sort,
                search: json.Search,
                lastUpdated: json.LastUpdated,
                currentIds: json.CurrentIds
            },fetchDeleted)
            response = {
                Data: finalData.data,
                CurrentIds: finalData.currentIds,
                LastUpdated: moment().utc().format(),
                TotalItems: !json.Search ? await getItemCount(knex, json.Filters,fetchDeleted) : 0,
                Pagination: {
                    ...json.Pagination
                }
            }
        }
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
            Message: MESSAGE.USER_FETCH_SUCCESS
        },
        body: setPayloadData(event, response)
    }
}

module.exports.adminLogin = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Email ||
            !json.Password
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        if (! await validateEmail(json.Email)) {
            throw new Error(MESSAGE.INVALID_EMAIL);
        }

        var knex = require("knex")(con);
        const AdminData = await knex(ADMIN).select(
            ADMIN+".*",
            ORGANISATION_LOCATION+".EncryptedOrganisationLocationId",
            ORGANISATION_LOCATION+".ReachOutTime",
            ORGANISATION_LOCATION+".ImagePath"
        )
        .where(ADMIN+".Email", "=", json.Email)
        .andWhere(ADMIN+".Deleted","=",0)
        .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', ADMIN + '.OrganisationLocationId');
        if (AdminData.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_FOUND_TRY_AGAIN);
        }
        console.log(AdminData)
        var FinalData = AdminData[0];
        FinalData.ProfileImageURL=null
        FinalData.ImageURL = process.env.BUCKET_URL + FinalData.ImagePath;
        console.log(AdminData)
        if(FinalData.ProfileImagePath){
            FinalData.ProfileImageURL = process.env.BUCKET_URL + FinalData.ProfileImagePath;
        }
        const md5 = require("md5");
        const passMd = md5(json.Password);
        console.log("pass",passMd)
        console.log("FinalData",FinalData.Password)
        if (passMd !== FinalData.Password) {
            throw new Error(MESSAGE.INVALID_USER_CREDENTIALS);
        }
        delete FinalData.Password;
        FinalData.AnonymousToken = await createAnonymousToken(FinalData.Type);
        let lastBId = await knex(BOOKINGS).max("BookingId");
        FinalData.LastBId = lastBId[0]['max(`BookingId`)'];
         // Save log for login
         await saveLog(knex,FinalData.AdminId,ADMIN,FinalData.AdminId,LOG_ACTION_TYPE.LOGIN)

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
            Message: MESSAGE.USER_LOGGED_IN
        },
        body: setPayloadData(event, {
            Data: FinalData
        })
    }
}

// Used by app to fetch saved cards.
module.exports.getPaymentMethod = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.UserId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        console.log(json);
        const knex = require("knex")(con);
        const userExist = await knex(USERS).select("CustomerId").where("UserId", "=", json.UserId);
        await knex.destroy();
        if (userExist.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_FOUND_TRY_AGAIN);
        }
        const userData = userExist[0];
        var paymentMethods;
        if (!userData.CustomerId) {
            paymentMethods = [];
        } else {
            const stripe = require('stripe')(process.env.STRIPE_SECRET,{  apiVersion:'2020-08-27'});
            paymentMethods = await stripe.paymentMethods.list({
                customer: userData.CustomerId,
                type: 'card'
            })
            paymentMethods.data.forEach(element => {
                delete element.customer;
            });
        }
        console.log(paymentMethods);
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
            Message: MESSAGE.PAYMENT_METHOD_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: paymentMethods
        })
    }
}

const fetchUser = async (knex, provider, providerIdentifier, userId = null) => {
    try {
        var userExist = await knex(USERS).select(
            "UserId",
            "Name",
            "Email",
            "Contact",
            "Gender",
            "ImagePath",
            "Street",
            "HouseNumber",
            "Floor",
            "Elevator",
            "City",
            "Zip",
            "Notes",
            "CoconNotes",
            "Therapist",
            "Latitude",
            "Longitude",
            "ReachOutTime",
            "FcmToken",
            "IsCalPermitted",
            "GoogleId",
            "FacebookId",
            "AppleId",
            "CustomerId",
            "Distance",
            "CSNotes",
            "TherapistNotes"
        ).modify(qb => {
            if (!userId) {
                switch (provider) {
                    case 0: qb.where("GoogleId", "=", providerIdentifier)
                        break;
                    case 1: qb.where("FacebookId", "=", providerIdentifier)
                        break;
                    case 2: qb.where("AppleId", "=", providerIdentifier)
                        break;
                }
            } else {
                qb.where("UserId", "=", userId)
            }
        })
    } catch (error) {
        return {
            Error: error.message
        }
    }
    return userExist;
}

module.exports.login = async event => {
    let knex = null, connected = false, deviceId = null, responseObj = null;
    try {
        // verify headers
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
        deviceId = headers['device-id'];
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        if (!json.Type) {
            // User Login 
            responseObj = await userLogin(knex, json, headers, event);
            // knex.destroy().then(() => { console.log("destroyed") });
            await knex.destroy();
            return responseObj;
        } else {
            switch (json.Type) {
                case 0: {
                    // User Login - condition already met in Type check
                    break;
                }
                case 1: {
                    // Guest Login
                    responseObj = await guestLogin(knex, json, headers, event);
                    // knex.destroy().then(() => { console.log("destroyed") });
                    await knex.destroy();
                    return responseObj;
                }
                case 2: {
                    // Staff login - YET TO IMPLEMENT in this API
                    // await staffLogin(knex, json);
                    break;
                }
                case 3: {
                    // Admin login - YET TO IMPLEMENT in this API
                    // await adminLogin(knex, json);
                    break;
                }
            }

        }
    } catch (error) {
        console.log(error)
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
}

const userLogin = async (knex, json, headers, event) => {
    if (!json || json.Provider < 0 || !json.ProviderIdentifier) {
        throw new Error(MESSAGE.REQ_DATA_ERROR);
    }
    let userExist = await fetchUser(knex, json.Provider, json.ProviderIdentifier);
    if (userExist.length <= 0) {
        return {
            statusCode: 404,
            headers: {
                ...Headers,
                Message: MESSAGE.USER_NOT_FOUND_TRY_AGAIN
            }
        }
    }
    let userData = userExist[0];
    let deviceId = headers['device-id'];
    let updateObj = {
        DeviceId: deviceId,
        LastUpdated: zone.getLastUpdate()
    }
    if (json.FcmToken) {
        updateObj.FcmToken = json.FcmToken;
        try {
            const admin = InitializeFirebase();
            let subscribe = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC);
            let subscribeToAll = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_ALL);

            // Unsubscribe from guest topic
            let unsub = await admin.messaging().unsubscribeFromTopic(json.FcmToken, process.env.BROADCAST_TOPIC_GUEST);
        } catch (error) {
            console.log(error);
        }
    }
    userData.FcmToken = json.FcmToken;
    if (userData.ImagePath) {
        userData.ImageURL = process.env.BUCKET_URL + userData.ImagePath;
    }
    userData.AccessToken = await createToken(userExist[0].UserId, deviceId);
    userData.RefreshToken = await createRefreshToken(userExist[0].UserId, deviceId);
    updateObj.RefreshToken = userData.RefreshToken;
    updateObj.Platform = headers['platform'];
    let updateDeviceId = await knex(USERS).where("UserId", "=", userExist[0].UserId)
        .update(updateObj);

    /**
    * Check in GuestUser table
    */
    let guestExist = await knex(GUEST_USERS)
        .select("GuestUserId")
        .where("DeviceId", "=", deviceId)
        .modify(qb => {
            if (json.FcmToken) {
                qb.orWhere("FcmToken", "=", json.FcmToken);
            }
        });
    if (guestExist.length > 0) {
        // Delete guest record.
        let deletedGuest = await knex(GUEST_USERS).where("GuestUserId", "=", guestExist[0].GuestUserId).del();
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.USER_LOGGED_IN
        },
        body: setPayloadData(event, {
            Data: userData
        })
    }
}

const guestLogin = async (knex, json, headers, event) => {
    let deviceId = headers['device-id'];
    let fcmToken = json.FcmToken ? json.FcmToken : null;
    let anonymousToken = await createAnonymousToken();
    /**
     * Check if device Id or FcmToken already exist in User or GuestUser table
     * YES - do nothing.
     * NO - put the deviceId, FcmToken if provided in GuestUser table.
     */

    // // checking in user table
    // let existInUser = await knex(USERS)
    //     .select("UserId")
    //     .where("DeviceId", "=", deviceId)
    //     .modify(qb => {
    //         if (fcmToken) {
    //             qb.orWhere("FcmToken", "=", fcmToken)
    //         }
    //     })

    // if (existInUser.length > 0) {
    //     return {
    //         statusCode: 200,
    //         headers: {
    //             ...Headers,
    //             Message: MESSAGE.USER_LOGGED_IN
    //         },
    //         body: JSON.stringify({
    //             Data: {
    //                 AnonymousToken: anonymousToken
    //             }
    //         })
    //     }
    // }

    // checking in guest table
    let existInGuest = await knex(GUEST_USERS)
        .select("GuestUserId")
        .where("DeviceId", "=", deviceId)
        .modify(qb => {
            if (fcmToken) {
                qb.orWhere("FcmToken", "=", fcmToken)
            }
        })

    if (existInGuest.length > 0) {
        return {
            statusCode: 200,
            headers: {
                ...Headers,
                Message: MESSAGE.USER_LOGGED_IN
            },
            body: setPayloadData(event, {
                Data: {
                    AnonymousToken: anonymousToken
                }
            })
        }
    } else {
        // insert and subscribe the new guest
        let insertObj = {
            DeviceId: deviceId,
            Platform: headers['platform'] ? headers['platform'] : null,
            FcmToken: fcmToken,
            ...zone.getCreateUpdate()
        }
        if (fcmToken) {
            insertObj.FcmToken = fcmToken;
            try {
                const admin = InitializeFirebase();
                let subscribe = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_GUEST);
                let subscribeToAll = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_ALL);
            } catch (error) {
                console.log(error);
            }
        }

        let insertGuest = await knex(GUEST_USERS).insert(insertObj);
        return {
            statusCode: 200,
            headers: {
                ...Headers,
                Message: MESSAGE.USER_LOGGED_IN
            },
            body: setPayloadData(event, {
                Data: {
                    AnonymousToken: anonymousToken
                }
            })
        }
    }
}

module.exports.uploadImage = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.Base) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var base64String = json.Base;
        var buffer = new Buffer.from(base64String, 'base64');
        const fileType = require("file-type");
        let fileMime = await fileType.fromBuffer(buffer);
        if (fileMime === null) {
            throw new Error(MESSAGE.INVALID_FILE_TYPE);
        }
        var fileName = Date.now().toString() + Math.floor(Math.random() * Math.floor(1000000)) + "." + fileMime.ext;
        console.log(fileName);
        var aws = require('aws-sdk');
        const s3 = new aws.S3({
            accessKeyId: process.env.BUCKET_ACCESS_KEY,
            secretAccessKey: process.env.BUCKET_SECRET,
            region: process.env.BUCKET_REGION
        });
        const params = {
            Bucket: process.env.BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ACL: 'public-read'
        };

        var uploaded = await s3.putObject(params).promise();
        if (!uploaded) {
            throw new Error(MESSAGE.IMAGE_NOT_UPLOADED);
        }
        var fileDetail = {
            ImagePath: fileName,
            ImageURL: process.env.BUCKET_URL + fileName
        }
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
            Message: MESSAGE.IMAGE_UPLOADED
        },
        body: setPayloadData(event, {
            Data: fileDetail
        })
    }
};

module.exports.signUp = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            !json ||
            !json.Name ||
            !json.Email ||
            typeof json.Provider !== 'number' ||
            json.Provider < 0 ||
            json.Provider > 2 ||
            !json.ProviderIdentifier ||
            !json.AuthToken
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = false;

        // check if user exist for that provider
        var userExist = await fetchUser(knex, json.Provider, json.ProviderIdentifier);
        if (userExist.Error) {
            throw new Error(userExist.Error);
        }
        if (userExist.length > 0) {      // user exists return with data
            const userData = userExist[0];
            // return tokens too
            userData.AccessToken = await createToken(userExist[0].UserId, event.headers['device-id']);
            userData.RefreshToken = await createRefreshToken(userExist[0].UserId, event.headers['device-id']);
            var updateDeviceId = await knex(USERS).where("UserId", "=", userExist[0].UserId)
                .update({ RefreshToken: userData.RefreshToken });
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    Message: MESSAGE.USER_ALREADY_EXIST
                },
                body: setPayloadData(event, {
                    Data: userData
                })
            }
        }
        // check for given mail
        var userExistEmail = await knex(USERS).select("UserId").where("Email", "=", json.Email);
        if (userExistEmail.length > 0) {
            // user already exist update provider and return data.
            const AccessToken = await createToken(userExistEmail[0].UserId, event.headers['device-id']);
            const RefreshToken = await createRefreshToken(userExistEmail[0].UserId, event.headers['device-id']);
            var updateProvider = await knex(USERS)
                .where("UserId", "=", userExistEmail[0].UserId)
                .modify(qb => {
                    if (json.Provider === 0) {
                        qb.update({
                            GoogleId: json.ProviderIdentifier,
                            RefreshToken: RefreshToken
                        })
                    }
                    if (json.Provider === 1) {
                        qb.update({
                            FacebookId: json.ProviderIdentifier,
                            RefreshToken: RefreshToken
                        })
                    }
                    if (json.Provider === 2) {
                        qb.update({
                            AppleId: json.ProviderIdentifier,
                            RefreshToken: RefreshToken
                        })
                    }
                })

            const userData = await fetchUser(knex, json.Provider, json.ProviderIdentifier);
            if (userData.Error) {
                throw new Error(userData.Error);
            }
            userData[0].AccessToken = AccessToken;
            userData[0].RefreshToken = RefreshToken;
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    Message: MESSAGE.USER_ALREADY_EXIST
                },
                body: JSON.stringify({
                    Data: userData[0]
                })
            }
        }

        // user not exist in system, verify provider token and create new user.
        var authTokenValid = false;
        switch (json.Provider) {
            case 0:
                authTokenValid = await verifyGoogleToken(json.AuthToken, event.headers['platform']);
                break;
            case 1:
                authTokenValid = await verifyFacebookToken(json.AuthToken);
                break;
            case 2:
                authTokenValid = await verifyAppleToken(json.AuthToken);
                break;
        }
        if (!authTokenValid) {
            throw new Error(MESSAGE.INVALID_AUTH_TOKEN);
        }
        var dataToInsert = {
            Name: json.Name,
            Email: json.Email,
            ImagePath: json.ImagePath ? json.ImagePath : null,
            FcmToken: json.FcmToken ? json.FcmToken : null,
            DeviceId: event.headers['device-id'],
            Platform: event.headers['platform'],
            ...zone.getCreateUpdate()
        }
        switch (json.Provider) {
            case 0:
                dataToInsert.GoogleId = json.ProviderIdentifier;
                break;
            case 1:
                dataToInsert.FacebookId = json.ProviderIdentifier;
                break;
            case 2:
                dataToInsert.AppleId = json.ProviderIdentifier;
                break;
        }
        var inserted = await knex(USERS).insert(dataToInsert);
        if (inserted.length <= 0) {
            throw new Error(MESSAGE.FAILED_TO_SIGN_UP);
        }
        var userData = await fetchUser(knex, json.Provider, json.ProviderIdentifier);
        if (userData.Error) {
            throw new Error(userData.Error);
        }
        var newUserData = userData[0];
        if (newUserData.ImagePath) {
            newUserData.ImageURL = process.env.BUCKET_URL + newUserData.ImagePath;
        }
        if (newUserData.FcmToken) {
            try {
                const admin = InitializeFirebase();
                let subscribe = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC);
                let subscribeToAll = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_ALL);

                // Unsubscribe from Guest topic
                let unsub = await admin.messaging().unsubscribeFromTopic(json.FcmToken, process.env.BROADCAST_TOPIC_GUEST);
            } catch (error) {
                console.log(error);
            }
        }
        newUserData.AccessToken = await createToken(newUserData.UserId, event.headers['device-id']);
        newUserData.RefreshToken = await createRefreshToken(newUserData.UserId, event.headers['device-id']);
        var updateDeviceId = await knex(USERS).where("UserId", "=", newUserData.UserId)
            .update({ RefreshToken: newUserData.RefreshToken });

        /**
         * Check in GuestUser table
         */

        let guestExist = await knex(GUEST_USERS)
            .select("GuestUserId")
            .where("DeviceId", "=", event.headers['device-id'])
            .modify(qb => {
                if (json.FcmToken) {
                    qb.orWhere("FcmToken", "=", json.FcmToken);
                }
            })
        if (guestExist.length > 0) {
            // Delete guest record.
            let deletedGuest = await knex(GUEST_USERS).where("GuestUserId", "=", guestExist[0].GuestUserId).del();
        }

        await knex.destroy();
    } catch (error) {
        console.log(error)
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
            Message: MESSAGE.SIGN_UP_SUCCESS
        },
        body: setPayloadData(event, {
            Data: newUserData
        })
    }
}

const verifyGoogleToken = async (authToken, platform) => {
    const token = authToken;
    let googleClient = "";
    switch (platform) {
        case process.env.APP_PLATFORM_IOS:
            googleClient = process.env.GOOGLE_AUTH_CLIENT_ID_LIVE;
            break;
        case process.env.APP_PLATFORM_ANDROID:
            googleClient = process.env.GOOGLE_AUTH_CLIENT_ID_LIVE_ANDROID;
            break;
    }
    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(googleClient);
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: googleClient
        })
        const payload = ticket.getPayload();
        if (payload.aud === googleClient) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.log(error);
        return false;
    }
}

const verifyFacebookToken = async (authToken) => {
    const options = {
        method: "GET",
        uri: 'https://graph.facebook.com/debug_token',
        qs: {
            input_token: authToken,
            access_token: process.env.FACEBOOK_APP_ACCESS_TOKEN_LIVE
        }
    }
    try {
        var result = await request(options);
        var object = JSON.parse(result);
        console.log(object)
        if (object.data.app_id === process.env.FACEBOOK_APPID_LIVE && object.data.is_valid) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

const verifyAppleToken = async (authToken) => {
    try {
        var header = authToken.split('.');
        var jwtHead = Buffer.from(header[0], 'base64').toString();
        var kid = JSON.parse(jwtHead).kid;
        const publicKey = await fetchPublicKeyApple(kid);
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(authToken, publicKey, {
            audience: process.env.APPLE_APP_NAME,
            issuer: process.env.APPLE_ISSUER
        })
        console.log(decoded)
    } catch (error) {
        console.log(error)
        return false;
    }
    return true;
}

const fetchPublicKeyApple = async (kid) => {
    return new Promise((resolve, reject) => {
        const jwksClient = require('jwks-rsa');
        const client = jwksClient({
            jwksUri: 'https://appleid.apple.com/auth/keys'
        });
        client.getSigningKey(kid, (err, key) => {
            resolve(key.getPublicKey());
        });
    })
}

module.exports.updateProfile = async event => {
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var connected = false;
        if (
            !json ||
            !json.UserId ||
            !json.Name ||
            !json.Email ||
            !json.Contact ||
            typeof json.Gender !== 'number' ||
            json.Gender < 0 ||
            json.Gender > 1 ||
            !json.Zip
            // !json.HouseNumber
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require("knex")(con);
        connected = true;
        var userExists = await fetchUser(knex, null, null, json.UserId);
        if (userExists.Error || userExists.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_FOUND_TRY_AGAIN);
        }
        var userExist = userExists[0];
        var updateObj = {};
        if (json.Name && typeof json.Name === 'string' && json.Name.trim() !== "") {
            if (json.Name !== userExist.Name) {
                updateObj.Name = json.Name;
            }
        }
        if (json.Contact && typeof json.Contact === 'string' && json.Contact.trim() !== "") {
            if (json.Contact !== userExist.Contact) {
                updateObj.Contact = json.Contact;
            }
        }
        if (json.Gender !== userExist.Gender) {
            updateObj.Gender = json.Gender;
        }
        if (json.ImagePath && typeof json.ImagePath === 'string' && json.ImagePath.trim() !== "") {
            if (json.ImagePath !== userExist.ImagePath) {
                updateObj.ImagePath = json.ImagePath;
            }
        }
        if (typeof json.Street === 'string') {
            if (json.Street !== userExist.Street) {
                updateObj.Street = json.Street;
            }
        }
        if (json.HouseNumber && typeof json.HouseNumber === 'string') {
            if (json.HouseNumber !== userExist.HouseNumber) {
                updateObj.HouseNumber = json.HouseNumber;
            }
        }
        if (json.City && typeof json.City === 'string' && json.City.trim() !== "") {
            if (json.City !== userExist.City) {
                updateObj.City = json.City;
            }
        }
        if (json.Notes !== userExist.Notes) {
            updateObj.Notes = json.Notes ? json.Notes.trim() : null;
        }
        if (json.Floor !== userExist.Floor) {
            if (json.Floor && typeof json.Floor === "string" && json.Floor.length > 30) {
                json.Floor = json.Floor.substr(0, 30);
            }
            updateObj.Floor = json.Floor;
        }
        if (json.Zip !== userExist.Zip) {
            updateObj.Zip = json.Zip;
        }
        if (json.Therapist !== userExist.Therapist) {
            updateObj.Therapist = json.Therapist;
        }
        if (json.Latitude) {
            if (json.Latitude !== userExist.Latitude) {
                updateObj.Latitude = json.Latitude;
            }
        }
        if (json.Longitude) {
            if (json.Longitude !== userExist.Longitude) {
                updateObj.Longitude = json.Longitude;
            }
        }
        if (json.ReachOutTime) {
            if (json.ReachOutTime !== userExist.ReachOutTime) {
                updateObj.ReachOutTime = json.ReachOutTime;
            }
        }
        if (json.Elevator !== userExist.Elevator) {
            updateObj.Elevator = json.Elevator;
        }
        if (json.HouseNumber !== userExist.HouseNumber) {
            updateObj.HouseNumber = json.HouseNumber;
        }
        if (json.Distance !== userExist.Distance) {
            updateObj.Distance = json.Distance;
        }

        if (typeof json.IsCalPermitted !== "undefined") {
            updateObj.IsCalPermitted = json.IsCalPermitted ? 1 : 0;
        }
        var userData;
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            var userUpdated = await knex(USERS).where("UserId", "=", json.UserId).update(updateObj);
            if (!userUpdated) {
                throw new Error(MESSAGE.USER_NOT_UPDATED_TRY_AGAIN);
            }
            userData = await fetchUser(knex, null, null, json.UserId);
            if (userData.Error) {
                throw new Error(userData.Error);
            }
            if (userData[0] && userData[0].ImagePath) {
                userData[0].ImageURL = process.env.BUCKET_URL + userData[0].ImagePath;
            }
        } else {
            userData = userExist;
            if (userData.ImagePath) {
                userData.ImageURL = process.env.BUCKET_URL + userData.ImagePath;
            }
        }
        // knex.destroy().then(() => { })
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
            Message: MESSAGE.PROFILE_UPDATED_SUCCESS
        },
        body: setPayloadData(event, {
            Data: userData
        })
    }
}

module.exports.updateUserExtras = async event => {
    let knex, connected = true, response;
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
        if (headers['api-client'] === process.env.API_CLIENT_COCON_APP) {
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
        if (headers['api-client'] === process.env.API_CLIENT_COCON_APP) {
            if (
                !json ||
                !json.UserId
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            let response = {};
            let updateObj = {};
            if (json.LastMessageRead) {
                updateObj.LastMessageRead = moment(json.LastMessageRead).utc().toDate();
                response.LastMessageRead = json.LastMessageRead;
            }
            if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
                updateObj.CoconNotes = json.CoconNotes;
                response.CoconNotes = json.CoconNotes;
            }
            if (json.FcmToken) {
                updateObj.FcmToken = json.FcmToken;
                try {
                    const admin = InitializeFirebase();
                    let subscribe = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC);
                    let subscribeToAll = await admin.messaging().subscribeToTopic(json.FcmToken, process.env.BROADCAST_TOPIC_ALL);
        
                    // Unsubscribe from guest topic
                    let unsub = await admin.messaging().unsubscribeFromTopic(json.FcmToken, process.env.BROADCAST_TOPIC_GUEST);
                } catch (error) {
                    console.log(error);
                }
            }
            knex = require('knex')(con);
            if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                let userExtraUpdated = await knex(USERS).where("UserId", "=", json.UserId).update(updateObj);
            }
            await knex.destroy();
        } else if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            if (
                !json ||
                !json.StaffId
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            let updateObj = {};
            if (json.FcmToken) {
                updateObj.FcmToken = json.FcmToken;
            }
            knex = require('knex')(con);
            if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                let staffExtraUpdated = await knex(STAFF).where("StaffId", "=", json.StaffId).update(updateObj);
                if (updateObj.FcmToken) {
                    try {
                        const admin = InitializeFirebaseTherapist();
                        console.log("trying to subscribe")
                        let subscribe = await admin.messaging().subscribeToTopic(updateObj.FcmToken, process.env.BROADCAST_TOPIC_THERAPIST);
                        console.log(subscribe)
                        let subscribeToAll = await admin.messaging().subscribeToTopic(updateObj.FcmToken, process.env.BROADCAST_TOPIC_ALL);
                    } catch (error) {
                        console.log(error);
                    }
                }
            }
            await knex.destroy();
        }
    } catch (error) {
        console.log(error)
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
            Message: MESSAGE.USER_EXTRA_UPDATES_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.checkUserEmail = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Email
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        console.log(json)
        var knex = require("knex")(con);
        let emailExist = await knex(USERS).select("UserId", "Name").where("Email", "=", json.Email)
        .modify(qb => {
            if(json.UserId){
                qb.andWhere("UserId", "!=", json.UserId)
            }
            
            console.log(qb.toSQL().toNative())
        });
        
        await knex.destroy();
        if (emailExist.length > 0) {
            return {
                statusCode: 300,
                headers: {
                    ...Headers,
                    message: MESSAGE.USER_EMAIL_ALREADY_EXIST
                }
            }
        } else {
            return {
                statusCode: 200,
                headers: {
                    ...Headers,
                    message: MESSAGE.USER_CAN_BE_REGISTERED
                }
            }
        }
    } catch (error) {
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }
}

module.exports.sendChatPush = async event => {
    let knex, connected;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json || typeof json.Type !== "number" ||
            !json.Message || typeof json.Message !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const type = json.Type;
        switch (type) {
            case 0: {
                if (!json.UserId || typeof json.UserId !== "number") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
            case 1: {
                if (!json.StaffId || typeof json.StaffId !== "number") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
        }
        knex = require("knex")(con);
        connected = true;
        switch (type) {
            case 0: {
                const userId = json.UserId;
                let userExist = await knex(USERS).select("UserId", "FcmToken").where("UserId", "=", userId);
                let title = PUSH.TITLE.CHAT_MSG_BY_COCON;
                let description = json.Message;
                if (userExist.length > 0 && userExist[0].FcmToken) {
                    const message = {
                        token: userExist[0].FcmToken,
                        notification: {
                            title: title,
                            body: description
                        },
                        data: {
                            ScreenName: PUSH.SCREEN.CHAT_SUPPORT
                        }
                    }
                    try {
                        const userApp = InitializeFirebase();
                        const sentNotification = await userApp.messaging().send(message);
                        console.log(sentNotification)
                    } catch (error) {
                        console.log(error);
                    }
                }
                break;
            }
            case 1: {
                const staffId = json.StaffId;
                let staffExist = await knex(STAFF).select("StaffId", "FcmToken").where("StaffId", "=", staffId);
                let title = PUSH.TITLE.CHAT_MSG_BY_COCON;
                let description = json.Message;
                if (staffExist.length > 0 && staffExist[0].FcmToken) {
                    const message = {
                        token: staffExist[0].FcmToken,
                        notification: {
                            title: title,
                            body: description
                        },
                        data: {
                            ScreenName: PUSH.SCREEN.CHAT_SUPPORT
                        }
                    }
                    try {
                        const therapistApp = InitializeFirebaseTherapist();
                        const sentNotifications = await therapistApp.messaging().send(message);
                        console.log(sentNotifications)
                    } catch (error) {
                        console.log(error);
                    }
                }
                break;
            }
        }
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
            ...Headers
        }
    }
}

module.exports.getUserDetail = async event => {
    let knex, connected = false, userDetail;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        let userRawData = await knex(USERS)
            .select(
                USERS+".UserId",
                "GoogleId",
                "FacebookId",
                "AppleId",
                "Name",
                "Email",
                "Contact",
                "Gender",
                "ImagePath",
                "Street",
                "HouseNumber",
                "Floor",
                "City",
                "Zip",
                "Elevator",
                "Latitude",
                "Longitude",
                "Notes",
                "CoconNotes",
                "Therapist",
                "IsCalPermitted",
                "Archive",
                "HouseNumber",
                "ReachOutTime",
                "Therapist",
                "CustomerId",
                "FromCMS",
                "DOB",
                "PreferredLanguage",
                "ClientSource",
                "CSNotes",
                "TherapistNotes",
                "FullAddress",
                USERS+".Created",
                ACCOUNT_DELETE_FEEDBACK+".Created as DeletedDate"
            )
            .where(USERS+".UserId", "=", userId)
            .leftJoin(ACCOUNT_DELETE_FEEDBACK, ACCOUNT_DELETE_FEEDBACK + '.UserId', USERS + ".UserId");
        userDetail = userRawData[0];
        console.log(userDetail)
        if(userDetail.CustomerId){
            const stripe = require('stripe')(STRIPE_SECRET,{  apiVersion:'2020-08-27'});
            const customer = await stripe.customers.retrieve(
                userDetail.CustomerId
              );
              userDetail.StripeEmail=customer.email
        }else{
            userDetail.StripeEmail=userDetail.Email
        }
        switch (userDetail.Therapist) {
            case 0: userDetail.TherapistString = "Male";
                break;
            case 1: userDetail.TherapistString = "Female";
                break;
            case 2: userDetail.TherapistString = "Either";
                break;
        }
        if (userDetail.ImagePath) {
            userDetail.ImageURL = process.env.BUCKET_URL + userDetail.ImagePath;
        }
        userDetail.MemberSince =moment(userDetail.Created).format('D MMMM  YYYY')

        const USER_CONSIDERED_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]
        const USER_CONSIDERED_PAST_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            // BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]

        let totalUserBookings = await knex(BOOKINGS).count("BookingId")
            .whereIn("Status", USER_CONSIDERED_BOOKINGS)
            .andWhere("UserId", "=", userDetail.UserId)
        userDetail.TotalBookings = totalUserBookings[0]['count(`BookingId`)']

        let totalTreatments = await knex
            .count(BOOKING_PRODUCTS + ".BookingProductId")
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + ".BookingId")
            .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
            .andWhere(BOOKINGS + ".UserId", "=", userDetail.UserId)
        userDetail.TotalTreatments = totalTreatments[0]['count(`BookingProduct`.`BookingProductId`)']

        let totalNetSales = await knex(BOOKINGS).sum("PaidPrice")
            .whereIn("Status", USER_CONSIDERED_BOOKINGS)
            .andWhere("UserId", "=", userDetail.UserId)
        userDetail.TotalNetSales = totalNetSales[0]['sum(`PaidPrice`)']
            ? totalNetSales[0]['sum(`PaidPrice`)']
            : 0;

        let apptDates = await knex(BOOKINGS)
            .max("DateTime")
            .min("DateTime")
            .whereIn("Status", USER_CONSIDERED_BOOKINGS)
            .andWhere("UserId", "=", userDetail.UserId);
        userDetail.FirstApptDate = apptDates[0]['min(`DateTime`)'] ? moment(apptDates[0]['min(`DateTime`)']).format(DATE_TIME_FORMAT.DD_MMM_YYYY) : "-";
        userDetail.LastApptDate = apptDates[0]['max(`DateTime`)'] ? moment(apptDates[0]['max(`DateTime`)']).format(DATE_TIME_FORMAT.DD_MMM_YYYY) : "-";
        
        let totalRatings = await knex
        .count(RATINGS + ".RatingId")
        .from(RATINGS)
        .andWhere(RATINGS + ".UserId", "=", userDetail.UserId)
        userDetail.TotalRating = totalRatings[0]['count(`Rating`.`RatingId`)']

        var columns = [
            knex.raw('SUM(EaseOfBooking + Professionalism+Experience+Quality+Value) As TotalRating'),
            
          ];
          let ratingResult = await knex
          .select(columns)
          .count(RATINGS + ".RatingId as RatingCount")
          .from(RATINGS)
          .andWhere(RATINGS + ".UserId", "=", userDetail.UserId)
          .groupBy(RATINGS + ".UserId")

          let AverageRating= 0
          if(ratingResult.length!=0){
            AverageRating= parseInt(ratingResult[0].TotalRating)/parseInt(ratingResult[0].RatingCount)
          }
          userDetail.AverageRating = AverageRating

          var columns = [
            knex.raw('SUM(TipAmount) As TotalTip'),
            
          ];
          let tipResult = await knex
          .select(columns)
          .from(BOOKING_TIPS)
          .andWhere(BOOKING_TIPS + ".UserId", "=", userDetail.UserId)
          .andWhere(BOOKING_TIPS + ".PaymentStatus", "=", 2)
          .groupBy(BOOKING_TIPS + ".UserId")
          console.log(tipResult)
          userDetail.TotalTip= 0
          if(tipResult.length!=0){
            userDetail.TotalTip = tipResult[0]['TotalTip']
          }

          let cancelBookingCount = await knex
          .count(BOOKINGS + ".BookingId as CancelledBooking")
          .from(BOOKINGS)
          .andWhere(BOOKINGS + ".Status", "=", BOOKING_STATUS.CANCELLED_MANUALLY)
          .andWhere(BOOKINGS + ".UserId", "=",userDetail.UserId )

        
         userDetail.CancelledBooking=cancelBookingCount[0].CancelledBooking

         let pastTherapist = await knex
         .distinct() 
         .select(STAFF+".Name",
          STAFF+".StaffId")
          .from(BOOKINGS)
          .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + ".BookingId")
          .leftJoin(STAFF, BOOKING_PRODUCTS + '.StaffId', STAFF + ".StaffId")
          .andWhere(BOOKINGS + ".UserId", "=", userDetail.UserId)
          .orderBy(BOOKINGS + ".DateTime", "desc")
          .whereIn(BOOKINGS+".Status", USER_CONSIDERED_PAST_BOOKINGS)
          console.log(pastTherapist)
          userDetail.PastTreatment=""
          userDetail.PastTreatmentCount=0
          if(pastTherapist.length>0){
            let pastTreatment=[]
            pastTherapist.forEach(ther=>{
                if(ther.Name){
                    pastTreatment.push(ther.Name)
                }
                
            })
            pastTreatmentNames=pastTreatment.slice(0, 2)
            userDetail.PastTreatment=pastTreatmentNames.join(", ");
            
           
            let pastTreatmentCount=pastTherapist.length-pastTreatmentNames.length
            
           
          userDetail.PastTreatmentCount=pastTreatmentCount
          }
          userDetail.Years= moment().diff(moment(userDetail.Created), "years");
          userDetail.Months= parseInt(moment().diff(moment(userDetail.Created), "months"))-parseInt(userDetail.Years*12)
          userDetail.Days= parseInt(moment().diff(moment(userDetail.Created), "days"))-parseInt(userDetail.Years*365)-parseInt(userDetail.Months*30)
          userDetail.Created= moment(userDetail.Created).format('DD MMMM YYYY')
          
          let userBookings=await bookings(knex,userDetail.UserId)
          userDetail.BookingHistory=userBookings
    

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
            message: MESSAGE.USER_DETAIL_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: userDetail
        })
    }
}
//API to fetch the limited user analytic detail for booking popver
module.exports.getUserAnalyticDetail = async event => {
    let knex, connected = false, userDetail;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        // let userRawData = await knex(USERS)
        //     .select(
                
        //         "ImagePath"
        //     )
        //     .where(USERS+".UserId", "=", userId)
           
        // userDetail = userRawData[0];
        // console.log(userDetail)
        
        // if (userDetail.ImagePath) {
        //     userDetail.ImageURL = process.env.BUCKET_URL + userDetail.ImagePath;
        // }
        
        userDetail={}
        const USER_CONSIDERED_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]


        let totalTreatments = await knex
            .count(BOOKING_PRODUCTS + ".BookingProductId")
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + ".BookingId")
            .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
            .andWhere(BOOKINGS + ".UserId", "=", userId)
            .modify(queryBuilder => {
                console.log(queryBuilder.toSQL().toNative())
            })
        userDetail.TotalTreatments = totalTreatments[0]['count(`BookingProduct`.`BookingProductId`)']? totalTreatments[0]['count(`BookingProduct`.`BookingProductId`)']:0

        let totalNetSales = await knex(BOOKINGS).sum("PaidPrice")
            .whereIn("Status", USER_CONSIDERED_BOOKINGS)
            .andWhere("UserId", "=", userId)
            .modify(queryBuilder => {
                console.log(queryBuilder.toSQL().toNative())
            })
        userDetail.TotalNetSales = totalNetSales[0]['sum(`PaidPrice`)']
            ? totalNetSales[0]['sum(`PaidPrice`)']
            : 0;

            let totalRatings = await knex
        .count(RATINGS + ".RatingId")
        .from(RATINGS)
        .andWhere(RATINGS + ".UserId", "=", userId)
        .modify(queryBuilder => {
            console.log(queryBuilder.toSQL().toNative())
        })
        userDetail.TotalRating = totalRatings[0]['count(`Rating`.`RatingId`)']?totalRatings[0]['count(`Rating`.`RatingId`)']:0

        
   

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
    console.log(userDetail)
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.USER_DETAIL_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: [userDetail]
        })
    }
}

module.exports.logout = async event => {
    let knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        let userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        let userExist = await knex(USERS).select("FcmToken").where("UserId", "=", userId);
        if (userExist.length <= 0) {
            throw new Error(MESSAGE.USER_NOT_FOUND_TRY_AGAIN);
        }
        let userData = userExist[0];
        if (userData.FcmToken) {
            let updateObj = {
                FcmToken: null,
            }
            let userUpdated = await knex(USERS)
                .where("UserId", "=", userId)
                .update(updateObj);

            // Unsubscribe from topics - User, all.
            const admin = InitializeFirebase();
            let unsubUser = await admin.messaging().unsubscribeFromTopic(userData.FcmToken, process.env.BROADCAST_TOPIC);
            let unsubscribeAll = await admin.messaging().unsubscribeFromTopic(userData.FcmToken, process.env.BROADCAST_TOPIC_ALL);
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

module.exports.updateUser = async event => {
    /**
     * API Objective: update user info on behalf of admin.
     * Working:
     * 1. Check for required data with type.
     * 2. Update given info to user.
     * 3. Update CoconEditTime to current time for given user in DB.
     * 4. Send push notification to user - that profile updated by admin.
     * 5. Return user detail.
     */

    /**
     * Allowed fields to update from API.
     * 1. Name
     * 2. Gender
     * 3. Floor
     * 4. Street
     * 5. Zip
     * 6. City
     * 7. Elevator
     * 8. Therapist
     * 9. Latitude
     * 10. Longitude
     * 11. ReachOutTime
     */

    let knex, connected = false, response;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (
            (json.Name && typeof json.Name !== "string") ||
            (typeof json.Gender === "number" && (json.Gender > 1 || json.Gender < 0)) ||
            (json.Floor && typeof json.Floor !== "number") ||
            (json.Street && typeof json.Street !== "string") ||
            (json.HouseNumber && typeof json.HouseNumber !== "string") ||
            (json.Zip && typeof json.Zip !== "string") ||
            (json.City && typeof json.City !== "string") ||
            (typeof json.Elevator === "number" && (json.Elevator > 1 || json.Elevator < 0)) ||
            (typeof json.Therapist === "number" && (json.Therapist > 2 || json.Therapist < 0)) ||
            (json.Latitude && typeof json.Latitude !== "string") ||
            (json.Longitude && typeof json.Longitude !== "string") ||
            (json.ReachOutTime && typeof json.ReachOutTime !== "number") ||
            (json.Notes && typeof json.Notes !== "string")
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        const userExist = await fetchUser(knex, null, null, userId);
        if (userExist.length === 0) {
            throw new Error(MESSAGE.SWW_TRY_AGAIN);
        }
        let updateObj = {}
        json.Name
            ? updateObj.Name = json.Name.trim()
            : true;
        typeof json.Gender === "number"
            ? updateObj.Gender = json.Gender
            : true;
        json.Floor
            ? updateObj.Floor = json.Floor
            : true;
        json.Street
            ? updateObj.Street = json.Street
            : true;
        json.HouseNumber
            ? updateObj.HouseNumber = json.HouseNumber
            : true;
        json.Zip
            ? updateObj.Zip = json.Zip
            : true;
        json.City
            ? updateObj.City = json.City
            : true;
        typeof json.Elevator === "number"
            ? updateObj.Elevator = json.Elevator
            : true;
        typeof json.Therapist === "number"
            ? updateObj.Therapist = json.Therapist
            : true;
        json.Latitude
            ? updateObj.Latitude = json.Latitude
            : true;
        json.Longitude
            ? updateObj.Longitude = json.Longitude
            : true;
        typeof json.ReachOutTime === "number"
            ? updateObj.ReachOutTime = json.ReachOutTime
            : true;
        json.Notes
            ? updateObj.Notes = json.Notes
            : true;
        json.Distance
            ? updateObj.Distance = json.Distance
            : true;
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.CoconLastUpdated = zone.getLastUpdate();
            updateObj.LastUpdated = zone.getLastUpdate();
            let userUpdated = await knex(USERS)
                .where("UserId", "=", userId)
                .update(updateObj);
            if (userExist[0].FcmToken) {
                const message = {
                    token: userExist[0].FcmToken,
                    notification: {
                        title: PUSH.TITLE.PROFILE_UPDATED,
                        body: PUSH.DESCRIPTION.PROFILE_UPDATED
                    },
                    data: {
                        ScreenName: PUSH.SCREEN.PROFILE_UPDATE
                    }
                }
                try {
                    const userApp = InitializeFirebase();
                    const sentNotification = await userApp.messaging().send(message);
                    console.log(sentNotification)
                } catch (error) {
                    console.log(error);
                }
            }
        }
        response = {}
        const userUpdatedData = await fetchUser(knex, null, null, userId);
        response = userUpdatedData[0];
        if (response.ImagePath) {
            response.ImageURL = process.env.BUCKET_URL + response.ImagePath;
        }
        switch (response.Therapist) {
            case 0: response.TherapistString = "Male";
                break;
            case 1: response.TherapistString = "Female";
                break;
            case 2: response.TherapistString = "Either";
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
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.USER_PROFILE_UPDATED_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.deleteUser = async event => {
    /**
     * API Objective: set a user as Archive (in case of delete account from user App)
     * Working:
     * 1. Update user info to null ( as per apple policy).
     * 2. Update CoconEditTime to current time for given user in DB.
     * 3. Unsubscribe user from firebase and also delete user from firebase realtime database and its chat also
     * 4. Delete user image from S3 bucket
     * 5. Delete user stripe details and delete user's stripe account
     */


    let knex, connected = false, response;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
       
        const userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        const userExist = await fetchUser(knex, null, null, userId);
        if (userExist.length === 0) {
            throw new Error(MESSAGE.SWW_TRY_AGAIN);
        }
        let updateObj = {
            // "Name":null,
            "Email":null,















































            
            "GoogleId":null,
            "FacebookId":null,
            "AppleId":null,
            "Contact":null,
            "Gender":null,
            "ImagePath":null,
            // "Street":null,
            // "Floor":null,
            "Elevator":false,
            // "City":null,
            // "Zip":null,
            // "Notes":null,
            "Latitude":null,
            "Longitude":null,
            "DeviceId":null,
            "Platform":null,
            "FcmToken":null,
            // "CustomerId":null,
            "Archive":1,
            "Therapist":0

        }
        
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.CoconLastUpdated = zone.getLastUpdate();
            updateObj.LastUpdated = zone.getLastUpdate();
            let userUpdated = await knex(USERS)
                .where("UserId", "=", userId)
                .update(updateObj);
            //delete user's message from usermessage table

            let deleteUserMessage = await knex(USER_MESSAGES).where("UserId", "=", userId).del();
            
            //delete user from firebase database and its chat too
            
            const admin = InitializeFirebase();
            var db = admin.database();
            var userRef = db.ref(process.env.FIREBASE_BASE_REF+USER_REF); 
            var userMsgRef = db.ref(process.env.FIREBASE_BASE_REF+USER_MESSAGE_REF); 
            
            userRef.child(userExist[0].UserId).remove();
            userMsgRef.child(userExist[0].UserId).remove();

            //delete image from S3

            if (userExist[0].ImagePath) {
                var aws = require('aws-sdk');
                const s3 = new aws.S3({
                    accessKeyId: process.env.BUCKET_ACCESS_KEY,
                    secretAccessKey: process.env.BUCKET_SECRET,
                    region: process.env.BUCKET_REGION
                });
                const params = {
                    Bucket: process.env.BUCKET_NAME,
                    Key: userExist[0].ImagePath
                };

                var deleted = await s3.deleteObject(params).promise();
                if (!deleted) {
                    throw new Error(MESSAGE.IMAGE_NOT_DELETED);
                }
                
            }
            //delete fcm subscription 
            if (userExist[0].FcmToken) {
                // const admin = InitializeFirebase();
                let unsubUser = await admin.messaging().unsubscribeFromTopic(userExist[0].FcmToken, process.env.BROADCAST_TOPIC);
                let unsubscribeAll = await admin.messaging().unsubscribeFromTopic(userExist[0].FcmToken, process.env.BROADCAST_TOPIC_ALL);
                // var db = admin.database();
                // var userRef = db.ref(process.env.FIREBASE_BASE_REF+USER_REF); 
                // var userMsgRef = db.ref(process.env.FIREBASE_BASE_REF+USER_MESSAGE_REF); 
                
                // userRef.child(userExist[0].UserId).remove();
                // userMsgRef.child(userExist[0].UserId).remove();
            }
            if (userExist[0].CustomerId) {
                const stripe = require('stripe')(process.env.STRIPE_SECRET,{  apiVersion:'2020-08-27'});

                const customer = await stripe.customers.update(
                    userExist[0].CustomerId,
                    { email: null }

                    
                );
               
                const paymentMethods = await stripe.paymentMethods.list({
                    customer:userExist[0].CustomerId,
                    type: 'card',
                  });
                  if(paymentMethods){
                    const paymentMethodDetach=[];
                    paymentMethods.data.forEach(async element => {
                        await stripe.paymentMethods.detach(
                            element.id
                          );
                    });
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
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.USER_DELETED_SUCCESS
        },
        body: setPayloadData(event, {
            Data: []
        })
    }
}

module.exports.saveAccountDeleteFeedback = async event => {
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
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

       
         knex = require("knex")(con);
        
        connected = true;
        
        let insertedData = await knex(ACCOUNT_DELETE_FEEDBACK)
            .insert({
                IssueType: json.IssueType,
                UserId: json.UserId,
                Feedback:(json.Feedback)?json.Feedback:"",
                ...zone.getCreateUpdate()
            })

        const feedbackId = insertedData[0];
        let user = await knex(USERS).select("Name").where("UserId", "=", json.UserId);
        let feedback = await knex(ACCOUNT_DELETE_FEEDBACK).select("*").where("AccountDeleteFeedbackId", "=", feedbackId);
        console.log(user)
        console.log(feedback)
        let issueType=""
       
        switch (feedback[0].IssueType) {
            case 0:
                issueType = DELETE_REASON.SERVICE_ANYMORE;
                break;
            case 1:
                issueType = DELETE_REASON.HOW_IT_WORKS;
                break;
            case 2:
                issueType = DELETE_REASON.TECHNICAL_ISSUE;
                break;
            case 3:
                issueType = DELETE_REASON.FINDING_HARD;
                break;
            case 4:
                issueType = DELETE_REASON.ISSUE_WITH_SERVICE;
                break;
            case 5:
                issueType = DELETE_REASON.OTHER;
                break;

        }
        mailHtml=`<div style="background-color: #ffffff;width:100%;padding:1%;font-family: Raleway, sans-serif;color: #3a312d;letter-spacing: 1px">
        <div style="width: 100%;">
            <div style="width: 100%;text-align: center;">
                <img width="50px" src="https://cocon-frontend-internal-testing.s3.eu-west-3.amazonaws.com/assets/images/logo/logo_email.png">
            </div>
            <div style="width: 100%;text-align: center;">
                <h1 style="color: #514844;font-weight: 500;letter-spacing: 0.5px;font-size: 30px;margin-top: 5px;">COCON</h1>
            </div>
            <div>
                <h4 style="font-weight: 500;font-size: 17px;">Hi there,</h4>
                <h4 style="font-weight: 500;font-size: 17px;">This is to inform you that one of the COCON app users ${user[0].Name} has deleted their account.</h4>
            </div>
            <div>
                <h4 style="font-weight: 500;font-size: 17px;">Deletion time: ${momentz.tz(feedback[0].Created, process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.MMM_DD_YYYYC_HHcmm + " " + DATE_TIME_FORMAT.z)}</h4>
            </div>
            <div>
                <h4 style="font-weight: 500;font-size: 17px;">Reason: ${issueType}</h4>`;

                if(feedback[0].Feedback && feedback[0].Feedback!=''){
                    mailHtml+=`<h4 style="font-weight: 500;font-size: 17px;">User Feedback: ${feedback[0].Feedback}</h4>`;
                }
                
            mailHtml+=`</div>
            
            <div style="margin-top: 10px;font-family: Raleway, sans-serif">
                
                <h4 style="font-weight: 500;font-size: 18px;font-family: spectral;">COCON Company BV</h4>
                
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
            subject: "User deleted",
            html: mailHtml
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

const bookings = async (knex,userId)=>{
    try {
        const USER_CONSIDERED_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]
        let bookingsData = await knex
            .select(
                BOOKINGS + '.BookingId',
                BOOKINGS + '.Amount',
                BOOKINGS + '.PromoCode',
                BOOKINGS + '.PromoAmount',
                BOOKINGS + '.PaidPrice',
                BOOKINGS + '.Duration',
                BOOKINGS + '.DateTime',
                BOOKINGS + '.LastUpdated',
                BOOKING_PRODUCTS + '.BookingProductId',
                BOOKING_PRODUCTS + '.ProductId',
                BOOKING_PRODUCTS + '.Product',
                STAFF + ".Name as ProductStaffName",
                STAFF + ".StaffId",
                BOOKINGS + '.Status',
                BOOKINGS + '.Created',
                BOOKING_EXTRA + ".AdminNotes",
            )
            .from(BOOKINGS)
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + '.BookingId')
            .leftJoin(STAFF, STAFF + '.StaffId', BOOKING_PRODUCTS + '.StaffId')
            .leftJoin(BOOKING_EXTRA, BOOKING_EXTRA + ".BookingId", BOOKINGS + ".BookingId")
            .where(BOOKINGS + ".UserId", "=", userId)
            .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
            .orderBy(BOOKINGS + ".DateTime", "desc")
            console.log(bookingsData)
        let finalData = [];
        for (let bookingInc = 0; bookingInc < bookingsData.length; bookingInc++) {
            const booking = bookingsData[bookingInc];
            booking.StatusName = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name;
            booking.StatusColor = BOOKING_STATUS_DESC.find(f => f.code === booking.Status).color;
            const found = finalData.find(book => book.BookingId === booking.BookingId);
            if (!found) {
                let objToPush = {
                    BookingId: booking.BookingId,
                    Amount: booking.Amount,
                    PromoCode: booking.PromoCode,
                    PromoAmount: booking.PromoAmount,
                    PaidPrice: booking.PaidPrice,
                    Duration: booking.Duration,
                    DateTime: booking.DateTime,
                    Status: booking.Status,
                    StatusName: booking.StatusName,
                    StatusColor: booking.StatusColor,
                    LastUpdated: booking.LastUpdated,
                    Products: [],
                    Created: moment(booking.Created).format('D MMMM  YYYY'),
                    TimeZone: {
                        Zone: process.env.STAFF_ZONE
                    },
                    DateTimeToShow : moment(booking.DateTime).format('ddd') + ', ' +moment(booking.DateTime).format('DD MM.YY'),
                    AdminNotes: booking.AdminNotes
                }
                let prodPushObj
                try {
                    prodPushObj = {
                        BookingProductId: booking.BookingProductId,
                        ProductId: booking.ProductId,
                        Product: booking.Product,
                        StaffName: booking.ProductStaffName,
                        StaffId: booking.StaffId
                    }
                } catch (error) {
                    console.log(booking)
                }
                objToPush.Products.push(prodPushObj);
                finalData.push(objToPush);
            } else {
                let  prodPushObj = {
                    BookingProductId: booking.BookingProductId,
                    ProductId: booking.ProductId,
                    Product: booking.Product,
                    StaffName: booking.ProductStaffName
                }
                found.Products.push(prodPushObj)
            }
        
        }
        return finalData;
    } catch (err) {
        console.log(err);
        return {
            Error: err.message
        }
    }
}

module.exports.fetchOrganisationAdmin = async event => {
    let knex, response;
try{
    knex = require("knex")(con);
        const json = event.body ? getPayloadData(event) : null;
        var adminData = await this.getAdmins(knex, json ? {
            pagination: json.Pagination,
            sort: json.Sort,
            filters: json.Filters,
            search: json.Search,
            lastUpdated: json.LastUpdated,
            currentIds: json.CurrentIds,
            organisationLocationId:json.OrganisationLocationId?json.OrganisationLocationId:null
        }: null);
        if (adminData.Error) {
            throw new Error(promoData.Error);
        }
        var lastUpdated = moment().utc().format();
        // Prepare response
        response = {
            Data: adminData.data,
            CurrentIds: adminData.currentIds,
            LastUpdated: lastUpdated,
            TotalItems: !json.Search ? await getAdminCount(knex, json.Filters,json.OrganisationLocationId) : 0,
            Pagination: {
                ...json.Pagination
            }
        };


}catch(error){

}
return {
    statusCode: 200,
    headers: {
        ...Headers,
        Message: MESSAGE.USER_LOGGED_IN
    },
    body: setPayloadData(event, {
        ...response
    })
}

}
const AMDIN_SORT_KEYS = [
    "Name", 
    "Email", 
    "Contact"
];

module.exports.getAdmins = async (knex, criteria) => {
    try {
        const {
            pagination,
            sort,
            filters,
            search,
            lastUpdated,
            currentIds,
            organisationLocationId
        } = criteria ? criteria : {pagination: {Size: 20, Number: 0}};
        console.log(pagination)
        // console.log(pagination)
        var adminIds = await knex
            .pluck(ADMIN + '.AdminId')
            .from(ADMIN)
            .modify(queryBuilder => {
                
                queryBuilder.whereNotNull(ADMIN + ".OrganisationLocationId")
                queryBuilder.andWhere(ADMIN + ".Deleted", "=", 0)
                if(organisationLocationId){
                    queryBuilder.andWhere(ADMIN + ".OrganisationLocationId", "=", organisationLocationId)
                }
                   
                    if (sort && sort.Key && AMDIN_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(ADMIN + ".Created", "desc")
                    }
                    if(search){
                        queryBuilder.andWhere(function() {
                            this.where(ADMIN + ".Name", "like", `%${search}%`)
                        .orWhere(ADMIN + ".Email", "like", `%${search}%`)
                        .orWhere(ADMIN + ".Contact", "like", `%${search}%`)
                        })
                        
                        
                    }else{
                        queryBuilder.limit(pagination.Size);
                            if (pagination.Number > 1) {
                                let offset = pagination.Size * (pagination.Number - 1);
                                queryBuilder.offset(offset)
                            }
                            
                    }
                    
                    console.log(queryBuilder.toSQL().toNative()) 
                }
                
            )

        // Fetch promocode and its category data
        var adminData = await knex
            .select(
                ADMIN + '.AdminId',
                ADMIN + '.Name',
                ADMIN + '.Email',
                ADMIN + '.Contact',
                ORGANISATION_LOCATION + '.Name as OrganisationName',
                ORGANISATION_LOCATION + '.OrganisationLocationId as OrganisationLocationId',
                ADMIN + ".ProfileImagePath"
                
            ).from(ADMIN)
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', ADMIN + '.OrganisationLocationId')
            .modify(queryBuilder => {
                queryBuilder.whereIn(ADMIN + ".AdminId", adminIds)
                if (lastUpdated && currentIds) {
                    // check for mismatched ids fetch to fetch those promocode as well
                    var missedPromocodesIds = promoCodeIds.filter( function(n) { 
                        return !this.has(n) }, new Set(currentIds) 
                    );
                    queryBuilder.where(ADMIN + ".LastUpdated", ">", lastUpdated)
                }
                if (sort && sort.Key && AMDIN_SORT_KEYS.includes(sort.Key)) {
                    queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                } else {
                    queryBuilder.orderBy(ADMIN + ".Created", "desc")
                }
            })

        var finalData = [];
        console.log(adminData)
        adminData.forEach(admin => {
            let objToPush={
                AdminId: admin.AdminId,
                Name: admin.Name,
                Email: admin.Email,
                OrganisationName: admin.OrganisationName,
                Contact: admin.Contact,
                ProfileImagePath: admin.ProfileImagePath,
                OrganisationLocationId: admin.OrganisationLocationId,
                
            }
            if(objToPush.ProfileImagePath!=null){
                objToPush.ProfImageURL = process.env.BUCKET_URL + objToPush.ProfileImagePath;
            }else{
                objToPush.ProfImageURL = null;
            }
            finalData.push(objToPush)
        });
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }

    return {
        data: finalData,
        currentIds: adminIds,
    };
    
}


const getAdminCount = async (knex, filters,organisationLocationId) => {
    var adminData = await knex
    .count(
        ADMIN + '.AdminId',
    ).from(ADMIN)
    .whereNotNull(ADMIN + ".OrganisationLocationId")
    .andWhere(ADMIN + ".Deleted", "=", 0)
    .modify(queryBuilder => {
        if(organisationLocationId){
            queryBuilder.andWhere(ADMIN + ".OrganisationLocationId", "=", organisationLocationId)
        }
        console.log(queryBuilder.toSQL().toNative()) 
    });
    return adminData[0]['count(`Admin`.`AdminId`)'];
}

module.exports.newAdmin = async event => {
    var inserted, insertedLocation, response = []
    let knex, connected = false;
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
        console.log(json)
        console.log("json.Name",json.Name)
        console.log("json.Email",json.Email)
        console.log("json.OrganisationLocationId",json.OrganisationLocationId)
        console.log("json.Contact",json.Contact)
       
        if (
            !json ||
            !json.Name ||
            !json.Email ||
            !json.OrganisationLocationId ||
            !json.Contact

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;

        // check if email already exists in location or admin
    
        let adminExist = await knex(ADMIN).select("AdminId")
        .where(ADMIN+".Email", "=", json.Email)
        .andWhere(ADMIN+".Deleted","=",0);
        
        console.log(adminExist)
        if (adminExist.length > 0) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.ADMIN_EMAIL_ALREADY_EXIST

                }
            }
        }
        // calculate reach out time
        console.log("innsss");
        
        // create random password
        let password = await generatePassword();
        if (!password) {
            throw new Error(MESSAGE.PASSWORD_CREATION_FAILED);
        }


        var adminData = {
            Name: json.Name,
            Email: json.Email,
            password: md5(password),
            Contact: json.Contact,
            Type: ADMIN_TYPE.Organisation,
            OrganisationLocationId: json.OrganisationLocationId,
            ProfileImagePath: (json.ProfileImagePath) ? json.ProfileImagePath : null,
            ...zone.getCreateUpdate()
        }
        console.log(adminData)
        var insertedAdmin = await knex(ADMIN).insert({
            ...adminData
        })
        if (insertedAdmin.length <= 0) {
            throw new Error(MESSAGE.ADMIN_ACCOUNT_NOT_CREATED);
        }
        response = {
            Email: json.Email,
            Password: password
        }
        console.log(response)
       try{
        let newHtm = ` <div style="
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
            <h4 style="font-weight: 500; font-size: 17px">Dear ${json.Name},</h4>
            <h4 style="font-weight: 500; font-size: 17px">We are delighted to inform you that your account setup for COCON's Web portal has been completed successfully! As one of our esteemed B2B partners, you now have access to our comprehensive platform for therapist fulfillment at your spa, where you can see our availability for our guests. We are working hard so that soon we can expand into allowing you to directly book your treatments with us.</h4>
<h4 style="font-weight: 500; font-size: 17px">To access your account, please use the following login credentials:</h4>

<p>
<span style="font-size:17px; font-family: Raleway, sans-serif;
color: #3a312d;font-weight: bold">URL: ${process.env.CMS_URL}#/login</span>
<br />   
    <span style="font-size:17px; font-family: Raleway, sans-serif;
    color: #3a312d;font-weight: bold">Email: ${json.Email}</span>
    <br />
    <span style="font-size:17px; font-family: Raleway, sans-serif;
    color: #3a312d;font-weight: bold">Password: ${password}</span>
</p>
<p>
<span style="font-size:17px;font-weight: 500">We recommend that you keep these credentials confidential to maintain the security of your account, but as we only have the possibility of having 1 email account per Organization for now, we encourage you to share this login information with your relevant team members.</span>
</p>
<p>
<ul style="font-size:17px;font-weight: 500">Some useful information:
<li>If you need to reset your password in the future, please send an e-mail to pedro@coconcompany.com with the subject "[Urgent]: Password Changes to COCON Web Portal";</li>
<li>Please note that this email is automated and originates from an unmonitored mailbox;</li></ul>
</p>
<p>
<span style="font-size:17px;font-weight: 500">Thank you for choosing COCON as your trusted partner in therapist fulfillment. Should you require any further information, please don't hesitate to reach out to us.</span>
</p>
<p>
<span>Warm regards,</span>
                                    <br />
                                    <span>COCON Team</span>
                                    <br />
                                    <br />
</p>`

        let toMails = [json.Email];
        let mailSubject = "Your Cocon account has been set up."
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

       }catch(error){
        console.log(error)
       }


        // create log for create
        await saveLog(knex,json.AdminId,ADMIN,insertedAdmin[0],LOG_ACTION_TYPE.CREATE)

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
            message: MESSAGE.ADMIN_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}
module.exports.adminLogout = async event => {
    let knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.AdminId || typeof json.AdminId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
       
        knex = require("knex")(con);
        connected = true;
        // Save log for logout
        await saveLog(knex,json.AdminId,ADMIN,json.AdminId,LOG_ACTION_TYPE.LOGOUT)
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

module.exports.updateAdmin = async event => {
    var inserted, insertedLocation, response = []
    let knex, connected = false;
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
        console.log(json)
        console.log("json.Name",json.Name)
        console.log("json.Email",json.Email)
        console.log("json.OrganisationLocationId",json.OrganisationLocationId)
        console.log("json.Contact",json.Contact)
       
        if (
            !json ||
            !json.Name ||
            !json.Email ||
            !json.OrganisationLocationId ||
            !json.Contact||
            !json.UpdateAdminId

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;

        // check if email already exists in location or admin
    
        let adminExist = await knex(ADMIN).select("AdminId")
        .where(ADMIN+".Email", "=", json.Email)
        .andWhere(ADMIN+".Deleted","=",0)
        .andWhere(ADMIN+".AdminId","!=",json.UpdateAdminId)
        .modify(queryBuilder => {
            console.log(queryBuilder.toSQL().toNative())
        });
        
        console.log("adminExist",adminExist)
        if (adminExist.length > 0) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.ADMIN_EMAIL_ALREADY_EXIST

                }
            }
        }
        // calculate reach out time
        console.log("innsss");
        
       

        var updateData = {
            Name: json.Name,
            Email: json.Email,
            Contact: json.Contact,
            Type: ADMIN_TYPE.Organisation,
            OrganisationLocationId: json.OrganisationLocationId,
            ProfileImagePath: (json.ProfileImagePath) ? json.ProfileImagePath : null,
            ...zone.getLastUpdate()
        }
        var updated = await knex(ADMIN)
        .where("AdminId", "=", json.UpdateAdminId)
        .update({
            ...updateData
        })
    if (updated.length <= 0) {
        throw new Error(MESSAGE.UPDATE_ORGANISATION_ADMIN_FAILED);
    }
       

        // create log for update
        await saveLog(knex,json.AdminId,ADMIN,json.UpdateAdminId,LOG_ACTION_TYPE.UPDATE)

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
            message: MESSAGE.ADMIN_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: []
        })
    }
}

module.exports.deleteAdmin = async event => {
    var response = []
    let knex, connected = false;

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
            !json.DeleteAdminId

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;


        // This is an existing location, entries will be updated

        var data = {
            Deleted: 1,
            ...zone.getLastUpdate()
        }
       
        var updatedAdmin = await knex(ADMIN)
            .where("AdminId", "=", json.DeleteAdminId)
            .update({
                ...data
            })
        if (updatedAdmin.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_ADMIN_FAILED);
        }



         // Save log for delete
         await saveLog(knex,json.AdminId,ADMIN,json.DeleteAdminId,LOG_ACTION_TYPE.DELETE)
         
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
            message: MESSAGE.ADMIN_DELETE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.updateUserNotes = async event => {
    let knex, connected = false, bookingData;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // //console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.UserId || typeof json.UserId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const userId = json.UserId;
        knex = require("knex")(con);
        connected = true;
        const userExist = await knex(USERS).select("UserId").where("UserId", "=", userId);
        if (userExist.length === 0) {
            throw new Error(MESSAGE.SOMETHING_WENT_WRONG);
        }
        if(json.Type=='CSNotes'){
            let updateObj = {
                CSNotes: json.CSNotes?json.CSNotes.trim():null,
                LastUpdated: zone.getLastUpdate()
            }
            const csNotes = await knex(USERS)
                .where("UserId", "=", userId)
                .update(updateObj);
        }else{
            let updateObj = {
                TherapistNotes: json.TherapistNotes?json.TherapistNotes.trim():null,
                LastUpdated: zone.getLastUpdate()
            }
            const notes = await knex(USERS)
                .where("UserId", "=", userId)
                .update(updateObj);
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
            message: MESSAGE.NOTES_SUCCESS
        },
        body: setPayloadData(event, {
            Data: bookingData
        })
    }
}

