const { con } = require("../db");
const { ACTION_LOG } = require("../tables");
const zone = require("../zone");
module.exports.saveLog = async(knex,adminId,tableName,tableId,actionType) => {
   
    try{
        console.log("in log")
        var logData = {
            AdminId:adminId,
            TableName:tableName,
            TableId:tableId,
            ActionType:actionType,
            ...zone.getCreateUpdate()
        }
        console.log(logData)
        // console.log(knex)
        insertedLog = await knex(ACTION_LOG).insert({
            ...logData
        })
    console.log("created")
       
    
        return {
            statusCode: 200,
            body: JSON.stringify({
                ...logData
            })
        }

    }
    catch (error) {
        await knex.destroy();
        console.log(error)
        
    }
   
}