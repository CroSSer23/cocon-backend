const { con } = require("../db");
const { Headers } = require("../header");
const { verifyAccessToken } = require("./authorize")
const zone = require("../zone");
const { InitializeFirebase, InitializeFirebaseTherapist, checkHeaders, getPayloadData, setPayloadData } = require("../util");
const {
    MESSAGES,
    USERS,
    STAFF,
    USER_MESSAGES,
    STAFF_MESSAGES,
    BOOKINGS,
    BOOKING_PRODUCTS,
} = require("../tables");
const { MESSAGE_USER_FILTER, MESSAGE_TYPE, MESSAGE_FILTERS ,LOG_ACTION_TYPE} = require("../enum");
const { BOOKING_STATUS } = require("../status");
const moment = require("moment");
const momentz = require("moment-timezone");
const { MESSAGE, PUSH } = require("../strings");
const _ = require('lodash');
const API_CLIENT_COCON_APP = process.env.API_CLIENT_COCON_APP;
const API_CLIENT_COCON_THERAPIST = process.env.API_CLIENT_COCON_THERAPIST;
const API_CLIENT_COCON_CMS = process.env.API_CLIENT_COCON_CMS;
const { saveLog, } = require("../helpers/common.js");


// const USER_MESSAGES_TYPES = [0, 2];
const USER_MESSAGES_TYPES = [
    MESSAGE_TYPE.USER,
    MESSAGE_TYPE.ALL
];
// const STAFF_MESSAGES_TYPES = [1, 2];
const STAFF_MESSAGES_TYPES = [
    MESSAGE_TYPE.STAFF,
    MESSAGE_TYPE.ALL
];

const GUEST_MESSAGE_TYPES = [
    MESSAGE_TYPE.GUEST,
    MESSAGE_TYPE.ALL
];

const MESSAGE_SORT_KEYS = ["Date"];

