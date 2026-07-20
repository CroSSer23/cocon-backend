const { con } = require("../db.js");
const { verifyAccessToken } = require("./authorize")
const { Headers } = require("../header");
const {
    ADDONS,
    ADDON_CATEGORY,
    CATEGORIES
} = require("../tables");
const DELETED = 0;
const zone = require("../zone");
const { MESSAGE } = require("../strings");
const { getPayloadData, setPayloadData, checkHeaders } = require("../util.js");
const {LOG_ACTION_TYPE } = require("../enum");
const { saveLog, } = require("../helpers/common.js");


module.exports.addOnCMS = async (knex, addOnId) => {
    try {
        var addOnData = await knex
            .select(
                ADDONS + '.AddOnId',
                ADDONS + '.Name',
                ADDONS + '.Duration',
                ADDONS + '.Amount',
                ADDONS + '.ImagePath',
                ADDON_CATEGORY + '.CategoryId',
                CATEGORIES + '.Name as CategoryName'
            ).from(ADDONS)
            .leftJoin(ADDON_CATEGORY, ADDON_CATEGORY + '.AddOnId', ADDONS + '.AddOnId')
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', ADDON_CATEGORY + '.CategoryId')
            .where(ADDONS + '.Deleted', '=', DELETED)
            .orderBy(ADDONS + ".CurOrder", "asc")
            .modify(queryBuilder => {
                if (addOnId) {
                    queryBuilder.andWhere(ADDONS + ".AddOnId", "=", addOnId)
                }
            })

        var finalData = [];
        addOnData.forEach(addOn => {
            var found = finalData.find(f => f.AddOnId === addOn.AddOnId);
            if (!found) {
                finalData.push({
                    AddOnId: addOn.AddOnId,
                    Name: addOn.Name,
                    Duration: addOn.Duration,
                    Amount: addOn.Amount,
                    ImagePath: addOn.ImagePath,
                    Categories: [{
                        CategoryId: addOn.CategoryId,
                        CategoryName: addOn.CategoryName
                    }]
                })
            } else {
                found.Categories.push({
                    CategoryId: addOn.CategoryId,
                    CategoryName: addOn.CategoryName
                })
            }
        });
    } catch (error) {
        return {
            Error: error.message
        }
    }
    return finalData;
}

module.exports.addOn = async (knex, addOnId) => {
    try {
        var addOnData = await knex
            .select(
                ADDONS + '.AddOnId',
                ADDONS + '.Name',
                ADDONS + '.Duration',
                ADDONS + '.Amount',
                ADDONS + '.ImagePath',
                ADDON_CATEGORY + '.CategoryId',
                CATEGORIES + '.Name as CategoryName'
            ).from(ADDONS)
            .leftJoin(ADDON_CATEGORY, ADDON_CATEGORY + '.AddOnId', ADDONS + '.AddOnId')
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', ADDON_CATEGORY + '.CategoryId')
            .where(ADDONS + '.Deleted', '=', DELETED)
            .orderBy(ADDONS + ".CurOrder", "asc")
            .modify(queryBuilder => {
                if (addOnId) {
                    queryBuilder.andWhere(ADDONS + ".AddOnId", "=", addOnId)
                }
            })

        var finalData = [];
        addOnData.forEach(addOn => {
            var found = finalData.find(f => f.AddOnId === addOn.AddOnId);
            if (!found) {
                finalData.push({
                    AddOnId: addOn.AddOnId,
                    Name: addOn.Name,
                    Duration: addOn.Duration,
                    Amount: addOn.Amount,
                    ImagePath: addOn.ImagePath,
                    Categories: [{
                        CategoryId: addOn.CategoryId,
                        CategoryName: addOn.CategoryName
                    }]
                })
            } else {
                found.Categories.push({
                    CategoryId: addOn.CategoryId,
                    CategoryName: addOn.CategoryName
                })
            }
        });
    } catch (error) {
        return {
            Error: error.message
        }
    }
    return finalData;
}

module.exports.newAddOn = async event => {
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
            !json.Duration ||
            !json.Amount ||
            !json.Categories
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var Categories = json.Categories;
        if (Categories.length === 0) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        const knex = require("knex")(con);
        let existGreatestCount = await knex(ADDONS)
            .select("CurOrder")
            .where("Deleted", "=", DELETED)
            .limit(1)
            .orderBy("CurOrder", "desc");
        var inserted = await knex(ADDONS).insert({
            Name: json.Name,
            Duration: json.Duration,
            Amount: json.Amount,
            ImagePath: json.ImagePath ? json.ImagePath : null,
            CurOrder: existGreatestCount[0].CurOrder + 1,
            ...zone.getCreateUpdate()
        })

        if (inserted.length <= 0) {
            throw new Error(MESSAGE.CREATE_ADDON_FAILED);
        }
        var AddOnId = inserted[0];
        for (let cat = 0; cat < Categories.length; cat++) {
            const category = Categories[cat];
            var insertCategory = await knex(ADDON_CATEGORY).insert({
                AddOnId,
                CategoryId: category,
                ...zone.getCreateUpdate()
            })
            if (insertCategory.length <= 0) {
                throw new Error(MESSAGE.ADDON_CAT_ADD_FAILED);
            }
        }

        var addOnData = await this.addOnCMS(knex);
        if (addOnData.Error) {
            throw new Error(addOnData.Error);
        }
        // Save log for create
        await saveLog(knex,json.AdminId,ADDONS,AddOnId,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
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
            message: MESSAGE.ADDON_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: addOnData
        })
    }
}

