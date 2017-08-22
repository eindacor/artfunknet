updateBot = function(player_interface, attribute_list) {
    items.remove({'owner': player_interface.getId()}, function() {     
        Meteor.users.update(player_interface.getId(), {$set: {
            'profile.level': 50, 
            'profile.last_npc_met': moment()._d.toISOString(), 
            'profile.tutorial_data.state': TUTORIAL_STATES.length - 1, 
            'profile.tutorial_data.step': 0}
        }, function() {
            var attribute_count_map = {
                '5': 1, 
                '6': 1, 
                '7': 1
            }

            var attribute_count = Number(JepLoot.catRoll(attribute_count_map));

            if (attribute_list == undefined) {
                attribute_list = [];
                for (var i=0; i<attribute_count; i++) {
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

            var artwork_count = 10;

            while (artwork_id_list.length > artwork_count) {
                var random_index = Math.floor(Math.random() * artwork_id_list.length);
                artwork_id_list.splice(random_index, 1);

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

getReverse = function(str) {
    var split_str = str.split("");
    var reverse_array = split_str.reverse();
    return reverse_array.join("");
}

addFlair = function(gamertag) {
    var prefix_size = Math.floor(Math.random() * 2) + 1;
    var prefix = "";
    while (prefix.length < prefix_size) {
        if (Math.random() < .5) {
            prefix += "|";
        }
        else {
            var x_to_add = "x";
            if (Math.random() < .5) {
                x_to_add = x_to_add.toUpperCase();
            }
            prefix += x_to_add;
        }
    }

    if (Math.random() < .5) {
        prefix += " ";
    }

    return prefix + gamertag + getReverse(prefix);
}

capitalizeFirst = function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

capitalizeAll = function(word) {
    return word.toUpperCase();
}

getRandomWord = function() {
    var word_count = nouns.length;
    var random_index = Math.floor(Math.random() * word_count);
    return nouns[random_index];
}

generateName = function() {
    var word_array = [];

    while ((word_array.length == 0 || Math.random() < .5) && word_array.length < 3) {
        var new_word = getRandomWord();
        var seed = Math.random();
        if (seed < .33) {
            new_word = capitalizeFirst(new_word);
        }
        else if (seed < .66) {
            new_word = capitalizeAll(new_word);
        }

        word_array.push(new_word);
    }

    var username = "";

    for (var i=0; i<word_array.length; i++) {
        username += word_array[i];

        if (i == word_array.length - 1) {
            if (Math.random() < .3) {
                var upper_bound = Math.random() < .2 ? 2000 : 100;
                username += (Math.floor(Math.random() * upper_bound));
            }
        }
        else if (Math.random() < .5) {
            username += "_";
        }
    }

    if (Math.random() < .2) {
        username = addFlair(username);
    }

    return username;
}

removeBots = function() {
    Meteor.users.find({'profile.user_type': "bot"}).forEach(function(user_object) {
        galleries.remove({'owner_id': user_object._id});
        npcs.remove({'owner_id': user_object._id});
        items.remove({'owner': user_object._id});
        Meteor.users.remove(user_object._id);
    })
}

makeBots = function(quantity) {
    for (var i=0; i<quantity; i++) {
        var username = generateName();
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

    //removeBots();

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
    updateBot(new PlayerIF(Meteor.users.findOne({'_id': {$in: TUTORIAL_PLAYER_IDS}})), ["Benefactor", "Art Enthusiast", "Art Donor", "Preservationist", "Forger"]);

    //temp code
    //temp code

    if (Meteor.users.findOne({'profile.user_type': "bot"}) == undefined) {
        makeBots(40);
    }

    Meteor.setTimeout(function() {
         Meteor.users.find({'profile.user_type': {$ne: "bot"}}).forEach(function(user_object) {
            //remove null favorites
            for (var i=0; i<user_object.profile.favorite_galleries.length; i++) {
                var gallery_id = user_object.profile.favorite_galleries[i];
                if (galleries.findOne(gallery_id) == undefined) {
                    Meteor.users.update({}, {$pull: {'profile.favorite_galleries': gallery_id}}, {multi: true});
                }
            }

            //remove null tickets
            gallery_tickets.find({'ticketholder': user_object._id}).forEach(function(ticket_object) {
                if (galleries.findOne({'owner_id': ticket_object.gallery_owner}) == undefined) {
                    gallery_tickets.remove({'gallery_owner': ticket_object.gallery_owner});
                }
            })

            var player_interface = new PlayerIF(user_object);
            player_interface.refresh();
            player_interface.updateCaps();
            player_interface.refresh();
            player_interface.updateGalleryDetails();    
        });
    }, 2000);

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

    var user_object = Meteor.users.findOne(userId);

    if (user_object.profile.user_type == "bot") {
        return;
    }

    if (user_object && user_object.emails[0] && !user_object.emails[0].verified){
        Accounts.sendVerificationEmail(userId);
    }

    else if (user_object && !user_object.emails[0]) {
        console.log("No email for user " + userId);
    }

    else if (!user_object && (attempts > 0)){
        Meteor.setTimeout(function() {
            console.log(attempts + " more attempts to find user " + userId + " after insert...");
            waitForUserAdded(userId, attempts - 1);
        }, 2000);
    }

    else if (!user_object){
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