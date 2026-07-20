const { verifyAccessToken } = require("./authorize")
const { Headers } = require("../header");
const { con } = require("../db");
const zone = require("../zone");
const { 
    PRODUCTS, 
    PRODUCT_DURATIONS, 
    PRODUCT_EXTRA, 
    PRODUCT_TRANSLATIONS, 
    CATEGORIES, 
    STAFF_PRODUCT,
    ORGANISATION_LOCATION
} = require("../tables");
const DELETED = 0;
const { MESSAGE } = require("../strings");
const { getPayloadData, setPayloadData } = require("../util");
const { saveLog, } = require("../helpers/common.js");
const {LOG_ACTION_TYPE } = require("../enum");

module.exports.product = async (knex, categoryId, languageId, productId) => {
    try {
        let productData = await knex
            .select(
                PRODUCTS + '.ProductId',
                PRODUCTS + '.CategoryId',
                PRODUCTS + '.PreparationTime',
                PRODUCTS + '.ImagePath',
                PRODUCTS + '.ProductExtraMaxSelect',
                CATEGORIES + '.Name as Category',
                PRODUCT_TRANSLATIONS + '.LanguageId',
                PRODUCT_TRANSLATIONS + '.Name',
                PRODUCT_TRANSLATIONS + '.Description',
                PRODUCT_DURATIONS + '.Duration',
                PRODUCT_DURATIONS + '.Amount',
                PRODUCT_EXTRA + ".ExtraTitle",
                PRODUCT_EXTRA + ".ExtraValue"
            )
            .from(PRODUCTS)
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', PRODUCTS + '.CategoryId')
            .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_EXTRA, PRODUCT_EXTRA + '.ProductId', PRODUCTS + '.ProductId')
            .where(PRODUCTS + '.Deleted', '=', DELETED)
            .orderBy(PRODUCTS + ".CurOrder", "asc")
            .modify((queryBuilder) => {
                if (productId) {
                    queryBuilder.where(PRODUCTS + ".ProductId", "=", productId)
                }
                if (categoryId) {
                    queryBuilder.andWhere(PRODUCTS + '.CategoryId', '=', categoryId)
                }
                if (languageId) {
                    queryBuilder.andWhere(PRODUCT_TRANSLATIONS + '.LanguageId', '=', languageId)
                }
            })

        let finalProduct = [];
        productData.forEach(product => {
            let found = finalProduct.find(pr => pr.ProductId === product.ProductId);
            if (!found) {
                let imageURL = null;
                if (product.ImagePath) {
                    imageURL = process.env.BUCKET_URL + product.ImagePath;
                }
                finalProduct.push({
                    ProductId: product.ProductId,
                    Translations: [
                        {
                            LanguageId: product.LanguageId,
                            Name: product.Name,
                            Description: product.Description
                        }
                    ],
                    PreparationTime: product.PreparationTime,
                    CategoryId: product.CategoryId,
                    Category: product.Category,
                    ImagePath: product.ImagePath,
                    ImageURL: imageURL,
                    Durations: [
                        {
                            Duration: product.Duration,
                            Amount: product.Amount
                        }
                    ],
                    ProductExtraMaxSelect: product.ProductExtraMaxSelect,
                    Extras: product.ExtraTitle ? [
                        {
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        }
                    ] : []
                })
            } else {
                let foundDuration = found.Durations.find(f => f.Duration === product.Duration);
                if (!foundDuration) {
                    found.Durations.push({
                        Duration: product.Duration,
                        Amount: product.Amount
                    })
                }
                let foundTranslation = found.Translations.find(f => f.LanguageId === product.LanguageId);
                if (!foundTranslation) {
                    found.Translations.push({
                        LanguageId: product.LanguageId,
                        Name: product.Name,
                        Description: product.Description
                    })
                }
                if (product.ExtraTitle) {
                    let foundExtra = found.Extras.find(f => f.ExtraValue === product.ExtraValue);
                    if (!foundExtra) {
                        found.Extras.push({
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        })
                    }
                }
            }
        });
        finalProduct.forEach(product => {
            let durations = product.Durations.sort((a, b) => {
                return a.Duration - b.Duration
            })
            product.Durations = durations;
        });
        return finalProduct;
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        }
    }
}

