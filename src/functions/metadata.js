const { con } = require("../db.js");
const { verifyAccessToken } = require("./authorize")
const { Headers } = require("../header");
const {
    BANK,
    SECTION,
    CATEGORIES,
    LANGUAGE,
    LOCATION_REQUEST,
    CENTER,
    MESSAGES,
    USERS,
    USER_MESSAGES,
    STAFF,
    STAFF_CATEGORY,
    PRODUCTS,
    PRODUCT_TRANSLATIONS,
    STAFF_GROUP,
    STAFF_METADATA,
    STAFF_PRODUCT,
    APP_VERSIONS,
    PRODUCT_DURATIONS,
    SPECIAL_REQUEST,
    BOOKING_CHANNEL,
    BUSINESS_TYPE,
    BOOKING_INSTRUCTIONS,
    SERVICE_ZIPCODE
} = require("../tables");
const DELETE_FLAG = 0;
const { addOnCMS } = require('./addOn');
const zone = require("../zone");
const moment = require("moment");
const {
    BOOKING_STATUS_DESC,
    BOOKING_STATUS,
    BOOKING_NOT_ALLOWED_TO_CANCEL
} = require("../status");
const { MESSAGE } = require("../strings");
const { getGlobalDispatchSettings } = require("./bookings.js");
const { checkHeaders, getPayloadData, setPayloadData } = require("../util.js");
const TYPE = {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN: process.env.REFRESH_TOKEN_TYPE,
    ANONYMOUS_TOKEN: process.env.ANONYMOUS_TOKEN_TYPE
}
const CryptoJS = require("crypto-js");
const { APPLICATION_TYPE, APP_PLATFORM, LOCATION_REQUEST_FILTERS } = require("../enum.js");
const momentz = require("moment-timezone");

const LOCATION_REQUEST_SORT_KEYS = ["Distance", "Created"];

