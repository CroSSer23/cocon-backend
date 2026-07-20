const { Headers } = require("../header");
const { con } = require("../db.js");
const { FAQ, SECTION, FAQ_SECTION } = require("../tables");
const zone = require("../zone");
const { MESSAGE } = require("../strings");
const { getPayloadData, setPayloadData } = require("../util");
const TYPE_USER = 0;
const TYPE_THERAPIST = 1;
const TYPE_ORGANISATION = 2;
const { saveLog, } = require("../helpers/common.js");
const {LOG_ACTION_TYPE } = require("../enum");


const faq = async (knex, faqId, apiClient,isOrgLogin) => {
    try {
        
        let faqData = await knex(FAQ)
            .select(
                FAQ + ".FaqId",
                FAQ + ".Question",
                FAQ + ".Answer",
                FAQ + ".Type",
                FAQ_SECTION + ".SectionId",
                SECTION + ".Name as SectionName",
            )
            .from(FAQ)
            .leftJoin(FAQ_SECTION, FAQ_SECTION + ".FaqId", FAQ + ".FaqId")
            .leftJoin(SECTION, SECTION + ".SectionId", FAQ_SECTION + ".SectionId")
            .orderBy(FAQ + ".CurOrder", "asc")
            .modify(qb => {
                if (faqId) {
                    qb.where(FAQ + ".FaqId", "=", faqId)
                }
                if (apiClient === process.env.API_CLIENT_COCON_THERAPIST) {
                    qb.where(FAQ + ".Type", "=", TYPE_THERAPIST)
                } else if (apiClient === process.env.API_CLIENT_COCON_APP) {
                    qb.where(FAQ + ".Type", "=", TYPE_USER)
                }
                if(isOrgLogin){
                    qb.where(FAQ + ".Type", "=", TYPE_ORGANISATION)
                }
            });
        let finalData = [];
        faqData.forEach(faq => {
            const found = finalData.find(f => f.FaqId === faq.FaqId);
            if (!found) {
                finalData.push({
                    FaqId: faq.FaqId,
                    Question: faq.Question,
                    Answer: faq.Answer,
                    Type: faq.Type,
                    Sections: [
                        faq.SectionName
                    ],
                    SectionData: [
                        {
                            SectionId: faq.SectionId,
                            SectionName: faq.SectionName
                        }
                    ]
                })
            } else {
                found.SectionData.push({
                    SectionId: faq.SectionId,
                    SectionName: faq.SectionName
                })
                found.Sections.push(faq.SectionName);
            }
        })
        console.log("final",finalData)
        return finalData;
    } catch (error) {
        return {
            Error: error.message
        }
    }
}

module.exports.getFAQ = async (event) => {
    try {
        const knex = require("knex")(con);
        const json = event.body ? getPayloadData(event) : null;
        if(json && json.isOrgLogin){
            var faqData = await faq(knex, null, event.headers['api-client'],true);
        }else{
            var faqData = await faq(knex, null, event.headers['api-client']);
        }
       
        if (faqData.Error) {
            await knex.destroy();
            throw new Error(faqData.Error);
        }
        await knex.destroy();
    } catch (error) {
        console.log(error)
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
            message: MESSAGE.FAQ_FETCH_SUCCESS
        },
        body: setPayloadData(event,{
            Data: faqData
        })
    }
}

module.exports.newFAQ = async (event) => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.Question || typeof json.Question !== "string" ||
            !json.Answer || typeof json.Answer !== "string" ||
            !json.Sections || typeof json.Sections !== "object" ||
            typeof json.Type !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        // save Faq Data 
        var knex = require("knex")(con);
        connected = true;

        let existGreatestCount = await knex(FAQ)
            .select("CurOrder")
            .limit(1)
            .orderBy("CurOrder", "desc");

        // save Faq table data
        const insertedFAQ = await knex(FAQ).insert({
            Question: json.Question,
            Answer: json.Answer,
            Type: json.Type,
            CurOrder: existGreatestCount[0].CurOrder + 1,
            ...zone.getCreateUpdate()
        })
        const faqId = insertedFAQ[0];

        let faqSections = [];
        json.Sections.forEach(element => {
            faqSections.push({
                FaqId: faqId,
                SectionId: element,
                ...zone.getCreateUpdate()
            });
        });
        // save section data
        const insertSections = await knex(FAQ_SECTION)
            .insert(faqSections);

        
        if(json.isOrgLogin){
            var finalData = await faq(knex, null,null,true);
        }else{
            var finalData = await faq(knex, null);
        }
        if (finalData.Error) {
            throw new Error(finalData.Error)
        }
        // create log for create
        await saveLog(knex,json.AdminId,FAQ,faqId,LOG_ACTION_TYPE.CREATE)

        await knex.destroy();
    } catch (error) {
        console.log(error)
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
            message: MESSAGE.FAQ_SAVE_SUCCESS
        },
        body: setPayloadData(event,{
            Data: finalData
        })
    }
}

