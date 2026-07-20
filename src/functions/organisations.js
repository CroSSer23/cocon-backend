const { con } = require("../db.js");
const { verifyAccessToken, verifyAnonymousToken } = require("./authorize")
const { Headers } = require("../header");
const {
    ADDONS,
    ADDON_CATEGORY,
    CATEGORIES,
    ORGANISATION,
    ORGANISATION_LOCATION,
    ADMIN,
    BUSINESS_TYPE,
    CENTER
} = require("../tables");
const DELETED = 0;
const zone = require("../zone");
const { MESSAGE } = require("../strings");
const { getPayloadData, setPayloadData, checkHeaders } = require("../util.js");
const { metadata } = require("./metadata");
const md5 = require("md5");
// const ADMIN_TYPE = {
//     SuperAdmin: 0,
//     Agent: 1,
//     Organisation: 2,
// }
const nodemailer = require('nodemailer');
const moment = require("moment");
const momentz = require("moment-timezone");
const { saveLog, } = require("../helpers/common.js");
const {LOG_ACTION_TYPE,ADMIN_TYPE } = require("../enum");
module.exports.newOrganisation = async event => {
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
        if (
            !json ||
            !json.Name ||
            !json.Email ||
            !json.Type ||
            !json.Contact ||
            !json.HouseNumber ||
            // !json.Street ||
            !json.City ||
            !json.Zip
            // !json.Elevator

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;

        // check if email already exists in location or admin
        let locationExist = await knex(ORGANISATION_LOCATION).select("OrganisationLocationId").where("Email", "=", json.Email).andWhere("Deleted","=",0);
        let adminExist=[]
        if(json.SaveAdmin){
            adminExist = await knex(ADMIN).select("AdminId")
        .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + ".OrganisationLocationId", ADMIN + ".OrganisationLocationId")
        .where(ADMIN+".Email", "=", json.Email)
        .andWhere(ORGANISATION_LOCATION+".Deleted","=",0);
        }
        
        console.log(locationExist)
        console.log(adminExist)
        if (locationExist.length > 0 || adminExist.length > 0) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.ORGANISATION_EMAIL_ALREADY_EXIST

                }
            }
        }
        // calculate reach out time
        console.log("innsss");
        let reachOutTime = await getReachoutTime(knex, json);
        if (!reachOutTime) {
            throw new Error(MESSAGE.REACHOUTTIME_FAILED
            );
        }
        if (json.OrganisationId) {
            // This is a new location for an existing Organisation. Entries will be done only in the OrganisationLocation table.

            var organisationLocationData = {
                Name: json.Name,
                Email: json.Email,
                Contact: json.Contact,
                Zip: json.Zip,
                HouseNumber: json.HouseNumber,
                Street: json.Street,
                City: json.City,
                Elevator: json.Elevator,
                Floor: json.Floor,
                OrganisationId: json.OrganisationId,
                ImagePath: (json.ImagePath) ? json.ImagePath : null,
                ReachOutTime: reachOutTime.reachOutTime,
                Distance: reachOutTime.distanceInMeter,
                ContactNumber: json.ContactNumber?json.ContactNumber:null,
                ...zone.getCreateUpdate()
            }
            console.log(organisationLocationData)
            insertedLocation = await knex(ORGANISATION_LOCATION).insert({
                ...organisationLocationData
            })
            if (insertedLocation.length <= 0) {
                throw new Error(MESSAGE.CREATE_ORGANISATION_LOCATION_FAILED);
            }
        } else {
            // This is a new organisation, entries will be done in both Organisation and OrganisationLocation table
            var organisationData = {
                Name: json.Name,
                Email: json.Email,
                Type: json.Type,
                ...zone.getCreateUpdate()


            }

            inserted = await knex(ORGANISATION).insert({
                ...organisationData
            })
            // console.log(inserted)
            if (inserted.length <= 0) {
                throw new Error(MESSAGE.CREATE_ORGANISATION_FAILED);
            }
            var organisationLocationData = {
                Name: json.Name,
                Email: json.Email,
                Contact: json.Contact,
                Zip: json.Zip,
                HouseNumber: json.HouseNumber,
                Street: json.Street,
                City: json.City,
                Elevator: json.Elevator,
                Floor: json.Floor,
                ImagePath: (json.ImagePath) ? json.ImagePath : null,
                OrganisationId: inserted[0],
                ReachOutTime: reachOutTime.reachOutTime,
                Distance: reachOutTime.distanceInMeter,
                ContactNumber: json.ContactNumber?json.ContactNumber:null,
                ...zone.getCreateUpdate()
            }
            console.log(organisationLocationData)
            insertedLocation = await knex(ORGANISATION_LOCATION).insert({
                ...organisationLocationData
            })
            if (insertedLocation.length <= 0) {
                throw new Error(MESSAGE.CREATE_ORGANISATION_LOCATION_FAILED);
            }
            var updatedEncryted = await knex(ORGANISATION_LOCATION)
                .where("OrganisationLocationId", "=", insertedLocation[0])
                .update({
                    "EncryptedOrganisationLocationId": md5(insertedLocation[0])
                })
        }
        if (json.SaveAdmin) {
            // create random password
            let password = await this.generatePassword();
            if (!password) {
                throw new Error(MESSAGE.PASSWORD_CREATION_FAILED);
            }
            var adminData = {
                Name: json.Name,
                Email: json.Email,
                password: md5(password),
                Contact: json.Contact,
                Type: ADMIN_TYPE.Organisation,
                OrganisationLocationId: insertedLocation[0],
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
                <h4 style="font-weight: 500; font-size: 17px">Dear Administrator of ${json.Name},</h4>
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
        }
        


       


        // create log for create
        await saveLog(knex,json.AdminId,ORGANISATION,inserted[0],LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
    } catch (error) {
        console.log(error);
        if (connected) {

            /**
             * Rollback if organisation created but location failed.
             */
            if (inserted[0]) {
                let organisationDelete = await knex(ORGANISATION)
                    .where("OrganisationId", "=", inserted[0])
                    .del();
            } else {
                console.log("rollback not required");
            }
            /**
           * Rollback if organisation location created but admin password creation failed.
           */
            if (insertedLocation[0]) {
                let organisationLocationDelete = await knex(ORGANISATION_LOCATION)
                    .where("OrganisationLocationId", "=", insertedLocation[0])
                    .del();
            } else {
                console.log("rollback not required");
            }
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
            message: MESSAGE.ORGANISATION_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.getOrganisation = async event => {

    var responseBody = {};
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
        knex = require("knex")(con);
        connected = true;
        const tokenValid = await verifyAnonymousToken(event.headers['Authorization'], event.headers['api-client']);
        if (tokenValid.statusCode > 303) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        // const knex = require("knex")(con);
        const json = event.body ? getPayloadData(event) : null;
        // if (
        //     !json ||
        //     // !json.Pagination || typeof json.Pagination !== "object"
        // ) {
        //     throw new Error(MESSAGE.REQ_DATA_ERROR);
        // }
       
        var orgData = await this.organisations(knex,null,{
            pagination: json.Pagination,
            filters: json.Filters,
            search: json.Search,
        });
        if(json.AddCocon){
            let coconStatic={
                OrganisationId: '',
                    Name: 'COCON (B2C)',
                    Contact: '',
                    Email: '',
                    Zip: '',
                    Street: '',
                    HouseNumber: '',
                    Elevator: '',
                    Distance: '',
                    ReachOutTime: '',
                    Floor: '',
                    City:'',
                    OrganisationLocationId: -1,
                    ImagePath: '',
                    OrganisationName: '',
                    Type: '',
                    OrgType: ''
              }
              orgData.push(coconStatic)
        }
       
        // console(orgData)
        if (orgData.Error) {
            await knex.destroy();
            throw new Error(orgData.Error);
        }
        

        responseBody = {
            Data: orgData,
        };
        responseBody = {
            Data: orgData,
            // CurrentIds: staffData.currentIds,
            LastUpdated: moment().utc().format(),
            TotalItems:  !json.Search ? await getOrgCount(knex, json.Filters) : 0,
            Pagination: {
                ...json.Pagination
            }
        };
        console.log(responseBody)
        await knex.destroy();
    } catch (error) {
        console.log(error)
        await knex.destroy();
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
            Message: MESSAGE.ORGANISATION_FETCH_SUCCESS
        },
        body: setPayloadData(event, responseBody)
    }
}

const getOrgCount = async (knex, filters) => {
    var orgData = await knex
    .count(
        ORGANISATION_LOCATION + ".OrganisationLocationId",
    ).from(ORGANISATION_LOCATION)
    .where(ORGANISATION_LOCATION+".Deleted", "=", 0)
    .modify(queryBuilder => {
        
        console.log(queryBuilder.toSQL().toNative()) 
    });
    console.log(orgData)
    return orgData[0]['count(`OrganisationLocation`.`OrganisationLocationId`)'];
}

module.exports.updateOrganisation = async event => {
    var inserted, response = []
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
            !json.Name ||
            !json.Email ||
            !json.Type ||
            !json.Contact ||
            !json.HouseNumber ||
            // !json.Street ||
            !json.City ||
            !json.Zip ||
            // !json.Elevator ||
            !json.OrganisationId ||
            !json.OrganisationLocationId

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;
        // check if location already exists
        let locationExist = await knex(ORGANISATION_LOCATION).select("OrganisationLocationId").where("Email", "=", json.Email)
        .andWhere("OrganisationLocationId", "!=", json.OrganisationLocationId)
        .andWhere("Deleted", "=", 0);
        let adminExist = await knex(ADMIN).select("AdminId")
            .where(ADMIN + ".Email", "=", json.Email)
            .andWhere("OrganisationLocationId", "!=", json.OrganisationLocationId)
            .andWhere("Deleted", "=", 0);
        console.log(locationExist)
        console.log(adminExist)
        if (locationExist.length > 0 || adminExist.length > 0) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.ORGANISATION_EMAIL_ALREADY_EXIST

                }
            }
        }
        var organisationData = {
            Name: json.Name,
            Type: json.Type,
            ...zone.getLastUpdate()


        }

        var updated = await knex(ORGANISATION)
            .where("OrganisationId", "=", json.OrganisationId)
            .update({
                ...organisationData
            })
        if (updated.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_FAILED);
        }

        // This is an existing location, entries will be updated
        // calculate reach out time
        let reachOutTime = await getReachoutTime(knex, json);
        if (!reachOutTime) {
            throw new Error(MESSAGE.REACHOUTTIME_FAILED
            );
        }
        var organisationLocationData = {
            Name: json.Name,
            Email: json.Email,
            Contact: json.Contact,
            Zip: json.Zip,
            HouseNumber: json.HouseNumber,
            Street: json.Street,
            City: json.City,
            Elevator: json.Elevator,
            Floor: json.Floor,
            OrganisationId: json.OrganisationId,
            ImagePath: (json.ImagePath) ? json.ImagePath : null,
            ReachOutTime: reachOutTime.reachOutTime,
            Distance: reachOutTime.distanceInMeter,
            ContactNumber: json.ContactNumber?json.ContactNumber:null,
            ...zone.getLastUpdate()
        }
        var updatedLocation = await knex(ORGANISATION_LOCATION)
            .where("OrganisationLocationId", "=", json.OrganisationLocationId)
            .update({
                ...organisationLocationData
            })
        if (updatedLocation.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_LOCATION_FAILED);
        }

        var adminUpdateData = {
            Name: json.Name,
            // Email: json.Email,
            Contact: json.Contact,
            ProfileImagePath: (json.ProfileImagePath) ? json.ProfileImagePath : null,
            ...zone.getLastUpdate()
        }
        var updatedAdmin = await knex(ADMIN)
            .where("OrganisationLocationId", "=", json.OrganisationLocationId)
            .update({
                ...adminUpdateData
            })
        if (updatedAdmin.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_ADMIN_FAILED);
        }



        // Save log for update
        await saveLog(knex,json.AdminId,ORGANISATION,json.OrganisationId,LOG_ACTION_TYPE.UPDATE)
        await knex.destroy();
    } catch (error) {

        console.log(error);
        if (connected) {
            /**
        * Rollback if organisation created but location failed.
        */

            if (insertedLocation[0]) {
                let organisationLocationDelete = await knex(ORGANISATION_LOCATION)
                    .where("OrganisationLocationId", "=", insertedLocation[0])
                    .del();
            } else {
                console.log("rollback not required");
            }
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
            message: MESSAGE.ORGANISATION_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}
module.exports.deleteOrganisation = async event => {
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
            !json.OrganisationLocationId

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;


        // This is an existing location, entries will be updated

        var organisationLocationData = {
            Deleted: 1,
            ...zone.getLastUpdate()
        }
        var updatedLocation = await knex(ORGANISATION_LOCATION)
            .where("OrganisationLocationId", "=", json.OrganisationLocationId)
            .update({
                ...organisationLocationData
            })
        if (updatedLocation.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_LOCATION_FAILED);
        }
        var updatedAdmin = await knex(ADMIN)
            .where("OrganisationLocationId", "=", json.OrganisationLocationId)
            .update({
                ...organisationLocationData
            })
        if (updatedAdmin.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_ADMIN_FAILED);
        }



         // Save log for delete
         await saveLog(knex,json.AdminId,ORGANISATION_LOCATION,json.OrganisationLocationId,LOG_ACTION_TYPE.DELETE)
         
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
            message: MESSAGE.ORGANISATION_DELETE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.organisations = async (knex, organisationLocationId = null,criteria=null) => {

    try {
        let pagination=null
        let search=null
        if(criteria!=null){
            console.log("cri",criteria) 
            pagination=criteria.pagination
            search=criteria.search
        }

        let orgData = await knex
            .select(
                ORGANISATION_LOCATION + ".OrganisationLocationId",
                ORGANISATION_LOCATION + ".Name",
                ORGANISATION_LOCATION + ".Email",
                ORGANISATION_LOCATION + ".Contact",
                ORGANISATION_LOCATION + ".HouseNumber",
                ORGANISATION_LOCATION + ".Zip",
                ORGANISATION_LOCATION + ".Street",
                ORGANISATION_LOCATION + ".City",
                ORGANISATION_LOCATION + ".Floor",
                ORGANISATION_LOCATION + ".Elevator",
                ORGANISATION_LOCATION + ".Distance",
                ORGANISATION_LOCATION + ".ReachOutTime",
                ORGANISATION_LOCATION + ".OrganisationId",
                ORGANISATION_LOCATION + ".ImagePath",
                ORGANISATION_LOCATION + ".ContactNumber",
                'OrgLoc' + ".Name as OrganisationName",
                'OrgLoc' + ".Type as Type",
                BUSINESS_TYPE + ".Name as OrgType",
                ADMIN + ".ProfileImagePath"

            )
            .from(ORGANISATION_LOCATION)
            .leftJoin({ 'OrgLoc': ORGANISATION }, 'OrgLoc' + ".OrganisationId", ORGANISATION_LOCATION + ".OrganisationId")
            .leftJoin(BUSINESS_TYPE, BUSINESS_TYPE + ".BusinessTypeId", 'OrgLoc' + ".Type")
            .leftJoin(ADMIN, ORGANISATION_LOCATION + ".OrganisationLocationId", ADMIN + ".OrganisationLocationId")
            // .leftJoin(ORGANISATION, ORGANISATION + ".Type", BUSINESS_TYPE + ".BusinessTypeId")
            .where(ORGANISATION_LOCATION+".Deleted", "=", 0)
            .orderBy(ORGANISATION_LOCATION + ".OrganisationLocationId", "desc")
            .modify(queryBuilder => {
                
                if (organisationLocationId) {
                    queryBuilder.andWhere(ORGANISATION_LOCATION + ".OrganisationLocationId", "=", organisationLocationId)
                }
                console.log("page",pagination)
                console.log("search",search)
                if(search){
                    console.log("search",search)
                    queryBuilder.andWhere(function () {
                        this.where(ORGANISATION_LOCATION + ".Name", "like", `%${search}%`)
                        this.orWhere(BUSINESS_TYPE + ".Name", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Contact", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Name", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".HouseNumber", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Zip", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Street", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".City", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Floor", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Elevator", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".Email", "like", `%${search}%`)
                        this.orWhere(ORGANISATION_LOCATION + ".ContactNumber", "like", `%${search}%`)
                    })
                   
                }else{
                    if(pagination){
                        console.log("page",pagination)
                        queryBuilder.limit(pagination.Size);
                        if (pagination.Number > 1) {
                            let offset = pagination.Size * (pagination.Number - 1);
                            queryBuilder.offset(offset)
                        }
                    } 
                }
                  
                console.log(queryBuilder.toSQL().toNative())
            })
        // console.log(orgData)
        var finalData = [];
        for (let Inc = 0; Inc < orgData.length; Inc++) {
            
            const organisation = orgData[Inc];
            const found = finalData.find(s => s.OrganisationLocationId === organisation.OrganisationLocationId);
            if(!found){
                let objToPush = {
                    OrganisationId: organisation.OrganisationId,
                    Name: organisation.Name,
                    Contact: organisation.Contact,
                    Email: organisation.Email,
                    Zip: organisation.Zip,
                    Street: organisation.Street,
                    HouseNumber: organisation.HouseNumber,
                    Elevator: organisation.Elevator,
                    Distance: organisation.Distance,
                    ReachOutTime: organisation.ReachOutTime,
                    Floor: organisation.Floor,
                    City: organisation.City,
                    OrganisationLocationId: organisation.OrganisationLocationId,
                    ImagePath: organisation.ImagePath,
                    OrganisationName: organisation.OrganisationName,
                    Type: organisation.Type,
                    OrgType: organisation.OrgType,
                    ContactNumber: organisation.ContactNumber,
                    ProfileImagePath: organisation.ProfileImagePath
    
                }
                if(objToPush.ImagePath!=null){
                    objToPush.ImageURL = process.env.BUCKET_URL + objToPush.ImagePath;
                }else{
                    objToPush.ImageURL = null;
                }
                if(objToPush.ProfileImagePath!=null){
                    objToPush.ProfImageURL = process.env.BUCKET_URL + objToPush.ProfileImagePath;
                }else{
                    objToPush.ProfImageURL = null;
                }
                finalData.push(objToPush);
            }
            
        }
        // console.log(orgData)
        // console.log(finalData)
    } catch (error) {
        console.log(error)
        return {
            Error: error.message
        }
    }
    return finalData;


}

