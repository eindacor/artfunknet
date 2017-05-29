var generateContent = function() {
    for (var i=0; i < artist_data.length; i++) {
		artists.insert(artist_data[i]);
	}

    try {
    	for (var i=0; i < painting_data.length; i++) {
    		var artist_id = artists.findOne({"artist_name": painting_data[i].artist})._id;
    		var artwork_object = painting_data[i];
    		artwork_object.genre = artwork_object.genre.toLowerCase();
    		artwork_object.artist_id = artist_id;
    		artworks.insert(artwork_object, function(artwork_insert_error, inserted_id) {
                if (artwork_insert_error)
                    console.log(artwork_insert_error.message);
            });
    	}
    }

    catch(error) {
        console.log("error adding artwork to DBs:");
        console.log(error.message);
    }
}

var updateContent = function() {
    var all_users = Meteor.users.find();
    all_users.forEach(function(db_object) {
        updateGalleryDetails(db_object._id);
        var cap_object = getCapSetterObject(db_object.profile.level);

        var setter = {};

        var cap_keys = Object.keys(cap_object);
        for (var i=0; i < cap_keys.length; i++) {
            var key = cap_keys[i];
            var value = cap_object[key];

            var setter_key = "profile." + key;
            setter[setter_key] = value;
        }

        Meteor.users.update(db_object._id, {$set : setter});
    });

    if (TEST_MODE) {
        items.find({'status': {$in: ["displayed", "permanent"]}}).forEach(function(item_object) {
            var random_days = Math.floor(Math.random() * 30);
            var random_time = moment().add(random_days * -1, 'days')._d.toISOString();
            var random_level = Math.floor(Math.random() * 10) + 1;
            if (item_object.status == "permanent")
                updateItem(item_object._id, {$set: {'permanent_post': random_time, 'level': random_level}});

            else updateItem(item_object._id, {$set: {'time_displayed': random_time, 'level': random_level}});
        });
    }

    var current_dynamic_crate_count = crates.find().count();
    for (var i=0; i<DYNAMIC_CRATE_COUNT - current_dynamic_crate_count; i++) {
        createCrate();
    }

    // temp code
    metadata.update({'loot_data': {$ne: null}}, {$set: {'loot_data.global_auraless_chance': .5}});
    // temp code
}

Meteor.startup(function() {
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

    if (artists.find({}).count() == 0 && artworks.find({}).count() == 0)
        generateContent();

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
