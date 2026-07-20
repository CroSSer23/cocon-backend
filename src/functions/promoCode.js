const { con } = require("../db.js");
const { verifyAccessToken } = require("./authorize")
const { Headers } = require("../header");
const moment = require("moment");
const momentz = require("moment-timezone");
const {
    PROMOCODES,
    PROMOCODE_CATEGORIES
} = require("../tables");
const zone = require("../zone");
const { checkHeaders, getPayloadData, setPayloadData } = require("../util");
const { PROMO_CODE_CLASS, PROMOCODE_LIST_FILTERS, LOG_ACTION_TYPE } = require("../enum");
const { MESSAGE,DATE_TIME_FORMAT } = require("../strings");
const { saveLog, } = require("../helpers/common.js");

const PROMOCODE_SORT_KEYS = [
    "StartDate", 
    "EndDate", 
    "MinPurchaseAmount", 
    "MaxAmount", 
    "RedeemCount", 
    "CurrentCount"
];

module.exports.promo = async (knex, promoCodeId, promoCode, criteria) => {
    try {
        const {
            pagination,
            sort,
            filters,
            search,
            lastUpdated,
            currentIds
        } = criteria ? criteria : {pagination: {Size: 20, Number: 0}};
        var promoCodeIds = await knex
            .pluck(PROMOCODES + '.PromoCodeId')
            .from(PROMOCODES)
            .modify(queryBuilder => {
                if (promoCodeId) {
                    queryBuilder.where(PROMOCODES + '.PromoCodeId', '=', promoCodeId);
                } else if (promoCode) {
                    queryBuilder.where(PROMOCODES + '.Code', '=', promoCode);
                } else  {
                    // CASE WHEN CMS CALLING THIS API FOR ALL PROMOCODES
                    if (!search) {
                        if (filters && filters.length) {
                            let codeGenTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.CODE_GEN_TYPE.KEY);
                            if (codeGenTypeFilter && codeGenTypeFilter.Values && codeGenTypeFilter.Values.length) {
                                queryBuilder.where(PROMOCODES + ".Class", "=", codeGenTypeFilter.Values[0])
                            }
                            let valueTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.VALUE_TYPE.KEY);
                            if (valueTypeFilter && valueTypeFilter.Values && valueTypeFilter.Values.length) {
                                queryBuilder.where(PROMOCODES + ".Mode", "=", valueTypeFilter.Values[0])
                            }
                            let promoTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.PROMO_TYPE.KEY);
                            if (promoTypeFilter && promoTypeFilter.Values && promoTypeFilter.Values.length) {
                                queryBuilder.where(PROMOCODES + ".Type", "=", promoTypeFilter.Values[0])
                            }
                            let startDateFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.STARTDATE.KEY);
                            if (startDateFilter && startDateFilter.Values && startDateFilter.Values.length) {
                                queryBuilder.where("StartDate", ">=", momentz.tz(startDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                queryBuilder.andWhere("StartDate", "<=", momentz.tz(startDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                            let endDateFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.ENDDATE.KEY);
                            if (endDateFilter && endDateFilter.Values && endDateFilter.Values.length) {
                                
                                queryBuilder.where("EndDate", ">=", momentz.tz(endDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                                queryBuilder.andWhere("EndDate", "<=", momentz.tz(endDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
                            }
                        }
                    } else {
                        queryBuilder.where(PROMOCODES + ".Code", "like", `%${search}%`)
                        queryBuilder.orWhere(PROMOCODES + ".Value", "like", `%${search}%`)
                        queryBuilder.orWhere(PROMOCODES + ".MaxAmount", "like", `%${search}%`)
                        queryBuilder.orWhere(PROMOCODES + ".RedeemCount", "like", `%${search}%`)
                        queryBuilder.orWhere(PROMOCODES + ".CurrentCount", "like", `%${search}%`)
                        queryBuilder.orWhere(PROMOCODES + ".MinPurchaseAmount", "like", `%${search}%`)
                    }
                    if (sort && sort.Key && PROMOCODE_SORT_KEYS.includes(sort.Key)) {
                        queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                    } else {
                        queryBuilder.orderBy(PROMOCODES + ".Created", "desc")
                    }
                    if (!search) {
                        queryBuilder.limit(pagination.Size);
                        if (pagination.Number > 1) {
                            let offset = pagination.Size * (pagination.Number - 1);
                            queryBuilder.offset(offset)
                        }
                    }
                }
            })

        // Fetch promocode and its category data
        var promoCodeData = await knex
            .select(
                PROMOCODES + '.PromoCodeId',
                PROMOCODES + '.Code',
                PROMOCODES + '.Type',
                PROMOCODES + '.Mode',
                PROMOCODES + '.StartDate',
                PROMOCODES + '.EndDate',
                PROMOCODES + '.Value',
                PROMOCODES + '.MaxAmount',
                PROMOCODES + '.MinPurchaseAmount',
                PROMOCODES + '.Class',
                PROMOCODES + '.RedeemCount',
                PROMOCODES + '.CurrentCount',
                PROMOCODE_CATEGORIES + '.CategoryId',
                knex.raw(`DATE_FORMAT(StartDate, '%d %m %Y') AS your_date`)
            ).from(PROMOCODES)
            .leftJoin(PROMOCODE_CATEGORIES, PROMOCODE_CATEGORIES + '.PromoCodeId', PROMOCODES + '.PromoCodeId')
            .modify(queryBuilder => {
                queryBuilder.whereIn(PROMOCODES + ".PromoCodeId", promoCodeIds)
                if (lastUpdated && currentIds) {
                    // check for mismatched ids fetch to fetch those promocode as well
                    var missedPromocodesIds = promoCodeIds.filter( function(n) { 
                        return !this.has(n) }, new Set(currentIds) 
                    );
                    queryBuilder.where(PROMOCODES + ".LastUpdated", ">", lastUpdated)
                    queryBuilder.orWhereIn(PROMOCODES + '.PromoCodeId', missedPromocodesIds)
                }
                if (sort && sort.Key && PROMOCODE_SORT_KEYS.includes(sort.Key)) {
                    queryBuilder.orderBy(sort.Key, sort.Value === "ascending" ? "asc" : "desc")
                } else {
                    queryBuilder.orderBy(PROMOCODES + ".Created", "desc")
                }
            })

        var finalData = [];
        console.log(promoCodeData)
        promoCodeData.forEach(promo => {
            const found = finalData.find(pr => pr.PromoCodeId === promo.PromoCodeId);
            if (!found) {
                let categories = [];
                if (promo.CategoryId) {
                    categories.push(promo.CategoryId)
                }
                finalData.push({
                    PromoCodeId: promo.PromoCodeId,
                    Code: promo.Code,
                    Type: promo.Type,
                    Mode: promo.Mode,
                    StartDate: promo.StartDate,
                    EndDate: promo.EndDate,
                    Value: promo.Value,
                    MaxAmount: promo.MaxAmount,
                    MinPurchaseAmount: promo.MinPurchaseAmount,
                    Class: promo.Class,
                    RedeemCount: promo.RedeemCount ? promo.RedeemCount : null,
                    CurrentCount: promo.CurrentCount ? promo.CurrentCount : 0,
                    Categories: categories,
                    your_date: promo.your_date
                })
            } else {
                if (promo.CategoryId) {
                    found.Categories.push(promo.CategoryId);
                }
            }
        });
    } catch (error) {
        return {
            Error: error.message
        }
    }

    if (promoCodeId || promoCode) {
        return finalData;
    } else {
        return {
            data: finalData,
            currentIds: promoCodeIds,
        };
    }
    
}

const getPromoCodeCount = async (knex, filters) => {
    var promoCodeData = await knex
    .count(
        PROMOCODES + '.PromoCodeId',
    ).from(PROMOCODES)
    .modify(queryBuilder => {
        if (filters && filters.length) {
            let codeGenTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.CODE_GEN_TYPE.KEY);
            if (codeGenTypeFilter && codeGenTypeFilter.Values && codeGenTypeFilter.Values.length) {
                queryBuilder.where(PROMOCODES + ".Class", "=", codeGenTypeFilter.Values[0])
            }
            let valueTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.VALUE_TYPE.KEY);
            if (valueTypeFilter && valueTypeFilter.Values && valueTypeFilter.Values.length) {
                queryBuilder.where(PROMOCODES + ".Mode", "=", valueTypeFilter.Values[0])
            }
            let promoTypeFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.PROMO_TYPE.KEY);
            if (promoTypeFilter && promoTypeFilter.Values && promoTypeFilter.Values.length) {
                queryBuilder.where(PROMOCODES + ".Type", "=", promoTypeFilter.Values[0])
            }
            let startDateFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.STARTDATE.KEY);
            if (startDateFilter && startDateFilter.Values && startDateFilter.Values.length) {
                queryBuilder.where("StartDate", ">=", momentz.tz(startDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())
                
                queryBuilder.andWhere("StartDate", "<=",momentz.tz(startDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
            }
            let endDateFilter = filters.find(f => f.Key === PROMOCODE_LIST_FILTERS.ENDDATE.KEY);
            if (endDateFilter && endDateFilter.Values && endDateFilter.Values.length) {
                queryBuilder.where("EndDate", ">=", momentz.tz(endDateFilter.Values[0], process.env.STAFF_ZONE).startOf('day').utc().format())

                queryBuilder.andWhere("EndDate", "<=", momentz.tz(endDateFilter.Values[1], process.env.STAFF_ZONE).endOf('day').utc().format())
            }
        }
        console.log(queryBuilder.toSQL().toNative()) 
    });
    return promoCodeData[0]['count(`PromoCode`.`PromoCodeId`)'];
}

module.exports.getPromoCode = async event => {
    let knex, response;
    try {
        knex = require("knex")(con);
        const json = event.body ? getPayloadData(event) : null;
        var promoData = await this.promo(knex, null, null, json ? {
            pagination: json.Pagination,
            sort: json.Sort,
            filters: json.Filters,
            search: json.Search,
            lastUpdated: json.LastUpdated,
            currentIds: json.CurrentIds,
        }: null);
        if (promoData.Error) {
            throw new Error(promoData.Error);
        }

        var lastUpdated = moment().utc().format();
        // Prepare response
        response = {
            Data: promoData.data,
            CurrentIds: promoData.currentIds,
            LastUpdated: lastUpdated,
            TotalItems: !json.Search ? await getPromoCodeCount(knex, json.Filters) : 0,
            Pagination: {
                ...json.Pagination
            }
        };
        await knex.destroy();
    } catch (err) {
        await knex.destroy();
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_FETCH_SUCCESS
        },
        body: setPayloadData(event,response)
    }
}

module.exports.newPromoCode = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Code || typeof json.Code !== "string" ||
            json.Type < 0 || typeof json.Type !== "number" ||
            json.Type > 1 ||
            json.Mode < 0 || typeof json.Mode !== "number" ||
            json.Mode > 1 ||
            !json.StartDate || typeof json.StartDate !== "string" ||
            !json.EndDate || typeof json.EndDate !== "string" ||
            !json.Value || typeof json.Value !== "number" ||
            !json.MaxAmount || typeof json.MaxAmount !== "number" ||
            !json.MinPurchaseAmount || typeof json.MinPurchaseAmount !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        const Categories = json.Categories;
        if (json.Type === 1 && Categories.length === 0) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        const promoExist = await knex(PROMOCODES).select("Code").where("Code", "=", json.Code);
        if (promoExist.length !== 0) {
            throw new Error(MESSAGE.PROMOCODE_ALREADY_EXIST);
        }
        connected = true;
        const startDate = moment(json.StartDate).utc().toDate();
        const endDate = moment(json.EndDate).utc().toDate();
        let insertedPromo = await knex(PROMOCODES)
            .insert({
                Code: json.Code,
                Type: json.Type,
                Mode: json.Mode,
                StartDate: startDate,
                EndDate: endDate,
                Value: json.Value,
                MaxAmount: json.MaxAmount,
                MinPurchaseAmount: json.MinPurchaseAmount,
                Class: PROMO_CODE_CLASS.CMS,
                RedeemCount: json.RedeemCount,
                CurrentCount: 0,
                ...zone.getCreateUpdate()
            })
            
        const promoCodeId = insertedPromo[0];
        if (json.Type === 1 && json.Categories.length > 0) {
            for (let i = 0; i < Categories.length; i++) {
                const CategoryId = Categories[i];
                const inserted = await knex(PROMOCODE_CATEGORIES).insert(
                    {
                        PromoCodeId: promoCodeId,
                        CategoryId,
                        ...zone.getCreateUpdate()
                    }
                )
                if (inserted.length <= 0) {
                    throw new Error(MESSAGE.PROMOCODE_CREATE_SWW);
                }
            }
        }
        // Save log for create
        await saveLog(knex,json.AdminId,PROMOCODES,promoCodeId,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }
    
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_SAVE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: {}
        })
    }
}

