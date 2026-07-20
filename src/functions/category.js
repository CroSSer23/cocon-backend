const { con } = require("../db.js");
const { Headers } = require("../header");
const {
    CATEGORIES,
    ADDONS,
    ADDON_CATEGORY,
    PRODUCTS,
    PRODUCT_DURATIONS, 
    PRODUCT_EXTRA, 
    PRODUCT_TRANSLATIONS, 
    FAQ,
    CATEGORY_HOURLY_RATE
} = require("../tables");
const { checkHeaders, getLambdaNameByInstance, getPayloadData, setPayloadData } = require("../util");
const { verifyAccessToken, verifyAnonymousToken } = require("./authorize")
const DELETE_FLAG = 0;
const { product,allProduct } = require("./product");
var zone = require("../zone");
const { MESSAGE } = require("../strings");
const moment = require('moment');
const momentz = require("moment-timezone");
const { saveLog, } = require("../helpers/common.js");
const {LOG_ACTION_TYPE } = require("../enum");

module.exports.getCategoryDetail = async event => {
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.CategoryId) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const categoryId = json.CategoryId ? json.CategoryId : null;
        var lang = json && json.LanguageId ? json.LanguageId : null;
        var knex = require("knex")(con);

        // Fetch products for this category
        var Products = await product(knex, categoryId, lang);
        if (Products.Error) {
            throw new Error(Products.Error);
        }
        Products.forEach(element => {
            delete element.CategoryId;
            delete element.Category;
        });

        // Fetch add-ons for this category
        var AddOns = await knex
            .select(
                ADDON_CATEGORY + '.AddOnId',
                ADDONS + '.Name',
                ADDONS + '.Duration',
                ADDONS + '.Amount',
                ADDONS + '.ImagePath',
            )
            .from(ADDON_CATEGORY)
            .leftJoin(ADDONS, ADDONS + '.AddOnId', ADDON_CATEGORY + '.AddOnId')
            .where(ADDON_CATEGORY + '.CategoryId', '=', categoryId)
            .andWhere(ADDONS + '.Deleted', '=', DELETE_FLAG)
        await knex.destroy();
    } catch (err) {
        await knex.destroy();
        console.log(err);
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: err.message
            }
        }
    }

    const finalObj = {
        Products,
        AddOns
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.CATEGORY_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalObj
        })
    }
}

