const { con } = require("../db");
const { Headers } = require("../header");
const excelJS = require("exceljs");
const moment = require('moment');
const momentz = require("moment-timezone");
const currentZone = process.env.STAFF_ZONE;
const IMAGE_PATH = '././src/assets/logo.png';
const {
    BOOKINGS,
    USERS,
    BOOKING_PRODUCTS,
    BOOKING_PRODUCT_ADDONS,
    STAFF
} = require("../tables");
const {
    BOOKING_STATUS,
    BOOKING_STATUS_DESC
} = require("../status");
const { MESSAGE, DATE_TIME_FORMAT } = require("../strings");
const { getPayloadData, setPayloadData } = require("../util");
const STAFF_ZONE = momentz().tz(currentZone).format(DATE_TIME_FORMAT.Z);

module.exports.exportBooking = async event => {
    /**
     * API Objective: Create excel file for selected type of export for bookings.
     * Working: 
     * 1. Type 0: need to export bookings from selected range.
     * 2. Type 1: need to export given bookings data.
     */

    let knex, connected = false, buffer, fileName;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.Type !== "number" ||
            !json.Filters || typeof json.Filters !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        switch (json.Type) {
            case 0: {
                if (!json.StartDate || !json.EndDate) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
            case 1: {
                if (!json.BookingId || typeof json.BookingId !== "object") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
        }

        let PREV_BOOKING_CONSIDERED = [
            BOOKING_STATUS.COMPLETED,
            BOOKING_STATUS.ON_GOING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.LAPSED,
            BOOKING_STATUS.CANCELLED_MANUALLY,
            BOOKING_STATUS.INCONCLUSIVE
        ]

        knex = require("knex")(con);
        connected = true;
        let rawBookingsData = await knex
            .select(
                BOOKINGS + ".BookingId",
                BOOKINGS + ".UserId",
                BOOKINGS + ".DateTime",
                BOOKINGS + ".Amount",
                BOOKINGS + ".PromoCode",
                BOOKINGS + ".PromoAmount",
                BOOKINGS + ".PaidPrice",
                BOOKINGS + ".Status",
                BOOKING_PRODUCTS + ".BookingProductId",
                BOOKING_PRODUCTS + ".Product",
                BOOKING_PRODUCTS + ".StaffId",
                USERS + ".Name as UserName",
                STAFF + ".Name as StaffName"
            )
            .from(BOOKINGS)
            .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + ".BookingId", BOOKINGS + ".BookingId")
            .leftJoin(USERS, USERS + ".UserId", BOOKINGS + ".UserId")
            .leftJoin(STAFF, STAFF + ".StaffId", BOOKING_PRODUCTS + ".StaffId")
            .modify(qb => {
                if (json.Filters.length > 0) {
                    qb.whereIn(BOOKINGS + ".Status", json.Filters)
                }
                switch (json.Type) {
                    case 0: {
                        let selectedStartDate = moment(json.StartDate, DATE_TIME_FORMAT.MMLDDLYYYY);
                        let selectedEndDate = moment(json.EndDate, DATE_TIME_FORMAT.MMLDDLYYYY);
                        qb.where(BOOKINGS + ".DateTime", ">=", selectedStartDate.startOf("day").toDate())
                        qb.andWhere(BOOKINGS + ".DateTime", "<=", selectedEndDate.endOf("day").toDate())
                        break;
                    }
                    case 1: {
                        qb.whereIn(BOOKINGS + ".BookingId", json.BookingId)
                        break;
                    }
                }
            })
        let bookingData = [];
        for (let bookInc = 0; bookInc < rawBookingsData.length; bookInc++) {
            const booking = rawBookingsData[bookInc];
            const bookingFound = bookingData.find(f => f.BookingId === booking.BookingId);
            if (!bookingFound) {
                let alreadCust = await knex(BOOKINGS)
                    .select("BookingId")
                    .where("UserId", "=", booking.UserId)
                    .whereIn("Status", PREV_BOOKING_CONSIDERED)
                    .andWhere("DateTime", "<", moment(booking.DateTime).toDate())
                let pushObj = {
                    BookingId: booking.BookingId,
                    UserName: booking.UserName,
                    DateTime: moment(booking.DateTime).utcOffset(STAFF_ZONE).format(DATE_TIME_FORMAT.DD_MMM_YYYYC_HHcmm),
                    Amount: booking.Amount,
                    PromoCode: booking.PromoCode,
                    PromoAmount: booking.PromoAmount,
                    PaidPrice: booking.PaidPrice,
                    StaffName: booking.StaffName,
                    ExistCustomer: alreadCust.length > 0 ? true : false,
                    Products: booking.Product + "",
                    StatusName: BOOKING_STATUS_DESC.find(f => f.code === booking.Status).name
                };
                let addOnExist = await knex(BOOKING_PRODUCT_ADDONS).select("AddOn").where("BookingProductId", "=", booking.BookingProductId);
                if (addOnExist.length > 0) {
                    pushObj.Products += "(";
                    let addOns = []
                    addOnExist.forEach(element => {
                        addOns.push(element.AddOn);
                    });
                    pushObj.Products += addOns.join(", ");
                    pushObj.Products += ")";
                }
                bookingData.push(pushObj);
            } else {
                let product = ", " + booking.Product;
                let addOnExist = await knex(BOOKING_PRODUCT_ADDONS).select("AddOn").where("BookingProductId", "=", booking.BookingProductId);
                if (addOnExist.length > 0) {
                    product += "(";
                    let addOns = []
                    addOnExist.forEach(element => {
                        addOns.push(element.AddOn);
                    });
                    product += addOns.join(", ");
                    product += ")";
                }
                bookingFound.Products += product;
            }
        }
        await knex.destroy();

        if (bookingData.length === 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    message: MESSAGE.REPORT_BOOKING_NOT_EXIST
                }
            }
        }

        let workbook = new excelJS.Workbook();
        const logoId = workbook.addImage({
            filename: IMAGE_PATH,
            extension: 'png',
        });
        workbook.creator = "Cocon";
        workbook.created = moment().toDate();
        const worksheet = workbook.addWorksheet('Bookings');
        worksheet.addImage(logoId, {
            tl: { col: 0.1, row: 0.5 },
            ext: { width: 101, height: 65 },
            editAs: 'absolute'
        })
        worksheet.mergeCells('A1:K4')
        worksheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: 5, activeCell: 'A6' }
        ];
        worksheet.getCell("A1").border = { right: { style: "thin", color: { argb: "00000000" } } }

        let centerAlignWithWrap = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true
        }
        let columns = {
            bookingId: {
                key: "BookingId",
                label: "Booking #",
                width: 12
            },
            dateTime: {
                key: "DateTime",
                label: "Date/Time",
                width: 20
            },
            userName: {
                key: "UserName",
                label: "Client Name",
                width: 25
            },
            treatment: {
                key: "Treatment",
                label: "Treatment",
                width: 25
            },
            amount: {
                key: "Amount",
                label: "Total Sales",
                width: 18
            },
            promoAmount: {
                key: "PromoAmount",
                label: "Total Discount",
                width: 20
            },
            paidPrice: {
                key: "PaidPrice",
                label: "Net Sales",
                width: 12
            },
            custRepeat: {
                key: "CustRepeat",
                label: "Customer (New/Repeat)",
                width: 20
            },
            promoCode: {
                key: "PromoCode",
                label: "Promo code",
                width: 18
            },
            staff: {
                key: "StaffName",
                label: "Staff",
                width: 25
            },
            status: {
                key: "Status",
                label: "Status",
                width: 18
            }
        }

        // Set columns common style
        worksheet.columns = [
            { key: columns.bookingId.key, width: columns.bookingId.width },
            { key: columns.dateTime.key, width: columns.dateTime.width },
            { key: columns.userName.key, width: columns.userName.width },
            { key: columns.treatment.key, width: columns.treatment.width },
            { key: columns.amount.key, width: columns.amount.width },
            { key: columns.promoAmount.key, width: columns.promoAmount.width },
            { key: columns.paidPrice.key, width: columns.paidPrice.width },
            { key: columns.custRepeat.key, width: columns.custRepeat.width },
            { key: columns.promoCode.key, width: columns.promoCode.width },
            { key: columns.staff.key, width: columns.staff.width },
            { key: columns.status.key, width: columns.status.width }
        ]

        // Configure header row with names
        let curRow = 5;
        const row = worksheet.getRow(curRow);
        row.height = 27;
        row.getCell(columns.bookingId.key).value = columns.bookingId.label;
        row.getCell(columns.dateTime.key).value = columns.dateTime.label;
        row.getCell(columns.userName.key).value = columns.userName.label;
        row.getCell(columns.treatment.key).value = columns.treatment.label;
        row.getCell(columns.amount.key).value = columns.amount.label;
        row.getCell(columns.promoAmount.key).value = columns.promoAmount.label;
        row.getCell(columns.paidPrice.key).value = columns.paidPrice.label;
        row.getCell(columns.custRepeat.key).value = columns.custRepeat.label;
        row.getCell(columns.promoCode.key).value = columns.promoCode.label;
        row.getCell(columns.staff.key).value = columns.staff.label;
        row.getCell(columns.status.key).value = columns.status.label;


        let thinBlackBorder = { style: "thin", color: { argb: "00000000" } }

        // Configure header row styles
        row.getCell(columns.bookingId.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.dateTime.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.userName.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.treatment.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.amount.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.promoAmount.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.paidPrice.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.custRepeat.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.promoCode.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.staff.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.status.key).border = { bottom: thinBlackBorder, right: thinBlackBorder }

        // center align with wrap
        row.getCell(columns.bookingId.key).alignment = centerAlignWithWrap;
        row.getCell(columns.dateTime.key).alignment = centerAlignWithWrap;
        row.getCell(columns.userName.key).alignment = centerAlignWithWrap;
        row.getCell(columns.treatment.key).alignment = centerAlignWithWrap;
        row.getCell(columns.amount.key).alignment = centerAlignWithWrap;
        row.getCell(columns.promoAmount.key).alignment = centerAlignWithWrap;
        row.getCell(columns.paidPrice.key).alignment = centerAlignWithWrap;
        row.getCell(columns.custRepeat.key).alignment = centerAlignWithWrap;
        row.getCell(columns.promoCode.key).alignment = centerAlignWithWrap;
        row.getCell(columns.staff.key).alignment = centerAlignWithWrap;
        row.getCell(columns.status.key).alignment = centerAlignWithWrap;

        // font bold with size 11
        let fontBold = {
            name: "Raleway",
            family: 2,
            size: 11,
            bold: true
        }

        // font size 10
        let font10 = {
            name: "Raleway",
            family: 2,
            size: 11
        }
        row.getCell(columns.bookingId.key).font = fontBold;
        row.getCell(columns.dateTime.key).font = fontBold;
        row.getCell(columns.userName.key).font = fontBold;
        row.getCell(columns.treatment.key).font = fontBold;
        row.getCell(columns.amount.key).font = fontBold;
        row.getCell(columns.promoAmount.key).font = fontBold;
        row.getCell(columns.paidPrice.key).font = fontBold;
        row.getCell(columns.custRepeat.key).font = fontBold;
        row.getCell(columns.promoCode.key).font = fontBold;
        row.getCell(columns.staff.key).font = fontBold;
        row.getCell(columns.status.key).font = fontBold;

        let headerCellFill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: 'ffe5ddd8' },
            bgColor: { argb: 'ffa1887c' }
        };

        row.getCell(columns.bookingId.key).fill = headerCellFill;
        row.getCell(columns.dateTime.key).fill = headerCellFill;
        row.getCell(columns.userName.key).fill = headerCellFill;
        row.getCell(columns.treatment.key).fill = headerCellFill;
        row.getCell(columns.amount.key).fill = headerCellFill;
        row.getCell(columns.promoAmount.key).fill = headerCellFill;
        row.getCell(columns.paidPrice.key).fill = headerCellFill;
        row.getCell(columns.custRepeat.key).fill = headerCellFill;
        row.getCell(columns.promoCode.key).fill = headerCellFill;
        row.getCell(columns.staff.key).fill = headerCellFill;
        row.getCell(columns.status.key).fill = headerCellFill;

        // Fill data in sheet
        curRow += 1;
        for (let dataInc = 0; dataInc < bookingData.length; dataInc++, curRow++) {
            const booking = bookingData[dataInc];
            const dataRow = worksheet.getRow(curRow);
            dataRow.getCell(columns.bookingId.key).value = booking.BookingId;
            dataRow.getCell(columns.dateTime.key).value = booking.DateTime;
            dataRow.getCell(columns.userName.key).value = booking.UserName;
            dataRow.getCell(columns.treatment.key).value = booking.Products;
            dataRow.getCell(columns.amount.key).value = booking.Amount;
            dataRow.getCell(columns.promoAmount.key).value = booking.PromoAmount ? booking.PromoAmount : 0;
            dataRow.getCell(columns.paidPrice.key).value = booking.PaidPrice;
            dataRow.getCell(columns.custRepeat.key).value = booking.ExistCustomer ? "Repeat" : "New";
            dataRow.getCell(columns.promoCode.key).value = booking.PromoCode ? booking.PromoCode : "-";
            dataRow.getCell(columns.staff.key).value = booking.StaffName;
            dataRow.getCell(columns.status.key).value = booking.StatusName;

            dataRow.getCell(columns.bookingId.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.dateTime.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.userName.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.treatment.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.amount.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.promoAmount.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.paidPrice.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.custRepeat.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.promoCode.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.staff.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.status.key).alignment = centerAlignWithWrap;

            dataRow.getCell(columns.bookingId.key).font = font10;
            dataRow.getCell(columns.dateTime.key).font = font10;
            dataRow.getCell(columns.userName.key).font = font10;
            dataRow.getCell(columns.treatment.key).font = font10;
            dataRow.getCell(columns.amount.key).font = font10;
            dataRow.getCell(columns.promoAmount.key).font = font10;
            dataRow.getCell(columns.paidPrice.key).font = font10;
            dataRow.getCell(columns.custRepeat.key).font = font10;
            dataRow.getCell(columns.promoCode.key).font = font10;
            dataRow.getCell(columns.staff.key).font = font10;
            dataRow.getCell(columns.status.key).font = font10;

            dataRow.height = 19;

            dataRow.getCell(columns.status.key).border = { right: thinBlackBorder }
            if (dataInc === bookingData.length - 1) {
                // apply bottom border
                dataRow.getCell(columns.bookingId.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.dateTime.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.userName.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.treatment.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.amount.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.promoAmount.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.paidPrice.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.custRepeat.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.promoCode.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.staff.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.status.key).border = { bottom: thinBlackBorder, right: thinBlackBorder }
            }
        }
        fileName = "Booking.xlsx";
        buffer = await workbook.xlsx.writeBuffer({
            filename: fileName,
        });
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
    const response = {
        statusCode: 200,
        headers: {
            ...Headers,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet',
            'Content-Disposition': "attachment; filename= " + fileName,
            isBase64Encoded: true,
        },
        body: setPayloadData(event,{
            Data: {
                File: buffer.toString('base64'),
                FileName: fileName
            }
        })
    }
    return response;
}