module.exports.getMessage = async event => {
    let knex = null, finalMessages = [], connected = false, headers, json, messagesIds = [];
    try {
        headers = event.headers;
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
        json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        connected = false;
        knex = require("knex")(con);
        connected = true;
        let pastMessageLimit = moment().startOf("day").subtract(1, "month").utc().toDate();

        switch (event.headers['api-client']) {
            case API_CLIENT_COCON_APP: {
                if (json && json.UserId) {
                    /**
                     * Need to send only messages of Type 0, 2
                     * If UserId is provided then return User specific messages, and mark them unread based on user last read time
                     */
                    let messageTableData = await knex(MESSAGES)
                        .select(
                            "MessageId",
                            "Title",
                            "Description",
                            "ImagePath",
                            "Date"
                        )
                        .whereIn("Type", USER_MESSAGES_TYPES)
                        .andWhere("Date", ">", pastMessageLimit);
                    finalMessages.push(...messageTableData);
                    let userMessageData = await knex(USER_MESSAGES)
                        .select(
                            "UserMessageId",
                            "Title",
                            "Description",
                            "ImagePath",
                            "Date"
                        )
                        .where("UserId", "=", json.UserId)
                        .andWhere("Date", ">", pastMessageLimit)
                    let readData = await knex(USERS).select("LastMessageRead").where("UserId", "=", json.UserId);
                    let lastMsgRead = readData[0].LastMessageRead;
                    let lastReadMoment = null;
                    if (lastMsgRead) {
                        lastReadMoment = moment(lastMsgRead);
                    }
                    finalMessages.push(...userMessageData)
                    finalMessages.forEach(element => {
                        if (lastReadMoment) {
                            let msgDateMoment = moment(element.Date);
                            if (msgDateMoment.isAfter(lastReadMoment)) {
                                element.IsRead = false;
                            } else {
                                element.IsRead = true;
                            }
                        } else {
                            element.IsRead = false;
                        }
                    });
                } else {
                    let guestMessageData = await knex(MESSAGES)
                        .select(
                            "MessageId",
                            "Title",
                            "Description",
                            "ImagePath",
                            "Date"
                        )
                        .whereIn("Type", GUEST_MESSAGE_TYPES)
                        .andWhere("Date", ">", pastMessageLimit);
                    finalMessages.push(...guestMessageData);
                    finalMessages.forEach(element => element.IsRead = true)
                }
                break;
            }
            case API_CLIENT_COCON_THERAPIST: {
                /**
                 * Need to send only messages of Type 1, 2
                 * Return if staff id not provided
                 */
                if (!json || !json.StaffId || typeof json.StaffId !== "number") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                let staffMessageData = await knex(MESSAGES)
                    .select(
                        "MessageId",
                        "Title",
                        "Description",
                        "ImagePath",
                        "Date"
                    )
                    .whereIn("Type", STAFF_MESSAGES_TYPES)
                    .andWhere("Date", ">", pastMessageLimit);
                finalMessages.push(...staffMessageData);
                let staffSpecificMessageData = await knex(STAFF_MESSAGES)
                    .select(
                        "StaffMessageId",
                        "Title",
                        "Description",
                        "ImagePath",
                        "Date",
                        "Tag"
                    )
                    .where("StaffId", "=", json.StaffId)
                    .andWhere("Date", ">", pastMessageLimit)
                let readData = await knex(STAFF).select("LastMessageRead").where("StaffId", "=", json.StaffId);
                let lastMsgRead = readData[0].LastMessageRead;
                let lastReadMoment = null;
                if (lastMsgRead) {
                    lastReadMoment = moment(lastMsgRead);
                }
                finalMessages.push(...staffSpecificMessageData)
                finalMessages.forEach(element => {
                    if (lastReadMoment) {
                        let msgDateMoment = moment(element.Date);
                        if (msgDateMoment.isAfter(lastReadMoment)) {
                            element.IsRead = false;
                        } else {
                            element.IsRead = true;
                        }
                    } else {
                        element.IsRead = false;
                    }
                });
                break;
            }
            case API_CLIENT_COCON_CMS: {
                /**
                 * Need to send all messages from Message table.
                 */
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
                // Get messages Ids based on pagination
                var allMessagesIds = [];
                if (!search) {
                    allMessagesIds = await knex(MESSAGES)
                    .pluck("MessageId")
                    .modify(queryBuilder => {
                        if (filters && filters.length) {
                            let messageTypeFilter = filters.find(f => f.Key === MESSAGE_FILTERS.TYPE.KEY);
                            if (messageTypeFilter && messageTypeFilter.Values && messageTypeFilter.Values.length) {
                                queryBuilder.where("Type", "=", messageTypeFilter.Values[0])
                            }

                            let messageDateFilter = filters.find(f => f.Key === MESSAGE_FILTERS.DATEFILTER.KEY);
                            if (messageDateFilter && messageDateFilter.Values && messageDateFilter.Values.length) {
                                
                                queryBuilder.where("Date", ">=", momentz.tz(messageDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                queryBuilder.andWhere("Date", "<=", momentz.tz(messageDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                        }
                        // Sorting code
                        if (sort && sort.Key && MESSAGE_SORT_KEYS.includes(sort.Key)) {
                            queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                        } else {
                            queryBuilder.orderBy("Date", "desc")
                        }
                        // Pagintion code
                        queryBuilder.limit(pagination.Size);
                        if (pagination.Number > 1) {
                            let offset = pagination.Size * (pagination.Number - 1);
                            queryBuilder.offset(offset)
                        }
                    });
                }
                // Get messages all data.
                let allMessages = await knex(MESSAGES)
                    .select(
                        "MessageId",
                        "Title",
                        "Description",
                        "ImagePath",
                        "Date",
                        "Type"
                    ).modify(queryBuilder => {
                        //Search code
                        if (search) {
                            queryBuilder.where("Title", "like", `%${search}%`)
                            queryBuilder.orWhere("Description", "like", `%${search}%`)
                        }
                        // Sorting code
                        if (sort && sort.Key && MESSAGE_SORT_KEYS.includes(sort.Key)) {
                            queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                        } else {
                            queryBuilder.orderBy("Date", "desc")
                        }
                        // Pagintion code
                        if (!search) {
                            queryBuilder.whereIn("MessageId", allMessagesIds);
                            if (lastUpdated && currentIds) {
                                // check for mismatched ids fetch to fetch those users as well
                                var missedMessagesIds = allMessagesIds.filter( function(n) { 
                                    return !this.has(n) }, new Set(currentIds) 
                                );
                                queryBuilder.where("LastUpdated", ">", lastUpdated);
                                queryBuilder.orWhereIn("MessageId", missedMessagesIds)
                            }
                        }
                    });
                    finalMessages.push(...allMessages); 
                    messagesIds = allMessagesIds;               
                break;
            }
        }
        // knex.destroy().then(() => { });
        if (headers['api-client'] !== process.env.API_CLIENT_COCON_CMS) {
            await knex.destroy();
            finalMessages.sort((a, b) => {
                let nextMsgMoment = moment(b.Date);
                let curMsgMoment = moment(a.Date);
                if (curMsgMoment.isBefore(nextMsgMoment)) {
                    return 1;
                } else if (curMsgMoment.isSame(nextMsgMoment)) {
                    return 0;
                } else {
                    return -1;
                }
            });
        }
    } catch (error) {
        console.log(error)
        if (connected) {
            knex.destroy().then(() => { });
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            }
        }
    }

    finalMessages.forEach(element => {
        element.TimeZone = {
            Zone: process.env.STAFF_ZONE
        }
    });

    var responseBody = {
        Data: finalMessages
    };
    if (headers['api-client'] === process.env.API_CLIENT_COCON_CMS) {
        responseBody = {
            Data: finalMessages,
            CurrentIds: messagesIds,
            LastUpdated: moment().utc().format(),
            TotalItems: !json.Search ? await getMessageCount(knex, json.Filters) : 0,
            Pagination: {
                ...json.Pagination
            }
        };
        await knex.destroy();
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.MESSAGES_FETCH_SUCCESS
        },
        body: setPayloadData(event, responseBody)
    }
}

const getMessageCount = async (knex, filters) => {
    let allMessages = await knex(MESSAGES).count("MessageId").modify(queryBuilder => {
        if (filters && filters.length) {
            let messageTypeFilter = filters.find(f => f.Key === MESSAGE_FILTERS.TYPE.KEY);
            if (messageTypeFilter && messageTypeFilter.Values && messageTypeFilter.Values.length) {
                queryBuilder.where("Type", "=", messageTypeFilter.Values[0])
            }

            let messageDateFilter = filters.find(f => f.Key === MESSAGE_FILTERS.DATEFILTER.KEY);
            if (messageDateFilter && messageDateFilter.Values && messageDateFilter.Values.length) {
                queryBuilder.where("Date", ">=", momentz.tz(messageDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                queryBuilder.andWhere("Date", "<=", momentz.tz(messageDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
            }
        }
    });
    return allMessages[0]['count(`MessageId`)'];
}

module.exports.newMessage = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.Type !== "number" ||
            !json.Title || typeof json.Title !== "string" ||
            !json.Description || typeof json.Description !== "string" ||
            json.Type < 0 || json.Type > 4
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var connected = false;
        var knex = require("knex")(con);
        connected = true;
        console.log("API Input: ", json);

        const USER_CONSIDERED_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]

        // Check if any filter is applied
        if (json.FilterType !== null && json.FilterType >= 0 && json.Type === 0) {
            // Validate Filter parameters
            if (json.FilterType > 0 && (
                !json.StartDate ||
                !json.EndDate ||
                (json.FilterType >= 2 && !json.Categories && json.Categories.length === 0))
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }

            var finalUserIds = [];
            var startDate = null;
            var endDate = null;
            if (json.FilterType !== 0) {
                startDate = moment.utc(json.StartDate, "YYYY-MM-DD");
                endDate = moment.utc(json.EndDate, "YYYY-MM-DD").endOf('day');
            }

            if (json.FilterType === MESSAGE_USER_FILTER.USER_NOT_BOOKED) {
                let usersData = await knex
                    .select(USERS + ".UserId", BOOKINGS + ".Status")
                    .from(USERS)
                    .where(USERS + ".Archive", "=", 0)
                    .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId");
                let sortedUsersData = _.sortBy(usersData, 'UserId');
                var notNewCustomer = [];
                for (var i = 0; i < sortedUsersData.length; i++) {
                    let data = sortedUsersData[i];
                    let userId = data.UserId;
                    if (!data.Status || !USER_CONSIDERED_BOOKINGS.includes(data.Status)) {
                        if (!notNewCustomer.includes(userId)) {
                            finalUserIds.push(userId);
                        }
                    } else {
                        if (!notNewCustomer.includes(userId)) {
                            notNewCustomer.push(userId);
                        }
                        if (finalUserIds.includes(userId)) {
                            finalUserIds = finalUserIds.filter(item => item !== userId)
                        }
                    }
                }

            } else if (json.FilterType === MESSAGE_USER_FILTER.USER_NOT_BOOKED_IN_XX_DAYS) {
                // Database query
                let usersData = await knex
                    .select(USERS + ".UserId", BOOKINGS + ".Status")
                    .from(USERS)
                    .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId")
                    .where(BOOKINGS + ".DateTime", ">=", startDate.toDate())
                    .andWhere(BOOKINGS + ".DateTime", "<=", endDate.toDate())
                    .andWhere(USERS + ".Archive", "=", 0);
                // .orWhereNull(BOOKINGS + ".Status");

                var customerUserIds = usersData.map(cus => cus.UserId);
                customerUserIds = _.uniq(customerUserIds);

                var allUsers = await knex.select(USERS + ".UserId").from(USERS);
                allUsers = allUsers.map(user => user.UserId);

                finalUserIds = allUsers.filter(user => !customerUserIds.includes(user));

                // Filter data according to need
                let sortedUsersData = _.sortBy(usersData, 'UserId');
                var notNewCustomer = [];
                for (var i = 0; i < sortedUsersData.length; i++) {
                    let data = sortedUsersData[i];
                    let userId = data.UserId;
                    if (!data.Status || !USER_CONSIDERED_BOOKINGS.includes(data.Status)) {
                        if (!notNewCustomer.includes(userId)) {
                            finalUserIds.push(userId);
                        }
                    } else {
                        if (!notNewCustomer.includes(userId)) {
                            notNewCustomer.push(userId);
                        }
                        if (finalUserIds.includes(userId)) {
                            finalUserIds = finalUserIds.filter(item => item !== userId)
                        }
                    }
                }
            } else if (json.FilterType === MESSAGE_USER_FILTER.USER_BOOKED_YY_CATEGORY_IN_XX_DAYS) {
                // Database query
                let customers = await knex
                    .select(
                        USERS + ".UserId",
                        BOOKING_PRODUCTS + ".CategoryId",
                        BOOKINGS + ".BookingId",
                    )
                    .from(BOOKINGS)
                    .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                    .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                    .whereIn([BOOKINGS + ".Status"], USER_CONSIDERED_BOOKINGS)
                    .whereIn(BOOKING_PRODUCTS + ".CategoryId", json.Categories)
                    .andWhere(BOOKINGS + ".DateTime", ">=", startDate.toDate())
                    .andWhere(BOOKINGS + ".DateTime", "<=", endDate.toDate())
                    .andWhere(USERS + ".Archive", "=", 0);

                finalUserIds = customers.map(cus => cus.UserId);
                finalUserIds = _.uniq(finalUserIds);

            } else if (json.FilterType === MESSAGE_USER_FILTER.USER_NOT_BOOKED_YY_CATEGORY_IN_XX_DAYS) {
                // Database query
                let customers = await knex
                    .select(
                        USERS + ".UserId",
                        BOOKING_PRODUCTS + ".CategoryId",
                        BOOKINGS + ".BookingId",
                    )
                    .from(BOOKINGS)
                    .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
                    .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
                    .whereIn([BOOKINGS + ".Status"], USER_CONSIDERED_BOOKINGS)
                    .whereIn(BOOKING_PRODUCTS + ".CategoryId", json.Categories)
                    .andWhere(BOOKINGS + ".DateTime", ">=", startDate.toDate())
                    .andWhere(BOOKINGS + ".DateTime", "<=", endDate.toDate())
                    .andWhere(USERS + ".Archive", "=", 0);

                var customerUserIds = customers.map(cus => cus.UserId);
                customerUserIds = _.uniq(customerUserIds);

                var allUsers = await knex.select(USERS + ".UserId").from(USERS);
                allUsers = allUsers.map(user => user.UserId);

                finalUserIds = allUsers.filter(user => !customerUserIds.includes(user));
            }

            console.log(`finalUserIds: ${finalUserIds}`);
            // Insert the User specific messages in the table
            let userMessagesData = finalUserIds.map(id => {
                return {
                    UserId: id,
                    Title: json.Title,
                    Description: json.Description,
                    ImagePath: null,
                    Date: moment().utc().toDate(),
                    ...zone.getCreateUpdate()
                };
            })

            await knex(USER_MESSAGES).insert(userMessagesData);

            // send the push notification
            var allUsersFCMToken = await knex
                .select(USERS + ".FcmToken")
                .from(USERS)
                .whereIn(USERS + ".UserId", finalUserIds);

            allUsersFCMToken = allUsersFCMToken
                .filter(token => token.FcmToken)
                .map(token => token.FcmToken);

            console.log("All FCM Tokens: ");
            console.log(allUsersFCMToken);
            if (allUsersFCMToken && allUsersFCMToken.length > 0) {
                const message = {
                    tokens: allUsersFCMToken,
                    notification: {
                        title: json.Title,
                        body: json.Description
                    },
                    data: {
                        ScreenName: PUSH.SCREEN.MESSAGES
                    }
                }
                try {
                    const userApp = InitializeFirebase();
                    const sentNotification = await userApp.messaging()
                        .sendMulticast(message)
                        .then((response) => {
                            console.log(response.successCount + ' messages were sent successfully');
                        });
                    console.log(`Push notification sent successfully`);
                } catch (error) {
                    console.log(error);
                }
            }
        }

        var messagePayload = {
            Title: json.Title.trim(),
            Description: json.Description.trim(),
            ImagePath: json.ImagePath ? json.ImagePath : null,
            Date: moment().toDate(),
            Type: (json.FilterType !== null && json.FilterType >= 0 && json.Type === 0) ? MESSAGE_TYPE.USER_FILTERED : json.Type,
            ...zone.getCreateUpdate()
        };
        console.log("messagePayload: ", messagePayload);

        /**
         *  Type 3 denotes to the user Filtered messages -- inserted in this table so to visible in CMS.
         */
        let messageInserted = await knex(MESSAGES).insert(messagePayload);
        var messageData = await knex(MESSAGES)
            .select(
                "MessageId",
                "Title",
                "Description",
                "Date",
                "ImagePath",
                "Type",
            )
            .orderBy("Date", "desc");

             // Save log for create
        await saveLog(knex,json.AdminId,MESSAGES,messageInserted[0],LOG_ACTION_TYPE.CREATE)
        await knex.destroy();
        connected = false;

        if (json.FilterType === null) {
            console.log("Do broadcast.");
            // Perform below code if user filter is not applied
            // Use topic to broadcast the messages
            try {
                let broadcastTopic = "";
                switch (json.Type) {
                    case 0: broadcastTopic = process.env.BROADCAST_TOPIC;
                        break;
                    case 1: broadcastTopic = process.env.BROADCAST_TOPIC_THERAPIST;
                        break;
                    case 2: broadcastTopic = process.env.BROADCAST_TOPIC_ALL;
                        break;
                    case 3: break; // User message filtered type
                    case 4: broadcastTopic = process.env.BROADCAST_TOPIC_GUEST;
                        break;
                }
                let message = {
                    topic: broadcastTopic,
                    notification: {
                        title: json.Title.trim(),
                        body: json.Description.trim()
                    },
                    data: {
                        ScreenName: PUSH.SCREEN.MESSAGES
                    }
                }
                switch (json.Type) {
                    case 0: {
                        const admin = InitializeFirebase();
                        const sentNotifications = await admin.messaging().send(message);
                        console.log(sentNotifications)
                        break;
                    }
                    case 1: {
                        const therapistAdmin = InitializeFirebaseTherapist();
                        const sentNotifications = await therapistAdmin.messaging().send(message);
                        console.log(sentNotifications)
                        break;
                    }
                    case 2: {
                        message.topic = process.env.BROADCAST_TOPIC;
                        const admin = InitializeFirebase();
                        console.log(message);
                        const sentUserNotifications = await admin.messaging().send(message);

                        message.topic = process.env.BROADCAST_TOPIC_THERAPIST;
                        const therapistAdmin = InitializeFirebaseTherapist();
                        console.log(message);
                        const sentTherapistNotifications = await therapistAdmin.messaging().send(message);

                        message.topic = process.env.BROADCAST_TOPIC_GUEST;
                        console.log(message);
                        const sentGuestNotifications = await admin.messaging().send(message);

                        break;
                    }
                    case 3: {
                        // User filtered messages case.
                        break;
                    }
                    case 4: {
                        message.topic = process.env.BROADCAST_TOPIC_GUEST;
                        const admin = InitializeFirebase();
                        console.log(message);
                        const sentGuestNotifications = await admin.messaging().send(message);
                        console.log(sentGuestNotifications);
                        break;
                    }
                }
            } catch (error) {
                console.log(error);
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
                message: error.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.MESSAGE_SENT_SUCCESS
        },
        body: setPayloadData(event,{
            Data: messageData
        })
    }
}

module.exports.updateMessage = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.Type !== "number" ||
            !json.MessageId || typeof json.MessageId !== "number" ||
            !json.Title || typeof json.Title !== "string" ||
            !json.Description || typeof json.Description !== "string"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        var connected = true;
        const existData = await knex(MESSAGES).select("*").where("MessageId", "=", json.MessageId);
        if (existData.length <= 0) {
            await knex.destroy();
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: MESSAGE.MESSAGE_NOT_AVAILABLE
                }
            }
        }
        const messageExist = existData[0];
        var updateObj = {};
        if (json.Title.trim() !== messageExist.Title) {
            updateObj.Title = json.Title.trim();
        }
        if (json.Description.trim() !== messageExist.Description) {
            updateObj.Description = json.Description.trim();
        }
        // if (json.Type !== messageExist.Type) {
            //     updateObj.Type = json.Type;
            // }
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            var messageUpdated = await knex(MESSAGES).where("MessageId", "=", json.MessageId).update(updateObj);
            if (!messageUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.MESSAGE_UPDATE_FAILED);
            }
        }
        var messageData = await knex(MESSAGES).select("*").orderBy("Created", "desc");
           // create log for update
           await saveLog(knex,json.AdminId,MESSAGES,json.MessageId,LOG_ACTION_TYPE.UPDATE)

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
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.MESSAGE_UPDATE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: messageData
        })
    }
}

