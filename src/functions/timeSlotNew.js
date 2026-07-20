const { v4: uuidv4 } = require('uuid');
const { Headers } = require("../header");
const { verifyAccessToken, verifyAnonymousToken } = require("./authorize")
const { con } = require("../db");
const { checkHeaders, getStaffZone, getPayloadData, setPayloadData } = require("../util");
const { staffDaySchedule, getTodayVacation, getTodayBookingEvents, getBookingsForDate, getSelectedDayStaffsSchedule } = require("./staff");
const { productCMS } = require("./product");
const {
    STAFF,
    STAFF_CATEGORY,
    STAFF_PRODUCT,
    CENTER,
    CATEGORIES,
    STAFF_GROUP,
    STAFF_ORGANISATION,
} = require("../tables");
const moment = require('moment');
const momentz = require("moment-timezone");
const { MESSAGE, DATE_TIME_FORMAT } = require("../strings");
const { VACATION_TEMPLATE, THERAPIST_PREF, TRANSLATION_LANGUAGE } = require("../enum");

const DELETE_FLAG = 0;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const START_HOUR = process.env.DAY_START;
const END_HOUR = process.env.DAY_END;

const BUFFER_BEFORE = process.env.BUFFER_BEFORE;
const BUFFER_AFTER = process.env.BUFFER_AFTER;
const SLOT_GAP = process.env.SLOT_GAP;
const DAY_START_BUFFER = process.env.DAY_START_BUFFER;
const zone = require("../zone");
const { cloneDeep, result } = require("lodash");
const AUTOMATIC_BLOCKTIME_BUFFER = parseInt(process.env.AUTOMATIC_BLOCKTIME_BUFFER);

const COCON_STATIC_ORG_ID = -1

let STAFF_ZONE;

let BOOKING_DATE, REACH_OUT_TIME, RETURN_TIME, PRODUCTS, AVAILABLE_STAFF, FORMAT_BOOKING_DATE, WEEK_DAY;

module.exports.getTimeSlot = async (event) => {
    let response;
    try {
        const headers = event.headers;
        // console.log(headers);
        let isHeadersValid = checkHeaders(headers);
        if (!event.headers['device-timestamp']) {
            isHeadersValid = false;
        }
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        const tokenValid = await verifyAnonymousToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode > 303) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        if (tokenValid.statusCode === 303) {
            const accessTokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
            if (accessTokenValid.statusCode !== 200) {
                return {
                    statusCode: accessTokenValid.statusCode,
                    headers: {
                        ...Headers,
                        message: accessTokenValid.message
                    }
                }
            }
        }
        REACH_OUT_TIME = 0;
        BOOKING_DATE = "";
        PRODUCTS = [];
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.BookingDate || typeof json.BookingDate !== "string" ||
            !json.ReachOutTime || typeof json.ReachOutTime !== "number" ||
            !json.Products ||
            typeof json.Products !== "object" ||
            json.Products.length <= 0 || json.Products.length > 2
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        json.Products.forEach(product => {   // validate each product configuration
            if (
                !product.ProductId || typeof product.ProductId !== 'number' ||
                !product.CategoryId || typeof product.CategoryId !== 'number' ||
                typeof product.Therapist !== 'number' || product.Therapist < 0 || product.Therapist > 2 ||
                !product.Duration || typeof product.Duration !== 'number' ||
                !product.PreparationTime || typeof product.PreparationTime !== 'number' ||
                !product.Name || typeof product.Name !== "string" ||
                typeof product.SameTime !== 'boolean'
            ) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
            product.id = uuidv4();
        });
        if (json.ShowNextAvailability) {
            let dayCount = 30;
            for (let dayInc = 1; dayInc <= dayCount; dayInc++) {
                response = {};
                let bookingDate = moment(json.BookingDate, DATE_TIME_FORMAT.MMLDDLYYYY).add(dayInc, "day").format(DATE_TIME_FORMAT.MMLDDLYYYY);
                response = await getSlot(bookingDate, json, headers);
                if (response.length > 0) {
                    break;
                }
            }
        } else {
            response = await getSlot(json.BookingDate, json, headers);
        }
        console.log("response");
        console.log(JSON.stringify({
            Data: response,
            BookingDate: BOOKING_DATE,
            TimeZone: {
                Zone: process.env.STAFF_ZONE
            }
        }, null, 2));
    } catch (error) {
        console.log(error);
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
            message: MESSAGE.TIME_SLOT_FETCH_SUCCESS
        },
        body: setPayloadData(event,{
            Data: response,
            BookingDate: BOOKING_DATE,
            TimeZone: {
                Zone: process.env.STAFF_ZONE
            }
        })
    }
}