module.exports.handler = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.Metadata || typeof json.Metadata !== "object") {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.LocationRequest && !json.LocationRequest.Name) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const metadataRequired = json.Metadata;
        var metadata = {};
        const knex = require('knex')(con);

        if (metadataRequired.includes("AddOn")) {
            var addOnData = await addOnCMS(knex);
            if (addOnData.Error) {
                await knex.destroy();
                throw new Error(addOnData.Error);
            }
            metadata.AddOn = addOnData
        }

        if (metadataRequired.includes("Category")) {
            var categoryData = await knex(CATEGORIES).select("CategoryId", "Name").where("Deleted", "=", DELETE_FLAG);
            metadata.Category = categoryData;
        }

        if (metadataRequired.includes("Product")) {
            var productData = await knex
                .select(
                    PRODUCTS + ".ProductId",
                    PRODUCTS + ".CategoryId",
                    PRODUCT_TRANSLATIONS + ".Name"
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + ".ProductId", PRODUCTS + ".ProductId")
                .where(PRODUCTS + ".Deleted", "=", DELETE_FLAG)
                .andWhere(PRODUCT_TRANSLATIONS + ".LanguageId", "=", 1);
            metadata.Product = productData;
        }
        if (metadataRequired.includes("ProductDetailed")) {
            var productData = await knex

                .select(
                    PRODUCTS + '.ProductId',
                    PRODUCTS + '.CategoryId',
                    PRODUCTS + '.PreparationTime',
                    PRODUCTS + '.ImagePath',
                    PRODUCTS + '.ProductExtraMaxSelect',
                    PRODUCT_TRANSLATIONS + '.LanguageId',
                    PRODUCT_TRANSLATIONS + '.Name',
                    PRODUCT_TRANSLATIONS + '.Description',
                    PRODUCT_DURATIONS + '.Duration',
                    PRODUCT_DURATIONS + '.Amount'
                )
                .from(PRODUCTS)
                .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + '.ProductId', PRODUCTS + '.ProductId')
                .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + '.ProductId', PRODUCTS + '.ProductId')
                .where(PRODUCTS + '.Deleted', '=', DELETE_FLAG)
                andWhere(PRODUCT_TRANSLATIONS + '.LanguageId', '=', LANGUAGE)
                
            metadata.Product = productData;
        }

        if (metadataRequired.includes("Section")) {
            var sectionData = await knex(SECTION).select('SectionId', 'Name', "Type");
            metadata.Section = sectionData;
        }

        if (metadataRequired.includes("Language")) {
            var languageData = await knex(LANGUAGE).select("*");
            metadata.Language = languageData;
        }

        if (metadataRequired.includes("Center")) {
            var centerData = await knex(CENTER).select("CenterId", "Name", "Address", "Latitude", "Longitude", "ServiceArea", "Contact", "SosContact", "CheckInProximity","TodayLeadTime");
            metadata.Center = centerData;
        }
        if (metadataRequired.includes("TimeSlotInterval")) {
            // var centerData = await knex(CENTER).select("CenterId", "Name", "Address", "Latitude", "Longitude", "ServiceArea", "Contact", "SosContact", "CheckInProximity","TodayLeadTime");
            metadata.TimeSlotInterval = 5;
        }

        if (metadataRequired.includes("SpecialRequest")) {
            var specialRequest = await knex(SPECIAL_REQUEST).select("*");
            metadata.SpecialRequest = specialRequest;
        }

        if (metadataRequired.includes("VacationTemplate")) {
            let templates = [
                {
                    Template: 0,
                    TemplateName: "Full Day"
                },
                {
                    Template: 1,
                    TemplateName: "Custom Timing"
                }
            ]
            metadata.VacationTemplate = templates;
        }

        if (metadataRequired.includes("Staff")) {
            const staffData = await knex
                .select(
                    STAFF + ".StaffId",
                    STAFF + ".Name as StaffName",
                    STAFF + ".GoogleEmail",
                    STAFF + ".Gender",
                    STAFF + ".StaffGroupId",
                    STAFF_GROUP + ".Name as StaffGroupName",
                    STAFF_METADATA + ".Rank",
                    STAFF_CATEGORY + ".CategoryId",
                    STAFF_CATEGORY + ".Rate",
                    STAFF_PRODUCT + ".ProductId"
                )
                .from(STAFF)
                .leftJoin(STAFF_CATEGORY, STAFF_CATEGORY + ".StaffId", STAFF + ".StaffId")
                .leftJoin(STAFF_PRODUCT, STAFF_PRODUCT + ".StaffCategoryId", STAFF_CATEGORY + ".StaffCategoryId")
                .leftJoin(STAFF_GROUP, STAFF_GROUP + ".StaffGroupId", STAFF + ".StaffGroupId")
                .leftJoin(STAFF_METADATA, STAFF_METADATA + ".StaffId", STAFF + ".StaffId")
                .where(STAFF + ".Deleted", "=", 0);
            let staffFinalData = [];
            staffData.forEach(staff => {
                const found = staffFinalData.find(f => f.StaffId === staff.StaffId);
                if (!found) {
                    const pushObj = {
                        StaffId: staff.StaffId,
                        StaffName: staff.StaffName,
                        GoogleEmail: staff.GoogleEmail,
                        Gender: staff.Gender,
                        Categories: [staff.CategoryId],
                        CategoryData: [{
                            CategoryId: staff.CategoryId,
                            Rate: staff.Rate,
                            Products: [{
                                ProductId: staff.ProductId
                            }]
                        }],
                        StaffGroupId: staff.StaffGroupId,
                        StaffGroupName: staff.StaffGroupName,
                        Rank: staff.Rank
                    }
                    staffFinalData.push(pushObj);
                } else {
                    const catFound = found.Categories.find(f => f === staff.CategoryId);
                    if (!catFound) {
                        found.Categories.push(staff.CategoryId);
                    }
                    const categoryFound = found.CategoryData.find(f => f.CategoryId === staff.CategoryId);
                    if (!categoryFound) {
                        found.CategoryData.push({
                            StaffCategoryId: staff.StaffCategoryId,
                            CategoryId: staff.CategoryId,
                            Rate: staff.Rate,
                            Products: staff.ProductId ? [{
                                ProductId: staff.ProductId
                            }] : [],
                        })
                        found.Categories.push(staff.CategoryId)
                    } else {
                        // Check whether there is productId in staff record
                        if (staff.ProductId) {
                            const productFound = categoryFound.Products.find(p => p.ProductId === staff.ProductId);
                            if (!productFound) {
                                categoryFound.Products.push({
                                    ProductId: staff.ProductId
                                });
                            }
                        }

                    }
                }
            });
            metadata.Staff = staffFinalData
        }

        if (metadataRequired.includes("Bank")) {
            var bankData = await knex(BANK).select("BankId", "Name", "BankKey");
            metadata.Bank = bankData;
        }

        if (metadataRequired.includes("BookingStatus")) {
            let status = BOOKING_STATUS_DESC;
            let filters = [
                // BOOKING_STATUS.CONFIRMED
            ];
            metadata.BookingStatus = status.filter(f => filters.includes(f.code));
        }

        if (metadataRequired.includes("BookingStatusMisc")) {
            let status = BOOKING_STATUS_DESC;
            let filters = [
                // BOOKING_STATUS.COMPLETED,
                // BOOKING_STATUS.ON_GOING,
                BOOKING_STATUS.CANCELLED,
                BOOKING_STATUS.LAPSED,
                BOOKING_STATUS.UPDATED_TO_NEW,
                BOOKING_STATUS.CANCELLED_MANUALLY,
                BOOKING_STATUS.INCONCLUSIVE,
                BOOKING_STATUS.NEW
            ];
            metadata.BookingStatusMisc = status.filter(f => filters.includes(f.code));
        }

        if (metadataRequired.includes("BookingNotAllowedToCancel")) {
            metadata.BookingNotAllowedToCancel = BOOKING_NOT_ALLOWED_TO_CANCEL;
        }

        if (metadataRequired.includes("PageSizeOptions")) {
            metadata.PageSizeOptions = [10, 20, 50, 100];
            metadata.DefaultPageSize = 10;
        }

        if (metadataRequired.includes("NewGroup") && json.GroupName) {
            let groupExist = await knex(STAFF_GROUP).select().where("Name", "=", json.GroupName);
            if (groupExist.length) {
                throw new Error(MESSAGE.GROUP_ALREADY_EXIST);
            } else {
                let groupInserted = await knex(STAFF_GROUP).insert({
                    Name: json.GroupName,
                    IsUsedInFilter: 0,
                    ...zone.getCreateUpdate()
                })
            }
        }

        if (metadataRequired.includes("GlobalDispatchSettings")) {
            metadata.GlobalDispatchSettings = await getGlobalDispatchSettings(knex);
        }

        if (metadataRequired.includes("StaffGroup")) {
            let groupData = await knex(STAFF_GROUP).select('StaffGroupId', 'Name');
            metadata.StaffGroup = groupData;
        }

        if (metadataRequired.includes("RegistrationURL")) {
            metadata.RegistrationURL = "https://airtable.com/shrTWt3T2nJzaX24W";
        }

        if (metadataRequired.includes("BookingChannel")) {
            let bookingChannelData = await knex(BOOKING_CHANNEL).select('BookingChannelId', 'Name');
            metadata.BookingChannelData = bookingChannelData;
        }

        if (metadataRequired.includes("BusinessType")) {
            let businessTypeData = await knex(BUSINESS_TYPE).select('BusinessTypeId', 'Name').where("Name", "!=", 'Cocon');
            metadata.BusinessTypeData = businessTypeData;
        }

        if (metadataRequired.includes("ServiceZipCode")) {
            let ServiceZipcode = await knex(SERVICE_ZIPCODE).select('ServiceZipCodeId', 'Zipcode');
            metadata.ServiceZipcode = ServiceZipcode;
        }

        if (json.Source && json.Destination) {
            console.log("json",json)
            const request = require("request-promise");
            const options = {
                method: "GET",
                uri: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_LINK,
                qs: {
                    origins: json.Source,
                    destinations: json.Destination,
                    key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
                    units: "imperial"
                }
            }
            let result = await request(options);
            let object = JSON.parse(result);
            console.log("object")
            console.log(JSON.stringify(object))
            metadata.ReachOutData = object;
        }

        var userLastRead;
        var unreadMessageCount = 0;
        var finalMessages = [];
        var messageData = await knex(MESSAGES).select("Date");
        finalMessages.push(...messageData);
        if (json && json.UserId) {
            var userMessageData = await knex(USER_MESSAGES).select("Date")
            userLastRead = await knex(USERS).select("LastMessageRead").where("UserId", "=", json.UserId);
            userLastRead = userLastRead[0].LastMessageRead;
            if (userLastRead) {
                userLastRead = moment(userLastRead).utc().toDate();
            }
            finalMessages.push(...userMessageData)
        }
        if (json.LocationRequest && json.LocationRequest.Name) {
            let insertObj = {
                Name: json.LocationRequest.Name,
                Latitude: json.LocationRequest.Latitude,
                Longitude: json.LocationRequest.Longitude,
                Distance: json.LocationRequest.Distance ? json.LocationRequest.Distance : null,
                UserId: null,
                ...zone.getCreateUpdate()
            }
            if (json.LocationRequest.UserId) {
                insertObj.UserId = json.LocationRequest.UserId;
            } else {
                // check if token is access token, get user id from there
                let token = event.headers['Authorization'];
                const jwt = require('jsonwebtoken');
                let bearerToken = token;
                let decoded, payload;
                if (typeof bearerToken === 'undefined') {
                    insertObj.UserId = null;
                } else {
                    let tokenArr = bearerToken.toString().split(" ");
                    let extractedToken = tokenArr[(tokenArr.length - 1)];
                    try {
                        decoded = jwt.verify(extractedToken, process.env.JWT_SECRET, {
                            audience: process.env.AUDIENCE,
                            issuer: process.env.ISSUER
                        });
                        payload = decoded.payload;
                    } catch (error) {
                        console.log(error);
                        insertObj.UserId = null;
                    }
                    if (!decoded.sub || payload.Type !== TYPE.ACCESS_TOKEN) {
                        insertObj.UserId = null;
                    } else {
                        insertObj.UserId = parseInt(decoded.sub);
                    }
                }
            }
            // Guest details
            if (!insertObj.UserId) {
                insertObj.UserName = json.LocationRequest.UserName ? json.LocationRequest.UserName : null;
                insertObj.UserEmail = json.LocationRequest.UserEmail ? json.LocationRequest.UserEmail : null;
                insertObj.UserPhone = json.LocationRequest.UserPhone ? json.LocationRequest.UserPhone : null;
            }
            var requestInsert = await knex(LOCATION_REQUEST).insert(insertObj);
        }
        await knex.destroy();
        if (json && json.UserId) {
            var readMoment;
            if (userLastRead) {
                readMoment = moment(userLastRead).utc();
            }
            console.log(userLastRead)
            finalMessages.forEach(element => {
                if (userLastRead) {
                    var msgDateMoment = moment(element.Date).utc();
                    if (msgDateMoment.isAfter(readMoment)) {
                        element.isRead = false;
                        unreadMessageCount += 1;
                    } else {
                        element.isRead = true;
                    }
                } else {
                    unreadMessageCount = 0;
                }
            });
        } else {
            unreadMessageCount = 0;
        }
        metadata.UnreadMessageCount = unreadMessageCount;
    } catch (error) {
        console.log(error)
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
            message: MESSAGE.METADATA_FETCH_SUCCESS
        },
        body: setPayloadData(event, { Data: metadata })
    }
}


