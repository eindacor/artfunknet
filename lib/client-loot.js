procUniqueAttribute = function(user_id, unique_code, required_npc_name, suppress_notification) {
    try {
        if (required_npc_name) {
            if (getOneFromCollection("client-loot.js", npcs, {'owner_id': user_id, 'npc_name': required_npc_name}) == undefined)
                return false;
        }

        var unique_id = getOneFromCollection("client-loot.js", unique_attributes, {'code': unique_code, 'active': true})._id;
        //TODO instead return an array of item interfaces for future UX indicators
        var proc = getOneFromCollection("clien-loot.js", galleries, {'owner_id': user_id, 'active_unique_attributes': {$in: [unique_id]}}) != undefined;
        if (DEBUG && proc) {
            console.log("proc: " + unique_code);
        }

        return proc;
    }

    catch (error) {
        console.log("could not proc " + unique_code + ": " + error.message);
        return false;
    }
}

getItemObjectValueByType = function(item_object, type, user_id) {
    if (item_object) {
        var base_value = item_object.values[type];

        if (type == "dealer" && procUniqueAttribute(user_id, "DEALER_DISCOUNT", undefined, true)) {
            base_value *= .75;
        }

        if (type == "sell") {
            if (quests.findOne({'owner_id': user_id, 'target': {$in: [item_object.artwork_id]}}) &&
                procUniqueAttribute(user_id, "QUEST_ITEM_SELL_BONUS", undefined, true)) {
                base_value *= 1.5;
            }

            if (item_object.status == "unclaimed" && 
                procUniqueAttribute(user_id, "UNCLAIMED_ITEM_SELL_BONUS", undefined, true)) {
                base_value *= 1.5;
            }
        }

        return Math.floor(base_value);
    }

    else {
        // console.log("undefined object...");
        // console.log("item_object: " + item_object);
        // console.log("type: " + type);
        return undefined;
    }
}