const getSlot = async (bookingDate, json, headers) => {
    let slots = [];
    BOOKING_DATE = bookingDate;
    STAFF_ZONE = zone.getStaffZone(moment(BOOKING_DATE + " 12:00", DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm).utc().format());
    // console.log(BOOKING_DATE);
    let isToday = false;
    /**
     * Divide reach out time with 5 and get the reminder,
     * subtract the reminder from 5 and add the result into reach out time.
     */
    // let reminder = json.ReachOutTime % 5;
    // if (reminder > 0) {
    //     let toAdd = 5 - reminder;
    //     json.ReachOutTime += toAdd;
    // }
    REACH_OUT_TIME = json.ReachOutTime;
    RETURN_TIME = REACH_OUT_TIME;
    PRODUCTS = [...json.Products];
    FORMAT_BOOKING_DATE = moment(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);

    // validate if its today/future date.
    const todayStart = moment().startOf('day');
    const inputDateStart = moment(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day');
    console.log("todayStart")
    console.log(todayStart)
    console.log("inputDateStart")
    console.log(inputDateStart)
    if (inputDateStart.isBefore(todayStart)) {
        throw new Error(MESSAGE.PAST_BOOKING_NOT_ALLOWED);
    }
    // const utcOffset = moment.parseZone(headers['device-timestamp']).format(DATE_TIME_FORMAT.Z);
    let thatDayDST = momentz(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY).tz(process.env.STAFF_ZONE).format();
    const utcOffset = moment.parseZone(thatDayDST).format(DATE_TIME_FORMAT.Z);
    // console.log("utcOffset");
    // console.log(utcOffset);
    let startTime, endTime;
    if (inputDateStart.isSame(todayStart)) {
        isToday = true;
    }
    startTime = moment(BOOKING_DATE + " " + START_HOUR + " " + utcOffset, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z).toDate();
    endTime = moment(BOOKING_DATE + " " + END_HOUR + " " + utcOffset, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z).toDate();
    let knex = require("knex")(con);
    /**
     * This list contains the staff which can work on selected speciality and its their working day (vacation considered).
     */
    const staff = await staffList(knex, BOOKING_DATE);
    if (staff.Error) {
        throw new Error(staff.Error);
    }
    if (staff.length === 0) {
        return slots;
    }
    let calendarEvents = [];
    // calendarEvents = await googleCalendarEvents({ startTime, endTime });
    calendarEvents = await getTodayBookingEvents({
        knex,
        date: BOOKING_DATE
    });
    let todayLeadTime = await knex(CENTER).select("TodayLeadTime");
    await knex.destroy();
    let escEvents = [];
    json.Events
        ? escEvents = json.Events
        : escEvents = [];

    const mappedStaff = await mapStaffEvents(staff, calendarEvents, escEvents);
    AVAILABLE_STAFF = mappedStaff;
    // product 1
    const productOneSlot = await productOneSlots();
    if (productOneSlot.Error) {
        return slots;
    }
    // all other products.
    let finalSlot = await finalSlots(productOneSlot, mappedStaff);
    const totalProducts = PRODUCTS.length;
    let allProductSlot = [];
    console.log(moment(headers['device-timestamp']));
    console.log(moment());
    const deviceTime = moment().add(todayLeadTime[0].TodayLeadTime, "minutes");
    finalSlot.forEach(slot => {
        if (slot.Products.length === totalProducts) {
            let thatTimeDST = momentz(slot.Slot).tz(process.env.STAFF_ZONE).format();
            const utcOffset = moment.parseZone(thatTimeDST).format(DATE_TIME_FORMAT.Z);
            if (isToday) {
                const slotNewTime = slot.Slot.utcOffset(utcOffset);
                if (slotNewTime.isAfter(deviceTime)) {
                    slot.Slot = slotNewTime.format(DATE_TIME_FORMAT.HHcmm);
                    allProductSlot.push(slot);
                }
            } else {
                const slotNewTime = slot.Slot.utcOffset(utcOffset);
                slot.Slot = slotNewTime.format(DATE_TIME_FORMAT.HHcmm)
                allProductSlot.push(slot);
            }
        }
    })

    // get unique slots
    let sortedSlots = allProductSlot.sort(function (a, b) {
        a = a.Slot;
        b = b.Slot;
        if (parseInt(a.split(":")[0]) - parseInt(b.split(":")[0]) === 0) {
            return parseInt(a.split(":")[1]) - parseInt(b.split(":")[1]);
        } else {
            return parseInt(a.split(":")[0]) - parseInt(b.split(":")[0]);
        }
    })
    slots = await filterUniqueSlot(sortedSlots);
    return slots;
}

// fetch staff detail from DB according to selected products' categories
const staffList = async (knex, bookingDate) => {
    let reqProducts = []
    // let categories = [];
    PRODUCTS.forEach(product => {
        // const found = categories.find(f => f === product.CategoryId);
        // if (!found) {
        //     categories.push(product.CategoryId)
        // }
        const found = reqProducts.find(f => f === product.ProductId);
        if (!found) {
            reqProducts.push(product.ProductId)
        }
    });
    try {
        let staffData = await knex
            .select(
                STAFF_PRODUCT + ".StaffId",
                STAFF_PRODUCT + ".ProductId",
                // STAFF_CATEGORY + ".StaffId",
                // STAFF_CATEGORY + ".CategoryId",
                STAFF + ".GoogleEmail",
                STAFF + ".Gender",
            )
            // .from(STAFF_CATEGORY)
            .from(STAFF_PRODUCT)
            // .leftJoin(STAFF, STAFF + ".StaffId", STAFF_CATEGORY + ".StaffId")
            .leftJoin(STAFF, STAFF + ".StaffId", STAFF_PRODUCT + ".StaffId")
            .leftJoin(STAFF_ORGANISATION, STAFF_ORGANISATION + ".StaffId", STAFF_PRODUCT + ".StaffId")
            // .whereIn(STAFF_CATEGORY + ".CategoryId", categories)
            .whereIn(STAFF_PRODUCT + ".ProductId", reqProducts)
            .whereNotNull(STAFF_PRODUCT + ".Rate")
            .andWhere(STAFF + ".Deleted", "=", parseInt(process.env.DELETE_FLAG))
            .andWhere(STAFF_ORGANISATION + ".OrganisationLocationId", '=', COCON_STATIC_ORG_ID)
        let scheduleWiseWorkingStaff = [];
        let staffIds = [];
        for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
            const staff = staffData[staffInc];
            const found = scheduleWiseWorkingStaff.find(s => s.StaffId === staff.StaffId);
            if (!found) {
                // let categories = [staff.CategoryId];
                let availProducts = [staff.ProductId];
                let dayWorking = await staffDaySchedule(knex, staff.StaffId, moment(bookingDate, DATE_TIME_FORMAT.MMLDDLYYYY));
                if (dayWorking.IsWorking) {
                    let finalBlocks = [];
                    dayWorking.BlockTime && dayWorking.BlockTime.Blocks ? dayWorking.BlockTime.Blocks.forEach(element => {
                        element.id = element.StaffBlockTimeId;
                        element.startTime = moment(FORMAT_BOOKING_DATE + "T" + element.StartTime + STAFF_ZONE).utc().format();
                        element.endTime = moment(FORMAT_BOOKING_DATE + "T" + element.EndTime + STAFF_ZONE).utc().format()
                        finalBlocks.push({ ...element });
                    }) : true;
                    let objToPush = {
                        StaffId: staff.StaffId,
                        Gender: staff.Gender,
                        GoogleEmail: staff.GoogleEmail,
                        // Categories: categories,
                        Products: availProducts,
                        DayStart: "",
                        DayEnd: "",
                        GeneralOffer: dayWorking.GeneralOffer,
                        InstantConfirmation: dayWorking.InstantConfirmation,
                        Events: finalBlocks
                    }
                    let finalTimings = this.getDayTimesGOnIC(bookingDate, dayWorking.GeneralOffer.DayStart ? dayWorking.GeneralOffer : {}, dayWorking.InstantConfirmation.DayStart ? dayWorking.InstantConfirmation : {});
                    objToPush.DayStart = finalTimings.DayStart;
                    objToPush.DayEnd = finalTimings.DayEnd;
                    if (finalTimings.Blocks.length) {
                        objToPush.Events.push(...finalTimings.Blocks);
                    }
                    scheduleWiseWorkingStaff.push(objToPush);
                    staffIds.push(objToPush.StaffId);
                }
            } else {
                // const categoryFound = found.Categories.find(f => f === staff.CategoryId);
                // if (!categoryFound) {
                //     found.Categories.push(staff.CategoryId)
                // }
                const productFound = found.Products.find(f => f === staff.ProductId);
                if (!productFound) {
                    found.Products.push(staff.ProductId);
                }
            }
        }
        let staffVacations = await getTodayVacation({
            knex,
            date: moment(bookingDate, DATE_TIME_FORMAT.MMLDDLYYYY),
            staffId: staffIds
        })
        for (let vacInc = 0; vacInc < staffVacations.length; vacInc++) {
            const vacation = staffVacations[vacInc];
            const found = scheduleWiseWorkingStaff.find(f => f.StaffId === vacation.StaffId);
            if (found) {
                if (vacation.Template === VACATION_TEMPLATE.FULL_DAY) {
                    found.FulldayVacation = true;
                } else {
                    found.Events.push({
                        id: vacation.EventId,
                        startTime: moment(vacation.StartTime).format(),
                        endTime: moment(vacation.EndTime).format()
                    })
                }
            }
        }
        return scheduleWiseWorkingStaff.filter(f => !f.FulldayVacation)
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }
}

// Returns staff day timing considering GO and IC schedules.
module.exports.getDayTimesGOnIC = (bookingDate, generalOffer, instantConfirmation) => {
    // bookingDate - MM/DD/YYYY
    let timings = {
        DayStart: "",
        DayEnd: "",
        Blocks: []
    }
    console.log("bookingDate",bookingDate)
    console.log("generalOffer",generalOffer)
    console.log("instantConfirmation",instantConfirmation)
    bookingDate= moment(bookingDate, DATE_TIME_FORMAT.MMLDDLYYYY).format(DATE_TIME_FORMAT.MMLDDLYYYY)
    STAFF_ZONE = zone.getStaffZone(moment(bookingDate + " 12:00", DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm).utc().format());
    FORMAT_BOOKING_DATE = moment(bookingDate, DATE_TIME_FORMAT.MMLDDLYYYY).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);
    // Check if any of the schedule is empty then make timings as per available schedule.
    if (!Object.keys(generalOffer).length || !Object.keys(instantConfirmation).length) {
        console.log("1")
        if (Object.keys(generalOffer).length) {
            timings.DayStart = generalOffer.DayStart;
            timings.DayEnd = generalOffer.DayEnd;
        } else {
            timings.DayStart = instantConfirmation.DayStart;
            timings.DayEnd = instantConfirmation.DayEnd;
        }
        return timings;
    }
    
    let goStart = moment(bookingDate + "" + generalOffer.DayStart + "" + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY + "" + DATE_TIME_FORMAT.HHcmmcss + "Z");
    let goEnd = moment(bookingDate + "" + generalOffer.DayEnd + "" + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY + "" + DATE_TIME_FORMAT.HHcmmcss + "Z");
    let icStart = moment(bookingDate + "" + instantConfirmation.DayStart + "" + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY + "" + DATE_TIME_FORMAT.HHcmmcss + "Z");
    let icEnd = moment(bookingDate + "" + instantConfirmation.DayEnd + "" + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY + "" + DATE_TIME_FORMAT.HHcmmcss + "Z");
