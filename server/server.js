var updateContent = function() {
    console.log("UPDATING CONTENT");

    // temp code
    var tutorial_data = {
        'state': 0,
        'step': 0
    }

    Meteor.users.update({}, {$set: {'profile.tutorial_data': tutorial_data}}, {multi: true});

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

    galleries.update({'owner_id': {$in: TUTORIAL_PLAYER_IDS}}, {$set: {'tutorial': true}}, {multi: true});
    npcs.update({'owner_id': {$in: TUTORIAL_PLAYER_IDS}}, {$set: {'tutorial': true}}, {multi: true});

    //temp code

    var all_users = Meteor.users.find();
    all_users.forEach(function(user_object) {
        var player_interface = new PlayerIF(user_object);
        player_interface.updateGalleryDetails();
        var cap_object = getCapSetterObject(user_object.profile.level);

        var setter = {};

        var cap_keys = Object.keys(cap_object);
        for (var i=0; i < cap_keys.length; i++) {
            var key = cap_keys[i];
            var value = cap_object[key];

            var setter_key = "profile." + key;
            setter[setter_key] = value;
        }

        Meteor.users.update(user_object._id, {$set : setter});
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
        var player_1 = {
            "username": "player@email.com",
            "email": "player@email.com",
            "password": "password",
            "profile": {
                'screen_name': "Buyer",
                'user_type': "player"
            }
        };

        var admin = {
            "username": "admin@email.com",
            "email": "admin@email.com",
            "password": "admin_password",
            "profile": {
                'screen_name': "admin",
                'user_type': "admin"
            }
        };

        createUser(player_1);
        createUser(admin);
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
