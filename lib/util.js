getDefaultProfileImageId = function() {
    try {
        return profilePhotos.findOne({"original.name": "other.png"})._id;
    } 

    catch(e) {
        //Return null if there was a problem getting the profile photo id instead of crashing
        console.log("util.js: " + e.message);
        return;
    }
}

setDefaultPhotos = function(){
    var fs = Npm.require('fs');

    try {
        var default_male = fs.readFileSync('./assets/app/male.png');

        var newFile = new FS.File();
        newFile.attachData(default_male, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('male.png');
            profilePhotos.insert(newFile);
        });

        var default_female = fs.readFileSync('./assets/app/female.png');

        newFile = new FS.File();
        newFile.attachData(default_female, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('female.png');
            profilePhotos.insert(newFile);
        });

        var default_other = fs.readFileSync('./assets/app/other.png');

        newFile = new FS.File();
        newFile.attachData(default_other, {type: 'image/png'}, function(error){
            //if(error) throw error;
            newFile.name('other.png');
            profilePhotos.insert(newFile);
        });

        var default_randy = fs.readFileSync('./assets/app/randy.jpg');

        newFile = new FS.File();
        newFile.attachData(default_randy, {type: 'image/jpg'}, function(error){
            //if(error) throw error;
            newFile.name('randy.jpg');
            profilePhotos.insert(newFile);
        });
    }

    catch(error) {
        console.log("default photo error: " + error.message);
    }
}

isAdmin = function(userId){
    return ((getUserType(userId) == "admin"));
}

getCommaSeparatedValue = function(value) {
    if (isNaN(value)) {
        return "";
    }

    else {
        var parts = value.toString().split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }
}

getMoneyValue = function(value) {
    if (value < 0) {
        var string_value = getCommaSeparatedValue(value);
        var new_string = string_value.slice(0, 1) + "$" + string_value.slice(1);
        return new_string;
    }
    
    else return "$" + getCommaSeparatedValue(value);
}

getCountdownString = function(milliseconds) {
    if (milliseconds < 0)
        return "expired";
    
    var hours = Math.floor(milliseconds / 3600000);
    var minutes = Math.floor((milliseconds - (hours * 3600000)) / 60000);
    var seconds = Math.floor((milliseconds - (minutes * 60000) - (hours * 3600000)) / 1000);

    var hours_string = (hours < 10 ? "0" + hours : hours.toString());
    var minutes_string = (minutes < 10 ? "0" + minutes : minutes.toString()); 
    var seconds_string = (seconds < 10 ? "0" + seconds : seconds.toString()); 
    return hours_string + ":" + minutes_string + ":" + seconds_string;
}

getTimeString = function(date_object) {
    try {
        var date = date_object._d;
        var date_string = ((date.getMonth()+1) + "/" + date.getDate() + "/" + date.getFullYear());
        var hours = (date.getHours() % 12 == 0 ? 12 : date.getHours() % 12);
        var minutes = (date.getMinutes() < 10 ? "0" +  date.getMinutes() : date.getMinutes());
        var am_pm = (date.getHours() > 11 ? "pm" : "am");
        date_string += (", " + hours + ":" + minutes + " " + am_pm);
        
        return date_string;
    }

    catch(error) {
        console.log(error.message);
        return "undefined";
    }
}

getAmountFromInput = function(amount_string) {
	var number_amount = Number(amount_string.replace(/[,$]/g, ""));
	if (isNaN(number_amount))
		return undefined;

	else return number_amount;
}

if (Meteor.isClient) {
    setFootnote = function(text, random_index) {
        Session.set('footnote_text', text);
        Session.set('footnote_index', random_index)
        Meteor.setTimeout((function() {
            if (Session.get('footnote_index') == random_index) {
                Session.set('footnote_text', undefined);
                Session.set('footnote_index', undefined)
            }
        }), 5000)
    };
}

commaSeparatedValuesToArray = function(to_convert) {
    if (to_convert == undefined || to_convert.length == 0)
        return [];

    if (to_convert.indexOf(',') == -1)
        return [to_convert];

    var string_array = [];
    var initial_array = to_convert.split(",").forEach(function(element) {
        var chopped = element;
        while (chopped[0] == " ") {
            chopped = chopped.slice(1);
        }

        while (chopped[chopped.length - 1] == " ") {
            chopped = chopped.slice(0, chopped.length - 1);
        }

        if (chopped.length > 0)
            string_array.push(chopped.toLowerCase());
    })

    return string_array;
}

rarityValueFromString = function(rarity_string) {
    switch(rarity_string) {
        case "common": return 0;
        case "uncommon": return 1;
        case "rare": return 2;
        case "legendary": return 3;
        case "masterpiece": return 4;
        default: return 0;
    }
}