module.exports.productCMS = async (knex, categoryId, languageId, productId,isCategoryWise=false,organisationLocationId=null) => {
    try {
        let productData = await knex
            .select(
                PRODUCTS + '.ProductId',
                PRODUCTS + '.CategoryId',
                PRODUCTS + '.PreparationTime',
                PRODUCTS + '.ImagePath',
                PRODUCTS + '.ProductExtraMaxSelect',
                PRODUCTS + '.OrganisationLocationId',
                CATEGORIES + '.Name as Category',
                CATEGORIES+'.ColorCode',
                PRODUCT_TRANSLATIONS + '.LanguageId',
                PRODUCT_TRANSLATIONS + '.Name',
                PRODUCT_TRANSLATIONS + '.Description',
                PRODUCT_DURATIONS + '.Duration',
                PRODUCT_DURATIONS + '.Amount',
                PRODUCT_EXTRA + ".ExtraTitle",
                PRODUCT_EXTRA + ".ExtraValue",
                ORGANISATION_LOCATION + ".Name as OrganisationLocationName"
            )
            .from(PRODUCTS)
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', PRODUCTS + '.CategoryId')
            .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_EXTRA, PRODUCT_EXTRA + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(ORGANISATION_LOCATION, ORGANISATION_LOCATION + '.OrganisationLocationId', PRODUCTS + '.OrganisationLocationId')
            .where(PRODUCTS + '.Deleted', '=', DELETED)
            
            .modify((queryBuilder) => {
                if (productId) {
                    queryBuilder.where(PRODUCTS + ".ProductId", "=", productId)
                }
                if (categoryId) {
                    queryBuilder.andWhere(PRODUCTS + '.CategoryId', '=', categoryId)
                }
                if (languageId) {
                    queryBuilder.andWhere(PRODUCT_TRANSLATIONS + '.LanguageId', '=', languageId)
                }
                if(isCategoryWise){
                    queryBuilder.orderBy(PRODUCTS + '.CategoryId', "desc")
                    queryBuilder.orderBy(CATEGORIES + '.Name', "asc")
                }else{
                    if(organisationLocationId){
                        queryBuilder.orderBy(CATEGORIES + '.CurOrder', "asc")
                        queryBuilder.orderBy(PRODUCTS + '.CurOrder', "asc")
                    }else{
                        queryBuilder.orderBy(PRODUCTS + '.CurOrder', "asc")
                    }
                    
                }
                if (organisationLocationId) {
                    queryBuilder.andWhere(PRODUCTS + '.OrganisationLocationId', '=', organisationLocationId)
                }
            })

        let finalProduct = [];
        productData.forEach(product => {
            let found = finalProduct.find(pr => pr.ProductId === product.ProductId);
            if (!found) {
                finalProduct.push({
                    ProductId: product.ProductId,
                    Translations: [
                        {
                            LanguageId: product.LanguageId,
                            Name: product.Name,
                            Description: product.Description
                        }
                    ],
                    PreparationTime: product.PreparationTime,
                    CategoryId: product.CategoryId,
                    ColorCode:product.ColorCode,
                    Category: product.Category,
                    ImagePath: product.ImagePath,
                    Durations: [
                        {
                            Duration: product.Duration,
                            Amount: product.Amount
                        }
                    ],
                    ProductExtraMaxSelect: product.ProductExtraMaxSelect,
                    Extras: product.ExtraTitle ? [
                        {
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        }
                    ] : [],
                    OrganisationLocationId:product.OrganisationLocationId,
                    OrganisationLocationName:product.OrganisationLocationName
                })
            } else {
                let foundDuration = found.Durations.find(f => f.Duration === product.Duration);
                if (!foundDuration) {
                    found.Durations.push({
                        Duration: product.Duration,
                        Amount: product.Amount
                    })
                }
                let foundTranslation = found.Translations.find(f => f.LanguageId === product.LanguageId);
                if (!foundTranslation) {
                    found.Translations.push({
                        LanguageId: product.LanguageId,
                        Name: product.Name,
                        Description: product.Description
                    })
                }
                if (product.ExtraTitle) {
                    let foundExtra = found.Extras.find(f => f.ExtraValue === product.ExtraValue);
                    if (!foundExtra) {
                        found.Extras.push({
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        })
                    }
                }
            }
        });
        return finalProduct;
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        }
    }
}