console.log("instantConfirmation",instantConfirmation)
console.log(goStart)
console.log(goEnd)
console.log(icStart)
console.log(icEnd)

    // Check if any schedule is overlapping.
    if (
        (  // IC is completely inside GO.
            icStart.isBetween(goStart, goEnd, "minute", "[]") &&
            icEnd.isBetween(goStart, goEnd, "minute", "[]")
        ) ||
        (  // GO is completely inside IC.
            goStart.isBetween(icStart, icEnd, "minute", "[]") &&
            goEnd.isBetween(icStart, icEnd, "minute", "[]")
        )
    ) {console.log("2")
        timings.DayStart = goStart.isBefore(icStart) || goStart.isSame(icStart)
            ? generalOffer.DayStart
            : instantConfirmation.DayStart;

        timings.DayEnd = goEnd.isAfter(icEnd) || goEnd.isSame(icEnd)
            ? generalOffer.DayEnd
            : instantConfirmation.DayEnd;
        return timings;
    }

    // GO time starts first and IC time ends later.
    if (goStart.isBefore(icStart) && (icStart.isBefore(goEnd) || icStart.isSame(goEnd))) {
        console.log("3")
        timings.DayStart = generalOffer.DayStart;
        timings.DayEnd = instantConfirmation.DayEnd;
        return timings;
    }

    // IC time starts first and GO time ends later.
    if (icStart.isBefore(goStart) && (goStart.isBefore(icEnd) || goStart.isSame(icEnd))) {
        console.log("4")
        timings.DayStart = instantConfirmation.DayStart;
        timings.DayEnd = generalOffer.DayEnd;
        return timings;
    }

    // IC ends before GO start, so start with IC & end with GO with a block time between GO and IC.
    if (icEnd.isBefore(goStart)) {
        console.log("5")
        timings.DayStart = instantConfirmation.DayStart;
        timings.DayEnd = generalOffer.DayEnd;
        timings.Blocks = [{
            id: uuidv4(),
            startTime: moment(FORMAT_BOOKING_DATE + "T" + instantConfirmation.DayEnd + STAFF_ZONE).format(),
            endTime: moment(FORMAT_BOOKING_DATE + "T" + generalOffer.DayStart + STAFF_ZONE).format()
        }]
        return timings;
    }

    // GO ends before IC start, so start with GO & end with IC with a block time between IC and GO.
    if (icStart.isAfter(goEnd)) {
        console.log("6")
        timings.DayStart = generalOffer.DayStart;
        timings.DayEnd = instantConfirmation.DayEnd;
        timings.Blocks = [{
            id: uuidv4(),
            startTime: moment(FORMAT_BOOKING_DATE + "T" + generalOffer.DayEnd + STAFF_ZONE).format(),
            endTime: moment(FORMAT_BOOKING_DATE + "T" + instantConfirmation.DayStart + STAFF_ZONE).format()
        }]
        return timings;
    }
}

// Map given events to their respective staff in given staff list, it is based on their email
const mapStaffEvents = async (staff, calendarEvents, escEvents) => {
    for (let evInc = 0; evInc < calendarEvents.length; evInc++) {
        const event = calendarEvents[evInc];
        if (escEvents.includes(event.id)) {
            continue;
        }
        const attendee = event.attendees
            ? event.attendees.filter(att => att.email !== process.env.EMAIL)[0]
            : null;
        const found = attendee ? staff.find(st => st.GoogleEmail === attendee.email) : null;
        if (found) {
            if (event.recurringEventId) {
                // this is a recurring event check start date, if its same as requ, then its a vacation
                if (event.start.date) {
                    const recEvStart = moment(event.start.date, DATE_TIME_FORMAT.YYYYdaMMdaDD);
                    const bookDate = moment(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY);
                    if (recEvStart.isSame(bookDate)) {
                        found.OnVacation = true;
                    }
                }
            } else if (event.start.date) {
                // This is a single full day event
                found.OnVacation = true;
            }
            let eventEnd = moment(event.end.dateTime);
            let eventStart = moment(event.start.dateTime);
            const eventObj = {
                id: event.id,
                startTime: moment(event.start.dateTime).utc().format(),
                endTime: moment(event.end.dateTime).utc().format()
            };
            if (event.extendedProperties && event.extendedProperties.shared.ReachOutTime) {
                eventObj.startTime = moment(event.start.dateTime)
                    .subtract((parseInt(event.extendedProperties.shared.ReachOutTime) + parseInt(BUFFER_BEFORE)), "minute")
                    .utc().format();
            }
            if (event.extendedProperties && event.extendedProperties.shared.ReturnTime) {
                eventObj.endTime = moment(event.end.dateTime)
                    .add((parseInt(event.extendedProperties.shared.ReturnTime) + parseInt(BUFFER_AFTER)), "minute")
                    .utc().format();
            }
            let staffDayStart = moment(FORMAT_BOOKING_DATE + "T" + found.DayStart + STAFF_ZONE);
            let staffDayEnd = moment(FORMAT_BOOKING_DATE + "T" + found.DayEnd + STAFF_ZONE);
            if (
                eventEnd.isBefore(staffDayStart) || eventEnd.isSame(staffDayStart) ||
                eventStart.isAfter(staffDayEnd) || eventStart.isSame(staffDayEnd)
            ) {
                // This event ends before/at day start or starts after/at day end.
                continue;
            } else {
                found.Events.push(eventObj);
            }
        }
    }
    staff.forEach(staf => {
        /**
         * 1. Calculate total working time of staff in minutes
         * 2. Calculate total staff busy time by adding each event duration
         * 3. Calculate total free time by subtracting busy time from working time
         */
        let staffWorkingTime = moment(staf.DayEnd, DATE_TIME_FORMAT.HHcmmcss).diff(moment(staf.DayStart, DATE_TIME_FORMAT.HHcmmcss), "minute");
        let staffBusy = 0;
        staf.Events.forEach(event => {
            staffBusy += moment(event.endTime).diff(moment(event.startTime), "minute");
        });
        const staffFree = staffWorkingTime - staffBusy;
        staf.free = staffFree;
    });

    staff.sort((a, b) => {
        return b.free - a.free;
    })
    return staff;
}

// calculate slots for product 1
const productOneSlots = async () => {
    // Filter out product 1 staff for calculating slots from all of them.
    const productOneStaff = AVAILABLE_STAFF.filter(staff => {
        if (PRODUCTS[0].Therapist === 2) {
            if (staff.Products.includes(PRODUCTS[0].ProductId)) {
                return true;
            } else {
                return false;
            }
        } else {
            if (staff.Products.includes(PRODUCTS[0].ProductId) && staff.Gender === PRODUCTS[0].Therapist) {
                return true;
            } else {
                return false;
            }
        }
    })
    // const productOneStaff = AVAILABLE_STAFF.filter(staff => {
    //     if (PRODUCTS[0].Therapist === 2) {
    //         if (staff.Categories.includes(PRODUCTS[0].CategoryId)) {
    //             return true;
    //         } else {
    //             return false;
    //         }
    //     } else {
    //         if (staff.Categories.includes(PRODUCTS[0].CategoryId) && staff.Gender === PRODUCTS[0].Therapist) {
    //             return true;
    //         } else {
    //             return false;
    //         }
    //     }
    // })
    let globalSlots = [];
    for (let staffInc = 0; staffInc < productOneStaff.length; staffInc++) {
        const staff = productOneStaff[staffInc];
        if (staff.OnVacation) {
            continue;
        }
        const trimmedRanges = await createRanges(staff, PRODUCTS[0].PreparationTime);
        console.log("Ranges")
        console.log(trimmedRanges)
        const slots = await createSlot({
            product: PRODUCTS[0],
            staff: staff,
            ranges: trimmedRanges,
        });
        globalSlots.push(...slots);
    }
    return globalSlots;
}