getHTMLColorFromValue = function(value) {
    if (value === undefined)
        return "rgb(150, 150, 150)";

    var red_value = 255 - Math.floor(value * 255);
    var color_string = "rgb(" + red_value + " , 0, 0)";
    return color_string;
}

convertUnitValueToKnowledge = function(unit_cost) {
    var knowledge_object = {};

    for (var i=0; i<knowledge_types.length; i++) {
        var index = knowledge_types.length - i - 1;
        var tier_name = knowledge_types[index];
        
        var tier_cost = Math.floor(unit_cost / Math.pow(KNOWLEDGE_BASE, index));
        unit_cost = unit_cost - (Math.pow(KNOWLEDGE_BASE, index) * tier_cost);

        knowledge_object[tier_name] = tier_cost;      
    }

    return knowledge_object;
}

getRevisedKnowledgeMaxCraftable = function(crafted_type, knowledge_object) {
    var index = knowledge_types.indexOf(crafted_type);
    var crafted_up = 0;
    var revised_knowledge_object = {};
    for (var i=0; i<index; i++) {
        var tier_name = knowledge_types[i];
        var original_value = knowledge_object[tier_name];
        var crafted_value = original_value + crafted_up;
        crafted_up = Math.floor(crafted_value / KNOWLEDGE_CONVERSION_BASE);
        revised_knowledge_object[tier_name] = crafted_value % KNOWLEDGE_CONVERSION_BASE;
    }

    revised_knowledge_object[knowledge_types[index]] = knowledge_object[knowledge_types[index]] + crafted_up;
    
    return revised_knowledge_object;
}

getMaxCraftable = function(crafted_type, knowledge_object) {
    var index = knowledge_types.indexOf(crafted_type);
    var crafted_up = 0;
    for (var i=0; i<index; i++) {
        var tier_name = knowledge_types[i];
        var original_value = knowledge_object[tier_name];
        var crafted_value = original_value + crafted_up;
        crafted_up = Math.floor(crafted_value / KNOWLEDGE_CONVERSION_BASE);
    }

    return crafted_up;
}

getRevisedKnowledgeFromSubtier = function(crafted_type, knowledge_object) {
    var index = knowledge_types.indexOf(crafted_type);
    if (index == 0)
        return undefined;

    var available = knowledge_object[knowledge_types[index - 1]];
    var crafted_up = Math.floor(available / KNOWLEDGE_CONVERSION_BASE);
    var revised_knowledge_object = {};
    revised_knowledge_object[crafted_type] = knowledge_object[crafted_type] + crafted_up;
    revised_knowledge_object[knowledge_types[index - 1]] = available - KNOWLEDGE_CONVERSION_BASE * crafted_up;
    return revised_knowledge_object; 
}

getRevisedKnowledgeFromTargetValue = function(crafted_type, target, knowledge_object) {
    if (target > getMaxCraftable(crafted_type, knowledge_object))
        return undefined;

    var target_index = knowledge_types.indexOf(crafted_type);
    var units_required = target * Math.pow(KNOWLEDGE_CONVERSION_BASE, target_index);

    var revised_knowledge_object = {};
    for (var i=0; i<knowledge_types.length; i++) {
        var index = knowledge_types.length - i - 1;
        var tier_name = knowledge_types[index];
        if (index > target_index) {
            revised_knowledge_object[tier_name] = knowledge_object[tier_name];
            continue;
        }

        if (index == target_index) {
            revised_knowledge_object[tier_name] = knowledge_object[tier_name] + target;
            continue;
        }
  
        var units_in_this_tier = knowledge_object[tier_name] * Math.pow(KNOWLEDGE_CONVERSION_BASE, index);
        if (units_required >= units_in_this_tier) {
            revised_knowledge_object[tier_name] = 0;
            units_required -= units_in_this_tier;
        }

        else {
            revised_knowledge_object[tier_name] = knowledge_object[tier_name] - (Math.ceil(units_required / Math.pow(KNOWLEDGE_CONVERSION_BASE, index)));
            units_required = 0;
        }
    } 

    return revised_knowledge_object;
}

getMapOdds = function(map) {
    var keys = Object.keys(map);
    var total_count = 0;
    var odds_map = {};
    for (var i=0; i<keys.length; i++) {
        total_count += map[keys[i]];
    }

    for (var i=0; i<keys.length; i++) {
        odds_map[keys[i]] = (map[keys[i]] / total_count * 100).toFixed(8) + "%";
    }

    return odds_map;
}

