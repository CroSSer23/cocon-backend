const { Headers } = require("../header");
const { verifyAccessToken, verifyAnonymousToken } = require("./authorize")
const { con } = require("../db");
const { checkHeaders } = require("../util");
const { staffDaySchedule } = require("./staff");
const {
    STAFF,
    STAFF_CATEGORY
} = require("../tables");
const moment = require('moment');
const momentz = require("moment-timezone");
const { MESSAGE, DATE_TIME_FORMAT } = require("../strings");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const START_HOUR = process.env.DAY_START;
const END_HOUR = process.env.DAY_END;

const BUFFER_BEFORE = process.env.BUFFER_BEFORE;
const BUFFER_AFTER = process.env.BUFFER_AFTER;
const SLOT_GAP = process.env.SLOT_GAP;
const DAY_START_BUFFER = process.env.DAY_START_BUFFER;

const currentZone = process.env.STAFF_ZONE;
const STAFF_ZONE = momentz().tz(currentZone).format(DATE_TIME_FORMAT.Z);

let BOOKING_DATE, REACH_OUT_TIME, RETURN_TIME, PRODUCTS, AVAILABLE_STAFF, FORMAT_BOOKING_DATE, WEEK_DAY;

module.exports.getTimeSlot = async (event) => {
    let response;
    try {
        const headers = event.headers;
        console.log(headers);
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
        const json = event.body ? JSON.parse(event.body) : null;
        console.log(json)
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
        });
        if (json.ShowNextAvailability) {
            console.log("show next availability")
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
            console.log("single day check")
            response = await getSlot(json.BookingDate, json, headers);
        }
        console.log("response");
        console.log(response);
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
        body: JSON.stringify({
            Data: response,
            BookingDate: BOOKING_DATE
        })
    }
}

