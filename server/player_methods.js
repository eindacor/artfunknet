player_level_max = 50;
var starting_balance = 100000;

createUser = function(user_object, callback){
    // if (!user_object.profile.photo)
    //     user_object.profile.photo = getDefaultProfileImageId()

    var cap_object = getCapSetterObject(0);
    var cap_keys = Object.keys(cap_object);
    for (var i=0; i < cap_keys.length; i++) {
        var key = cap_keys[i];
        var value = cap_object[key];

        user_object.profile[key] = value;
    }

    user_object.profile.bank_balance = starting_balance;
    user_object.profile.last_drop = moment().add(-1, 'days')._d.toISOString();
    user_object.profile.level = 0;
    user_object.profile.xp = 0;
    user_object.profile.lottery_tickets = 1;
    user_object.profile.entry_fee = "medium";
    user_object.profile.gallery_tickets = [];
    user_object.profile.gallery_value = 0;
    user_object.profile.gallery_score = 0;
    user_object.profile.completed_quests = 0;
    user_object.profile.market_expert = {
        'expiration': moment().add(-1, 'days')._d.toISOString()
    };
    user_object.profile.last_login = moment()._d.toISOString();
    user_object.profile.last_logout = moment()._d.toISOString();
    user_object.profile.auction_data = {'winning': [], 'watching': []};
    user_object.profile.expansion_slots = 0;
    user_object.profile.money_spent_on_crates = 0;
    user_object.profile.vintage_select = false;
    user_object.profile.vintage_count = 0;
    user_object.profile.notifications = {
        'procs': [],
        'money': [],
        'xp': []
    }
    user_object.profile.settings = {
        'quick_purchase': false,
        'auction_items_to_inventory': false,
        'animations_enabled': true,
        'quick_sell_options': {
            'foil': false,
            'legendary': false,
            'seasonal': false,
            'quest_items': false,
            'sought': true
        }
    };

    user_object.profile.last_name_change = moment()._d.toISOString();

    user_object.profile.tutorials = {
        'welcome': true,
        'loot': true,
        'info': true,
        'action_buttons': true,
        'attributes': false,
        'xp_rating': true,
        'display': true,
        'permanent': true,
        'gallery': false,
        'my_gallery': false,
        'galleries': false,
        'other_gallery': false,
        'reroll_menu': false
    };

    var black_checklist_item = {
        'common': {},
        'uncommon': {},
        'rare': {},
        'legendary': {},
        'masterpiece': {}
    };

    /*
        artwork_id: 1234567,
        'foil': true,
        'original': true,
        'seasonal': true,
    */

    user_object.profile.checklists = {
        'owned': black_checklist_item, 
        'seen': black_checklist_item, 
        'displayed': black_checklist_item 
    };

    var default_wall = gallery_finishes.findOne({'filename': "plaster.jpg"});   
    var wall_finish_object = {
        'filename': default_wall.filename,
        'saturation': 1,
        'xp_rating': .1
    };

    var wall_setter_object = {};
    wall_setter_object[default_wall._id] = wall_finish_object;

    var default_floor = gallery_finishes.findOne({'filename': "carpet_gray.jpg"});
    var floor_finish_object = {
        'filename': default_floor.filename,
        'saturation': 1,
        'xp_rating': .1
    };

    var floor_setter_object = {};
    floor_setter_object[default_floor._id] = floor_finish_object;

    user_object.profile.gallery_finishes = {
        'active': {
            'floor_finish': default_floor._id,
            'wall_finish': default_wall._id
        },
        'owned': {
            'floor_finishes': floor_setter_object,
            'wall_finishes': wall_setter_object
        },
        'wall_opacity': 1,
        'frame_width': .5,
        'matte_width': .5,
        'wall_base': "white",
        'frame_color': "black"
    }

    return Accounts.createUser(user_object, callback);
}

alertPlayers = function(query, message, icon, sentiment) {
    Meteor.users.find(query).forEach(function(user_object) {
        var alert_object = {
            'user_id' : user_object._id,
            'message' : message,
            'link' : '/',
            'icon' : icon,
            'sentiment' : sentiment,
            'time' : moment()._d.toISOString()
        };

        alerts.insert(alert_object);
    });
}

