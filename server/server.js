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

var resetMetaData = function() {
    metadata.remove({});
    metadata.insert({
        'drops': {
            'legendary': {
                'sources': {},
                'player_level_avg': 0,
                'count_total': 0,
                'counts': {},
            },
            'masterpiece': {
                'sources': {},
                'player_level_avg': 0,
                'count_total': 0,
                'counts': {},
            },
        }
    });

    metadata.insert({
        'xp': {
            'sources': {}
        }
    });

    metadata.insert({
        'money': {
            'sources': {}
        }
    });
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

    // temp code
    Meteor.users.find({'profile.lottery_tickets': 0}).forEach(function(user_object) {
        var vintage_level = user_object.profile.vintage_count;
        var default_lottery_tickets = 1 + vintage_level;
        Meteor.users.update(user_object._id, {$set: {'profile.lottery_tickets': default_lottery_tickets}});
    });

    attributes.update({}, {$unset: {'type': ""}}, {multi: true});

    metadata.find({'loot_data': {$ne: null}}).forEach(function(db_object) {
        // loot data has already been updated
        if (db_object.loot_data.attribute_quantities.common.primary == undefined)
            return;

        var attribute_quantities = {};
        var rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];
        for (var i=0; i<rarities.length; i++) {
            attribute_quantities[rarities[i]] = db_object.loot_data.attribute_quantities[rarities[i]].primary;
        }
        metadata.update(db_object._id, {$set: {'loot_data.attribute_quantities': attribute_quantities}})
    })

    var db_is_legacy = artworks.findOne({'rarity': "legendary", 'unique_attributes': {$ne: null}}) == undefined;

    if (db_is_legacy) {
        /* new schema...
            artworks:
                {
                    ...
                    'unique_attributes': [<unique_code>],
                    'special_attributes': [<attribute_id>]
                }

            items: 
                {
                    ...
                    'active_unique_attribute': <unique_id>,
                    'artwork_data': artworks.findOne(artwork_id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}})
                }
        */
        artworks.find({'rarity': {$in: ["rare", "legendary", "masterpiece"]}}).forEach(function(artwork_object) {
            if (["common", "uncommon"].indexOf(artwork_object.rarity) != -1) {
                artworks.update(artwork_object._id, {$set: {'unique_attributes': [], 'special_attributes': []}}, function() {
                    items.update({'artwork_id': artwork_object._id}, {$set: {'active_unique_attribute': undefined, 'artwork_data': artworks.findOne(artwork_object._id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}})}}, {multi: true});
                })
            }

            // rare items get a random special attribute
            else if (artwork_object.rarity == "rare") {
                var random_index = Math.floor(Math.random() * attributes.find({'active': true}).count());
                var random_attribute = attributes.findOne({'active': true}, {skip: random_index});
                artworks.update(artwork_object._id, {$set: {'special_attributes': [random_attribute._id]}}, function() {
                    items.update({'artwork_id': artwork_object._id}, {$set: {'active_unique_attribute': undefined, 'artwork_data': artworks.findOne(artwork_object._id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}})}}, {multi: true});
                });
            }

            //legendaries and masterpieces have their "locked attributes" set to "sepcial attributes", then recieve a new field "unique attributes"
            else {
                if (artwork_object.locked_attributes == undefined) {
                    console.log("locked attributes undefined");
                    return;
                }

                artworks.update(artwork_object._id, {$set: {'special_attributes': artwork_object.locked_attributes}, $unset: {'locked_attributes': ""}}, function() {
                    var unique_list = [];
                    var new_artwork_object = artworks.findOne(artwork_object._id);
                    if (new_artwork_object.special_attributes == undefined) {
                        console.log("special attributes undefined");
                        return;
                    }

                    for (var i=0; i<new_artwork_object.special_attributes.length; i++) {
                        for (var n=0; n<new_artwork_object.special_attributes.length; n++) {
                            if (i != n) {
                                var unique_attribute = unique_attributes.findOne({'linked_attributes': {$all: [new_artwork_object.special_attributes[i], new_artwork_object.special_attributes[n]]}});

                                if (unique_list.indexOf(unique_attribute.code) == -1)
                                    unique_list.push(unique_attribute.code);
                            }
                        }
                    }

                    artworks.update(new_artwork_object._id, {$set: {'unique_attributes': unique_list}, $unset: {'legendary_attributes': ""}}, function() {
                        items.update(
                            {'artwork_id': new_artwork_object._id}, 
                            {
                                $set: {
                                    'artwork_data': artworks.findOne(new_artwork_object._id, {fields: {'_id': 0, 'active': 0, 'value_scale': 0}}), 
                                    'active_unique_attribute': unique_list[0]
                                }
                            }, {multi: true}
                        );
                    });
                });
            }
        });

        while (items.findOne({'rarity': {$in: ["legendary", "masterpiece"]}, 'artwork_data.unique_attributes': null}) != undefined) {
            console.log("waiting...");
        }

        items.find({'attributes.unlocked': null}).forEach(function(item_object) {
            var current_attributes = item_object.attributes;

            // set one of the rare's attributes to locked before attributes are converted, if none of existing attributes match artwork's specials, set the first attribute to be the special
            if (item_object.artwork_data.rarity == "rare") {
                var special_attribute_id = artworks.findOne(item_object.artwork_id).special_attributes[0];

                var locked_found = false;

                for (var i=0; !locked_found && i<current_attributes.length; i++) {
                    if (current_attributes[i]._id == special_attribute_id) {
                        current_attributes[i].locked = true;
                        locked_found = true;
                    }
                }

                if (!locked_found) {
                    var old_value = current_attributes[0].value;
                    current_attributes[0] = attributes.findOne(special_attribute_id);
                    current_attributes[0].value = old_value;
                    current_attributes[0].locked = true;
                }
            }

            var new_attributes_object = {'locked': [], 'unlocked': [], 'special': []};

            var locked_attributes_added = 0;
            var locked_count = item_object.artwork_data.rarity == "common" || Math.random() < (1/20) ? 0 : 1;

            for (var i=0; i<current_attributes.length; i++) {
                var attribute_id = current_attributes[i]._id;
                var value = current_attributes[i].value;
                var new_attribute_object = attributes.findOne(current_attributes[i]._id);
                new_attribute_object.value = value;

                if (current_attributes[i].locked) {                
                    new_attributes_object.special.push(new_attribute_object);
                }

                else if (locked_attributes_added < locked_count) {
                    new_attributes_object.locked.push(new_attribute_object);
                    locked_attributes_added++;
                }

                else {
                    new_attributes_object.unlocked.push(new_attribute_object);
                }
            }

            items.update(item_object._id, {$set: {'attributes': new_attributes_object}});
        })
    }
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