module.exports.resetPassword = async event => {
    var inserted, response = []
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
            !json.ResetPasswordAdminId

        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        knex = require("knex")(con);
        connected = true;
        // check if location already exists
      
        let adminExist = await knex(ADMIN).select("*")
            .where("AdminId", "=", json.ResetPasswordAdminId)
            .andWhere("Deleted","=",0);
       
        console.log(adminExist)
        if (adminExist.length == 0) {
            return {
                statusCode: 409,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_ADMIN

                }
            }
        }
        // create random password
        let password = await this.generatePassword();
        if (!password) {
            throw new Error(MESSAGE.PASSWORD_CREATION_FAILED);
        }


        var adminData = {
            password: md5(password),
            ...zone.getLastUpdate()
        }
        console.log(adminData)
        var updated = await knex(ADMIN)
            .where("AdminId", "=", json.ResetPasswordAdminId)
            .update({
                ...adminData
            })
        if (updated.length <= 0) {
            throw new Error(MESSAGE.UPDATE_ORGANISATION_FAILED);
        }
        response = {
            Email: adminExist[0].Email,
            Password: password
        }
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
            <h4 style="font-weight: 500; font-size: 17px">Dear ${adminExist[0].Name},</h4>
            <h4 style="font-weight: 500; font-size: 17px">Your password has been reset successfully.</h4>
