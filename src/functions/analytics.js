const { con } = require("../db");
const { Headers } = require("../header");
const moment = require('moment');
const momentz = require("moment-timezone");
const {
    BOOKINGS, USERS, BOOKING_PRODUCTS
} = require("../tables");
const {
    BOOKING_STATUS, BOOKING_PRODUCT_STATUS
} = require("../status");
const { MESSAGE, DATE_TIME_FORMAT } = require("../strings");
const { getPayloadData, setPayloadData } = require("../util");
const currentZone = process.env.STAFF_ZONE;
const STAFF_ZONE = momentz().tz(currentZone).format(DATE_TIME_FORMAT.Z);

module.exports.getBookingAnalytics = async event => {
    /**
     * API Objective: Calculate booking based analytics for dashboard.
     * Working:
     * 1. Check for required data.
     * 2. Calculate number of orders booked today.
     * 3. Calculate number of bookings to be served today.
     * 4. Calculate total bookings to be held in a given month.
     * 5. Calculate total sales for a given month.
     */
    let analytics, knex, connected = false;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            // !json.BookingMonth ||
            !json.SalesMonth
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const BOOKED_TODAY_STATUS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ];

        const BOOKING_SERVE_TODAY_STATUS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ];

        const MONTH_BOOKING_STATUS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ];

        const MONTH_SALES_STATUS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ];

        knex = require("knex")(con);
        connected = true;
        analytics = {};

        let todayStart = moment().startOf("day");
        let todayEnd = moment().endOf("day");

        // Calculate number of orders booked today
        let ordersBookedToday = await knex(BOOKINGS)
            .count("BookingId")
            .whereIn("Status", BOOKED_TODAY_STATUS)
            .andWhere("Created", ">=", todayStart.toDate())
            .andWhere("Created", "<=", todayEnd.toDate())
        analytics.BookedToday = ordersBookedToday[0]['count(`BookingId`)'];

        // Calculate number of bookings to be served today
        let bookingsToServeToday = await knex(BOOKINGS)
            .count("BookingId")
            .whereIn("Status", BOOKING_SERVE_TODAY_STATUS)
            .andWhere("DateTime", ">=", todayStart.toDate())
            .andWhere("DateTime", "<=", todayEnd.toDate())
        analytics.BookingServeToday = bookingsToServeToday[0]['count(`BookingId`)'];

        // Calculate total bookings in a given month
        let analyStart = moment(json.BookingStartDate);
        let analyEnd = moment(json.BookingEndDate);
        let monthlyBookings = [];
        let monthlySales = [];
        for (let curAnalyDay = moment(analyStart).utcOffset(STAFF_ZONE); curAnalyDay.isBefore(analyEnd); curAnalyDay.add(1, "day")) {
            let curDayStart = moment(curAnalyDay).startOf("day");
            let curDayEnd = moment(curAnalyDay).endOf('day');
            // Calculate number of bookings for current day
            let currentDayBookings = await knex(BOOKINGS)
                .count("BookingId")
                .sum("PaidPrice")
                .whereIn("Status", MONTH_BOOKING_STATUS)
                .andWhere("DateTime", ">=", curDayStart.toDate())
                .andWhere("DateTime", "<=", curDayEnd.toDate())
            monthlyBookings.push({
                "DateShow": curAnalyDay.format(DATE_TIME_FORMAT.DD_MMM_YYYY),
                "Date": curAnalyDay.format(),
                "Count": currentDayBookings[0]['count(`BookingId`)']
            });
            monthlySales.push({
                "DateShow": curAnalyDay.format(DATE_TIME_FORMAT.DD_MMM_YYYY),
                "Date": curAnalyDay.format(),
                "Count": currentDayBookings[0]['sum(`PaidPrice`)']
                    ? currentDayBookings[0]['sum(`PaidPrice`)']
                    : 0
            });
        }
        analytics.MonthlyBookings = monthlyBookings;
        analytics.MonthlySales = monthlySales;


        // let monthStart = moment(`${json.BookingMonth}`, DATE_TIME_FORMAT.MMLYYYY);
        // let monthDays = moment(monthStart).daysInMonth();
        // let monthlyBookings = [];
        // for (let monthDayInc = 1; monthDayInc <= monthDays; monthDayInc++) {
        //     const day = monthDayInc;
        //     let currentDay = moment(`${json.BookingMonth}`, DATE_TIME_FORMAT.MMLYYYY).date(day);
        //     let curDayStart = moment(currentDay).startOf('day');
        //     let curDayEnd = moment(currentDay).endOf('day');
        //     // Calculate number of bookings for current day
        //     let currentDayBookings = await knex(BOOKINGS)
        //         .count("BookingId")
        //         .whereIn("Status", MONTH_BOOKING_STATUS)
        //         .andWhere("DateTime", ">=", curDayStart.toDate())
        //         .andWhere("DateTime", "<=", curDayEnd.toDate())
        //     monthlyBookings.push({
        //         "DateShow": currentDay.format("D"),
        //         "Date": currentDay.format(),
        //         "Count": currentDayBookings[0]['count(`BookingId`)']
        //     });
        // }
        // analytics.MonthlyBookings = monthlyBookings;

        // Calculate total sales for a given month.
        // let salesMonthStart = moment(`${json.SalesMonth}`, DATE_TIME_FORMAT.MMLYYYY);
        // let salesMonthDays = moment(salesMonthStart).daysInMonth();
        // let monthlySales = [];
        // for (let monthDayInc = 1; monthDayInc <= salesMonthDays; monthDayInc++) {
        //     const day = monthDayInc;
        //     let currentDay = moment(`${json.SalesMonth}`, DATE_TIME_FORMAT.MMLYYYY).date(day);
        //     let curDayStart = moment(currentDay).startOf('day');
        //     let curDayEnd = moment(currentDay).endOf('day');
        //     // Calculate number of bookings for current day
        //     let currentDaySales = await knex(BOOKINGS)
        //         .sum("PaidPrice")
        //         .whereIn("Status", MONTH_SALES_STATUS)
        //         .andWhere("DateTime", ">=", curDayStart.toDate())
        //         .andWhere("DateTime", "<=", curDayEnd.toDate())
        //     monthlySales.push({
        //         "DateShow": currentDay.format("D"),
        //         "Date": currentDay.utc().format(),
        //         "Count": currentDaySales[0]['sum(`PaidPrice`)']
        //             ? currentDaySales[0]['sum(`PaidPrice`)']
        //             : 0
        //     });
        // }
        // analytics.MonthlySales = monthlySales;

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
            message: MESSAGE.BOOK_ANALYTICS_SUCCESS
        },
        body: setPayloadData(event,{
            Data: analytics
        })
    }
}

