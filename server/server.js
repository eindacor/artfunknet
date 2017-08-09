var updateBot = function(player_interface, attribute_list) {
    items.remove({'owner': player_interface.getId()}, function() {     
        Meteor.users.update(player_interface.getId(), {$set: {
            'profile.level': 50, 
            'profile.last_npc_met': moment()._d.toISOString(), 
            'profile.tutorial_data.state': TUTORIAL_STATES.length - 1, 
            'profile.tutorial_data.step': 0}
        }, function() {
            if (attribute_list == undefined) {
                attribute_list = [];
                for (var i=0; i<5; i++) {
                    var query = {'npc_name': {$nin: attribute_list}, 'active': true};
                    var count = attributes.find(query).count();
                    var random_index = Math.floor(Math.random() * count);
                    var selected_attribute = attributes.findOne(query, {skip: random_index});
                    attribute_list.push(selected_attribute.npc_name);
                }
            }

            var artwork_id_list = [];
            var attribute_map = {};

            for (var i=0; i<attribute_list.length; i++) {
                attribute_map[attributes.findOne({'npc_name': attribute_list[i]})._id] = 1;
                for (var n=0; n<attribute_list.length; n++) {
                    if (i == n) {
                        continue;
                    }

                    var attribute_combination = [];
                    attribute_combination.push(attributes.findOne({'npc_name': attribute_list[i]})._id);
                    attribute_combination.push(attributes.findOne({'npc_name': attribute_list[n]})._id);

                    var artwork_object = artworks.findOne({'rarity': "legendary", 'special_attributes': {$all: attribute_combination}});
                    if (artwork_id_list.indexOf(artwork_object._id) == -1) {
                        artwork_id_list.push(artwork_object._id);
                    }
                }
            }

            var source = "bot generated";
            var status = "displayed";

            player_interface.refresh();
            for (var i=0; i<artwork_id_list.length; i++) {
                var artwork_interface = new ArtworkIF(artwork_id_list[i]);
                ITEM_GENERATOR.generateSingle({
                    'source': source,
                    'artwork_interface': artwork_interface,
                    'status': status,
                    'attribute_map': attribute_map,
                    'min_roll_boost': .8
                }, player_interface);
            } 

            player_interface.updateCaps();   
            player_interface.refresh();
            player_interface.updateGalleryDetails();
        });
    }); 
}

var randomName = function() {
    return new Meteor.Collection.ObjectID()._str;
}

var removeBots = function() {
    Meteor.users.find({'profile.user_type': "bot"}).forEach(function(user_object) {
        galleries.remove({'owner_id': user_object._id});
        npcs.remove({'owner_id': user_object._id});
        items.remove({'owner': user_object._id});
        Meteor.users.remove(user_object._id);
    })
}

var makeBots = function(quantity) {
    for (var i=0; i<quantity; i++) {
        var username = randomName();
        var email = username + "@artfunkelbots.com";
        var bot = {
            "username": email,
            "email": email,
            "password": "bot_password",
            "profile": {
                'screen_name': username
            }
        };

        createBot(bot);

        var bot_object = undefined;
        while (bot_object == undefined) {
            bot_object = Meteor.users.findOne({'profile.screen_name': username});
            if (bot_object != undefined) {
                var bot_interface = new PlayerIF(bot_object);
                updateBot(bot_interface);
            }
        }
    }
}

