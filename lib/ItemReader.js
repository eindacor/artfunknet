ItemReader = function(item_id) {
    var item_object = items.findOne(item_id);

    if (item_object == undefined)
        throw "invalid item: " + item_id;

    var artwork_object = artworks.findOne(item_object.artwork_id);

    if (artwork_object == undefined)
        throw "invalid artwork: " + item_object.artwork_id;

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

    this.getStatus = function() {
        return item_object.status;
    }

    this.getId = function() {
        return item_object._id;
    }

    this.getRerollCost = function() {
        var rarity_values = getLootData().rarity_values;

        var roll_count = item_object.roll_count < 0 ? 0 : item_object.roll_count;

        var rarity = this.getRarity();
        var reroll_coefficient = reroll_coefficients[rarity];
        var average_value = Math.floor((rarity_values[rarity].max + rarity_values[rarity].min) / 2);

        var reroll_cost = (rarity_values[rarity].min * .1) * Math.pow(reroll_coefficient, roll_count);

        return Math.floor(reroll_cost);
    }

    this.getAttributes = function() {
        return item_object.attributes;
    }

    this.getItemObject = function() {
        return item_object;
    }

    this.getArtworkObject = function() {
        return artwork_object;
    }

    this.getUpgradeCost = function() {
        var cost_object = this.getDonationReward();
        var keys = Object.keys(cost_object);
        for (var i=0; i<keys.length; i++) {
            cost_object[keys[i]] *= 4;
        }
        
        return cost_object;
    }

    this.getDonationReward = function() {
        var rarity_index = artwork_rarities.indexOf(artwork_object.rarity);
        var upgrade_rarity_coefficient = 2;
        var upgrade_level_coefficient = 1.2;
        var base_quantity = 1 * Math.pow(2, artwork_rarities.length - rarity_index);

        var knowledge_object = {};

        for (var i=0; i<=rarity_index; i++) {
            var rarity_multiplier = Math.pow(upgrade_rarity_coefficient, rarity_index - i);
            var level_multiplier = Math.pow(upgrade_level_coefficient, item_object.level);
            var amount = Math.floor(base_quantity * rarity_multiplier * level_multiplier);
            knowledge_object[knowledge_types[i]] = amount;
        }

        return knowledge_object;
    }

    this.getLevel = function() {
        return item_object.level;
    }
}

/*
    a: 20

    a: 40
    b: 20

    a: 60
    b: 40
    c: 20

    a: 80
    b: 60
    c: 40
    d: 20

    a: 100
    b: 80
    c: 60
    d: 40
    e: 20
*/