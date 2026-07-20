const platform = ['ios', 'android', 'web'];
const apiClients = [
    process.env.API_CLIENT_COCON_APP,
    process.env.API_CLIENT_COCON_THERAPIST,
    process.env.API_CLIENT_COCON_CMS
];
const CryptoJS = require("crypto-js");

// Reverse proxies (e.g. Traefik/Go) canonicalise header names to Title-Case
// ("X-Encrypted"), while AWS API Gateway delivers them lower-cased. Look the
// flag up case-insensitively so payloads decrypt in both environments.
function isEncryptedRequest(event) {
    const headers = (event && event.headers) || {};
    const key = Object.keys(headers).find(h => h.toLowerCase() === 'x-encrypted');
    return key ? headers[key] === 'true' : false;
}

module.exports = {
    REQ_DATA_ERR_MSG: "Please enter the required information.",
    InitializeFirebase: function () {
        let userAdmin = require("firebase-admin");
        const serviceAccount = require(process.env.FIREBASE_CONFIG_FILE);
        const userApp = userAdmin.apps.find(f => f.name === process.env.FIREBASE_USER_APP);
        if (!userApp) {
            userAdmin.initializeApp({
                credential: userAdmin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DB_URL,
            }, process.env.FIREBASE_USER_APP)
            return userAdmin.app(process.env.FIREBASE_USER_APP);
        }
        return userAdmin.app(process.env.FIREBASE_USER_APP);
    },
    InitializeFirebaseTherapist: function () {
        let therapistAdmin = require("firebase-admin");
        const serviceAccount = require(process.env.FIREBASE_CONFIG_FILE);
        const therapistApp = therapistAdmin.apps.find(f => f.name === process.env.FIREBASE_THERAPIST_APP);
        if (!therapistApp) {
            therapistAdmin.initializeApp({
                credential: therapistAdmin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DB_URL,
            }, process.env.FIREBASE_THERAPIST_APP)
            return therapistAdmin.app(process.env.FIREBASE_THERAPIST_APP);
        }
        return therapistAdmin.app(process.env.FIREBASE_THERAPIST_APP);
    },
    checkHeaders: function (headers, userType=null) {
        console.log(headers)
        // normalise header keys to lower-case (proxies may Title-Case them)
        const _lower = {};
        for (const k in (headers || {})) _lower[k.toLowerCase()] = headers[k];
        headers = _lower;
        if (
            !headers['api-version'] ||
            !headers['device-id'] ||
            !headers['platform'] ||
            !headers['api-client']
        ) {
            return false;
        }
        const foundPlatform = platform.find(f => f === headers['platform']);
        if (!foundPlatform) {
            return false;
        }
        const foundAPIClient = apiClients.find(f => f === headers['api-client']);
        if (!foundAPIClient) {
            return false;
        }
        if(userType!=null){
            if(userType!=headers['type']){
                return false
            }
        }else{
            if(headers['type']==2){
                return false
            }
        }
        return true;
    },
    validateEmail: function (email) {
        let valid;
        const mailformat = "^[_A-Za-z0-9-\\+]+(\\.[_A-Za-z0-9-]+)*@"
            + "[A-Za-z0-9-]+(\\.[A-Za-z0-9]+)*(\\.[A-Za-z]{2,})$";
        email.match(mailformat) ? valid = true : valid = false;
        return valid;
    },
    getLambdaNameByInstance: function () {
        return "cocon-backend-" + process.env.INSTANCE_NAME
    },
    getInstanceURL: function () {
        return process.env.INSTANCE_URL
    },
    getPayloadData: function (event) {
        let json = null;
        if (isEncryptedRequest(event)) {
            if (event.body) {
                let rawData = CryptoJS.AES.decrypt(event.body, process.env.PAYLOAD_ENC_KEY);
                if (!rawData.toString(CryptoJS.enc.Utf8)) {
                    json = null;
                } else {
                    json = JSON.parse(rawData.toString(CryptoJS.enc.Utf8));
                }
            } else {
                json = null;
            }
        } else {
            json = event.body ? JSON.parse(event.body) : null;
        }
        console.log(JSON.stringify({
            json
        }, null, 2));
        return json;
    },
    setPayloadData: function (event, data) {
        if (isEncryptedRequest(event)) {
            return CryptoJS.AES.encrypt(JSON.stringify(data), process.env.PAYLOAD_ENC_KEY).toString();
        } else {
            return JSON.stringify(data);
        }
    }
}