// Create trimmed ranges for given staff
const createRanges = async (staff, productPrep) => {
    const reachOutTime = productPrep + REACH_OUT_TIME;
    console.log("creating ranges for Staff");
    console.log(staff)
    let ranges = [];
    if (staff.OnVacation) {
        return ranges;
    }
    let filteredEvents= await getFilteredEvents(staff)

    if (filteredEvents.length > 0) {
        let sortedEvents = await getStaffEvents(filteredEvents);
        // Loop over sortedEvents and create ranges
        for (let i = 0; len = sortedEvents.length, i < len; i++) {
            const event = sortedEvents[i];
            if (i === 0) {
                // for first event create range from day start upto event start
                const firstEventStart = moment(event.startTime).utc();
                const dayStart = moment(FORMAT_BOOKING_DATE + "T" + staff.DayStart + STAFF_ZONE).utc();
                // Below lines are commented because we are not considering the reach out time for day start.
                // dayStart.add(reachOutTime, "minute");
                // dayStart.add(DAY_START_BUFFER, "minute");
                if (dayStart.isBefore(firstEventStart)) {
                    // create range if only day start time is less than first event start time
                    ranges.push({
                        start: getFifteenMultipleMoment(dayStart),
                        end: firstEventStart
                    })
                }
                if (sortedEvents.length > 1) {
                    // if there are multiple events create range from first event end to next event start
                    const dayEnd = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE).utc();
                    const firstEventEnd = moment(event.endTime).utc();
                    firstEventEnd.add(reachOutTime, "minute")
                    const nextEventStart = moment(sortedEvents[i + 1].startTime).utc();

                    // try to create range only if first event end is before day end.
                    if (firstEventEnd.isBefore(dayEnd)) {
                        // next event is after day end, so create range upto day end.
                        if (nextEventStart.isAfter(dayEnd) || nextEventStart.isSame(dayEnd)) {
                            ranges.push({
                                start: getFifteenMultipleMoment(firstEventEnd),
                                end: dayEnd
                            });
                        }

                        // next event is before day end, so create range upto next event end.
                        if (nextEventStart.isBefore(dayEnd)) {
                            if (firstEventEnd.isBefore(nextEventStart)) {
                                ranges.push({
                                    start: getFifteenMultipleMoment(firstEventEnd),
                                    end: nextEventStart
                                });
                            }
                        }
                    }
                }
            } else if (i !== len - 1) {
                // for all middle events create range from current event end to next event start
                const currentEventEnd = moment(event.endTime).utc();
                currentEventEnd.add(reachOutTime, "minute");
                const nextEventStart = moment(sortedEvents[i + 1].startTime).utc();
                const dayEnd = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE).utc();
                if (currentEventEnd.isBefore(dayEnd)) {
                    // try to create range only if current event ends before day end.
                    if (nextEventStart.isBefore(dayEnd)) {
                        // create range upto next event start
                        if (nextEventStart.diff(currentEventEnd, "minute") >= parseInt(SLOT_GAP)) {
                            ranges.push({
                                start: getFifteenMultipleMoment(currentEventEnd),
                                end: nextEventStart
                            })
                        }
                    }
                    if (nextEventStart.isAfter(dayEnd) || nextEventStart.isSame(dayEnd)) {
                        // create range upto day end
                        if (nextEventStart.diff(currentEventEnd, "minute") >= parseInt(SLOT_GAP))
                            ranges.push({
                                start: getFifteenMultipleMoment(currentEventEnd),
                                end: dayEnd
                            })
                    }
                }
            }
            if (i === len - 1) {
                // this is last event create range from its end upto day end.
                const lastEventEnd = moment(event.endTime).utc();
                lastEventEnd.add(reachOutTime, "minute");
                const dayEnd = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE).utc();
                if (lastEventEnd.isBefore(dayEnd)) {
                    ranges.push({
                        start: getFifteenMultipleMoment(lastEventEnd),
                        end: dayEnd
                    })
                }
            }
        }
    }
    if (filteredEvents.length === 0) {
        const startTime = moment(FORMAT_BOOKING_DATE + "T" + staff.DayStart + STAFF_ZONE).utc();
        // Below lines are commented because we are not considering the reach out for day start.
        // startTime.add(reachOutTime, "minute");
        // startTime.add(DAY_START_BUFFER, "minute");
        const endTime = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE).utc();
        ranges.push({
            start: getFifteenMultipleMoment(startTime),
            end: endTime
        });
    }
    return ranges;
}

const getFifteenMultipleMoment = (startTime) => {
    let minutes = startTime.get("minutes")
    console.log("Minutes: " + minutes);
    let minutesToAdd = 0;
    if (minutes < 15) {
        minutesToAdd = 15 - minutes;
    } else {
        let rem = minutes % 15;
        console.log("rem: " + minutes);
        console.log(rem)
        if (rem) {
            minutesToAdd = 15 - rem;
        }
    }
    console.log("Minutes to add: " + minutesToAdd);
    return startTime.add(minutesToAdd, "minutes");
}

// For given events check if any of them overlaps then merge and return sorted
const getStaffEvents = async (events) => {
    let finalEvents = [];
    // Sort Events based on StartTime
    let sortedEvents = events.sort(function (a, b) {
        let firstElement = moment(a.startTime);
        let nextElement = moment(b.startTime);
        if (firstElement.isBefore(nextElement)) {
            return -1;
        } else if (firstElement.isSame(nextElement)) {
            return 0;
        } else {
            return 1;
        }
    })
    sortedEvents.forEach(event => {
        if (finalEvents.length > 0) {
            let prevEvEnd = moment(finalEvents[finalEvents.length - 1].endTime);
            let curEvStart = moment(event.startTime);
            let curEvEnd = moment(event.endTime);
            if (
                prevEvEnd.isBetween(curEvStart, curEvEnd, "minute", "[]")
            ) {
                finalEvents[finalEvents.length - 1].endTime = event.endTime;
            } else if (
                !prevEvEnd.isAfter(curEvEnd)
            ) {
                finalEvents.push(event);
            }
        } else {
            finalEvents.push(event);
        }
    });
    return finalEvents;
}

// Create initial slots
const createSlot = async ({ product, staff, ranges }) => {
    let validSlots = [];
    for (let i = 0; len = ranges.length, i < len; i++) {
        const range = ranges[i];
        // create slots in given range of SLOT_GAP gap between each.
        const rangeStartTime = range.start;
        const rangeEndTime = range.end;
        if (rangeEndTime.diff(rangeStartTime, "minute") >= parseInt(SLOT_GAP)) {
            let timeSlots = [];
            while (rangeStartTime < rangeEndTime) {
                timeSlots.push(new moment(rangeStartTime));
                rangeStartTime.add(parseInt(SLOT_GAP), 'minute');
            }

            // validate each slot with rangeEndTime by adding product duration in slot
            timeSlots.forEach(slot => {
                const slotEndTime = new moment(slot);
                slotEndTime.add(product.Duration, "minute");
                slotEndTime.add(RETURN_TIME, "minute");
                if (slotEndTime.isBefore(rangeEndTime) || slotEndTime.isSame(rangeEndTime)) {
                    validSlots.push({
                        Slot: slot,
                        RangeEndTime: rangeEndTime,
                        Products: [
                            {
                                id: product.id,
                                ProductId: product.ProductId,
                                StartTime: new moment(slot).utc().format(),
                                Duration: product.Duration,
                                Name: product.Name,
                                Staff: [
                                    {
                                        StaffId: staff.StaffId,
                                        GoogleEmail: staff.GoogleEmail
                                    }
                                ],
                            }
                        ]
                    })
                }
            });
        }
    }
    return validSlots;
}

