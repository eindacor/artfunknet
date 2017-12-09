createUser = function(user_object, callback) {
    user_object.profile.user_type = "player";
    createPlayer(user_object, callback);
}

createAdmin = function(user_object, callback) {
    user_object.profile.user_type = "admin";
    createPlayer(user_object, callback);
}

createBot = function(user_object, callback) {
    user_object.profile.user_type = "bot";
    createPlayer(user_object, callback);
}

//TODO revise once entry fees are dynamic to randomize bot prices
var getStartingEntryFee = function(is_bot) {
    return "medium";
}

createPlayer = function(user_object, callback){
    // if (!user_object.profile.photo)
    //     user_object.profile.photo = getDefaultProfileImageId()

    var is_bot = user_object.profile.user_type == "bot";

    if (user_object.profile.screen_name == BOT_USER_NAME) {
        throw "Invalid gamertag";
    }

    var cap_object = getCapSetterObject(0);
    var cap_keys = Object.keys(cap_object);
    for (var i=0; i < cap_keys.length; i++) {
        var key = cap_keys[i];
        var value = cap_object[key];

        user_object.profile[key] = value;
    }

    user_object.profile.active = true;
    user_object.profile.bank_balance = STARTING_BALANCE;
    user_object.profile.last_drop = moment().add(-1, 'days')._d.toISOString();
    user_object.profile.level = is_bot ? PLAYER_LEVEL_MAX : 0;
    user_object.profile.xp = 0;
    user_object.profile.lottery_tickets = 1;
    user_object.profile.entry_fee = getStartingEntryFee(is_bot);
    user_object.profile.npcs_met = {
        'bronze': 0,
        'silver': 0,
        'gold': 0,
        'platinum': 0
    };
    user_object.profile.completed_quests = 0;
    user_object.profile.market_expert = {
        'expiration': moment().add(-1, 'days')._d.toISOString()
    };
    user_object.profile.last_login = getNowISOString();
    user_object.profile.last_logout = getNowISOString();
    user_object.profile.auction_data = {'winning': [], 'watching': []};
    user_object.profile.expansion_slots = 0;
    user_object.profile.money_spent_on_crates = 0;
    user_object.profile.vintage_select = false;
    user_object.profile.vintage_count = 0;
    user_object.profile.visitor_ignore_coefficient = 0;
    user_object.profile.visitor_ignore_proc_count = 0;
    user_object.profile.favorite_galleries = [];
    user_object.profile.notifications = {
        'procs': [],
        'money': [],
        'xp': []
    }
    user_object.profile.settings = {
        'quick_purchase': false,
        'auction_items_to_inventory': true,
        'animations_enabled': false,
        'lottery_eligible': true,
        'show_npc_modals': true,
        'ignore_archive_recommendations': false,
        'auto_archive_upgrades': false,
        'quick_sell_options': {
            'foil': false,
            'legendary': false,
            'masterpiece': false,
            'original': false,
            'quest_items': false,
            'seasonal': false,
            'standard': true,
            'sought': true,
            'unfound': false,
            'unlocked': false,
            'vintage': false,
            'lottery': false
        }
    };

    user_object.profile.last_name_change = getNowISOString();
    user_object.profile.tutorial_data = {
        'current_tutorial': "artfunkel basics",
        'step': 0,
        'completed': []
    }

    user_object.profile.crate_purchases = {};

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

    var knowledge_object = {
        'historical_data': 0,
        'contextual_understanding': 0,
        'technical_comprehension': 0,
        'artistic_vision': 0
    }
    user_object.profile.knowledge = knowledge_object;

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

    var admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"}));
    if (!is_bot) {
        var message = "New account created -> " + user_object.profile.screen_name + ", " + user_object.username;
        admin_interface.alert(message, 'fa-user-circle', 'good');
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
            'time' : getNowISOString()
        };

        alerts.insert(alert_object);
    });
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
        'pc_cap': {'start': 12, 'end': 12},
        'visitor_cap': {'start': 20, 'end': 200},
        'repairing_cap': {'start': 4, 'end': 12},
        'forgery_contract_cap': {'start': 8, 'end': 16}
    }

    var setter_object = {};

    var cap_keys = Object.keys(cap_min_max_object);
    for (var i=0; i < cap_keys.length; i++) {
        var key = cap_keys[i];
        var start = cap_min_max_object[key].start;
        var end = cap_min_max_object[key].end;

        var range = end - start;

        var value = Math.floor(start + (range * (player_level / PLAYER_LEVEL_MAX)));

        setter_object[key] = value;
    }

    return setter_object;
}