module.exports.getCategory = async (event) => {
    let categoryData = [];
    try {
        var knex = require("knex")(con);
        var categoryRawData = await knex(CATEGORIES)
            .select(
                CATEGORIES+'.CategoryId',
                CATEGORIES+'.Name',
                CATEGORIES+'.Description',
                CATEGORIES+'.ImagePath',
                CATEGORY_HOURLY_RATE+'.StartTime',
                CATEGORY_HOURLY_RATE+'.EndTime',
                CATEGORY_HOURLY_RATE+'.MondayRate',
                CATEGORY_HOURLY_RATE+'.TuesdayRate',
                CATEGORY_HOURLY_RATE+'.WednesdayRate',
                CATEGORY_HOURLY_RATE+'.ThursdayRate',
                CATEGORY_HOURLY_RATE+'.FridayRate',
                CATEGORY_HOURLY_RATE+'.SaturdayRate',
                CATEGORY_HOURLY_RATE+'.SundayRate'
            )
            .orderBy("CurOrder", "asc")
            .where('Deleted', '=', DELETE_FLAG)
            .leftJoin(CATEGORY_HOURLY_RATE, CATEGORY_HOURLY_RATE + '.CategoryId', CATEGORIES + '.CategoryId')
        await knex.destroy();
       console.log(categoryRawData);
        try{
            for (let catInc = 0; catInc < categoryRawData.length; catInc++) {
                const category = categoryRawData[catInc];
                const found = categoryData.find(cat => cat.CategoryId === category.CategoryId);
                if(!found){
                    let obj={
                        CategoryId:category.CategoryId,
                        Name:category.Name,    
                        Description:category.Description,    
                        ImagePath:category.ImagePath,    
                        ImageURL:process.env.BUCKET_URL + category.ImagePath,
                        HourlyRate:[]
                    }
                    if(category.StartTime && category.EndTime){
                        let rateObj={
                            StartTime:category.StartTime,
                            EndTime:category.EndTime,
                            MondayRate:category.MondayRate,
                            TuesdayRate:category.TuesdayRate,
                            WednesdayRate:category.WednesdayRate,
                            ThursdayRate:category.ThursdayRate,
                            FridayRate:category.FridayRate,
                            SaturdayRate:category.SaturdayRate,
                            SundayRate:category.SundayRate,
                            
                        }
                        obj.HourlyRate.push(rateObj)
                    }
                    categoryData.push(obj);

                }else{
                    let rateObj={
                        StartTime:category.StartTime,
                        EndTime:category.EndTime,
                        MondayRate:category.MondayRate,
                        TuesdayRate:category.TuesdayRate,
                        WednesdayRate:category.WednesdayRate,
                        ThursdayRate:category.ThursdayRate,
                        FridayRate:category.FridayRate,
                        SaturdayRate:category.SaturdayRate,
                        SundayRate:category.SundayRate,
                        
                    }
                    found.HourlyRate.push(rateObj)
                }
            }
        }
        catch(err){
            console.log(err)
        }
        // categoryData.forEach(element => {
        //     element.ImageURL = process.env.BUCKET_URL + element.ImagePath;
        // });
    } catch (err) {
        await knex.destroy();
        console.log(err);
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
            Message: MESSAGE.CATEGORY_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: categoryData
        })
    }

}

module.exports.newCategory = async event => {
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.Name || !json.Description) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require("knex")(con);
        let existGreatestCount = await knex(CATEGORIES)
            .select("CurOrder")
            .where("Deleted", "=", DELETE_FLAG)
            .limit(1)
            .orderBy("CurOrder", "desc");
        // let newColor = Math.floor(Math.random() * 16777215).toString(16);
        let letters = '0123456789ABCDEF';
        let color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        console.log(color);
        const inserted = await knex(CATEGORIES).insert({
            // ...json,
            Name: json.Name,
            Description: json.Description,
            ImagePath: json.ImagePath,
            CurOrder: existGreatestCount[0].CurOrder + 1,
            ColorCode: color,
            ...zone.getCreateUpdate()
        })
        if (inserted.length <= 0) {
            throw new Error(MESSAGE.CREATE_CATEGORY_FAILED);
        }

        var categoryData = await knex(CATEGORIES).select(
            'CategoryId',
            'Name',
            'Description',
            'ImagePath'
        ).where('Deleted', '=', DELETE_FLAG);
        
        const insertedCategoryId = inserted[0];
        if (json.HourlyRate.length > 0) {
            let hourlyRate = json.HourlyRate;
            for (let rateIndex = 0; rateIndex < hourlyRate.length; rateIndex++) {
                const rate = hourlyRate[rateIndex];
                let rateInsert = await knex(CATEGORY_HOURLY_RATE)
                    .insert({
                        CategoryId: insertedCategoryId,
                        StartTime: rate.StartTime,
                        EndTime: rate.EndTime,
                        MondayRate:rate.MondayRate,
                        TuesdayRate:rate.TuesdayRate,
                        WednesdayRate:rate.WednesdayRate,
                        ThursdayRate:rate.ThursdayRate,
                        FridayRate:rate.FridayRate,
                        SaturdayRate:rate.SaturdayRate,
                        SundayRate:rate.SundayRate,
                        ...zone.getCreateUpdate()
                    })
            }
        }
        // create log for create
        await saveLog(knex,json.AdminId,CATEGORIES,insertedCategoryId,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();

    } catch (err) {
        console.log(err);
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
            Message: MESSAGE.CATEGORY_SAVE_SUCCESS
        },
        body: setPayloadData(event, {
            Data: categoryData
        })
    }
}

