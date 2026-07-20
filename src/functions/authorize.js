const jwt = require('jsonwebtoken');
const { con } = require("../db");
const { USERS, STAFF } = require("../tables");
require('dotenv').config();
const TYPE = {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN: process.env.REFRESH_TOKEN_TYPE,
    ANONYMOUS_TOKEN: process.env.ANONYMOUS_TOKEN_TYPE
}
const { MESSAGE } = require("../strings");

/* older using api gateway authorizer


module.exports.verifyToken = async (event) => {
    try {
        var BearerToken = event.authorizationToken;
        if (typeof BearerToken === 'undefined') {
            throw new Error();
        }
        var tokenArr = BearerToken.toString().split(" ");
        var token = tokenArr[(tokenArr.length - 1)];

        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            audience: process.env.AUDIENCE,
            issuer: process.env.ISSUER
        });
        const user = decoded.user;

        if (!user.UserId || user.Type !== TYPE.ACCESS_TOKEN || !user.DeviceId) {
            throw new Error();
        }
        const effect = "Allow";
        const UserId = user.UserId;
        const DeviceId = user.DeviceId;
        // Return an IAM policy document for current endpoint
        const policyDocument = buildIAMPolicy(UserId, effect, event.methodArn, { DeviceId });
        return policyDocument;
    } catch (error) {
        console.log(error);
        const policyDocument = buildIAMPolicy(1, "Deny", event.methodArn, null)
        return policyDocument;
    }
}

const buildIAMPolicy = (userId, effect, resource, context) => {
    const policy = {
        principalId: userId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                },
            ],
        },
        context,
    };

    console.log(policy);
    return policy;
};

module.exports.verifyAnonymous = async (event) => {
    try {
        var mIndex = event.methodArn.indexOf("POST");
        var mName = event.methodArn.slice(mIndex + 5);
        console.log("Method Called: " + mName);
        var BearerToken = event.authorizationToken;
        if (typeof BearerToken === 'undefined') {
            throw new Error("Token missing");
        }
        var tokenArr = BearerToken.toString().split(" ");
        var token = tokenArr[(tokenArr.length - 1)];
        console.log("token");
        console.log(token);
        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            audience: process.env.AUDIENCE,
            issuer: process.env.ISSUER
        });
        const user = decoded.user;

        if (user.Type !== TYPE.ANONYMOUS_TOKEN) {
            throw new Error();
        }
        const effect = "Allow";
        const userId = "-1";

        // Return an IAM policy document for current endpoint
        const policyDocument = buildIAMPolicy(userId, effect, event.methodArn, null);
        return policyDocument;
    } catch (error) {
        console.log(error.message);
        const policyDocument = buildIAMPolicy("-1", "Deny", event.methodArn, null)
        return policyDocument;
    }
}
*/


/* Newer, IN API checking */

module.exports.verifyAccessToken = async (token, apiClient) => {
    // first validate token then verify device.
    var bearerToken = token;
    if (typeof bearerToken === 'undefined') {
        return {
            statusCode: 401,
            message: MESSAGE.TOKEN_NOT_PROVIDED
        }
    }
    var tokenArr = bearerToken.toString().split(" ");
    var extractedToken = tokenArr[(tokenArr.length - 1)];

    let audience = "";
    if (apiClient === process.env.API_CLIENT_COCON_APP) {
        audience = process.env.AUDIENCE;
    }
    if (apiClient === process.env.API_CLIENT_COCON_THERAPIST) {
        audience = process.env.AUDIENCE_THERAPIST;
    }
    // Verify JWT
    try {
        var decoded = jwt.verify(extractedToken, process.env.JWT_SECRET, {
            audience: audience,
            issuer: process.env.ISSUER
        });
        var payload = decoded.payload;
    } catch (error) {
        console.log(error);
        return {
            statusCode: 403,
            message: MESSAGE.INVALID_AUTH_TOKEN
        }
    }
    if (!decoded.sub || payload.Type !== TYPE.ACCESS_TOKEN || !payload.DeviceId) {
        return {
            statusCode: 403,
            message: MESSAGE.INVALID_AUTH_TOKEN
        }
    }
    // check if user has deleted account

  
    let knex = require("knex")(con);
    if (apiClient === process.env.API_CLIENT_COCON_APP) {
        const userDeleted = await knex
        .select("Archive")
        .from(USERS).where("UserId", "=", parseInt(decoded.sub))
    // await knex.destroy();
    if (userDeleted[0].Archive ==1) {
        return {
            statusCode: 417,
            message: MESSAGE.USER_ACCOUNT_DELETED
        }
    }
    }
   

    // token is valid now validate device id.
    // let knex = require("knex")(con);
    const deviceExist = await knex
        .select("DeviceId")
        .modify(qb => {
            if (apiClient === process.env.API_CLIENT_COCON_APP) {
                qb.from(USERS).where("UserId", "=", parseInt(decoded.sub))
            }
            if (apiClient === process.env.API_CLIENT_COCON_THERAPIST) {
                qb.from(STAFF).where("StaffId", "=", parseInt(decoded.sub))
            }
        })
    await knex.destroy();
    if (deviceExist[0].DeviceId !== payload.DeviceId) {
        return {
            statusCode: 412,
            message: MESSAGE.USER_LOGGED_OUT
        }
    }
    // everything is correct return success
    return {
        statusCode: 200,
        message: MESSAGE.PROCEED
    }
}