// Return staff requirement for next product according to previous product
const getStaffRequirement = (preProduct, nextProduct, preProdStaffId) => {
    /**
     * This will check if previous product therapist is same as next or next product have either preference
     * and if next product is not a same time request
     * also check if previous product can work on next product category
     */
    if (nextProduct.SameTime) {
        return false;
    }
    let pref = [
        THERAPIST_PREF.MALE,
        THERAPIST_PREF.FEMALE
    ];
    if (
        pref.includes(nextProduct.Therapist) &&
        pref.includes(preProduct.Therapist) &&
        nextProduct.Therapist !== preProduct.Therapist
    ) {
        /**If both products have different 
         * preference then this will handled */
        console.log('from 1')
        return false;
    } else {
        /**
         * If both products have same preference or any of them have either pref.
         */
        const staff = AVAILABLE_STAFF.find(f => f.StaffId === preProdStaffId);
        if (preProduct.Therapist === THERAPIST_PREF.EITHER) {
            switch (nextProduct.Therapist) {
                case THERAPIST_PREF.MALE: {
                    if (staff.Gender === THERAPIST_PREF.MALE && staff.Products.includes(nextProduct.ProductId)) {
                        console.log('from 2')
                        return true;
                    } else {
                        console.log('from 3')
                        return false;
                    }
                }
                case THERAPIST_PREF.FEMALE: {
                    if (staff.Gender === THERAPIST_PREF.FEMALE && staff.Products.includes(nextProduct.ProductId)) {
                        console.log('from 4')
                        return true;
                    } else {
                        console.log('from 5')
                        return false;
                    }
                }
                case THERAPIST_PREF.EITHER: {
                    console.log('from 6')
                    if (staff.Products.includes(nextProduct.ProductId))
                        return true;
                }
            }
        }
        /** Return based on speciality */
        if (
            nextProduct.ProductId === preProduct.ProductId ||
            staff.Products.includes(nextProduct.ProductId)
            // nextProduct.CategoryId === preProduct.CategoryId ||
            // staff.Categories.includes(nextProduct.CategoryId)
        ) {
            console.log('from 7')
            return true;
        } else {
            return false;
        }
    }
}