module.exports.updatePromoCode = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json || !json.PromoCodeId || typeof json.PromoCodeId !== 'number' ||
            !json.Code || typeof json.Code !== "string" ||
            typeof json.Type !== "number" || json.Type < 0 || json.Type > 1 ||
            typeof json.Mode !== "number" || json.Mode < 0 || json.Mode > 1 ||
            !json.StartDate || typeof json.StartDate !== "string" ||
            !json.EndDate || typeof json.EndDate !== "string" ||
            !json.Value || typeof json.Value !== "number" ||
            !json.MaxAmount || typeof json.MaxAmount !== "number" ||
            !json.MinPurchaseAmount || typeof json.MinPurchaseAmount !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        if (json.Type === 1 && json.Categories.length <= 0) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const knex = require("knex")(con);
        connected = true;
        const existData = await this.promo(knex, json.PromoCodeId);
        if (existData.Error) {
            throw new Error(MESSAGE.PROMOCODE_NOT_AVAILABLE);
        }
        const promoExist = existData[0];
        let updateObj = {};
        if (json.Code.trim() !== "" && json.Code !== promoExist.Code) {
            updateObj.Code = json.Code.trim()
        }
        if (json.Type !== promoExist.Type) {
            updateObj.Type = json.Type;
        }
        if (json.Mode !== promoExist.Mode) {
            updateObj.Mode = json.Mode;
        }
        if (json.Value !== promoExist.Value) {
            updateObj.Value = json.Value;
        }
        if (json.MaxAmount !== promoExist.MaxAmount) {
            updateObj.MaxAmount = json.MaxAmount;
        }
        if (json.MinPurchaseAmount !== promoExist.MinPurchaseAmount) {
            updateObj.MinPurchaseAmount = json.MinPurchaseAmount;
        }
        var existStartDate = moment(promoExist.StartDate).utc();
        var newStartDate = moment(json.StartDate).utc();
        if (!existStartDate.isSame(newStartDate)) {
            updateObj.StartDate = newStartDate.toDate();
        }
        var existEndDate = moment(promoExist.EndDate).utc();
        var newEndDate = moment(json.EndDate).utc();
        if (!existEndDate.isSame(newEndDate)) {
            updateObj.EndDate = newEndDate.toDate();
        }

        updateObj.RedeemCount = json.RedeemCount;
        updateObj.LastUpdated = zone.getLastUpdate();

        // If update obj has some data then update the same in table.
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            var promoUpdated = await knex(PROMOCODES).where("PromoCodeId", "=", json.PromoCodeId).update(updateObj);
            if (!promoUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.PROMOCODE_UPDATE_FAILED);
            }
        }

        // update categories of promocode, first check if there are new categories
        let deletedCategories = [];
        promoExist.Categories.forEach(cat => {
            const found = json.Categories.find(f => f === cat);
            if (!found) {
                deletedCategories.push(cat);
            }
        });
        let newCategories = [];
        json.Categories.forEach(category => {
            const found = promoExist.Categories.find(f => f === category);
            if (!found) {
                newCategories.push({
                    PromoCodeId: json.PromoCodeId,
                    CategoryId: category,
                    ...zone.getCreateUpdate()
                });
            }
        });

        if (newCategories.length > 0) {
            const promoCatInserted = await knex(PROMOCODE_CATEGORIES).insert(newCategories);
            if (promoCatInserted.length <= 0) {
                throw new Error(MESSAGE.PROMOCODE_UPDATE_SWW);
            }
        }
        if (deletedCategories.length > 0) {
            for (let cat = 0; cat < deletedCategories.length; cat++) {
                const category = deletedCategories[cat];
                const oldCatDeleted = await knex(PROMOCODE_CATEGORIES)
                    .where("PromoCodeId", "=", json.PromoCodeId)
                    .andWhere("CategoryId", "=", category)
                    .del();
                if (!oldCatDeleted) {
                    throw new Error(MESSAGE.PROMOCODE_UPDATE_SWW);
                }
            }
        }
         // Save log for update
        await saveLog(knex,json.AdminId,PROMOCODES,json.PromoCodeId,LOG_ACTION_TYPE.UPDATE)
        await knex.destroy();

    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_UPDATE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: {}
        })
    }
}