const getSlot = async (bookingDate, json, headers) => {
    let slots = [];
    BOOKING_DATE = bookingDate;
    console.log(BOOKING_DATE);
    let isToday = false;
    /**
     * Divide reach out time with 5 and get the reminder,
     * subtract the reminder from 5 and add the result into reach out time.
     */
    let reminder = json.ReachOutTime % 5;
    if (reminder > 0) {
        let toAdd = 5 - reminder;
        json.ReachOutTime += toAdd;
    }
    REACH_OUT_TIME = json.ReachOutTime;
    RETURN_TIME = REACH_OUT_TIME;
    PRODUCTS = [...json.Products];
    FORMAT_BOOKING_DATE = moment(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY).format(DATE_TIME_FORMAT.YYYYdaMMdaDD);

    // validate if its today/future date.
    const todayStart = moment().startOf('day');
    const inputDateStart = moment(BOOKING_DATE, DATE_TIME_FORMAT.MMLDDLYYYY).startOf('day');
    if (inputDateStart.isBefore(todayStart)) {
        throw new Error(MESSAGE.PAST_BOOKING_NOT_ALLOWED);
    }
    const utcOffset = moment.parseZone(headers['device-timestamp']).format(DATE_TIME_FORMAT.Z);
    let startTime, endTime;
    if (inputDateStart.isSame(todayStart)) {
        isToday = true;
    }
    startTime = moment(BOOKING_DATE + " " + START_HOUR + " " + utcOffset, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z).toDate();
    endTime = moment(BOOKING_DATE + " " + END_HOUR + " " + utcOffset, DATE_TIME_FORMAT.MMLDDLYYYY_HHcmm_Z).toDate();
    let calendarEvents = [];
    calendarEvents = await googleCalendarEvents({ startTime, endTime });
    if (calendarEvents.Error) {
        throw new Error(calendarEvents.Error);
    }
    let knex = require("knex")(con);
    const staff = await staffList(knex, BOOKING_DATE);
    await knex.destroy();

    if (staff.Error) {
        throw new Error(staff.Error);
    }
    if (staff.length === 0) {
        return slots;
    }

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
    const deviceTime = moment(headers['device-timestamp']).add(1, "hour");
    finalSlot.forEach(slot => {
        if (slot.Products.length === totalProducts) {
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

// fetch events from central calendar for given date
const googleCalendarEvents = async ({ startTime, endTime }) => {
    const { google } = require("googleapis");
    const { OAuth2 } = google.auth;
    const oAuth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET);
    oAuth2Client.setCredentials({
        refresh_token: REFRESH_TOKEN
    });
    const calendar = google.calendar({
        version: "v3",
        auth: oAuth2Client
    })
    try {
        const events = await calendar.events.list({
            calendarId: "primary",
            timeMin: startTime,
            timeMax: endTime,
            timeZone: "UTC",
            singleEvents: true
        })
        return events.data.items;
    } catch (error) {
        return { Error: error.message };
    }
}

// fetch staff detail from DB according to selected products' categories
const staffList = async (knex, bookingDate) => {
    let categories = [];
    PRODUCTS.forEach(product => {
        const found = categories.find(f => f === product.CategoryId);
        if (!found) {
            categories.push(product.CategoryId)
        }
    });
    try {
        let staffData = await knex
            .select(
                STAFF_CATEGORY + ".StaffId",
                STAFF_CATEGORY + ".CategoryId",
                STAFF + ".GoogleEmail",
                STAFF + ".Gender"
            )
            .from(STAFF_CATEGORY)
            .whereIn(STAFF_CATEGORY + ".CategoryId", categories)
            .leftJoin(STAFF, STAFF + ".StaffId", STAFF_CATEGORY + ".StaffId")
            .andWhere(STAFF + ".Deleted", "=", parseInt(process.env.DELETE_FLAG))

        let finalData = [];
        for (let staffInc = 0; staffInc < staffData.length; staffInc++) {
            const staff = staffData[staffInc];
            const found = finalData.find(s => s.StaffId === staff.StaffId);
            if (!found) {
                let categories = [staff.CategoryId];
                let dayWorking = await staffDaySchedule(knex, staff.StaffId, moment(bookingDate, DATE_TIME_FORMAT.MMLDDLYYYY));
                if (dayWorking.IsWorking) {
                    dayWorking.Block.forEach(element => {
                        element.id = element.StaffBlockTimeId;
                        element.startTime = moment(FORMAT_BOOKING_DATE + "T" + element.StartTime + STAFF_ZONE).utc().format();
                        element.endTime = moment(FORMAT_BOOKING_DATE + "T" + element.EndTime + STAFF_ZONE).utc().format()
                    });
                    let objToPush = {
                        StaffId: staff.StaffId,
                        Gender: staff.Gender,
                        GoogleEmail: staff.GoogleEmail,
                        Categories: categories,
                        DayStart: dayWorking.DayStart,
                        DayEnd: dayWorking.DayEnd,
                        Events: dayWorking.Block
                    }
                    finalData.push(objToPush);
                }
            } else {
                const categoryFound = found.Categories.find(f => f === staff.CategoryId);
                if (!categoryFound) {
                    found.Categories.push(staff.CategoryId)
                }
            }
        }
        return finalData;
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
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
            if (eventEnd.isBefore(staffDayStart) || eventEnd.isSame(staffDayStart)) {
                // This event ends before/at day start
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
            if (staff.Categories.includes(PRODUCTS[0].CategoryId)) {
                return true;
            } else {
                return false;
            }
        } else {
            if (staff.Categories.includes(PRODUCTS[0].CategoryId) && staff.Gender === PRODUCTS[0].Therapist) {
                return true;
            } else {
                return false;
            }
        }
    })
    let globalSlots = [];
    for (let staffInc = 0; staffInc < productOneStaff.length; staffInc++) {
        const staff = productOneStaff[staffInc];
        if (staff.OnVacation) {
            continue;
        }
        const trimmedRanges = await createRanges(staff, PRODUCTS[0].PreparationTime);
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
    let ranges = [];
    if (staff.OnVacation) {
        return ranges;
    }
    if (staff.Events.length > 0) {
        let sortedEvents = await getStaffEvents(staff.Events);
        // Loop over sortedEvents and create ranges
        for (let i = 0; len = sortedEvents.length, i < len; i++) {
            const event = sortedEvents[i];
            if (i === 0) {
                // for first event create range from day start upto event start
                const firstEventStart = moment(event.startTime).utc();
                const dayStart = moment(FORMAT_BOOKING_DATE + "T" + staff.DayStart + STAFF_ZONE).utc();
                dayStart.add(reachOutTime, "minute");
                dayStart.add(DAY_START_BUFFER, "minute");
                if (dayStart.isBefore(firstEventStart)) {
                    // create range if only day start time is less than first event start time
                    ranges.push({
                        start: dayStart,
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
                                start: firstEventEnd,
                                end: dayEnd
                            });
                        }

                        // next event is before day end, so create range upto next event end.
                        if (nextEventStart.isBefore(dayEnd)) {
                            if (firstEventEnd.isBefore(nextEventStart)) {
                                ranges.push({
                                    start: firstEventEnd,
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
                                start: currentEventEnd,
                                end: nextEventStart
                            })
                        }
                    }
                    if (nextEventStart.isAfter(dayEnd) || nextEventStart.isSame(dayEnd)) {
                        // create range upto day end
                        if (nextEventStart.diff(currentEventEnd, "minute") >= parseInt(SLOT_GAP))
                            ranges.push({
                                start: currentEventEnd,
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
                        start: lastEventEnd,
                        end: dayEnd
                    })
                }
            }
        }
    }
    if (staff.Events.length === 0) {
        const startTime = moment(FORMAT_BOOKING_DATE + "T" + staff.DayStart + STAFF_ZONE);
        startTime.add(reachOutTime, "minute");
        startTime.add(DAY_START_BUFFER, "minute");
        const endTime = moment(FORMAT_BOOKING_DATE + "T" + staff.DayEnd + STAFF_ZONE);
        ranges.push({
            start: startTime.utc(),
            end: endTime.utc()
        });
    }
    return ranges;
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
                                ProductId: product.ProductId,
                                StartTime: new moment(slot).utc().format(),
                                Duration: product.Duration,
                                Name: product.Name,
                                Staff: [
                                    {
                                        StaffId: staff.StaffId,
                                        GoogleEmail: staff.GoogleEmail
                                    }
                                ]
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
    let pref = [0, 1];
    if (
        pref.includes(nextProduct.Therapist) &&
        pref.includes(preProduct.Therapist) &&
        nextProduct.Therapist !== preProduct.Therapist
    ) {
        return false;
    } else {
        const staff = AVAILABLE_STAFF.find(f => f.StaffId === preProdStaffId);
        if (
            nextProduct.CategoryId === preProduct.CategoryId ||
            staff.Categories.includes(nextProduct.CategoryId)
        ) {
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
                if (staff.Categories.includes(product.CategoryId)) {
                    return true;
                } else {
                    return false;
                }
            } else {
                if (staff.Categories.includes(product.CategoryId) && staff.Gender === product.Therapist) {
                    return true;
                } else {
                    return false;
                }
            }
        })
        for (let slotInc = 0; slotInc < initialSlot.length; slotInc++) {
            const slot = initialSlot[slotInc];
            if (slot.Discard) {
                // skip if slot is already marked to discard
                continue;
            }
            // check if previous product staff can work for current product
            const sameStaff = getStaffRequirement(PRODUCTS[0], product, slot.Products[0].Staff[0].StaffId);
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
                    anotherStaff = anotherStaff[0];
                    const slotUpdatedEndTime = new moment(slot.Slot);
                    let existingDuration = 0;
                    slot.Products.forEach(element => {
                        existingDuration += element.Duration;
                    });
                    slotUpdatedEndTime.add((existingDuration + product.Duration + RETURN_TIME), "minute");
                    const trimmedRanges = await createRanges(anotherStaff, product.PreparationTime);
                    for (let rangeInc = 0; rangeInc < trimmedRanges.length; rangeInc++) {
                        const range = trimmedRanges[rangeInc];
                        if (
                            (slot.Slot.isAfter(range.start) || slot.Slot.isSame(range.start)) &&
                            (slotUpdatedEndTime.isBefore(range.end) || slotUpdatedEndTime.isSame(range.end))
                        ) {
                            // this range is can work for this slot, just insert staff & continue
                            initialSlot[slotInc].Products.push({
                                ProductId: product.ProductId,
                                StartTime: new moment(slot.Slot).add(existingDuration, "minute").utc().format(),
                                Duration: product.Duration,
                                Name: product.Name,
                                Staff: [{ StaffId: anotherStaff.StaffId, GoogleEmail: anotherStaff.GoogleEmail }]
                            })
                            initialSlot[slotInc].Discard = false;
                            break;
                        }
                    }
                } else {
                    // Product is a same-time request, so new staff is needed
                    let anotherStaff = productStaff.filter(f => f.StaffId !== slot.Products[0].Staff[0].StaffId);
                    if (anotherStaff.length === 0) {
                        slot.Discard = true;
                        continue;
                    }
                    anotherStaff = anotherStaff[0];
                    const slotUpdatedEndTime = new moment(slot.Slot);
                    slotUpdatedEndTime.add((product.Duration + RETURN_TIME), "minute");
                    const trimmedRanges = await createRanges(anotherStaff, product.PreparationTime);
                    for (let rangeInc = 0; rangeInc < trimmedRanges.length; rangeInc++) {
                        const range = trimmedRanges[rangeInc];
                        if (
                            (slot.Slot.isAfter(range.start) || slot.Slot.isSame(range.start)) &&
                            (slotUpdatedEndTime.isBefore(range.end) || slotUpdatedEndTime.isSame(range.end))
                        ) {
                            // this range is can work for this slot, just insert staff & continue
                            initialSlot[slotInc].Products.push({
                                ProductId: product.ProductId,
                                StartTime: new moment(slot.Slot).utc().format(),
                                Duration: product.Duration,
                                Name: product.Name,
                                Staff: [{ StaffId: anotherStaff.StaffId, GoogleEmail: anotherStaff.GoogleEmail }]
                            })
                            initialSlot[slotInc].Discard = false;
                            break;
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