module.exports.updateCategory = async event => {
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
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.CategoryId ||
            !json.Name ||
            !json.Description 
            // !json.ImagePath
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const knex = require("knex")(con);
        var CategoryExist = await knex(CATEGORIES).select("*").where("CategoryId", "=", json.CategoryId);
        if (CategoryExist.length <= 0) {
            await knex.destroy();
            throw new Error(MESSAGE.CATEGORY_NOT_AVAILABLE);
        }
        var ExistData = CategoryExist[0];

        // Create and fill update obj with updatable data
        var updateObj = {};
        if (json.Name && typeof json.Name === 'string' && json.Name.trim() !== "") {
            if (json.Name !== ExistData.Name) {
                updateObj.Name = json.Name.trim();
            }
        }
        if (json.Description && typeof json.Description === 'string' && json.Description.trim() !== "") {
            if (json.Description !== ExistData.Description) {
                updateObj.Description = json.Description.trim();
            }
        }
        if (json.ImagePath && typeof json.ImagePath === 'string' && json.ImagePath.trim() !== "") {
            if (json.ImagePath !== ExistData.ImagePath) {
                updateObj.ImagePath = json.ImagePath;
            }
        }
        // If update obj has some data then update the same in table.
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            var categoryUpdated = await knex(CATEGORIES).where("CategoryId", "=", json.CategoryId).update(updateObj);
            if (!categoryUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.UPDATE_CATEGORY_FAILED);
            }
        }
        var categoryData = await knex(CATEGORIES).select(
            'CategoryId',
            'Name',
            'Description',
            'ImagePath'
        ).where('Deleted', '=', DELETE_FLAG);
        categoryData.forEach(element => {
            element.ImageURL = process.env.BUCKET_URL + element.ImagePath;
        });
        // delete existing rates
        var deleteRate = await knex(CATEGORY_HOURLY_RATE)
        .where("CategoryId", "=", json.CategoryId)
        .delete().
        modify(function(qb){
           console.log( qb.toSQL().toNative())
        });
        if (json.HourlyRate.length > 0) {
            let hourlyRate = json.HourlyRate;
            for (let rateIndex = 0; rateIndex < hourlyRate.length; rateIndex++) {
                const rate = hourlyRate[rateIndex];
                let rateInsert = await knex(CATEGORY_HOURLY_RATE)
                    .insert({
                        CategoryId: json.CategoryId,
                        StartTime: rate.StartTime,
                        EndTime: rate.EndTime,
                        MondayRate:rate.MondayRate,
                        TuesdayRate:rate.TuesdayRate,
                        WednesdayRate:rate.WednesdayRate,
                        ThursdayRate:rate.ThursdayRate,
                        FridayRate:rate.FridayRate,
                        SaturdayRate:rate.SaturdayRate,
                        SundayRate:rate.SundayRate,
                        ...zone.getCreateUpdate()
                    })
            }
        }
         // create log for update
         await saveLog(knex,json.AdminId,CATEGORIES,json.CategoryId,LOG_ACTION_TYPE.UPDATE)

        await knex.destroy();
    } catch (err) {
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
            Message: MESSAGE.UPDATE_CATEGORY_SUCCESS
        },
        body: setPayloadData(event, {
            Data: categoryData
        })
    }
}