module.exports.checkPromoCode = async event => {
    try {
        const headers = event.headers;
        // console.log(headers);
        let isHeadersValid = checkHeaders(headers)
        if (!isHeadersValid) {
            return {
                statusCode: 401,
                headers: {
                    ...Headers,
                    Message: MESSAGE.INVALID_HEADERS
                }
            }
        }
        var tokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
        if (tokenValid.statusCode !== 200) {
            return {
                statusCode: tokenValid.statusCode,
                headers: {
                    ...Headers,
                    message: tokenValid.message
                }
            }
        }
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.PromoCode || !json.TimeZone) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        var promoData = await this.promo(knex, null, json.PromoCode);
        if (promoData.Error) {
            throw new Error(promoData.Error);
        }
        if (promoData.length <= 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    Message: MESSAGE.PROMOCODE_NOT_AVAILABLE
                }
            }
        }

        /**
         * Check api-version for ios: if 1.0 then restrict 100% or greater off promos
         */
        let existPromoDetail = promoData[0];
        if (headers['api-version'] === "1.0" && headers['platform'] === "ios") {
            console.log("Older app: 1.0")
            if (
                (existPromoDetail.Mode === 0 && existPromoDetail.Value >= 100) ||
                (existPromoDetail.Mode === 1 && existPromoDetail.MinPurchaseAmount <= existPromoDetail.Value)
            ) {
                return {
                    statusCode: 303,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.PROMO_NOT_APPLICABLE_IOS_1
                    }
                }
            }
        }

        let currentTime = moment().utcOffset(json.TimeZone);
        let startExist = moment(promoData[0].StartDate).utcOffset(json.TimeZone);
        let endExist = moment(promoData[0].EndDate).utcOffset(json.TimeZone);
        if (
            currentTime.isBefore(startExist) || currentTime.isAfter(endExist) ||
            (
                promoData[0].RedeemCount && promoData[0].CurrentCount >= promoData[0].RedeemCount
            )
        ) {
            return {
                statusCode: 303,
                headers: {
                    ...Headers,
                    Message: MESSAGE.PROMOCODE_NOT_AVAILABLE
                }
            }
        }
        var promoCodeData = promoData[0];
        promoCodeData.MinRemainingValue = parseInt(process.env.MIN_REMAINING_VALUE);
        await knex.destroy();
    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_FETCH_SUCCESS
        },
        body: setPayloadData(event,{
            Data: promoCodeData
        })
    }
}