playerRatio = function(player_object) {
    return player_object.profile.level / PLAYER_LEVEL_MAX;
}

Meteor.methods({
    'beginTutorial': function(tutorial_name) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.beginTutorial(tutorial_name);
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

    'validateCreateLogin' : function(user_object, beta_key, confirmed_password) {
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

            var beta_key_object = beta_keys.findOne({'approved': true, 'email_address': user_object.email, 'key': beta_key});

            if (beta_key_object == undefined) {
                errors.push("Invalid beta key");
            }

            if (errors.length == 0) {
                createUser(user_object);
            }

            return errors;
        }

        catch(error) {
            var errors = [];
            errors.push(error.message);
            return errors;
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

    'purchaseTicket' : function(gallery_id) {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.purchaseTicket(gallery_id);
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
        Meteor.users.update(Meteor.userId(), {$set: setter});
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

    'turnInQuest' : function(quest_id, sell, donate) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.turnInQuest(quest_id, sell, donate);
    },

    'cancelQuest' : function(quest_id) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.cancelQuest(quest_id);
    },

    'getMaxQuests' : function(npc_object) {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getMaxQuests(npc_object);
    },

    'getActiveQuests' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getActiveQuests();
    },

    'canAcceptQuest' : function(npc_object) {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.canAcceptQuest(npc_object)
    },

    'getSoughtStatus' : function(artwork_id, only_sought_if_not_in_auction_house) {
        if (Meteor.user().profile.market_expert.expiration > getNowISOString()) {
            return getSoughtStatus(Meteor.userId(), artwork_id, only_sought_if_not_in_auction_house);
        }

        else return false;
    },

    'getSellAllAmount' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getSellAllData().value;
    },

    'sellAllUnclaimed' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.sellAllUnclaimed();
    },

    'donateAllUnclaimed' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.donateAllUnclaimed();
    },

    'purchaseAndDonateAllForSale': function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.purchaseAndDonateAllForSale();
    },

    'archiveAllUnclaimed' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.archiveAllUnclaimed();
    },

    'purchaseAndArchiveAllForSale': function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.purchaseAndArchiveAllForSale();
    },

    'deleteAllDisplaced': function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.deleteAllDisplaced();
    },

    'declineAllForSale' : function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.declineAllForSale(); 
    },

    'displayAllTagged': function(tag_array) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.displayAllTagged(tag_array);
    },

    'clearDisplay': function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.clearDisplay();
    },

    'getAuctionCount': function(filter_array, quest_status) {
        var has_auctioneer = Meteor.user().profile.market_expert.expiration > getNowISOString();
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
                'item_data.level': 0,
                'item_data.feature_count': 0,
                'item_data.roll_count': 0,
                'item_data.attributes': 0
            }
        }

        var now = getNowISOString();
        filter_array.push({'expiration': {$gt : now}});

        return total_items_found = auctions.find({$and: filter_array}, {fields: fields_object}).count();
    },

    //TODO put logic into standalone method used by getAuctions, getPlayerAuctions, and getWatchedAndWinningAuctions
    'getAuctions': function(sort_object, filter_array, skip_amount, items_per_page, quest_status) {
        var has_auctioneer = Meteor.user().profile.market_expert.expiration > getNowISOString();
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
                'item_data.level': 0,
                'item_data.feature_count': 0,
                'item_data.roll_count': 0,
                'item_data.attributes.locked.value': 0,
                'item_data.attributes.unlocked.value': 0,
                'item_data.attributes.special.value': 0
            }

            if (sort_object.item_data != undefined && (
                sort_object.item_data.level != undefined ||
                sort_object.item_data.roll_count != undefined ||
                sort_object.item_data.condition != undefined)) {
                return {
                    'auction_data': [],
                    'items_found': 0
                };
            }
        }

        var now = getNowISOString();
        filter_array.push({'expiration': {$gt : now}});

        var auction_array = auctions.find(
            {$and: filter_array}, 
            {
                sort: sort_object,
                skip: skip_amount, 
                limit: items_per_page,
                fields: fields_object
            }
        ).fetch();

        for (var i=0; i<auction_array.length; i++) {
            auction_array[i].is_unclaimed = items.findOne({'owner': Meteor.userId(), 'artwork_id': auction_array[i].item_data.artwork_id, 'status': {$in: ['unclaimed', 'won']}}) != undefined;
            auction_array[i].owned = items.findOne({'owner': Meteor.userId(), 'artwork_id': auction_array[i].item_data.artwork_id, 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}}) != undefined;
        }

        return auction_array;
    },

    'getPlayerAuctions': function() {
        var now = getNowISOString();

        var auction_array = auctions.find(
            {'expiration': {$gt : now}, 'seller': Meteor.user().profile.screen_name}, {sort: {'expiration': 1}}
        ).fetch();

        return auction_array;
    },

    'getWatchedAndWinningAuctions': function() {
        var winning_and_watching = Meteor.user().profile.auction_data.winning.concat(Meteor.user().profile.auction_data.watching);

        var now = getNowISOString();
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

    'getExpansionSlotCost': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getExpansionSlotCost();
    },

    'purchaseExpansionSlot': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.purchaseExpansionSlot();
    },

    'canVintage': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.canVintage();
    },

    'vintageMode': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.vintageMode();
    },

    'getAuctionPreviewItemObject': function(auction_id) {
        var auction_object = auctions.findOne(auction_id);
        if (auction_object == undefined)
            return {};

        var has_auctioneer = Meteor.user().profile.market_expert.expiration > getNowISOString();

        var fields_object = {
            'artwork_data': 1,
            'lottery': 1,
            'seasonal': 1,
            'foil': 1,
            'original': 1,
            'vintage': 1,
            'unlocked': 1,
            'attributes.locked.icon': 1,
            'attributes.locked.description': 1,
            'attributes.unlocked.icon': 1,
            'attributes.unlocked.description': 1,
            'attributes.special.icon': 1,
            'attributes.special.description': 1
        };

        if (has_auctioneer || auction_object.seller == Meteor.user().profile.screen_name) {
            fields_object.condition = 1;
            fields_object.values = 1;
            fields_object.level = 1;
            fields_object.roll_count = 1;
            fields_object["attributes.locked.value"] = 1;
            fields_object["attributes.unlocked.value"] = 1;
            fields_object["attributes.special.value"] = 1;
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

        if (previous_name == "admin" || desired_name == BOT_USER_NAME)
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
            Meteor.users.update(Meteor.userId(), {$set: {'profile.screen_name': desired_name, 'profile.last_name_change': getNowISOString()}});
        }
    },

    'setActiveUniqueAttribute': function(item_id, unique_attribute_id) {
        var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_id));
        return player_item_interface.changeActiveUniqueAttribute(unique_attribute_id);
     },

     'getDisplayValues': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getDisplayValues();
     },

     'getTotalXPPerHour': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getTotalXPPerHour();
     },

     'convertKnowledge': function(craft_type, target) {
        var max_craftable = getMaxCraftable(craft_type, Meteor.user().profile.knowledge);
        if (target > max_craftable)
            return;

        var revised_knowledge = getRevisedKnowledgeFromTargetValue(craft_type, target, Meteor.user().profile.knowledge);
        Meteor.users.update({'_id': Meteor.userId()}, {$set: {'profile.knowledge': revised_knowledge}});
     },

     'toggleFavoriteGallery': function(gallery_id) {
        if (galleries.findOne(gallery_id) == undefined)
            return false;

        if (Meteor.user().profile.favorite_galleries.indexOf(gallery_id) == -1) {
            Meteor.users.update({'_id': Meteor.userId()}, {$push: {'profile.favorite_galleries': gallery_id}});
        }

        else {
            Meteor.users.update({'_id': Meteor.userId()}, {$pull: {'profile.favorite_galleries': gallery_id}});
        }
     },

     'getGalleryAvatar': function(owner_id) {
        var best_item = items.findOne({'owner': owner_id, 'status': "displayed"}, {$sort: {'values.actual': 1}});
        if (best_item == undefined) {
            console.log(owner_id);
            return undefined;
        }
        
        var filename = best_item.artwork_data.filename;
    
        return "https://s3.amazonaws.com/com.artfunkel.artwork/avatars/" + filename + "_avatar." + best_item.artwork_data.file_extension;
     },

    'getPlayerLevels': function(owner_id) {
        var user_object = Meteor.users.findOne(owner_id);
        if (user_object == undefined) {
            return {
                'level': 0,
                'vintage_level': 0
            }
        }

        return {
            'level': user_object.profile.level,
            'vintage_level': user_object.profile.vintage_count
        }
     },

     'getCanBuyAllFavorites': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.canBuyAllFavorites();
     },

     'buyAllFavorites': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.buyAllFavorites();
     },

     'getArtistsFromQuery': function(match_query, page, items_per_page) {
        var aggregate_artworks = artworks.aggregate([
            {$match: match_query}, 
            {$project: { _id: 0, artist: "$artist", artist_id: "$artist_id"} },
            {$sort: {artist : 1} }
        ]);

        var unique_artist_array = _.uniq(aggregate_artworks, false, function(agg_object) {return agg_object.artist});

        var current_page;
        var total_pages;

        var total_returned = unique_artist_array.length;

        if (total_returned <= items_per_page) {
            current_page = 1;
            total_pages = 1;
        }

        else {
            total_pages = Math.floor(total_returned / items_per_page) + 1;

            if (total_returned < ((page - 1) * items_per_page) + 1) {
                current_page = total_pages;
            }

            else current_page = page;
        }

        var skip = (current_page - 1) * items_per_page;
        var count = items_per_page;

        return {
            'artist_array': unique_artist_array.slice(skip, skip + count),
            'current_page': current_page,
            'total_pages': total_pages
        }
     },

     'getForgeableArtistsFromQuery': function(and_query_array, page, items_per_page) {
        var valid_statuses;
        var player_interface = new PlayerIF(Meteor.user());

        var forgeable_artwork_ids = player_interface.getForgeableArtworkIds();

        and_query_array.push({'_id': {'$in': forgeable_artwork_ids}});
        var match_query = {'$and': and_query_array};

        var aggregate_artworks = artworks.aggregate([
            {$match: match_query}, 
            {$project: { _id: 0, artist: "$artist", artist_id: "$artist_id"} },
            {$sort: {artist : 1} }
        ]);

        var unique_artist_array = _.uniq(aggregate_artworks, false, function(agg_object) {return agg_object.artist});

        var current_page;
        var total_pages;

        var total_returned = unique_artist_array.length;

        if (total_returned <= items_per_page) {
            current_page = 1;
            total_pages = 1;
        }

        else {
            total_pages = Math.floor(total_returned / items_per_page) + 1;

            if (total_returned < ((page - 1) * items_per_page) + 1) {
                current_page = total_pages;
            }

            else current_page = page;
        }

        var skip = (current_page - 1) * items_per_page;
        var count = items_per_page;

        return {
            'artist_array': unique_artist_array.slice(skip, skip + count),
            'current_page': current_page,
            'total_pages': total_pages
        }
     },

     'detectOwnForgery': function(user_object, item_id) {
        var player_interface = new PlayerIF(user_object);
        var item_interface = new ItemIF(item_id);

        return player_interface.getId() == item_interface.getItemObject().owner && item_interface.isIdentifiedForgery();
     },

     // 'forgeItem': function(forged_item_object, forgery_contract_id) {
     //    var player_interface = new PlayerIF(Meteor.user());
     //    return player_interface.forgeItem(forged_item_object, forgery_contract_id);
     // },

     'getForgeData': function(item_id, forgery_contract_id) {
        var player_interface = new PlayerIF(Meteor.user());
        return {
            'forgery_cost': player_interface.getForgeryCost(new ItemIF(item_id), forgery_contract_id),
            'expected_forgery_heat': player_interface.getExpectedForgeryHeat(new ItemIF(item_id), undefined, forgery_contract_id)
        }
     },

     'discardForgeryContract': function(forgery_contract_id) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.discardForgeryContract(forgery_contract_id);
     },

     'changeTutorialStep': function(forward) {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.changeTutorialStep(forward);
     },

     'finishTutorials': function() {
        var player_interface = new PlayerIF(Meteor.user());
        player_interface.finishTutorials();
     },

     'getQuestTargetsOwned': function() {
        var player_interface = new PlayerIF(Meteor.user());
        return player_interface.getQuestTargetsOwned();
     },

     'getClaimedTags': function() {
        var claimed_tags = [];
        items.find({'owner': Meteor.userId(), 'status': {$in: ["claimed", "displayed", "auctioned"]}}).forEach(function(item_object) {
            for (var i=0; i<item_object.tags.length; i++) {
                if (claimed_tags.indexOf(item_object.tags[i]) == -1)
                    claimed_tags.push(item_object.tags[i])
            }
        })

        return claimed_tags;
    },

    'getPlayerInfoData': function() {
        var user_object = Meteor.user();
        var current_user_id = user_object._id
        var info_object = {
            'display_count': items.find({'owner' : current_user_id, 'status' : 'displayed'}).count(),
            'repairing_count': items.find({'owner' : current_user_id, 'repairing' : true}).count(),
            'inventory_count': items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won', 'archived']}}).count(),
            'slots_available': user_object.profile.inventory_cap + (user_object.profile.vintage_count * 2) + user_object.profile.expansion_slots - items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won', 'archived']}, 'original': {$ne: true}, 'vintage': {$ne: true}}).count(),
            'original_count': items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'original': true}).count(),
            'vintage_count': items.find({'owner' : current_user_id, 'status' : {$nin : ['unclaimed', 'for_sale', 'won']}, 'vintage': true}).count(),
            'permanent_count': items.find({'owner' : current_user_id, 'permanent' : true}).count(),
            'max_total': user_object.profile.inventory_cap + user_object.profile.expansion_slots,
            'auctioned_items': auctions.find({'seller': user_object.profile.screen_name}).count()
        }

        return info_object;
    },

    'questIsCompleted' : function(quest_id) {
        var quest_object = quests.findOne(quest_id)

        var targets_found = 0;
        for (var i=0; i < quest_object.target.length; i++) {
            if (items.findOne({'artwork_id': quest_object.target[i], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}}) != undefined)
                targets_found++;
        }

        return targets_found >= quest_object.min_requirement;
    },

    'getArtworkArchiveData': function(artist_object, rarities_selected)  {
        var artwork_collection_data = getArtistCollectionData(new PlayerIF(Meteor.user()), new ArtistIF(artist_object), rarities_selected);

        return {
            'total_items_available': artwork_collection_data.available,
            'total_items_archived': artwork_collection_data.has
        }
    },

    'getItemArchiveData': function(artwork_object) {
        var item_collection_data = getArtworkCollectionData(new PlayerIF(Meteor.user()), new ArtworkIF(artwork_object));

        return {
            'total_items_available': item_collection_data.available,
            'total_items_archived': item_collection_data.has
        }
    },

    'hasDisplacedItems': function() {
        return new PlayerIF(Meteor.user()).hasDisplacedItems();
    },

    'getAuctionArchiveIndicators': function(auction_object) {
        var indicators = [];
        var artwork_interface = new ArtworkIF(auction_object.item_data.artwork_data);
        var player_interface = new PlayerIF(Meteor.user());
        for (var i=0; i<ARCHIVE_CATEGORIES.length; i++) {
            if (player_interface.hasArchivedArtworkOfCategory(artwork_interface, ARCHIVE_CATEGORIES[i])) {
                indicators.push(ARCHIVE_CATEGORIES[i]);
            }
        }

        return indicators;
    },

    'getQuestTargetInfo': function(quest_object) {
        var target_info = [];
        var player_interface = new PlayerIF(Meteor.user());
        for (var i=0; i<quest_object.target.length; i++) {
            var artwork_id = quest_object.target[i];
            target_info.push({
                'artwork_object': artworks.findOne(artwork_id),
                'owned_item': player_interface.getQuestTarget(artwork_id)
            });
        }

        return target_info;
    },

    'getForgeableArtworksFromArtist': function(artist_object) {
        var player_interface = new PlayerIF(Meteor.user());
        var forgeable_artwork_ids = player_interface.getForgeableArtworkIds();
        return artworks.find({'artist_id': artist_object._id, '_id': {$in: forgeable_artwork_ids}}).fetch();
    },

    'requestBetaKey': function(user_email) {
        var regex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        if (!regex.test(user_email)) {
            return {
                'error_message': "Invalid email address"
            }
        }

        var beta_key_object = beta_keys.findOne({'email_address': user_email});

        if (beta_key_object) {
            if (beta_key_object.approved) {
                var message = '<h2>Your Artfunkel beta key is <span style="color:#FF33CC">' + beta_key_object.key + '</span></h2> <p>Visit <a href="https://artfunkelgame.com">artfunkelgame.com</a> and follow the registration link to create your account!</p>';
                emailUser(beta_key_object.email_address, "Your Artfunkel beta key", message);

                return {
                    'message': "Your beta key has already been approved, and has been resent to the provided email address." 
                }
            }
            else {
                return {
                    'message': "Your beta key request is currently awaiting approval."
                }
            }
        }

        else {
            var unique_key = new Meteor.Collection.ObjectID()._str;
            var beta_key_object = {
                'approved': false,
                'email_address': user_email,
                'created': getNowISOString(),
                'key': unique_key
            }

            beta_keys.insert(beta_key_object);

            var admin_interface = new PlayerIF(Meteor.users.findOne({'profile.screen_name': "admin"}));
            admin_interface.alert("Beta key requested -> " + user_email, 'fa-key', 'good');

            return {
                'message': "Your beta key request has been recorded. You will be notified when it is approved."
            }
        }
    }
})