// Create slots for remaining products
const finalSlots = async (initialSlot) => {
    for (let prodInc = 1; prodInc < PRODUCTS.length; prodInc++) {
        const product = PRODUCTS[prodInc];
        // first find which staff can work on this product
        const productStaff = AVAILABLE_STAFF.filter(staff => {
            if (product.Therapist === 2) {
                if (staff.Products.includes(product.ProductId)) {
                    return true;
                } else {
                    return false;
                }
            } else {
                if (staff.Products.includes(product.ProductId) && staff.Gender === product.Therapist) {
                    return true;
                } else {
                    return false;
                }
            }
        })
        // const productStaff = AVAILABLE_STAFF.filter(staff => {
        //     if (product.Therapist === 2) {
        //         if (staff.Categories.includes(product.CategoryId)) {
        //             return true;
        //         } else {
        //             return false;
        //         }
        //     } else {
        //         if (staff.Categories.includes(product.CategoryId) && staff.Gender === product.Therapist) {
        //             return true;
        //         } else {
        //             return false;
        //         }
        //     }
        // })
        for (let slotInc = 0; slotInc < initialSlot.length; slotInc++) {
            const slot = initialSlot[slotInc];
            if (slot.Discard) {
                // skip if slot is already marked to discard
                continue;
            }
            // check if previous product staff can work for current product
            const sameStaff = getStaffRequirement(PRODUCTS[0], product, slot.Products[0].Staff[0].StaffId);
            console.log(sameStaff)
            if (sameStaff) {
                const slotUpdatedEndTime = new moment(slot.Slot);
                let existingDuration = 0;
                slot.Products.forEach(element => {
                    existingDuration += element.Duration;
                });
                slotUpdatedEndTime.add((existingDuration + product.PreparationTime + product.Duration + RETURN_TIME), "minute");
                if (slotUpdatedEndTime.isBefore(slot.RangeEndTime) || slotUpdatedEndTime.isSame(slot.RangeEndTime)) {
                    // updated slot time is less than its range so it can be selected, push this product in it.
                    slot.SlotEndTime = slotUpdatedEndTime;
                    slot.Products.push({
                        ProductId: product.ProductId,
                        id: product.id,
                        StartTime: new moment(slot.Slot).add(existingDuration + product.PreparationTime, "minute").utc().format(),
                        Name: product.Name,
                        Staff: slot.Products[0].Staff
                    })
                    slot.Discard = false;
                } else {
                    // after update slot is not feasible, mark it to discard
                    slot.Discard = true;
                }
            } else {
                if (!product.SameTime) {
                    /**
                     * Its a B2B request, but another therapist is required either due to category of preference
                     * Also add previous product duration in slot then check with next product duration, prep time, return time
                     */
                    let anotherStaff = productStaff.filter(f => f.StaffId !== slot.Products[0].Staff[0].StaffId);
                    if (anotherStaff.length === 0) {
                        slot.Discard = true;
                        continue;
                    }
                    const slotUpdatedEndTime = new moment(slot.Slot);
                    let existingDuration = 0;
                    slot.Products.forEach(element => {
                        existingDuration += element.Duration;
                    });
                    slotUpdatedEndTime.add((existingDuration + product.Duration + RETURN_TIME), "minute");
                    for (let st = 0; st < anotherStaff.length; st++) {
                        const seleStaff = anotherStaff[st];
                        const trimmedRanges = await createRanges(seleStaff, product.PreparationTime);
                        for (let rangeInc = 0; rangeInc < trimmedRanges.length; rangeInc++) {
                            const range = trimmedRanges[rangeInc];
                            if (
                                (slot.Slot.isAfter(range.start) || slot.Slot.isSame(range.start)) &&
                                (slotUpdatedEndTime.isBefore(range.end) || slotUpdatedEndTime.isSame(range.end))
                            ) {
                                const prodFound = initialSlot[slotInc].Products.find(f => f.id === product.id);
                                if (!prodFound) {
                                    // this range is can work for this slot, just insert staff & continue
                                    initialSlot[slotInc].Products.push({
                                        ProductId: product.ProductId,
                                        id: product.id,
                                        StartTime: new moment(slot.Slot).add(existingDuration, "minute").utc().format(),
                                        Duration: product.Duration,
                                        Name: product.Name,
                                        Staff: [{ StaffId: seleStaff.StaffId, GoogleEmail: seleStaff.GoogleEmail }]
                                    })
                                    initialSlot[slotInc].Discard = false;
                                } else {
                                    prodFound.Staff.push({ StaffId: seleStaff.StaffId, GoogleEmail: seleStaff.GoogleEmail });
                                }
                                break;
                            }
                        }
                    }
                } else {
                    // Product is a same-time request, so new staff is needed
                    let anotherStaff = productStaff.filter(f => f.StaffId !== slot.Products[0].Staff[0].StaffId);
                    if (anotherStaff.length === 0) {
                        slot.Discard = true;
                        continue;
                    }
                    for (let st = 0; st < anotherStaff.length; st++) {
                        const seleStaff = anotherStaff[st];
                        const slotUpdatedEndTime = new moment(slot.Slot);
                        slotUpdatedEndTime.add((product.Duration + RETURN_TIME), "minute");
                        const trimmedRanges = await createRanges(seleStaff, product.PreparationTime);
                        for (let rangeInc = 0; rangeInc < trimmedRanges.length; rangeInc++) {
                            const range = trimmedRanges[rangeInc];
                            if (
                                (slot.Slot.isAfter(range.start) || slot.Slot.isSame(range.start)) &&
                                (slotUpdatedEndTime.isBefore(range.end) || slotUpdatedEndTime.isSame(range.end))
                            ) {
                                const prodFound = initialSlot[slotInc].Products.find(f => f.id === product.id);
                                if (!prodFound) {
                                    // this range is can work for this slot, just insert staff & continue
                                    initialSlot[slotInc].Products.push({
                                        ProductId: product.ProductId,
                                        id: product.id,
                                        StartTime: new moment(slot.Slot).utc().format(),
                                        Duration: product.Duration,
                                        Name: product.Name,
                                        Staff: [{ StaffId: seleStaff.StaffId, GoogleEmail: seleStaff.GoogleEmail }]
                                    })
                                    initialSlot[slotInc].Discard = false;
                                } else {
                                    prodFound.Staff.push({ StaffId: seleStaff.StaffId, GoogleEmail: seleStaff.GoogleEmail });
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    return initialSlot;
}

const filterUniqueSlot = async (allProductSlot) => {
    let uniqueSlots = [];
    allProductSlot.forEach(slot => {
        delete slot.RangeEndTime;
        delete slot.SlotEndTime;
        delete slot.Discard;
        slot.Products.forEach(f => delete f.id);
        if (uniqueSlots.length === 0) {
            uniqueSlots.push(slot);
        } else {
            const slotFound = uniqueSlots.find(f => f.Slot === slot.Slot);
            if (slotFound) {
                slot.Products.forEach((product, index) => {
                    product.Staff.forEach(staff => {
                        const found = slotFound.Products[index].Staff.find(f => f.StaffId === staff.StaffId);
                        if (!found) {
                            slotFound.Products[index].Staff.push(staff);
                        }
                    });
                });
            } else {
                const lastElementTime = moment(uniqueSlots[uniqueSlots.length - 1].Slot, DATE_TIME_FORMAT.HHcmm);
                const currentElementTime = moment(slot.Slot, DATE_TIME_FORMAT.HHcmm);
                if (currentElementTime.diff(lastElementTime, "minute") >= parseInt(SLOT_GAP)) {
                    uniqueSlots.push(slot)
                }
            }
        }
    });
    return uniqueSlots;
}
module.exports.getCMSTimeSlots = async event => {
    let todayLeadTime;
    try {
        // let knex = require("knex")(con);
       
        //Data
        let config = {
            slotInterval: 5,
            openTime: '00:00',
            closeTime: '23:59'
        };
        
        // Format the time
        let startTime = moment(config.openTime, "HH:mm");
        
        //Format the end time and the next day to it 
        let endTime = moment(config.closeTime, "HH:mm")
        
        //Times
        var allTimes = [];
        
        //Loop over the times - only pushes time with 30 minutes interval
        console.log(startTime)
        console.log(endTime)
        while (startTime < endTime) {
            //Push times
            allTimes.push(startTime.format("HH:mm")); 
            //Add interval of 'slotInterval' minutes
            startTime.add(config.slotInterval, 'minutes');
        }
        // todayLeadTime = await knex(CENTER).select("TodayLeadTime");
        // await knex.destroy()
    } catch (error) {
        console.log(error);
        await knex.destroy()
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
            Data: {timeSlot:allTimes}
        })
    }
}

module.exports.checkAvailability = async event => {
    let knex;
    try {
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json 
            || !json.Date || typeof json.Date !== "string"
            || !json.Duration || typeof json.ReachOutTime !== "number"
            || typeof json.Therapist !== 'number' || json.Therapist < 0 || json.Therapist > 2
            || !json.ReachOutTime || typeof json.ReachOutTime !== "number"
            || !json.OrganisationLocationId || typeof json.OrganisationLocationId !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        /*************** Step 1  *******************/
        /****** Create the time-slot with defined interval  ******/
        // check if date requested is today or future dates
        let isToday = false;
        const todayStart = momentz().startOf('day');
        const inputDateStart = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day');
        if (inputDateStart.isSame(todayStart)) {
             isToday = true;
        }
        let todayLeadTime = await knex(CENTER).select("TodayLeadTime");
        console.log("todayLeadTime",todayLeadTime)
        let slotStart='09:00'
        if(isToday){
            currentTimewithleadtime=momentz().tz(process.env.STAFF_ZONE).add(todayLeadTime[0].TodayLeadTime, "minutes");
            currentMin=momentz().tz(process.env.STAFF_ZONE).add(todayLeadTime[0].TodayLeadTime, "minutes").minutes()
            let minToAdd;
            switch (true) {
                case (currentMin <= 15):
                    minToAdd=15- currentMin
                    break;
                case (currentMin <= 30):
                    minToAdd=30- currentMin
                    break;
                case (currentMin <= 45):
                    minToAdd=45- currentMin
                    break;
                case (currentMin <= 60):
                    minToAdd=60- currentMin
                    break;
            }
            slotStart=momentz().tz(process.env.STAFF_ZONE).add(todayLeadTime[0].TodayLeadTime, "minutes").add(minToAdd,"minutes").format(DATE_TIME_FORMAT.HHcmm)
            // if(currentMin>30){
            //     let minToSubtract=60-currentMin
            //     console.log(minToSubtract)
            //     slotStart=momentz().tz(process.env.STAFF_ZONE).add(todayLeadTime[0].TodayLeadTime, "minutes").add(minToSubtract,"minutes").format(DATE_TIME_FORMAT.HHcmm)
            // }else{
            //     let minToSubtract=30- currentMin
            //     console.log(minToSubtract)
            //     console.log((todayLeadTime[0].TodayLeadTime))
            //     slotStart=momentz().tz(process.env.STAFF_ZONE).add(todayLeadTime[0].TodayLeadTime, "minutes").add(minToSubtract,"minutes").format(DATE_TIME_FORMAT.HHcmm)
            // }

            console.log("slotStart",slotStart)
        }else{
            slotStart='09:00'
        }
        // return;
       
        let config = {
            slotInterval: 15,
            openTime: slotStart,
            closeTime: '23:59'
        };
        // Format the time
        let startTime = moment(config.openTime, "HH:mm");
        // Format the end time and the next day to it 
        let endTime = moment(config.closeTime, "HH:mm")
        // All Times-slots Array 
        var timeSlots = [];
        //Loop over the times - only pushes time with 30 minutes interval
        while (startTime < endTime) {
            //Push times
            timeSlots.push(startTime.format("HH:mm")); 
            //Add interval of 'slotInterval' minutes
            startTime.add(config.slotInterval, 'minutes');
        }

        /*************** Step 2  *******************/
        /*********   Get Staff availability *************/
  
        
        let bookingDate = moment(json.Date, DATE_TIME_FORMAT.MMLDDLYYYY)
        console.log("bookingDate : ", bookingDate.format("dddd, MMMM Do YYYY, h:mm:ss a"))
        let scheduleWiseWorkingStaff = [];
        FORMAT_BOOKING_DATE = bookingDate.format(DATE_TIME_FORMAT.YYYYdaMMdaDD);
        STAFF_ZONE = zone.getStaffZone(moment(json.Date + " 12:00", DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm).format());

        let therapistFilter = {
            therapistPreference: json.Therapist,
            OrganisationLocationId: json.OrganisationLocationId
        };
        let staffDataList= await getSelectedDayStaffsSchedule(knex, bookingDate, therapistFilter)
        for (let staffInc = 0; staffInc < staffDataList.length; staffInc++) {
            const staff = staffDataList[staffInc];
            if (staff.Schedule.IsWorking) {
                let finalBlocks = [];
                staff.Schedule.BlockTime.Blocks && staff.Schedule.BlockTime.Blocks.forEach(element => {
                    element.id = element.StaffBlocKTimeId;
                    element.startTime = moment(FORMAT_BOOKING_DATE + "T" + element.StartTime + STAFF_ZONE).utc().format();
                    element.endTime = moment(FORMAT_BOOKING_DATE + "T" + element.EndTime + STAFF_ZONE).utc().format()
                    finalBlocks.push({ ...element });
                });
                let objToPush = {
                    ...staff,
                    DayStart: "",
                    DayEnd: "",
                    GeneralOffer: staff.Schedule.GeneralOffer,
                    InstantConfirmation: staff.Schedule.InstantConfirmation,
                    Events: finalBlocks,
                    Bookings: [],
                }
                // Remove the Schedule key from the object
                delete objToPush.Schedule;
                let finalTimings = this.getDayTimesGOnIC(bookingDate, staff.Schedule.GeneralOffer.DayStart ? staff.Schedule.GeneralOffer : {}, staff.Schedule.InstantConfirmation.DayStart ? staff.Schedule.InstantConfirmation : {});
                
                console.log("finalTimings")
                console.log(finalTimings)
                objToPush.DayStart = finalTimings.DayStart;
                objToPush.DayEnd = finalTimings.DayEnd;
                if (finalTimings.Blocks.length) {
                    objToPush.Events.push(...finalTimings.Blocks);
                }
                scheduleWiseWorkingStaff.push(objToPush);
            }
        }

        // console.log("scheduleWiseWorkingStaff : ", scheduleWiseWorkingStaff)

        /*************** Step 3  *******************/
        /*********   Get Bookings for selected date *************/
        // Below code fetch the bookings of staffs for the date passed in API
        let bookings = await getBookingsForDate(knex, bookingDate, true);
        // console.log(bookings)
        for (let count = 0; count < bookings.length; count++) {
            const staffIndex = scheduleWiseWorkingStaff.findIndex(
                staff => staff.StaffId === bookings[count].StaffId
            );
            
            if(staffIndex!=-1){
                const staff = scheduleWiseWorkingStaff[staffIndex];
                let bookingAry = staff.Bookings || [];
                bookingAry = [...bookingAry, bookings[count]];
                staff.Bookings = bookingAry;
            }
        }

        /*************** Step 4  *******************/
        /*********   Convert blocktime, bookings and others as events *************/
        let staffFinalData = await createStaffEvents(json.Date, scheduleWiseWorkingStaff, STAFF_ZONE)
        // console.log("staffFinalData : ", staffFinalData)


        /*************** Step 5  *******************/
        /********* Get Products data for preparation time and other info *************/
        const products = await productCMS(knex, null, TRANSLATION_LANGUAGE.ENGLISH, null,false,json.OrganisationLocationId);
        // console.log(products)


        /*************** Step 5.1  *******************/
        /********* Filter staff based on the skill( this is temporrary solution for binding staff and organisation together using skills will be deleted later once staff 
         * organisation will be directly linked) *************/
        let staffFilteredData=[]
            staffFinalData.forEach(staff => {
                products.forEach(prod => {
               if(staff.SkillProducts.includes(prod.ProductId)){
                
                let found = staffFilteredData.find(filterdata => filterdata.StaffId === staff.StaffId);
                if(!found){
                    staffFilteredData.push(staff)
                }
               }
                });
            });
            console.log("staffFilteredData : ", staffFilteredData)

        /*************** Step 6  *******************/
        /********* Check staff availability and prepare the response grid *************/
        const payload = {
            Date: json.Date,
            TimeSlots: timeSlots,
            Duration: json.Duration,
            ReachOutTime: json.ReachOutTime,
            StaffData: staffFilteredData,
            StaffZone: STAFF_ZONE,
            Products: products,
        }
        const availabilityData = await checkTimeSlotAvailability(payload,json.OrganisationLocationId)
        const {staffAvailability, staffDetails} = availabilityData

        var responseData = {
            StaffAvailability: staffAvailability,
            Staff: staffDetails,
            Products: products,
        };

        if (knex != null) {
            await knex.destroy()
          }
    } catch (error) {
        console.log(error);
        if (knex != null) {
          await knex.destroy()
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
            Message: MESSAGE.STAFF_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: responseData
        })
    }
}



const createStaffEvents = async (date, staffData, STAFF_ZONE) => {
    console.log("createStaffEvents date: ", date)
    const selectedDate = date; //moment(date).format(DATE_TIME_FORMAT.MMLDDLYYYY);
    console.log("createStaffEvents selectedDate: ", selectedDate)
    for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
        const staff = staffData[staffInc];
        let staffEvents = [];
        staff.Events.forEach(block => {
            console.log("block",block)
            staffEvents.push({
                startTime: moment(block.startTime),
                endTime: moment(block.endTime),
                type:0
            })
        });
        
        staff.Bookings.forEach(booking => {
            let start = moment(booking.StartTime).format()
            let end = moment(booking.StartTime)
                        .add(booking.ProdTotalDuration, "minute")
                        .utc()
                        .format()
            console.log("start",start)
            console.log("end",end)
            let pushObj = {
                id: booking.EventId,
                startTime: moment(start), 
                endTime: moment(end),
                type:1,
                OrganisationLocationId:booking.OrganisationLocationId,
                reachOutTime:booking.ReachOutTime
            }
            // Commented after the new logic for the availability 02/05/24

            // if (booking.ReachOutTime || booking.PreparationTime) {
            //     const timeSum = booking.ReachOutTime + booking.PreparationTime
            //     const toSub = timeSum + parseInt(process.env.BUFFER_BEFORE);
            //     pushObj.startTime = moment(start).subtract(toSub, "minute");
            // }
            // if (booking.ReachOutTime) {
            //     const returnTime = booking.ReachOutTime
            //     const toAdd = returnTime + parseInt(process.env.BUFFER_AFTER);
            //     pushObj.endTime = moment(end).add(toAdd, "minute");
            // }
            console.log("pushObj",pushObj)
            staffEvents.push(pushObj);
        });
        staffEvents.sort((a, b) => a.startTime - b.startTime);
        console.log(`staffEvents ${staff.Name} :`,staffEvents)
        staff.CheckableEvents = staffEvents
    }  
    
    return staffData
}

const checkTimeSlotAvailability = async (payload,OrganisationLocationId) => {
    
    const selectedDate = payload.Date
    const timeslots = payload.TimeSlots
    const duration = payload.Duration
    const reachOutTime = payload.ReachOutTime
    const staffData = payload.StaffData
    const STAFF_ZONE= payload.StaffZone
    const products = payload.Products

    // Preprocessing of data
    // get all possible preparation times in all products
    const preparationTimes = products.map(item => item.PreparationTime)
                                     .filter((value, index, self) => self.indexOf(value) === index)
    const staffAvailability = {};
    const staffDetails = [];

    // Supportive function for setting productwise staff
    // availabilityBasedOnPT stands for => availability Based On Preparation time
    const setProductWiseStaff = (ProductWiseStaff, availabilityBasedOnPT, staff) => {
        for (let k = 0; k < products.length; k++) {
            let product = products[k];
            console.log("In Function")
            console.log("product.Durations",product.Durations)
            console.log("duration",duration)
            //VALIDATION: Product should have selected duration
            if (product.Durations.findIndex(dur => dur.Duration <= duration) === -1) {
                // Product don't have selected duration or lower than that, so skipping
                /***** Lower duration we are checking, to avoid the case when product is only 
                 available in 75min duration and admin have selected 90 min duration *****/
                continue;
            }
            console.log("In Function1")
            console.log("availabilityBasedOnPT",availabilityBasedOnPT)
            console.log("staff.SkillProducts",staff.SkillProducts)
            const currentValues = ProductWiseStaff[`${product.ProductId}`];
            // Check staff is available for this product preparation time and this product is in staff skills
            if (availabilityBasedOnPT[`${product.PreparationTime}`] 

                && staff.SkillProducts.includes(product.ProductId)) {

                ProductWiseStaff[`${product.ProductId}`] = currentValues ? [...currentValues, staff.StaffId] : [staff.StaffId];
            } else {
                // ProductWiseStaff[`${product.ProductId}`] = currentValues ? [...currentValues] : [];
            }
        }
        return ProductWiseStaff
    }

    // Level 1: Loop on time-slots
    for (let i = 0; i < timeslots.length; i++) {
        const timeSlot = timeslots[i];
        console.log("***************************************************************")
        console.log(timeSlot)
        console.log("***************************************************************")
        // let StartTime = moment(selectedDate + ' ' + timeSlot + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z)

        let StartTime = moment(selectedDate + ' ' + `${timeSlot}:00` + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z)
        // Intitialize the data object
        staffAvailability[`${timeSlot}`] = {
            TotalStaff: [],
            ProductWiseStaff: {},
        }

        // Level 2: Loop on staffs
        for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
            const staff = staffData[staffInc];
            let availabilityBasedOnPT = {}
            let isStaffAvailable = false
            // Level 3: Loop on all possible preparation times
            for (let j = 0; j < preparationTimes.length; j++) {
                const preparationTime = preparationTimes[j];
                // console.log("preparationTime",preparationTime)
                let staffAvailability = {
                    IsAvailable: true
                };
                availabilityBasedOnPT[`${preparationTime}`] = true
                const dayStart = moment(selectedDate + " " + staff.DayStart + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
                const dayEnd = moment(selectedDate + " " + staff.DayEnd + " " + STAFF_ZONE, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmmcss_Z);
                const treatmentStartTime = StartTime.clone();
                const reqStart = treatmentStartTime.clone();
                const reqStartToCompare = treatmentStartTime.clone();
                const returnTime = reachOutTime;

                // ********** Calculate the Request start time **************
                // Subtract the preparation time from the time-slot for checking availability
                // Commented below line as preparation time will only be substracted from time after the day start not on starting of the day.
                // reqStart.subtract(preparationTime, "minutes")

                // Subtract the reachOutTime from the time-slot for checking availability
                let isStartSchedule = false
               
                  // ********** commenting after the new logic implementation. 02/05/24 **************
                // if (reachOutTime) {
                //     if (dayStart.isSame(reqStart) || reqStart.diff(dayStart, "minutes") <= reachOutTime) {
                //         // Don't do anything in this case
                //         isStartSchedule = true
                //     } else {
                //         reqStart.subtract(reachOutTime, "minutes")

                //     }
                // }

                 // ********** commenting after the new logic implementation. 02/05/24 **************
                // Case where request time is same as schedule start time or near that.
                // if (dayStart.isSame(reqStartToCompare) || reqStartToCompare.diff(dayStart, "minutes") <= preparationTime) {
                //     // Don't do anything in this case
                // } else {
                //     reqStart.subtract(preparationTime, "minutes")
                // }
                //************* Calculate the Request end time *****************
                // Add the treatment duration selected
                // Add the return time 
                const reqEnd = moment(treatmentStartTime)
                    .add(duration, "minute")
                    
                // console.log(STAFF_ZONE)
                // console.log(staff)
                // console.log("dayStart: ", dayStart);
                // console.log("dayEnd : ", dayEnd);
                // console.log("request timing")
                // console.log(reqStart);
                // console.log(reqEnd);

                if (
                    !(
                        reqStart.isBetween(dayStart, dayEnd, "minute", "[]") &&
                        reqEnd.isBetween(dayStart, dayEnd, "minute", "[]")
                    )
                ) {

                    staffAvailability.IsAvailable = false;
                    availabilityBasedOnPT[`${preparationTime}`] = staffAvailability.IsAvailable
                    continue;
                }
                console.log("=========================================================================================")
                // const staffEvents = staff.CheckableEvents.map(obj => ({ ...obj }));
                // var staffEvents = [...staff.CheckableEvents]
                var staffEvents = cloneDeep(staff.CheckableEvents);
                console.log("staffEvents", staffEvents)
                console.log("CheckableEvents", staff.CheckableEvents)
               
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

// ********** commenting after the new logic implementation. 02/05/24 **************

        //         //ignore reachout time and reset start and end time if same organisation or no events

        if (previousObject.type == 1) {
            //reachout time in json is addition of reachout time amd prep time
            staffEvents[previousObjectIndex].endTime.add(AUTOMATIC_BLOCKTIME_BUFFER, "minutes")
            console.log("in")
            console.log("reqStart", reqStart)
            }   
            if (nextObject.type == 1) {
                //reachout time in json is addition of reachout time amd prep time
                reqEnd.add(AUTOMATIC_BLOCKTIME_BUFFER, "minute")
               
                console.log("in next")
                console.log("reqEnd", reqEnd)
                }  
        //         if (previousObject.type == 0) {
        //             reqStart.add(reachOutTime, "minutes")
        //             reqStart.add(preparationTime, "minutes")
        //             // duration = duration - reachOutTime - preparationTime
        //             // console.log("in")
        //             // console.log("reqStart", reqStart)
        //             // console.log("reqEnd", reqEnd)
        //         } else {
        //             if (Object.keys(previousObject).length === 0|| previousObject.OrganisationLocationId == OrganisationLocationId && isStartSchedule == false) {
        //                 //ignore reachout time from request time.
        //                 reqStart.add(reachOutTime, "minutes")
        //                 // duration = duration - reachOutTime

        //                 if (Object.keys(previousObject).length != 0) {
        //                      //ignore return time from just prev booking
        //                 staffEvents[previousObjectIndex].endTime.subtract(staffEvents[previousObjectIndex].reachOutTime, "minutes")
        //                 // console.log("in1")
        //                 // console.log("reqStart", reqStart)
        //                 // console.log("reqEnd", reqEnd)
    
        //                 }
                       
        //             }
        //         }
        //         if (nextObject.type == 0) {
        //             reqEnd.subtract(reachOutTime, "minutes")
        // // staffEvents[nextObjectIndex].endTime.subtract(staffEvents[nextObjectIndex].reachOutTime, "minutes").subtract(parseInt(process.env.BUFFER_AFTER),"minutes")
        //             console.log("next object is block time, nothing to do")
        //         }else{
        //             console.log(nextObject.length)
        //         if (Object.keys(nextObject).length === 0 || nextObject.OrganisationLocationId == OrganisationLocationId) {
        //             reqEnd.subtract(reachOutTime, "minutes")
        //             if (Object.keys(nextObject).length != 0) {
        //                 //ignore reachout time from just next booking
        //                 staffEvents[nextObjectIndex].startTime.add(staffEvents[nextObjectIndex].reachOutTime, "minutes")
        //                 // duration = duration - staffEvents[nextObjectIndex].reachOutTime

        //             }
        //             // console.log("in2")
        //             // console.log("reqStart", reqStart)
        //             // console.log("reqEnd", reqEnd)
        //         }
        //         }
                
                console.log("reqStart", reqStart)
                console.log("reqEnd", reqEnd)
                //compare overlap
                for (let evInc = 0; evInc < staffEvents.length; evInc++) {
                    const event = staffEvents[evInc];
                    console.log("event: ", event);
                    // console.log(event)
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
                availabilityBasedOnPT[`${preparationTime}`] = staffAvailability.IsAvailable
                isStaffAvailable = isStaffAvailable || staffAvailability.IsAvailable
            }
            console.log("availabilityBasedOnPT",availabilityBasedOnPT)

            if (isStaffAvailable) {
                let currentValues = staffAvailability[`${timeSlot}`];
                staffAvailability[`${timeSlot}`] = {
                    TotalStaff: [...currentValues.TotalStaff, staff.StaffId],
                    ProductWiseStaff: setProductWiseStaff(currentValues.ProductWiseStaff, availabilityBasedOnPT, staff)
                }

                if (staffDetails.findIndex(s => s.StaffId === staff.StaffId) === -1) {
                    staffDetails.push(staff)
                }
            }
        }
    }

    return {staffAvailability, staffDetails}
}

const getFilteredEvents = async (staff) => {
    const dayStart = moment(FORMAT_BOOKING_DATE + "T" + staff.DayStart + STAFF_ZONE).utc();
    const dayEnd = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE).utc();
    
    let finalEvents = [];
    // Sort Events based on StartTime
   
    staff.Events.forEach(event => {
        const eventEnd = moment(event.endTime).utc();
        const eventStart = moment(event.startTime).utc();
        if((eventStart.isBefore(dayStart) && eventEnd.isBefore(dayStart)) || (eventStart.isAfter(dayEnd) && eventEnd.isAfter(dayEnd))){
            console.log("skip")
        }else{
            finalEvents.push(event)
        }
        
    });
    return finalEvents;
}