module.exports.forceUpdate = async event => {
    let knex, connected = false, response;
    try {
        knex = require('knex')(con);
        connected = true;
        let userApps = await knex(APP_VERSIONS).select("*").where("Type", "=", APPLICATION_TYPE.USER);
        let androidApp = userApps.find(f => f.Platform === APP_PLATFORM.ANDROID.Code);
        let iosApp = userApps.find(f => f.Platform === APP_PLATFORM.IOS.Code);
        response = {
            Android: {
                AppVersion: androidApp.Version,
                IsForceUpdate: androidApp.IsForceUpdate ? true : false
            },
            IOS: {
                AppVersion: iosApp.Version,
                IsForceUpdate: iosApp.IsForceUpdate ? true : false
            }
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
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.forceUpdateTherapist = async event => {
    let knex, connected = false, response;
    try {
        knex = require('knex')(con);
        connected = true;
        let ambassadorApps = await knex(APP_VERSIONS).select("*").where("Type", "=", APPLICATION_TYPE.AMBASSADOR);
        let androidApp = ambassadorApps.find(f => f.Platform === APP_PLATFORM.ANDROID.Code);
        let iosApp = ambassadorApps.find(f => f.Platform === APP_PLATFORM.IOS.Code);
        response = {
            Android: {
                AppVersion: androidApp.Version,
                IsForceUpdate: androidApp.IsForceUpdate ? true : false
            },
            IOS: {
                AppVersion: iosApp.Version,
                IsForceUpdate: iosApp.IsForceUpdate ? true : false
            }
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
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.getLocationRequest = async event => {
    let knex, connected = false, response, responseBody;
    try {

        // Check the API body and required parameters
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.Pagination || typeof json.Pagination !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const sort = json.Sort;
        const pagination = json.Pagination;
        const search = json.Search;
        const filters = json.Filters;
        const lastUpdated = json.LastUpdated;
        const currentIds = json.CurrentIds;
        knex = require("knex")(con);
        connected = true;
        let serviceArea = await knex(CENTER).select("ServiceArea").where("CenterId", "=", 1);
        response = {
            ServiceArea: serviceArea[0].ServiceArea,
            LocationRequest: []
        }

        var locationReqIds = [];
        if (!search) {
            locationReqIds = await knex
            .pluck("LocationRequestId")
            .from(LOCATION_REQUEST)
                .modify(queryBuilder => {
                    // CASE WHEN CMS CALLING THIS API FOR ALL PROMOCODES
                    if (filters && filters.length) {
                        let addressFilter = filters.find(f => f.Key === LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.KEY);
                        if (addressFilter && addressFilter.Values && addressFilter.Values.length) {
                            switch (addressFilter.Values[0]) {
                                case LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.VALUES.GOT_IN_SERVICE_AREA: {
                                    queryBuilder.where(LOCATION_REQUEST + ".Distance", "<=", response.ServiceArea)
                                    break;
                                }
                                case LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.VALUES.OUT_OF_SERVICE_AREA: {
                                    queryBuilder.where(LOCATION_REQUEST + ".Distance", ">", response.ServiceArea)
                                    break;
                                }
                                default:
                                    queryBuilder.whereNull(LOCATION_REQUEST + ".Distance")
                                    break;
                            }
                        }

                        let locationDateFilter = filters.find(f => f.Key === LOCATION_REQUEST_FILTERS.DATEFILTER.KEY);
                        if (locationDateFilter && locationDateFilter.Values && locationDateFilter.Values.length) {
                            
                            queryBuilder.where("Created", ">=", momentz.tz(locationDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                            queryBuilder.andWhere("Created", "<=", momentz.tz(locationDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                        }
                    }
                    // Sorting code
                    if (sort && sort.Key && LOCATION_REQUEST_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(LOCATION_REQUEST + ".Created", "desc")
                    }

                    //Pagination code
                    queryBuilder.limit(pagination.Size);
                    if (pagination.Number > 1) {
                        let offset = pagination.Size * (pagination.Number - 1);
                        queryBuilder.offset(offset)
                    }
                })

        }
        
        let locationData = await knex
            .select(
                LOCATION_REQUEST + ".LocationRequestId",
                LOCATION_REQUEST + ".Name",
                LOCATION_REQUEST + ".Latitude",
                LOCATION_REQUEST + ".Longitude",
                LOCATION_REQUEST + ".UserId",
                USERS + ".Name as UserName",
                LOCATION_REQUEST + ".UserName as GuestName",
                LOCATION_REQUEST + ".UserEmail as GuestEmail",
                LOCATION_REQUEST + ".UserPhone as GuestPhone",
                LOCATION_REQUEST + ".Distance",
                LOCATION_REQUEST + ".Created",
                USERS + ".Archive",
            )
            .from(LOCATION_REQUEST)
            .leftJoin(USERS, USERS + ".UserId", LOCATION_REQUEST + ".UserId")
            .modify(queryBuilder => {
                    // CASE WHEN CMS CALLING THIS API FOR ALL PROMOCODES
                    if (search) {
                        queryBuilder.where(LOCATION_REQUEST + ".Name", "like", `%${search}%`)
                        queryBuilder.orWhere(LOCATION_REQUEST + ".UserName", "like", `%${search}%`)
                        queryBuilder.orWhere(USERS + ".Name", "like", `%${search}%`)
                        queryBuilder.orWhere(LOCATION_REQUEST + ".Distance", "like", `%${search}%`)
                    }
                    if (sort && sort.Key && LOCATION_REQUEST_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(LOCATION_REQUEST + ".Created", "desc")
                    }
                    if (!search) {
                        queryBuilder.whereIn(LOCATION_REQUEST + ".LocationRequestId", locationReqIds)
                        if (lastUpdated && currentIds) {
                            // check for mismatched ids fetch to fetch those users as well
                            var missedLocReqIds = locationReqIds.filter( function(n) { 
                                return !this.has(n) }, new Set(currentIds) 
                            );
                            queryBuilder.where(LOCATION_REQUEST + ".LastUpdated", ">", lastUpdated)
                            queryBuilder.orWhereIn(LOCATION_REQUEST + ".LocationRequestId", missedLocReqIds)
                        }
                    }
            })

        for (let locInc = 0; locInc < locationData.length; locInc++) {
            const location = locationData[locInc];
            if (location.Distance && location.Distance <= response.ServiceArea) {
                location.InServiceArea = true;
            } else {
                location.InServiceArea = false;
            }
        }
        response.LocationRequest = locationData

        responseBody = {
            Data: response,
            CurrentIds: locationReqIds,
            LastUpdated: moment().utc().format(),
            TotalItems: !json.Search ? await getLocationRequestCount(knex, json.Filters, response.ServiceArea) : 0,
            Pagination: {
                ...json.Pagination
            }
        };

        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            },
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.LOC_REQ_FETCH_SUCCESS
        },
        body: setPayloadData(event, responseBody)
    }
}

const getLocationRequestCount = async (knex, filters, serviceArea) => {
    let locationData = await knex
    .count(
        LOCATION_REQUEST + ".LocationRequestId",
    )
    .from(LOCATION_REQUEST)
    .modify(queryBuilder => {
        if (filters && filters.length) {
            let addressFilter = filters.find(f => f.Key === LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.KEY);
            if (addressFilter && addressFilter.Values && addressFilter.Values.length) {
                switch (addressFilter.Values[0]) {
                    case LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.VALUES.GOT_IN_SERVICE_AREA: {
                        queryBuilder.where(LOCATION_REQUEST + ".Distance", "<=", serviceArea)
                        break;
                    }
                    case LOCATION_REQUEST_FILTERS.ADDRESS_FILTER.VALUES.OUT_OF_SERVICE_AREA: {                                
                        queryBuilder.where(LOCATION_REQUEST + ".Distance", ">", serviceArea)
                        break;
                    }
                    default:
                        queryBuilder.whereNull(LOCATION_REQUEST + ".Distance")
                        break;
                }
            }

            let locationDateFilter = filters.find(f => f.Key === LOCATION_REQUEST_FILTERS.DATEFILTER.KEY);
                        if (locationDateFilter && locationDateFilter.Values && locationDateFilter.Values.length) {
                            queryBuilder.where("Created", ">=", momentz.tz(locationDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                            queryBuilder.andWhere("Created", "<=", momentz.tz(locationDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                        }
        }
    });
    return locationData[0]['count(`LocationRequest`.`LocationRequestId`)'];
}

module.exports.getAddress = async event => {
    let knex, connected = false, response, apiResponse;
    try {
        knex = require('knex')(con);
        // Check the API body and required parameters
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.Zipcode || 
            !json.HouseNumber
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const request = require("request-promise");
        let countryCode = 'nl'
        //Supportive function: To get particular component from the Google Response
         const getComponent = (addressComponent, componentName) => {
            let filteredData = addressComponent.filter(comp =>
              comp.types.includes(componentName),
            );
            filteredData = filteredData
              .map(data => data.long_name || '')
              .filter(str => str.trim());
            return filteredData.length > 0 ? filteredData.join(', ') : '';
          };
        // Code here to get the address from "Zipcode" and "House number"
        // Google implementation of address fetching (Ref: https://developers.google.com/maps/documentation/geocoding/requests-geocoding)
        // Steps of fetching address from zipcode and house number (Ref: https://www.codeproject.com/Tips/807983/How-to-Geocode-an-Address-by-Postcode-Zipcode-and)
        // Step 1: Get lat-lng using postal code
        const options = {
            method: "GET",
            uri: process.env.GOOGLE_MAPS_GEOCODE,
            qs: {
                components: `country:${countryCode}|postal_code:${json.Zipcode}`,
                key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
            }
        }
        let response1 = await request(options);
        let step1Result = JSON.parse(response1);
        if (!(step1Result.results.length)) {
            throw new Error("Address fetching failed, not got the lat-lng, seems the zipcode provided is invalid.");
        }
        let location = step1Result.results[0].geometry.location;
        let latLong = `${location.lat},${location.lng}`

        // Step 2: Get street name using lat-lng
        const options2 = {
            method: "GET",
            uri: process.env.GOOGLE_MAPS_GEOCODE,
            qs: {
                latlng: latLong,
                key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
            }
        }
        let response2 = await request(options2);
        let step2Result = JSON.parse(response2);
        console.log(response2)
        
       
        if (!(step2Result.results.length)) {
            throw new Error("Address fetching failed, not got the street.");
        }
        let bestAddressComp = step2Result.results.filter(comp =>
            comp.types.includes("route"),
        );
       
        if (!bestAddressComp.length || !(bestAddressComp[0].address_components.length)) {
            throw new Error("Address fetching failed, not got the street.");
        }
        let street = getComponent(bestAddressComp[0].address_components, 'route')

        // Step 3: Get address using street and house number
        const options3 = {
            method: "GET",
            uri: process.env.GOOGLE_MAPS_GEOCODE,
            qs: {
                address: `${street} ${json.HouseNumber}`,
                components: `postal_code:${json.Zipcode}`,
                region: countryCode,
                key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
            }
        }
        console.log("options3 : ", options3)
        let response3 = await request(options3);
        let step3Result = JSON.parse(response3);
        if (!(step3Result.results.length)) {
            throw new Error("Address fetching failed, not got the address, seems like house number is not correct.");
        }
        console.log("step3Result: ", response3)
        let addressComponent = step3Result.results[0].address_components;
        let addressLatLong = step3Result.results[0].geometry.location;

        // API response will be like below
        apiResponse = {
            StreetName: getComponent(addressComponent, 'route'),
            HouseNumber: json.HouseNumber,
            PostalCode: getComponent(addressComponent, 'postal_code'),
            City: getComponent(addressComponent, 'locality'),
            Latitude: `${addressLatLong.lat}`,
            Longitude: `${addressLatLong.lng}`,
        }
        // format the address of customer locaiton, to get the distance using Google API
        let destination = `${apiResponse.StreetName}, ${apiResponse.HouseNumber}, ${apiResponse.PostalCode} ${apiResponse.City}`

        // Get COCON Center data from the database
        var centerData = await knex(CENTER).select("Address");
        let center = centerData[0]
        let source = center.Address

        if (source && destination) {
            const options = {
                method: "GET",
                uri: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_LINK,
                qs: {
                    origins: source,
                    destinations: destination,
                    key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
                    units: "imperial"
                }
            }
            let result = await request(options);
            let object = JSON.parse(result);
            let distanceInMeter = object.rows[0].elements[0].distance.value;
            var distanceString = `${distanceInMeter}m`
            if (distanceInMeter > 1000) {
                distanceString = `${Number(distanceInMeter/1000).toFixed(2)}km`
            }

            response = {
                ...apiResponse,
                Distance: distanceString,
                DistanceInMeter: distanceInMeter
            }
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
                message:error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.getStatus = async event => {
    let knex, connected = false, response = null;
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
        let allowedClients = [
            process.env.API_CLIENT_COCON_APP,
            process.env.API_CLIENT_COCON_THERAPIST,
            process.env.API_CLIENT_COCON_CMS
        ];
        if (!allowedClients.includes(headers['api-client'])) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;
        let appType = headers['api-client'] === process.env.API_CLIENT_COCON_APP ? APPLICATION_TYPE.USER : APPLICATION_TYPE.AMBASSADOR;
        let appPlatform = headers['platform'] === APP_PLATFORM.ANDROID.Label ? APP_PLATFORM.ANDROID.Code : APP_PLATFORM.IOS.Code;
        let serverStatus = await knex(APP_VERSIONS)
            .select("*")
            .where("Type", "=", appType)
            .andWhere("Platform", "=", appPlatform);
        response = {
            IsActive: serverStatus[0].IsActive ? true : false,
            UseEncryption: serverStatus[0].UseEncryption ? true : false,
            MaintenanceMessage: serverStatus[0].MaintenanceMessage
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
                message: error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.SERVER_STATUS_FETCH_SUCCESS
        },
        body: JSON.stringify({
            Data: response
        })
    }
}

module.exports.getEncrypt = async event => {
    let response = event.body ? JSON.parse(event.body) : null;
    return {
        statusCode: 200,
        headers: {
            ...Headers
        },
        body: CryptoJS.AES.encrypt(JSON.stringify(response.Data), response.KEY).toString()
    }
}

module.exports.getDecrypt = async event => {
    let rawData = CryptoJS.AES.decrypt(event.body, process.env.PAYLOAD_ENC_KEY);
    return {
        statusCode: 200,
        headers: {
            ...Headers
        },
        body: rawData.toString(CryptoJS.enc.Utf8)
    }
}
module.exports.getBookingInstructions = async event => {
    let knex, connected = false, response, responseBody;
    try {

        // No object
        
        knex = require("knex")(con);
        connected = true;
        const json = event.body ? getPayloadData(event) : null;
        let response=[]
        let serviceArea
        if(json.Type){
            serviceArea = await knex(BOOKING_INSTRUCTIONS).select("*").where("Type", "=",json.Type);
        }else{
            serviceArea = await knex(BOOKING_INSTRUCTIONS).select("*").where("Type", "=",'AVAILABILITY');;
        }
        
        if(serviceArea.length){
            response=serviceArea[0]
        }

        responseBody = {
            Data: response,
        };
        
        await knex.destroy();
    } catch (error) {
        if (connected) {
            await knex.destroy();
        }
        console.log(error.message)
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            },
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.BOOKING_INSTRUCTION_FETCH_SUCCESS
        },
        body: setPayloadData(event, responseBody)
    }
}

module.exports.getDistance = async event => {
    let knex, connected = false, response, apiResponse;
    try {
        knex = require('knex')(con);
        // Check the API body and required parameters
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.Address 
           
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
       
        let destination = json.Address

        // Get COCON Center data from the database
        var centerData = await knex(CENTER).select("Address");
        let center = centerData[0]
        let source = center.Address
        const request = require("request-promise");
        if (source && destination) {
            const options = {
                method: "GET",
                uri: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_LINK,
                qs: {
                    origins: source,
                    destinations: destination,
                    key: process.env.GOOGLE_MAPS_DISTANCE_MATRIX_KEY,
                    units: "imperial"
                }
            }
            let result = await request(options);
            let object = JSON.parse(result);
            console.log(JSON.stringify(object))
            let distanceInMeter = 0;
            var distanceString=''
            if (object.status=='OK' && object.rows.length > 0 && object.rows[0].elements[0].status=='OK') {
                 distanceInMeter = object.rows[0].elements[0].distance.value;
                 distanceString = `${distanceInMeter}m`
                if (distanceInMeter > 1000) {
                    distanceString = `${Number(distanceInMeter / 1000).toFixed(2)}km`
                }
            } else {
                 distanceInMeter = 0;
                 distanceString = `${distanceInMeter}m`
                if (distanceInMeter > 1000) {
                    distanceString = `${Number(distanceInMeter / 1000).toFixed(2)}km`
                }
            }
            

            response = {
              
                Distance: distanceString,
                DistanceInMeter: distanceInMeter
            }
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
                message:error.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}