module.exports.deleteMessage = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.DeleteMessage ||
            json.DeleteMessage.length <= 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        var messageDeleted = await knex(MESSAGES).whereIn("MessageId", json.DeleteMessage).del();
        var messageData = await knex(MESSAGES).select(
            "MessageId",
            "Title",
            "Description",
            "ImagePath",
            "Date"
        ).orderBy("Created", "desc");

         // Save log for delete
         for (let inc = 0; inc < json.DeleteMessage.length; inc++) {
            await saveLog(knex,json.AdminId,MESSAGES,json.DeleteMessage[inc],LOG_ACTION_TYPE.DELETE)
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
            message: MESSAGE.MESSAGE_DEL_SUCCESS
        },
        body: setPayloadData(event,{
            Data: messageData
        })
    }
}

module.exports.insertUserMessage = async ({ UserId, Title, Description, ImagePath = null }) => {
    try {
        console.log(moment().utc().toDate())
        var knex = require("knex")(con)
        var messageInserted = await knex(USER_MESSAGES).insert({
            UserId,
            Title,
            Description,
            ImagePath,
            Date: moment().utc().toDate(),
            ...zone.getCreateUpdate()
        })
    } catch (error) {
        return {
            Error: error.message
        }
    }
    return messageInserted;
}

module.exports.sendTestPush = async event => {
    try {
        const json = event.body ? JSON.parse(event.body) : null;
        const message = {
            token: json.FcmToken,
            notification: {
                title: json.Title.trim(),
                body: json.Description.trim()
            },
            data: {
                ScreenName: "Messages"
            }
        }
        const admin = InitializeFirebaseTherapist();
        const sentNotifications = await admin.messaging().send(message);
        return {
            statusCode: 200,
            headers: {
                ...Headers
            },
            body: setPayloadData(event,{
                Data: sentNotifications
            })
        }
    } catch (error) {
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: error.message
            },
            body: setPayloadData(event,{
                Data: error
            })
        }
    }
}