module.exports.newProduct = async event => {
    let knex, connected = false, response = [];
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Translations ||
            typeof json.Translations !== "object" ||
            !json.PreparationTime ||
            !json.CategoryId ||
            !json.Durations ||
            typeof json.Durations !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        const translations = json.Translations;
        const durations = json.Durations;

        if (translations.length === 0 || durations.length === 0) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        translations.forEach(translate => {
            if (!translate.LanguageId || !translate.Name) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });

        durations.forEach(duration => {
            if (!duration.Duration || !duration.Amount) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });
        if (json.Extras) {
            json.Extras.forEach(extra => {
                if (!extra.ExtraTitle || !extra.ExtraValue) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            });
        }
        knex = require("knex")(con);
        connected = true;
        // Insert Product Detail to Product table
        let existGreatestCount = await knex(PRODUCTS)
            .select("CurOrder")
            .where("Deleted", "=", DELETED)
            .limit(1)
            .orderBy("CurOrder", "desc");
        const insertedProduct = await knex(PRODUCTS).insert({
            PreparationTime: json.PreparationTime,
            CategoryId: json.CategoryId,
            ImagePath: json.ImagePath ? json.ImagePath : null,
            CurOrder: existGreatestCount[0].CurOrder + 1,
            ProductExtraMaxSelect: json.ProductExtraMaxSelect ? json.ProductExtraMaxSelect : 1,
            OrganisationLocationId: json.OrganisationLocationId ? json.OrganisationLocationId : null,
            ...zone.getCreateUpdate(),
        })
        if (insertedProduct.length <= 0) {
            throw new Error(MESSAGE.PRODUCT_CREATE_FAILED);
        }
        const productId = insertedProduct[0];   //now we have ProductId of inserted product

        // Insert Translations data for new product
        for (let i = 0; i < translations.length; i++) {
            const translate = translations[i];
            let inserted = await knex(PRODUCT_TRANSLATIONS).insert({
                ProductId: productId,
                LanguageId: translate.LanguageId,
                Name: translate.Name,
                Description: translate.Description ? translate.Description : null,
                ...zone.getCreateUpdate()
            })
            if (inserted.length <= 0) {
                throw new Error(MESSAGE.PRODUCT_CREATE_SWW);
            }
        }

        // Insert Durations data for new product
        for (let i = 0; i < durations.length; i++) {
            const duration = durations[i];
            let inserted = await knex(PRODUCT_DURATIONS).insert({
                ProductId: productId,
                Duration: duration.Duration,
                Amount: duration.Amount,
                ...zone.getCreateUpdate()
            })
            if (inserted.length <= 0) {
                throw new Error(MESSAGE.PRODUCT_CREATE_SWW);
            }
        }

        // Insert Extras if any
        if (json.Extras && json.Extras.length > 0) {
            for (let extInc = 0; extInc < json.Extras.length; extInc++) {
                const extra = json.Extras[extInc];
                let extraInserted = await knex(PRODUCT_EXTRA).insert({
                    ProductId: productId,
                    ExtraTitle: extra.ExtraTitle,
                    ExtraValue: extra.ExtraValue,
                    ...zone.getCreateUpdate()
                })
            }
        }
        // Fetch product list
        response = await this.productCMS(knex, null, null);
        // create log for create
        await saveLog(knex,json.AdminId,PRODUCTS,productId,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
    } catch (err) {
        console.log(err);
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
            Message: MESSAGE.PRODUCT_SAVE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: response
        })
    }
}

module.exports.getProduct = async event => {
    try {
        var json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        var langId = null;
        if (json && json.LanguageId) {
            langId = json.LanguageId;
        }
        var organisationLocationId=(json.OrganisationLocationId)?json.OrganisationLocationId:null
        var knex = require("knex")(con);
        var Data = await this.productCMS(knex, null, langId,null,null,organisationLocationId);
        if (Data.Error) {
            throw new Error(Data.Error);
        }
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
            Message: MESSAGE.PRODUCT_FETCH_SUCCESS
        },
        body: setPayloadData(event,{
            Data
        })
    }
}