getItemSignature = function(item_interface, include_rarity) {
    var types = "";

    if (include_rarity) {
        types += item_interface.getRarity() + " ";
    }

    if (item_interface.isUnlocked()) {
        types += "unlocked ";
    }

    if (item_interface.isFoil()) {
        types += "foil ";
    }

    if (item_interface.isSeasonal()) {
        types += "seasonal ";
    }

    if (item_interface.isLottery()) {
        types += "lottery ";
    }

    if (item_interface.isOriginal()) {
        types += "original ";
    }

    if (item_interface.isVintage()) {
        types += "vintage ";
    }

    return types;
}

getItemSignatureHTML = function(item_interface, include_rarity) {
    var $signature_p = $('<p></p>');

    if (include_rarity) {
        $signature_p.append($('<span class="' + item_interface.getRarity() + '">' + item_interface.getRarity() + ' </span>'));
    }

    if (item_interface.isUnlocked()) {
        $signature_p.append($('<span class="silver-text">unlocked </span>'));
    }

    if (item_interface.isFoil()) {
        $signature_p.append($('<span class="af-color">foil </span>'));
    }

    if (item_interface.isSeasonal()) {
        $signature_p.append($('<span class="green-text">seasonal </span>'));
    }

    if (item_interface.isLottery()) {
        $signature_p.append($('<span class="gold">lottery ' + item_interface.getItemObject().lottery + ' </span>'));
    }

    if (item_interface.isOriginal()) {
        $signature_p.append($('<span class="purple-text">original </span>'));
    }

    if (item_interface.isVintage()) {
        $signature_p.append($('<span class="vintage-text">vintage </span>'));
    }

    return $signature_p;
}

getNowISOString = function() {
    return moment()._d.toISOString();
}

getArtworkImageURLFromFilename = function(image_name, type, extension) {
    switch(type) {
        case "avatar": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_avatar." + extension;
        case "thumbnail": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_thumb." + extension;
        case "card": return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_card." + extension;
        default: return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "." + extension; 
    } 
}

FORGERY_HEAT_CATEGORY = {
    'QUEST': "quest",
    'SELL': "sell",
    'DONATE': "donate",
    'COLLECTOR': "collector",
    'DISPLAY': "display"
}

//sum total must equal 1
FORGERY_TYPE_HEAT_COEFFICIENTS = {
    'RARITY': .6,
    'FOIL': .3,
    'UNLOCKED': .1,
    'SEASONAL': .3,
    'VINTAGE': .3,
    'LOTTERY': .6,
    'LEVEL': .2
}

getForgeryHeat = function(forged_item_object, heat_category) {
    var heat_min;
    var heat_max;

    switch(heat_category) {
        case FORGERY_HEAT_CATEGORY.QUEST:
            heat_min = .3;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.SELL:
            heat_min = .5;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.DONATE:
            heat_min = .2;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.COLLECTOR:
            heat_min = .7;
            heat_max = .95;
            break;
        case FORGERY_HEAT_CATEGORY.DISPLAY:
            heat_min = 0;
            heat_max = .05;
            break;
        default: 
            heat_min = 0;
            heat_max = 1;
            break;
    }

    var heat_type_coefficient = 0;

    var rarity_index = artwork_rarities.indexOf(forged_item_object.artwork_data.rarity);
    var rarity_heat_coefficient = ((rarity_index + 1) / artwork_rarities.length) * FORGERY_TYPE_HEAT_COEFFICIENTS.RARITY;
    heat_type_coefficient += rarity_heat_coefficient;

    if (forged_item_object.foil) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.FOIL;
    }

    if (forged_item_object.unlocked) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.UNLOCKED;
    }

    if (forged_item_object.seasonal) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.SEASONAL;
    }

    if (forged_item_object.vintage) {
        heat_type_coefficient += FORGERY_TYPE_HEAT_COEFFICIENTS.VINTAGE;
    }

    if (forged_item_object.lottery > 0) {
        var lottery_heat_base_coefficient = .75;
        var lottery_heat_coefficient = (1 - lottery_heat_base_coefficient) * (forged_item_object.lottery / 10);
        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LOTTERY * (lottery_heat_base_coefficient + lottery_heat_coefficient));
    }

    if (forged_item_object.level > 1) {
        heat_type_coefficient += (FORGERY_TYPE_HEAT_COEFFICIENTS.LEVEL * (forged_item_object.level / 10));
    }

    var quality_adjustment_coefficient = 1 - (.2 * forged_item_object.forgery_quality);
    heat_type_coefficient *= quality_adjustment_coefficient;

    var heat_coefficient = heat_min + ((heat_max - heat_min) * Math.min(heat_type_coefficient, 1));

    return Number(heat_coefficient.toFixed(3));
}