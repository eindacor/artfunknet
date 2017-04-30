itemWrapper = function(item_id) {
    this.item_object = items.findOne(item_id);

    if (this.item_object == undefined)
        throw "invalid item: " + item_id;

    this.itemIsStandard = function() {
        if (this.item_object.seasonal)
            return false;

        if (this.item_object.lottery > 0)
            return false;

        if (this.item_object.foil)
            return false;

        if (this.item_object.unlocked)
            return false;

        if (this.item_object.vintage)
            return false;

        if (this.item_object.original)
            return false;
        
        return true;
    }

    this.itemIsFoil = function() {
        return this.item_object.foil;
    }

    this.itemIsUnlocked = function() {
        return this.item_object.unlocked;
    }

    this.itemIsLottery = function() {
        return this.item_object.lottery > 0;
    }

    this.itemIsSeasonal = function() {
        return this.item_object.seasonal;
    }

    this.itemIsLegendaryOrBetter = function() {
        return this.item_object.artwork_data.rarity == "legendary" || this.item_object.artwork_data.rarity == "masterpiece";
    }

    this.itemIsOriginal = function() {
        return this.item_object.original;
    }

    this.itemIsVintage = function() {
        return this.item_object.vintage;
    }

    this.getTypes = function() {
        var item_types = [];

        if (this.itemIsFoil())
            item_types.push("foil");

        if (this.itemIsSeasonal())
            item_types.push("seasonal");

        if (this.itemIsLottery())
            item_types.push("lottery");

        if (this.itemIsUnlocked())
            item_types.push("unlocked");

        if (this.itemIsLegendaryOrBetter())
            item_types.push("legendary");

        if (this.itemIsOriginal())
            item_types.push("original");

        if (this.itemIsVintage())
            item_types.push("vintage");

        if (item_types.length == 0)
            item_types.push("standard");

        return item_types;
    }

    this.getRarity = function() {
        return this.item_object.artwork_data.rarity;
    }

    this.getArtworkId = function() {
        return this.item_object.artwork_id;
    }
}