module.exports.updateFAQ = async (event) => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (
            !json ||
            !json.FaqId || typeof json.FaqId !== "number" ||
            !json.Question || typeof json.Question !== "string" ||
            !json.Answer || typeof json.Answer !== "string" ||
            !json.Sections || typeof json.Sections !== "object" ||
            typeof json.Type !== "number"
        ) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require("knex")(con);
        connected = true;

        const existFAQs = await faq(knex, json.FaqId);
        const existFaq = existFAQs[0];

        let updateObj = {};
        if (json.Question !== existFaq.Question) {
            updateObj.Question = json.Question;
        }
        if (json.Answer !== existFaq.Answer) {
            updateObj.Answer = json.Answer;
        }
        if (json.Type !== existFaq.Type) {
            updateObj.Type = json.Type;
        }

        // If update obj has some data then update the same in table.
        if (Object.keys(updateObj).length !== 0 && updateObj.constructor === Object) {
            updateObj.LastUpdated = zone.getLastUpdate();
            let faqUpdated = await knex(FAQ).where("FaqId", "=", json.FaqId).update(updateObj);
            if (!faqUpdated) {
                await knex.destroy();
                throw new Error(MESSAGE.UPDATE_FAQ_FAILED);
            }
        }

        let deletedSections = [];
        existFaq.SectionData.forEach(sec => {
            const found = json.Sections.find(f => f === sec.SectionId);
            if (!found) {
                deletedSections.push(sec.SectionId);
            }
        });
        let newSections = [];
        json.Sections.forEach(sec => {
            const found = existFaq.SectionData.find(f => f.SectionId === sec);
            if (!found) {
                newSections.push({
                    FaqId: json.FaqId,
                    SectionId: sec,
                    ...zone.getCreateUpdate()
                });
            }
        });

        if (newSections.length > 0) {
            let faqSectionInserted = await knex(FAQ_SECTION).insert(newSections);
            if (faqSectionInserted.length <= 0) {
                throw new Error(MESSAGE.UPDATE_FAQ_SECTION_FAILED);
            }
        }
        if (deletedSections.length > 0) {
            for (let sec = 0; sec < deletedSections.length; sec++) {
                const section = deletedSections[sec];
                let oldSecDeleted = await knex(FAQ_SECTION)
                    .where("FaqId", "=", json.FaqId)
                    .andWhere("SectionId", "=", section)
                    .del();
                if (!oldSecDeleted) {
                    throw new Error(MESSAGE.UPDATE_FAQ_SECTION_FAILED);
                }
            }
        }
        if(json.isOrgLogin){
            var finalData = await faq(knex, null,null,true);
        }else{
            var finalData = await faq(knex, null);
        }
       

        // create log for update
        await saveLog(knex,json.AdminId,FAQ,json.FaqId,LOG_ACTION_TYPE.UPDATE) 

        await knex.destroy();
    } catch (error) {
        console.log(error)
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
            message: MESSAGE.UPDATE_FAQ_SUCCESS
        },
        body: setPayloadData(event,{
            Data: finalData
        })
    }
}

module.exports.deleteFAQ = async (event) => {
    try {
        var connected = false;
        const json = event.body ? getPayloadData(event) : null;
        // console.log(JSON.stringify({
        //     json
        // }, null, 2));
        if (!json || !json.DeleteFaq) {
            throw new Error(MESSAGE.REQ_DATA_ERROR);
        }

        var knex = require("knex")(con);
        connected = true;

        let faqDeleted = await knex(FAQ).whereIn("FaqId", json.DeleteFaq).del();
        let faqSecDel = await knex(FAQ_SECTION).whereIn("FaqId", json.DeleteFaq).del();

        if(json.isOrgLogin){
            var finalData = await faq(knex, null,null,true);
        }else{
            var finalData = await faq(knex, null);
        }

       

         // Save log for delete
         for (let inc = 0; inc < json.DeleteFaq.length; inc++) {
            await saveLog(knex,json.AdminId,FAQ,json.DeleteFaq[inc],LOG_ACTION_TYPE.DELETE)
        }
        await knex.destroy();
    } catch (error) {
        console.log(error)
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
            message: MESSAGE.DEL_FAQ_SUCCESS
        },
        body: setPayloadData(event,{
            Data: finalData
        })
    }
}