module.exports.updateProduct = async event => {
    let knex, connected = false, response = [];
    try {
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.ProductId ||
            !json.PreparationTime ||
            !json.CategoryId ||
            !json.Translations ||
            typeof json.Translations !== "object" ||
            !json.Durations ||
            typeof json.Durations !== "object"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        const translations = json.Translations;
        const durations = json.Durations;
        if (translations.length === 0) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        translations.forEach(translate => {
            if (!translate.LanguageId || !translate.Name) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });
        durations.forEach(duration => {
            if (!duration.Duration || !duration.Amount) {
                throw new Error(MESSAGE.REQ_DATA_ERROR);
            }
        });
        if (json.Extras) {
            json.Extras.forEach(extra => {
                if (!extra.ExtraTitle || !extra.ExtraValue) {
                    throw new Error(MESSAGE.REQ_DATA_ERROR);
                }
            });
        }
        knex = require('knex')(con);
        connected = true;
        const productExist = await this.product(knex, null, null, json.ProductId);
        var lanNeutProdData = productExist[0];
        if (productExist.length <= 0) {
            throw new Error(MESSAGE.PRODUCT_NOT_AVAILABLE);
        }
        var updateProd = {};
        // Check and update language neutral Product Data
        if (json.PreparationTime) {
            if (json.PreparationTime !== lanNeutProdData.PreparationTime) {
                updateProd.PreparationTime = json.PreparationTime;
            }
        }
        if (json.CategoryId) {
            if (json.CategoryId !== lanNeutProdData.CategoryId) {
                updateProd.CategoryId = json.CategoryId;
            }
        }
        if (json.ImagePath && typeof json.ImagePath === 'string' && json.ImagePath.trim() !== "") {
            if (json.ImagePath !== lanNeutProdData.ImagePath) {
                updateProd.ImagePath = json.ImagePath;
            }
        }
        if (json.ProductExtraMaxSelect) {
            updateProd.ProductExtraMaxSelect = json.ProductExtraMaxSelect;
        }
        if (json.OrganisationLocationId) {
            updateProd.OrganisationLocationId = json.OrganisationLocationId;
        }else{
            updateProd.OrganisationLocationId = null;
        }

        if (Object.keys(updateProd).length !== 0 && updateProd.constructor === Object) {
            updateProd.LastUpdated = zone.getLastUpdate();
            var productNeutUpdated = await knex(PRODUCTS).where("ProductId", "=", json.ProductId).update(updateProd);
            if (!productNeutUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.PRODUCT_UPDATE_FAILED);
            }
        }
        var translationsExist = [];
        productExist[0].Translations.forEach(element => {
            translationsExist.push({ ...element });
        });
        // Update translations data
        for (let trans = 0; trans < translationsExist.length; trans++) {
            const translate = translationsExist[trans];
            var found = translations.find(f => f.LanguageId === translate.LanguageId);
            if (found) {
                var updateObj = {};
                if (found.Name && typeof found.Name === 'string' && found.Name.trim() !== "") {
                    if (found.Name !== translate.Name) {
                        updateObj.Name = found.Name;
                    }
                }
                if (found.Description && typeof found.Description === 'string' && found.Description.trim() !== "") {
                    if (found.Description !== translate.Description) {
                        updateObj.Description = found.Description;
                    }
                }
                if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
                    updateObj.LastUpdated = zone.getLastUpdate();
                    var transUpdated = await knex(PRODUCT_TRANSLATIONS)
                        .where("ProductId", "=", json.ProductId)
                        .andWhere("LanguageId", "=", translate.LanguageId)
                        .update(updateObj);
                    if (!transUpdated) {
                        await knex.destroy();
                        throw new Error(MESSAGE.PRODUCT_UPDATE_FAILED);
                    }
                }
            }
        }

        // Duration handling        
        var updatedDurations = [];
        var deletedDurations = [];
        productExist[0].Durations.forEach(element => {
            const found = json.Durations.find(f => f.Duration === element.Duration);
            if (!found) {
                deletedDurations.push(element.Duration);
            } else {
                if (found.Amount !== element.Amount) {
                    updatedDurations.push(found);
                }
            }
        });
        var newDurations = [];
        json.Durations.forEach(element => {
            const found = productExist[0].Durations.find(f => f.Duration === element.Duration);
            if (!found) {
                newDurations.push(element);
            }
        });
        // first update durations where amount is changed
        for (let upDurInc = 0; upDurInc < updatedDurations.length; upDurInc++) {
            const element = updatedDurations[upDurInc];
            var updated = await knex(PRODUCT_DURATIONS)
                .where("ProductId", "=", json.ProductId)
                .andWhere("Duration", "=", element.Duration)
                .update({
                    Amount: element.Amount,
                    LastUpdated: zone.getLastUpdate()
                })
            if (!updated) {
                throw new Error(MESSAGE.PRODUCT_UPDATE_SWW);
            }
        }
        // insert new durations
        for (let newDurInc = 0; newDurInc < newDurations.length; newDurInc++) {
            const element = newDurations[newDurInc];
            var inserted = await knex(PRODUCT_DURATIONS)
                .insert({
                    ProductId: json.ProductId,
                    Duration: element.Duration,
                    Amount: element.Amount,
                    ...zone.getCreateUpdate()
                })
            if (inserted.length <= 0) {
                throw new Error(MESSAGE.PRODUCT_UPDATE_SWW);
            }
        }
        // delete durations
        for (let delDurInc = 0; delDurInc < deletedDurations.length; delDurInc++) {
            const element = deletedDurations[delDurInc];
            var deleted = await knex(PRODUCT_DURATIONS)
                .where("ProductId", "=", json.ProductId)
                .andWhere("Duration", "=", element)
                .delete();
            if (!deleted) {
                throw new Error(MESSAGE.PRODUCT_UPDATE_SWW);
            }
        }

        // Extras handling - find existing extras & insert updated ones.
        let existDeleted = await knex(PRODUCT_EXTRA)
            .where("ProductId", "=", json.ProductId)
            .del();
        if (json.Extras && json.Extras.length > 0) {
            for (let extInc = 0; extInc < json.Extras.length; extInc++) {
                const extra = json.Extras[extInc];
                let extraInserted = await knex(PRODUCT_EXTRA).insert({
                    ProductId: json.ProductId,
                    ExtraTitle: extra.ExtraTitle,
                    ExtraValue: extra.ExtraValue,
                    ...zone.getCreateUpdate()
                })
            }
        }

        response = await this.productCMS(knex, null, null);

        // create log for update
        await saveLog(knex,json.AdminId,PRODUCTS,json.ProductId,LOG_ACTION_TYPE.UPDATE)

        await knex.destroy();
    } catch (err) {
        console.log(err);
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
            Message: MESSAGE.PRODUCT_UPDATE_SUCCESS,
        },
        body: setPayloadData(event,{
            Data: response
        })
    }
}