addFunds = function(source, user_id, amount) {
    if (isNaN(amount))
        throw "invalid amount";

    var actual_amount = Number(amount).toFixed(2);

    logMoneyMade(source, actual_amount);

    var current_balance = Number(Meteor.users.findOne({'_id': user_id}).profile.bank_balance).toFixed(2);
    var new_balance = Number(current_balance) + Number(actual_amount);
    Meteor.users.update(user_id, {$set: {"profile.bank_balance" : Math.floor(new_balance)}});
    if (Meteor.users.findOne(user_id).profile.settings.animations_enabled) {
        Meteor.users.update(user_id, {$push: {'profile.notifications.money': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': amount}}});
    }
}

chargeAccount = function(user_id, amount) {
    if (isNaN(amount))
        throw "invalid amount";

    var actual_amount = Number(amount).toFixed(2);

    var current_balance = Number(Meteor.users.findOne({'_id': user_id}).profile.bank_balance).toFixed(2);
    var new_balance = Number(current_balance) - Number(actual_amount);
    Meteor.users.update(user_id, {$set: {"profile.bank_balance" : Math.floor(new_balance)}});
    if (Meteor.users.findOne(user_id).profile.settings.animations_enabled) {
        Meteor.users.update(user_id, {$push: {'profile.notifications.money': {'id': new Meteor.Collection.ObjectID()._str, 'expiration': moment().add(5, "seconds")._d.toISOString(), 'amount': -1 * amount}}});
    }
}

selectRandomPainting = function(selector) {
    return items.findOne(selector, {skip: Math.floor(Math.random() * items.find(selector).count())});
}

getCapSetterObject = function(player_level) {
    var cap_min_max_object = {
        'inventory_cap': {'start': 15, 'end': 64},
        'display_cap': {'start': 5, 'end': 10},
        'auction_cap': {'start': 8, 'end': 16},
        'ticket_cap': {'start': 3, 'end': 10},
        'pc_cap': {'start': 5, 'end': 12},
        'visitor_cap': {'start': 20, 'end': 200},
    }

    var setter_object = {};

    var cap_keys = Object.keys(cap_min_max_object);
    for (var i=0; i < cap_keys.length; i++) {
        var key = cap_keys[i];
        var start = cap_min_max_object[key].start;
        var end = cap_min_max_object[key].end;

        var range = end - start;

        var value = Math.floor(start + (range * (player_level / player_level_max)));

        setter_object[key] = value;
    }

    return setter_object;
}

playerRatio = function(player_object) {
    return player_object.profile.level / player_level_max;
}

//TODO look into meteorhacks:aggregate package to simplify this and avoid for loops
updateGalleryDetails = function(user_id) {
    var user_object = Meteor.users.findOne(user_id);

    if (user_object) {
        var gallery_value = 0;
        var attribute_rating_total = 0;
        var rarity_npc_coefficient_total = 0;
        var attribute_totals = {};
        var display_count = items.find({'owner' : user_id, 'status' : 'displayed'}).count();

        items.find({'owner' : user_id, 'status' : 'displayed'}).forEach(function(item_object) {
            gallery_value += getItemObjectValueByType(item_object, 'actual', user_id)
            var item_attributes = getAllItemObjectAttributes(item_object);

            var rarity_npc_coefficient;

            switch(item_object.artwork_data.rarity) {
                case "common": rarity_npc_coefficient = .76; break;
                case "uncommon": rarity_npc_coefficient = .8; break;
                case "rare": rarity_npc_coefficient = .88; break;
                case "legendary": rarity_npc_coefficient = .96; break;
                case "masterpiece": rarity_npc_coefficient = 1; break;
                default: rarity_npc_coefficient = .5; break;
            }

            rarity_npc_coefficient_total += rarity_npc_coefficient;

            for (var n=0; n < item_attributes.length; n++) {
                var attribute_id = item_attributes[n]._id;
                var attribute_value = item_attributes[n].value;
                attribute_rating_total += item_attributes[n].value

                if (item_attributes[n].type == "primary")
                    attribute_rating_total += attribute_value;

                if (attribute_totals[attribute_id] === undefined)
                    attribute_totals[attribute_id] = attribute_value;

                else attribute_totals[attribute_id] += attribute_value;
            }
        });

        var gallery_score = Math.floor(attribute_rating_total * 100);
        var gallery_rarity_npc_coefficient = display_count ? rarity_npc_coefficient_total / display_count : 0;

        var display_cap = user_object.profile.display_cap;
        var attribute_ids = Object.keys(attribute_totals);
        var attribute_values = {};

        for (var i=0; i < attribute_ids.length; i++) {
            var attribute_id = attribute_ids[i];
            var attribute_rating = attribute_totals[attribute_id] / display_cap;
            attribute_values[attribute_id] = attribute_rating;
        }

        if (galleries.findOne({"owner_id" : user_id}) == undefined) {
            galleries.insert({
                'owner_id' : user_id,
                'owner' : user_object.profile.screen_name,
                'attribute_values' : attribute_values,
                'entry_fee' : user_object.profile.entry_fee,
                'score': gallery_score,
                'value': gallery_value,
                'gallery_rarity_npc_coefficient': gallery_rarity_npc_coefficient
            });
        }

        else galleries.update({'owner_id' : user_id}, 
            {$set: {
                'attribute_values' : attribute_values, 
                'score': gallery_score, 
                'value': gallery_value,
                'gallery_rarity_npc_coefficient': gallery_rarity_npc_coefficient
            }
        });
    }
}
 
var getExpansionSlotCost = function(user_object) {
    if (user_object.profile.expansion_slots < getMaxExpansionSlots()) {
        var cost = Math.floor(1000000 * Math.pow(1.2, user_object.profile.expansion_slots));
        return cost;
    }   

    else return 0;
}

var purchaseExpansionSlot = function(user_object) {
    if (user_object.profile.expansion_slots < getMaxExpansionSlots()) {
        var cost = getExpansionSlotCost(user_object);
        if (user_object.profile.bank_balance >= cost) {
            chargeAccount(user_object._id, cost);
            Meteor.users.update(user_object._id, {$inc: {'profile.expansion_slots': 1}});
        }
    }   

    else return false;
}

getEntryFee = function(buyer_object, owner_id) {
    owner_object = Meteor.users.findOne(owner_id);
    var base_cost = getAverageDropValue(buyer_object.profile.level, 1.0);
    if (owner_object == undefined || buyer_object == undefined) {
        return -1;
    }

    var player_level_differential = owner_object.profile.level - buyer_object.profile.level;

    var diff_scale = Math.abs(player_level_differential) / 50;

    var flat_cost; 
    if (player_level_differential > 0)
        flat_cost = base_cost + (base_cost * diff_scale * .5);

    else flat_cost = base_cost - (base_cost * diff_scale * .5);

    switch(owner_object.profile.entry_fee) {
        case 'free': return 0;
        case 'low': return Math.floor(flat_cost * 0.4);
        case 'medium': return Math.floor(flat_cost * 0.6);
        case 'high': return Math.floor(flat_cost * 0.8);
        case 'outrageous': return Math.floor(flat_cost * 1.0);
        default: return 0;
    }
}

resetTutorials = function(user_id) {
    Meteor.users.update(user_id, {$set: {
        'profile.tutorials': {
            'welcome': true,
            'loot': false,
            'info': false,
            'action_buttons': false,
            'attributes': false,
            'xp_rating': false,
            'display': false,
            'permanent': false,
            'gallery': false,
            'my_gallery': false,
            'galleries': false,
            'other_gallery': false,
            'reroll_menu': false
        }
    }})
}

addItemObjectToChecklist = function(user_id, category, item_object) {
    if (item_object == undefined || Meteor.users.findOne(user_id) == undefined)
        return false;

    var card_types = ['foil', 'original', 'seasonal', 'lottery'];
    var setter_object = {};
    var setter_string = 'profile.checklists.' + category + '.' + item_object.artwork_data.rarity + '.' + item_object.artwork_id;

    var checklist_object = Meteor.users.findOne(user_id).profile.checklists[category][item_object.artwork_data.rarity][item_object.artwork_id];

    if (checklist_object == undefined) {
        checklist_object = {}
    }

    for (var i=0; i<card_types.length; i++) {
        checklist_object[card_types[i]] = checklist_object[card_types[i]] || item_object[card_types[i]];
    }

    setter_object[setter_string] = checklist_object;
    Meteor.users.update(user_id, {$set: setter_object});
}

var getSellAllData= function(user_id) {
    var total_value = 0;
    var item_ids = [];

    var quest_targets = [];

    quests.find({'owner_id': user_id}).forEach(function(quest_object) {
        for (var i=0; i<quest_object.target.length; i++) {
            if (items.findOne({'owner': user_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': quest_object.target[i]}) == undefined)
                quest_targets.push(quest_object.target[i]);
        }
    });

    //TODO add legendary procs for sell amounts here
    items.find({
        'owner': user_id,
        'status': {$in: ["unclaimed", "won"]}, 
        'foil': false, 
        'seasonal': false, 
        'lottery': 0,
        'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]},
        'artwork_id': {$nin: quest_targets}
    }).forEach(function(item_object) {
        total_value += getItemObjectValueByType(item_object, "sell", user_id);
        item_ids.push(item_object._id);
    });

    return {
        'value': total_value,
        'ids': item_ids
    }
}

getMaxQuests = function(npc_object) {
    if ((npc_object == undefined || isOwnGallery(npc_object)) && procUniqueAttribute(Meteor.userId(), "QUEST_CAP_BYPASS", undefined)) {
        return 20;
    } else {
        return 8;
    }
}

getActiveQuests = function() {
    return quests.find({'owner_id': Meteor.userId()}).count();
}

canAcceptQuest = function(npc_object) {
    return (getActiveQuests() < getMaxQuests(npc_object));

var increaseRandomAttribute = function(user_id, attribute_type) {
    var selector = {'owner': user_id, 'status': 'displayed'};
    var selector_string = "attributes." + attribute_type + ".value";
    selector[selector_string] = {'$lt': .9};
    var item_object = items.findOne(selector, {skip: Math.floor(items.find(selector).count() * Math.random())});

    if (item_object) {
        var qualifying_attributes = [];
        for (var i=0; i<item_object.attributes.length; i++) {
            if (item_object.attributes[i].value < .9)
                qualifying_attributes.push(item_object.attributes[i]._id);
        }
        var random_index = Math.floor(Math.random() * qualifying_attributes.length);
        var attribute_id = qualifying_attributes[random_index];
        var update_selector = {'_id': item_object._id, 'status': 'displayed'};
        var update_selector_string = "attributes." + attribute_type + "._id";
        update_selector[update_selector_string] = attribute_id;
        
        var incrementer = {};
        var incrementer_string = "attributes." + attribute_type + ".$.value";
        incrementer[incrementer_string] = .02;

        updateItem(update_selector, {$inc: incrementer_string});
        return true;
    }

    else return false;
}

Meteor.methods({
    'resetTutorials': function() {
        resetTutorials(Meteor.userId());
    },

    'confirmTutorial': function(tutorial_name) {
        var setter = {};
        var setter_string = "profile.tutorials." + tutorial_name;
        setter[setter_string] = false;
        Meteor.users.update(Meteor.userId(), {$set: setter});
    },

    'activateTutorial': function(tutorial_name) {
        var setter = {};
        var setter_string = "profile.tutorials." + tutorial_name;
        setter[setter_string] = true;
        Meteor.users.update(Meteor.userId(), {$set: setter});
    },

    'registerUser': function(user) {
        var emailExists = !! Meteor.users.findOne({ emails: { $elemMatch: { address: user.email } } });
        var screenNameExists;

        // TODO: Compare screennames and emails by case
        if (user.profile.screen_name.length == 0) {
            screenNameExists = false;
        }

        else {
            screenNameExists = !! Meteor.users.findOne({'profile.screen_name': user.profile.screen_name });
        }

        if (emailExists){
            throw new Meteor.Error("Email already exists");
        }

        else if (screenNameExists) {
            throw new Meteor.Error("Screen Name already exists");
        }

        else {
            createUser(user);
        }
    },

    'validateCreateLogin' : function(user_object, confirmed_password) {
        try {
            var errors = [];

            if (user_object.password.search(eval("/[A-Z]/")) == -1 ||
                user_object.password.search(eval("/[a-z]/")) == -1 ||
                user_object.password.search(eval("/[0-9]/")) == -1)
                errors.push("Invalid Password");

            if (user_object.password != confirmed_password)
                errors.push("Password fields do not match");

            if (user_object.profile.screen_name == "" 
                    || Meteor.users.find({'profile.screen_name': user_object.profile.screen_name}).count() > 0 
                    || user_object.profile.screen_name.toLowerCase() == "artfunkel")
                errors.push("Invalid user name");

            if (user_object.profile.screen_name.indexOf('.') != -1 || user_object.profile.screen_name.indexOf(' ') != -1)
                errors.push("Username contains invalid characters");

            if (user_object.profile.screen_name.length < 5 || user_object.profile.screen_name > 16)
                errors.push("Usernames must be between 5 and 16 characters");

            if (user_object.email == "")
                errors.push("Invalid email address");

            if (user_object.password == "")
                errors.push("Invalid password");

            if (Meteor.users.find({'emails.0.address': user_object.email}).count() > 0)
                errors.push("A user with that email address already exists");

            if (errors.length == 0) {
                createUser(user_object);
            }

            return errors;
        }

        catch(error) {
            return [error.message];
        }
    },

    'emailIsTaken' : function(email_address) {
        return Meteor.users.find({'emails.0.address': email_address}).count() > 0;
    },

    'clearAlerts' : function() {
        alerts.remove({'user_id' : Meteor.userId()});
    },

    'removeAlert' : function(alert_id) {
        alerts.remove(alert_id);
    },

    'sendResetPasswordEmail': function(email_address) {
        var user = Meteor.users.findOne({"username": email_address});

        if (user) {
            Accounts.sendResetPasswordEmail(user._id);
            return true;
        }

        else return null;
    },

    'purchaseTicket' : function(owner_id) {
        var buyer_id = Meteor.userId();
        var ticket_duration = 30; // minutes
        var ticket_expiration = moment().add(ticket_duration, 'minutes')._d.toISOString();
        var owner_object = Meteor.users.findOne(owner_id);
        var entry_fee = owner_object.profile.entry_fee;

        var buyer_object = Meteor.users.findOne(buyer_id);

        var actual_amount = getEntryFee(buyer_object, owner_object);

        if (actual_amount > buyer_object.profile.bank_balance
            || buyer_id === owner_id 
            || gallery_tickets.findOne({"ticketholder":buyer_id, "gallery_owner":owner_id, 'expiration': {$gt : moment()._d.toISOString()}}) !== undefined)
            return;

        var ticket_object = {
            'ticketholder': buyer_id,
            'gallery_owner': owner_id,
            'expiration': ticket_expiration
        };

        var new_id = gallery_tickets.insert(ticket_object);

        addFunds("ticket sale", owner_id, actual_amount);
        addXPChunkPercentage("gallery ticket purchased", owner_id, .02);
        chargeAccount(buyer_id, actual_amount);

        items.find({'owner': owner_id, 'status': {$in: ['displayed', 'permanent']}}).forEach(function(item_object) {
            addItemObjectToChecklist(Meteor.userId(), 'seen', item_object);
        })

    },

    'updateEntryFee' : function(value) {
        if (value != "free" && value != "low" && value != "medium" && value != "high" && value != "outrageous")
            return;
        
        Meteor.users.update(Meteor.userId(), {$set: {'profile.entry_fee' : value}});
        galleries.update({'owner_id' : Meteor.userId()}, {$set: {'entry_fee' : value}});
    },

    'setActiveFinish' : function(finish_id, type) {
        var setter = {};
        var key_string = "profile.gallery_finishes.active." + (type == "floor" ? "floor_finish" : "wall_finish");
        setter[key_string] = finish_id;
        Meteor.users.update(Meteor.userId(), {$set: setter})
    },

    'updateWallOpacity' : function(value) {
        Meteor.users.update(Meteor.userId(), {$set: {'profile.gallery_finishes.wall_opacity': value}});
    },

    'updateFrameWidth' : function(value) {
        Meteor.users.update(Meteor.userId(), {$set: {'profile.gallery_finishes.frame_width': value}});
    },

    'updateMatteWidth' : function(value) {
        Meteor.users.update(Meteor.userId(), {$set: {'profile.gallery_finishes.matte_width': value}});
    },

    'updateWallBase' : function(value) {
        Meteor.users.update(Meteor.userId(), {$set: {'profile.gallery_finishes.wall_base': value}});
    },

    'updateFrameColor': function(value) {
        Meteor.users.update(Meteor.userId(), {$set: {'profile.gallery_finishes.frame_color': value}});
    },

    'turnInQuest' : function(quest_id) {
        if (canTurnInQuest(quest_id)) {
            var user_object = Meteor.user();
            var quest_object = quests.findOne(quest_id);

            var base_xp = quest_object.reward.xp;
            var xp_recieved = base_xp;
            var unique_targets_found = [];
            var unique_specials_found = [];

            items.find({'owner': user_object._id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}).forEach(function(item_object) {
                if (unique_targets_found.indexOf(item_object.artwork_id) == -1)
                    unique_targets_found.push(item_object.artwork_id);

                if (unique_specials_found.indexOf(item_object.artwork_id) == -1 && (item_object.foil || item_object.original || item_object.vintage))
                    unique_specials_found.push(item_object.artwork_id);
            });

            var target_differential = unique_targets_found.length - quest_object.min_requirement;
            xp_recieved += Math.floor(base_xp * target_differential * 0.4);
            var special_count = unique_specials_found.length;
            xp_recieved += Math.floor(base_xp * special_count * 0.2);

            addXP(user_object._id, xp_recieved);
            logXPChunkPercentage("quest", quest_object.reward.xp_chunk_percentage + (special_count * 0.3) + (target_differential * 0.5));
            addFunds("quest", user_object._id, quest_object.reward.money);

            Meteor.users.update({'_id': Meteor.userId()}, {$inc: {'profile.completed_quests': 1}});

            if (quest_object.reward.item != undefined) {
                var rarity = quest_object.reward.item.rarity;
                var count = artworks.find({'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}).count();
                var random_index = Math.floor(Math.random() * count);
                var random_artwork_id = artworks.findOne({'_id': {$nin: getLootData().seasonal_items}, 'rarity': rarity}, {skip: random_index})._id;

                var item_generator = {
                    'source': "quest",
                    'user_id': user_object._id,
                    'artwork_id': random_artwork_id,
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': quest_object.reward.item.foil ? 1 : getLootData().global_foil_chance,
                    'seasonal': undefined,
                    'lottery': 0,
                    'original': false,
                    'misprint_chance': getLootData().global_misprint_chance,
                    'status': "unclaimed",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

                generateItemFromArtworkID(item_generator);
            }

            if (procUniqueAttribute(user_object._id, "ROLL_VALUE_QUEST_BONUS", undefined)) {
                var attribute_found = false;
                var attribute_types = ["unlocked", "locked", "special"];

                while (!attribute_found && attribute_types.length > 0) {
                    var random_index = Math.floor(Math.random() * attribute_types.length);
                    attribute_found = increaseRandomAttribute(attribute_types[random_index]);
                    attribute_types.splice(random_index, 1);
                }
            }

            if (procUniqueAttribute(user_object._id, "QUEST_TARGET_CONDITION_INCREASE", undefined)) {
                updateItemsBySelector({'owner': user_object._id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}, {$set: {'condition': .9}});
            }

            quests.remove(quest_id);
        }
    },

    'cancelQuest' : function(quest_id) {
        var quest_object = quests.findOne(quest_id);
        if (quest_object && quest_object.owner_id == Meteor.userId())
            quests.remove(quest_id);
    },

    'getMaxQuests' : function(npc_object) {
        return getMaxQuests(npc_object);
    },

    'getActiveQuests' : function() {
        return getActiveQuests();
    },

    'canAcceptQuest' : function(npc_object) {
        return canAcceptQuest(npc_object)
    },

    'getSoughtStatus' : function(artwork_id, only_sought_if_not_in_auction_house) {
        if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
            return getSoughtStatus(Meteor.userId(), artwork_id, only_sought_if_not_in_auction_house);
        }

        else return false;
    },

    'getSellAllAmount' : function() {
        return getSellAllData(Meteor.userId()).value;
    },

    'sellAllUnclaimed' : function() {
        var sell_all_data = getSellAllData(Meteor.userId());

        items.find({'_id': {$in: sell_all_data.ids}}).forEach(function(item_object) {
            removeItem(item_object._id, "sell all", undefined);
        });

        addFunds("sell item", Meteor.userId(), sell_all_data.value);
    },

    'clearAllForSale' : function() {
        var quest_targets = [];

        quests.find({'owner_id': Meteor.userId()}).forEach(function(quest_object) {
        for (var i=0; i<quest_object.target.length; i++) {
            if (items.findOne({'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': quest_object.target[i]}) == undefined)
                quest_targets.push(quest_object.target[i]);
        }
    });

        if (procUniqueAttribute(Meteor.userId(), "DECLINE_DEALER_DESIGNER_SPAWN", undefined)) {
            var item_count = items.find({
                'owner': Meteor.userId(),
                'status': "for_sale", 
                'foil': false, 
                'seasonal': false, 
                'lottery': 0, 
                'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]},
                'artwork_id': {$nin: quest_targets}
            }).count();

            for (var i=0; i<item_count; i++) {
                if (Math.random() < .04) {
                    var npc_quality = getNPCQuality(Meteor.user().profile.level);
                    createNPC(galleries.findOne({'owner_id': Meteor.userId()}), attributes.findOne({'npc_name': "Designer"})._id, 600000, npc_quality);
                }
            }
        }

        items.find({
            'owner': Meteor.userId(),
            'status': "for_sale", 
            'foil': false, 
            'seasonal': false, 
            'lottery': 0, 
            'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]},
            'artwork_id': {$nin: quest_targets}
        }).forEach(function(item_object) {
            removeItem(item_object._id, "clear all for sale", undefined);
        });


    },

    'displayAllTagged': function(tag_array, duration) {
        var player_object = Meteor.user();
        var tagged_items = items.find({'owner': player_object._id, 'tags': {$in: tag_array}, 'status': {$ne: 'displayed'}}).fetch();
        var has_capacity = items.find({'owner' : player_object._id, 'status' : "displayed"}).count() + tagged_items.length <= player_object.profile.display_cap;

        if (!has_capacity)
            return false;

        for (var i=0; i<tagged_items.length; i++) {
            if (!canDisplayItem(tagged_items[i]._id))
                return false;
        }

        for (var i=0; i<tagged_items.length; i++) {
            displayItem(tagged_items[i]._id, duration);
        }

        return true;
    },

    'getAuctionCount': function(filter_array, quest_status) {
        var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();
        var fields_object = undefined;
        var target_array = [];

        if (quest_status == "quest") {
            quests.find({'owner_id': Meteor.userId()}).forEach(function(quest_object) {
                var combined_array = target_array.concat(quest_object.target);
                target_array = combined_array;
            });

            filter_array.push({'item_data.artwork_id': {'$in': target_array}});
        }

        if (has_auctioneer) {
            fields_object = {
                'item_id': 0,
                'current_bid': 0,
                'increment': 0,
                'min_bid': 0,
                'viewer': 0
            }

            if (quest_status == "sought") {
                quests.find({'owner_id': {'$ne': Meteor.userId()}}).forEach(function(quest_object) {
                    for (var i=0; i<quest_object.target.length; i++) {
                        if (getSoughtStatus(Meteor.userId(), quest_object.target[i], false) && target_array.indexOf(quest_object.target[i]) == -1)
                            target_array.push(quest_object.target[i]);
                    }
                });

                filter_array.push({'item_data.artwork_id': {'$in': target_array}});
            }
        }

        else {
            fields_object = {
                'item_id': 0,
                'current_bid': 0,
                'increment': 0,
                'min_bid': 0,
                'viewer': 0,
                'item_data.condition': 0,
                'item_data.xp_rating': 0,
                'item_data.feature_count': 0,
                'item_data.roll_count': 0,
                'item_data.attributes': 0
            }
        }

        var now = moment()._d.toISOString();
        filter_array.push({'expiration': {$gt : now}});

        return total_items_found = auctions.find({$and: filter_array}, {fields: fields_object}).count();
    },

    //TODO put logic into standalone method used by getAuctions, getPlayerAuctions, and getWatchedAndWinningAuctions
    'getAuctions': function(sort_object, filter_array, skip_amount, items_per_page, quest_status) {
        var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();
        var fields_object = undefined;
        var target_array = [];

        if (quest_status == "quest") {
            quests.find({'owner_id': Meteor.userId()}).forEach(function(quest_object) {
                var combined_array = target_array.concat(quest_object.target);
                target_array = combined_array;
            });

            filter_array.push({'item_data.artwork_id': {'$in': target_array}});
        }

        if (has_auctioneer) {
            fields_object = {
                'item_id': 0,
                'increment': 0,
            }

            if (quest_status == "sought") {
                quests.find({'owner_id': {'$ne': Meteor.userId()}}).forEach(function(quest_object) {
                    for (var i=0; i<quest_object.target.length; i++) {
                        if (getSoughtStatus(Meteor.userId(), quest_object.target[i], false) && target_array.indexOf(quest_object.target[i]) == -1)
                            target_array.push(quest_object.target[i]);
                    }
                });

                filter_array.push({'item_data.artwork_id': {'$in': target_array}});
            }
        }

        else {
            fields_object = {
                'item_id': 0,
                'increment': 0,
                'item_data.condition': 0,
                'item_data.xp_rating': 0,
                'item_data.feature_count': 0,
                'item_data.roll_count': 0,
                'item_data.attributes': 0
            }

            if (sort_object.item_data != undefined && (
                sort_object.item_data.xp_rating != undefined ||
                sort_object.item_data.roll_count != undefined ||
                sort_object.item_data.condition != undefined)) {
                return {
                    'auction_data': [],
                    'items_found': 0
                };
            }
        }

        var now = moment()._d.toISOString();
        filter_array.push({'expiration': {$gt : now}});

        var auction_array = auctions.find(
            {$and: filter_array}, 
            {
                fields: fields_object, 
                sort: sort_object,
                skip: skip_amount, 
                limit: items_per_page
            }).fetch();

        return auction_array;
    },

    'getPlayerAuctions': function() {
        var now = moment()._d.toISOString();

        var auction_array = auctions.find(
            {'expiration': {$gt : now}, 'seller': Meteor.user().profile.screen_name}, {sort: {'expiration': 1}}
        ).fetch();

        return auction_array;
    },

    'getWatchedAndWinningAuctions': function() {
        var winning_and_watching = Meteor.user().profile.auction_data.winning.concat(Meteor.user().profile.auction_data.watching);

        var now = moment()._d.toISOString();
        var fields_object = {
            'item_id': 0,
            'increment': 0,
            'viewer': 0
        }

        var auction_array = auctions.find(
            {'expiration': {$gt : now}, '_id': {$in: winning_and_watching}}, 
            {
                fields: fields_object, 
                sort: {'expiration': 1}
            }
        ).fetch();

        return auction_array;
    },

    'getAlreadyWinningElsewhere': function(auction_id) {
        if (auctions.findOne(auction_id) == undefined)
            return false;

        var artwork_id = auctions.findOne(auction_id).item_data.artwork_id;
        return auctions.findOne({'_id': {$in: Meteor.user().profile.auction_data.winning}, 'item_data.artwork_id': artwork_id}) != undefined && 
            Meteor.user().profile.auction_data.winning.indexOf(auction_id) == -1;
    },

    'getChecklistByRarity': function(rarity) {
        var fields_object = {};
        var categories = ['owned', 'seen', 'displayed'];
        // var categories = ['owned', 'seen', 'displayed', 'purchased', 'sold', 'auctioned'];

        for (var i=0; i<categories.length; i++) {
            var key_string = "profile.checklists." + categories[i] + "." + rarity;
            fields_object[key_string] = 1;
        }

        return Meteor.users.findOne(
            {'_id': Meteor.userId()}, 
            {
                fields: fields_object
            }).profile.checklists;
    },

    'getChecklistCounts': function(rarity) {
        var categories = ['owned', 'seen', 'displayed'];
        var type_array = ['foil', 'original', 'lottery', 'seasonal'];
        var checklist_object = Meteor.user().profile.checklists;

        if (checklist_object == undefined)
            return {};
        
        var count_object = {
            'total': artworks.find({'active': true, 'rarity': rarity}).count(),
            'owned': {
                'standard': 0,
                'foil': 0,
                'seasonal': 0,
                'original': 0,
                'lottery': 0
            },

            'seen': {
                'standard': 0,
                'foil': 0,
                'seasonal': 0,
                'original': 0,
                'lottery': 0
            },

            'displayed': {
                'standard': 0,
                'foil': 0,
                'seasonal': 0,
                'original': 0,
                'lottery': 0
            },
        };

        var user_object = Meteor.user();

        artworks.find({'active': true, 'rarity': rarity}).forEach(function(artwork_object) {
            for (var n=0; n<categories.length; n++) {
                var category = categories[n];
                if (user_object.profile.checklists[category][rarity][artwork_object._id] != undefined) {
                    count_object[category].standard++;

                    for (var i=0; i<type_array.length; i++) {
                        var type = type_array[i];
                        if (user_object.profile.checklists[category][rarity][artwork_object._id][type])
                            count_object[category][type]++;
                    }
                }
            }
        })

        return count_object;
    },

    'getExpansionSlotCost': function() {
        return getExpansionSlotCost(Meteor.user());
    },

    'purchaseExpansionSlot': function() {
        return purchaseExpansionSlot(Meteor.user());
    },

    'vintageMode': function() {
        try {
            if (auctions.findOne({'seller': Meteor.user().profile.screen_name}) != undefined || 
                Meteor.user().profile.auction_data.winning.length > 0 ||
                Meteor.user().profile.level < player_level_max) {
                return false;
            }

            var new_bank_balance = starting_balance + Math.floor(starting_balance * (Meteor.user().profile.vintage_count + 1));
            items.find({'owner': Meteor.userId(), 'status': {$in: ['for_sale', 'unclaimed', 'won']}}).forEach(function(item_object) {
                removeItem(item_object._id, "vintage clear unclaimed", undefined);
            });

            while (items.findOne({'owner': Meteor.userId(), 'status': {$in: ['for_sale', 'unclaimed', 'won']}}) != undefined) {
                setTimeout("", 1000);
            }

            var has_items_to_claim = items.findOne({'owner': Meteor.userId(), 'vintage': {$ne: true}, 'original': {$ne: true}}) != undefined;

            // reset gallery finishes
            var default_wall = gallery_finishes.findOne({'filename': "plaster.jpg"});   
            var wall_finish_object = {
                'filename': default_wall.filename,
                'saturation': 1,
                'xp_rating': .1
            };

            var wall_setter_object = {};
            wall_setter_object[default_wall._id] = wall_finish_object;

            var default_floor = gallery_finishes.findOne({'filename': "carpet_gray.jpg"});
            var floor_finish_object = {
                'filename': default_floor.filename,
                'saturation': 1,
                'xp_rating': .1
            };

            var floor_setter_object = {};
            floor_setter_object[default_floor._id] = floor_finish_object;

            Meteor.users.update(
                Meteor.userId(),                //selector
                {                               //modifier
                    $inc: {'profile.vintage_count': 1}, 
                    $set: {
                        'profile.vintage_select': has_items_to_claim, 
                        'profile.level': 0, 
                        'profile.bank_balance': new_bank_balance,
                        'profile.xp': 0,
                        'profile.last_drop': moment().add(-1, 'days')._d.toISOString(),
                        // +2 because the user's vintage level has not yet been incremented
                        // 'profile.lottery_tickets': Meteor.user().profile.vintage_count + 2,
                        'profile.expansion_slots': 0,
                        'profile.gallery_finishes': {
                            'active': {
                                'floor_finish': default_floor._id,
                                'wall_finish': default_wall._id
                            },
                            'owned': {
                                'floor_finishes': floor_setter_object,
                                'wall_finishes': wall_setter_object
                            },
                            'wall_opacity': 1,
                            'frame_width': .5,
                            'matte_width': .5,
                            'wall_base': "white",
                            'frame_color': "black"
                        }
                    }
                }
            );

            items.find({'owner': Meteor.userId(), 'vintage': {$ne: true}, 'original': {$ne: true}}).forEach(function(item_object) {
                updateItem(
                    item_object._id,                //selector
                    {                               //modifier 
                        $set: {
                            'status': 'won',
                            'vintage': true,
                            'date_received': moment()._d.toISOString(),
                            'display_details': {
                                'money' : 0,
                                'xp' : 0,
                                'xp_chunk_percentage': 0,
                                'end' : ""
                            }
                        }
                    }
                );         
            });

            quests.remove({'owner_id': Meteor.userId()});

            // reset profile limits
            var cap_object = getCapSetterObject(0);
            var setter = {};
            var cap_keys = Object.keys(cap_object);
            for (var i=0; i < cap_keys.length; i++) {
                var key = cap_keys[i];
                var value = cap_object[key];

                var setter_key = "profile." + key;
                setter[setter_key] = value;
            }

            Meteor.users.update(Meteor.userId(), {$set : setter});
        }

        catch (error) {
            console.log(error.message);
        }
    },

    'getAuctionPreviewItemObject': function(auction_id) {
        var auction_object = auctions.findOne(auction_id);
        if (auction_object == undefined)
            return {};

        var has_auctioneer = Meteor.user().profile.market_expert.expiration > moment()._d.toISOString();

        var fields_object = {
            'artwork_data': 1,
            'lottery': 1,
            'seasonal': 1,
            'foil': 1,
            'original': 1,
            'vintage': 1
        };

        if (has_auctioneer || auction_object.seller == Meteor.user().profile.screen_name) {
            fields_object.condition = 1;
            fields_object.values = 1;
            fields_object.xp_rating = 1;
            fields_object.roll_count = 1;
            fields_object.attributes = 1;
        }

        var item_object = items.findOne(auction_object.item_id, {fields: fields_object});
        return item_object;
    },

    'removeNotifications': function(type) {
        var setter_string = 'profile.notifications.' + type;
        setter_object = {};
        setter_object[setter_string] = [];
        Meteor.users.update(Meteor.userId(), {$set: setter_object});
    },

    'setPlayerSetting': function(setting_name, status) {
        var setter_string = 'profile.settings.' + setting_name;

        var validity_check_object = {};
        validity_check_object._id = Meteor.userId();
        validity_check_object[setter_string] = {$ne: null};
        if (Meteor.users.findOne(validity_check_object) == undefined) {
            return false;
        }

        var setter_object = {};
        setter_object[setter_string] = status;
        Meteor.users.update(Meteor.userId(), {$set: setter_object});
    },

    'changeScreenName': function(desired_name) {
        var previous_name = Meteor.user().profile.screen_name;
        if (desired_name == previous_name)
            return;

        if (previous_name == "admin" || desired_name == "Artfunkel, Inc.")
            return "invalid operation";

        else if (Meteor.users.findOne({'profile.screen_name': desired_name}) != undefined) {
            return "that name is unavailable";
        }

        else if (desired_name.length < 5 || desired_name > 16)  {
            return "names must be between 5 and 16 characters long";
        }

        else if (Meteor.user().profile.last_name_change > moment().add(-1, 'days')._d.toISOString()) {
            return "you can only modify your player name once per day";
        }

        else {
            galleries.update({'owner_id': Meteor.userId()}, {$set: {'owner': desired_name}})
            auctions.update({'seller': previous_name}, {$set: {'seller': desired_name}}, {multi: true});
            Meteor.users.update(Meteor.userId(), {$set: {'profile.screen_name': desired_name, 'profile.last_name_change': moment()._d.toISOString()}});
        }
    }
})