var getArtworkCollectionData = function(player_interface, artwork_interface) {
    var available_categories = artwork_interface.getPotentialArchiveCategories();

    var player_has = 0;

    for (var i=0; i<available_categories.length; i++) {
        var category = available_categories[i];
        if (player_interface.hasArchivedArtworkOfCategory(artwork_interface, category)) {
            player_has++;
        }
    }

    return {
        'available': available_categories.length,
        'has': player_has
    };
}

var getArtistCollectionData = function(player_interface, artist_interface, rarities_selected) {
    var artwork_objects = getFromCollection("artistView.js:getArtistCollectionData", artworks, {'artist_id': artist_interface.getId(), 'rarity': {$in: rarities_selected}}).fetch();

    var total_items_available = 0;
    var player_has = 0;

    for (var i=0; i<artwork_objects.length; i++) {
        var artwork_interface = new ArtworkIF(artwork_objects[i]);

        var artwork_collection_data = getArtworkCollectionData(player_interface, artwork_interface);

        total_items_available += artwork_collection_data.available;
        player_has += artwork_collection_data.has;
    }

    return {
        'available': total_items_available,
        'has': player_has
    };
}

emailUser = function(user_email, subject, html) {
    Email.send({
        'to': user_email, 
        'from': "artfunkelgame@gmail.com", 
        'subject': subject, 
        'html': html
    });
}
