var updateBot = function(player_interface) {
    items.remove({'owner': player_interface.getId()}, function() {     
        Meteor.users.update(player_interface.getId(), {$set: {
            'profile.level': 50, 
            'profile.last_npc_met': moment()._d.toISOString(), 
            'profile.tutorial_data.state': TUTORIAL_STATES.length - 1, 
            'profile.tutorial_data.step': 0}
        }, function() {
            var attribute_list = ["Benefactor", "Art Donor", "Art Enthusiast", "Auctioneer", "Forger"];
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

var updateContent = function() {
    console.log("UPDATING CONTENT");

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
    Meteor.users.find().forEach(function(user_object) {       
        var tutorial_or_admin = TUTORIAL_PLAYER_IDS.indexOf(user_object._id) != -1 || user_object.profile.user_type == "admin";

        if (tutorial_or_admin) {
            callback = function(){};
        }
        else callback = function() {
            var player_interface = new PlayerIF(user_object);
            player_interface.beginTutorials();
        }

        Meteor.users.update(user_object._id, {$set: {'profile.tutorial_data': {'state': 0, 'step': 0}}, $unset: {'profile.settigns': "", 'profile.tutorials': "", 'profile.gallery_tickets': "", 'profile.gallery_value': "", 'profile.gallery_score': ""}}, callback);
    })
    //temp code

    var bot_interface = new PlayerIF(TUTORIAL_PLAYER_IDS[0]);
    updateBot(bot_interface);

    Meteor.users.find().forEach(function(user_object) {
        var player_interface = new PlayerIF(user_object);
        player_interface.refresh();
        player_interface.updateCaps();
        player_interface.refresh();
        player_interface.updateGalleryDetails();    
    });

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

Accounts.onLogout(function(user_object) {
    Meteor.users.update({'_id': user_object.user._id}, {$set: {'profile.last_logout': moment()._d.toISOString()}});
})
