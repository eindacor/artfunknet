player_level_max = 50;

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

    user_object.profile.bank_balance = 100000;
    user_object.profile.last_drop = moment().add(-1, 'days')._d.toISOString();
    user_object.profile.level = 0;
    user_object.profile.xp = 0;
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
        'owned': blank_list_object,
        'seen': blank_list_object,
        'displayed': blank_list_object,
        'purchased': blank_list_object,
        'sold': blank_list_object,
        'auctioned': blank_list_object
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

addFunds = function(source, user_id, amount) {
    if (isNaN(amount))
        throw "invalid amount";

    var actual_amount = Number(amount).toFixed(2);

    logMoneyMade(source, actual_amount);

    var current_balance = Number(Meteor.users.findOne({'_id': user_id}).profile.bank_balance).toFixed(2);
    var new_balance = Number(current_balance) + Number(actual_amount);
    Meteor.users.update(user_id, {$set: {"profile.bank_balance" : Math.floor(new_balance)}});
}

chargeAccount = function(user_id, amount) {
    if (isNaN(amount))
        throw "invalid amount";

    var actual_amount = Number(amount).toFixed(2);

    var current_balance = Number(Meteor.users.findOne({'_id': user_id}).profile.bank_balance).toFixed(2);
    var new_balance = Number(current_balance) - Number(actual_amount);
    Meteor.users.update(user_id, {$set: {"profile.bank_balance" : Math.floor(new_balance)}});
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

calcMVP = function(user_id) {
    var mvp = {
        'item_id': "",
        'value': 0
    }

    var items_owned = items.find({'owner': user_id, 'status': {$nin: ['for_sale, unclaimed', 'won']}});
    var collection_total = 0;
    items_owned.forEach(function(db_object) {
        try {
            var value = getItemValue(db_object._id, 'actual', user_id);
            collection_total += value;
            if (value > mvp.value) {
                mvp.item_id = db_object._id;
                mvp.value = value;
            }
        }
        catch(error) {
            console.log(error.message);
        }
    });

    Meteor.users.update(user_id, {$set: {'profile.mvp': mvp, 'profile.collection_value': collection_total}});
}

updateGalleryDetails = function(user_id) {
    var user_object = Meteor.users.findOne(user_id);

    if (user_object) {
        var items_on_display = items.find({'owner' : user_id, 'status' : 'displayed'}).fetch();
        var gallery_value = 0;
        var attribute_rating_total = 0;
        var rarity_npc_coefficient_total = 0;

        var attribute_totals = {};
        for (var i=0; i < items_on_display.length; i++) {
            gallery_value += getItemValue(items_on_display[i]._id, 'actual', user_id);
            var item_attributes = items_on_display[i].attributes;

            var rarity_npc_coefficient;

            switch(items_on_display[i].artwork_data.rarity) {
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

                if (item_attributes[n].type == "primary")
                    attribute_rating_total += attribute_value;

                if (attribute_totals[attribute_id] === undefined)
                    attribute_totals[attribute_id] = attribute_value;

                else attribute_totals[attribute_id] += attribute_value;
            }
        }

        var gallery_score = Math.floor(attribute_rating_total * 100);
        var gallery_rarity_npc_coefficient = items_on_display.length ? rarity_npc_coefficient_total / items_on_display.length : 0;

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

        if (actual_amount > buyer_object.profile.bank_balance)
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

            var xp_recieved = quest_object.reward.xp;
            var unique_targets_found = [];
            var unique_specials_found = [];

            items.find({'owner': user_object._id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}).forEach(function(item_object) {
                if (unique_targets_found.indexOf(item_object.artwork_id) == -1)
                    unique_targets_found.push(item_object.artwork_id);

                if (unique_specials_found.indexOf(item_object.artwork_id) == -1 && (item_object.foil || item_object.original))
                    unique_specials_found.push(item_object.artwork_id);
            });

            var target_differential = unique_targets_found.length - quest_object.min_requirement;
            xp_recieved += Math.floor(getXPChunk(user_object.profile.level) * target_differential * 0.5);
            var special_count = unique_specials_found.length;
            xp_recieved += Math.floor(getXPChunk(user_object.profile.level) * special_count * 0.3);

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
                var random_displayed = selectRandomPainting({'owner': Meteor.userId(), 'status': "displayed"});
                if (random_displayed) {
                    var attributes = random_displayed.attributes;
                    var random_index = Math.floor(Math.random() * attributes.length);
                    var setter_string = "attributes." + random_index + ".value";
                    if (attributes[random_index].value < 1) {
                        var setter_object = {};
                        setter_object[setter_string] = Math.min(attributes[random_index].value + .02, 1);
                        items.update(random_displayed._id, {$set: setter_object});
                    }
                }
            }

            if (procUniqueAttribute(user_object._id, "QUEST_TARGET_CONDITION_INCREASE", undefined)) {
                items.update({'owner': user_object._id, 'status': {$nin: ['unclaimed', 'for_sale', 'won']}, 'artwork_id': {$in: quest_object.target}}, {$set: {'condition': .9}}, {multi: true});
            }

            quests.remove(quest_id);
        }
    },

    'cancelQuest' : function(quest_id) {
        var quest_object = quests.findOne(quest_id);
        if (quest_object && quest_object.owner_id == Meteor.userId())
            quests.remove(quest_id);
    },

    'getSoughtStatus' : function(artwork_id, only_sought_if_not_in_auction_house) {
        if (Meteor.user().profile.market_expert.expiration > moment()._d.toISOString()) {
            return getSoughtStatus(Meteor.userId(), artwork_id, only_sought_if_not_in_auction_house);
        }

        else return false;
    },

    'getSellAllAmount' : function() {
        var total_value = 0;
        var item_ids = [];
        items.find({
            'owner': Meteor.userId(),
            'status': {$in: ["unclaimed", "won"]}, 
            'foil': false, 
            'seasonal': false, 
            'lottery': 0,
            'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]}
        }).forEach(function(db_object) {
            total_value += getItemValue(db_object._id, "sell", Meteor.userId());
            item_ids.push(db_object._id);
        });

        return total_value;
    },

    'sellAllUnclaimed' : function() {
        if (Meteor.user().profile.user_type != "admin") {
            var total_value = 0;
            var item_ids = [];
            items.find({
                'owner': Meteor.userId(),
                'status': {$in: ["unclaimed", "won"]}, 
                'foil': false, 
                'seasonal': false, 
                'lottery': 0,
                'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]}
            }).forEach(function(db_object) {
                total_value += getItemValue(db_object._id, "sell", Meteor.userId());
                item_ids.push(db_object._id);
            });

            items.update({'_id': {$in: item_ids}}, {$set: {'owner': "Artfunkel, Inc.", 'status': "auctioned"}}, {multi: true} ,function(error) {
                if (error)
                    console.log(error.message);

                else {
                    calcMVP(Meteor.userId());

                    for (var i=0; i<item_ids.length; i++) {
                        createAuction(item_ids[i], getItemValue(item_ids[i], "sell", Meteor.userId()), -1, 120, "public");
                    }
                }
            });

            addFunds("sell item", Meteor.userId(), total_value);
        }

        else items.remove({'owner': Meteor.userId(), 'status': {$in: ["unclaimed", "won"]}});
    },

    'clearAllForSale' : function() {
        if (procUniqueAttribute(Meteor.userId(), "DECLINE_DEALER_DESIGNER_SPAWN", undefined)) {
            var item_count = items.find({
                'owner': Meteor.userId(),
                'status': "for_sale", 
                'foil': false, 
                'seasonal': false, 
                'lottery': 0, 
                'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]}
            }).count();

            for (var i=0; i<item_count; i++) {
                if (Math.random() < .1) {
                    var npc_quality = getNPCQuality(Meteor.user().profile.level);
                    createNPC(galleries.findOne({'owner_id': Meteor.userId()}), attributes.findOne({'npc_name': "Designer"})._id, 600000, npc_quality);
                }
            }
        }

        items.remove({
            'owner': Meteor.userId(),
            'status': "for_sale", 
            'foil': false, 
            'seasonal': false, 
            'lottery': 0, 
            'artwork_data.rarity': {$in: ["common", "uncommon", "rare"]}
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
                'highest_bid': 0,
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
                'highest_bid': 0,
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
                'current_bid': 0,
                'increment': 0,
                'highest_bid': 0,
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
                'highest_bid': 0,
                'viewer': 0,
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

    'getPlayerAuctions': function(sort_object, filter_array, skip_amount, items_per_page) {
        var now = moment()._d.toISOString();
        filter_array.push({'expiration': {$gt : now}});

        var fields_object = {
            'item_id': 0,
            'current_bid': 0,
            'increment': 0,
            'highest_bid': 0,
            'viewer': 0
        }

        var auction_array = auctions.find(
            {$and: filter_array}, 
            {
                fields: fields_object, 
                sort: sort_object,
                skip: skip_amount, 
                limit: items_per_page
            }).fetch();

        var total_items_found = auctions.find(
            {$and: filter_array},  
            {
                fields: fields_object
            }).count();

        return {
            'auction_data': auction_array,
            'items_found': total_items_found
        }
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
    }
})
