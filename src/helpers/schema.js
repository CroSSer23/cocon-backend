const { con } = require("../db");
const { BOOKINGS, CATEGORIES, BOOKING_PREFERENCE, DISPATCH_FILTERS, ADMIN_NOTIFICATION_CONTACT, APP_VERSIONS, SOS_CONTACT, STAFF_GROUP,ACCOUNT_DELETE_FEEDBACK } = require("../tables");
const zone = require("../zone");
module.exports.updateSchema = async event => {
    const knex = require("knex")(con);

    let tablesCreated = [ACCOUNT_DELETE_FEEDBACK];
    let tablesUpdated = [];
    let tablesDeleted = [];
    let dataInserted = [];

    knex.schema.createTableIfNotExists(ACCOUNT_DELETE_FEEDBACK, function (table) {
        table.increments('AccountDeleteFeedbackId').primary(); // integer id
        table.integer('IssueType').comment('0-Issue faced with app functionality 1- Finding hard to use the app 2- Issues with services provided 3- Other')
        table.integer('UserId')
        table.text('Feedback')
        table.dateTime('LastUpdated')
        table.dateTime('Created')
    })

//     CREATE TABLE `AccountDeleteFeedback` (
//         `AccountDeleteFeedbackId` int(10) UNSIGNED NOT NULL,
//         `IssueType` int(11) DEFAULT NULL COMMENT '0-Issue faced with app functionality 1- Finding hard to use the app 2- Issues with services provided 3- Other',
//         `UserId` int(11) DEFAULT NULL,
//         `Feedback` text DEFAULT NULL,
//         `LastUpdated` datetime DEFAULT NULL,
//         `Created` datetime DEFAULT NULL
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      
//       ALTER TABLE `AccountDeleteFeedback`
//         ADD PRIMARY KEY (`AccountDeleteFeedbackId`);
        
//         ALTER TABLE `AccountDeleteFeedback`
//         MODIFY `AccountDeleteFeedbackId` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;
// ALTER TABLE `User` CHANGE `Name` `Name` VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL;
// ALTER TABLE `User` CHANGE `Name` `Name` VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL, CHANGE `Email` `Email` VARCHAR(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL;
// ALTER TABLE `Staff` ADD `Sequence` INT NOT NULL AFTER `Created`;
// ALTER TABLE `user` ADD `DOB` DATE NULL AFTER `Created`, ADD `PreferredLanguage` INT NULL AFTER `DOB`, ADD `ClientSource` INT NULL AFTER `PreferredLanguage`;
let staffExist = await knex("Staff").select("StaffId").orderBy("StaffId", "asc")
console.log(staffExist)
if (staffExist.length > 0) {
    for (let staffInc = 0; staffInc < staffExist.length; staffInc++) {
        const staff = staffExist[staffInc];
        await knex("Staff")
                    .where("StaffId", "=", staff.StaffId)
                    .update({
                        Sequence: staffInc+1,
                    });
    }
}
await knex.destroy();

    return {
        statusCode: 200,
        body: JSON.stringify({
            Created: tablesCreated,
            Updated: tablesUpdated,
            Deleted: tablesDeleted,
            DataInserted: dataInserted
        })
    }
}