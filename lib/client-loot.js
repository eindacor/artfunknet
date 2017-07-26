getItemObjectValueByType = function(item_object, type, user_id) {
    if (item_object) {
        var player_interface;

        try {
            player_interface = new PlayerIF(user_id);
        }

        catch (error) {
            player_interface = undefined;
        }

        var base_value = item_object.values[type];

        if (player_interface && type == "dealer" && player_interface.procUniqueAttribute("DEALER_DISCOUNT", undefined)) {
            base_value *= .75;
        }

        if (player_interface && type == "sell") {
            if (quests.findOne({'owner_id': user_id, 'target': {$in: [item_object.artwork_id]}}) &&
                player_interface.procUniqueAttribute("QUEST_ITEM_SELL_BONUS", undefined)) {
                base_value *= 1.5;
            }

            if (item_object.status == "unclaimed" && 
                player_interface.procUniqueAttribute("UNCLAIMED_ITEM_SELL_BONUS", undefined)) {
                base_value *= 1.5;
            }
        }

        return Math.floor(base_value);
    }

    else {
        return undefined;
    }
}