module.exports.updateAddOn = async event => {
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
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.AddOnId ||
            !json.Name ||
            !json.Duration ||
            !json.Amount ||
            !json.Categories
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        var addOnExist = await this.addOn(knex, json.AddOnId);
        var existData = {
            AddOnId: addOnExist[0].AddOnId,
            Name: addOnExist[0].Name,
            Duration: addOnExist[0].Duration,
            Amount: addOnExist[0].Amount,
            ImagePath: addOnExist[0].ImagePath,
            Categories: addOnExist[0].Categories
        };
        var updateObj = {};
        if (json.Name && typeof json.Name === "string" && json.Name.trim() !== "") {
            if (json.Name !== existData.Name) {
                updateObj.Name = json.Name.trim();
            }
        }
        if (json.Amount && typeof json.Amount === "number") {
            if (json.Amount !== existData.Amount) {
                updateObj.Amount = json.Amount;
            }
        }
        if (json.Duration && typeof json.Duration === "number") {
            if (json.Duration !== existData.Duration) {
                updateObj.Duration = json.Duration;
            }
        }
        if (json.ImagePath && typeof json.ImagePath === "string" && json.ImagePath.trim() !== "") {
            if (json.ImagePath !== existData.ImagePath) {
                updateObj.ImagePath = json.ImagePath.trim();
            }
        }
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            var addOnUpdated = await knex(ADDONS).where("AddOnId", "=", json.AddOnId)
                .update(updateObj);
            if (!addOnUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.UPDATE_ADDON_FAILED);
            }
        }

        // add-on categories handling
        var deletedCategories = [];
        var newCategories = [];
        existData.Categories.forEach(element => {
            const found = json.Categories.find(f => f === element.CategoryId);
            if (!found) {
                deletedCategories.push(element.CategoryId);
            }
        })
        json.Categories.forEach(element => {
            const found = existData.Categories.find(f => f.CategoryId === element);
            if (!found) {
                newCategories.push(element);
            }
        });
        for (let insCatInc = 0; insCatInc < newCategories.length; insCatInc++) {
            const element = newCategories[insCatInc];
            var inserted = await knex(ADDON_CATEGORY)
                .insert({
                    AddOnId: json.AddOnId,
                    CategoryId: element,
                    ...zone.getCreateUpdate(),
                })
            if (inserted.length <= 0) {
                throw new Error(MESSAGE.ADDON_CAT_ADD_FAILED);
            }
        }
        for (let delCatInc = 0; delCatInc < deletedCategories.length; delCatInc++) {
            const element = deletedCategories[delCatInc];
            var deleted = await knex(ADDON_CATEGORY)
                .where("AddOnId", "=", json.AddOnId)
                .andWhere("CategoryId", "=", element)
                .delete();
            if (!deleted) {
                throw new Error(MESSAGE.ADDON_CAT_REM_FAILED);
            }
        }
        var addOnData = await this.addOnCMS(knex);
        if (addOnData.Error) {
            throw new Error(addOnData.Error)
        }

          // Save log for update
          await saveLog(knex,json.AdminId,ADDONS,json.AddOnId,LOG_ACTION_TYPE.UPDATE)

        await knex.destroy();
    } catch (error) {
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
            message: MESSAGE.UPDATE_ADDON_SUCCESS
        },
        body: setPayloadData(event, {
            Data: addOnData
        })
    }
}

module.exports.deleteAddOn = async event => {
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
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        if (
            !json ||
            !json.DeleteAddOn ||
            typeof json.DeleteAddOn !== 'object' ||
            json.DeleteAddOn.length <= 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        const archived = await knex(ADDONS).whereIn("AddOnId", json.DeleteAddOn)
            .update({
                Deleted: 1,
                CurOrder: 0,
                LastUpdated: zone.getLastUpdate()
            })
        if (!archived) {
            throw new Error(MESSAGE.DEL_ADDON_FAILED);
        }
        var addOnData = await this.addOnCMS(knex, null);
        if (addOnData.Error) {
            throw new Error(addOnData.Error);
        }

          // Save log for delete
          for (let inc = 0; inc < json.DeleteAddOn.length; inc++) {
            await saveLog(knex,json.AdminId,ADDONS,json.DeleteAddOn[inc],LOG_ACTION_TYPE.DELETE)
        }

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
            message: MESSAGE.DEL_ADDON_SUCCESS
        },
        body: setPayloadData(event, {
            Data: addOnData
        })
    }
}