const checkCatProdAddOnDataUpdated = async (knex, lastUpdated) => {

    const promises = [];
    var catCount, productCount, productDurCount, productTranslationCount, productExtraCount, addOnCount, addOnCatCount;
    // Category data
    promises.push(knex(CATEGORIES)
    .count('CategoryId')
    .where('Deleted', '=', DELETE_FLAG)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => catCount = data))

    // Product tables data checked for lastUpated.
    promises.push(knex
    .count('ProductId')
    .from(PRODUCTS)
    .where('Deleted', '=', DELETE_FLAG)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => productCount = data))

    promises.push(knex
    .count('ProductDurationId')
    .from(PRODUCT_DURATIONS)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => productDurCount = data))

    promises.push(knex
    .count('ProductTranslationId')
    .from(PRODUCT_TRANSLATIONS)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => productTranslationCount = data))

    promises.push(knex
    .count('ProductExtraId')
    .from(PRODUCT_EXTRA)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => productExtraCount = data))

    // Add On tables data checked for lastUpated.
    promises.push(knex
    .count('AddOnId')
    .from(ADDONS)
    .where('Deleted', '=', DELETE_FLAG)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => addOnCount = data))

    promises.push(knex
    .count('AddOnCategoryId')
    .from(ADDON_CATEGORY)
    .andWhere('LastUpdated', '>', lastUpdated).then(data => addOnCatCount = data))

    await Promise.all(promises);
    const recordsUpdated = catCount[0]['count(`CategoryId`)'] + 
        productCount[0]['count(`ProductId`)'] +
        productDurCount[0]['count(`ProductDurationId`)'] + 
        productTranslationCount[0]['count(`ProductTranslationId`)'] +
        productExtraCount[0]['count(`ProductExtraId`)'] +
        addOnCount[0]['count(`AddOnId`)'] + 
        addOnCatCount[0]['count(`AddOnCategoryId`)'];
    return recordsUpdated > 0;
}

module.exports.getCategoryProduct = async event => {
    let finalData=[]
    try {
        const headers = event.headers;
        let excludeOrgProd=true;
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
        if (headers['api-client'] === process.env.API_CLIENT_COCON_THERAPIST) {
            // const accessTokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
            // if (accessTokenValid.statusCode !== 200) {
            //     return {
            //         statusCode: accessTokenValid.statusCode,
            //         headers: {
            //             ...Headers,
            //             message: accessTokenValid.message
            //         }
            //     }
            // }       
            excludeOrgProd=false                                                                                                 
        } else {
            // var tokenValid = await verifyAnonymousToken(headers['Authorization'], headers['api-client']);
            // if (tokenValid.statusCode > 303) {
            //     return {
            //         statusCode: tokenValid.statusCode,
            //         headers: {
            //             ...Headers,
            //             message: tokenValid.message
            //         }
            //     }
            // }
            // if (tokenValid.statusCode === 303) {
            //     const accessTokenValid = await verifyAccessToken(headers['Authorization'], headers['api-client']);
            //     if (accessTokenValid.statusCode !== 200) {
            //         return {
            //             statusCode: accessTokenValid.statusCode,
            //             headers: {
            //                 ...Headers,
            //                 message: accessTokenValid.message
            //             }
            //         }
            //     }
            // }
            excludeOrgProd=true
        }
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2)); 
        var lang = json && json.LanguageId ? json.LanguageId : null;
        var knex = require("knex")(con);

        //Check for updates in case if LastUpdated time is passed in API parameter
        const lastUpdated = json.LastUpdated;
        if (lastUpdated) {
            const isUpdated = await checkCatProdAddOnDataUpdated(knex, lastUpdated);
            if (!isUpdated) {
                await knex.destroy();
                return {
                    statusCode: 200,
                    headers: {
                        ...Headers,
                        message: MESSAGE.CATEGORY_FETCH_SUCCESS
                    },
                    body: setPayloadData(event, {
                        Data: [],
                        LastUpdated: moment().utc().format(),
                    })
                }
            }
        }
        // let excludeOrgProd=true
        let allProducts=await allProduct(knex, lang,null,excludeOrgProd);
        console.log(allProducts)
        
        var categoryData = await knex(CATEGORIES)
            .select(
                'CategoryId',
                'Name',
                'Description',
                'ImagePath',
                'CurOrder'
            )
            .where('Deleted', '=', DELETE_FLAG)
            .orderBy("CurOrder")
        categoryData.forEach(element => {
            element.ImageURL = process.env.BUCKET_URL + element.ImagePath;
        });

        for (let cat = 0; cat < categoryData.length; cat++) {
            const element = categoryData[cat];
            // element.Products = await product(knex, element.CategoryId, lang);
            // console.log(element.Products)
            // element.Products.forEach(pro => {
            //     delete pro.CategoryId;
            //     delete pro.Category;
            // });
            element.AddOns = await knex
                .select(
                    ADDON_CATEGORY + '.AddOnId',
                    ADDONS + '.Name',
                    ADDONS + '.Duration',
                    ADDONS + '.Amount',
                    ADDONS + '.ImagePath',
                )
                .from(ADDON_CATEGORY)
                .leftJoin(ADDONS, ADDONS + '.AddOnId', ADDON_CATEGORY + '.AddOnId')
                .where(ADDON_CATEGORY + '.CategoryId', '=', element.CategoryId)
                .andWhere(ADDONS + '.Deleted', '=', DELETE_FLAG)
                .orderBy(ADDONS + ".CurOrder", "asc")
        }
       
        for (let prod = 0; prod < allProducts.length; prod++) {
            let product=allProducts[prod];
            let categoryFinalDataIndex=finalData.findIndex(final => final.CategoryId === product.CategoryId);
            if(categoryFinalDataIndex !=-1){
                finalData[categoryFinalDataIndex].Products.push(product)
            }else{
                // console.log("product",allProducts)
                // console.log("cat",cat)
                let prodCategoryData = categoryData.find(cat => cat.CategoryId === product.CategoryId);
                prodCategoryData.Products=[]
                prodCategoryData.Products.push(product)
                // console.log(prodCategoryData)
                finalData.push(prodCategoryData)
            }
            
            finalData.sort((a, b) => {
                if ( a.CurOrder < b.CurOrder){
                  return -1;
                }
                if ( a.CurOrder > b.CurOrder){
                  return 1;
                }
                return 0;
              });
        }
        await knex.destroy();
    } catch (err) {
        console.log(err);
        return {
            statusCode: 400,
            headers: {
                ...Headers,
                message: err.message
            }
        }
    }
    return {
        statusCode: 200,
        headers: {
            ...Headers,
            message: MESSAGE.CATEGORY_FETCH_SUCCESS
        },
        body: setPayloadData(event, {
            Data: finalData,
            LastUpdated: moment().utc().format(),
        })
    }
}