module.exports.verifyRefreshToken = async (token, apiClient) => {
    // extract token from Authorization Bearer
    var bearerToken = token;
    if (typeof bearerToken === 'undefined') {
        return {
            statusCode: 401,
            message: MESSAGE.TOKEN_NOT_PROVIDED
        }
    }
    var tokenArr = bearerToken.toString().split(" ");
    var extractedToken = tokenArr[(tokenArr.length - 1)];

    let audience = "";
    if (apiClient === process.env.API_CLIENT_COCON_APP) {
        audience = process.env.AUDIENCE;
    }
    if (apiClient === process.env.API_CLIENT_COCON_THERAPIST) {
        audience = process.env.AUDIENCE_THERAPIST;
    }
    console.log(audience)
    // Verify JWT
    try {
        var decoded = jwt.verify(extractedToken, process.env.JWT_SECRET, {
            audience: audience,
            issuer: process.env.ISSUER
        });
        var payload = decoded.payload;
    } catch (error) {
        console.log(error);
        return {
            statusCode: 403,
            message: MESSAGE.INVALID_AUTH_TOKEN
        }
    }
    if (!decoded.sub || payload.Type !== TYPE.REFRESH_TOKEN || !payload.DeviceId) {
        return {
            statusCode: 403,
            message: MESSAGE.INVALID_AUTH_TOKEN
        }
    }
    // token is valid now check with DB and deviceId
    var knex = require("knex")(con);
    const deviceExist = await knex
        .select("DeviceId", "RefreshToken")
        .modify(qb => {
            if (apiClient === process.env.API_CLIENT_COCON_APP) {
                console.log("User token")
                qb.from(USERS).where("UserId", "=", parseInt(decoded.sub))
            }
            if (apiClient === process.env.API_CLIENT_COCON_THERAPIST) {
                console.log("staff token")
                qb.from(STAFF).where("StaffId", "=", parseInt(decoded.sub))
            }
        })
    await knex.destroy();
    if (deviceExist[0].DeviceId !== payload.DeviceId || extractedToken !== deviceExist[0].RefreshToken) {
        return {
            statusCode: 412,
            message: MESSAGE.USER_LOGGED_OUT
        }
    }
    // everything is correct return success
    return {
        statusCode: 200,
        message: MESSAGE.PROCEED,
        DeviceId: payload.DeviceId,
        Subject: decoded.sub
    }
}

module.exports.verifyAnonymousToken = async token => {
    // extract token from Authorization Bearer
    var bearerToken = token;
    if (typeof bearerToken === 'undefined') {
        return {
            statusCode: 401,
            message: MESSAGE.TOKEN_NOT_PROVIDED
        }
    }
    var tokenArr = bearerToken.toString().split(" ");
    console.log(tokenArr)
    var extractedToken = tokenArr[(tokenArr.length - 1)];

    // Verify JWT
    try {
        var decoded = jwt.verify(extractedToken, process.env.JWT_SECRET, {
            audience: process.env.AUDIENCE,
            issuer: process.env.ISSUER
        });
        var payload = decoded.payload;
        console.log(payload)
        if (!decoded.sub || parseInt(payload.Type) !== 2) {
            if (parseInt(payload.Type) === 0) {
                return {
                    statusCode: 303,
                    accessToken: true
                };
            } else {
                throw new Error(MESSAGE.INVALID_AUTH_TOKEN);
            }
        }
        if (!decoded.sub || parseInt(payload.UserType) == 2) {
            console.log("here")
            throw new Error("un");
        }
    } catch (error) {
        console.log(error);
        return {
            statusCode: 403,
            message: MESSAGE.INVALID_AUTH_TOKEN
        }
    }
    return {
        statusCode: 200,
        message: MESSAGE.SUCCESS
    }
}