module.exports.deleteProduct = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.DeleteProduct ||
            typeof json.DeleteProduct !== 'object' ||
            json.DeleteProduct.length <= 0
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        const archived = await knex(PRODUCTS).whereIn("ProductId", json.DeleteProduct)
            .update({
                Deleted: 1,
                CurOrder: 0,
                LastUpdated: zone.getLastUpdate()
            })
        if (!archived) {
            throw new Error(MESSAGE.PRODUCT_DELETE_FAILED);
        }

        // Remove the product staff relation
        let emptyDeleted = await knex(STAFF_PRODUCT)
                .whereIn("ProductId", json.DeleteProduct)
                .del();

        var productData = await this.productCMS(knex, null, null, null)
        if (productData.Error) {
            throw new Error(productData.Error);
        }

        
          // Save log for delete
          for (let inc = 0; inc < json.DeleteProduct.length; inc++) {
            await saveLog(knex,json.AdminId,PRODUCTS,json.DeleteProduct[inc],LOG_ACTION_TYPE.DELETE)
        }

        await knex.destroy();
    } catch (err) {
        console.log(err);
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
            Message: MESSAGE.PRODUCT_DELETE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: productData
        })
    }
}

module.exports.allProduct = async (knex, languageId, productId,excludeOrgProd) => {
    try {
        let productData = await knex
            .select(
                PRODUCTS + '.ProductId',
                PRODUCTS + '.CategoryId',
                PRODUCTS + '.PreparationTime',
                PRODUCTS + '.ImagePath',
                PRODUCTS + '.ProductExtraMaxSelect',
                CATEGORIES + '.Name as Category',
                PRODUCT_TRANSLATIONS + '.LanguageId',
                PRODUCT_TRANSLATIONS + '.Name',
                PRODUCT_TRANSLATIONS + '.Description',
                PRODUCT_DURATIONS + '.Duration',
                PRODUCT_DURATIONS + '.Amount',
                PRODUCT_EXTRA + ".ExtraTitle",
                PRODUCT_EXTRA + ".ExtraValue"
            )
            .from(PRODUCTS)
            .leftJoin(CATEGORIES, CATEGORIES + '.CategoryId', PRODUCTS + '.CategoryId')
            .leftJoin(PRODUCT_TRANSLATIONS, PRODUCT_TRANSLATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_DURATIONS, PRODUCT_DURATIONS + '.ProductId', PRODUCTS + '.ProductId')
            .leftJoin(PRODUCT_EXTRA, PRODUCT_EXTRA + '.ProductId', PRODUCTS + '.ProductId')
            .where(PRODUCTS + '.Deleted', '=', DELETED)
            .orderBy(PRODUCTS + ".CurOrder", "asc")
            .modify((queryBuilder) => {
                if (productId) {
                    queryBuilder.where(PRODUCTS + ".ProductId", "=", productId)
                }
                if (languageId) {
                    queryBuilder.andWhere(PRODUCT_TRANSLATIONS + '.LanguageId', '=', languageId)
                }
                if (excludeOrgProd) {
                    queryBuilder.whereNull(PRODUCTS + ".OrganisationLocationId")
                }
            })

        let finalProduct = [];
        productData.forEach(product => {
            let found = finalProduct.find(pr => pr.ProductId === product.ProductId);
            if (!found) {
                let imageURL = null;
                if (product.ImagePath) {
                    imageURL = process.env.BUCKET_URL + product.ImagePath;
                }
                finalProduct.push({
                    ProductId: product.ProductId,
                    Translations: [
                        {
                            LanguageId: product.LanguageId,
                            Name: product.Name,
                            Description: product.Description
                        }
                    ],
                    PreparationTime: product.PreparationTime,
                    CategoryId: product.CategoryId,
                    Category: product.Category,
                    ImagePath: product.ImagePath,
                    ImageURL: imageURL,
                    Durations: [
                        {
                            Duration: product.Duration,
                            Amount: product.Amount
                        }
                    ],
                    ProductExtraMaxSelect: product.ProductExtraMaxSelect,
                    Extras: product.ExtraTitle ? [
                        {
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        }
                    ] : []
                })
            } else {
                let foundDuration = found.Durations.find(f => f.Duration === product.Duration);
                if (!foundDuration) {
                    found.Durations.push({
                        Duration: product.Duration,
                        Amount: product.Amount
                    })
                }
                let foundTranslation = found.Translations.find(f => f.LanguageId === product.LanguageId);
                if (!foundTranslation) {
                    found.Translations.push({
                        LanguageId: product.LanguageId,
                        Name: product.Name,
                        Description: product.Description
                    })
                }
                if (product.ExtraTitle) {
                    let foundExtra = found.Extras.find(f => f.ExtraValue === product.ExtraValue);
                    if (!foundExtra) {
                        found.Extras.push({
                            ExtraTitle: product.ExtraTitle,
                            ExtraValue: product.ExtraValue
                        })
                    }
                }
            }
        });
        finalProduct.forEach(product => {
            let durations = product.Durations.sort((a, b) => {
                return a.Duration - b.Duration
            })
            product.Durations = durations;
        });
        return finalProduct;
    } catch (error) {
        console.log(error);
        return {
            Error: error.message
        }
    }
}
module.exports.updateProductOrganisation = async event => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.ProductId ||
            typeof json.ProductId !== 'object' ||
            json.ProductId.length <= 0||
            !json.OrganisationLocationId ||
            typeof json.OrganisationLocationId !== 'number'
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }
        var knex = require("knex")(con);
        connected = true;
        const updated = await knex(PRODUCTS).whereIn("ProductId", json.ProductId)
            .update({
                OrganisationLocationId: json.OrganisationLocationId,
                LastUpdated: zone.getLastUpdate()
            })
        if (!updated) {
            throw new Error(MESSAGE.PRODUCT_UPDATE_FAILED);
        }

    
        await knex.destroy();
    } catch (err) {
        console.log(err);
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
            Message: MESSAGE.PRODUCT_UPDATE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: []
        })
    }
}