module.exports.reorderCatalog = async event => {
    let knex, connected;
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2)); 
        if (
            !json ||
            !json.Type || typeof json.Type !== "string" ||
            !json.Order || typeof json.Order !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        knex = require("knex")(con);
        connected = true;
        switch (json.Type) {
            case "Category": {
                let count = 1;
                for (let catInc = 0; catInc < json.Order.length; catInc++) {
                    let categoryId = json.Order[catInc];
                    let countUpdated = await knex(CATEGORIES).where("CategoryId", "=", categoryId)
                        .update({
                            CurOrder: count
                        })
                    count++;
                }
                break;
            }
            case "Product": {
                let count = 1;
                for (let prodInc = 0; prodInc < json.Order.length; prodInc++) {
                    let productId = json.Order[prodInc];
                    let countUpdated = await knex(PRODUCTS).where("ProductId", "=", productId)
                        .update({
                            CurOrder: count
                        })
                    count++;
                }
                break;
            }
            case "AddOn": {
                let count = 1;
                for (let addOnInc = 0; addOnInc < json.Order.length; addOnInc++) {
                    let addOnId = json.Order[addOnInc];
                    let countUpdated = await knex(ADDONS).where("AddOnId", "=", addOnId)
                        .update({
                            CurOrder: count
                        })
                    count++;
                }
                break;
            }
            case "Faq": {
                let count = 1;
                for (let faqInc = 0; faqInc < json.Order.length; faqInc++) {
                    let faqId = json.Order[faqInc];
                    let countUpdated = await knex(FAQ).where("FaqId", "=", faqId)
                        .update({
                            CurOrder: count
                        })
                    count++;
                }
                break;
            }
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
            message: MESSAGE.REORDERING_SUCCESS
        }
    }
}