module.exports.deletePromoCode = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.DeletePromo ||
            typeof json.DeletePromo !== "object" ||
            json.DeletePromo.length <= 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require("knex")(con);
        var promoDeleted = await knex(PROMOCODES).whereIn("PromoCodeId", json.DeletePromo)
            .del();
        var promoCatDeleted = await knex(PROMOCODE_CATEGORIES).whereIn("PromoCodeId", json.DeletePromo)
            .del();

          // Save log for delete
        for (let promoInc = 0; promoInc < json.DeletePromo.length; promoInc++) {
            await saveLog(knex,json.AdminId,PROMOCODES,json.DeletePromo[promoInc],LOG_ACTION_TYPE.DELETE)
        }
        

        await knex.destroy();
    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_DEL_FAILED
        },
        body: setPayloadData(event,{
            Data: {}
        })
    }
}

module.exports.checkPromoCodeCMS = async event => {
    try {
        const headers = event.headers;
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.PromoCode || !json.TimeZone) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        var promoData = await this.promo(knex, null, json.PromoCode);
        if (promoData.Error) {
            throw new Error(promoData.Error);
        }
        if (promoData.length <= 0) {
            return {
                statusCode: 404,
                headers: {
                    ...Headers,
                    Message: MESSAGE.PROMOCODE_NOT_AVAILABLE
                }
            }
        }

        /**
         * Check api-version for ios: if 1.0 then restrict 100% or greater off promos
         */
        let existPromoDetail = promoData[0];
        if (headers['api-version'] === "1.0" && headers['platform'] === "ios") {
            console.log("Older app: 1.0")
            if (
                (existPromoDetail.Mode === 0 && existPromoDetail.Value >= 100) ||
                (existPromoDetail.Mode === 1 && existPromoDetail.MinPurchaseAmount <= existPromoDetail.Value)
            ) {
                return {
                    statusCode: 303,
                    headers: {
                        ...Headers,
                        Message: MESSAGE.PROMO_NOT_APPLICABLE_IOS_1
                    }
                }
            }
        }

        let currentTime = moment().utcOffset(json.TimeZone);
        let startExist = moment(promoData[0].StartDate).utcOffset(json.TimeZone);
        let endExist = moment(promoData[0].EndDate).utcOffset(json.TimeZone);
        if (
            currentTime.isBefore(startExist) || currentTime.isAfter(endExist) ||
            (
                promoData[0].RedeemCount && promoData[0].CurrentCount >= promoData[0].RedeemCount
            )
        ) {
            return {
                statusCode: 303,
                headers: {
                    ...Headers,
                    Message: MESSAGE.PROMOCODE_NOT_AVAILABLE
                }
            }
        }
        var promoCodeData = promoData[0];
        promoCodeData.MinRemainingValue = parseInt(process.env.MIN_REMAINING_VALUE);
        await knex.destroy();
    } catch (err) {
        console.log(err)
        if (connected) {
            await knex.destroy();
        }
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                Message: err.message
            }
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...Headers,
            Message: MESSAGE.PROMOCODE_FETCH_SUCCESS
        },
        body: setPayloadData(event,{
            Data: promoCodeData
        })
    }
}