var updateContent = function() {
    console.log("UPDATING CONTENT");

    removeBots();

    npcs.remove({'tutorial': true});
    var npc_name = "Benefactor";
    var benefactor_tutorial_npc = {
        "quality" : "bronze",
        "attribute_id" : attributes.findOne({'npc_name': npc_name})._id,  
        "owner_id" : TUTORIAL_PLAYER_IDS[0],
        "expiration" : null,
        "players_met" : [ ],
        "icon" : attributes.findOne({'npc_name': npc_name}).icon,
        "npc_name" : npc_name,
        'tutorial': true
    }

    npc_name = "Art Enthusiast";
    var enthusiast_tutorial_npc = {
        "quality" : "gold",
        "attribute_id" : attributes.findOne({'npc_name': npc_name})._id,  
        "owner_id" : TUTORIAL_PLAYER_IDS[0],
        "expiration" : null,
        "players_met" : [ ],
        "icon" : attributes.findOne({'npc_name': npc_name}).icon,
        "npc_name" : npc_name,
        'tutorial': true
    }

    npc_name = "Art Donor";
    var donor_tutorial_npc = {
        "quality" : "silver",
        "attribute_id" : attributes.findOne({'npc_name': npc_name})._id,   
        "owner_id" : TUTORIAL_PLAYER_IDS[0],
        "expiration" : null,
        "players_met" : [ ],
        "icon" : attributes.findOne({'npc_name': npc_name}).icon,
        "npc_name" : npc_name,
        'tutorial': true
    }

    npcs.insert(benefactor_tutorial_npc);
    npcs.insert(enthusiast_tutorial_npc);
    npcs.insert(donor_tutorial_npc);

    //temp code
    //temp code

    //makeBots(10);

    Meteor.setTimeout(function() {
         Meteor.users.find().forEach(function(user_object) {
            var player_interface = new PlayerIF(user_object);
            player_interface.refresh();
            player_interface.updateCaps();
            player_interface.refresh();
            player_interface.updateGalleryDetails();    
        });
    }, 3000);

    var current_dynamic_crate_count = crates.find().count();
    for (var i=0; i<DYNAMIC_CRATE_COUNT - current_dynamic_crate_count; i++) {
        createCrate();
    }
}

Meteor.startup(function() {
    LOOT_DATA = metadata.findOne({'loot_data': {$ne: null}}).loot_data;
    setupMail();
    fs = Npm.require('fs');

    if (attributes.find().count() == 0) {
        for (var i=0; i < attribute_data.length; i++) {
            attributes.insert(attribute_data[i]);
        }
    }

    if (gallery_finishes.find().count() == 0) {
        for (var i=0; i < gallery_finish_data.length; i++) {
            gallery_finishes.insert(gallery_finish_data[i]);
        }
    }

    for (var i=0; i < gallery_finish_data.length; i++) {
        if (gallery_finishes.findOne({'filename': gallery_finish_data[i].filename}) == undefined)
            gallery_finishes.insert(gallery_finish_data[i]);
    }

    if (Meteor.users.find().count() == 0) {
        var admin = {
            "username": "admin@email.com",
            "email": "admin@email.com",
            "password": "admin_password",
            "profile": {
                'screen_name': "admin"
            }
        };

        createAdmin(admin);
    }

    updateContent();
})

function waitForUserAdded(userId, attempts){
    if (attempts === undefined) {
        attempts = 1;
    }

    if (Meteor.users.findOne(userId) && Meteor.users.findOne(userId).emails[0] && !Meteor.users.findOne(userId).emails[0].verified){
        Accounts.sendVerificationEmail(userId);
    }

    else if (Meteor.users.findOne(userId) && !Meteor.users.findOne(userId).emails[0]) {
        console.log("No email for user " + userId);
    }

    else if (!Meteor.users.findOne(userId) && (attempts > 0)){
        Meteor.setTimeout(function() {
            console.log(attempts + " more attempts to find user " + userId + " after insert...");
            waitForUserAdded(userId, attempts - 1);
        }, 2000);
    }

    else if (!Meteor.users.findOne(userId)){
        console.log("Could not find user " + userId);
    }
}

Accounts.onCreateUser(function(options, user) {
    if (options.profile){
        user.profile = options.profile;
    }

    // Allow time for Meteor to create user before sending verification email.
    // Try this 5 times before failing.
    Meteor.setTimeout(function(){
        waitForUserAdded(user._id, 5);
    }, 2000);

    return user;
});

Accounts.onLogin(function(user_object) {
    Meteor.users.update({'_id': user_object.user._id}, {$set: {'profile.last_login': moment()._d.toISOString()}});
})