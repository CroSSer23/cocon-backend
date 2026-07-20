const momentz = require("moment-timezone");
const { DATE_TIME_FORMAT } = require("./strings");

const getLastUpdate = () => {
    const moment = require("moment");
    return moment().utc().toDate();
}

const getCreateUpdate = () => {
    const moment = require("moment");
    const currentTimeStamp = moment().utc().toDate();
    return {
        LastUpdated: currentTimeStamp,
        Created: currentTimeStamp
    }
}

function getStaffZone(dateTime) {
    // dateTime : YYYY-MM-DDTHH:mm:ssZ
    if (dateTime) {
        return momentz(dateTime).tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.Z);
    } else {
        return momentz().tz(process.env.STAFF_ZONE).format(DATE_TIME_FORMAT.Z);
    }
}

module.exports = {
    getLastUpdate,
    getCreateUpdate,
    getStaffZone
}