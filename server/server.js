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
    addNewContent();
    gallery_tickets.remove({});
    npcs.remove({});
    var all_users = Meteor.users.find();
    all_users.forEach(function(db_object) {
        //resetTutorials(db_object._id);
        updateGalleryDetails(db_object._id);
        calcMVP(db_object._id);
    });

    var overwrite_locked_attributes = false;

    //gives new legendaries locked attributes if they have none
    artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}}).forEach(function(db_object) {
        if (db_object.locked_attributes == undefined && overwrite_locked_attributes) {
            var random_attributes = [];
            var attribute_count = db_object.rarity == "legendary" ? 2 : 3;

            while (random_attributes.length < attribute_count) {
                var selector = {'_id': {$nin: random_attributes}, 'active': true};
                var count = attributes.find(selector).count();
                if (count == 0)
                    break;
                
                random_attributes.push(attributes.findOne(selector, {skip: Math.floor(Math.random() * count)})._id);
            }

            artworks.update(db_object._id, {$set: {'locked_attributes': random_attributes}});
        }
    })

    // temp code
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
            "username": "jpollack320@gmail.com",
            "email": "jpollack320@gmail.com",
            "password": "password",
            "profile": {
                'screen_name': "EindacorDS",
                'user_type': "player"
            }
        };

        var player_2 = {
            "username": "peter.mooney90@gmail.com",
            "email": "peter.mooney90@gmail.com",
            "password": "Password123!",
            "profile": {
                'screen_name': "PMoons",
                'user_type': "player"
            }
        }
        
        var player_3 = {
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
        // createUser(player_2);
        createUser(player_3);
        createUser(admin);
    }

    if (artists.find({}).count() == 0 && artworks.find({}).count() == 0)
        generateContent();

    updateContent();

    SyncedCron.add({
        name: 'Lottery Draw',
        schedule: function(parser) {
            // parser is a later.parse object
            // return parser.text('every 10 seconds');
            return parser.text('at 10:00 am on Monday');
        },
        job: function() {
            if (Meteor.users.find({'profile.level': 50}).count() < 3)
                return;

            if (Math.random() < .1) {
                var user_map = {};
                Meteor.users.find({'profile.level': 50}).forEach(function(db_object) {
                    user_map[db_object._id] = db_object.profile.xp;
                });

                var winning_id = JepLoot.catRoll(user_map);

                var artwork_id = Math.random() < .0001 ? getRandomArtworkIDFromRarity("masterpiece") : getRandomArtworkIDFromRarity("legendary");

                var item_generator = {
                    'source': "lottery",
                    'user_id': winning_id,
                    'artwork_id': artwork_id,
                    'condition': undefined,
                    'xp_rating': undefined,
                    'foil_chance': 0,
                    'seasonal': false,
                    'lottery': lottery_level,
                    'original': false,
                    'status': "claimed",
                    'xp_rating_min': 0,
                    'condition_min': 0
                }

                generateItemFromArtworkID(item_generator);
                lottery_level = 1;

                var message = "This week's lottery winner is " + Meteor.users.findOne(winning_id).profile.screen_name + ". Congratulations!!!";
                Meteor.users.find({'profile.level': 50}).forEach(function(db_object) {
                    var alert_object = {
                        'user_id' : db_object._id,
                        'message' : message,
                        'link' : '/',
                        'icon' : 'fa-gavel',
                        'sentiment' : "good",
                        'time' : moment()
                    };

                    alerts.insert(alert_object);
                });

                Meteor.users.update({'profile.level': 50}, {$set: {'profile.xp': 0}}, {multi: true})
            }

            else {
                lottery_level + 1 == 11 ? lottery_level = 10 : lottery_level++;

                var message = "This week there's no lottery winner. New Lottery Level: " + lottery_level;
                Meteor.users.find({'profile.level': 50}).forEach(function(db_object) {
                    var alert_object = {
                        'user_id' : db_object._id,
                        'message' : message,
                        'link' : '/',
                        'icon' : 'fa-gavel',
                        'sentiment' : "good",
                        'time' : moment()
                    };

                    alerts.insert(alert_object);
                });
            }
        }
    });

    SyncedCron.start();
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
