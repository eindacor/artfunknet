ItemIF = function(item) {
    var item_object;
    var item_id;
    var made_from_object = (typeof item !== "string");

    try {
        item_object = made_from_object ? item : getOneFromCollection("ItemIF.js:ItemIF - " + item, items, item);
        item_id = item_object._id;
    }

    catch(error) {
        throw "invalid item: " + item;
    }

    this.wasMadeFromObject = function() {
        return made_from_object;
    }

    this.isStandard = function() {
        if (item_object.seasonal)
            return false;

        if (item_object.lottery > 0)
            return false;

        if (item_object.foil)
            return false;

        if (item_object.unlocked)
            return false;

        if (item_object.vintage)
            return false;

        if (item_object.original)
            return false;
        
        return true;
    }

    this.isFoil = function() {
        return item_object.foil;
    }

    this.isUnlocked = function() {
        return item_object.unlocked;
    }

    this.isLottery = function() {
        return item_object.lottery > 0;
    }

    this.isSeasonal = function() {
        return item_object.seasonal;
    }

    this.isLegendaryOrBetter = function() {
        return item_object.artwork_data.rarity == "legendary" || item_object.artwork_data.rarity == "masterpiece";
    }

    this.isOriginal = function() {
        return item_object.original;
    }

    this.isVintage = function() {
        return item_object.vintage;
    }

    this.isPermanent = function() {
        return item_object.permanent;
    }

    this.isDisplaced = function() {
        return item_object.displaced;
    }

    this.isForgery = function() {
        return item_object.authenticity && item_object.authenticity.forgery;
    }

    this.isIdentified = function() {
        return item_object.authenticity && item_object.authenticity.identified;
    }

    this.isIdentifiedForgery = function() {
        return item_object.authenticity && item_object.authenticity.forgery && item_object.authenticity.identified;
    }

    this.getTypes = function() {
        var item_types = [];

        if (this.isFoil())
            item_types.push("foil");

        if (this.isSeasonal())
            item_types.push("seasonal");

        if (this.isLottery())
            item_types.push("lottery");

        if (this.isUnlocked())
            item_types.push("unlocked");

        if (this.isLegendaryOrBetter())
            item_types.push("legendary");

        if (this.isOriginal())
            item_types.push("original");

        if (this.isVintage())
            item_types.push("vintage");

        if (item_types.length == 0)
            item_types.push("standard");

        return item_types;
    }

    this.getRarity = function() {
        return item_object.artwork_data.rarity;
    }

    this.getArtworkId = function() {
        return item_object.artwork_id;
    }

    this.getOwnerId = function() {
        return item_object.owner;
    }

    this.getCondition = function() {
        return item_object.condition;
    }

    this.getStatus = function() {
        return item_object.status;
    }

    this.getId = function() {
        return item_object._id;
    }

    this.getAttributes = function() {
        return item_object.attributes;
    }

    this.getItemObject = function() {
        return item_object;
    }

    this.getArtworkObject = function() {
        return getOneFromCollection("ItemIF.js:getArtworkObject()", artworks, item_object.artwork_id);
    }

    this.getUnitValue = function() {
        var rarity_index = artwork_rarities.indexOf(item_object.artwork_data.rarity);
        var upgrade_rarity_coefficient = 1.1;
        var rarity_multiplier = Math.pow(upgrade_rarity_coefficient, rarity_index)
        var upgrade_level_coefficient = 1.4;
        var level_multiplier = Math.pow(upgrade_level_coefficient, item_object.level - 1)
        
        var unit_value = Math.floor(Math.pow(KNOWLEDGE_UNIT, rarity_index + 1) * rarity_multiplier * level_multiplier);

        return unit_value;
    }

    this.getUpgradeCost = function() {
        var total_unit_cost = this.getUnitValue() * 3;
        var player_interface = new PlayerIF(Meteor.user());

        if (item_object.condition > .8 && player_interface.procUniqueAttribute("LEVEL_UP_COST_REDUCTION", "Preservationist")) {
            total_unit_cost = Math.floor(total_unit_cost * .8);
        }

        return convertUnitValueToKnowledge(total_unit_cost);
    }

    this.getDonationReward = function() { 
        var random_modifier = 1 + ((.5 - Math.random()) * .2);
        var total_unit_cost = Math.floor(this.getUnitValue() * random_modifier);
        return convertUnitValueToKnowledge(total_unit_cost);
    }

    this.getLevel = function() {
        return item_object.level;
    } 

    //TODO add options
    this.updateItem = function(modifier, suppress_gallery_update, callback) {
        items.update(item_id, modifier, function(error) {
            if (error)
                console.log("updateItem: " + error.message);

            else {
                var nested_item_object = items.findOne(item_id);
                var reroll_cost = getItemObjectRollCost(nested_item_object);
                var newItemObjectValues = getItemObjectValues(nested_item_object);

                if (suppress_gallery_update) {
                    items.update(item_id, {$set: {'values': newItemObjectValues, 'reroll_cost': reroll_cost}}, callback);
                }

                else {
                    var player_interface = new PlayerIF(nested_item_object.owner);
                    items.update(item_id, {$set: {'values': newItemObjectValues, 'reroll_cost': reroll_cost}}, player_interface.updateGalleryDetails(callback));
                }
            }
        })
    }

    this.getArchiveCategories = function() {
        var archive_categories = [];
        if (this.isFoil()) {
            archive_categories.push("foil");
        }

        if (this.isUnlocked()) {
            archive_categories.push("unlocked");
        }

        if (this.isSeasonal()) {
            archive_categories.push("seasonal");
        }

        if (this.isLottery()) {
            archive_categories.push("lottery");
        }

        if (this.isVintage()) {
            archive_categories.push("vintage");
        }

        if (archive_categories.length == 0) {
            archive_categories.push("standard");
        }

        return archive_categories;
    }

    this.getArchiveSignature = function() {
        var archive_signature = "";
        if (this.isFoil()) {
            archive_signature += 'f';
        }

        if (this.isUnlocked()) {
            archive_signature += 'u';
        }

        if (this.isSeasonal()) {
            archive_signature += 's';
        }

        if (this.isLottery()) {
            archive_signature += 'l';
        }

        if (this.isVintage()) {
            archive_signature += 'v';
        }

        if (archive_signature.length == 0) {
            archive_signature = "standard";
        }

        return archive_signature;
    }

    this.punishLiable = function() {
        if (item_object.owner == item_object.authenticity.liable) {
            return false;
        }

        if (item_object.authenticity.liable == BOT_USER_NAME) {
            return false;
        }

        var liable_player_interface = new PlayerIF(item_object.authenticity.liable);
        var money_penalty = Math.floor(this.getItemObject().authenticity.fee);
        liable_player_interface.chargeAccount(money_penalty);
        liable_player_interface.increaseVisitorIgnorePenalty(this);
        var message = "The forgery you sold, " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + ", has been identified. You have been charged $" + getCommaSeparatedValue(money_penalty) + " and have temporarily lost reputation.";
        alertPlayers(liable_player_interface.getId(), message, 'fa-user-secret', 'bad');
    }
    
    this.punishForFalseForgeryRedemption = function() {
        var owner_interface = new PlayerIF(item_object.owner);
        owner_interface.increaseVisitorIgnorePenalty(this);

        var message = "You have falsely identified " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + " as a forgery, and temporarily lost reputation.";
        alertPlayers(owner_interface.getId(), message, 'fa-user-secret', 'bad');
    }

    this.punishForgeryOwner = function(owner_interface) {
        if (owner_interface == undefined) {
            owner_interface = new PlayerIF(item_object.owner);
        }

        owner_interface.increaseVisitorIgnorePenalty(this);

        var quality_min = .1;
        var quality_reduction = .1;

        var new_quality = Math.max(item_object.authenticity.forgery_quality - quality_reduction, quality_min);

        this.updateItem(
            {
                $set: {
                    'status': 'claimed', 
                    'authenticity.liability_pending': false, 
                    'authenticity.liable': owner_interface.getId(), 
                    'authenticity.identified': true,
                    'authenticity.forgery_quality': new_quality
                }
            }, false
        );

        var message = "Your forgery, " + item_object.artwork_data.title + " by " + item_object.artwork_data.artist + ", has been identified. You have temporarily lost reputation.";
        alertPlayers(owner_interface.getId(), message, 'fa-user-secret', 'bad');
    }
}