module.exports.exportUser = async event => {
    /**
     * API Objective: Create excel file for selected type of export for users.
     * Working:
     * 1. Type 0: export all the users only.
     * 2. Type 1: export given users data only.
     */

    let knex, connected = false, buffer, fileName;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            typeof json.Type !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        switch (json.Type) {
            case 0: {
                if (!json.AllUsers) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
            case 1: {
                if (!json.UserId || typeof json.UserId !== "object") {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
                break;
            }
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
        let userRawData = await knex(USERS)
            .select(
                "UserId",
                "Name",
                "Gender",
                "Email",
                "Contact",
                "Therapist",
                "Floor",
                "Street",
                "Zip",
                "City",
                "Notes",
                "HouseNumber"
            )
            .modify(qb => {
                if (json.Type === 1) {
                    qb.whereIn("UserId", json.UserId)
                }
                if (json.Type === 0) {
                    switch (json.Filter) {
                        case 0:
                            qb.whereNotNull("GoogleId");
                            qb.orWhereNotNull("AppleId");
                            qb.orWhereNotNull("FacebookId");
                            break;
                        case 1:
                            qb.whereNull("GoogleId");
                            qb.whereNull("AppleId");
                            qb.whereNull("FacebookId");
                            break;
                    }
                }
            })
        let userData = [];
        for (let userInc = 0; userInc < userRawData.length; userInc++) {
            const user = userRawData[userInc];
            const userFound = userData.find(f => f.UserId === user.UserId);
            if (!userFound) {
                let userObj = {
                    UserId: user.UserId,
                    Name: user.Name,
                    Email: user.Email,
                    Contact: user.Contact ? user.Contact : "-",
                    Gender: user.Gender === 1 ? "Female" : "Male",
                    Therapist: user.Therapist === 2 ? "Either" : user.Therapist === 1 ? "Female" : "Male",
                    Address: "",
                    TotalNetSales: 0,
                    TotalBookings: 0,
                    TotalTreatments: 0,
                    FirstApptDate: null,
                    LastApptDate: null,
                    Notes: user.Notes ? user.Notes : "-"
                }
                if (user.Floor) {
                    userObj.Address = user.Floor + ", ";
                }
                if (user.Street) {
                    userObj.Address += user.Street;
                }
                if (user.HouseNumber) {
                    userObj.Address = user.HouseNumber + ", ";
                }
                if (user.Zip) {
                    userObj.Address += ", " + user.Zip;
                }
                if (user.City) {
                    userObj.Address += " " + user.City;
                }

                let totalUserBookings = await knex(BOOKINGS).count("BookingId")
                    .whereIn("Status", USER_CONSIDERED_BOOKINGS)
                    .andWhere("UserId", "=", userObj.UserId)
                if (totalUserBookings.length > 0) {
                    userObj.TotalBookings = totalUserBookings[0]['count(`BookingId`)'];
                } else {
                    userObj.TotalBookings = 0;
                }

                let totalTreatments = await knex
                    .count(BOOKING_PRODUCTS + ".BookingProductId")
                    .from(BOOKINGS)
                    .leftJoin(BOOKING_PRODUCTS, BOOKING_PRODUCTS + '.BookingId', BOOKINGS + ".BookingId")
                    .whereIn(BOOKINGS + ".Status", USER_CONSIDERED_BOOKINGS)
                    .andWhere(BOOKINGS + ".UserId", "=", userObj.UserId)
                if (totalTreatments.length > 0) {
                    userObj.TotalTreatments = totalTreatments[0]['count(`BookingProduct`.`BookingProductId`)']
                } else {
                    userObj.TotalTreatments = 0;
                }

                let totalNetSales = await knex(BOOKINGS).sum("PaidPrice")
                    .whereIn("Status", USER_CONSIDERED_BOOKINGS)
                    .andWhere("UserId", "=", userObj.UserId)
                if (totalNetSales.length > 0) {
                    userObj.TotalNetSales = totalNetSales[0]['sum(`PaidPrice`)'];
                } else {
                    userObj.TotalNetSales = 0;
                }

                let apptDates = await knex(BOOKINGS)
                    .max("DateTime")
                    .min("DateTime")
                    .whereIn("Status", USER_CONSIDERED_BOOKINGS)
                    .andWhere("UserId", "=", userObj.UserId);
                if (apptDates[0]['min(`DateTime`)']) {
                    userObj.FirstApptDate = moment(apptDates[0]['min(`DateTime`)']).format(DATE_TIME_FORMAT.DD_MMM_YYYY);
                }
                if (apptDates[0]['max(`DateTime`)']) {
                    userObj.LastApptDate = moment(apptDates[0]['max(`DateTime`)']).format(DATE_TIME_FORMAT.DD_MMM_YYYY);
                }

                userData.push(userObj);
            }
        }

        await knex.destroy();

        /**
         * Create excel file from data
         */

        let workbook = new excelJS.Workbook();
        const logoId = workbook.addImage({
            filename: IMAGE_PATH,
            extension: 'png',
        });
        workbook.creator = "Cocon";
        workbook.created = moment().toDate();
        const worksheet = workbook.addWorksheet('Users');
        worksheet.addImage(logoId, {
            tl: { col: 0.1, row: 0.5 },
            ext: { width: 101, height: 65 },
            editAs: 'absolute'
        });
        worksheet.mergeCells('A1:L4');
        worksheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: 5, activeCell: 'A6' }
        ];
        worksheet.getCell("A1").border = { right: { style: "thin", color: { argb: "00000000" } } }

        let centerAlignWithWrap = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true
        }

        let columns = {
            userName: {
                key: "userName",
                label: "Name",
                width: 25
            },
            email: {
                key: "Email",
                label: "Email",
                width: 35
            },
            contact: {
                key: "Contact",
                label: "Contact",
                width: 20
            },
            address: {
                key: "Address",
                label: "Address",
                width: 30
            },
            therapist: {
                key: "Therapist",
                label: "Therapist",
                width: 15
            },
            gender: {
                key: "Gender",
                label: "Gender",
                width: 15
            },
            totalBookings: {
                key: "TotalBookings",
                label: "Total Bookings",
                width: 20
            },
            totalNetSales: {
                key: "TotalNetSales",
                label: "Total Net Sales",
                width: 20
            },
            totalTreatments: {
                key: "TotalTreatments",
                label: "Total Treatments",
                width: 20
            },
            firstAppointment: {
                key: "FirstAppointment",
                label: "First Appointment",
                width: 20
            },
            lastAppointment: {
                key: "LastAppointment",
                label: "Last Appointment",
                width: 20
            },
            notes: {
                key: "Notes",
                label: "Notes",
                width: 40
            }
        }

        // Set columns common style
        worksheet.columns = [
            { key: columns.userName.key, width: columns.userName.width },
            { key: columns.email.key, width: columns.email.width },
            { key: columns.contact.key, width: columns.contact.width },
            { key: columns.address.key, width: columns.address.width },
            { key: columns.therapist.key, width: columns.therapist.width },
            { key: columns.gender.key, width: columns.gender.width },
            { key: columns.totalBookings.key, width: columns.totalBookings.width },
            { key: columns.totalNetSales.key, width: columns.totalNetSales.width },
            { key: columns.totalTreatments.key, width: columns.totalTreatments.width },
            { key: columns.firstAppointment.key, width: columns.firstAppointment.width },
            { key: columns.lastAppointment.key, width: columns.lastAppointment.width },
            { key: columns.notes.key, width: columns.notes.width },
        ]

        // Configure header row with names
        let curRow = 5;
        const row = worksheet.getRow(curRow);
        row.height = 27;
        row.getCell(columns.userName.key).value = columns.userName.label;
        row.getCell(columns.email.key).value = columns.email.label;
        row.getCell(columns.contact.key).value = columns.contact.label;
        row.getCell(columns.address.key).value = columns.address.label;
        row.getCell(columns.therapist.key).value = columns.therapist.label;
        row.getCell(columns.gender.key).value = columns.gender.label;
        row.getCell(columns.totalBookings.key).value = columns.totalBookings.label;
        row.getCell(columns.totalNetSales.key).value = columns.totalNetSales.label;
        row.getCell(columns.totalTreatments.key).value = columns.totalTreatments.label;
        row.getCell(columns.firstAppointment.key).value = columns.firstAppointment.label;
        row.getCell(columns.lastAppointment.key).value = columns.lastAppointment.label;
        row.getCell(columns.notes.key).value = columns.notes.label;

        let thinBlackBorder = { style: "thin", color: { argb: "00000000" } }

        // Configure header row styles
        row.getCell(columns.userName.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.email.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.contact.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.address.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.therapist.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.gender.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.totalBookings.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.totalNetSales.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.totalTreatments.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.firstAppointment.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.lastAppointment.key).border = { bottom: thinBlackBorder }
        row.getCell(columns.notes.key).border = { bottom: thinBlackBorder, right: thinBlackBorder }

        // center align with wrap
        row.getCell(columns.userName.key).alignment = centerAlignWithWrap;
        row.getCell(columns.email.key).alignment = centerAlignWithWrap;
        row.getCell(columns.contact.key).alignment = centerAlignWithWrap;
        row.getCell(columns.address.key).alignment = centerAlignWithWrap;
        row.getCell(columns.therapist.key).alignment = centerAlignWithWrap;
        row.getCell(columns.gender.key).alignment = centerAlignWithWrap;
        row.getCell(columns.totalBookings.key).alignment = centerAlignWithWrap;
        row.getCell(columns.totalNetSales.key).alignment = centerAlignWithWrap;
        row.getCell(columns.totalTreatments.key).alignment = centerAlignWithWrap;
        row.getCell(columns.firstAppointment.key).alignment = centerAlignWithWrap;
        row.getCell(columns.lastAppointment.key).alignment = centerAlignWithWrap;
        row.getCell(columns.notes.key).alignment = centerAlignWithWrap;


        // font bold with size 11
        let fontBold = {
            name: "Raleway",
            family: 2,
            size: 11,
            bold: true
        }

        // font size 10
        let font10 = {
            name: "Raleway",
            family: 2,
            size: 11
        }
        row.getCell(columns.userName.key).font = fontBold;
        row.getCell(columns.email.key).font = fontBold;
        row.getCell(columns.contact.key).font = fontBold;
        row.getCell(columns.address.key).font = fontBold;
        row.getCell(columns.therapist.key).font = fontBold;
        row.getCell(columns.gender.key).font = fontBold;
        row.getCell(columns.totalBookings.key).font = fontBold;
        row.getCell(columns.totalNetSales.key).font = fontBold;
        row.getCell(columns.totalTreatments.key).font = fontBold;
        row.getCell(columns.firstAppointment.key).font = fontBold;
        row.getCell(columns.lastAppointment.key).font = fontBold;
        row.getCell(columns.notes.key).font = fontBold;

        let headerCellFill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: 'ffe5ddd8' },
            bgColor: { argb: 'ffa1887c' }
        };

        row.getCell(columns.userName.key).fill = headerCellFill;
        row.getCell(columns.email.key).fill = headerCellFill;
        row.getCell(columns.contact.key).fill = headerCellFill;
        row.getCell(columns.address.key).fill = headerCellFill;
        row.getCell(columns.therapist.key).fill = headerCellFill;
        row.getCell(columns.gender.key).fill = headerCellFill;
        row.getCell(columns.totalBookings.key).fill = headerCellFill;
        row.getCell(columns.totalNetSales.key).fill = headerCellFill;
        row.getCell(columns.totalTreatments.key).fill = headerCellFill;
        row.getCell(columns.firstAppointment.key).fill = headerCellFill;
        row.getCell(columns.lastAppointment.key).fill = headerCellFill;
        row.getCell(columns.notes.key).fill = headerCellFill;

        // Fill data in sheet
        curRow += 1;
        for (let dataInc = 0; dataInc < userData.length; dataInc++, curRow++) {
            const user = userData[dataInc];
            const dataRow = worksheet.getRow(curRow);

            dataRow.getCell(columns.userName.key).value = user.Name;
            dataRow.getCell(columns.email.key).value = user.Email;
            dataRow.getCell(columns.gender.key).value = user.Gender;
            dataRow.getCell(columns.contact.key).value = user.Contact;
            user.Address
                ? dataRow.getCell(columns.address.key).value = user.Address
                : dataRow.getCell(columns.address.key).value = "-";
            dataRow.getCell(columns.therapist.key).value = user.Therapist;
            user.TotalBookings
                ? dataRow.getCell(columns.totalBookings.key).value = user.TotalBookings
                : dataRow.getCell(columns.totalBookings.key).value = "-";
            user.TotalNetSales
                ? dataRow.getCell(columns.totalNetSales.key).value = user.TotalNetSales
                : dataRow.getCell(columns.totalNetSales.key).value = "-";
            user.TotalTreatments
                ? dataRow.getCell(columns.totalTreatments.key).value = user.TotalTreatments
                : dataRow.getCell(columns.totalTreatments.key).value = "-";
            user.FirstApptDate
                ? dataRow.getCell(columns.firstAppointment.key).value = user.FirstApptDate
                : dataRow.getCell(columns.firstAppointment.key).value = "-";
            user.LastApptDate
                ? dataRow.getCell(columns.lastAppointment.key).value = user.LastApptDate
                : dataRow.getCell(columns.lastAppointment.key).value = "-";
            user.Notes
                ? dataRow.getCell(columns.notes.key).value = user.Notes
                : dataRow.getCell(columns.notes.key).value = "-";

            dataRow.getCell(columns.userName.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.email.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.contact.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.address.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.therapist.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.gender.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.totalBookings.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.totalNetSales.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.totalTreatments.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.firstAppointment.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.lastAppointment.key).alignment = centerAlignWithWrap;
            dataRow.getCell(columns.notes.key).alignment = centerAlignWithWrap;

            dataRow.getCell(columns.userName.key).font = font10;
            dataRow.getCell(columns.email.key).font = font10;
            dataRow.getCell(columns.contact.key).font = font10;
            dataRow.getCell(columns.address.key).font = font10;
            dataRow.getCell(columns.therapist.key).font = font10;
            dataRow.getCell(columns.gender.key).font = font10;
            dataRow.getCell(columns.totalBookings.key).font = font10;
            dataRow.getCell(columns.totalNetSales.key).font = font10;
            dataRow.getCell(columns.totalTreatments.key).font = font10;
            dataRow.getCell(columns.firstAppointment.key).font = font10;
            dataRow.getCell(columns.lastAppointment.key).font = font10;
            dataRow.getCell(columns.notes.key).font = font10;

            dataRow.height = 19;

            dataRow.getCell(columns.notes.key).border = { right: thinBlackBorder }
            if (dataInc === userData.length - 1) {
                // apply bottom border
                dataRow.getCell(columns.userName.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.email.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.contact.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.address.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.therapist.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.gender.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.totalBookings.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.totalNetSales.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.totalTreatments.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.firstAppointment.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.lastAppointment.key).border = { bottom: thinBlackBorder }
                dataRow.getCell(columns.notes.key).border = { bottom: thinBlackBorder, right: thinBlackBorder }
            }
        }
        fileName = "Users.xlsx";
        buffer = await workbook.xlsx.writeBuffer({
            filename: fileName,
        });
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
    const response = {
        statusCode: 200,
        headers: {
            ...Headers,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet',
            'Content-Disposition': "attachment; filename= " + fileName,
            isBase64Encoded: true,
        },
        body: setPayloadData(event,{
            Data: {
                File: buffer.toString('base64'),
                FileName: fileName
            }
        })
    }
    return response;
}