<h4 style="font-weight: 500; font-size: 17px">To access your account, please use the following login credentials:</h4>

<p>
<span style="font-size:17px; font-family: Raleway, sans-serif;
color: #3a312d;font-weight: bold">URL: ${process.env.CMS_URL}#/login</span>
<br />   
    <span style="font-size:17px; font-family: Raleway, sans-serif;
    color: #3a312d;font-weight: bold">Email: ${adminExist[0].Email}</span>
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
        let toMails = [adminExist[0].Email];
        let mailSubject = "Your password has been reset."
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
        console.log(sendingMail)
     }catch(error){
        console.log(error)
     }




      // create log for create
      await saveLog(knex,json.AdminId,ADMIN,json.ResetPasswordAdminId,LOG_ACTION_TYPE.UPDATE)
        await knex.destroy();
    } catch (error) {

        console.log(error);
        if (connected) {
            /**
        * Rollback if organisation created but location failed.
        */

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
            message: MESSAGE.ORGANISATION_PASSWORD_UPDATE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: response
        })
    }
}

module.exports.generatePassword = async () => {
    var length = 8,
        charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        retVal = "";
    for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

const getReachoutTime = async (knex, json) => {
    try {
        let centerData = await knex(CENTER).select("CenterId", "Name", "Address", "Latitude", "Longitude", "ServiceArea", "Contact", "SosContact", "CheckInProximity", "TodayLeadTime");
        console.log(centerData);
        let source = centerData[0].Address;
        let destination = (json.Floor ? json.Floor + ", " : "") + (json.Street ? json.Street + " " : "") + (json.HouseNumber ? json.HouseNumber + " " : "") + (json.City ? ", " + json.City : "") + (json.Zip ? ", " + json.Zip : "");
        let reachOutTime = 30
        let distanceInMeter = 0
        let response = {}
        console.log("err");
        console.log(source);
        console.log(destination);
        if (source && destination) {
            console.log("inn");
            const request = require("request-promise");
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
            let ReachOutData = object;
            console.log("ReachOutData", JSON.stringify(object))

            if (ReachOutData.rows[0].elements[0].status !== "OK") {
                console.log("inn 1");
                reachOutTime = 30
                distanceInMeter = 0
            } else {
                console.log("inn 2");
                reachOutTime = Math.round(ReachOutData.rows[0].elements[0].duration.value / 60);
                distanceInMeter = object.rows[0].elements[0].distance.value;
                console.log("reachOutTime",reachOutTime)



            }
            response = {
                reachOutTime,
                distanceInMeter
            }

        }
        return response;
    } catch (error) {
        console.log(error)

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