Router.configure({
	'layoutTemplate' : "layout"
});

Router.route('/', function() {
    if (Meteor.user()){
        Router.go("/dashboard/profile");
    } else if (Meteor.loggingIn()) {
        this.render("loading");
    } else {
        this.render("Home");
    }
});

patreon_object = undefined;

clearPatreonTest = function() {
    patreon_object = undefined;
}

getPatreonTest = function() {
    return patreon_object;
}

var extractRewardInfo = function(reward_object) {
    var reward_title = reward_object.attributes.title; 
    var reward_tier = undefined;

    for (var i=0; i<artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        if (reward_title.toLowerCase() == rarity + " tier") {
            reward_tier = rarity;
            break;
        }
    }

    return {
        'title': reward_title,
        'tier': reward_tier
    }
}

var extractPatronInfo = function(patron_object) {
    var full_name = patron_object.attributes.full_name;
    var is_email_verified = patron_object.attributes.is_email_verified;
    var email_address = patron_object.attributes.email;

    return {
        'full_name': full_name,
        'is_email_verified': is_email_verified,
        'email_address': email_address
    }
}

Router.route('/patreon_hooks', { where: "server" }).post( function() {
    var request_body = this.request.body;
    try {
        var secret = "4aP5-OW_8hGcaaExDuQRENml1BEXV0KqHyPSTGMOSgRCwB5Xuozy6rFzCw1DrRES";

        var patreon_signature = this.request.headers["x-patreon-signature"];
        var event_type = this.request.headers["x-patreon-event"];

        var hmac = CryptoJS.HmacMD5(JSON.stringify(this.request.body), secret).toString();

        this.response.statusCode = 200;
        this.response.setHeader('content-type', "application/json");

        var patreon_test_object = {
            'success': hmac == patreon_signature
        };

        this.response.end(JSON.stringify(patreon_test_object));

        var patron_id = request_body.data.relationships.patron.data.id; // "8770556"
        var reward_id = request_body.data.relationships.reward.data == null ? undefined : request_body.data.relationships.reward.data.id; // "1742939"

        var patron_data = undefined;
        var reward_data = undefined;

        for (var i=0; i<request_body.included.length; i++) {
            var included_data = request_body.included[i];
            if (included_data.id == patron_id) {
                patron_data = extractPatronInfo(included_data);
            }
        }
        
        // pledges account for creations and updates
        if (event_type == "pledges:create" || event_type == "pledges:update") {
            var amount = request_body.data.attributes.amount_cents;
            var pledge_id = request_body.data.id;         

            for (var i=0; i<request_body.included.length; i++) {
                var included_data = request_body.included[i];
                if (reward_id && included_data.id == reward_id) {
                    reward_data = extractRewardInfo(included_data);
                }
            }

            Meteor.users.update({'username': patron_data.email_address}, {$set: {"profile.patreon_data": {
                'patron_data': patron_data,
                'reward_data': reward_data
            }}})

            /* in included
                [0] -> patron
                [1] -> reward
                [2] -> campaign
                [3] -> creator
                [4] -> "everyone" reward, id: -1
                [5] -> "patrons only" reward, id: 0
                [6] - [9] -> rewards
                [10] -> goal
            */       
        }
        else if (event_type == "pledges:delete") {
            Meteor.users.update({'username': patron_data.email_address}, {$set: {"profile.patreon_data": {
                'patron_data': patron_data,
                'reward_data': undefined
            }}})
        }

        if (patreon_object == undefined) {
            patreon_object = {
                'patron_data': patron_data,
                'reward_data': reward_data,
                'body': request_body,
                'headers': this.request.headers
            };
        }
    }
    catch (error) {
        patreon_object = {
            'error': error.message,
            'body': request_body
        };
    }

});

Router.route('/dashboard/:section', function() {
    if (Meteor.user()) {
        this.render("dashboard", {
            data: {
                'specified_section': this.params.section
            }
        });
    }

    else {
        Router.go("login");
    }
})

Router.route('galleries', function() {
    if (Meteor.user())
        this.render("galleries");

    else Router.go("login");
})

Router.route('wiki', function() {
    this.render("wiki");
})

Router.route('leaderboard', function() {
    if (Meteor.user())
        this.render("leaderboard");

    else Router.go("login");
})

Router.route('quests', function() {
    if (Meteor.user())
        this.render("quests");

    else Router.go("login");
})

Router.route('admin', function() {
    if (Meteor.user())
        this.render("adminTools");

    else Router.go("login");
})

Router.route( 'uploadArtwork', function() {
	this.render('uploadArtwork');
});

Router.route( 'adminDashboard', function() {
	this.render('adminDashboard');
});

Router.route( 'loot', function() {
	this.render('randomDrop');
});

Router.route( 'store', function() {
    this.render('store');
});

Router.route('reset', function() {
    this.render('forgotPassword');
});

Router.route('help', function() {
    this.render('help');
});

Router.route('register', function() {
	if (Meteor.user())
		Router.go("/dashboard/profile");

	else this.render("registration");
})

Router.route('logout', function() {
    Meteor.logout(function() {
        Router.go('/');
    });
});

Router.route('login', function() {
    if (Meteor.user()){
        Router.go("/dashboard/profile");
    } 

    else if (Meteor.loggingIn()) {
        this.render("loading");
    } 

    else {
        this.render("login");
    }
});

Router.route('auctions', function(){
    if (Meteor.user()){
        this.render("auctions");
    } 

    else if (Meteor.loggingIn()) {
        this.render("loading");
    } 

    else {
        Router.go("login");
    }
});

Router.route('user/:screen_name', function() {
    if (Meteor.user()) {
        this.render("userGallery", {
            data: {
                'screen_name': this.params.screen_name,
                'own_gallery': this.params.screen_name == Meteor.user().profile.screen_name
            }
        });
    }
});

Router.route('/3d', function() {
    this.render("3d");
});