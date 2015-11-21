var generateContent = function() {
    var fs = Npm.require('fs');

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

                else {
                    // var added_artwork = artworks.findOne(inserted_id);
                    // var image = fs.readFileSync('./assets/app/' + added_artwork.filename);
                    // var newFile = new FS.File();
                    // newFile.attachData(image, {type: 'image/bmp'}, function(attach_error) {
                    //     if (attach_error)
                    //         console.log(attach_error.message);

                    //     else {
                    //         newFile.name(added_artwork.filename);
                    //         artworkImages.insert(newFile, function(image_insert_error, inserted_image_id) {
                    //             if(image_insert_error)
                    //                 console.log(image_insert_error.message);

                    //             else {
                    //                 console.log("image added: " + inserted_image_id);
                    //                 artworkImages.update(inserted_image_id, {$set: {'artwork_id' : added_artwork._id}});
                    //             }
                    //         });
                    //     }
                    // });
                }
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
        updateGalleryDetails(db_object._id);
        calcMVP(db_object._id);
    });

    // temp code
    attributes.update({}, {$unset: {'value': ""}}, {multi: true});
    artworks.update({'rarity': {$in: ["masterpiece", "legendary"]}}, {$unset: {'locked_attributes': ""}}, {multi: true});
    artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}}).forEach(function(db_object) {
        if (db_object.locked_attributes == undefined) {
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

    // items.find().forEach(function(db_object) {
    //     var item_attributes = db_object.attributes;
    //     for (var i=0; i<item_attributes.length; i++) {
    //         item_attributes[i].locked = attributeIsLocked(db_object.artwork_id, item_attributes[i]._id);
    //     }

    //     items.update(db_object._id, {$set: {'attributes': item_attributes}});
    // })
    // temp code
}

Meteor.startup(function() {
    setupMail();
    fs = Npm.require('fs');

	if (artists.find({}).count() == 0 && artworks.find({}).count() == 0)
		generateContent();

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
        createUser(player_2);
        createUser(player_3);
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