module.exports.getUserAnalytics = async event => {
    /**
     * Objective: Calculate user count analytics for dashboard
     * Legends:
     * 1. Customer - the user which have at least one booking either from App or CMS.
     * 2. Signed up users - the user which is signed up or verified from app, but don't have any booking.
     */

    let knex, connected, userAnalytics;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        userAnalytics = {
            Customers: 0,
            SignedUpUsers: 0,
            TotalUsers: 0,
            ClientRetentionRate: null
        }
        const USER_CONSIDERED_BOOKINGS = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.INCONCLUSIVE
        ]
        knex = require("knex")(con);
        connected = true;
        let customersCount = await knex
            .select(
                USERS + ".UserId"
            )
            // .count(USERS + ".UserId")
            .from(USERS)
            .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId")
            .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
            .groupBy(USERS + ".UserId");
        userAnalytics.Customers = customersCount.length;
        let allUsers = await knex(USERS).count("*");
        userAnalytics.TotalUsers = allUsers[0]['count(*)']
        userAnalytics.SignedUpUsers = userAnalytics.TotalUsers - userAnalytics.Customers;

        if (json.RetentionStart && json.RetentionEnd) {
            const retentionTimeStart = moment(json.RetentionStart);
            const retentionTimeEnd = moment(json.RetentionEnd);
            let custAtStart = await knex
                .select(
                    USERS + ".UserId"
                )
                // .count(USERS + ".UserId")
                .from(USERS)
                .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId")
                .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
                .andWhere(BOOKINGS + ".DateTime", "<=", retentionTimeStart.toDate())
                .groupBy(USERS + ".UserId");
            let custAtEnd = await knex
                .select(
                    USERS + ".UserId"
                )
                // .count(USERS + ".UserId")
                .from(USERS)
                .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId")
                .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
                .andWhere(BOOKINGS + ".DateTime", "<=", retentionTimeEnd.toDate())
                .groupBy(USERS + ".UserId");
            let custDuringPeriod = await knex
                .select(
                    USERS + ".UserId"
                )
                // .count(USERS + ".UserId")
                .from(USERS)
                .leftJoin(BOOKINGS, BOOKINGS + ".UserId", USERS + ".UserId")
                .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
                .andWhere(BOOKINGS + ".DateTime", ">=", retentionTimeStart.toDate())
                .andWhere(BOOKINGS + ".DateTime", "<=", retentionTimeEnd.toDate())
                .groupBy(USERS + ".UserId");
            let gain = 0;
            let lost = 0;

            //find new customers
            custDuringPeriod.forEach(element => {
                const found = custAtStart.find(f => f.UserId === element.UserId);
                if (!found) {
                    gain++;
                }
            });
            // find lost customers
            custAtStart.forEach(element => {
                const found = custDuringPeriod.find(f => f.UserId === element.UserId);
                if (!found) {
                    lost++;
                }
            });

            let s = custAtStart.length;
            let n = gain;
            let e = s + (gain - lost);

            userAnalytics.ClientRetentionRate = ((e - n) / s) * 100;
            userAnalytics.ClientRetentionRate = Number.parseFloat(Number(userAnalytics.ClientRetentionRate).toFixed(2));
            if (typeof userAnalytics.ClientRetentionRate === "undefined") {
                userAnalytics.ClientRetentionRate = 0;
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
            message: MESSAGE.USER_ANALYTICS_SUCCESS
        },
        body: setPayloadData(event,{
            Data: userAnalytics
        })
    }
}

module.exports.getProductAnalytics = async event => {
    /**
     * Objective: get top booked products.
     */
    let knex, connected, productAnalytics;
    try {
        // const json = event.body ? JSON.parse(event.body) : null;
        // if (
        //     !json
        // ) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
        productAnalytics = {
            TopProducts: null
        }
        knex = require("knex")(con);
        connected = true;
        let topProducts = await knex(BOOKING_PRODUCTS)
            .select("Product")
            .count("Product")
            .groupBy("Product")
        topProducts.sort((a, b) => {
            let aCount = a['count(`Product`)'];
            let bCount = b['count(`Product`)'];
            if (bCount > aCount) {
                return 1;
            } else if (bCount < aCount) {
                return -1;
            } else {
                return 0;
            }
        })
        productAnalytics.TopProducts = topProducts;
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
            message: MESSAGE.PROD_ANALYTICS_SUCCESS
        },
        body: setPayloadData(event,{
            Data: productAnalytics
        })
    }
}