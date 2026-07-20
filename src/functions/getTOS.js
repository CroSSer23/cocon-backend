const { Headers } = require("../header");
const { checkHeaders } = require("../util");
const { verifyAccessToken, verifyAnonymousToken } = require("./authorize");
const { MESSAGE } = require("../strings");
require('dotenv').config();

module.exports.handler = async (event, context) => {
    try {
        const headers = event.headers;
        var isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAnonymousToken(headers['Authorization'], headers['api-client']);
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

        var TOS = `  
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent auctor risus vitae efficitur interdum. Nunc aliquet porttitor neque, a varius ligula tincidunt sed. Maecenas condimentum a justo et euismod. Aliquam non gravida risus. Nam quis sapien nec metus viverra porta at aliquet turpis. Nulla purus magna, ultricies at rutrum a, finibus non nunc. Quisque quis dapibus ligula. Donec rhoncus nec turpis eget feugiat. Vivamus eu tempor tortor. Suspendisse eu consequat magna. Integer in dolor vitae nibh mollis maximus ut ut purus. Nam ut eros et odio hendrerit sollicitudin sed sit amet ligula. Sed a tortor faucibus, sagittis nisl sed, rhoncus elit.
    
    Sed quam ligula, bibendum a tortor vitae, feugiat sollicitudin eros. Vivamus rutrum, nisl vitae molestie pretium, tortor ipsum ullamcorper leo, aliquam porttitor orci massa ac dui. Curabitur molestie neque quis metus euismod gravida. Duis in erat egestas, sagittis erat vitae, mollis lorem. Curabitur vestibulum dui ipsum, in rutrum tortor consequat eu. Maecenas ornare condimentum congue. Proin ut massa viverra, eleifend ex sit amet, aliquet ante. Proin sit amet maximus erat, ac sodales ante.
    
    Aenean tempus sodales magna, et tristique diam auctor non. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Ut sollicitudin lacinia sem, porta dapibus dui luctus ut. Sed suscipit orci ex, eu consequat dolor maximus ac. Morbi ullamcorper orci nisi, quis sagittis velit finibus in. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Morbi vulputate quis arcu vitae gravida. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi nec hendrerit odio, sed mollis augue. Sed nibh augue, porta sit amet velit ac, feugiat interdum turpis. Aenean vel eleifend massa. Fusce nisi nisi, elementum vitae malesuada ut, vestibulum id mauris. In quis feugiat nibh, nec posuere ante. Integer tincidunt vestibulum magna, eu blandit nibh blandit vitae. Maecenas egestas auctor dolor nec pellentesque.
    
    Vivamus elementum, dolor at porta condimentum, leo mi volutpat eros, et tincidunt urna nulla a erat. Integer ornare turpis tellus. Duis mollis porta nisl et rhoncus. Morbi massa tortor, tempor maximus interdum eleifend, commodo sed velit. Sed ultrices sollicitudin purus ac tristique. Curabitur finibus, neque eu euismod lacinia, neque leo pretium nunc, ac maximus nisi massa quis arcu. Aenean non purus odio. Aenean rutrum dictum semper. Nulla quam quam, luctus a orci et, ullamcorper euismod elit. Praesent tempor eros venenatis turpis ultricies cursus. Nulla vel turpis odio. Proin sollicitudin rutrum metus, nec dictum est vulputate sed. Cras fermentum blandit magna vitae ultricies. Curabitur nulla turpis, ornare quis ultrices vitae, euismod ac dolor. Nullam urna odio, maximus vitae sodales at, sagittis eget turpis. Vivamus gravida lacus varius mollis feugiat.
    
    Maecenas ac magna at orci finibus accumsan quis at lorem. Fusce vitae finibus mi. Nullam leo urna, ultrices et dictum accumsan, commodo a velit. Donec id felis sem. Aliquam sodales libero ut nisl ornare laoreet. Proin pharetra aliquet pellentesque. Integer ornare, lacus et sodales rutrum, nulla nunc commodo augue, sed tincidunt turpis elit eu neque. Vestibulum interdum malesuada tincidunt. Nullam mi velit, mattis nec ligula vel, scelerisque vulputate velit. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. 
        `
    } catch (error) {
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
            message: MESSAGE.TOS_FETCH_SUCCESS
        },
        body: JSON.stringify({
            Data: TOS
        })
    }
}
